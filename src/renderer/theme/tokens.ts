export type ThemeName = "light" | "dark" | "high-contrast";

export interface ThemeTokens {
  panelBackground: string;
  panelFallbackBackground: string;
  searchBackground: string;
  text: string;
  mutedText: string;
  accent: string;
  sectionText: string;
  referenceOuterWidth: string;
  referenceOuterHeight: string;
  referenceMinWidth: string;
  referenceMinHeight: string;
  panelWidth: string;
  panelHeight: string;
  panelInset: string;
  panelRadius: string;
  contentMargin: string;
  searchHeight: string;
  searchRadius: string;
  searchPaddingX: string;
  searchIconColumn: string;
  searchFontSize: string;
  searchFontWeight: string;
  sectionFontWeight: string;
  resultsPreviewGap: string;
  previewWidth: string;
  previewPadding: string;
  rowMarginY: string;
  rowPaddingX: string;
  rowPaddingY: string;
  rowRadius: string;
  resultGap: string;
  resultIconSize: string;
  resultIconRadius: string;
  resultTitleSize: string;
  resultTitleWeight: string;
  resultSubtitleSize: string;
  resultSubtitleWeight: string;
  resultCategorySize: string;
  resultCategoryWeight: string;
  previewIconSize: string;
  previewIconRadius: string;
  previewTitleSize: string;
  previewTitleWeight: string;
  previewBodySize: string;
  previewBodyWeight: string;
  selectedRow: string;
  hoverRow: string;
  shadowBlur: string;
  shadowDepth: string;
  shadowOpacity: string;
  animationOpenDuration: string;
  animationCloseDuration: string;
  animationEasing: string;
}

export const lightTokens: ThemeTokens = {
  panelBackground: "rgba(242, 245, 247, 0.92)",
  panelFallbackBackground: "#F2F5F5F7",
  searchBackground: "rgba(255, 255, 255, 0.87)",
  text: "#1D1D1F",
  mutedText: "rgba(0, 0, 0, 0.60)",
  accent: "#007AFF",
  sectionText: "rgba(0, 0, 0, 0.60)",
  referenceOuterWidth: "760px",
  referenceOuterHeight: "500px",
  referenceMinWidth: "560px",
  referenceMinHeight: "360px",
  panelWidth: "680px",
  panelHeight: "180px",
  panelInset: "14px",
  panelRadius: "16px",
  contentMargin: "12px",
  searchHeight: "56px",
  searchRadius: "10px",
  searchPaddingX: "12px",
  searchIconColumn: "32px",
  searchFontSize: "24px",
  searchFontWeight: "300",
  sectionFontWeight: "600",
  resultsPreviewGap: "12px",
  previewWidth: "250px",
  previewPadding: "16px",
  rowMarginY: "2px",
  rowPaddingX: "10px",
  rowPaddingY: "7px",
  rowRadius: "8px",
  resultGap: "10px",
  resultIconSize: "24px",
  resultIconRadius: "5px",
  resultTitleSize: "13px",
  resultTitleWeight: "400",
  resultSubtitleSize: "11px",
  resultSubtitleWeight: "400",
  resultCategorySize: "10px",
  resultCategoryWeight: "400",
  previewIconSize: "56px",
  previewIconRadius: "12px",
  previewTitleSize: "16px",
  previewTitleWeight: "600",
  previewBodySize: "11px",
  previewBodyWeight: "400",
  selectedRow: "#007AFF",
  hoverRow: "rgba(0, 122, 255, 0.13)",
  shadowBlur: "50px",
  shadowDepth: "20px",
  shadowOpacity: "0.35",
  animationOpenDuration: "120ms",
  animationCloseDuration: "80ms",
  animationEasing: "cubic-bezier(0.2, 0, 0, 1)",
};

export const darkTokens: ThemeTokens = {
  ...lightTokens,
  panelBackground: "rgba(38, 38, 42, 0.94)",
  panelFallbackBackground: "#26262A",
  searchBackground: "rgba(70, 70, 76, 0.88)",
  text: "#F5F5F7",
  mutedText: "rgba(255, 255, 255, 0.64)",
  sectionText: "rgba(255, 255, 255, 0.64)",
  selectedRow: "#0A84FF",
  hoverRow: "rgba(10, 132, 255, 0.13)",
};

export const highContrastTokens: ThemeTokens = {
  ...darkTokens,
  panelBackground: "#000000",
  panelFallbackBackground: "#000000",
  searchBackground: "#000000",
  text: "#FFFFFF",
  mutedText: "#FFFFFF",
  accent: "#FFFF00",
  sectionText: "#FFFFFF",
  selectedRow: "#0000FF",
  hoverRow: "#333333",
  shadowOpacity: "0.8",
};

export function tokensToCssVariables(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `--ql-${kebabCase(name)}: ${value};`)
    .join("\n");
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.cssText = tokensToCssVariables(
    theme === "dark" ? darkTokens : theme === "high-contrast" ? highContrastTokens : lightTokens,
  );
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
