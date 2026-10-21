import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { IndexedFile } from "./system-index";

let executablePromise: Promise<string | undefined> | undefined;

async function findExecutable(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  const candidates = [
    join(process.env.ProgramFiles ?? "", "Everything", "es.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "", "Everything", "es.exe"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue with the next known installation path.
    }
  }
  return new Promise((resolve) => {
    execFile("where.exe", ["es.exe"], { windowsHide: true }, (error, stdout) => {
      resolve(error ? undefined : stdout.trim().split(/\r?\n/)[0] || undefined);
    });
  });
}

async function getExecutable(): Promise<string | undefined> {
  executablePromise ??= findExecutable();
  return executablePromise;
}

export async function searchEverything(text: string, limit: number, signal: AbortSignal): Promise<IndexedFile[] | undefined> {
  const executable = await getExecutable();
  if (!executable) return undefined;
  if (signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
  const child = execFile(executable, ["-n", String(Math.max(1, limit * 8)), "-sort", "path", text.trim()], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const abort = () => child.kill();
  signal.addEventListener("abort", abort, { once: true });
  return new Promise<IndexedFile[]>((resolve, reject) => {
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new DOMException("The search was cancelled.", "AbortError"));
      else if (code !== 0) reject(new Error(`Everything helper exited with code ${code ?? "unknown"}.`));
      else {
        const paths = output.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
        void Promise.all(paths.map(async (path) => {
          try {
            return { path, directory: (await stat(path)).isDirectory() };
          } catch {
            return { path, directory: false };
          }
        })).then(resolve, reject);
      }
    });
  });
}
