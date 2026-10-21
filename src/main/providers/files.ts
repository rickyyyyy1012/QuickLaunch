import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

type FileEntry = { path: string; directory: boolean };

function getRoots(): string[] {
  const home = homedir();
  return [join(home, "Desktop"), join(home, "Documents"), join(home, "Downloads"), process.cwd()];
}

function scoreMatch(name: string, query: string): number {
  if (!query) return 0.25;
  const value = name.toLowerCase();
  const normalized = query.toLowerCase();
  if (value === normalized) return 1;
  if (value.startsWith(normalized)) return 0.85;
  if (value.includes(normalized)) return 0.65;
  return 0;
}

async function collectEntries(signal: AbortSignal, limit: number): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const pending = getRoots();
  const visited = new Set<string>();

  while (pending.length && entries.length < limit * 8) {
    if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    let children;
    try {
      children = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      console.warn(`[QuickLaunch] Unable to scan ${current}:`, error);
      continue;
    }
    for (const child of children) {
      if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
      if (child.name.startsWith(".") || child.name === "node_modules" || child.name === "AppData") continue;
      const path = join(current, child.name);
      if (child.isDirectory()) {
        entries.push({ path, directory: true });
        if (pending.length < 256) pending.push(path);
      } else if (child.isFile()) {
        entries.push({ path, directory: false });
      }
      if (entries.length >= limit * 8) break;
    }
  }
  return entries;
}

export class FilesProvider implements Provider {
  readonly id = "files";
  readonly title = "Files";

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    const entries = await collectEntries(context.signal, context.limit);
    const matches = entries
      .map((entry): LauncherResult | null => {
        const title = basename(entry.path);
        const score = scoreMatch(title, text);
        if (!score) return null;
        return {
          id: `${entry.directory ? "folder" : "file"}:${entry.path.toLowerCase()}`,
          providerId: entry.directory ? "folders" : this.id,
          kind: entry.directory ? "folder" : "file",
          title,
          subtitle: entry.path,
          path: entry.path,
          icon: undefined,
          score,
        };
      })
      .filter((result): result is LauncherResult => result !== null)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, context.limit);
    return Promise.all(matches.map(async (result) => {
      if (context.signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
      try {
        result.icon = await context.readIcon(result.path!, "file");
      } catch (error) {
        console.warn(`[QuickLaunch] Unable to read icon for ${result.path}:`, error);
        result.icon = undefined;
      }
      return result;
    }));
  }
}

export class FoldersProvider extends FilesProvider {
  readonly id = "folders";
  readonly title = "Folders";

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    const results = await super.search(text, context);
    return results.filter((result) => result.kind === "folder").slice(0, context.limit);
  }
}
