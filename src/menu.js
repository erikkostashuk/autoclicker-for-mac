const { Menu, app, shell } = require('electron');

const REPO_URL = 'https://github.com/erikkostashuk/autoclicker-for-mac';

function setUpMenu() {
  const template = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    // Reload and DevTools are only useful while developing.
    ...(app.isPackaged ? [] : [{ role: 'viewMenu' }]),
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'AutoClicker on GitHub', click: () => shell.openExternal(REPO_URL) },
        { label: 'Check for Updates…', click: () => shell.openExternal(`${REPO_URL}/releases/latest`) },
        { label: 'Report a Problem…', click: () => shell.openExternal(`${REPO_URL}/issues/new`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { REPO_URL, setUpMenu };
