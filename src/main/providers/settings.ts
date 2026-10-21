import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

const SETTINGS = [
  ["Display", "ms-settings:display", ["screen", "monitor", "display", "brightness"]],
  ["Bluetooth & devices", "ms-settings:bluetooth", ["bluetooth", "devices", "mouse", "keyboard"]],
  ["Network & internet", "ms-settings:network", ["network", "wifi", "internet", "ethernet"]],
  ["Personalization", "ms-settings:personalization", ["theme", "wallpaper", "personalization", "background"]],
  ["Apps", "ms-settings:appsfeatures", ["apps", "applications", "uninstall"]],
  ["Privacy & security", "ms-settings:privacy", ["privacy", "security", "permissions"]],
  ["Windows Update", "ms-settings:windowsupdate", ["update", "windows update"]],
  ["Sound", "ms-settings:sound", ["sound", "audio", "microphone", "volume"]],
] as const;

export class SettingsProvider implements Provider {
  readonly id = "settings";
  readonly title = "Settings";

  async search(text: string, _context: ProviderContext): Promise<LauncherResult[]> {
    const query = text.toLowerCase();
    if (!query) {
      return [{
        id: "setting:quicklaunch-preferences",
        providerId: this.id,
        kind: "setting",
        title: "QuickLaunch Preferences",
        subtitle: "Configure hotkey, providers, scopes, and appearance",
        uri: "quicklaunch:preferences",
        score: 1,
      }];
    }
    const results = SETTINGS.map(([title, uri, keywords]) => {
      const score = title.toLowerCase().includes(query) ? 0.95 : keywords.some((keyword) => keyword.includes(query) || query.includes(keyword)) ? 0.8 : 0;
      return score ? { id: `setting:${uri}`, providerId: this.id, kind: "setting" as const, title, subtitle: uri, uri, score } : null;
    }).filter((result): result is NonNullable<typeof result> => result !== null);
    const preferences: LauncherResult = {
      id: "setting:quicklaunch-preferences",
      providerId: this.id,
      kind: "setting",
      title: "QuickLaunch Preferences",
      subtitle: "Configure hotkey, providers, scopes, and appearance",
      uri: "quicklaunch:preferences",
      score: !["preferences", "quicklaunch", "hotkey", "appearance", "providers"].some((term) => term.includes(query) || query.includes(term))
        ? 0
        : 1,
    };
    return [preferences, ...results].filter((result) => result.score > 0);
  }
}
