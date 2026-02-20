const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  langSelect: $("#language-select"),
  badgeToggle: $("#badge-toggle"),
  faviconModeSelect: $("#favicon-mode-select"),
  syncToggle: $("#sync-toggle"),
  autoDeleteToggle: $("#autodelete-toggle"),
  autoExpireToggle: $("#autoexpire-toggle"),
  autoExpireDays: $("#autoexpire-days"),
  encryptStatus: $("#encrypt-status"),
  encryptForm: $("#encrypt-form"),
  encryptPassphrase: $("#encrypt-passphrase"),
  encryptActionBtn: $("#encrypt-action-btn"),
  notifPermStatus: $("#notif-perm-status"),
  notifPermBtn: $("#notif-perm-btn"),
  remindersToggle: $("#reminders-toggle"),
  dailySummaryRow: $("#daily-summary-row"),
  dailySummaryToggle: $("#daily-summary-toggle"),
  dailyTimeRow: $("#daily-time-row"),
  dailyReminderTime: $("#daily-reminder-time"),
  catList: $("#categories-list"),
  newCatName: $("#new-cat-name"),
  newCatColor: $("#new-cat-color"),
  colorPalette: $("#color-palette"),
  addCatBtn: $("#add-cat-btn"),
  importBtn: $("#import-btn"),
  exportBtn: $("#export-btn"),
  importFile: $("#import-file"),
  clearBtn: $("#clear-btn"),
  statusMsg: $("#status-msg"),
};

let settings = {};
let currentLang = "en";

document.addEventListener("DOMContentLoaded", async () => {
  populateLanguageSelector();
  populateColorPalette();

  currentLang = await tylGetLang();
  tylApplyI18n(currentLang);

  const resp = await chrome.runtime.sendMessage({ action: "getSettings" });
  settings = resp.settings;

  DOM.langSelect.value = currentLang;
  DOM.badgeToggle.checked = settings.badgeEnabled !== false;
  DOM.faviconModeSelect.value = settings.faviconMode || "off";
  applyFaviconModeLabels();
  DOM.syncToggle.checked = settings.syncEnabled === true;
  DOM.autoDeleteToggle.checked = settings.autoDelete === true;
  DOM.autoExpireToggle.checked = settings.autoExpireEnabled === true;
  DOM.autoExpireDays.value = settings.autoExpireDays || 30;

  renderCategories();
  await refreshEncryptionUI();
  await refreshReminderUI();

  DOM.langSelect.addEventListener("change", onLangChange);
  DOM.badgeToggle.addEventListener("change", () => { settings.badgeEnabled = DOM.badgeToggle.checked; save(); });
  DOM.faviconModeSelect.addEventListener("change", () => { settings.faviconMode = DOM.faviconModeSelect.value; save(); });
  DOM.syncToggle.addEventListener("change", () => { settings.syncEnabled = DOM.syncToggle.checked; save(); });
  DOM.autoDeleteToggle.addEventListener("change", () => { settings.autoDelete = DOM.autoDeleteToggle.checked; save(); });
  DOM.remindersToggle.addEventListener("change", onRemindersToggle);
  DOM.dailySummaryToggle.addEventListener("change", () => { settings.dailySummaryEnabled = DOM.dailySummaryToggle.checked; save(); updateReminderSubRows(); });
  DOM.dailyReminderTime.addEventListener("change", () => { settings.dailyReminderTime = DOM.dailyReminderTime.value; save(); });
  DOM.notifPermBtn.addEventListener("click", requestNotifPerm);
  DOM.autoExpireToggle.addEventListener("change", () => {
    settings.autoExpireEnabled = DOM.autoExpireToggle.checked;
    if (settings.autoExpireEnabled && !settings.autoExpireEnabledAt) settings.autoExpireEnabledAt = Date.now();
    if (!settings.autoExpireEnabled) settings.autoExpireEnabledAt = null;
    save();
  });
  DOM.autoExpireDays.addEventListener("change", () => {
    settings.autoExpireDays = Math.max(1, Math.min(365, parseInt(DOM.autoExpireDays.value) || 30));
    DOM.autoExpireDays.value = settings.autoExpireDays;
    save();
  });
  DOM.encryptActionBtn.addEventListener("click", handleEncryptAction);
  DOM.encryptPassphrase.addEventListener("keydown", (e) => { if (e.key === "Enter") handleEncryptAction(); });
  DOM.addCatBtn.addEventListener("click", addCategory);
  DOM.newCatName.addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
  DOM.newCatColor.addEventListener("click", toggleColorPalette);
  DOM.importBtn.addEventListener("click", () => DOM.importFile.click());
  DOM.importFile.addEventListener("change", handleImport);
  DOM.exportBtn.addEventListener("click", handleExport);
  DOM.clearBtn.addEventListener("click", clearAllData);
});

function populateLanguageSelector() {
  DOM.langSelect.innerHTML = "";
  for (const [code, name] of Object.entries(TYL_SUPPORTED_LANGUAGES)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    DOM.langSelect.appendChild(opt);
  }
}

async function onLangChange() {
  currentLang = DOM.langSelect.value;
  settings.language = currentLang;
  tylApplyI18n(currentLang);
  applyFaviconModeLabels();
  await save();
}

function applyFaviconModeLabels() {
  DOM.faviconModeSelect.querySelectorAll("option").forEach((opt) => {
    const key = opt.dataset.i18nText;
    if (key) opt.textContent = tylT(key, currentLang);
  });
}

async function save() {
  await chrome.runtime.sendMessage({ action: "saveSettings", settings: { ...settings } });
  showStatus(tylT("options_saved", currentLang));
}

async function refreshEncryptionUI() {
  const unlockResp = await chrome.runtime.sendMessage({ action: "isEncryptionUnlocked" });
  const isEnabled = settings.encryptionEnabled === true;
  const isUnlocked = unlockResp.unlocked;

  if (!isEnabled) {
    DOM.encryptStatus.textContent = tylT("encryption_status_off", currentLang);
    DOM.encryptStatus.className = "opt-encrypt-status off";
    DOM.encryptActionBtn.textContent = tylT("encryption_enable", currentLang);
    DOM.encryptActionBtn.dataset.mode = "enable";
    DOM.encryptPassphrase.value = "";
    DOM.encryptForm.hidden = false;
  } else if (isUnlocked) {
    DOM.encryptStatus.textContent = tylT("encryption_status_unlocked", currentLang);
    DOM.encryptStatus.className = "opt-encrypt-status on";
    DOM.encryptActionBtn.textContent = tylT("encryption_disable", currentLang);
    DOM.encryptActionBtn.dataset.mode = "disable";
    DOM.encryptPassphrase.value = "";
    DOM.encryptForm.hidden = false;
  } else {
    DOM.encryptStatus.textContent = tylT("encryption_status_locked", currentLang);
    DOM.encryptStatus.className = "opt-encrypt-status locked";
    DOM.encryptActionBtn.textContent = tylT("encryption_unlock", currentLang);
    DOM.encryptActionBtn.dataset.mode = "unlock";
    DOM.encryptPassphrase.value = "";
    DOM.encryptForm.hidden = false;
  }
}

async function handleEncryptAction() {
  const pass = DOM.encryptPassphrase.value;
  if (!pass) return;
  const mode = DOM.encryptActionBtn.dataset.mode;

  if (mode === "enable") {
    const resp = await chrome.runtime.sendMessage({ action: "enableEncryption", passphrase: pass });
    if (resp.success) {
      settings.encryptionEnabled = true;
      showStatus(tylT("encryption_enabled_msg", currentLang));
      await refreshEncryptionUI();
    }
  } else if (mode === "unlock") {
    const resp = await chrome.runtime.sendMessage({ action: "unlockEncryption", passphrase: pass });
    if (resp.success) {
      showStatus(tylT("encryption_unlocked_msg", currentLang));
      await refreshEncryptionUI();
    } else {
      showStatus(tylT("encryption_wrong_pass", currentLang));
    }
  } else if (mode === "disable") {
    if (!confirm(tylT("encryption_disable_confirm", currentLang))) return;
    const resp = await chrome.runtime.sendMessage({ action: "disableEncryption", passphrase: pass });
    if (resp.success) {
      settings.encryptionEnabled = false;
      showStatus(tylT("encryption_disabled_msg", currentLang));
      await refreshEncryptionUI();
    } else {
      showStatus(tylT("encryption_wrong_pass", currentLang));
    }
  }
}

function renderCategories() {
  DOM.catList.innerHTML = "";
  (settings.categories || []).forEach((cat) => {
    const row = document.createElement("div");
    row.className = "opt-cat-item";

    const swatch = document.createElement("div");
    swatch.className = "opt-cat-color";
    swatch.style.background = cat.color || "#5b5b66";
    row.appendChild(swatch);

    const name = document.createElement("span");
    name.className = "opt-cat-name";
    name.textContent = cat.name;
    row.appendChild(name);

    const editBtn = document.createElement("button");
    editBtn.className = "opt-cat-edit";
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    editBtn.addEventListener("click", () => enterEditMode(row, cat));
    row.appendChild(editBtn);

    const del = document.createElement("button");
    del.className = "opt-cat-del";
    del.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    del.addEventListener("click", () => deleteCategory(cat.id));
    row.appendChild(del);

    DOM.catList.appendChild(row);
  });
}

function enterEditMode(row, cat) {
  row.innerHTML = "";
  row.classList.add("opt-cat-item--editing");

  let editColor = cat.color || "#5b5b66";

  const colorBtn = document.createElement("div");
  colorBtn.className = "opt-cat-color";
  colorBtn.style.background = editColor;
  row.appendChild(colorBtn);

  const palette = document.createElement("div");
  palette.className = "opt-edit-palette";
  palette.hidden = true;
  TYL_CATEGORY_COLORS.forEach((c) => {
    const sw = document.createElement("div");
    sw.className = "opt-color-swatch" + (c === editColor ? " active" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      editColor = c;
      colorBtn.style.background = c;
      palette.querySelectorAll(".opt-color-swatch").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
      palette.hidden = true;
    });
    palette.appendChild(sw);
  });

  colorBtn.addEventListener("click", () => { palette.hidden = !palette.hidden; });

  const input = document.createElement("input");
  input.type = "text";
  input.className = "opt-cat-input";
  input.value = cat.name;
  input.maxLength = 30;
  row.appendChild(input);

  const saveBtn = document.createElement("button");
  saveBtn.className = "opt-btn-sm opt-btn-sm--accent";
  saveBtn.textContent = tylT("category_edit_save", currentLang);
  saveBtn.addEventListener("click", async () => {
    const newName = input.value.trim();
    if (!newName) return;
    await chrome.runtime.sendMessage({ action: "updateCategory", id: cat.id, name: newName, color: editColor });
    const resp = await chrome.runtime.sendMessage({ action: "getSettings" });
    settings = resp.settings;
    renderCategories();
  });
  row.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "opt-btn-sm";
  cancelBtn.textContent = tylT("category_edit_cancel", currentLang);
  cancelBtn.addEventListener("click", () => renderCategories());
  row.appendChild(cancelBtn);

  row.appendChild(palette);
  input.focus();
  input.select();
}

async function addCategory() {
  const name = DOM.newCatName.value.trim();
  if (!name) return;
  const color = DOM.newCatColor.dataset.color || "#0060df";
  if (!settings.categories) settings.categories = [];
  settings.categories.push({ id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(), name, color });
  DOM.newCatName.value = "";
  renderCategories();
  await save();
}

async function deleteCategory(id) {
  if (!confirm(tylT("category_delete_confirm", currentLang))) return;
  settings.categories = (settings.categories || []).filter((c) => c.id !== id);
  renderCategories();
  await save();
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function populateColorPalette() {
  DOM.colorPalette.innerHTML = "";
  TYL_CATEGORY_COLORS.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "opt-color-swatch";
    swatch.style.background = color;
    swatch.addEventListener("click", () => {
      DOM.newCatColor.style.background = color;
      DOM.newCatColor.dataset.color = color;
      DOM.colorPalette.querySelectorAll(".opt-color-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      DOM.colorPalette.hidden = true;
    });
    DOM.colorPalette.appendChild(swatch);
  });
}

function toggleColorPalette() { DOM.colorPalette.hidden = !DOM.colorPalette.hidden; }

async function handleImport() {
  const file = DOM.importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : (data.items || []);
    if (!Array.isArray(entries)) throw new Error("Invalid");
    const resp = await chrome.runtime.sendMessage({ action: "importItems", entries });
    showStatus(tylT("import_success", currentLang, { n: resp.imported }));
  } catch { showStatus(tylT("import_error", currentLang)); }
  DOM.importFile.value = "";
}

async function handleExport() {
  const resp = await chrome.runtime.sendMessage({ action: "exportItems" });
  const blob = new Blob([JSON.stringify({ items: resp.items, settings: resp.settings }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tab-you-later-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearAllData() {
  if (!confirm(tylT("options_clear_confirm", currentLang))) return;
  await chrome.storage.local.remove("tylItems");
  await chrome.storage.sync.remove("tylItems");
  showStatus(tylT("options_cleared", currentLang));
}

async function refreshReminderUI() {
  const resp = await chrome.runtime.sendMessage({ action: "hasNotificationPermission" });
  const granted = resp.granted;

  DOM.notifPermStatus.classList.remove("granted", "denied", "unknown");
  if (granted) {
    DOM.notifPermStatus.textContent = tylT("reminders_perm_granted", currentLang);
    DOM.notifPermStatus.classList.add("granted");
    DOM.notifPermBtn.hidden = true;
  } else {
    DOM.notifPermStatus.textContent = tylT("reminders_perm_needed", currentLang);
    DOM.notifPermStatus.classList.add("unknown");
    DOM.notifPermBtn.hidden = false;
  }

  DOM.remindersToggle.checked = settings.remindersEnabled === true;
  DOM.dailySummaryToggle.checked = settings.dailySummaryEnabled !== false;
  DOM.dailyReminderTime.value = settings.dailyReminderTime || "20:00";

  if (!granted) {
    DOM.remindersToggle.disabled = true;
  } else {
    DOM.remindersToggle.disabled = false;
  }

  updateReminderSubRows();
}

function updateReminderSubRows() {
  const show = settings.remindersEnabled === true;
  DOM.dailySummaryRow.hidden = !show;
  DOM.dailyTimeRow.hidden = !(show && settings.dailySummaryEnabled !== false);
}

async function onRemindersToggle() {
  const hasPerm = (await chrome.runtime.sendMessage({ action: "hasNotificationPermission" })).granted;
  if (!hasPerm) {
    DOM.remindersToggle.checked = false;
    return;
  }
  settings.remindersEnabled = DOM.remindersToggle.checked;
  updateReminderSubRows();
  await save();
}

async function requestNotifPerm() {
  try {
    const granted = await chrome.permissions.request({ permissions: ["notifications"] });
    if (granted) {
      showStatus(tylT("reminders_perm_granted", currentLang));
    }
  } catch {  }
  await refreshReminderUI();
}

let statusTimeout = null;

function showStatus(message) {
  DOM.statusMsg.textContent = message;
  DOM.statusMsg.hidden = false;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => { DOM.statusMsg.hidden = true; }, 2500);
}
