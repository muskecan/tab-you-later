const TYL_DEFAULT_LANG = "en";

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
