# AutoClicker for Mac

A simple autoclicker application for macOS built with Electron.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm start
   ```

## Important: Enable Accessibility Permissions

For the autoclicker to work, you MUST grant accessibility permissions:

1. Open **System Preferences** → **Security & Privacy** → **Accessibility**
2. Click the lock icon to make changes
3. Add and check the Terminal app (or wherever you're running from)

## For Actual Clicking to Work (REQUIRED)

Install `cliclick` - this is the easiest way to get clicking working:

```bash
brew install cliclick
```

Or if you don't have Homebrew:
1. Download from: https://github.com/BlueM/cliclick
2. Put the `cliclick` binary in `/usr/local/bin/`

After installing cliclick, the app will work perfectly!

## Features

- Simple, modern UI
- Adjustable click interval (100ms - 10,000ms)
- Start/Stop button
- Click counter
- ESC key to stop clicking

## How It Works

The app uses macOS accessibility features to perform mouse clicks at your current cursor position. Make sure to position your cursor where you want clicks before starting!