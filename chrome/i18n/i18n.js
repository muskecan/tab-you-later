const TYL_DEFAULT_LANG = "en";
const TYL_THEME_MODES = new Set(["auto", "light", "dark"]);

let tylThemeInitPromise = null;
let tylThemeStorageListenerBound = false;
let tylThemeMediaListenerBound = false;

function tylDetectBrowserLang() {
  const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();
  if (TYL_SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }
  return TYL_DEFAULT_LANG;
}

async function tylGetLang() {
  const { settings } = await chrome.storage.local.get("settings");
  if (settings && settings.language && TYL_SUPPORTED_LANGUAGES[settings.language]) {
    return settings.language;
  }
  return tylDetectBrowserLang();
}

function tylT(key, lang, replacements) {
  const dict = TYL_TRANSLATIONS[lang] || TYL_TRANSLATIONS[TYL_DEFAULT_LANG];
  let str = dict[key] || TYL_TRANSLATIONS[TYL_DEFAULT_LANG][key] || key;

  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      str = str.replace(`{${k}}`, v);
    }
  }

  return str;
}

function tylApplyI18n(lang, root) {
  const container = root || document;

  container.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tylT(el.dataset.i18n, lang);
  });

  container.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = tylT(el.dataset.i18nPlaceholder, lang);
  });

  container.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = tylT(el.dataset.i18nTitle, lang);
  });

  document.documentElement.setAttribute("lang", lang);
}

function tylNormalizeThemeMode(mode) {
  return TYL_THEME_MODES.has(mode) ? mode : "auto";
}

function tylResolveThemeMode(mode) {
  const normalized = tylNormalizeThemeMode(mode);
  if (normalized !== "auto") return normalized;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function tylApplyTheme(mode) {
  const normalized = tylNormalizeThemeMode(mode);
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = tylResolveThemeMode(normalized);
}

async function tylLoadAndApplyTheme() {
  try {
    const { settings } = await chrome.storage.local.get("settings");
    tylApplyTheme((settings && settings.themeMode) || "auto");
  } catch {
    tylApplyTheme("auto");
  }
}

async function tylInitTheme() {
  if (!tylThemeInitPromise) {
    tylThemeInitPromise = tylLoadAndApplyTheme();
  }
  await tylThemeInitPromise;

  if (!tylThemeStorageListenerBound) {
    tylThemeStorageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.settings) return;
      const nextSettings = changes.settings.newValue || {};
      tylApplyTheme(nextSettings.themeMode || "auto");
    });
  }

  if (!tylThemeMediaListenerBound && window.matchMedia) {
    tylThemeMediaListenerBound = true;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (document.documentElement.dataset.theme === "auto") {
        tylApplyTheme("auto");
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(onChange);
    }
  }
}
