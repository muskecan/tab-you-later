const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

tylInitTheme();

const DOM = {
  search: $("#search-input"),
  list: $("#items-list"),
  empty: $("#empty-state"),
  noResults: $("#no-results"),
  sortSelect: $("#sort-select"),
  catBar: $("#category-bar"),
  bulkBar: $("#bulk-bar"),
  bulkCount: $("#bulk-count"),
  catDropdown: $("#cat-dropdown"),
  reminderDropdown: $("#reminder-dropdown"),
  noteDropdown: $("#note-dropdown"),
  scDropdown: $("#save-close-dropdown"),
  undoToast: $("#undo-toast"),
  undoMsg: $("#undo-msg"),
  undoBtn: $("#undo-btn"),
};

let allItems = [];
let settings = {};
let currentLang = "en";
let activeCategory = null;
let selectMode = false;
let selectedIds = new Set();
let dragSrcId = null;
let undoTimer = null;
let undoToken = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [langResp, settingsResp] = await Promise.all([
    chrome.runtime.sendMessage({ action: "getLang" }),
    chrome.runtime.sendMessage({ action: "getSettings" }),
  ]);
  currentLang = langResp.lang;
  settings = settingsResp.settings;
  tylApplyTheme(settings.themeMode);

  tylApplyI18n(currentLang);
  applySortOptionLabels();

  DOM.sortSelect.value = settings.sortBy || "newest";
  if (settings.sortBy === "manual") document.body.classList.add("manual-sort");

  await loadItems();
  renderCategoryBar();
  DOM.search.focus();

  $("#settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#select-mode-btn").addEventListener("click", toggleSelectMode);
  $("#save-all-btn").addEventListener("click", saveAllTabs);
  $("#save-close-btn").addEventListener("click", saveAndClose);
  DOM.search.addEventListener("input", () => renderList());
  DOM.sortSelect.addEventListener("change", onSortChange);
  $("#bulk-select-all").addEventListener("click", toggleSelectAll);
  $("#bulk-open").addEventListener("click", bulkOpen);
  $("#bulk-delete").addEventListener("click", bulkDelete);
  DOM.undoBtn.addEventListener("click", handleUndo);

  document.addEventListener("click", (e) => {
    if (!DOM.catDropdown.contains(e.target) && !e.target.closest(".tyl-cat-btn")) {
      DOM.catDropdown.hidden = true;
    }
    if (!DOM.reminderDropdown.contains(e.target) && !e.target.closest(".tyl-reminder-btn")) {
      DOM.reminderDropdown.hidden = true;
    }
    if (!DOM.noteDropdown.contains(e.target) && !e.target.closest(".tyl-note-btn")) {
      DOM.noteDropdown.hidden = true;
    }
    if (!DOM.scDropdown.contains(e.target) && !e.target.closest("#save-close-btn")) {
      DOM.scDropdown.hidden = true;
    }
  });

  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.tylItems) loadItems();
    if (changes.settings) {
      const resp = await chrome.runtime.sendMessage({ action: "getSettings" });
      settings = resp.settings;
      tylApplyTheme(settings.themeMode);
      renderCategoryBar();
    }
  });
});

async function loadItems() {
  const resp = await chrome.runtime.sendMessage({ action: "getItems" });
  allItems = resp.items || [];
  renderList();
}

function applySortOptionLabels() {
  DOM.sortSelect.querySelectorAll("option").forEach((opt) => {
    const key = opt.dataset.i18nText;
    if (key) opt.textContent = tylT(key, currentLang);
  });
}

function onSortChange() {
  settings.sortBy = DOM.sortSelect.value;
  document.body.classList.toggle("manual-sort", settings.sortBy === "manual");
  chrome.runtime.sendMessage({ action: "saveSettings", settings: { ...settings } });
  renderList();
}

function sortItems(items) {
  const s = [...items];
  switch (settings.sortBy) {
    case "oldest": return s.sort((a, b) => a.createdAt - b.createdAt);
    case "alpha": return s.sort((a, b) => a.title.localeCompare(b.title));
    case "domain": return s.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)));
    case "manual": return s;
    default: return s.sort((a, b) => b.createdAt - a.createdAt);
  }
}

function partitionPinned(items) {
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  return [...sortItems(pinned), ...sortItems(rest)];
}

function renderCategoryBar() {
  const cats = settings.categories || [];
  if (cats.length === 0) { DOM.catBar.hidden = true; return; }
  DOM.catBar.hidden = false;
  DOM.catBar.innerHTML = "";

  DOM.catBar.appendChild(createCatChip(null, tylT("popup_category_all", currentLang)));
  DOM.catBar.appendChild(createCatChip("__none__", tylT("popup_category_uncategorized", currentLang)));
  cats.forEach((c) => DOM.catBar.appendChild(createCatChip(c.id, c.name, c.color)));
}

function createCatChip(id, label, color) {
  const btn = document.createElement("button");
  btn.className = "tyl-cat-chip" + (activeCategory === id ? " active" : "");
  if (color) {
    const dot = document.createElement("span");
    dot.className = "tyl-cat-dot";
    dot.style.background = color;
    btn.appendChild(dot);
  }
  btn.appendChild(document.createTextNode(label));
  btn.addEventListener("click", () => {
    activeCategory = id;
    DOM.catBar.querySelectorAll(".tyl-cat-chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    renderList();
  });
  return btn;
}

function parseSearchQuery(raw) {
  const result = { freeText: "", cat: null, site: null, before: null, after: null, pinned: null };
  if (!raw) return result;

  const parts = [];
  const tokens = raw.match(/"[^"]*"|\S+/g) || [];

  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower.startsWith("cat:")) { result.cat = t.slice(4).replace(/^"|"$/g, ""); }
    else if (lower.startsWith("site:")) { result.site = t.slice(5).replace(/^"|"$/g, "").toLowerCase(); }
    else if (lower.startsWith("before:")) { result.before = new Date(t.slice(7)).getTime() || null; }
    else if (lower.startsWith("after:")) { result.after = new Date(t.slice(6)).getTime() || null; }
    else if (lower === "is:pinned") { result.pinned = true; }
    else { parts.push(t); }
  }
  result.freeText = parts.join(" ").toLowerCase();
  return result;
}

function applySearchFilters(items, query) {
  return items.filter((item) => {
    if (query.pinned !== null && item.pinned !== query.pinned) return false;
    if (query.site && !hostOf(item.url).includes(query.site)) return false;
    if (query.before && item.createdAt >= query.before) return false;
    if (query.after && item.createdAt <= query.after) return false;
    if (query.cat) {
      const cats = settings.categories || [];
      const match = cats.find((c) => c.name.toLowerCase() === query.cat.toLowerCase() || c.id === query.cat);
      if (match && item.category !== match.id) return false;
      if (!match && item.category) return false;
    }
    if (query.freeText && !(item.title.toLowerCase().includes(query.freeText) || item.url.toLowerCase().includes(query.freeText))) return false;
    return true;
  });
}

// ─── Render ──────────────────────────────────────────────

function renderList() {
  DOM.list.innerHTML = "";
  const raw = DOM.search.value.trim();
  const query = parseSearchQuery(raw);

  let items = [...allItems];

  if (activeCategory === "__none__") items = items.filter((i) => !i.category);
  else if (activeCategory) items = items.filter((i) => i.category === activeCategory);

  if (raw) items = applySearchFilters(items, query);

  items = partitionPinned(items);

  if (allItems.length === 0) {
    DOM.empty.hidden = false; DOM.noResults.hidden = true; DOM.list.hidden = true; return;
  }
  if (items.length === 0) {
    DOM.empty.hidden = true; DOM.noResults.hidden = false; DOM.list.hidden = true; return;
  }

  DOM.empty.hidden = true; DOM.noResults.hidden = true; DOM.list.hidden = false;
  items.forEach((item) => DOM.list.appendChild(createItemEl(item)));
  updateBulkCount();
}

// ─── Create Item Element ─────────────────────────────────

function createItemEl(item) {
  const el = document.createElement("div");
  el.className = "tyl-item" + (item.pinned ? " tyl-item--pinned" : "");
  el.dataset.id = item.id;

  // Checkbox (select mode)
  const check = document.createElement("div");
  check.className = "tyl-item-check" + (selectedIds.has(item.id) ? " checked" : "");
  check.addEventListener("click", (e) => { e.stopPropagation(); toggleItem(item.id, check); });
  el.appendChild(check);

  // Drag handle
  const drag = document.createElement("div");
  drag.className = "tyl-drag-handle";
  drag.innerHTML = '<svg width="8" height="14" viewBox="0 0 8 14"><circle cx="2" cy="2" r="1.2" fill="currentColor"/><circle cx="6" cy="2" r="1.2" fill="currentColor"/><circle cx="2" cy="7" r="1.2" fill="currentColor"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><circle cx="2" cy="12" r="1.2" fill="currentColor"/><circle cx="6" cy="12" r="1.2" fill="currentColor"/></svg>';
  el.appendChild(drag);

  // Favicon
  const fMode = settings.faviconMode || (settings.faviconEnabled ? "live" : "off");
  if (fMode !== "off") {
    const fav = document.createElement("img");
    fav.className = "tyl-item-favicon";
    fav.width = 16; fav.height = 16;
    fav.onload = () => fav.classList.add("loaded");
    fav.onerror = () => { fav.style.display = "none"; };
    if (fMode === "cached" && item.favIconUrl && item.favIconUrl.startsWith("data:")) {
      fav.src = item.favIconUrl;
    } else {
      fav.src = item.favIconUrl || `https://${hostOf(item.url)}/favicon.ico`;
    }
    el.appendChild(fav);
  }

  // Body
  const body = document.createElement("div");
  body.className = "tyl-item-body";

  const title = document.createElement("span");
  title.className = "tyl-item-title";
  title.textContent = item.title;
  title.title = item.title;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "tyl-item-meta";

  const urlSpan = document.createElement("span");
  urlSpan.className = "tyl-item-url";
  urlSpan.textContent = hostOf(item.url);
  urlSpan.title = item.url;
  meta.appendChild(urlSpan);

  meta.appendChild(createDot());
  const dateSpan = document.createElement("span");
  dateSpan.textContent = fmtDate(item.createdAt);
  meta.appendChild(dateSpan);

  if (item.pinned) {
    meta.appendChild(createDot());
    const pinBadge = document.createElement("span");
    pinBadge.className = "tyl-item-pin-badge";
    pinBadge.textContent = tylT("popup_pinned_label", currentLang);
    meta.appendChild(pinBadge);
  }

  if (item.reminderAt) {
    meta.appendChild(createDot());
    const rBadge = document.createElement("span");
    rBadge.className = "tyl-item-reminder-badge";
    rBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.7 1 2 3.7 2 7V11L1 13H15L14 11V7C14 3.7 11.3 1 8 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 13C6 14.1 6.9 15 8 15C9.1 15 10 14.1 10 13" stroke="currentColor" stroke-width="1.3"/></svg>';
    const rTime = document.createElement("span");
    rTime.textContent = fmtReminderDate(item.reminderAt);
    rBadge.appendChild(rTime);
    meta.appendChild(rBadge);
  }

  if (item.note) {
    meta.appendChild(createDot());
    const nBadge = document.createElement("span");
    nBadge.className = "tyl-item-note-badge";
    nBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 3C2 1.9 2.9 1 4 1H12C13.1 1 14 1.9 14 3V15L8 12L2 15V3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const nText = document.createElement("span");
    nText.textContent = tylT("popup_note_label", currentLang);
    nBadge.appendChild(nText);
    meta.appendChild(nBadge);
  }

  if (item.category && settings.categories) {
    const cat = settings.categories.find((c) => c.id === item.category);
    if (cat) {
      meta.appendChild(createDot());
      const badge = document.createElement("span");
      badge.className = "tyl-item-cat-badge";
      badge.textContent = cat.name;
      badge.style.background = cat.color || "#5b5b66";
      meta.appendChild(badge);
    }
  }

  body.appendChild(meta);
  el.appendChild(body);

  // Actions
  const actions = document.createElement("div");
  actions.className = "tyl-item-actions";

  // Pin / Unpin
  const pinBtn = document.createElement("button");
  pinBtn.className = "tyl-action-btn" + (item.pinned ? " pinned" : "");
  pinBtn.title = item.pinned ? tylT("popup_unpin_title", currentLang) : tylT("popup_pin_title", currentLang);
  pinBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M9.5 1.5L14.5 6.5L10.5 7.5L7.5 10.5L5.5 10.5L5.5 8.5L8.5 5.5L9.5 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="5" y1="11" x2="1.5" y2="14.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  pinBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePin(item); });
  actions.appendChild(pinBtn);

  // Note
  const noteBtn = document.createElement("button");
  noteBtn.className = "tyl-action-btn tyl-note-btn" + (item.note ? " has-note" : "");
  noteBtn.title = item.note ? tylT("popup_note_edit", currentLang) : tylT("popup_note_add", currentLang);
  noteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3C2 1.9 2.9 1 4 1H12C13.1 1 14 1.9 14 3V15L8 12L2 15V3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';
  noteBtn.addEventListener("click", (e) => { e.stopPropagation(); showNoteDropdown(item, noteBtn); });
  actions.appendChild(noteBtn);

  // Reminder
  if (settings.remindersEnabled) {
    const remBtn = document.createElement("button");
    remBtn.className = "tyl-action-btn tyl-reminder-btn" + (item.reminderAt ? " has-reminder" : "");
    remBtn.title = item.reminderAt ? tylT("popup_reminder_edit", currentLang) : tylT("popup_reminder_set", currentLang);
    remBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.7 1 2 3.7 2 7V11L1 13H15L14 11V7C14 3.7 11.3 1 8 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 13C6 14.1 6.9 15 8 15C9.1 15 10 14.1 10 13" stroke="currentColor" stroke-width="1.3"/></svg>';
    remBtn.addEventListener("click", (e) => { e.stopPropagation(); showReminderDropdown(item, remBtn); });
    actions.appendChild(remBtn);
  }

  // Category assign
  if (settings.categories && settings.categories.length > 0) {
    const catBtn = document.createElement("button");
    catBtn.className = "tyl-action-btn tyl-cat-btn";
    catBtn.title = tylT("popup_assign_cat_title", currentLang);
    catBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 3C1 1.9 1.9 1 3 1H7L9 3H13C14.1 3 15 3.9 15 5V13C15 14.1 14.1 15 13 15H3C1.9 15 1 14.1 1 13V3Z" stroke="currentColor" stroke-width="1.4"/></svg>';
    catBtn.addEventListener("click", (e) => { e.stopPropagation(); showCatDropdown(item, catBtn); });
    actions.appendChild(catBtn);
  }

  // Delete
  const delBtn = document.createElement("button");
  delBtn.className = "tyl-action-btn danger";
  delBtn.title = tylT("popup_delete_title", currentLang);
  delBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5 3V2C5 1.4 5.4 1 6 1H10C10.6 1 11 1.4 11 2V3M2 4H14M3 4L4 14C4 14.6 4.4 15 5 15H11C11.6 15 12 14.6 12 14L13 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  delBtn.addEventListener("click", (e) => { e.stopPropagation(); softDeleteItem(item.id, el); });
  actions.appendChild(delBtn);

  el.appendChild(actions);

  body.addEventListener("click", () => openItem(item));

  // Drag & drop (manual sort)
  if (settings.sortBy === "manual") {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => { dragSrcId = item.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); clearDragOver(); });
    el.addEventListener("dragover", (e) => { e.preventDefault(); clearDragOver(); el.classList.add("drag-over"); });
    el.addEventListener("drop", (e) => { e.preventDefault(); clearDragOver(); handleDrop(item.id); });
  }

  return el;
}

// ─── Category Dropdown ───────────────────────────────────

function showCatDropdown(item, anchor) {
  const dd = DOM.catDropdown;
  dd.innerHTML = "";

  const noneBtn = document.createElement("button");
  noneBtn.className = "tyl-cat-dropdown-item" + (!item.category ? " active" : "");
  noneBtn.textContent = tylT("popup_category_uncategorized", currentLang);
  noneBtn.addEventListener("click", () => assignCategory(item.id, null));
  dd.appendChild(noneBtn);

  (settings.categories || []).forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "tyl-cat-dropdown-item" + (item.category === cat.id ? " active" : "");
    const dot = document.createElement("span");
    dot.className = "tyl-cat-dot";
    dot.style.background = cat.color || "#5b5b66";
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(cat.name));
    btn.addEventListener("click", () => assignCategory(item.id, cat.id));
    dd.appendChild(btn);
  });

  const rect = anchor.getBoundingClientRect();
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;
  dd.hidden = false;
}

async function assignCategory(id, catId) {
  DOM.catDropdown.hidden = true;
  await chrome.runtime.sendMessage({ action: "updateItemCategory", id, categoryId: catId });
  const i = allItems.find((x) => x.id === id);
  if (i) i.category = catId;
  renderList();
}

// ─── Pin / Unpin ─────────────────────────────────────────

async function togglePin(item) {
  const newVal = !item.pinned;
  await chrome.runtime.sendMessage({ action: "updateItemPinned", id: item.id, pinned: newVal });
  item.pinned = newVal;
  renderList();
}

// ─── Item Actions ────────────────────────────────────────

async function openItem(item) {
  await chrome.runtime.sendMessage({ action: "openAndDelete", id: item.id, url: item.url });
  if (settings.autoDelete) {
    allItems = allItems.filter((i) => i.id !== item.id);
    renderList();
  }
}

async function softDeleteItem(id, el) {
  el.classList.add("tyl-item--removing");
  el.addEventListener("animationend", async () => {
    const resp = await chrome.runtime.sendMessage({ action: "softDeleteItem", id });
    allItems = allItems.filter((i) => i.id !== id);
    selectedIds.delete(id);
    renderList();
    if (resp.token) showUndoToast(resp.token, 1);
  });
}

// ─── Undo Toast ──────────────────────────────────────────

function showUndoToast(token, count) {
  undoToken = token;
  const msg = count === 1
    ? tylT("popup_undo_single", currentLang)
    : tylT("popup_undo_multi", currentLang, { n: count });
  DOM.undoMsg.textContent = msg;
  DOM.undoToast.hidden = false;
  DOM.undoToast.classList.add("show");

  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndoToast, 5000);
}

function hideUndoToast() {
  DOM.undoToast.classList.remove("show");
  setTimeout(() => { DOM.undoToast.hidden = true; }, 200);
  undoToken = null;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
}

async function handleUndo() {
  if (!undoToken) return;
  const resp = await chrome.runtime.sendMessage({ action: "undoDelete", token: undoToken });
  hideUndoToast();
  if (resp.success) await loadItems();
}

// ─── Save + Close ────────────────────────────────────────

async function saveAndClose() {
  const cats = settings.categories || [];
  if (cats.length === 0) {
    await chrome.runtime.sendMessage({ action: "saveAndCloseCurrentTab" });
    return;
  }
  showSaveCloseDropdown();
}

function showSaveCloseDropdown() {
  const dd = DOM.scDropdown;
  dd.innerHTML = "";
  const cats = settings.categories || [];

  const uncatBtn = document.createElement("button");
  uncatBtn.className = "tyl-sc-opt";
  uncatBtn.textContent = tylT("popup_category_uncategorized", currentLang);
  uncatBtn.addEventListener("click", async () => {
    dd.hidden = true;
    await chrome.runtime.sendMessage({ action: "saveAndCloseCurrentTab", categoryId: null });
  });
  dd.appendChild(uncatBtn);

  cats.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "tyl-sc-opt";
    const dot = document.createElement("span");
    dot.className = "tyl-sc-dot";
    dot.style.background = c.color;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(c.name));
    btn.addEventListener("click", async () => {
      dd.hidden = true;
      await chrome.runtime.sendMessage({ action: "saveAndCloseCurrentTab", categoryId: c.id });
    });
    dd.appendChild(btn);
  });

  const sep = document.createElement("div");
  sep.className = "tyl-sc-sep";
  dd.appendChild(sep);

  const newBtn = document.createElement("button");
  newBtn.className = "tyl-sc-opt tyl-sc-opt--create";
  newBtn.textContent = tylT("popup_create_category", currentLang);
  newBtn.addEventListener("click", () => {
    dd.hidden = true;
    chrome.windows.create({ url: chrome.runtime.getURL("quick-category/quick-category.html"), type: "popup", width: 340, height: 290 });
  });
  dd.appendChild(newBtn);

  dd.hidden = false;
  const anchor = document.getElementById("save-close-btn");
  const rect = anchor.getBoundingClientRect();
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.left = `${Math.max(4, rect.left)}px`;
}

// ─── Save All Tabs ───────────────────────────────────────

async function saveAllTabs() {
  const resp = await chrome.runtime.sendMessage({ action: "saveAllTabs", categoryId: null });
  if (resp.added > 0) await loadItems();
}

// ─── Drag & Drop ─────────────────────────────────────────

function clearDragOver() { $$(".tyl-item.drag-over").forEach((e) => e.classList.remove("drag-over")); }

async function handleDrop(targetId) {
  if (!dragSrcId || dragSrcId === targetId) return;
  const srcIdx = allItems.findIndex((i) => i.id === dragSrcId);
  const tgtIdx = allItems.findIndex((i) => i.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [moved] = allItems.splice(srcIdx, 1);
  allItems.splice(tgtIdx, 0, moved);
  await chrome.runtime.sendMessage({ action: "reorderItems", items: allItems });
  renderList();
  dragSrcId = null;
}

// ─── Select / Bulk ───────────────────────────────────────

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  document.body.classList.toggle("select-mode", selectMode);
  $("#select-mode-btn").classList.toggle("active", selectMode);
  DOM.bulkBar.hidden = !selectMode;
  updateBulkCount();
  renderList();
}

function toggleItem(id, el) {
  if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove("checked"); }
  else { selectedIds.add(id); el.classList.add("checked"); }
  updateBulkCount();
}

function toggleSelectAll() {
  const visibleIds = [...DOM.list.querySelectorAll(".tyl-item")].map((e) => e.dataset.id);
  const allSel = visibleIds.every((id) => selectedIds.has(id));
  if (allSel) { visibleIds.forEach((id) => selectedIds.delete(id)); $("#bulk-select-all").textContent = tylT("popup_bulk_select_all", currentLang); }
  else { visibleIds.forEach((id) => selectedIds.add(id)); $("#bulk-select-all").textContent = tylT("popup_bulk_deselect_all", currentLang); }
  renderList();
}

function updateBulkCount() {
  DOM.bulkCount.textContent = tylT("popup_bulk_count", currentLang, { n: selectedIds.size });
}

async function bulkOpen() {
  const urls = allItems.filter((i) => selectedIds.has(i.id)).map((i) => i.url);
  if (urls.length === 0) return;
  await chrome.runtime.sendMessage({ action: "openItems", urls });
  if (settings.autoDelete) { allItems = allItems.filter((i) => !selectedIds.has(i.id)); selectedIds.clear(); renderList(); }
  toggleSelectMode();
}

async function bulkDelete() {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const resp = await chrome.runtime.sendMessage({ action: "softDeleteItems", ids });
  allItems = allItems.filter((i) => !selectedIds.has(i.id));
  const count = ids.length;
  selectedIds.clear();
  renderList();
  if (resp.token) showUndoToast(resp.token, count);
}

// ─── Reminder Dropdown ───────────────────────────────────

function showReminderDropdown(item, anchor) {
  const dd = DOM.reminderDropdown;
  dd.innerHTML = "";

  const presets = [
    { key: "reminder_1h", ms: 3600000 },
    { key: "reminder_tonight", computeMs: () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d.getTime() - Date.now(); } },
    { key: "reminder_tomorrow", computeMs: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime() - Date.now(); } },
  ];

  for (const p of presets) {
    const btn = document.createElement("button");
    btn.className = "tyl-reminder-opt";
    btn.textContent = tylT(p.key, currentLang);
    btn.addEventListener("click", async () => {
      const offset = p.computeMs ? p.computeMs() : p.ms;
      await setReminder(item.id, Date.now() + offset);
      dd.hidden = true;
    });
    dd.appendChild(btn);
  }

  const sep1 = document.createElement("div");
  sep1.className = "tyl-reminder-sep";
  dd.appendChild(sep1);

  const customWrap = document.createElement("div");
  customWrap.className = "tyl-reminder-custom";
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  let pickedYear = now.getFullYear();
  let pickedMonth = now.getMonth();
  let pickedDay = now.getDate();

  const calWrap = document.createElement("div");
  calWrap.className = "tyl-cal";

  function renderCal() {
    calWrap.innerHTML = "";
    const header = document.createElement("div");
    header.className = "tyl-cal-header";
    const prevBtn = document.createElement("button");
    prevBtn.className = "tyl-cal-nav";
    prevBtn.textContent = "\u25C0";
    prevBtn.addEventListener("click", (e) => { e.stopPropagation(); pickedMonth--; if (pickedMonth < 0) { pickedMonth = 11; pickedYear--; } renderCal(); });
    const title = document.createElement("span");
    title.className = "tyl-cal-title";
    title.textContent = new Date(pickedYear, pickedMonth).toLocaleDateString(LOCALE_MAP[currentLang] || "en-US", { month: "short", year: "numeric" });
    const nextBtn = document.createElement("button");
    nextBtn.className = "tyl-cal-nav";
    nextBtn.textContent = "\u25B6";
    nextBtn.addEventListener("click", (e) => { e.stopPropagation(); pickedMonth++; if (pickedMonth > 11) { pickedMonth = 0; pickedYear++; } renderCal(); });
    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    calWrap.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "tyl-cal-grid";
    const dayNames = tylT("cal_days_short", currentLang) || "Su,Mo,Tu,We,Th,Fr,Sa";
    dayNames.split(",").forEach((d) => { const lbl = document.createElement("span"); lbl.className = "tyl-cal-day-label"; lbl.textContent = d; grid.appendChild(lbl); });

    const first = new Date(pickedYear, pickedMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(pickedYear, pickedMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    for (let i = 0; i < startDay; i++) { const blank = document.createElement("span"); grid.appendChild(blank); }
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("button");
      cell.className = "tyl-cal-day";
      cell.textContent = d;
      const cellDate = new Date(pickedYear, pickedMonth, d);
      if (cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) cell.disabled = true;
      if (d === pickedDay && pickedMonth === now.getMonth() && pickedYear === now.getFullYear()) cell.classList.add("selected");
      if (`${pickedYear}-${pickedMonth}-${d}` === todayStr) cell.classList.add("today");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        pickedDay = d;
        calWrap.querySelectorAll(".tyl-cal-day.selected").forEach((c) => c.classList.remove("selected"));
        cell.classList.add("selected");
      });
      grid.appendChild(cell);
    }
    calWrap.appendChild(grid);
  }
  renderCal();
  customWrap.appendChild(calWrap);

  const timeRow = document.createElement("div");
  timeRow.className = "tyl-reminder-time-row";
  const hourSel = document.createElement("select");
  hourSel.className = "tyl-reminder-sel";
  for (let h = 0; h < 24; h++) { const o = document.createElement("option"); o.value = h; o.textContent = String(h).padStart(2, "0"); hourSel.appendChild(o); }
  hourSel.value = now.getHours();
  const colon = document.createElement("span");
  colon.className = "tyl-reminder-colon";
  colon.textContent = ":";
  const minSel = document.createElement("select");
  minSel.className = "tyl-reminder-sel";
  for (let m = 0; m < 60; m += 5) { const o = document.createElement("option"); o.value = m; o.textContent = String(m).padStart(2, "0"); minSel.appendChild(o); }
  const roundedMin = Math.ceil(now.getMinutes() / 5) * 5;
  minSel.value = roundedMin >= 60 ? 0 : roundedMin;
  timeRow.appendChild(hourSel);
  timeRow.appendChild(colon);
  timeRow.appendChild(minSel);
  customWrap.appendChild(timeRow);

  const setBtn = document.createElement("button");
  setBtn.className = "tyl-reminder-set-btn";
  setBtn.textContent = tylT("reminder_set_btn", currentLang);
  setBtn.addEventListener("click", async () => {
    const ts = new Date(pickedYear, pickedMonth, pickedDay, parseInt(hourSel.value), parseInt(minSel.value)).getTime();
    if (ts > Date.now()) { await setReminder(item.id, ts); dd.hidden = true; }
  });
  customWrap.appendChild(setBtn);
  dd.appendChild(customWrap);

  if (item.reminderAt) {
    const sep2 = document.createElement("div");
    sep2.className = "tyl-reminder-sep";
    dd.appendChild(sep2);
    const clearBtn = document.createElement("button");
    clearBtn.className = "tyl-reminder-opt danger";
    clearBtn.textContent = tylT("reminder_clear", currentLang);
    clearBtn.addEventListener("click", async () => { await clearReminder(item.id); dd.hidden = true; });
    dd.appendChild(clearBtn);
  }

  dd.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  if (spaceBelow >= ddHeight) {
    dd.style.top = `${rect.bottom + 4}px`;
  } else {
    dd.style.top = `${Math.max(4, rect.top - ddHeight - 4)}px`;
  }
  dd.style.left = `${Math.max(4, Math.min(rect.right - 280, window.innerWidth - 284))}px`;
}

async function setReminder(id, ts) {
  await chrome.runtime.sendMessage({ action: "setItemReminder", id, reminderAt: ts });
  const item = allItems.find((i) => i.id === id);
  if (item) item.reminderAt = ts;
  renderList();
}

async function clearReminder(id) {
  await chrome.runtime.sendMessage({ action: "clearItemReminder", id });
  const item = allItems.find((i) => i.id === id);
  if (item) item.reminderAt = null;
  renderList();
}

// ─── Note Dropdown ───────────────────────────────────

function closeNoteDropdown() { DOM.noteDropdown.hidden = true; }

function showNoteDropdown(item, anchor) {
  const dd = DOM.noteDropdown;
  dd.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tyl-note-header";
  const title = document.createElement("span");
  title.className = "tyl-note-header-title";
  title.textContent = item.note ? tylT("popup_note_edit", currentLang) : tylT("popup_note_add", currentLang);
  header.appendChild(title);
  const closeBtn = document.createElement("button");
  closeBtn.className = "tyl-note-close-btn";
  closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeNoteDropdown(); });
  header.appendChild(closeBtn);
  dd.appendChild(header);

  const body = document.createElement("div");
  body.className = "tyl-note-body";
  const ta = document.createElement("textarea");
  ta.className = "tyl-note-textarea";
  ta.placeholder = tylT("popup_note_placeholder", currentLang);
  ta.value = item.note || "";
  ta.rows = 4;
  ta.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeNoteDropdown(); } });
  body.appendChild(ta);
  dd.appendChild(body);

  const btnRow = document.createElement("div");
  btnRow.className = "tyl-note-btn-row";

  const saveBtn = document.createElement("button");
  saveBtn.className = "tyl-note-action-btn tyl-note-save";
  saveBtn.textContent = tylT("popup_note_save", currentLang);
  saveBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const text = ta.value.trim();
    await saveItemNote(item.id, text || null);
    closeNoteDropdown();
  });
  btnRow.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "tyl-note-action-btn tyl-note-cancel";
  cancelBtn.textContent = tylT("popup_note_cancel", currentLang);
  cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); closeNoteDropdown(); });
  btnRow.appendChild(cancelBtn);

  if (item.note) {
    const delBtn = document.createElement("button");
    delBtn.className = "tyl-note-action-btn tyl-note-del";
    delBtn.textContent = tylT("popup_note_delete", currentLang);
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await saveItemNote(item.id, null);
      closeNoteDropdown();
    });
    btnRow.appendChild(delBtn);
  }

  dd.appendChild(btnRow);
  dd.hidden = false;

  const rect = anchor.getBoundingClientRect();
  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  if (spaceBelow >= ddHeight) {
    dd.style.top = `${rect.bottom + 4}px`;
  } else {
    dd.style.top = `${Math.max(4, rect.top - ddHeight - 4)}px`;
  }
  dd.style.left = `${Math.max(4, Math.min(rect.right - 260, window.innerWidth - 264))}px`;
  ta.focus();
}

async function saveItemNote(id, note) {
  await chrome.runtime.sendMessage({ action: "updateItemNote", id, note });
  const item = allItems.find((i) => i.id === id);
  if (item) item.note = note;
  renderList();
}

// ─── Helpers ─────────────────────────────────────────────

function createDot() { const d = document.createElement("span"); d.className = "tyl-item-dot"; return d; }
function hostOf(url) { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } }

function fmtReminderDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = ts - now.getTime();
  if (diff < 3600000) return tylT("time_min_ago", currentLang, { n: Math.max(1, Math.ceil(diff / 60000)) }).replace(tylT("time_ago_suffix", currentLang) || "", "").trim();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString(LOCALE_MAP[currentLang] || "en-US", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  if (isTomorrow) return `${tylT("reminder_tomorrow_short", currentLang)} ${time}`;
  return d.toLocaleDateString(LOCALE_MAP[currentLang] || "en-US", { day: "numeric", month: "short" }) + " " + time;
}

const LOCALE_MAP = { en: "en-US", tr: "tr-TR", de: "de-DE", fr: "fr-FR", es: "es-ES", zh: "zh-CN", ja: "ja-JP" };

function fmtDate(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return tylT("time_just_now", currentLang);
  if (m < 60) return tylT("time_min_ago", currentLang, { n: m });
  if (h < 24) return tylT("time_hour_ago", currentLang, { n: h });
  if (d < 7) return tylT("time_day_ago", currentLang, { n: d });
  return new Date(ts).toLocaleDateString(LOCALE_MAP[currentLang] || "en-US", { day: "numeric", month: "short" });
}
