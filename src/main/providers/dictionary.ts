import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";
import { readCache, readStaleCache, writeCache } from "./cache";

interface DictionaryEntry { word: string; meanings: Array<{ partOfSpeech: string; definitions: Array<{ definition: string }> }> }

export class DictionaryProvider implements Provider {
  readonly id = "dictionary";
  readonly title = "Dictionary";

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    const word = text.trim().toLowerCase();
    if (!/^[a-z][a-z'-]{1,49}$/.test(word)) return [];
    const key = `dictionary-${encodeURIComponent(word)}.json`;
    let entries = await readCache<DictionaryEntry[]>(key, 7 * 24 * 60 * 60 * 1000);
    if (!entries) {
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: context.signal });
        if (response.status === 404) return [];
        if (!response.ok) throw new Error(`Dictionary service returned ${response.status}.`);
        entries = await response.json() as DictionaryEntry[];
        await writeCache(key, entries);
      } catch (error) {
        entries = await readStaleCache<DictionaryEntry[]>(key);
        if (!entries) throw error;
      }
    }
    const definition = entries[0]?.meanings[0]?.definitions[0]?.definition;
    if (!definition) return [];
    return [{
      id: `dictionary:${word}`,
      providerId: this.id,
      kind: "dictionary",
      title: word,
      subtitle: `${entries[0].meanings[0].partOfSpeech}: ${definition}`,
      score: 0.95,
    }];
  }
}
