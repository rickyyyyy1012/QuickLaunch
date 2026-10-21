export const IPC = {
  shellOpening: "shell:opening",
  shellClosing: "shell:closing",
  shellTheme: "shell:theme",
  shellFocus: "shell:focus",
  hideWindow: "window:hide",
} as const;

export type ShellTheme = "light" | "dark";
