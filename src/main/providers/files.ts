import { basename } from "node:path";
import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";
import { searchEverything } from "./everything";
import { IncrementalFileIndex } from "./fallback-index";
import { searchSystemIndex } from "./system-index";

function scoreMatch(name: string, query: string): number {
  if (!query) return 0.25;
  const value = name.toLowerCase();
  const normalized = query.toLowerCase();
  if (value === normalized) return 1;
  if (value.startsWith(normalized)) return 0.85;
  if (value.includes(normalized)) return 0.65;
  return 0;
}


export class FilesProvider implements Provider {
  readonly id: string = "files";
  readonly title: string = "Files";
  private readonly fallback = new IncrementalFileIndex();

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    let entries;
    try {
      entries = await searchSystemIndex(text, context.limit, context.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      console.warn("[QuickLaunch] Windows Search unavailable; trying Everything.", error);
      try {
        const everythingEntries = await searchEverything(text, context.limit, context.signal);
        entries = everythingEntries ?? await this.fallback.search(text, context.limit, context.signal);
      } catch (everythingError) {
        if (everythingError instanceof DOMException && everythingError.name === "AbortError") throw everythingError;
        console.warn("[QuickLaunch] Everything unavailable; using incremental file index.", everythingError);
        entries = await this.fallback.search(text, context.limit, context.signal);
      }
    }
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
