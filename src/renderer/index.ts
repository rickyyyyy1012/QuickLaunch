import { applyTheme, ThemeName } from "./theme/tokens";

declare global {
  interface Window {
    quickLaunch: {
      onOpening(callback: (reducedMotion: boolean) => void): () => void;
      onClosing(callback: (reducedMotion: boolean) => void): () => void;
      onTheme(callback: (theme: ThemeName) => void): () => void;
      hide(): void;
    };
  }
}

const searchInput = document.querySelector<HTMLInputElement>("#search-input");

if (!searchInput) {
  throw new Error("QuickLaunch search input is missing.");
}

function clearAndHide(): void {
  searchInput.value = "";
  window.quickLaunch.hide();
}

function focusSearch(): void {
  searchInput.focus({ preventScroll: true });
  searchInput.select();
}

applyTheme("light");

window.quickLaunch.onTheme((theme) => applyTheme(theme));
window.quickLaunch.onOpening((reducedMotion) => {
  document.body.classList.remove("is-closing");
  if (reducedMotion) {
    document.body.classList.add("is-open");
  } else {
    requestAnimationFrame(() => document.body.classList.add("is-open"));
  }
  focusSearch();
});
window.quickLaunch.onClosing((reducedMotion) => {
  document.body.classList.remove("is-open");
  if (reducedMotion) {
    document.body.classList.add("is-closing");
  } else {
    requestAnimationFrame(() => document.body.classList.add("is-closing"));
  }
  searchInput.value = "";
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    clearAndHide();
  }
});
