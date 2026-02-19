const CTX_T = {
  en: { page: "Send to Tab You Later",      link: "Send Link to Tab You Later",      close: "Save && Close Tab", uncat: "Uncategorized" },
  tr: { page: "Tab you later'a Gönder",     link: "Link'i Tab you later'a Gönder",   close: "Kaydet && Sekmeyi Kapat", uncat: "Kategorisiz" },
  de: { page: "An Tab You Later senden",     link: "Link an Tab You Later senden",    close: "Speichern && Tab schließen", uncat: "Unkategorisiert" },
  fr: { page: "Envoyer à Tab You Later",     link: "Envoyer le lien à Tab You Later", close: "Enregistrer && Fermer l'onglet", uncat: "Non classé" },
  es: { page: "Enviar a Tab You Later",      link: "Enviar enlace a Tab You Later",   close: "Guardar && cerrar pestaña", uncat: "Sin categoría" },
  zh: { page: "发送到 Tab You Later",         link: "将链接发送到 Tab You Later",        close: "保存并关闭标签页", uncat: "未分类" },
  ja: { page: "Tab You Later に送る",        link: "リンクを Tab You Later に送る",     close: "保存してタブを閉じる", uncat: "未分類" }
};

const NOTIF_T = {
  en: { title: "Tab You Later", summary: "You have {n} unread links waiting.", reminder: "Time to read: {title}" },
  tr: { title: "Tab You Later", summary: "{n} okunmamış linkiniz bekliyor.", reminder: "Okuma zamanı: {title}" },
  de: { title: "Tab You Later", summary: "Sie haben {n} ungelesene Links.", reminder: "Zeit zu lesen: {title}" },
  fr: { title: "Tab You Later", summary: "Vous avez {n} liens non lus.", reminder: "À lire : {title}" },
  es: { title: "Tab You Later", summary: "Tienes {n} enlaces sin leer.", reminder: "Hora de leer: {title}" },
  zh: { title: "Tab You Later", summary: "您有 {n} 个未读链接。", reminder: "该阅读了：{title}" },
  ja: { title: "Tab You Later", summary: "未読リンクが{n}件あります。", reminder: "読む時間です：{title}" }
};

const SUPPORTED_LANGS = ["en", "tr", "de", "fr", "es", "zh", "ja"];
const DEFAULT_LANG = "en";

const DEFAULT_SETTINGS = {
  syncEnabled: false,
  autoDelete: false,
  language: null,
  badgeEnabled: true,
  faviconMode: "off",
  autoExpireEnabled: false,
  autoExpireEnabledAt: null,
  autoExpireDays: 30,
  sortBy: "newest",
  categories: [],
  encryptionEnabled: false,
  encryptionSalt: null,
  remindersEnabled: false,
  dailySummaryEnabled: true,
  dailyReminderTime: "20:00"
};

function detectBrowserLang() {
  const code = (navigator.language || "en").split("-")[0].toLowerCase();
  return SUPPORTED_LANGS.includes(code) ? code : DEFAULT_LANG;
}

async function getCurrentLang() {
  const s = await getSettings();
  if (s.language && SUPPORTED_LANGS.includes(s.language)) return s.language;
  return detectBrowserLang();
}

async function getStorageArea() {
  const s = await getSettings();
  return s.syncEnabled ? browser.storage.sync : browser.storage.local;
}

async function getSettings() {
  const { settings } = await browser.storage.local.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!merged.faviconMode && settings && settings.faviconEnabled) {
    merged.faviconMode = "live";
  }
  return merged;
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let _derivedKey = null;

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
}

async function decryptPayload(envelope, key) {
  const iv = new Uint8Array(envelope.iv);
  const data = new Uint8Array(envelope.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function getRawStored() {
  const store = await getStorageArea();
  const d = await store.get("tylItems");
  return d.tylItems;
}

async function getItems() {
  const raw = await getRawStored();
  if (!raw) return [];
  const s = await getSettings();
  if (s.encryptionEnabled && raw.iv) {
    if (!_derivedKey) return [];
    try { return await decryptPayload(raw, _derivedKey); } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

async function saveItems(items) {
  const store = await getStorageArea();
  const s = await getSettings();
  if (s.encryptionEnabled && _derivedKey) {
    const envelope = await encryptPayload(items, _derivedKey);
    await store.set({ tylItems: envelope });
  } else {
    await store.set({ tylItems: items });
  }
  await updateBadge(items.length);
}

async function updateBadge(count) {
  const s = await getSettings();
  if (s.badgeEnabled && count > 0) {
    browser.browserAction.setBadgeText({ text: String(count) });
    browser.browserAction.setBadgeBackgroundColor({ color: "#5b5b66" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

function flashBadge(text, color) {
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
  setTimeout(async () => { const i = await getItems(); await updateBadge(i.length); }, 1500);
}

async function resolveFavicon(tab, mode) {
  if (mode === "off") return "";
  const url = tab.favIconUrl || "";
  if (mode === "live") return url;
  if (mode === "cached" && url) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const buf = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return `data:${blob.type || "image/x-icon"};base64,${b64}`;
    } catch { return url; }
  }
  return url;
}

async function addItem(title, url, categoryId, favIconUrl) {
  const items = await getItems();
  if (items.some((i) => i.url === url)) { flashBadge("!", "#e27900"); return; }

  items.unshift({
    id: uuidv4(),
    title: title || url,
    url,
    createdAt: Date.now(),
    category: categoryId || null,
    favIconUrl: favIconUrl || "",
    pinned: false,
    reminderAt: null,
    note: null
  });

  await saveItems(items);
  flashBadge("✓", "#058b00");
}

const undoBuffer = new Map();

function storeUndo(items) {
  const token = uuidv4();
  undoBuffer.set(token, items);
  setTimeout(() => undoBuffer.delete(token), 5000);
  return token;
}

const ALARM_DAILY = "tyl-daily-summary";
const ALARM_ITEM_PREFIX = "tyl-item-reminder-";

async function hasNotificationPermission() {
  try { return await browser.permissions.contains({ permissions: ["notifications"] }); } catch { return false; }
}

async function initReminderAlarms() {
  const s = await getSettings();
  const hasPerm = await hasNotificationPermission();
  if (hasPerm) ensureNotifClickListener();

  if (s.remindersEnabled && s.dailySummaryEnabled && hasPerm) {
    scheduleDailySummaryAlarm(s.dailyReminderTime);
  } else {
    browser.alarms.clear(ALARM_DAILY);
  }

  if (s.remindersEnabled && hasPerm) {
    const items = await getItems();
    await syncItemReminderAlarms(items);
  }
}

function scheduleDailySummaryAlarm(timeHHMM) {
  const [h, m] = (timeHHMM || "20:00").split(":").map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delayMs = target.getTime() - now.getTime();
  browser.alarms.create(ALARM_DAILY, { delayInMinutes: delayMs / 60000, periodInMinutes: 1440 });
}

async function syncItemReminderAlarms(items) {
  const allAlarms = await browser.alarms.getAll();
  const existingIds = new Set(allAlarms.filter((a) => a.name.startsWith(ALARM_ITEM_PREFIX)).map((a) => a.name.replace(ALARM_ITEM_PREFIX, "")));
  const itemIds = new Set(items.filter((i) => i.reminderAt && i.reminderAt > Date.now()).map((i) => i.id));

  for (const id of existingIds) {
    if (!itemIds.has(id)) browser.alarms.clear(ALARM_ITEM_PREFIX + id);
  }
  for (const item of items) {
    if (item.reminderAt && item.reminderAt > Date.now() && !existingIds.has(item.id)) {
      browser.alarms.create(ALARM_ITEM_PREFIX + item.id, { when: item.reminderAt });
    }
  }
}

const notifItemMap = new Map();

async function showDailySummaryNotification() {
  if (typeof browser.notifications === "undefined") return;
  const hasPerm = await hasNotificationPermission();
  if (!hasPerm) return;
  const items = await getItems();
  if (items.length === 0) return;
  const lang = await getCurrentLang();
  const t = NOTIF_T[lang] || NOTIF_T[DEFAULT_LANG];
  browser.notifications.create("tyl-daily-summary", {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: t.title,
    message: t.summary.replace("{n}", items.length)
  });
}

async function showItemReminderNotification(itemId) {
  if (typeof browser.notifications === "undefined") return;
  const hasPerm = await hasNotificationPermission();
  if (!hasPerm) return;
  const items = await getItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  const lang = await getCurrentLang();
  const t = NOTIF_T[lang] || NOTIF_T[DEFAULT_LANG];
  const nId = "tyl-reminder-" + itemId;
  notifItemMap.set(nId, item);
  browser.notifications.create(nId, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: t.title,
    message: t.reminder.replace("{title}", item.title)
  });
  item.reminderAt = null;
  await saveItems(items);
}

let _notifListenerRegistered = false;

function ensureNotifClickListener() {
  if (_notifListenerRegistered || typeof browser.notifications === "undefined") return;
  _notifListenerRegistered = true;
  browser.notifications.onClicked.addListener((nId) => {
    if (nId === "tyl-daily-summary") {
      browser.browserAction.openPopup();
    } else if (nId.startsWith("tyl-reminder-")) {
      const item = notifItemMap.get(nId);
      if (item) { browser.tabs.create({ url: item.url }); notifItemMap.delete(nId); }
    }
    browser.notifications.clear(nId);
  });
}

ensureNotifClickListener();

async function setupContextMenus() {
  await browser.contextMenus.removeAll();
  const lang = await getCurrentLang();
  const t = CTX_T[lang] || CTX_T[DEFAULT_LANG];
  const s = await getSettings();
  const cats = s.categories || [];

  browser.contextMenus.create({ id: "tyl-save-close", title: t.close, contexts: ["page"] });

  if (cats.length === 0) {
    browser.contextMenus.create({ id: "tyl-save-page", title: t.page, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-link", title: t.link, contexts: ["link"] });
  } else {
    browser.contextMenus.create({ id: "tyl-page-parent", title: t.page, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-page", parentId: "tyl-page-parent", title: t.uncat, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-page-sep", parentId: "tyl-page-parent", type: "separator", contexts: ["page"] });
    cats.forEach((c) => browser.contextMenus.create({ id: `tyl-save-page-cat-${c.id}`, parentId: "tyl-page-parent", title: c.name, contexts: ["page"] }));

    browser.contextMenus.create({ id: "tyl-link-parent", title: t.link, contexts: ["link"] });
    browser.contextMenus.create({ id: "tyl-save-link", parentId: "tyl-link-parent", title: t.uncat, contexts: ["link"] });
    browser.contextMenus.create({ id: "tyl-link-sep", parentId: "tyl-link-parent", type: "separator", contexts: ["link"] });
    cats.forEach((c) => browser.contextMenus.create({ id: `tyl-save-link-cat-${c.id}`, parentId: "tyl-link-parent", title: c.name, contexts: ["link"] }));
  }
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await getSettings();
  const fav = await resolveFavicon(tab, s.faviconMode);
  const mid = info.menuItemId;

  if (mid === "tyl-save-close") {
    await addItem(tab.title, tab.url, null, fav);
    browser.tabs.remove(tab.id);
  } else if (mid === "tyl-save-page") {
    await addItem(tab.title, tab.url, null, fav);
  } else if (mid.startsWith("tyl-save-page-cat-")) {
    await addItem(tab.title, tab.url, mid.replace("tyl-save-page-cat-", ""), fav);
  } else if (mid === "tyl-save-link") {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, null, fav);
  } else if (mid.startsWith("tyl-save-link-cat-")) {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, mid.replace("tyl-save-link-cat-", ""), fav);
  }
});

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { settings } = await browser.storage.local.get("settings");
    if (!settings) browser.tabs.create({ url: browser.runtime.getURL("onboarding/onboarding.html") });
  }
  await setupContextMenus();
  await initAutoExpireAlarm();
  await initReminderAlarms();
});

async function initAutoExpireAlarm() {
  const s = await getSettings();
  if (s.autoExpireEnabled) browser.alarms.create("tyl-auto-expire", { periodInMinutes: 60 });
  else browser.alarms.clear("tyl-auto-expire");
}

async function runAutoExpire() {
  const s = await getSettings();
  if (!s.autoExpireEnabled || !s.autoExpireEnabledAt) return;
  const items = await getItems();
  const cutoff = Date.now() - s.autoExpireDays * 86400000;
  const filtered = items.filter((i) => i.createdAt < s.autoExpireEnabledAt || i.createdAt > cutoff);
  if (filtered.length !== items.length) await saveItems(filtered);
}

browser.alarms.onAlarm.addListener((a) => {
  if (a.name === "tyl-auto-expire") { runAutoExpire(); }
  else if (a.name === ALARM_DAILY) { showDailySummaryNotification(); }
  else if (a.name.startsWith(ALARM_ITEM_PREFIX)) { showItemReminderNotification(a.name.replace(ALARM_ITEM_PREFIX, "")); }
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    switch (msg.action) {

      case "getItems":
        return { items: await getItems() };

      case "getSettings":
        return { settings: await getSettings() };

      case "getLang":
        return { lang: await getCurrentLang() };

      case "saveSettings": {
        await migrateStorage(msg.settings);
        await setupContextMenus();
        await initAutoExpireAlarm();
        await initReminderAlarms();
        const cur = await getItems();
        await updateBadge(cur.length);
        return { success: true };
      }

      case "saveAndCloseCurrentTab": {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return { success: false };
        const tab = tabs[0];
        const s = await getSettings();
        const fav = await resolveFavicon(tab, s.faviconMode);
        await addItem(tab.title, tab.url, msg.categoryId || null, fav);
        browser.tabs.remove(tab.id);
        return { success: true };
      }

      case "softDeleteItem": {
        const items = await getItems();
        const removed = items.filter((i) => i.id === msg.id);
        const remaining = items.filter((i) => i.id !== msg.id);
        await saveItems(remaining);
        if (removed[0] && removed[0].reminderAt) browser.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        const token = storeUndo(removed);
        return { success: true, token };
      }

      case "softDeleteItems": {
        const items = await getItems();
        const ids = new Set(msg.ids);
        const removed = items.filter((i) => ids.has(i.id));
        const remaining = items.filter((i) => !ids.has(i.id));
        await saveItems(remaining);
        for (const r of removed) { if (r.reminderAt) browser.alarms.clear(ALARM_ITEM_PREFIX + r.id); }
        const token = storeUndo(removed);
        return { success: true, token };
      }

      case "undoDelete": {
        const restored = undoBuffer.get(msg.token);
        if (!restored) return { success: false };
        undoBuffer.delete(msg.token);
        const items = await getItems();
        items.unshift(...restored);
        await saveItems(items);
        const s = await getSettings();
        if (s.remindersEnabled) await syncItemReminderAlarms(items);
        return { success: true, count: restored.length };
      }

      case "deleteItem": {
        const items = await getItems();
        const del = items.find((i) => i.id === msg.id);
        if (del && del.reminderAt) browser.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        await saveItems(items.filter((i) => i.id !== msg.id));
        return { success: true };
      }

      case "deleteItems": {
        const items = await getItems();
        const ids = new Set(msg.ids);
        items.filter((i) => ids.has(i.id) && i.reminderAt).forEach((i) => browser.alarms.clear(ALARM_ITEM_PREFIX + i.id));
        await saveItems(items.filter((i) => !ids.has(i.id)));
        return { success: true };
      }

      case "updateItemPinned": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (item) { item.pinned = msg.pinned; await saveItems(items); }
        return { success: true };
      }

      case "updateItemCategory": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (item) { item.category = msg.categoryId; await saveItems(items); }
        return { success: true };
      }

      case "updateItemNote": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (item) { item.note = msg.note; await saveItems(items); }
        return { success: true };
      }

      case "reorderItems":
        await saveItems(msg.items);
        return { success: true };

      case "openAndDelete": {
        await browser.tabs.create({ url: msg.url });
        const s = await getSettings();
        if (s.autoDelete) { const items = await getItems(); await saveItems(items.filter((i) => i.id !== msg.id)); }
        return { success: true };
      }

      case "openItems": {
        for (const u of msg.urls) await browser.tabs.create({ url: u });
        const s = await getSettings();
        if (s.autoDelete) { const items = await getItems(); const us = new Set(msg.urls); await saveItems(items.filter((i) => !us.has(i.url))); }
        return { success: true };
      }

      case "saveAllTabs": {
        const s = await getSettings();
        const tabs = await browser.tabs.query({ currentWindow: true });
        const items = await getItems();
        const existing = new Set(items.map((i) => i.url));
        let added = 0;
        for (const tab of tabs) {
          if (tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;
          if (existing.has(tab.url)) continue;
          const fav = await resolveFavicon(tab, s.faviconMode);
          items.unshift({ id: uuidv4(), title: tab.title || tab.url, url: tab.url, createdAt: Date.now(), category: msg.categoryId || null, favIconUrl: fav, pinned: false, reminderAt: null, note: null });
          added++;
        }
        if (added > 0) await saveItems(items);
        flashBadge("✓", "#058b00");
        return { success: true, added };
      }

      case "importItems": {
        const items = await getItems();
        const existing = new Set(items.map((i) => i.url));
        let imported = 0;
        for (const e of msg.entries) {
          if (!e.url || existing.has(e.url)) continue;
          items.push({ id: uuidv4(), title: e.title || e.url, url: e.url, createdAt: e.createdAt || Date.now(), category: e.category || null, favIconUrl: e.favIconUrl || "", pinned: e.pinned || false, reminderAt: null, note: e.note || null });
          imported++;
        }
        if (imported > 0) await saveItems(items);
        return { success: true, imported };
      }

      case "exportItems":
        return { items: await getItems(), settings: await getSettings() };

      
      case "unlockEncryption": {
        const s = await getSettings();
        if (!s.encryptionEnabled || !s.encryptionSalt) return { success: false, error: "not_enabled" };
        try {
          const salt = new Uint8Array(s.encryptionSalt);
          _derivedKey = await deriveKey(msg.passphrase, salt);
          const items = await getItems();
          if (!Array.isArray(items)) { _derivedKey = null; return { success: false, error: "wrong_passphrase" }; }
          return { success: true };
        } catch { _derivedKey = null; return { success: false, error: "wrong_passphrase" }; }
      }

      case "enableEncryption": {
        const items = await getItems();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        _derivedKey = await deriveKey(msg.passphrase, salt);
        const s = await getSettings();
        s.encryptionEnabled = true;
        s.encryptionSalt = Array.from(salt);
        await browser.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...s } });
        await saveItems(items);
        return { success: true };
      }

      case "disableEncryption": {
        const s = await getSettings();
        if (!_derivedKey) {
          try { const salt = new Uint8Array(s.encryptionSalt); _derivedKey = await deriveKey(msg.passphrase, salt); }
          catch { return { success: false, error: "wrong_passphrase" }; }
        }
        const items = await getItems();
        s.encryptionEnabled = false;
        s.encryptionSalt = null;
        _derivedKey = null;
        await browser.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...s } });
        const store = await getStorageArea();
        await store.set({ tylItems: items });
        await updateBadge(items.length);
        return { success: true };
      }

      case "isEncryptionUnlocked":
        return { unlocked: _derivedKey !== null };

      
      case "setItemReminder": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (!item) return { success: false };
        item.reminderAt = msg.reminderAt;
        await saveItems(items);
        if (msg.reminderAt && msg.reminderAt > Date.now()) {
          browser.alarms.create(ALARM_ITEM_PREFIX + msg.id, { when: msg.reminderAt });
        } else {
          browser.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        }
        return { success: true };
      }

      case "clearItemReminder": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (item) { item.reminderAt = null; await saveItems(items); }
        browser.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        return { success: true };
      }

      case "hasNotificationPermission":
        return { granted: await hasNotificationPermission() };

      default:
        return {};
    }
  };
  handle().then(sendResponse);
  return true;
});

async function migrateStorage(newSettings) {
  const oldSettings = await getSettings();
  const items = await getItems();
  const merged = { ...DEFAULT_SETTINGS, ...newSettings };
  delete merged.faviconEnabled;
  await browser.storage.local.set({ settings: merged });

  if (oldSettings.syncEnabled !== merged.syncEnabled) {
    if (merged.syncEnabled) {
      if (merged.encryptionEnabled && _derivedKey) {
        const envelope = await encryptPayload(items, _derivedKey);
        await browser.storage.sync.set({ tylItems: envelope });
      } else {
        await browser.storage.sync.set({ tylItems: items });
      }
      await browser.storage.local.remove("tylItems");
    } else {
      const syncData = await browser.storage.sync.get("tylItems");
      await browser.storage.local.set({ tylItems: syncData.tylItems || [] });
      await browser.storage.sync.remove("tylItems");
    }
  }
}

(async () => {
  await setupContextMenus();
  await initAutoExpireAlarm();
  await initReminderAlarms();
  const items = await getItems();
  await updateBadge(items.length);
})();
