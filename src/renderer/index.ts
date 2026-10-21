import { applyTheme, ThemeName } from "./theme/tokens";

declare global {
  interface Window {
    quickLaunch: {
      onOpening(callback: (reducedMotion: boolean) => void): () => void;
      onClosing(callback: (reducedMotion: boolean) => void): () => void;
      onTheme(callback: (theme: ThemeName) => void): () => void;
      hide(): void;
      resize(height: number): void;
    };
  }
}

type Result = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  icon: string;
  kind: "app" | "file" | "setting";
};

type ResultSection = {
  id: string;
  title: string;
  results: Result[];
  expanded: boolean;
};

const searchInput = document.querySelector<HTMLInputElement>("#search-input");
const resultsList = document.querySelector<HTMLDivElement>("#results-list");

if (!searchInput || !resultsList) {
  throw new Error("QuickLaunch renderer elements are missing.");
}

const SECTION_CAP = 4;
const sections: ResultSection[] = [
  {
    id: "top-hit",
    title: "Top Hit",
    expanded: true,
    results: [
      { id: "notepad", title: "Notepad", subtitle: "App", meta: "Most relevant", icon: "N", kind: "app" },
      { id: "settings", title: "Windows Settings", subtitle: "System settings", meta: "Settings", icon: "⚙", kind: "setting" },
    ],
  },
  {
    id: "applications",
    title: "Applications",
    expanded: false,
    results: [
      { id: "calculator", title: "Calculator", subtitle: "App", meta: "App", icon: "=", kind: "app" },
      { id: "paint", title: "Paint", subtitle: "App", meta: "App", icon: "P", kind: "app" },
      { id: "terminal", title: "Windows Terminal", subtitle: "App", meta: "App", icon: ">_", kind: "app" },
      { id: "photos", title: "Photos", subtitle: "App", meta: "App", icon: "◉", kind: "app" },
      { id: "clock", title: "Clock", subtitle: "App", meta: "App", icon: "◷", kind: "app" },
    ],
  },
  {
    id: "documents",
    title: "Documents",
    expanded: false,
    results: [
      { id: "project-notes", title: "PROJECT_NOTES.md", subtitle: "QuickLaunch", meta: "Today", icon: "M", kind: "file" },
      { id: "readme", title: "README.md", subtitle: "QuickLaunch", meta: "Yesterday", icon: "R", kind: "file" },
      { id: "measurements", title: "MEASUREMENTS.md", subtitle: "design-reference", meta: "Last week", icon: "D", kind: "file" },
      { id: "package", title: "package.json", subtitle: "QuickLaunch", meta: "Last week", icon: "{ }", kind: "file" },
      { id: "tsconfig", title: "tsconfig.json", subtitle: "QuickLaunch", meta: "Last week", icon: "TS", kind: "file" },
    ],
  },
];

let visibleResults: Array<{ section: ResultSection; result: Result }> = [];
let selectedIndex = 0;
let hoveredIndex: number | null = null;
let scrollbarTimer: number | undefined;

function clearAndHide(): void {
  searchInput.value = "";
  searchInput.removeAttribute("aria-activedescendant");
  window.quickLaunch.hide();
}

function focusSearch(): void {
  searchInput.focus({ preventScroll: true });
  searchInput.select();
}

function getFilteredSections(): ResultSection[] {
  const query = searchInput.value.trim().toLowerCase();
  return sections
    .map((section) => ({
      ...section,
      results: section.results.filter((result) =>
        `${result.title} ${result.subtitle} ${result.meta}`.toLowerCase().includes(query),
      ),
    }))
    .filter((section) => section.results.length > 0);
}

function openResult(result: Result): void {
  console.log("[QuickLaunch] open", result.id, result.title);
}

function revealResult(result: Result): void {
  console.log("[QuickLaunch] reveal", result.id, result.title);
}

function copyResult(result: Result): void {
  void navigator.clipboard?.writeText(result.title);
  console.log("[QuickLaunch] copy", result.id, result.title);
}

function selectResult(index: number): void {
  selectedIndex = Math.max(0, Math.min(visibleResults.length - 1, index));
  const selected = visibleResults[selectedIndex];
  if (selected) {
    searchInput.setAttribute("aria-activedescendant", `result-${selected.result.id}`);
  }
  render();
  document.querySelector<HTMLElement>(".result-row.is-selected")?.scrollIntoView({ block: "nearest" });
}

function render(): void {
  visibleResults = [];
  const markup = getFilteredSections()
    .map((section) => {
      const limitedResults = section.expanded ? section.results : section.results.slice(0, SECTION_CAP);
      const rows = limitedResults.map((result) => {
        const flatIndex = visibleResults.length;
        visibleResults.push({ section, result });
        const selected = flatIndex === selectedIndex;
        const hovered = flatIndex === hoveredIndex;
        return `
          <div id="result-${result.id}" class="result-row${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}"
            role="option" aria-selected="${selected}" data-index="${flatIndex}" tabindex="-1">
            <span class="result-icon result-icon-${result.kind}" aria-hidden="true">${result.icon}</span>
            <span class="result-copy"><span class="result-title">${result.title}</span><span class="result-subtitle">${result.subtitle}</span></span>
            <span class="result-meta">${result.meta}</span>
          </div>`;
      }).join("");
      const showAll = !section.expanded && section.results.length > SECTION_CAP
        ? `<button class="show-all" type="button" data-section-id="${section.id}">Show all ${section.results.length}</button>`
        : "";
      return `<div class="result-section"><h2>${section.title}</h2><div class="section-rows">${rows}</div>${showAll}</div>`;
    })
    .join("");

  if (selectedIndex >= visibleResults.length) {
    selectedIndex = Math.max(0, visibleResults.length - 1);
  }
  resultsList.innerHTML = markup;
  const selected = visibleResults[selectedIndex];
  if (selected) {
    searchInput.setAttribute("aria-activedescendant", `result-${selected.result.id}`);
  }
  bindRows();
  window.quickLaunch.resize(Math.min(500, Math.max(180, document.querySelector<HTMLElement>(".panel")?.scrollHeight ?? 180)));
}

function bindRows(): void {
  resultsList.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
    row.addEventListener("mouseenter", () => {
      hoveredIndex = Number(row.dataset.index);
      render();
    });
    row.addEventListener("mouseleave", () => {
      hoveredIndex = null;
      render();
    });
    row.addEventListener("click", () => {
      const selected = visibleResults[Number(row.dataset.index)];
      if (selected) openResult(selected.result);
    });
  });
  resultsList.querySelectorAll<HTMLButtonElement>(".show-all").forEach((button) => {
    button.addEventListener("click", () => {
      const section = sections.find((item) => item.id === button.dataset.sectionId);
      if (section) {
        section.expanded = true;
        render();
      }
    });
  });
}

function moveToSection(direction: 1 | -1): void {
  const selected = visibleResults[selectedIndex];
  if (!selected) return;
  const filtered = getFilteredSections();
  const current = filtered.findIndex((section) => section.id === selected.section.id);
  const next = filtered[current + direction];
  if (!next) return;
  const nextIndex = visibleResults.findIndex((entry) => entry.section.id === next.id);
  if (nextIndex >= 0) selectResult(nextIndex);
}

applyTheme("light");
render();

window.quickLaunch.onTheme((theme) => applyTheme(theme));
window.quickLaunch.onOpening((reducedMotion) => {
  document.body.classList.remove("is-closing");
  if (reducedMotion) {
    document.body.classList.add("is-open");
  } else {
    requestAnimationFrame(() => document.body.classList.add("is-open"));
  }
  focusSearch();
  render();
});
window.quickLaunch.onClosing((reducedMotion) => {
  document.body.classList.remove("is-open");
  if (reducedMotion) {
    document.body.classList.add("is-closing");
  } else {
    requestAnimationFrame(() => document.body.classList.add("is-closing"));
  }
  searchInput.value = "";
  render();
});

searchInput.addEventListener("input", () => {
  selectedIndex = 0;
  render();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectResult(selectedIndex + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectResult(selectedIndex - 1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    moveToSection(event.shiftKey ? -1 : 1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const selected = visibleResults[selectedIndex];
    if (selected) event.ctrlKey ? revealResult(selected.result) : openResult(selected.result);
  } else if (event.key.toLowerCase() === "c" && event.ctrlKey) {
    event.preventDefault();
    const selected = visibleResults[selectedIndex];
    if (selected) copyResult(selected.result);
  } else if (event.key === "Escape") {
    event.preventDefault();
    clearAndHide();
  }
});

resultsList.addEventListener("scroll", () => {
  resultsList.classList.add("is-scrolling");
  window.clearTimeout(scrollbarTimer);
  scrollbarTimer = window.setTimeout(() => resultsList.classList.remove("is-scrolling"), 700);
});
