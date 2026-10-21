import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createHash } from "node:crypto";
import { IPC, IconReference, LauncherResult, SearchCancelRequest, SearchRequest } from "../../shared/ipc";
import { Provider } from "../../shared/providers";
import { AppsProvider } from "./apps";
import { FilesProvider, FoldersProvider } from "./files";
import { CalculatorProvider } from "./calculator";
import { CurrencyProvider } from "./currency";
import { DictionaryProvider } from "./dictionary";
import { SettingsProvider } from "./settings";
import { SystemProvider } from "./system";
import { UnitsProvider } from "./units";
import { WebProvider } from "./web";
import { readStaleCache, writeCache } from "../cache";

const DEBOUNCE_MS = 40;
const DEFAULT_LIMIT = 8;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class ProviderManager {
  private readonly providers: Provider[] = [
    new AppsProvider(), new FilesProvider(), new FoldersProvider(), new CalculatorProvider(),
    new UnitsProvider(), new CurrencyProvider(), new DictionaryProvider(), new SettingsProvider(),
    new SystemProvider(), new WebProvider(),
  ];
  private readonly iconCache = new Map<string, string>();
  private readonly iconCacheReady: Promise<void>;
  private active: { request: SearchRequest; controller: AbortController; timer: NodeJS.Timeout } | null = null;

  constructor() {
    this.iconCacheReady = readStaleCache<Record<string, string>>("icons.json").then((cached) => {
      for (const [key, value] of Object.entries(cached ?? {})) this.iconCache.set(key, value);
    });
  }

  register(window: BrowserWindow): void {
    ipcMain.on(IPC.searchStart, (_event, request: SearchRequest) => this.start(window, request));
    ipcMain.on(IPC.searchCancel, (_event, request: SearchCancelRequest) => this.cancel(request));
    ipcMain.handle(IPC.iconRead, async (_event, icon: IconReference) => this.iconCache.get(icon.cacheKey) ?? "");
    ipcMain.on(IPC.resultExecute, (_event, result: LauncherResult) => {
      const execution = result.requiresConfirmation
        ? this.executeConfirmed(result)
        : result.uri
          ? this.execute(result.uri)
          : result.path
            ? this.execute(result.path)
            : Promise.resolve();
      void execution.catch((error: unknown) => {
        console.error("[QuickLaunch] Result execution failed.", error);
      });
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
      : this.providers.filter((provider) => provider.id !== "web");
    const limit = Math.max(1, Math.min(25, request.limit ?? DEFAULT_LIMIT));
    let resultCount = 0;
    await Promise.all(selected.map(async (provider) => {
      const startedAt = performance.now();
      try {
        const items = await provider.search(request.text.trim(), {
          queryId: request.queryId,
          signal: controller.signal,
          limit,
          readIcon: (path, source = "file") => this.readIcon(path, source),
        });
        if (!controller.signal.aborted && !window.isDestroyed()) {
          resultCount += items.length;
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
      } finally {
        console.info(`[QuickLaunch] search provider=${provider.id} query=${request.queryId} latencyMs=${Math.round(performance.now() - startedAt)} cancelled=${controller.signal.aborted}`);
      }
    }));
    if (!controller.signal.aborted && resultCount === 0 && (!request.providers?.length || request.providers.includes("web"))) {
      const web = this.providers.find((provider) => provider.id === "web");
      if (web) {
        const items = await web.search(request.text.trim(), {
          queryId: request.queryId, signal: controller.signal, limit, readIcon: (path, source = "file") => this.readIcon(path, source),
        });
        if (items.length && !window.isDestroyed()) {
          window.webContents.send(IPC.searchSection, { queryId: request.queryId, providerId: web.id, title: web.title, items, isFinal: true });
        }
      }
    }
    if (!controller.signal.aborted && !window.isDestroyed()) {
      window.webContents.send(IPC.searchComplete, request.queryId);
    }
    if (this.active?.request.queryId === request.queryId) this.active = null;
  }

  private async readIcon(path: string, source: IconReference["source"]): Promise<IconReference> {
    await this.iconCacheReady;
    const cacheKey = createHash("sha256").update(path.toLowerCase()).digest("hex");
    if (!this.iconCache.has(cacheKey)) {
      const image = await app.getFileIcon(path, { size: "small" });
      this.iconCache.set(cacheKey, image.toDataURL());
      await writeCache("icons.json", Object.fromEntries(this.iconCache));
    }
    return { cacheKey, source, mimeType: "image/png" };
  }

  private async execute(target: string): Promise<void> {
    if (target.startsWith("shell:")) await shell.openExternal(target);
    else if (target.startsWith("quicklaunch:copy:")) await this.copyToClipboard(target.slice("quicklaunch:copy:".length));
    else if (target.startsWith("quicklaunch:system:")) await this.executeSystemAction(target.slice("quicklaunch:system:".length));
    else if (target.startsWith("ms-settings:")) await shell.openExternal(target);
    else await shell.openPath(target);
  }

  private async executeConfirmed(result: LauncherResult): Promise<void> {
    const action = result.requiresConfirmation;
    if (!action) return;
    const choice = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Cancel", "Continue"],
      defaultId: 0,
      cancelId: 0,
      title: result.title,
      message: `Are you sure you want to ${result.title.toLowerCase()}?`,
    });
    if (choice.response === 1 && result.uri) await this.execute(result.uri);
  }

  private async copyToClipboard(value: string): Promise<void> {
    const { clipboard } = await import("electron");
    clipboard.writeText(value);
  }

  private async executeSystemAction(action: string): Promise<void> {
    if (process.platform !== "win32") throw new Error("System actions are only supported on Windows.");
    const { execFile } = await import("node:child_process");
    const commands: Record<string, string[]> = {
      sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
      restart: ["shutdown.exe", ["/r", "/t", "0"]],
      shutdown: ["shutdown.exe", ["/s", "/t", "0"]],
      "sign-out": ["shutdown.exe", ["/l"]],
      lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
      "empty-recycle-bin": ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Clear-RecycleBin -Force"]],
    };
    const command = commands[action];
    if (!command) throw new Error(`Unknown system action: ${action}`);
    await new Promise<void>((resolve, reject) => execFile(command[0], command[1], { windowsHide: true }, (error) => error ? reject(error) : resolve()));
  }
}

export function createProviderManager(): ProviderManager {
  return new ProviderManager();
}
