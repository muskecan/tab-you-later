const CTX_T = {
  en: { page: "Send to Tab You Later",      link: "Send Link to Tab You Later",      close: "Save && Close Tab", uncat: "Uncategorized", newCat: "Create Category…" },
  tr: { page: "Tab you later'a Gönder",     link: "Link'i Tab you later'a Gönder",   close: "Kaydet && Sekmeyi Kapat", uncat: "Kategorisiz", newCat: "Kategori Oluştur…" },
  de: { page: "An Tab You Later senden",     link: "Link an Tab You Later senden",    close: "Speichern && Tab schließen", uncat: "Unkategorisiert", newCat: "Kategorie erstellen…" },
  fr: { page: "Envoyer à Tab You Later",     link: "Envoyer le lien à Tab You Later", close: "Enregistrer && Fermer l'onglet", uncat: "Non classé", newCat: "Créer une catégorie…" },
  es: { page: "Enviar a Tab You Later",      link: "Enviar enlace a Tab You Later",   close: "Guardar && cerrar pestaña", uncat: "Sin categoría", newCat: "Crear categoría…" },
  zh: { page: "发送到 Tab You Later",         link: "将链接发送到 Tab You Later",        close: "保存并关闭标签页", uncat: "未分类", newCat: "创建分类…" },
  ja: { page: "Tab You Later に送る",        link: "リンクを Tab You Later に送る",     close: "保存してタブを閉じる", uncat: "未分類", newCat: "カテゴリを作成…" }
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
  themeMode: "auto",
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

const SETTINGS_KEY = "settings";
const SYNC_SETTINGS_KEY = "tylSettings";

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

function normalizeSettings(rawSettings) {
  const raw = rawSettings || {};
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  if (!merged.faviconMode && raw && raw.faviconEnabled) {
    merged.faviconMode = "live";
  }
  delete merged.faviconEnabled;
  return merged;
}

function mergeCategories(localCategories, syncCategories) {
  const merged = [];
  const upsert = (cat) => {
    if (!cat || typeof cat !== "object") return;
    const name = String(cat.name || "").trim();
    if (!name) return;
    const normalized = {
      id: cat.id || uuidv4(),
      name,
      color: cat.color || "#5b5b66",
    };
    const existingIndex = merged.findIndex((c) =>
      c.id === normalized.id
      || String(c.name || "").toLowerCase() === normalized.name.toLowerCase());
    if (existingIndex >= 0) merged[existingIndex] = normalized;
    else merged.push(normalized);
  };

  (syncCategories || []).forEach(upsert);
  (localCategories || []).forEach(upsert);
  return merged;
}

function mergeSettingsForSync(localSettings, syncSettings) {
  const local = normalizeSettings(localSettings);
  const sync = normalizeSettings(syncSettings);
  const merged = {
    ...sync,
    ...local,
    syncEnabled: true,
  };
  merged.categories = mergeCategories(local.categories, sync.categories);
  return normalizeSettings(merged);
}

async function getSyncSettingsStrict() {
  try {
    const data = await browser.storage.sync.get(SYNC_SETTINGS_KEY);
    const raw = data[SYNC_SETTINGS_KEY];
    if (!raw || typeof raw !== "object") return null;
    return normalizeSettings(raw);
  } catch (error) {
    throw wrapStoreError("sync", "read", error);
  }
}

async function saveSyncSettingsStrict(settings) {
  try {
    await browser.storage.sync.set({ [SYNC_SETTINGS_KEY]: normalizeSettings(settings) });
  } catch (error) {
    throw wrapStoreError("sync", "write", error);
  }
}

async function saveLocalSettings(settings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

async function persistSettings(settings, syncIfEnabled = true) {
  const normalized = normalizeSettings(settings);
  await saveLocalSettings(normalized);
  if (syncIfEnabled && normalized.syncEnabled) {
    await saveSyncSettingsStrict(normalized);
  }
  return normalized;
}

async function getSettings() {
  const { [SETTINGS_KEY]: localRaw } = await browser.storage.local.get(SETTINGS_KEY);
  const localSettings = normalizeSettings(localRaw);

  if (!localSettings.syncEnabled) return localSettings;

  let syncSettings = null;
  try {
    syncSettings = await getSyncSettingsStrict();
  } catch {
    return localSettings;
  }
  if (!syncSettings) return localSettings;

  const merged = normalizeSettings({ ...syncSettings, syncEnabled: true });
  if (JSON.stringify(localSettings) !== JSON.stringify(merged)) {
    await browser.storage.local.set({ [SETTINGS_KEY]: merged });
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

function runtimeError(code, cause) {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

function normalizeRuntimeError(error) {
  if (error && error.code) return error.code;
  const msg = String((error && error.message) || error || "").toLowerCase();
  if (msg.includes("quota")) return "sync_quota_exceeded";
  if (msg.includes("sync") && msg.includes("read")) return "sync_read_failed";
  if (msg.includes("sync") && msg.includes("write")) return "sync_write_failed";
  if (msg.includes("decrypt")) return "decrypt_failed";
  if (msg.includes("locked")) return "encryption_locked";
  if (msg.includes("wrong_passphrase")) return "wrong_passphrase";
  return "sync_migration_failed";
}

function isEnvelope(raw) {
  return !!raw
    && typeof raw === "object"
    && Array.isArray(raw.iv)
    && Array.isArray(raw.data);
}

function getStoreByName(storeName) {
  return storeName === "sync" ? browser.storage.sync : browser.storage.local;
}

function currentStoreNameFromSettings(settings) {
  return settings.syncEnabled ? "sync" : "local";
}

function wrapStoreError(storeName, operation, error) {
  if (error && error.code) return error;
  if (storeName === "sync") {
    const msg = String((error && error.message) || error || "").toLowerCase();
    if (msg.includes("quota")) return runtimeError("sync_quota_exceeded", error);
    if (operation === "read") return runtimeError("sync_read_failed", error);
    if (operation === "write") return runtimeError("sync_write_failed", error);
  }
  return runtimeError("sync_migration_failed", error);
}

function itemCreatedAt(item) {
  const ts = Number(item && item.createdAt);
  return Number.isFinite(ts) ? ts : 0;
}

function mergeItemsByUrl(localItems, syncItems) {
  const byUrl = new Map();
  const extras = [];
  const seenExtraIds = new Set();

  const visit = (items) => {
    for (const item of (items || [])) {
      if (!item || typeof item !== "object") continue;
      if (!item.url) {
        if (item.id) {
          if (seenExtraIds.has(item.id)) continue;
          seenExtraIds.add(item.id);
        }
        extras.push(item);
        continue;
      }
      const existing = byUrl.get(item.url);
      if (!existing || itemCreatedAt(item) >= itemCreatedAt(existing)) {
        byUrl.set(item.url, item);
      }
    }
  };

  visit(syncItems);
  visit(localItems);

  return [...byUrl.values(), ...extras].sort((a, b) => itemCreatedAt(b) - itemCreatedAt(a));
}

async function ensureDerivedKey() {
  return _derivedKey;
}

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

async function ensureWritableKeyOrThrow(settings) {
  if (!settings.encryptionEnabled) return null;
  const key = await ensureDerivedKey();
  if (!key) throw runtimeError("encryption_locked");
  return key;
}

async function getRawStoredFromArea(storeArea, storeName = null) {
  try {
    const d = await storeArea.get("tylItems");
    return d.tylItems;
  } catch (error) {
    if (storeName) throw wrapStoreError(storeName, "read", error);
    throw error;
  }
}

async function readItemsStrictFromStore(storeArea, settings, requireUnlocked = true, storeName = null) {
  const raw = await getRawStoredFromArea(storeArea, storeName);
  if (raw == null) return [];
  if (!settings.encryptionEnabled) return Array.isArray(raw) ? raw : [];

  if (!isEnvelope(raw)) {
    return Array.isArray(raw) ? raw : [];
  }

  let key = null;
  if (requireUnlocked) {
    key = await ensureWritableKeyOrThrow(settings);
  } else {
    key = await ensureDerivedKey();
    if (!key) return [];
  }

  let items;
  try {
    items = await decryptPayload(raw, key);
  } catch {
    throw runtimeError("decrypt_failed");
  }
  if (!Array.isArray(items)) throw runtimeError("decrypt_failed");
  return items;
}

async function writeItemsToStore(storeArea, settings, items, storeName = null) {
  try {
    if (settings.encryptionEnabled) {
      const key = await ensureWritableKeyOrThrow(settings);
      const envelope = await encryptPayload(items, key);
      await storeArea.set({ tylItems: envelope });
      return;
    }
    await storeArea.set({ tylItems: items });
  } catch (error) {
    if (storeName) throw wrapStoreError(storeName, "write", error);
    throw error;
  }
}

async function deriveAndValidatePassphrase(passphrase, settings) {
  if (!settings.encryptionEnabled || !settings.encryptionSalt) throw runtimeError("not_enabled");

  let key = null;
  try {
    const salt = new Uint8Array(settings.encryptionSalt);
    key = await deriveKey(passphrase, salt);
  } catch {
    throw runtimeError("wrong_passphrase");
  }

  const storeName = currentStoreNameFromSettings(settings);
  const store = getStoreByName(storeName);
  const raw = await getRawStoredFromArea(store, storeName === "sync" ? "sync" : null);

  if (!raw || !isEnvelope(raw)) {
    if (!raw) console.warn("TYL encryption enabled with empty payload; allowing unlock.");
    return { key, items: Array.isArray(raw) ? raw : [] };
  }

  let items;
  try {
    items = await decryptPayload(raw, key);
  } catch {
    throw runtimeError("wrong_passphrase");
  }
  if (!Array.isArray(items)) throw runtimeError("wrong_passphrase");
  return { key, items };
}

async function getRawStored() {
  const store = await getStorageArea();
  return getRawStoredFromArea(store);
}

async function getItems() {
  const s = await getSettings();
  const storeName = currentStoreNameFromSettings(s);
  const store = getStoreByName(storeName);
  try {
    return await readItemsStrictFromStore(store, s, false, storeName === "sync" ? "sync" : null);
  } catch {
    return [];
  }
}

async function saveItems(items) {
  const s = await getSettings();
  const storeName = currentStoreNameFromSettings(s);
  const store = getStoreByName(storeName);
  await writeItemsToStore(store, s, items, storeName === "sync" ? "sync" : null);
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
  const dup = items.find((i) => i.url === url);
  if (dup) {
    if (categoryId && dup.category !== categoryId) {
      dup.category = categoryId;
      await saveItems(items);
      flashBadge("✓", "#058b00");
      return;
    }
    flashBadge("!", "#e27900");
    return;
  }

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

  if (cats.length === 0) {
    browser.contextMenus.create({ id: "tyl-save-close", title: t.close, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-page", title: t.page, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-link", title: t.link, contexts: ["link"] });
  } else {
    browser.contextMenus.create({ id: "tyl-close-parent", title: t.close, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-close", parentId: "tyl-close-parent", title: t.uncat, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-close-sep", parentId: "tyl-close-parent", type: "separator", contexts: ["page"] });
    cats.forEach((c) => browser.contextMenus.create({ id: `tyl-save-close-cat-${c.id}`, parentId: "tyl-close-parent", title: c.name, contexts: ["page"] }));

    browser.contextMenus.create({ id: "tyl-page-parent", title: t.page, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-save-page", parentId: "tyl-page-parent", title: t.uncat, contexts: ["page"] });
    browser.contextMenus.create({ id: "tyl-page-sep", parentId: "tyl-page-parent", type: "separator", contexts: ["page"] });
    cats.forEach((c) => browser.contextMenus.create({ id: `tyl-save-page-cat-${c.id}`, parentId: "tyl-page-parent", title: c.name, contexts: ["page"] }));

    browser.contextMenus.create({ id: "tyl-link-parent", title: t.link, contexts: ["link"] });
    browser.contextMenus.create({ id: "tyl-save-link", parentId: "tyl-link-parent", title: t.uncat, contexts: ["link"] });
    browser.contextMenus.create({ id: "tyl-link-sep", parentId: "tyl-link-parent", type: "separator", contexts: ["link"] });
    cats.forEach((c) => browser.contextMenus.create({ id: `tyl-save-link-cat-${c.id}`, parentId: "tyl-link-parent", title: c.name, contexts: ["link"] }));
  }

  browser.contextMenus.create({ id: "tyl-sep-create", type: "separator", contexts: ["page", "link"] });
  browser.contextMenus.create({ id: "tyl-create-category", title: t.newCat, contexts: ["page", "link"] });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await getSettings();
  const fav = await resolveFavicon(tab, s.faviconMode);
  const mid = info.menuItemId;

  if (mid === "tyl-save-close") {
    await addItem(tab.title, tab.url, null, fav);
    browser.tabs.remove(tab.id);
  } else if (mid.startsWith("tyl-save-close-cat-")) {
    await addItem(tab.title, tab.url, mid.replace("tyl-save-close-cat-", ""), fav);
    browser.tabs.remove(tab.id);
  } else if (mid === "tyl-save-page") {
    await addItem(tab.title, tab.url, null, fav);
  } else if (mid.startsWith("tyl-save-page-cat-")) {
    await addItem(tab.title, tab.url, mid.replace("tyl-save-page-cat-", ""), fav);
  } else if (mid === "tyl-save-link") {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, null, fav);
  } else if (mid.startsWith("tyl-save-link-cat-")) {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, mid.replace("tyl-save-link-cat-", ""), fav);
  } else if (mid === "tyl-create-category") {
    browser.windows.create({
      url: browser.runtime.getURL("quick-category/quick-category.html"),
      type: "popup",
      width: 340,
      height: 290
    });
  }
});

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { [SETTINGS_KEY]: settings } = await browser.storage.local.get(SETTINGS_KEY);
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

const ENCRYPTION_WRITE_ACTIONS = new Set([
  "createCategory",
  "updateCategory",
  "deleteCategory",
  "deleteCategoryAndItems",
  "saveAndCloseCurrentTab",
  "softDeleteItem",
  "softDeleteItems",
  "undoDelete",
  "deleteItem",
  "deleteItems",
  "updateItemPinned",
  "updateItemCategory",
  "updateItemNote",
  "reorderItems",
  "saveAllTabs",
  "importItems",
  "setItemReminder",
  "clearItemReminder",
]);

async function ensureActionWritable(action) {
  if (!ENCRYPTION_WRITE_ACTIONS.has(action)) return;
  const s = await getSettings();
  await ensureWritableKeyOrThrow(s);
}

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    await ensureActionWritable(msg.action);
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

      case "createCategory": {
        const s = await getSettings();
        if (!s.categories) s.categories = [];
        const id = uuidv4();
        s.categories.push({ id, name: msg.name, color: msg.color });
        await migrateStorage(s);
        await setupContextMenus();
        if (msg.saveCurrentTab) {
          const wins = await browser.windows.getAll({ windowTypes: ["normal"] });
          const focusedWin = wins.find((w) => w.focused) || wins[0];
          if (focusedWin) {
            const tabs = await browser.tabs.query({ active: true, windowId: focusedWin.id });
            if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith("about:") && !tabs[0].url.startsWith("moz-extension:")) {
              const existing = await getItems();
              const dup = existing.find((i) => i.url === tabs[0].url);
              if (dup) {
                dup.category = id;
                await saveItems(existing);
                flashBadge("✓", "#058b00");
              } else {
                const fav = await resolveFavicon(tabs[0], s.faviconMode);
                await addItem(tabs[0].title, tabs[0].url, id, fav);
              }
            }
          }
        }
        return { success: true, id };
      }

      case "updateCategory": {
        const s = await getSettings();
        const cat = (s.categories || []).find((c) => c.id === msg.id);
        if (!cat) return { success: false };
        if (msg.name !== undefined) cat.name = msg.name;
        if (msg.color !== undefined) cat.color = msg.color;
        await migrateStorage(s);
        await setupContextMenus();
        return { success: true };
      }

      case "deleteCategory": {
        const s = await getSettings();
        s.categories = (s.categories || []).filter((c) => c.id !== msg.id);
        const items = await getItems();
        items.forEach((item) => { if (item.category === msg.id) item.category = null; });
        await saveItems(items);
        await migrateStorage(s);
        await setupContextMenus();
        return { success: true };
      }

      case "deleteCategoryAndItems": {
        console.log("TYL deleteCategoryAndItems start", { ids: msg.ids?.length, categoryIds: msg.categoryIds });
        let token = null;
        try {
          const items = await getItems();
          const ids = new Set(msg.ids || []);
          const removed = items.filter((i) => ids.has(i.id));
          const remaining = items.filter((i) => !ids.has(i.id));
          for (const r of removed) { if (r.reminderAt) browser.alarms.clear(ALARM_ITEM_PREFIX + r.id); }
          try {
            await saveItems(remaining);
          } catch (e) {
            console.warn("TYL saveItems failed, falling back to local:", e);
            try { await browser.storage.local.set({ tylItems: remaining }); } catch (e2) { console.warn("TYL local items save failed:", e2); }
          }
          token = removed.length > 0 ? storeUndo(removed) : null;
        } catch (e) {
          console.warn("TYL deleteCategoryAndItems items phase failed:", e);
        }
        if (msg.categoryIds && msg.categoryIds.length > 0) {
          try {
            const s = await getSettings();
            const removeSet = new Set(msg.categoryIds);
            s.categories = (s.categories || []).filter((c) => !removeSet.has(c.id));
            try { await migrateStorage(s); } catch (e) { console.warn("TYL migrateStorage failed:", e); try { await saveLocalSettings(s); } catch (e2) { console.warn("TYL local settings save failed:", e2); } }
            try { await setupContextMenus(); } catch (e) { console.warn("TYL context menu rebuild failed:", e); }
          } catch (e) {
            console.warn("TYL category record removal failed:", e);
          }
        }
        console.log("TYL deleteCategoryAndItems done");
        return { success: true, token };
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
        if (s.autoDelete) {
          try {
            const items = await getItems();
            const us = new Set(msg.urls);
            await saveItems(items.filter((i) => !us.has(i.url)));
          } catch (e) {
            console.warn("TYL openItems autoDelete failed:", e);
          }
        }
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
          const validated = await deriveAndValidatePassphrase(msg.passphrase, s);
          _derivedKey = validated.key;
          return { success: true };
        } catch (error) {
          _derivedKey = null;
          return { success: false, error: normalizeRuntimeError(error) };
        }
      }

      case "enableEncryption": {
        const items = await getItems();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        _derivedKey = await deriveKey(msg.passphrase, salt);
        const s = await getSettings();
        s.encryptionEnabled = true;
        s.encryptionSalt = Array.from(salt);
        await persistSettings(s, true);
        await saveItems(items);
        return { success: true };
      }

      case "disableEncryption": {
        const s = await getSettings();
        if (!s.encryptionEnabled || !s.encryptionSalt) return { success: false, error: "not_enabled" };

        let validated;
        try {
          validated = await deriveAndValidatePassphrase(msg.passphrase, s);
        } catch (error) {
          return { success: false, error: normalizeRuntimeError(error) };
        }

        const storeName = currentStoreNameFromSettings(s);
        const store = getStoreByName(storeName);
        try {
          await store.set({ tylItems: validated.items });
        } catch (error) {
          if (storeName === "sync") throw wrapStoreError("sync", "write", error);
          throw error;
        }

        s.encryptionEnabled = false;
        s.encryptionSalt = null;
        _derivedKey = null;
        await persistSettings(s, true);
        await updateBadge(validated.items.length);
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
  handle()
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: normalizeRuntimeError(error) }));
  return true;
});

async function migrateStorage(newSettings) {
  const oldSettings = await getSettings();
  const merged = normalizeSettings(newSettings);

  const toSync = !oldSettings.syncEnabled && merged.syncEnabled;
  const toLocal = oldSettings.syncEnabled && !merged.syncEnabled;

  if (!toSync && !toLocal) {
    if (merged.syncEnabled) {
      await saveSyncSettingsStrict(merged);
    }
    await saveLocalSettings(merged);
    return;
  }

  if (oldSettings.encryptionEnabled) {
    await ensureWritableKeyOrThrow(oldSettings);
  }

  const requireUnlocked = oldSettings.encryptionEnabled;
  const localStore = browser.storage.local;
  const syncStore = browser.storage.sync;

  const localItems = await readItemsStrictFromStore(localStore, oldSettings, requireUnlocked, null);
  const syncItems = await readItemsStrictFromStore(syncStore, oldSettings, requireUnlocked, "sync");
  const mergedItems = mergeItemsByUrl(localItems, syncItems);
  const existingSyncSettings = await getSyncSettingsStrict();

  if (toSync) {
    const settingsForSync = mergeSettingsForSync(merged, existingSyncSettings || {});
    await writeItemsToStore(syncStore, settingsForSync, mergedItems, "sync");
    await saveSyncSettingsStrict(settingsForSync);
    await saveLocalSettings(settingsForSync);
    return;
  }

  if (toLocal) {
    const localSettings = normalizeSettings({ ...oldSettings, ...merged, syncEnabled: false });
    await writeItemsToStore(localStore, localSettings, mergedItems, null);
    await saveLocalSettings(localSettings);
  }
}

(async () => {
  await setupContextMenus();
  await initAutoExpireAlarm();
  await initReminderAlarms();
  const items = await getItems();
  await updateBadge(items.length);
})();
