const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

if (!app.requestSingleInstanceLock()) app.quit();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Shipping',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // La pagina riconosce il guscio desktop da questo suffisso e nasconde "Installa".
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} ShippingDesktop/${app.getVersion()}`);
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  // I link esterni si aprono nel browser, mai dentro l'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Su macOS il menu di default serve per copia/incolla (Cmd+C / Cmd+V).
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
