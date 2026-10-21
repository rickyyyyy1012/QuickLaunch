import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

export class WebProvider implements Provider {
  readonly id = "web";
  readonly title = "Web search";

  async search(text: string, _context: ProviderContext): Promise<LauncherResult[]> {
    const query = text.trim();
    if (!query) return [];
    return [{
      id: `web:${query}`,
      providerId: this.id,
      kind: "web",
      title: `Search the web for “${query}”`,
      subtitle: "DuckDuckGo",
      uri: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      score: 0.1,
    }];
  }
}
