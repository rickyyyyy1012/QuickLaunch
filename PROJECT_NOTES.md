# QuickLaunch orientation notes

## Current architecture

- The current branch is a clean slate containing only `README.md`.
- No project file, solution, runtime entry point, renderer, provider, test, or dependency manifest exists.
- The last implementation was a single WPF/.NET Framework 4.7.2 executable.
- Its `App` created one `MainWindow`; the window owned hotkey, tray, search, launch, and preview state.
- Search data was an in-memory collection of built-ins plus Start Menu `.lnk` files.
- It used native Win32 hotkey registration, not Electron `globalShortcut`.
- It used WPF transparency and a custom drop shadow rather than Windows native material.
- Historical behavior worth preserving: tray residency, keyboard-first launch, Start Menu discovery, calculator, and web fallback.
- No automated tests or design-reference assets are present.

## Keep / refactor / delete

### Keep

- Windows desktop launcher behavior and keyboard-first interaction.
- Start Menu application discovery and shell-based launching.
- Tray residency, hide-on-blur, Escape handling, and failure feedback.
- Small, dependency-conscious provider implementations where a supported API exists.

### Refactor

- Move from the deleted WPF monolith to an Electron main/preload/renderer split.
- Replace Win32 hotkey registration with configurable `globalShortcut`; default to Alt+Space.
- Replace the transparent WPF shell with Electron 33+ acrylic material and a Windows 10 fallback.
- Make providers async, cancellable, debounced around 40 ms, and streaming by section.
- Replace the flat result model with typed grouped results, stable ranking, and preview metadata.
- Add persistence, icon caching, settings, accessibility, theme tokens, and performance instrumentation.

### Delete

- Hard-coded Ctrl+Space behavior; Win+Space is reserved by Windows.
- WPF XAML, code-behind ownership of search, and `DataTable.Compute` calculator evaluation.
- Fake or silently incomplete contacts/calendar integrations.
- Any assumption that CSS `backdrop-filter` blurs the desktop behind a transparent Electron window.

## Proposed folder structure

```text
QuickLaunch/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── window-shell.ts
│   │   ├── hotkey-manager.ts
│   │   ├── display-placement.ts
│   │   ├── providers/
│   │   ├── system/
│   │   └── persistence/
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   ├── renderer/
│   │   ├── index.html
│   │   ├── app/
│   │   ├── components/
│   │   ├── theme/
│   │   └── styles/
│   └── shared/
│       ├── ipc.ts
│       ├── providers.ts
│       ├── results.ts
│       ├── settings.ts
│       └── system.ts
├── tests/
│   ├── main/
│   ├── providers/
│   └── renderer/
├── design-reference/
└── .github/workflows/build-windows.yml
```

## Main / preload / renderer IPC contract (types only)

```ts
// src/shared/ipc.ts
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

export interface HotkeySettings {
  accelerator: string; // default: "Alt+Space"
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
```

The preload exposes a narrow, context-isolated API backed by these channels;
renderer code never receives Node.js or Electron primitives directly.

## Milestone plan

1. **M1 — Theme tokens + window shell:** acrylic material, solid fallback for Windows 10 or disabled transparency effects, frameless always-on-top screen-saver-level window, cursor-display placement, pre-warm, configurable Alt+Space hotkey, show/hide animation, hide on blur and Escape.
2. **M2 — Search field + results list:** fake data first, Spotlight-style grouping, selected-row styling, complete keyboard navigation, and deterministic empty/loading/error states.
3. **M3 — Provider framework:** async providers, cancellation, approximately 40 ms debounce, streaming sections; then Apps, Files, and Folders on real data. Apps use Start Menu `.lnk` plus `Get-StartApps`, with `app.getFileIcon` caching.
4. **M4 — Actions and enrichment:** safe calculator parser, offline unit conversion, cached currency API with offline fallback, cached dictionary API, curated `ms-settings:` results, confirmed system actions, and web-search fallback.
5. **M5 — Preview pane:** icons, thumbnails, metadata formatting, selection synchronization, and graceful missing-preview behavior.
6. **M6 — Indexer + persistence:** Windows Search `SystemIndex` OLE DB helper first, optional Everything backend, incremental fallback index last, cache persistence, cancellation, and latency measurement.
7. **M7 — Preferences window:** hotkey conflict detection and clear errors, provider enable/order, scopes, appearance, and persisted settings.
8. **M8 — Accessibility and themes:** keyboard/screen-reader semantics, dark/light/high-contrast themes, reduced motion, and contrast validation.
9. **M9 — Visual polish:** screenshot comparison against `design-reference/`, correcting dimensions, typography, states, shadows, and animation timing.
10. **M10 — Distribution:** Windows GitHub Actions build, signed/packaged installer strategy, smoke checks, and release-on-tag workflow.

## Blocking unknowns and risks

- The required `.github/copilot-instructions.md` is absent; implementation must pause if repository-specific rules are later supplied.
- `design-reference/` has no images, so the measurements document contains only a clearly marked historical baseline.
- Electron version, TypeScript framework, UI library, and packaging/signing identity are not established.
- Windows acrylic behavior depends on Windows 11 composition settings; Windows 10 and disabled transparency require an opaque solid-color fallback.
- `globalShortcut` registration can fail because of conflicts; settings must surface the exact failure and retain a usable fallback.
- `SystemIndex` OLE DB access may vary by Windows installation and requires a small helper process with timeouts and cancellation.
- Everything is optional and must be detected without making it a required dependency.
- Currency and dictionary services require network availability, quotas, cache expiry, and privacy decisions.
- Contacts and calendar lack a simple system API; keep them behind an optional provider flag and mark unsupported if Outlook COM or ICS import is not viable.
- Destructive system actions require explicit confirmation and robust error reporting.
- Pixel accuracy cannot be validated until reference images and a target display scale are available.

## M4 implementation notes

- M4 adds calculator, unit conversion, currency, dictionary, Settings, system
  actions, and web fallback providers to the existing async provider manager.
- Calculator uses a small recursive-descent parser; it never evaluates input
  as JavaScript. Unit conversion is offline and supports common length, mass,
  and temperature units.
- Currency uses the no-key Frankfurter API and dictionary lookup uses
  dictionaryapi.dev. Both persist JSON cache files under Electron's user-data
  directory and fall back to stale cache entries when offline.
- Settings are curated `ms-settings:` links. Sleep and lock execute directly;
  restart, shutdown, sign-out, and recycle-bin emptying require an explicit
  confirmation dialog.
- Web search is requested only when the non-web providers return no results.

## M1 implementation notes

- M1 is implemented as a minimal Electron 33+ TypeScript shell; M2 providers
  and results UI are intentionally not started.
- The window is pre-created hidden, frameless, fixed at approximately 680 px
  wide, always-on-top at the `screen-saver` level, excluded from the taskbar,
  and placed on the cursor display at approximately 22% of its work-area top.
- Windows 11 uses Electron's native acrylic material with an opaque fallback
  for Windows 10 or older Windows builds. CSS `backdrop-filter` is not used.
- Alt+Space is registered through `globalShortcut`; registration failure is
  logged explicitly. The renderer clears the query when hiding or pressing Esc.
- `nativeTheme.updated` pushes the active light/dark token set without restart.
- Open/close animation timings are 120/80 ms with the specified cubic-bezier;
  reduced motion skips transitions.
- M1 runtime verification remains dependent on installing npm dependencies and
  a Windows desktop session. No design-reference images exist for screenshot
  comparison, so the comparison must use the provisional measurements.

## M1 verification status

- `git diff --check` passes.
- Runtime verification is blocked in this environment because `node`, `npm`,
  `npx`, `electron`, and `tsc` are not installed or on `PATH`; no executable
  or screenshot could be produced here.
- Consequently, hotkey toggling, click focus, auto-focus, typing, Esc clearing,
  blur hiding, live native-theme switching, and reduced-motion behavior remain
  to be verified on Windows.
- No reference images exist, so there are no image-to-image differences to
  report. The expected visual comparison points are: the 680 px shell versus
  the provisional 760 px historical reference, the 56 px search field, 24 px
  light-weight text, magnifier geometry, 12 px content inset, 16 px panel
  radius, and the acrylic/opaque fallback appearance.

## M2 implementation notes

- The renderer now uses deterministic fake grouped results with Top Hit first
  and selected by default. Sections use capped result counts with a Show all
  action.
- Result rows are 40 px tall with 20 px icons, 13 px titles, 11 px secondary
  text, right-aligned metadata, accent selection, hover highlighting, and a
  hidden scrollbar.
- Arrow keys, Tab section navigation, Enter, Ctrl+Enter, Ctrl+C, Escape, mouse
  hover, and click are wired. Open/reveal/copy currently log to the renderer
  console for the fake-data milestone.
- Search uses combobox/listbox semantics and updates the active descendant.
  Results render in a bounded scroll viewport, and the shell resizes through
  the preload/main IPC bridge as content changes.

## M3 implementation notes

- Search requests now use a typed main/preload/renderer IPC bridge with a
  roughly 40 ms debounce, query cancellation, provider-scoped errors, and
  streamed provider sections followed by a completion event.
- The application provider discovers Start Menu `.lnk` entries through
  Windows Script Host and UWP entries through `Get-StartApps`. Shortcut icons
  are extracted with `app.getFileIcon`, converted to data URLs, and cached by
  stable path hash. Results execute through shell paths or `shell:AppsFolder`.
- Files and folders are searched from the user's Desktop, Documents,
  Downloads, and the application working directory with bounded asynchronous
  traversal and cancellation checks.
- M3 intentionally does not implement indexing, persistence, settings, or
  other later milestone behavior.

## M3 verification status

- `git diff --check` passes.
- Typecheck/runtime verification could not run in this environment because
  `node`, `npm`, `electron`, and `tsc` are not installed or on `PATH`.

## M5 implementation notes

- The renderer now uses a two-column results layout with a right-side preview
  pane sized from the provisional design tokens.
- The preview follows the selected result immediately for keyboard, mouse, and
  section navigation. It displays the result icon or thumbnail, title, kind,
  and labeled metadata derived from `PreviewModel` or the result's available
  path, URI, and subtitle fields.
- Results without a preview model still show useful fallback metadata and an
  explicit "No additional preview available" state. An empty result set shows
  a neutral selection prompt instead of leaving stale preview content visible.
- Icon reads are shared between list rows and the preview pane, deduplicated
  while pending, and rerender the preview when the cached image arrives.

## M5 verification status

- `git diff --check` passes.
- Typecheck/runtime verification remains blocked in this environment because
  `node`, `npm`, `electron`, and `tsc` are not installed or on `PATH`.

## M6 implementation notes

- Files and folders now query the Windows Search `SystemIndex` through a
  cancellable PowerShell/ADO OLE DB helper first.
- If Windows Search is unavailable, an installed voidtools Everything
  `es.exe` helper is detected opportunistically; it is never a required
  dependency.
- A persisted incremental fallback index scans the existing user roots and is
  used when neither indexed backend is available. Index entries survive
  restarts under the Electron user-data cache directory.
- Icon data URLs are persisted in `icons.json` and reloaded before providers
  request icons. Search provider latency and cancellation state are logged
  with the query id.

## M6 verification status

- `git diff --check` passes.
- Typecheck/runtime verification depends on the Windows/npm toolchain; the
  environment used for this milestone does not expose `node`, `npm`, or
  `tsc` on `PATH`.

## M7 implementation notes

- Preferences is a separate BrowserWindow opened from the tray menu or the
  built-in QuickLaunch Preferences settings result.
- Settings persist as JSON under Electron's user-data directory. The window
  edits the global hotkey, provider enabled/order state, search scopes, and
  appearance theme.
- Hotkey changes unregister the previous accelerator only after the new
  accelerator is validated; conflicts leave the previous hotkey active and
  show an explicit error in Preferences.
- Provider ordering and enabled state are applied to subsequent searches.
  Search scopes gate applications, files, folders, Windows settings, and web
  fallback independently.

## M7 verification status

- `git diff --check` passes.
- Typecheck/build verification is blocked in this environment because `npm`
  and `node` are not installed or on `PATH`.
- No M8 work was started.

## M8 implementation notes

- The launcher uses a complete combobox/listbox relationship: the search field
  exposes the active descendant, result options expose selection and position,
  and visible result counts drive `aria-expanded`.
- Keyboard navigation includes arrows, Home/End, Page Up/Page Down, Tab section
  navigation, Enter, and Escape. Focus-visible styles and concise screen-reader
  instructions are included in both renderer surfaces.
- Theme selection now honors explicit light, dark, and high-contrast settings,
  while system mode follows Windows native dark/light/high-contrast state.
  Forced-colors CSS uses system colors rather than relying on token contrast.
- Reduced motion combines the persisted preference with Electron's native
  `prefersReducedMotion` signal, and CSS disables transitions and animations
  whenever the OS requests reduced motion.

## M8 verification status

- `git diff --check` passes.
- Typecheck/build verification remains blocked in this environment because
  `npm`, `node`, and `tsc` are not available on `PATH`.
