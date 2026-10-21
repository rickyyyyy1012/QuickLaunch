import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
  systemPreferences,
} from "electron";
import { join } from "node:path";
import { IPC, ShellTheme } from "../shared/ipc";

const WINDOW_WIDTH = 680;
const WINDOW_HEIGHT = 180;
const MIN_WINDOW_HEIGHT = 180;
const MAX_WINDOW_HEIGHT = 500;
const CLOSE_DURATION_MS = 80;
const HOTKEY = "Alt+Space";

let launcherWindow: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;
let launcherReady = false;

function isWindows11OrNewer(): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const build = Number(process.getSystemVersion().split(".")[2]);
  return Number.isFinite(build) && build >= 22000;
}

function shouldUseAcrylic(): boolean {
  return isWindows11OrNewer() && systemPreferences.isAeroGlassEnabled;
}

function getTheme(): ShellTheme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function positionWindow(window: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const x = Math.round(display.workArea.x + (display.workArea.width - WINDOW_WIDTH) / 2);
  const y = Math.round(display.workArea.y + display.workArea.height * 0.22);
  window.setPosition(x, y, false);
}

function resizeWindow(_event: Electron.IpcMainEvent, requestedHeight: number): void {
  if (!launcherWindow || !Number.isFinite(requestedHeight)) {
    return;
  }

  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(MAX_WINDOW_HEIGHT, Math.round(requestedHeight)));
  const [width] = launcherWindow.getSize();
  if (launcherWindow.getSize()[1] !== height) {
    launcherWindow.setSize(width, height, true);
    positionWindow(launcherWindow);
  }
}

function sendTheme(): void {
  if (launcherReady) {
    launcherWindow?.webContents.send(IPC.shellTheme, getTheme());
  }
}

function clearHideTimer(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hideLauncher(): void {
  if (!launcherWindow || !launcherWindow.isVisible()) {
    return;
  }

  clearHideTimer();
  const reducedMotion = nativeTheme.prefersReducedMotion;
  launcherWindow.webContents.send(IPC.shellClosing, reducedMotion);
  hideTimer = setTimeout(() => {
    launcherWindow?.hide();
    hideTimer = null;
  }, reducedMotion ? 0 : CLOSE_DURATION_MS);
}

function showLauncher(): void {
  if (!launcherWindow) {
    return;
  }

  if (!launcherReady) {
    launcherWindow.webContents.once("did-finish-load", showLauncher);
    return;
  }

  clearHideTimer();
  positionWindow(launcherWindow);
  launcherWindow.show();
  launcherWindow.focus();
  sendTheme();
  launcherWindow.webContents.send(IPC.shellOpening, nativeTheme.prefersReducedMotion);
}

function toggleLauncher(): void {
  if (launcherWindow?.isVisible()) {
    hideLauncher();
  } else {
    showLauncher();
  }
}

function createLauncherWindow(): void {
  const useAcrylic = shouldUseAcrylic();
  launcherWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    maxHeight: MAX_WINDOW_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: useAcrylic ? "#00FFFFFF" : "#F2F5F5F7",
    backgroundMaterial: useAcrylic ? "acrylic" : "none",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    roundedCorners: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.js"),
    },
  });
  launcherWindow.setAlwaysOnTop(true, "screen-saver");
  launcherWindow.loadFile(join(__dirname, "../renderer/index.html"));
  launcherWindow.webContents.on("did-finish-load", () => {
    launcherReady = true;
    sendTheme();
  });

  launcherWindow.on("blur", hideLauncher);
  launcherWindow.on("closed", () => {
    launcherWindow = null;
    launcherReady = false;
  });
}

function registerHotkey(): void {
  if (!globalShortcut.register(HOTKEY, toggleLauncher)) {
    console.error(`Unable to register global hotkey: ${HOTKEY}`);
  }
}

app.whenReady().then(() => {
  createLauncherWindow();
  registerHotkey();
  nativeTheme.on("updated", sendTheme);

  ipcMain.on(IPC.hideWindow, hideLauncher);
  ipcMain.on(IPC.resizeWindow, resizeWindow);
});

app.on("will-quit", () => {
  nativeTheme.removeListener("updated", sendTheme);
  globalShortcut.unregisterAll();
});
