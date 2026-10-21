# QuickLaunch implementation notes

## Current architecture

- QuickLaunch is a single WPF desktop application targeting .NET Framework 4.7.2.
- `App` creates and shows one `MainWindow`; there is no navigation framework.
- `MainWindow` owns the global Ctrl+Space hotkey, tray icon, query state, and launch logic.
- Search data is an in-memory list of built-in actions plus Start Menu `.lnk` files.
- Results are exposed through an `ObservableCollection<LauncherItem>` bound to one `ListBox`.
- Launching delegates to Windows shell execution and reports failures in a footer label.
- The window is transparent, borderless, resizable, and currently uses a dark custom panel.
- There are no automated tests, design-reference images, indexing service, or persistence layer.
- The project uses only framework references; no package restore is required.

## Keep, refactor, and delete

- Keep the WPF/.NET Framework stack, tray behavior, Windows shell launching, and Ctrl+Space default.
- Keep the existing built-in actions and Start Menu discovery, expanding their metadata.
- Refactor the single result model into grouped Spotlight-style results with preview metadata.
- Refactor window resources into centralized visual tokens and a translucent light/dark shell.
- Delete the old branded header and dense footer treatment; replace them with a compact search-first palette.
- Do not add heavyweight dependencies or assume a Windows system-wide search index is available.

## Milestone plan

1. Add theme tokens, centered floating shell, close/clear behavior, and Windows build workflow.
2. Add Spotlight search field, grouped result rows, keyboard navigation, and preview pane.
3. Add cancellable/debounced provider orchestration for applications, folders, settings, and actions.
4. Add calculator and web-search fallback providers with graceful offline behavior.
5. Add metadata formatting, accessibility labels, light/dark/high-contrast-friendly resources, and polish.

## Blocking unknowns and deviations

- No `/design-reference/` directory exists, so visual matching uses the supplied written tokens.
- Windows does not expose a uniform built-in Spotlight-style global file index to this app; current file discovery is scoped to Start Menu shortcuts and common folders.
- Currency, contacts, calendar, and dictionary providers require OS services or external APIs not present in this project; they remain documented follow-up work rather than silently fabricated results.
- True Windows vibrancy varies by OS version; the shell uses WPF transparency, backdrop-friendly tinting, and a soft shadow without native composition APIs.

## Verification

- `git diff --check` passes in the development worktree.
- The WPF XAML parses successfully.
- A local executable build could not be run because this environment has neither Visual Studio/MSBuild nor a .NET SDK; the GitHub Actions workflow is the intended Windows build validation.
