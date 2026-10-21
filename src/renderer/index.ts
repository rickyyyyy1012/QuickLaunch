import { applyTheme, ThemeName } from "./theme/tokens";
import { LauncherResult, SearchError, SearchSection } from "../shared/ipc";

declare global {
  interface Window {
    quickLaunch: {
      onOpening(callback: (reducedMotion: boolean) => void): () => void;
      onClosing(callback: (reducedMotion: boolean) => void): () => void;
      onTheme(callback: (theme: ThemeName) => void): () => void;
      startSearch(request: { queryId: string; text: string; limit?: number }): void;
      cancelSearch(request: { queryId: string }): void;
      onSearchSection(callback: (section: SearchSection) => void): () => void;
      onSearchError(callback: (error: SearchError) => void): () => void;
      onSearchComplete(callback: (queryId: string) => void): () => void;
      execute(result: LauncherResult): void;
      readIcon(icon: NonNullable<LauncherResult["icon"]>): Promise<string>;
      hide(): void;
      resize(height: number): void;
    };
  }
}

type ResultSection = { id: string; title: string; results: LauncherResult[]; expanded: boolean };

const searchInput = document.querySelector<HTMLInputElement>("#search-input");
const resultsList = document.querySelector<HTMLDivElement>("#results-list");
if (!searchInput || !resultsList) throw new Error("QuickLaunch renderer elements are missing.");

const SECTION_CAP = 4;
let sections: ResultSection[] = [];
let visibleResults: LauncherResult[] = [];
let selectedIndex = 0;
let hoveredIndex: number | null = null;
let scrollbarTimer: number | undefined;
let activeQueryId = "";
let querySequence = 0;
const iconData = new Map<string, string>();

function clearAndHide(): void {
  if (activeQueryId) window.quickLaunch.cancelSearch({ queryId: activeQueryId });
  searchInput.value = "";
  searchInput.removeAttribute("aria-activedescendant");
  window.quickLaunch.hide();
}

function focusSearch(): void {
  searchInput.focus({ preventScroll: true });
  searchInput.select();
}

function displaySections(): ResultSection[] {
  const query = searchInput.value.trim().toLowerCase();
  return sections
    .map((section) => ({
      ...section,
      results: section.results.filter((result) =>
        `${result.title} ${result.subtitle ?? ""} ${result.path ?? ""}`.toLowerCase().includes(query),
      ),
    }))
    .filter((section) => section.results.length > 0);
}

function iconMarkup(result: LauncherResult): string {
  const cached = result.icon ? iconData.get(result.icon.cacheKey) : undefined;
  if (cached) return `<img src="${cached}" alt="" />`;
  return result.kind === "folder" ? "F" : result.kind === "file" ? "D" : result.title.slice(0, 1).toUpperCase();
}

function render(): void {
  visibleResults = [];
  const markup = displaySections().map((section) => {
    const limited = section.expanded ? section.results : section.results.slice(0, SECTION_CAP);
    const rows = limited.map((result) => {
      const flatIndex = visibleResults.length;
      visibleResults.push(result);
      const selected = flatIndex === selectedIndex;
      const hovered = flatIndex === hoveredIndex;
      if (result.icon && !iconData.has(result.icon.cacheKey)) {
        void window.quickLaunch.readIcon(result.icon).then((data) => {
          if (data) {
            iconData.set(result.icon!.cacheKey, data);
            render();
          }
        });
      }
      return `<div id="result-${CSS.escape(result.id)}" class="result-row${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}" role="option" aria-selected="${selected}" data-index="${flatIndex}" tabindex="-1">
        <span class="result-icon result-icon-${result.kind}" aria-hidden="true">${iconMarkup(result)}</span>
        <span class="result-copy"><span class="result-title">${result.title}</span><span class="result-subtitle">${result.subtitle ?? result.path ?? ""}</span></span>
        <span class="result-meta">${result.kind}</span>
      </div>`;
    }).join("");
    const showAll = !section.expanded && section.results.length > SECTION_CAP
      ? `<button class="show-all" type="button" data-section-id="${section.id}">Show all ${section.results.length}</button>`
      : "";
    return `<div class="result-section"><h2>${section.title}</h2><div class="section-rows">${rows}</div>${showAll}</div>`;
  }).join("");

  if (selectedIndex >= visibleResults.length) selectedIndex = Math.max(0, visibleResults.length - 1);
  resultsList.innerHTML = markup || `<div class="result-section"><h2>No results</h2></div>`;
  const selected = visibleResults[selectedIndex];
  if (selected) searchInput.setAttribute("aria-activedescendant", `result-${CSS.escape(selected.id)}`);
  else searchInput.removeAttribute("aria-activedescendant");
  bindRows();
  window.quickLaunch.resize(Math.min(500, Math.max(180, document.querySelector<HTMLElement>(".panel")?.scrollHeight ?? 180)));
}

function bindRows(): void {
  resultsList.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
    row.addEventListener("mouseenter", () => { hoveredIndex = Number(row.dataset.index); render(); });
    row.addEventListener("mouseleave", () => { hoveredIndex = null; render(); });
    row.addEventListener("click", () => {
      const result = visibleResults[Number(row.dataset.index)];
      if (result) window.quickLaunch.execute(result);
    });
  });
  resultsList.querySelectorAll<HTMLButtonElement>(".show-all").forEach((button) => {
    button.addEventListener("click", () => {
      const section = sections.find((item) => item.id === button.dataset.sectionId);
      if (section) { section.expanded = true; render(); }
    });
  });
}

function startSearch(): void {
  const previous = activeQueryId;
  activeQueryId = `query-${Date.now()}-${++querySequence}`;
  if (previous) window.quickLaunch.cancelSearch({ queryId: previous });
  sections = [];
  selectedIndex = 0;
  render();
  window.quickLaunch.startSearch({ queryId: activeQueryId, text: searchInput.value, limit: 8 });
}

function selectResult(index: number): void {
  selectedIndex = Math.max(0, Math.min(visibleResults.length - 1, index));
  render();
  document.querySelector<HTMLElement>(".result-row.is-selected")?.scrollIntoView({ block: "nearest" });
}

function moveToSection(direction: 1 | -1): void {
  const current = visibleResults[selectedIndex];
  if (!current) return;
  const currentSection = displaySections().findIndex((section) => section.results.some((result) => result.id === current.id));
  const next = displaySections()[currentSection + direction];
  if (!next) return;
  const index = visibleResults.findIndex((result) => result.id === next.results[0].id);
  if (index >= 0) selectResult(index);
}

window.quickLaunch.onSearchSection((section) => {
  if (section.queryId !== activeQueryId) return;
  const existing = sections.find((item) => item.id === section.providerId);
  if (existing) existing.results = section.items;
  else sections.push({ id: section.providerId, title: section.title, results: section.items, expanded: false });
  sections.sort((a, b) => a.id.localeCompare(b.id));
  render();
});
window.quickLaunch.onSearchError((error) => {
  if (error.queryId === activeQueryId) console.error(`[QuickLaunch] ${error.providerId}: ${error.message}`);
});
window.quickLaunch.onSearchComplete((queryId) => {
  if (queryId === activeQueryId) render();
});

applyTheme("light");
render();
window.quickLaunch.onTheme((theme) => applyTheme(theme));
window.quickLaunch.onOpening((reducedMotion) => {
  document.body.classList.remove("is-closing");
  if (reducedMotion) document.body.classList.add("is-open");
  else requestAnimationFrame(() => document.body.classList.add("is-open"));
  focusSearch();
  startSearch();
});
window.quickLaunch.onClosing((reducedMotion) => {
  document.body.classList.remove("is-open");
  if (reducedMotion) document.body.classList.add("is-closing");
  else requestAnimationFrame(() => document.body.classList.add("is-closing"));
  if (activeQueryId) window.quickLaunch.cancelSearch({ queryId: activeQueryId });
  searchInput.value = "";
  sections = [];
  render();
});

searchInput.addEventListener("input", startSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") { event.preventDefault(); selectResult(selectedIndex + 1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); selectResult(selectedIndex - 1); }
  else if (event.key === "Tab") { event.preventDefault(); moveToSection(event.shiftKey ? -1 : 1); }
  else if (event.key === "Enter") {
    event.preventDefault();
    const result = visibleResults[selectedIndex];
    if (result) window.quickLaunch.execute(result);
  } else if (event.key === "Escape") { event.preventDefault(); clearAndHide(); }
});

resultsList.addEventListener("scroll", () => {
  resultsList.classList.add("is-scrolling");
  window.clearTimeout(scrollbarTimer);
  scrollbarTimer = window.setTimeout(() => resultsList.classList.remove("is-scrolling"), 700);
});
