import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

const ACTIONS = [
  ["Sleep", "sleep", ["sleep", "suspend"]],
  ["Restart", "restart", ["restart", "reboot"]],
  ["Shut down", "shutdown", ["shutdown", "power off"]],
  ["Sign out", "sign-out", ["sign out", "logout", "log off"]],
  ["Lock", "lock", ["lock", "lock screen"]],
  ["Empty recycle bin", "empty-recycle-bin", ["empty recycle bin", "clear recycle bin"]],
] as const;

export class SystemProvider implements Provider {
  readonly id = "system";
  readonly title = "System";

  async search(text: string, _context: ProviderContext): Promise<LauncherResult[]> {
    const query = text.toLowerCase();
    if (!query) return [];
    return ACTIONS.map(([title, action, keywords]) => {
      const score = title.toLowerCase().includes(query) ? 0.95 : keywords.some((keyword) => keyword.includes(query) || query.includes(keyword)) ? 0.85 : 0;
      if (!score) return null;
      const destructive = action === "restart" || action === "shutdown" || action === "sign-out" || action === "empty-recycle-bin";
      return {
        id: `system:${action}`,
        providerId: this.id,
        kind: "system" as const,
        title,
        subtitle: destructive ? "Confirmation required" : "Windows system action",
        uri: `quicklaunch:system:${action}`,
        score,
        ...(destructive ? { requiresConfirmation: action as "restart" | "shutdown" | "sign-out" | "empty-recycle-bin" } : {}),
      };
    }).filter((result): result is NonNullable<typeof result> => result !== null);
  }
}
