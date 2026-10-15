// AutoClicker for Mac — native click engine.
//
// The Electron app starts this helper once and talks to it over stdin/stdout,
// one command or event per line. All timing and event posting happens here, so
// clicks stay precise at high rates and never wait on the UI.
//
// Commands (stdin):
//   start <id> <interval_us> <left|right|middle> <1|2> <limit> cursor
//   start <id> <interval_us> <left|right|middle> <1|2> <limit> fixed <x> <y>
//   stop
//   exclude <x> <y> <w> <h>   skip clicks and picks inside this rect (the app's own window)
//   exclude none
//   pick                      capture the next left click on screen and swallow it
//   cancel-pick
//
// Events (stdout):
//   ready
//   count <id> <clicks>
//   stopped <id> <clicks> <done|stopped|permission|error>
//   picked <x> <y>
//   pick-cancelled
//   pick-failed <permission|busy>
//   error <message>

#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>
#include <errno.h>
#include <mach/mach_time.h>
#include <os/lock.h>
#include <pthread.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define MIN_INTERVAL_US 1000ull                     // 1 ms
#define MAX_INTERVAL_US (24ull * 60 * 60 * 1000000) // 24 hours
#define MAX_HOLD_US 10000ull                        // longest a button is held down
#define STOP_CHECK_US 20000ull                      // how often a long wait checks for stop
#define REPORT_EVERY_US 50000ull                    // click count updates, at most 20 per second

typedef struct {
    unsigned id;
    uint64_t interval; // mach ticks between clicks
    CGMouseButton button;
    int presses;    // 1 = single click, 2 = double click
    uint64_t limit; // stop after this many clicks; 0 = until stopped
    bool fixed;
    CGPoint point;
    atomic_bool stop;
} Run;

static mach_timebase_info_data_t timebase;
static atomic_int running_threads;

// Owned by the main queue.
static Run *active_run;
static id activity;
static CFMachPortRef pick_tap;
static CFRunLoopSourceRef pick_source;
static bool pick_pressed;
static CGPoint pick_point;

static os_unfair_lock exclude_lock = OS_UNFAIR_LOCK_INIT;
static bool exclude_active;
static CGRect exclude_rect;

static void emit(const char *format, ...) __attribute__((format(printf, 1, 2)));
static void emit(const char *format, ...) {
    char line[256];
    va_list args;
    va_start(args, format);
    int length = vsnprintf(line, sizeof(line) - 1, format, args);
    va_end(args);
    if (length < 0) return;
    if (length > (int)sizeof(line) - 2) length = (int)sizeof(line) - 2;
    line[length++] = '\n';
    // Lines are far shorter than PIPE_BUF, so each write is atomic even when the
    // click thread and the main queue emit at the same time.
    if (write(STDOUT_FILENO, line, (size_t)length) < 0 && errno == EPIPE) _exit(0);
}

static uint64_t ticks_from_us(uint64_t us) {
    return us * 1000 * timebase.denom / timebase.numer;
}

static bool is_excluded(CGPoint point) {
    os_unfair_lock_lock(&exclude_lock);
    bool excluded = exclude_active && CGRectContainsPoint(exclude_rect, point);
    os_unfair_lock_unlock(&exclude_lock);
    return excluded;
}

static CGPoint cursor_location(void) {
    CGEventRef event = CGEventCreate(NULL);
    if (!event) return CGPointZero;
    CGPoint point = CGEventGetLocation(event);
    CFRelease(event);
    return point;
}

// Sleeps until `deadline`, waking periodically so a stop request is noticed
// quickly even with long intervals. Returns false if the run was stopped.
static bool sleep_until(Run *run, uint64_t deadline) {
    const uint64_t slice = ticks_from_us(STOP_CHECK_US);
    for (;;) {
        if (atomic_load(&run->stop)) return false;
        uint64_t now = mach_absolute_time();
        if (now >= deadline) return true;
        mach_wait_until(deadline - now > slice ? now + slice : deadline);
    }
}

static void post_mouse(CGEventSourceRef source, CGEventType type, CGPoint point, CGMouseButton button,
                       int64_t click_state) {
    CGEventRef event = CGEventCreateMouseEvent(source, type, point, button);
    if (!event) return;
    // Click state 1 keeps fast single clicks from being read as double clicks;
    // 2 on the second press is what makes apps see a real double click.
    CGEventSetIntegerValueField(event, kCGMouseEventClickState, click_state);
    // Don't pick up modifier keys still held from the start shortcut, which
    // would turn every click into a ⌘-click.
    CGEventSetFlags(event, 0);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

static void click(CGEventSourceRef source, const Run *run, CGPoint point) {
    CGEventType down, up;
    switch (run->button) {
    case kCGMouseButtonLeft:
        down = kCGEventLeftMouseDown;
        up = kCGEventLeftMouseUp;
        break;
    case kCGMouseButtonRight:
        down = kCGEventRightMouseDown;
        up = kCGEventRightMouseUp;
        break;
    default:
        down = kCGEventOtherMouseDown;
        up = kCGEventOtherMouseUp;
        break;
    }
    // Hold each press briefly so apps and games that poll the button state see
    // it, while keeping the whole click well inside the interval. The press is
    // always completed, so a button is never left held down.
    uint64_t hold = run->interval / (2 * (uint64_t)run->presses);
    uint64_t max_hold = ticks_from_us(MAX_HOLD_US);
    if (hold > max_hold) hold = max_hold;

    for (int press = 1; press <= run->presses; press++) {
        post_mouse(source, down, point, run->button, press);
        mach_wait_until(mach_absolute_time() + hold);
        post_mouse(source, up, point, run->button, press);
        if (press < run->presses) mach_wait_until(mach_absolute_time() + hold);
    }
}

static void end_activity(void) {
    if (!activity) return;
    @autoreleasepool {
        [[NSProcessInfo processInfo] endActivity:activity];
    }
    activity = nil;
}

static void begin_activity(void) {
    if (activity) return;
    // Opts out of App Nap and timer coalescing while clicking, which would
    // otherwise stretch intervals whenever the app is in the background.
    @autoreleasepool {
        activity = [[NSProcessInfo processInfo]
            beginActivityWithOptions:NSActivityUserInitiated | NSActivityLatencyCritical
                              reason:@"Autoclicking"];
    }
}

static void finish_run(Run *run, uint64_t clicks, const char *reason) {
    if (active_run == run) {
        active_run = NULL;
        end_activity();
    }
    emit("stopped %u %llu %s", run->id, (unsigned long long)clicks, reason);
    free(run);
}

static void *run_clicks(void *arg) {
    Run *run = arg;
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    // By default macOS ignores the real mouse for 0.25 s after every synthetic
    // event, which makes the pointer stutter while clicking fast.
    if (source) CGEventSourceSetLocalEventsSuppressionInterval(source, 0);

    const uint64_t report_every = ticks_from_us(REPORT_EVERY_US);
    uint64_t clicks = 0, reported = 0, last_report = 0;
    const char *reason = "stopped";
    uint64_t next = mach_absolute_time();

    while (sleep_until(run, next)) {
        CGPoint point = run->fixed ? run->point : cursor_location();
        if (!is_excluded(point)) {
            click(source, run, point);
            clicks++;
            if (run->limit && clicks >= run->limit) {
                reason = "done";
                break;
            }
        }
        uint64_t now = mach_absolute_time();
        if (clicks != reported && now - last_report >= report_every) {
            emit("count %u %llu", run->id, (unsigned long long)clicks);
            reported = clicks;
            last_report = now;
        }
        next += run->interval;
        // If the system stalled us, carry on from now instead of firing a burst
        // of catch-up clicks.
        if (next < now) next = now;
    }
    if (source) CFRelease(source);

    dispatch_async(dispatch_get_main_queue(), ^{
      finish_run(run, clicks, reason);
    });
    atomic_fetch_sub(&running_threads, 1);
    return NULL;
}

static void stop_pick(void) {
    if (!pick_tap) return;
    CGEventTapEnable(pick_tap, false);
    CFRunLoopRemoveSource(CFRunLoopGetMain(), pick_source, kCFRunLoopCommonModes);
    CFRelease(pick_source);
    pick_source = NULL;
    CFMachPortInvalidate(pick_tap);
    CFRelease(pick_tap);
    pick_tap = NULL;
    pick_pressed = false;
}

static void cancel_pick(void) {
    if (!pick_tap) return;
    stop_pick();
    emit("pick-cancelled");
}

static void start_run(Run *run) {
    // A new run replaces the current one, which still reports its own "stopped".
    if (active_run) atomic_store(&active_run->stop, true);
    cancel_pick();

    if (!CGPreflightPostEventAccess()) {
        emit("stopped %u 0 permission", run->id);
        free(run);
        return;
    }

    begin_activity();
    active_run = run;

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
    pthread_attr_set_qos_class_np(&attr, QOS_CLASS_USER_INTERACTIVE, 0);
    pthread_t thread;
    atomic_fetch_add(&running_threads, 1);
    if (pthread_create(&thread, &attr, run_clicks, run) != 0) {
        atomic_fetch_sub(&running_threads, 1);
        active_run = NULL;
        end_activity();
        emit("stopped %u 0 error", run->id);
        free(run);
    }
    pthread_attr_destroy(&attr);
}

static CGEventRef pick_callback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *info) {
    (void)proxy;
    (void)info;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (pick_tap) CGEventTapEnable(pick_tap, true);
        return event;
    }
    if (!pick_tap) return event;

    if (type == kCGEventLeftMouseDown && !pick_pressed) {
        CGPoint point = CGEventGetLocation(event);
        // Clicks on the app's own window go through, so its Cancel button works.
        if (is_excluded(point)) return event;
        pick_pressed = true;
        pick_point = point;
        return NULL;
    }
    if (!pick_pressed) return event;
    if (type == kCGEventLeftMouseUp) {
        CGEventTapEnable(pick_tap, false);
        emit("picked %.0f %.0f", pick_point.x, pick_point.y);
        // Tear the tap down after this callback returns, not inside it.
        dispatch_async(dispatch_get_main_queue(), ^{
          stop_pick();
        });
    }
    return NULL; // swallow the picking press, drag and release
}

static void start_pick(void) {
    if (pick_tap) return;
    if (active_run) {
        emit("pick-failed busy");
        return;
    }
    CGEventMask mask = CGEventMaskBit(kCGEventLeftMouseDown) | CGEventMaskBit(kCGEventLeftMouseUp) |
                       CGEventMaskBit(kCGEventLeftMouseDragged);
    pick_tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask,
                                pick_callback, NULL);
    if (!pick_tap) {
        emit("pick-failed permission");
        return;
    }
    pick_source = CFMachPortCreateRunLoopSource(NULL, pick_tap, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), pick_source, kCFRunLoopCommonModes);
    pick_pressed = false;
    CGEventTapEnable(pick_tap, true);
}

static bool parse_button(const char *name, CGMouseButton *button) {
    if (strcmp(name, "left") == 0) *button = kCGMouseButtonLeft;
    else if (strcmp(name, "right") == 0) *button = kCGMouseButtonRight;
    else if (strcmp(name, "middle") == 0) *button = kCGMouseButtonCenter;
    else return false;
    return true;
}

static void handle_start(const char *line) {
    unsigned id;
    unsigned long long interval_us, limit;
    int presses;
    char button_name[8], mode[8];
    double x = 0, y = 0;
    int fields = sscanf(line, "start %u %llu %7s %d %llu %7s %lf %lf", &id, &interval_us, button_name, &presses,
                        &limit, mode, &x, &y);
    CGMouseButton button;
    bool fixed = fields == 8 && strcmp(mode, "fixed") == 0;
    bool cursor = fields == 6 && strcmp(mode, "cursor") == 0;
    if (!(fixed || cursor) || !parse_button(button_name, &button) || (presses != 1 && presses != 2)) {
        emit("error bad-command");
        return;
    }
    if (interval_us < MIN_INTERVAL_US) interval_us = MIN_INTERVAL_US;
    if (interval_us > MAX_INTERVAL_US) interval_us = MAX_INTERVAL_US;

    Run *run = calloc(1, sizeof(Run));
    if (!run) {
        emit("stopped %u 0 error", id);
        return;
    }
    run->id = id;
    run->interval = ticks_from_us(interval_us);
    run->button = button;
    run->presses = presses;
    run->limit = limit;
    run->fixed = fixed;
    run->point = CGPointMake(x, y);
    atomic_init(&run->stop, false);
    start_run(run);
}

static void handle_command(const char *line) {
    char word[16];
    if (sscanf(line, "%15s", word) != 1) return;

    if (strcmp(word, "start") == 0) {
        handle_start(line);
    } else if (strcmp(word, "stop") == 0) {
        if (active_run) atomic_store(&active_run->stop, true);
    } else if (strcmp(word, "exclude") == 0) {
        double x, y, w, h;
        bool set = sscanf(line, "exclude %lf %lf %lf %lf", &x, &y, &w, &h) == 4;
        os_unfair_lock_lock(&exclude_lock);
        exclude_active = set;
        if (set) exclude_rect = CGRectMake(x, y, w, h);
        os_unfair_lock_unlock(&exclude_lock);
    } else if (strcmp(word, "pick") == 0) {
        start_pick();
    } else if (strcmp(word, "cancel-pick") == 0) {
        cancel_pick();
    } else {
        emit("error unknown-command");
    }
}

static void shutdown_and_exit(void) {
    if (active_run) atomic_store(&active_run->stop, true);
    stop_pick();
    // Let an in-flight click finish so a mouse button is never left held down.
    for (int i = 0; i < 200 && atomic_load(&running_threads) > 0; i++) usleep(1000);
    exit(0);
}

static void read_commands(void) {
    static char buffer[4096];
    static size_t used;

    ssize_t count = read(STDIN_FILENO, buffer + used, sizeof(buffer) - 1 - used);
    if (count < 0 && (errno == EAGAIN || errno == EINTR)) return;
    if (count <= 0) {
        // The app closed our stdin or went away.
        shutdown_and_exit();
        return;
    }
    used += (size_t)count;

    char *line = buffer;
    char *newline;
    while ((newline = memchr(line, '\n', (size_t)(buffer + used - line)))) {
        *newline = '\0';
        handle_command(line);
        line = newline + 1;
    }
    used = (size_t)(buffer + used - line);
    memmove(buffer, line, used);
    if (used == sizeof(buffer) - 1) used = 0; // drop a runaway line
}

int main(void) {
    mach_timebase_info(&timebase);
    signal(SIGPIPE, SIG_IGN);

    dispatch_queue_t main_queue = dispatch_get_main_queue();
    static dispatch_source_t stdin_source, term_source, int_source;

    stdin_source = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0, main_queue);
    dispatch_source_set_event_handler(stdin_source, ^{
      read_commands();
    });
    dispatch_resume(stdin_source);

    signal(SIGTERM, SIG_IGN);
    signal(SIGINT, SIG_IGN);
    term_source = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGTERM, 0, main_queue);
    int_source = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGINT, 0, main_queue);
    dispatch_source_set_event_handler(term_source, ^{
      shutdown_and_exit();
    });
    dispatch_source_set_event_handler(int_source, ^{
      shutdown_and_exit();
    });
    dispatch_resume(term_source);
    dispatch_resume(int_source);

    emit("ready");
    CFRunLoopRun();
    return 0;
}
