export const IPC = {
  shellOpening: "shell:opening",
  shellClosing: "shell:closing",
  shellTheme: "shell:theme",
  shellFocus: "shell:focus",
  hideWindow: "window:hide",
  resizeWindow: "window:resize",
  searchStart: "search:start",
  searchCancel: "search:cancel",
  searchSection: "search:section",
  searchError: "search:error",
  searchComplete: "search:complete",
  resultExecute: "result:execute",
  iconRead: "icon:read",
} as const;

export type ShellTheme = "light" | "dark";

export type QueryId = string;

export interface SearchRequest {
  queryId: QueryId;
  text: string;
  providers?: string[];
  limit?: number;
}

export interface SearchCancelRequest {
  queryId: QueryId;
}

export type ResultKind =
  | "app" | "file" | "folder" | "setting" | "calculator"
  | "unit" | "currency" | "dictionary" | "system" | "web";

export interface IconReference {
  cacheKey: string;
  source: "file" | "app" | "generated";
  mimeType?: string;
}

export interface PreviewModel {
  title: string;
  lines: Array<{ label?: string; value: string }>;
  image?: IconReference;
}

export type ConfirmationKind = "restart" | "shutdown" | "sign-out" | "empty-recycle-bin";

export interface LauncherResult {
  id: string;
  providerId: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  path?: string;
  uri?: string;
  icon?: IconReference;
  score: number;
  preview?: PreviewModel;
  requiresConfirmation?: ConfirmationKind;
}

export interface SearchSection {
  queryId: QueryId;
  providerId: string;
  title: string;
  items: LauncherResult[];
  isFinal: boolean;
}

export interface SearchError {
  queryId: QueryId;
  providerId: string;
  message: string;
  recoverable: boolean;
}

export interface HotkeySettings {
  accelerator: string;
  enabled: boolean;
}

export interface ProviderSettings {
  id: string;
  enabled: boolean;
  order: number;
}

export interface AppSettings {
  hotkey: HotkeySettings;
  providers: ProviderSettings[];
  theme: "system" | "light" | "dark" | "high-contrast";
  reducedMotion: boolean;
}

export interface MainToRenderer {
  "shell:opening": (reducedMotion: boolean) => void;
  "shell:closing": (reducedMotion: boolean) => void;
  "shell:theme": (theme: ShellTheme) => void;
  "search:section": (section: SearchSection) => void;
  "search:error": (error: SearchError) => void;
  "search:complete": (queryId: QueryId) => void;
  "settings:changed": (settings: AppSettings) => void;
  "hotkey:error": (message: string) => void;
}

export interface RendererToMain {
  "window:hide": () => void;
  "window:show": () => void;
  "search:start": (request: SearchRequest) => void;
  "search:cancel": (request: SearchCancelRequest) => void;
  "result:execute": (result: LauncherResult) => void;
  "settings:get": () => Promise<AppSettings>;
  "settings:update": (settings: Partial<AppSettings>) => Promise<AppSettings>;
  "icon:read": (icon: IconReference) => Promise<string>;
}
