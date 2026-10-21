import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readStaleCache, writeCache } from "./cache";
import { IndexedFile } from "./system-index";

const CACHE_NAME = "file-index.json";
const REFRESH_INTERVAL_MS = 30_000;
const MAX_INDEX_ENTRIES = 50_000;

function roots(): string[] {
  const home = homedir();
  return [join(home, "Desktop"), join(home, "Documents"), join(home, "Downloads"), process.cwd()];
}

export class IncrementalFileIndex {
  private entries: IndexedFile[] = [];
  private loaded = false;
  private refreshPromise: Promise<void> | undefined;
  private lastRefreshAt = 0;

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.entries = (await readStaleCache<IndexedFile[]>(CACHE_NAME)) ?? [];
  }

  async search(text: string, limit: number, signal: AbortSignal): Promise<IndexedFile[]> {
    await this.refresh(signal);
    const normalized = text.trim().toLowerCase();
    return this.entries
      .filter((entry) => !normalized || basename(entry.path).toLowerCase().includes(normalized))
      .slice(0, Math.max(1, limit * 8));
  }

  private async refresh(signal: AbortSignal): Promise<void> {
    await this.load();
    if (Date.now() - this.lastRefreshAt < REFRESH_INTERVAL_MS) return;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.scan(signal).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  private async scan(signal: AbortSignal): Promise<void> {
    const next = new Map(this.entries.map((entry) => [entry.path.toLowerCase(), entry]));
    const pending = [...roots()];
    const visited = new Set<string>();
    while (pending.length) {
      if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
      const current = pending.shift();
      if (!current || visited.has(current.toLowerCase())) continue;
      visited.add(current.toLowerCase());
      let children;
      try {
        children = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
        if (child.name.startsWith(".") || child.name === "node_modules" || child.name === "AppData") continue;
        const path = join(current, child.name);
        const key = path.toLowerCase();
        if (child.isDirectory()) {
          next.set(key, { path, directory: true });
          pending.push(path);
        } else if (child.isFile()) {
          next.set(key, { path, directory: false });
        }
        if (next.size >= MAX_INDEX_ENTRIES) break;
      }
      if (next.size >= MAX_INDEX_ENTRIES) break;
    }
    this.entries = [...next.values()];
    this.lastRefreshAt = Date.now();
    await writeCache(CACHE_NAME, this.entries);
  }
}
