import { app, BrowserWindow, ipcMain } from "electron";
import { createHash } from "node:crypto";
import { IPC, IconReference, LauncherResult, SearchCancelRequest, SearchRequest } from "../../shared/ipc";
import { Provider } from "../../shared/providers";
import { AppsProvider } from "./apps";
import { FilesProvider, FoldersProvider } from "./files";

const DEBOUNCE_MS = 40;
const DEFAULT_LIMIT = 8;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class ProviderManager {
  private readonly providers: Provider[] = [new AppsProvider(), new FilesProvider(), new FoldersProvider()];
  private readonly iconCache = new Map<string, string>();
  private active: { request: SearchRequest; controller: AbortController; timer: NodeJS.Timeout } | null = null;

  register(window: BrowserWindow): void {
    ipcMain.on(IPC.searchStart, (_event, request: SearchRequest) => this.start(window, request));
    ipcMain.on(IPC.searchCancel, (_event, request: SearchCancelRequest) => this.cancel(request));
    ipcMain.handle(IPC.iconRead, async (_event, icon: IconReference) => this.iconCache.get(icon.cacheKey) ?? "");
    ipcMain.on(IPC.resultExecute, (_event, result: LauncherResult) => {
      if (result.uri) void this.execute(result.uri);
      else if (result.path) void this.execute(result.path);
    });
  }

  dispose(): void {
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.controller.abort();
      this.active = null;
    }
    ipcMain.removeHandler(IPC.iconRead);
    ipcMain.removeAllListeners(IPC.searchStart);
    ipcMain.removeAllListeners(IPC.searchCancel);
    ipcMain.removeAllListeners(IPC.resultExecute);
  }

  private start(window: BrowserWindow, request: SearchRequest): void {
    this.cancel({ queryId: request.queryId });
    const controller = new AbortController();
    const timer = setTimeout(() => void this.run(window, request, controller), DEBOUNCE_MS);
    this.active = { request, controller, timer };
  }

  private cancel(request: SearchCancelRequest): void {
    if (this.active?.request.queryId !== request.queryId) return;
    clearTimeout(this.active.timer);
    this.active.controller.abort();
    this.active = null;
  }

  private async run(window: BrowserWindow, request: SearchRequest, controller: AbortController): Promise<void> {
    if (this.active?.request.queryId !== request.queryId) return;
    const selected = request.providers?.length
      ? this.providers.filter((provider) => request.providers?.includes(provider.id))
      : this.providers;
    const limit = Math.max(1, Math.min(25, request.limit ?? DEFAULT_LIMIT));
    await Promise.all(selected.map(async (provider) => {
      try {
        const items = await provider.search(request.text.trim(), {
          queryId: request.queryId,
          signal: controller.signal,
          limit,
          readIcon: (path, source = "file") => this.readIcon(path, source),
        });
        if (!controller.signal.aborted && !window.isDestroyed()) {
          window.webContents.send(IPC.searchSection, {
            queryId: request.queryId,
            providerId: provider.id,
            title: provider.title,
            items,
            isFinal: true,
          });
        }
      } catch (error) {
        if (!isAbortError(error) && !controller.signal.aborted && !window.isDestroyed()) {
          window.webContents.send(IPC.searchError, {
            queryId: request.queryId,
            providerId: provider.id,
            message: error instanceof Error ? error.message : "Provider failed.",
            recoverable: true,
          });
        }
      }
    }));
    if (!controller.signal.aborted && !window.isDestroyed()) {
      window.webContents.send(IPC.searchComplete, request.queryId);
    }
    if (this.active?.request.queryId === request.queryId) this.active = null;
  }

  private async readIcon(path: string, source: IconReference["source"]): Promise<IconReference> {
    const cacheKey = createHash("sha256").update(path.toLowerCase()).digest("hex");
    if (!this.iconCache.has(cacheKey)) {
      const image = await app.getFileIcon(path, { size: "small" });
      this.iconCache.set(cacheKey, image.toDataURL());
    }
    return { cacheKey, source, mimeType: "image/png" };
  }

  private async execute(target: string): Promise<void> {
    const { shell } = await import("electron");
    if (target.startsWith("shell:")) await shell.openExternal(target);
    else await shell.openPath(target);
  }
}

export function createProviderManager(): ProviderManager {
  return new ProviderManager();
}
