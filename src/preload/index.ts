import { contextBridge, ipcRenderer } from "electron";
import { IPC, ShellTheme } from "../shared/ipc";

contextBridge.exposeInMainWorld("quickLaunch", {
  onOpening(callback: (reducedMotion: boolean) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, reducedMotion: boolean) => {
      callback(reducedMotion);
    };
    ipcRenderer.on(IPC.shellOpening, listener);
    return () => ipcRenderer.removeListener(IPC.shellOpening, listener);
  },
  onClosing(callback: (reducedMotion: boolean) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, reducedMotion: boolean) => {
      callback(reducedMotion);
    };
    ipcRenderer.on(IPC.shellClosing, listener);
    return () => ipcRenderer.removeListener(IPC.shellClosing, listener);
  },
  onTheme(callback: (theme: ShellTheme) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, theme: ShellTheme) => {
      callback(theme);
    };
    ipcRenderer.on(IPC.shellTheme, listener);
    return () => ipcRenderer.removeListener(IPC.shellTheme, listener);
  },
  hide(): void {
    ipcRenderer.send(IPC.hideWindow);
  },
  resize(height: number): void {
    ipcRenderer.send(IPC.resizeWindow, height);
  },
});
