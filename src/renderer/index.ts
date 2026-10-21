import { applyTheme } from "./theme/tokens";
import { LauncherResult, SearchError, SearchSection } from "../shared/ipc";

type ResultSection = { id: string; title: string; results: LauncherResult[]; expanded: boolean };

const searchInput = document.querySelector<HTMLInputElement>("#search-input");
const resultsList = document.querySelector<HTMLDivElement>("#results-list");
const previewPane = document.querySelector<HTMLElement>("#preview-pane");
if (!searchInput || !resultsList || !previewPane) throw new Error("QuickLaunch renderer elements are missing.");

const SECTION_CAP = 4;
let sections: ResultSection[] = [];
let visibleResults: LauncherResult[] = [];
let selectedIndex = 0;
let hoveredIndex: number | null = null;
let scrollbarTimer: number | undefined;
let activeQueryId = "";
let querySequence = 0;
const iconData = new Map<string, string>();
const iconRequests = new Set<string>();

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] ?? character));
}

function iconReference(result: LauncherResult): NonNullable<LauncherResult["icon"]> | undefined {
  return result.preview?.image ?? result.icon;
}

function requestIcon(icon: NonNullable<LauncherResult["icon"]>): void {
  if (iconData.has(icon.cacheKey) || iconRequests.has(icon.cacheKey)) return;
  iconRequests.add(icon.cacheKey);
  void window.quickLaunch.readIcon(icon).then((data) => {
    iconRequests.delete(icon.cacheKey);
    if (data) {
      iconData.set(icon.cacheKey, data);
      render();
    }
  }).catch(() => {
    iconRequests.delete(icon.cacheKey);
  });
}

function iconMarkup(result: LauncherResult): string {
  const icon = iconReference(result);
  const cached = icon ? iconData.get(icon.cacheKey) : undefined;
  if (icon) requestIcon(icon);
  if (cached) return `<img src="${cached}" alt="" />`;
  return result.kind === "folder" ? "F" : result.kind === "file" ? "D" : result.title.slice(0, 1).toUpperCase();
}

function kindLabel(kind: LauncherResult["kind"]): string {
  return kind === "app" ? "Application" : kind[0].toUpperCase() + kind.slice(1);
}

function metadataLines(result: LauncherResult): Array<{ label?: string; value: string }> {
  if (result.preview?.lines.length) return result.preview.lines;
  const lines: Array<{ label: string; value: string }> = [{ label: "Type", value: kindLabel(result.kind) }];
  if (result.subtitle && result.subtitle !== result.title) lines.push({ label: "Details", value: result.subtitle });
  if (result.path) lines.push({ label: "Location", value: result.path });
  else if (result.uri) lines.push({ label: "Open with", value: result.uri });
  return lines;
}

function renderPreview(result: LauncherResult | undefined): void {
  if (!result) {
    previewPane.innerHTML = `<div class="preview-empty"><span class="preview-empty-icon" aria-hidden="true">↗</span><span>Select a result to preview it</span></div>`;
    return;
  }
  const lines = metadataLines(result)
    .map(({ label, value }) => `<div class="preview-line"><span class="preview-label">${label ? `${escapeHtml(label)}:` : ""}</span><span class="preview-value">${escapeHtml(value)}</span></div>`)
    .join("");
  previewPane.innerHTML = `<div class="preview-content">
    <div class="preview-icon result-icon-${result.kind}" aria-hidden="true">${iconMarkup(result)}</div>
    <h2 class="preview-title">${escapeHtml(result.preview?.title ?? result.title)}</h2>
    <span class="preview-kind">${escapeHtml(kindLabel(result.kind))}</span>
    ${lines ? `<div class="preview-metadata">${lines}</div>` : ""}
    ${result.preview ? "" : `<p class="preview-unavailable">No additional preview available.</p>`}
  </div>`;
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
      return `<div id="result-${CSS.escape(result.id)}" class="result-row${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}" role="option" aria-selected="${selected}" data-index="${flatIndex}" tabindex="-1">
        <span class="result-icon result-icon-${result.kind}" aria-hidden="true">${iconMarkup(result)}</span>
        <span class="result-copy"><span class="result-title">${escapeHtml(result.title)}</span><span class="result-subtitle">${escapeHtml(result.subtitle ?? result.path ?? "")}</span></span>
        <span class="result-meta">${escapeHtml(kindLabel(result.kind))}</span>
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
  renderPreview(selected);
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
