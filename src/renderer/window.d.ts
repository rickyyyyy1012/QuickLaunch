import { AppSettings, LauncherResult, SearchError, SearchSection, ShellTheme } from "../shared/ipc";

interface QuickLaunchApi {
  onOpening(callback: (reducedMotion: boolean) => void): () => void;
  onClosing(callback: (reducedMotion: boolean) => void): () => void;
  onTheme(callback: (theme: ShellTheme) => void): () => void;
  startSearch(request: { queryId: string; text: string; limit?: number }): void;
  cancelSearch(request: { queryId: string }): void;
  onSearchSection(callback: (section: SearchSection) => void): () => void;
  onSearchError(callback: (error: SearchError) => void): () => void;
  onSearchComplete(callback: (queryId: string) => void): () => void;
  execute(result: LauncherResult): void;
  readIcon(icon: NonNullable<LauncherResult["icon"]>): Promise<string>;
  hide(): void;
  resize(height: number): void;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  openPreferences(): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void;
  onHotkeyError(callback: (message: string) => void): () => void;
}

declare global {
  interface Window {
    quickLaunch: QuickLaunchApi;
  }
}

export {};
