import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { AppSettings, ProviderSettings, SearchScopes } from "../shared/ipc";

const PROVIDER_DEFAULTS: ProviderSettings[] = [
  "apps", "files", "folders", "calculator", "units", "currency", "dictionary", "settings", "system", "web",
].map((id, order) => ({ id, enabled: id !== "web", order }));

const DEFAULT_SCOPES: SearchScopes = {
  applications: true,
  files: true,
  folders: true,
  settings: true,
  web: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: { accelerator: "Alt+Space", enabled: true },
  providers: PROVIDER_DEFAULTS,
  scopes: DEFAULT_SCOPES,
  theme: "system",
  reducedMotion: false,
};

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function normalizeProviders(value: unknown): ProviderSettings[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.providers.map((provider) => ({ ...provider }));
  const known = new Map(DEFAULT_SETTINGS.providers.map((provider) => [provider.id, provider]));
  const seen = new Set<string>();
  const result: ProviderSettings[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<ProviderSettings>;
    if (!item.id || !known.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ id: item.id, enabled: item.enabled !== false, order: result.length });
  }
  for (const provider of DEFAULT_SETTINGS.providers) {
    if (!seen.has(provider.id)) result.push({ ...provider, order: result.length });
  }
  return result;
}

function normalize(value: Partial<AppSettings> | null | undefined): AppSettings {
  const scopes = value?.scopes;
  const hotkey = value?.hotkey;
  return {
    hotkey: {
      accelerator: typeof hotkey?.accelerator === "string" ? hotkey.accelerator.trim() : DEFAULT_SETTINGS.hotkey.accelerator,
      enabled: hotkey?.enabled !== false,
    },
    providers: normalizeProviders(value?.providers),
    scopes: {
      applications: scopes?.applications !== false,
      files: scopes?.files !== false,
      folders: scopes?.folders !== false,
      settings: scopes?.settings !== false,
      web: scopes?.web !== false,
    },
    theme: value?.theme === "light" || value?.theme === "dark" || value?.theme === "high-contrast" ? value.theme : "system",
    reducedMotion: value?.reducedMotion === true,
  };
}

export class SettingsStore {
  private settings: AppSettings = normalize(DEFAULT_SETTINGS);

  async load(): Promise<AppSettings> {
    try {
      const content = await fs.readFile(settingsPath(), "utf8");
      this.settings = normalize(JSON.parse(content) as Partial<AppSettings>);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[QuickLaunch] Unable to load settings; using defaults.", error);
      }
      await this.save();
    }
    return this.get();
  }

  get(): AppSettings {
    return {
      ...this.settings,
      hotkey: { ...this.settings.hotkey },
      providers: this.settings.providers.map((provider) => ({ ...provider })),
      scopes: { ...this.settings.scopes },
    };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = normalize({
      ...this.settings,
      ...patch,
      hotkey: { ...this.settings.hotkey, ...patch.hotkey },
      scopes: { ...this.settings.scopes, ...patch.scopes },
    });
    await this.save();
    return this.get();
  }

  private async save(): Promise<void> {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(settingsPath(), JSON.stringify(this.settings, null, 2), "utf8");
  }
}
