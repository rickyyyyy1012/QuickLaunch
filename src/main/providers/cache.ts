import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function readCacheFile<T>(name: string): Promise<T | undefined> {
  try {
    const path = join(app.getPath("userData"), "cache", name);
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function readCache<T>(name: string, maxAgeMs: number): Promise<T | undefined> {
  try {
    const path = join(app.getPath("userData"), "cache", name);
    const stat = await import("node:fs/promises").then((fs) => fs.stat(path));
    if (Date.now() - stat.mtimeMs > maxAgeMs) return undefined;
    return readCacheFile<T>(name);
  } catch {
    return undefined;
  }
}

export function readStaleCache<T>(name: string): Promise<T | undefined> {
  return readCacheFile<T>(name);
}

export async function writeCache(name: string, value: unknown): Promise<void> {
  const directory = join(app.getPath("userData"), "cache");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), JSON.stringify(value), "utf8");
}
