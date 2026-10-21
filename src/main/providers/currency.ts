import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";
import { readCache, readStaleCache, writeCache } from "./cache";

interface RatesResponse { rates: Record<string, number>; base: string; date: string }

export class CurrencyProvider implements Provider {
  readonly id = "currency";
  readonly title = "Currency";

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    const match = text.match(/^\s*(\d+(?:\.\d+)?)\s*([A-Za-z]{3})\s+(?:in|to)\s+([A-Za-z]{3})\s*$/);
    if (!match) return [];
    const amount = Number(match[1]);
    const from = match[2].toUpperCase();
    const to = match[3].toUpperCase();
    const key = `currency-${from}.json`;
    let rates = await readCache<RatesResponse>(key, 24 * 60 * 60 * 1000);
    if (!rates) {
      try {
        const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}`, { signal: context.signal });
        if (!response.ok) throw new Error(`Currency service returned ${response.status}.`);
        rates = await response.json() as RatesResponse;
        await writeCache(key, rates);
      } catch (error) {
        rates = await readStaleCache<RatesResponse>(key);
        if (!rates) throw error;
      }
    }
    const rate = from === to ? 1 : rates.rates[to];
    if (!Number.isFinite(rate)) return [];
    const converted = amount * rate;
    return [{
      id: `currency:${text.toLowerCase()}`,
      providerId: this.id,
      kind: "currency",
      title: `${converted.toFixed(2)} ${to}`,
      subtitle: `${amount.toFixed(2)} ${from} · ${rates.date}${rate === 1 ? "" : " (cached/offline capable)"}`,
      score: 1,
      uri: `quicklaunch:copy:${converted.toFixed(2)} ${to}`,
    }];
  }
}
