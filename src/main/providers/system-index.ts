import { execFile } from "node:child_process";

export interface IndexedFile {
  path: string;
  directory: boolean;
}

const SEARCH_SCRIPT = String.raw`
$connection = New-Object -ComObject ADODB.Connection
$connection.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'")
$command = $connection.CreateCommand()
$command.CommandText = $env:QUICKLAUNCH_SEARCH_SQL
$records = $command.Execute()
$items = @()
while (-not $records.EOF) {
  $path = [string]$records.Fields.Item("System.ItemPathDisplay").Value
  $name = [string]$records.Fields.Item("System.FileName").Value
  $type = [string]$records.Fields.Item("System.ItemTypeText").Value
  if ($path) { $items += [PSCustomObject]@{ Path = $path; Name = $name; Type = $type } }
  $records.MoveNext()
}
$records.Close()
$connection.Close()
$items | ConvertTo-Json -Compress
`;

function parseJson(value: string): IndexedFile[] {
  if (!value.trim()) return [];
  const parsed = JSON.parse(value) as { Path: string; Type?: string } | Array<{ Path: string; Type?: string }>;
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records
    .filter((record) => typeof record.Path === "string" && record.Path.length > 0)
    .map((record) => ({ path: record.Path, directory: record.Type?.toLowerCase().includes("folder") ?? false }));
}

function quoteSql(value: string): string {
  return value.replace(/'/g, "''");
}

function runPowerShell(sql: string, signal: AbortSignal): Promise<string> {
  if (process.platform !== "win32") return Promise.reject(new Error("Windows Search is only available on Windows."));
  if (signal.aborted) return Promise.reject(new DOMException("The search was cancelled.", "AbortError"));
  const child = execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SEARCH_SCRIPT],
    { windowsHide: true, env: { ...process.env, QUICKLAUNCH_SEARCH_SQL: sql }, maxBuffer: 16 * 1024 * 1024 },
  );
  const abort = () => child.kill();
  signal.addEventListener("abort", abort, { once: true });
  return new Promise<string>((resolve, reject) => {
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new DOMException("The search was cancelled.", "AbortError"));
      else if (code === 0) resolve(output);
      else reject(new Error(`Windows Search helper exited with code ${code ?? "unknown"}.`));
    });
  });
}

export async function searchSystemIndex(text: string, limit: number, signal: AbortSignal): Promise<IndexedFile[]> {
  const normalized = text.trim();
  const where = normalized ? ` WHERE CONTAINS(*, '${quoteSql(normalized)}')` : "";
  const sql = `SELECT TOP ${Math.max(1, limit * 8)} System.ItemPathDisplay, System.FileName, System.ItemTypeText FROM SYSTEMINDEX${where}`;
  return parseJson(await runPowerShell(sql, signal));
}
