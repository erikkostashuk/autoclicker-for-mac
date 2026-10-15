# AutoClicker for Mac

<p align="center">
  <img src="logo/512-mac.png" alt="AutoClicker for Mac logo" width="200"/>
</p>

A fast, free and open-source autoclicker for macOS. Set how often to click, press a shortcut, and AutoClicker clicks for you — from one click an hour up to 1,000 clicks per second.

## Download

Get the latest version from the [Releases page](https://github.com/erikkostashuk/autoclicker-for-mac/releases/latest):

- **Apple Silicon (M1 or newer):** `AutoClicker-for-Mac-<version>-arm64.dmg`
- **Intel:** `AutoClicker-for-Mac-<version>-x64.dmg`

Requires macOS 13 Ventura or later.

### First launch

1. Open the DMG and drag **AutoClicker for Mac** into **Applications**.
2. Open it. The app isn't notarized by Apple, so macOS blocks it the first time. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
3. Allow **Accessibility** access when asked (**System Settings → Privacy & Security → Accessibility**). macOS only lets apps click for you once this is on. The app shows a reminder until it is.

## Features

- **Precise timing** from 1 ms to 24 hours, in milliseconds, seconds or minutes. Clicks are scheduled on a real-time thread, so they are sent within microseconds of their target time even when your Mac is busy.
- **Left, right or middle button**, single or double clicks.
- **Repeat until stopped** or stop after a set number of clicks, with live progress.
- **Click at the cursor** or at a **fixed spot** — type coordinates or click **Pick…** and then click anywhere on screen.
- **Global start/stop shortcut** (⌥⌘K by default, click it in the app to change it) and **Esc** to stop at any time.
- **Doesn't click its own buttons:** while the AutoClicker window is active, clicks pause whenever the cursor is over it, so pressing Start never hits Stop.
- Remembers your settings and where you left the window, and follows light and dark mode.

## Troubleshooting

**Clicking doesn't work after updating.** macOS can keep the approval for the old version. In **System Settings → Privacy & Security → Accessibility**, select AutoClicker for Mac, remove it with the **–** button, then click **Open System Settings** in the app and switch it on again.

**Clicks lag or keep going briefly after stopping.** macOS delivers up to about 200 clicks per second. Faster than that, clicks queue up inside macOS, and the app warns you when you choose such a rate. Use a longer interval.

**The shortcut doesn't work.** Another app may already use it — the app says so under the shortcut. Click the shortcut in the app and press a different one.

**Something else is wrong?** [Open an issue](https://github.com/erikkostashuk/autoclicker-for-mac/issues/new).

## Development

You'll need macOS 13+, [Node.js 24](https://nodejs.org) (see `.nvmrc`) and the Xcode Command Line Tools (`xcode-select --install`) to compile the native click engine.

```bash
git clone https://github.com/erikkostashuk/autoclicker-for-mac.git
cd autoclicker-for-mac
npm install
npm start          # build the click engine and run the app
npm test           # unit and protocol tests (they never click)
npm run dist       # build DMGs for Apple Silicon and Intel into dist/
```

When you run the app with `npm start`, macOS checks Accessibility access for your terminal app, not for AutoClicker.

### How it works

- `src/` is the Electron app: `main.js` (window, shortcuts, permissions), `engine.js` (talks to the click engine), `settings.js` (saved settings and validation) and `renderer/` (the UI).
- `native/clicker.m` is the click engine: a small native helper that the app starts once. It handles timing and posts mouse events through macOS's Quartz Event Services, so clicks stay precise and the UI never slows them down. `native/build.sh` compiles it as a universal binary.

### Releases

Every push to `main` builds the app and publishes a new GitHub release automatically (see `.github/workflows/release.yml`). The version comes from `package.json`; if that version is already released, the next patch number is used (1.4.0, 1.4.1, 1.4.2, …). To start a new series, change the major or minor version in `package.json`. Pushes that only change Markdown files or the license don't create a release.

Pull requests run the tests in `.github/workflows/ci.yml`.

## License

MIT — see [LICENSE](LICENSE).
