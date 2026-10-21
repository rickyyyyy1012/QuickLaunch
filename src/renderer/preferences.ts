import { AppSettings } from "../shared/ipc";

const hotkey = document.querySelector<HTMLInputElement>("#hotkey")!;
const hotkeyEnabled = document.querySelector<HTMLInputElement>("#hotkey-enabled")!;
const hotkeyError = document.querySelector<HTMLElement>("#hotkey-error")!;
const status = document.querySelector<HTMLElement>("#status")!;
const providers = document.querySelector<HTMLElement>("#providers")!;
const theme = document.querySelector<HTMLSelectElement>("#theme")!;
let settings: AppSettings;

const providerTitles: Record<string, string> = {
  apps: "Applications", files: "Files", folders: "Folders", calculator: "Calculator",
  units: "Unit conversion", currency: "Currency", dictionary: "Dictionary",
  settings: "Windows settings", system: "System actions", web: "Web fallback",
};

function showStatus(message: string): void {
  status.textContent = message;
  window.setTimeout(() => { if (status.textContent === message) status.textContent = ""; }, 1800);
}

function render(): void {
  hotkey.value = settings.hotkey.accelerator;
  hotkeyEnabled.checked = settings.hotkey.enabled;
  theme.value = settings.theme;
  providers.innerHTML = settings.providers.map((provider, index) => `
    <div class="provider-row" role="listitem">
      <label class="switch-label"><input data-provider="${provider.id}" type="checkbox" ${provider.enabled ? "checked" : ""} /> <span class="provider-name">${providerTitles[provider.id] ?? provider.id}</span></label>
      <span class="provider-controls">
        <button data-move="${index}" data-direction="-1" type="button" aria-label="Move ${providerTitles[provider.id] ?? provider.id} up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button data-move="${index}" data-direction="1" type="button" aria-label="Move ${providerTitles[provider.id] ?? provider.id} down" ${index === settings.providers.length - 1 ? "disabled" : ""}>↓</button>
      </span>
    </div>`).join("");
  document.querySelectorAll<HTMLInputElement>("[data-scope]").forEach((input) => {
    input.checked = settings.scopes[input.dataset.scope as keyof AppSettings["scopes"]];
  });
}

async function save(patch: Partial<AppSettings>, message = "Saved"): Promise<void> {
  try {
    settings = await window.quickLaunch.updateSettings(patch);
    render();
    showStatus(message);
  } catch (error) {
    hotkeyError.textContent = error instanceof Error ? error.message : "Unable to save settings.";
  }
}

document.querySelector("#save-hotkey")!.addEventListener("click", () => {
  hotkeyError.textContent = "";
  void save({ hotkey: { accelerator: hotkey.value, enabled: hotkeyEnabled.checked } }, "Hotkey saved");
});
hotkeyEnabled.addEventListener("change", () => {
  hotkeyError.textContent = "";
  void save({ hotkey: { accelerator: hotkey.value, enabled: hotkeyEnabled.checked } }, "Hotkey saved");
});
theme.addEventListener("change", () => void save({ theme: theme.value as AppSettings["theme"] }, "Appearance saved"));
document.querySelectorAll<HTMLInputElement>("[data-scope]").forEach((input) => {
  input.addEventListener("change", () => void save({ scopes: { ...settings.scopes, [input.dataset.scope!]: input.checked } }, "Search scopes saved"));
});
providers.addEventListener("change", (event) => {
  const input = (event.target as HTMLInputElement).closest<HTMLInputElement>("input[data-provider]");
  if (!input) return;
  const next = settings.providers.map((provider) => provider.id === input.dataset.provider ? { ...provider, enabled: input.checked } : provider);
  void save({ providers: next }, "Providers saved");
});
providers.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-move]");
  if (!button) return;
  const index = Number(button.dataset.move);
  const direction = Number(button.dataset.direction);
  const target = index + direction;
  if (target < 0 || target >= settings.providers.length) return;
  const next = settings.providers.map((provider) => ({ ...provider }));
  [next[index], next[target]] = [next[target], next[index]];
  next.forEach((provider, order) => { provider.order = order; });
  void save({ providers: next }, "Provider order saved");
});
document.querySelector("#close-button")!.addEventListener("click", () => window.close());
window.quickLaunch.onSettingsChanged((next) => { settings = next; render(); });
window.quickLaunch.onHotkeyError((message) => { hotkeyError.textContent = message; });
window.quickLaunch.onTheme((next) => { document.documentElement.dataset.theme = next; });
void window.quickLaunch.getSettings().then((next) => { settings = next; render(); });
