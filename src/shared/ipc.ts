export const IPC = {
  shellOpening: "shell:opening",
  shellClosing: "shell:closing",
  shellTheme: "shell:theme",
  shellFocus: "shell:focus",
  hideWindow: "window:hide",
  resizeWindow: "window:resize",
} as const;

export type ShellTheme = "light" | "dark";
