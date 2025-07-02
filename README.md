# AutoClicker for Mac

<p align="center">
  <img src="logo/512-mac.png" alt="AutoClicker for Mac Logo" width="250"/>
</p>

A simple, yet powerful autoclicker application designed specifically for macOS, built with Electron. This tool helps automate repetitive clicking tasks, saving you time and effort.

## ✨ Features

*   **Intuitive User Interface:** Clean and modern design for ease of use.
*   **Adjustable Click Interval:** Set your desired click speed from 100ms to 10,000ms.
*   **Start/Stop Functionality:** Easily toggle clicking on and off.
*   **Real-time Click Counter:** Keep track of the number of clicks performed.
*   **Global Stop Hotkey:** Press `ESC` at any time to immediately stop the autoclicker.
*   **Native macOS Integration:** Leverages macOS accessibility features for precise and reliable clicking.

## 🚀 Getting Started

### Installation

You can download the latest release of AutoClicker for Mac from the [Releases page](https://github.com/erikkostashuk/autoclicker-for-mac/releases) (link will be updated upon first release).

### Building from Source

If you prefer to build the application yourself, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/erikkostashuk/autoclicker-for-mac.git
    cd autoclicker-for-mac
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the app in development mode:**
    ```bash
    npm start
    ```

4.  **Package the application for distribution:**
    ```bash
    npm run dist
    ```
    This will create a distributable `.dmg` file in the `dist/` directory.

### Important: Enable Accessibility Permissions

For the autoclicker to function correctly, you **MUST** grant accessibility permissions to the application. When you first run the app, macOS will prompt you to grant these permissions. If you need to do it manually:

1.  Open **System Settings** (or **System Preferences** on older macOS versions) → **Privacy & Security** → **Accessibility**.
2.  Click the lock icon to make changes (you may need to enter your password).
3.  Find "AutoClicker" in the list and ensure its checkbox is **checked**.

### For Actual Clicking to Work (REQUIRED)

The application uses a compiled C program to perform clicks without moving the cursor. This is handled internally by the Electron app. However, for the initial setup and to ensure all permissions are correctly granted, the app might prompt you for Automation permissions.

### How It Works

AutoClicker for Mac utilizes macOS's native accessibility APIs to simulate mouse clicks at your current cursor position. This ensures high precision and compatibility with the operating system. Simply position your mouse cursor where you want the clicks to occur before starting the autoclicker.

## ☕ Buy Me a Coffee

If you find this application useful and would like to support its development, you can buy me a coffee! Your support is greatly appreciated.

<a href="https://coff.ee/devwitherik" target="_blank">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
</a>

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements, bug reports, or want to add new features, please feel free to open an issue or submit a pull request.

---
