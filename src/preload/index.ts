import { contextBridge, ipcRenderer } from "electron";
import { IPC, LauncherResult, SearchCancelRequest, SearchRequest, SearchSection, SearchError, ShellTheme } from "../shared/ipc";

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
  startSearch(request: SearchRequest): void {
    ipcRenderer.send(IPC.searchStart, request);
  },
  cancelSearch(request: SearchCancelRequest): void {
    ipcRenderer.send(IPC.searchCancel, request);
  },
  onSearchSection(callback: (section: SearchSection) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, section: SearchSection) => callback(section);
    ipcRenderer.on(IPC.searchSection, listener);
    return () => ipcRenderer.removeListener(IPC.searchSection, listener);
  },
  onSearchError(callback: (error: SearchError) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, error: SearchError) => callback(error);
    ipcRenderer.on(IPC.searchError, listener);
    return () => ipcRenderer.removeListener(IPC.searchError, listener);
  },
  onSearchComplete(callback: (queryId: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, queryId: string) => callback(queryId);
    ipcRenderer.on(IPC.searchComplete, listener);
    return () => ipcRenderer.removeListener(IPC.searchComplete, listener);
  },
  execute(result: LauncherResult): void {
    ipcRenderer.send(IPC.resultExecute, result);
  },
  readIcon(icon: { cacheKey: string; source: "file" | "app" | "generated"; mimeType?: string }): Promise<string> {
    return ipcRenderer.invoke(IPC.iconRead, icon);
  },
});
