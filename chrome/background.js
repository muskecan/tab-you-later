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
  return s.syncEnabled ? chrome.storage.sync : chrome.storage.local;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
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

async function ensureDerivedKey() {
  if (_derivedKey) return _derivedKey;
  const data = await chrome.storage.session.get("_sessionPassphrase");
  if (!data._sessionPassphrase) return null;
  const s = await getSettings();
  if (!s.encryptionEnabled || !s.encryptionSalt) return null;
  try {
    const salt = new Uint8Array(s.encryptionSalt);
    _derivedKey = await deriveKey(data._sessionPassphrase, salt);
    return _derivedKey;
  } catch { return null; }
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
    const key = await ensureDerivedKey();
    if (!key) return [];
    try { return await decryptPayload(raw, key); } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

async function saveItems(items) {
  const store = await getStorageArea();
  const s = await getSettings();
  const key = await ensureDerivedKey();
  if (s.encryptionEnabled && key) {
    const envelope = await encryptPayload(items, key);
    await store.set({ tylItems: envelope });
  } else {
    await store.set({ tylItems: items });
  }
  await updateBadge(items.length);
}

async function updateBadge(count) {
  const s = await getSettings();
  if (s.badgeEnabled && count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: "#5b5b66" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
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

async function storeUndo(items) {
  const token = uuidv4();
  const expiry = Date.now() + 5000;
  await chrome.storage.session.set({ [`undo_${token}`]: { items, expiry } });
  return token;
}

async function getUndoItems(token) {
  const key = `undo_${token}`;
  const data = await chrome.storage.session.get(key);
  const entry = data[key];
  if (!entry || entry.expiry < Date.now()) {
    chrome.storage.session.remove(key);
    return null;
  }
  chrome.storage.session.remove(key);
  return entry.items;
}

const ALARM_DAILY = "tyl-daily-summary";
const ALARM_ITEM_PREFIX = "tyl-item-reminder-";

async function hasNotificationPermission() {
  try { return await chrome.permissions.contains({ permissions: ["notifications"] }); } catch { return false; }
}

async function initReminderAlarms() {
  const s = await getSettings();
  const hasPerm = await hasNotificationPermission();

  if (s.remindersEnabled && s.dailySummaryEnabled && hasPerm) {
    scheduleDailySummaryAlarm(s.dailyReminderTime);
  } else {
    chrome.alarms.clear(ALARM_DAILY);
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
  chrome.alarms.create(ALARM_DAILY, { delayInMinutes: delayMs / 60000, periodInMinutes: 1440 });
}

async function syncItemReminderAlarms(items) {
  const allAlarms = await chrome.alarms.getAll();
  const existingIds = new Set(allAlarms.filter((a) => a.name.startsWith(ALARM_ITEM_PREFIX)).map((a) => a.name.replace(ALARM_ITEM_PREFIX, "")));
  const itemIds = new Set(items.filter((i) => i.reminderAt && i.reminderAt > Date.now()).map((i) => i.id));

  for (const id of existingIds) {
    if (!itemIds.has(id)) chrome.alarms.clear(ALARM_ITEM_PREFIX + id);
  }
  for (const item of items) {
    if (item.reminderAt && item.reminderAt > Date.now() && !existingIds.has(item.id)) {
      chrome.alarms.create(ALARM_ITEM_PREFIX + item.id, { when: item.reminderAt });
    }
  }
}

async function storeNotifItem(nId, item) {
  const data = await chrome.storage.session.get("notifItemMap");
  const map = data.notifItemMap || {};
  map[nId] = item;
  await chrome.storage.session.set({ notifItemMap: map });
}

async function getNotifItem(nId) {
  const data = await chrome.storage.session.get("notifItemMap");
  const map = data.notifItemMap || {};
  const item = map[nId];
  if (item) {
    delete map[nId];
    await chrome.storage.session.set({ notifItemMap: map });
  }
  return item;
}

async function showDailySummaryNotification() {
  if (!chrome.notifications) return;
  const hasPerm = await hasNotificationPermission();
  if (!hasPerm) return;
  const items = await getItems();
  if (items.length === 0) return;
  const lang = await getCurrentLang();
  const t = NOTIF_T[lang] || NOTIF_T[DEFAULT_LANG];
  chrome.notifications.create("tyl-daily-summary", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-96.png"),
    title: t.title,
    message: t.summary.replace("{n}", items.length)
  });
}

async function showItemReminderNotification(itemId) {
  if (!chrome.notifications) return;
  const hasPerm = await hasNotificationPermission();
  if (!hasPerm) return;
  const items = await getItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  const lang = await getCurrentLang();
  const t = NOTIF_T[lang] || NOTIF_T[DEFAULT_LANG];
  const nId = "tyl-reminder-" + itemId;
  await storeNotifItem(nId, item);
  chrome.notifications.create(nId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-96.png"),
    title: t.title,
    message: t.reminder.replace("{title}", item.title)
  });
  item.reminderAt = null;
  await saveItems(items);
}

try {
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener(async (nId) => {
      if (nId === "tyl-daily-summary") {
        try { await chrome.action.openPopup(); }
        catch { chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") }); }
      } else if (nId.startsWith("tyl-reminder-")) {
        const item = await getNotifItem(nId);
        if (item) chrome.tabs.create({ url: item.url });
      }
      chrome.notifications.clear(nId);
    });
  }
} catch {}

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  const lang = await getCurrentLang();
  const t = CTX_T[lang] || CTX_T[DEFAULT_LANG];
  const s = await getSettings();
  const cats = s.categories || [];

  if (cats.length === 0) {
    chrome.contextMenus.create({ id: "tyl-save-close", title: t.close, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-save-page", title: t.page, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-save-link", title: t.link, contexts: ["link"] });
  } else {
    chrome.contextMenus.create({ id: "tyl-close-parent", title: t.close, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-save-close", parentId: "tyl-close-parent", title: t.uncat, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-close-sep", parentId: "tyl-close-parent", type: "separator", contexts: ["page"] });
    cats.forEach((c) => chrome.contextMenus.create({ id: `tyl-save-close-cat-${c.id}`, parentId: "tyl-close-parent", title: c.name, contexts: ["page"] }));

    chrome.contextMenus.create({ id: "tyl-page-parent", title: t.page, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-save-page", parentId: "tyl-page-parent", title: t.uncat, contexts: ["page"] });
    chrome.contextMenus.create({ id: "tyl-page-sep", parentId: "tyl-page-parent", type: "separator", contexts: ["page"] });
    cats.forEach((c) => chrome.contextMenus.create({ id: `tyl-save-page-cat-${c.id}`, parentId: "tyl-page-parent", title: c.name, contexts: ["page"] }));

    chrome.contextMenus.create({ id: "tyl-link-parent", title: t.link, contexts: ["link"] });
    chrome.contextMenus.create({ id: "tyl-save-link", parentId: "tyl-link-parent", title: t.uncat, contexts: ["link"] });
    chrome.contextMenus.create({ id: "tyl-link-sep", parentId: "tyl-link-parent", type: "separator", contexts: ["link"] });
    cats.forEach((c) => chrome.contextMenus.create({ id: `tyl-save-link-cat-${c.id}`, parentId: "tyl-link-parent", title: c.name, contexts: ["link"] }));
  }

  chrome.contextMenus.create({ id: "tyl-sep-create", type: "separator", contexts: ["page", "link"] });
  chrome.contextMenus.create({ id: "tyl-create-category", title: t.newCat, contexts: ["page", "link"] });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await getSettings();
  const fav = await resolveFavicon(tab, s.faviconMode);
  const mid = info.menuItemId;

  if (mid === "tyl-save-close") {
    await addItem(tab.title, tab.url, null, fav);
    chrome.tabs.remove(tab.id);
  } else if (mid.startsWith("tyl-save-close-cat-")) {
    await addItem(tab.title, tab.url, mid.replace("tyl-save-close-cat-", ""), fav);
    chrome.tabs.remove(tab.id);
  } else if (mid === "tyl-save-page") {
    await addItem(tab.title, tab.url, null, fav);
  } else if (mid.startsWith("tyl-save-page-cat-")) {
    await addItem(tab.title, tab.url, mid.replace("tyl-save-page-cat-", ""), fav);
  } else if (mid === "tyl-save-link") {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, null, fav);
  } else if (mid.startsWith("tyl-save-link-cat-")) {
    await addItem(info.linkText || info.linkUrl, info.linkUrl, mid.replace("tyl-save-link-cat-", ""), fav);
  } else if (mid === "tyl-create-category") {
    chrome.windows.create({
      url: chrome.runtime.getURL("quick-category/quick-category.html"),
      type: "popup",
      width: 340,
      height: 290
    });
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings) chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
  await setupContextMenus();
  await initAutoExpireAlarm();
  await initReminderAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupContextMenus();
  await initAutoExpireAlarm();
  await initReminderAlarms();
  const items = await getItems();
  await updateBadge(items.length);
});

async function initAutoExpireAlarm() {
  const s = await getSettings();
  if (s.autoExpireEnabled) chrome.alarms.create("tyl-auto-expire", { periodInMinutes: 60 });
  else chrome.alarms.clear("tyl-auto-expire");
}

async function runAutoExpire() {
  const s = await getSettings();
  if (!s.autoExpireEnabled || !s.autoExpireEnabledAt) return;
  const items = await getItems();
  const cutoff = Date.now() - s.autoExpireDays * 86400000;
  const filtered = items.filter((i) => i.createdAt < s.autoExpireEnabledAt || i.createdAt > cutoff);
  if (filtered.length !== items.length) await saveItems(filtered);
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tyl-auto-expire") { runAutoExpire(); }
  else if (a.name === ALARM_DAILY) { showDailySummaryNotification(); }
  else if (a.name.startsWith(ALARM_ITEM_PREFIX)) { showItemReminderNotification(a.name.replace(ALARM_ITEM_PREFIX, "")); }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

      case "createCategory": {
        const s = await getSettings();
        if (!s.categories) s.categories = [];
        const id = uuidv4();
        s.categories.push({ id, name: msg.name, color: msg.color });
        await migrateStorage(s);
        await setupContextMenus();
        if (msg.saveCurrentTab) {
          const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
          const focusedWin = wins.find((w) => w.focused) || wins[0];
          if (focusedWin) {
            const tabs = await chrome.tabs.query({ active: true, windowId: focusedWin.id });
            if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith("chrome://") && !tabs[0].url.startsWith("chrome-extension://")) {
              const fav = await resolveFavicon(tabs[0], s.faviconMode);
              await addItem(tabs[0].title, tabs[0].url, id, fav);
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

      case "saveAndCloseCurrentTab": {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return { success: false };
        const tab = tabs[0];
        const s = await getSettings();
        const fav = await resolveFavicon(tab, s.faviconMode);
        await addItem(tab.title, tab.url, msg.categoryId || null, fav);
        chrome.tabs.remove(tab.id);
        return { success: true };
      }

      case "softDeleteItem": {
        const items = await getItems();
        const removed = items.filter((i) => i.id === msg.id);
        const remaining = items.filter((i) => i.id !== msg.id);
        await saveItems(remaining);
        if (removed[0] && removed[0].reminderAt) chrome.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        const token = await storeUndo(removed);
        return { success: true, token };
      }

      case "softDeleteItems": {
        const items = await getItems();
        const ids = new Set(msg.ids);
        const removed = items.filter((i) => ids.has(i.id));
        const remaining = items.filter((i) => !ids.has(i.id));
        await saveItems(remaining);
        for (const r of removed) { if (r.reminderAt) chrome.alarms.clear(ALARM_ITEM_PREFIX + r.id); }
        const token = await storeUndo(removed);
        return { success: true, token };
      }

      case "undoDelete": {
        const restored = await getUndoItems(msg.token);
        if (!restored) return { success: false };
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
        if (del && del.reminderAt) chrome.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        await saveItems(items.filter((i) => i.id !== msg.id));
        return { success: true };
      }

      case "deleteItems": {
        const items = await getItems();
        const ids = new Set(msg.ids);
        items.filter((i) => ids.has(i.id) && i.reminderAt).forEach((i) => chrome.alarms.clear(ALARM_ITEM_PREFIX + i.id));
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
        await chrome.tabs.create({ url: msg.url });
        const s = await getSettings();
        if (s.autoDelete) { const items = await getItems(); await saveItems(items.filter((i) => i.id !== msg.id)); }
        return { success: true };
      }

      case "openItems": {
        for (const u of msg.urls) await chrome.tabs.create({ url: u });
        const s = await getSettings();
        if (s.autoDelete) { const items = await getItems(); const us = new Set(msg.urls); await saveItems(items.filter((i) => !us.has(i.url))); }
        return { success: true };
      }

      case "saveAllTabs": {
        const s = await getSettings();
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const items = await getItems();
        const existing = new Set(items.map((i) => i.url));
        let added = 0;
        for (const tab of tabs) {
          if (tab.url.startsWith("about:") || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) continue;
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
          await chrome.storage.session.set({ _sessionPassphrase: msg.passphrase });
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
        await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...s } });
        await chrome.storage.session.set({ _sessionPassphrase: msg.passphrase });
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
        await chrome.storage.session.remove("_sessionPassphrase");
        await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...s } });
        const store = await getStorageArea();
        await store.set({ tylItems: items });
        await updateBadge(items.length);
        return { success: true };
      }

      case "isEncryptionUnlocked": {
        const key = await ensureDerivedKey();
        return { unlocked: key !== null };
      }

      case "setItemReminder": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (!item) return { success: false };
        item.reminderAt = msg.reminderAt;
        await saveItems(items);
        if (msg.reminderAt && msg.reminderAt > Date.now()) {
          chrome.alarms.create(ALARM_ITEM_PREFIX + msg.id, { when: msg.reminderAt });
        } else {
          chrome.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
        }
        return { success: true };
      }

      case "clearItemReminder": {
        const items = await getItems();
        const item = items.find((i) => i.id === msg.id);
        if (item) { item.reminderAt = null; await saveItems(items); }
        chrome.alarms.clear(ALARM_ITEM_PREFIX + msg.id);
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
  await chrome.storage.local.set({ settings: merged });

  if (oldSettings.syncEnabled !== merged.syncEnabled) {
    if (merged.syncEnabled) {
      const key = await ensureDerivedKey();
      if (merged.encryptionEnabled && key) {
        const envelope = await encryptPayload(items, key);
        await chrome.storage.sync.set({ tylItems: envelope });
      } else {
        await chrome.storage.sync.set({ tylItems: items });
      }
      await chrome.storage.local.remove("tylItems");
    } else {
      const syncData = await chrome.storage.sync.get("tylItems");
      await chrome.storage.local.set({ tylItems: syncData.tylItems || [] });
      await chrome.storage.sync.remove("tylItems");
    }
  }
}

(async () => {
  try {
    await initAutoExpireAlarm();
    await initReminderAlarms();
    const items = await getItems();
    await updateBadge(items.length);
  } catch (e) { console.error("TYL bootstrap error:", e); }
})();
