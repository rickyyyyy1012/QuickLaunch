import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  systemPreferences,
  Tray,
} from "electron";
import { join } from "node:path";
import { AppSettings, IPC, ShellTheme } from "../shared/ipc";
import { createProviderManager, ProviderManager } from "./providers";
import { DEFAULT_SETTINGS, SettingsStore } from "./settings";

const WINDOW_WIDTH = 680;
const WINDOW_HEIGHT = 180;
const MIN_WINDOW_HEIGHT = 180;
const MAX_WINDOW_HEIGHT = 500;
const CLOSE_DURATION_MS = 80;
let launcherWindow: BrowserWindow | null = null;
let preferencesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let hideTimer: NodeJS.Timeout | null = null;
let launcherReady = false;
let providerManager: ProviderManager | null = null;
const settingsStore = new SettingsStore();
let settings: AppSettings = DEFAULT_SETTINGS;
let registeredHotkey = "";

function isWindows11OrNewer(): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const build = Number(process.getSystemVersion().split(".")[2]);
  return Number.isFinite(build) && build >= 22000;
}

function shouldUseAcrylic(): boolean {
  return isWindows11OrNewer() && systemPreferences.isAeroGlassEnabled();
}

function getTheme(): ShellTheme {
  if (settings.theme === "high-contrast") return "high-contrast";
  if (settings.theme === "light") return "light";
  if (settings.theme === "dark") return "dark";
  if (nativeTheme.shouldUseHighContrastColors) return "high-contrast";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function prefersReducedMotion(): boolean {
  return settings.reducedMotion;
}

function themeBackground(): string {
  const theme = getTheme();
  return theme === "high-contrast" ? "#000000" : theme === "dark" ? "#26262A" : "#F2F5F7";
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
  if (launcherWindow && !shouldUseAcrylic()) {
    launcherWindow.setBackgroundColor(themeBackground());
  }
  preferencesWindow?.setBackgroundColor(themeBackground());
  if (launcherReady) {
    launcherWindow?.webContents.send(IPC.shellTheme, getTheme());
  }
  preferencesWindow?.webContents.send(IPC.shellTheme, getTheme());
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
  const reducedMotion = prefersReducedMotion();
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
  launcherWindow.webContents.send(IPC.shellOpening, prefersReducedMotion());
}

function toggleLauncher(): void {
  if (launcherWindow?.isVisible()) {
    hideLauncher();
  } else {
    showLauncher();
  }
}

function createPreferencesWindow(): void {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    preferencesWindow.show();
    preferencesWindow.focus();
    return;
  }
  preferencesWindow = new BrowserWindow({
    width: 640,
    height: 700,
    minWidth: 560,
    minHeight: 560,
    show: false,
    title: "QuickLaunch Preferences",
    backgroundColor: themeBackground(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.js"),
    },
  });
  preferencesWindow.loadFile(join(__dirname, "../renderer/preferences.html"));
  preferencesWindow.webContents.on("did-finish-load", sendTheme);
  preferencesWindow.once("ready-to-show", () => preferencesWindow?.show());
  preferencesWindow.on("closed", () => { preferencesWindow = null; });
}

function broadcastSettings(): void {
  launcherWindow?.webContents.send(IPC.settingsChanged, settings);
  preferencesWindow?.webContents.send(IPC.settingsChanged, settings);
  sendTheme();
}

function registerConfiguredHotkey(): string | null {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = "";
  }
  if (!settings.hotkey.enabled) return null;
  if (!settings.hotkey.accelerator) return "Enter a global hotkey.";
  try {
    if (!globalShortcut.register(settings.hotkey.accelerator, toggleLauncher)) {
      return `The hotkey "${settings.hotkey.accelerator}" is unavailable or already in use.`;
    }
  } catch (error) {
    console.error("[QuickLaunch] Invalid global hotkey.", error);
    return `The hotkey "${settings.hotkey.accelerator}" is invalid or unavailable.`;
  }
  registeredHotkey = settings.hotkey.accelerator;
  return null;
}

async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const previous = settings;
  const next = await settingsStore.update(patch);
  settings = next;
  const hotkeyChanged = previous.hotkey.accelerator !== next.hotkey.accelerator
    || previous.hotkey.enabled !== next.hotkey.enabled;
  if (hotkeyChanged) {
    const error = registerConfiguredHotkey();
    if (error) {
      settings = await settingsStore.update({ hotkey: previous.hotkey });
      const restoreError = registerConfiguredHotkey();
      if (restoreError) console.error("[QuickLaunch] Unable to restore the previous hotkey.", restoreError);
      preferencesWindow?.webContents.send(IPC.hotkeyError, error);
      throw new Error(error);
    }
  }
  providerManager?.applySettings(settings);
  broadcastSettings();
  return settings;
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
    backgroundColor: useAcrylic ? "#00FFFFFF" : themeBackground(),
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

function createTray(): void {
  tray = new Tray(nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAHElEQVR42mNgGAWjgP8fDAwMDAwM/4eB4T8QAAHkAAf8FQx8AAAAASUVORK5CYII=",
  ));
  tray.setToolTip("QuickLaunch");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open QuickLaunch", click: showLauncher },
    { label: "Preferences", click: createPreferencesWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("double-click", showLauncher);
}

app.whenReady().then(async () => {
  settings = await settingsStore.load();
  createLauncherWindow();
  const hotkeyError = registerConfiguredHotkey();
  if (hotkeyError) console.error(`[QuickLaunch] ${hotkeyError}`);
  createTray();
  nativeTheme.on("updated", sendTheme);
  providerManager = createProviderManager(settings, createPreferencesWindow);

  ipcMain.on(IPC.hideWindow, hideLauncher);
  ipcMain.on(IPC.resizeWindow, resizeWindow);
  ipcMain.on(IPC.preferencesOpen, createPreferencesWindow);
  ipcMain.handle(IPC.settingsGet, () => settingsStore.get());
  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: Partial<AppSettings>) => updateSettings(patch));
  providerManager.register(launcherWindow!);
});

app.on("will-quit", () => {
  nativeTheme.removeListener("updated", sendTheme);
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  ipcMain.removeHandler(IPC.settingsGet);
  ipcMain.removeHandler(IPC.settingsUpdate);
  providerManager?.dispose();
  providerManager = null;
});
