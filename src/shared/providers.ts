import { IconReference, LauncherResult, QueryId } from "./ipc";

export interface ProviderContext {
  queryId: QueryId;
  signal: AbortSignal;
  limit: number;
  readIcon(path: string, source?: IconReference["source"]): Promise<IconReference>;
}

export interface Provider {
  id: string;
  title: string;
  search(text: string, context: ProviderContext): Promise<LauncherResult[]>;
}
