#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>

int main() {
    // Get current mouse location
    CGEventRef event = CGEventCreate(NULL);
    CGPoint cursor = CGEventGetLocation(event);
    CFRelease(event);
    
    printf("Clicking at: %.0f, %.0f\n", cursor.x, cursor.y);
    
    // Create mouse down event
    CGEventRef mouseDown = CGEventCreateMouseEvent(
        NULL, kCGEventLeftMouseDown, cursor, kCGMouseButtonLeft);
    
    // Create mouse up event
    CGEventRef mouseUp = CGEventCreateMouseEvent(
        NULL, kCGEventLeftMouseUp, cursor, kCGMouseButtonLeft);
    
    // Post the events
    CGEventPost(kCGHIDEventTap, mouseDown);
    CGEventPost(kCGHIDEventTap, mouseUp);
    
    // Clean up
    CFRelease(mouseDown);
    CFRelease(mouseUp);
    
    printf("Click completed\n");
    return 0;
}