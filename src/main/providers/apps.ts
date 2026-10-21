import { app } from "electron";
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

const START_MENU_COMMAND = [
  "$shell = New-Object -ComObject WScript.Shell;",
  "$roots = @($env:ProgramData + '\\Microsoft\\Windows\\Start Menu\\Programs',",
  "  $env:APPDATA + '\\Microsoft\\Windows\\Start Menu\\Programs');",
  "$roots | ForEach-Object {",
  "  if (Test-Path $_) { Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {",
  "    $shortcut = $shell.CreateShortcut($_.FullName);",
  "    [PSCustomObject]@{ Name = $_.BaseName; Path = $_.FullName; Target = $shortcut.TargetPath; Arguments = $shortcut.Arguments; WorkingDirectory = $shortcut.WorkingDirectory }",
  "  }",
  "} } | ConvertTo-Json -Compress",
];
const UWP_COMMAND = "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress";

interface ShortcutRecord {
  Name: string;
  Path: string;
  Target?: string;
  Arguments?: string;
  WorkingDirectory?: string;
}

interface UwpRecord {
  Name: string;
  AppID: string;
}

function scoreMatch(title: string, query: string): number {
  if (!query) return 1;
  const value = title.toLowerCase();
  const normalized = query.toLowerCase();
  if (value === normalized) return 1;
  if (value.startsWith(normalized)) return 0.9;
  if (value.includes(normalized)) return 0.7;
  return 0;
}

function parseJson<T>(value: string): T[] {
  if (!value.trim()) return [];
  const parsed: T | T[] = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function runPowerShell(command: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
  const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  const abort = () => child.kill();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await new Promise<string>((resolve, reject) => {
      let output = "";
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`PowerShell exited with code ${code ?? "unknown"}.`));
        }
      });
    });
    if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function getShortcutApps(signal: AbortSignal): Promise<ShortcutRecord[]> {
  if (process.platform !== "win32") return [];
  const output = await runPowerShell(START_MENU_COMMAND.join(" "), signal);
  return parseJson<ShortcutRecord>(output);
}

async function getUwpApps(signal: AbortSignal): Promise<UwpRecord[]> {
  if (process.platform !== "win32") return [];
  const output = await runPowerShell(UWP_COMMAND, signal);
  return parseJson<UwpRecord>(output);
}

export class AppsProvider implements Provider {
  readonly id = "apps";
  readonly title = "Applications";

  private shortcuts: Promise<ShortcutRecord[]> | null = null;
  private uwpApps: Promise<UwpRecord[]> | null = null;

  private loadShortcuts(signal: AbortSignal): Promise<ShortcutRecord[]> {
    if (!this.shortcuts) {
      this.shortcuts = getShortcutApps(signal).catch((error) => {
        this.shortcuts = null;
        throw error;
      });
    }
    return this.shortcuts;
  }

  private loadUwpApps(signal: AbortSignal): Promise<UwpRecord[]> {
    if (!this.uwpApps) {
      this.uwpApps = getUwpApps(signal).catch((error) => {
        this.uwpApps = null;
        throw error;
      });
    }
    return this.uwpApps;
  }

  async search(text: string, context: ProviderContext): Promise<LauncherResult[]> {
    const [shortcuts, uwpApps] = await Promise.all([
      this.loadShortcuts(context.signal),
      this.loadUwpApps(context.signal),
    ]);
    const results: LauncherResult[] = [];

    for (const shortcut of shortcuts) {
      if (context.signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
      const score = scoreMatch(shortcut.Name, text);
      if (!score || !shortcut.Path) continue;
      results.push({
        id: `lnk:${shortcut.Path.toLowerCase()}`,
        providerId: this.id,
        kind: "app",
        title: shortcut.Name,
        subtitle: shortcut.Target ? basename(shortcut.Target) : "Start Menu shortcut",
        path: shortcut.Path,
        icon: await context.readIcon(shortcut.Path, "app"),
        score,
      });
    }

    for (const uwp of uwpApps) {
      if (context.signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
      const score = scoreMatch(uwp.Name, text);
      if (!score || !uwp.AppID) continue;
      results.push({
        id: `uwp:${uwp.AppID}`,
        providerId: this.id,
        kind: "app",
        title: uwp.Name,
        subtitle: "Windows app",
        uri: `shell:AppsFolder\\${uwp.AppID}`,
        score: score - 0.02,
      });
    }

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, context.limit);
  }
}
