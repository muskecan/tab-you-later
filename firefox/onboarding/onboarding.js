const COLORS = typeof TYL_CATEGORY_COLORS !== "undefined"
  ? TYL_CATEGORY_COLORS
  : ["#0060df","#058b00","#e27900","#e22850","#7542e5","#00b3a4","#e362a0","#4a6785"];

const TOTAL_STEPS = 4;

let currentStep = 1;
let lang = "en";
let createdCategories = [];
let selectedCatColor = COLORS[0];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

tylInitTheme();

document.addEventListener("DOMContentLoaded", async () => {
  lang = tylDetectBrowserLang();
  tylApplyI18n(lang);

  setupEncryptionToggle();
  setupNotificationStep();
  setupCategoryStep();
  await setupThemeStep();
  updateNav();
});

function goToStep(n) {
  currentStep = n;
  Array.from({ length: TOTAL_STEPS }, (_, idx) => idx + 1).forEach((i) => {
    const el = $(`#step-${i}`);
    el.hidden = i !== n;
  });
  $$(".ob-dot").forEach((d) => {
    d.classList.toggle("active", parseInt(d.dataset.step) === n);
  });
  updateNav();

  if (n === 2) refreshNotifStatus();
}

function updateNav() {
  const back = $("#ob-back-btn");
  const next = $("#ob-next-btn");
  const finish = $("#ob-finish-btn");
  const skip = $("#ob-skip-btn");

  back.hidden = currentStep === 1;
  next.hidden = currentStep === TOTAL_STEPS;
  finish.hidden = currentStep !== TOTAL_STEPS;
  skip.hidden = currentStep === 1;
}

$("#ob-next-btn").addEventListener("click", () => {
  if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
});

$("#ob-back-btn").addEventListener("click", () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

$("#ob-skip-btn").addEventListener("click", () => {
  if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
  else finishOnboarding();
});

$("#ob-finish-btn").addEventListener("click", () => finishOnboarding());

function setupEncryptionToggle() {
  const toggle = $("#ob-encrypt-toggle");
  const details = $("#ob-encrypt-details");

  toggle.addEventListener("change", () => {
    details.hidden = !toggle.checked;
  });
}

function setupNotificationStep() {
  const grantBtn = $("#ob-notif-grant");
  const remindersToggle = $("#ob-reminders-toggle");
  const dailyToggle = $("#ob-daily-toggle");
  const reminderSub = $("#ob-reminder-sub");
  const timeRow = $("#ob-time-row");

  grantBtn.addEventListener("click", async () => {
    try {
      await browser.permissions.request({ permissions: ["notifications"] });
    } catch {}
    refreshNotifStatus();
  });

  remindersToggle.addEventListener("change", () => {
    reminderSub.hidden = !remindersToggle.checked;
    if (remindersToggle.checked) {
      timeRow.hidden = !dailyToggle.checked;
    }
  });

  dailyToggle.addEventListener("change", () => {
    timeRow.hidden = !dailyToggle.checked;
  });
}

async function refreshNotifStatus() {
  const resp = await browser.runtime.sendMessage({ action: "hasNotificationPermission" });
  const granted = resp.granted;
  const badge = $("#ob-notif-status");
  const btn = $("#ob-notif-grant");
  const remindersToggle = $("#ob-reminders-toggle");

  const wasDisabled = remindersToggle.disabled;
  badge.classList.remove("granted", "needed");
  if (granted) {
    badge.textContent = tylT("onboarding_notif_granted", lang);
    badge.classList.add("granted");
    btn.hidden = true;
    remindersToggle.disabled = false;
    if (wasDisabled && !remindersToggle.checked) {
      remindersToggle.checked = true;
      $("#ob-reminder-sub").hidden = false;
      $("#ob-daily-toggle").checked = false;
      $("#ob-time-row").hidden = true;
    }
  } else {
    badge.textContent = tylT("onboarding_notif_needed", lang);
    badge.classList.add("needed");
    btn.hidden = false;
    remindersToggle.disabled = true;
    remindersToggle.checked = false;
    $("#ob-reminder-sub").hidden = true;
  }
}

function setupCategoryStep() {
  const nameInput = $("#ob-cat-name");
  const colorBtn = $("#ob-cat-color");
  const palette = $("#ob-color-palette");
  const addBtn = $("#ob-cat-add-btn");

  COLORS.forEach((c, i) => {
    const sw = document.createElement("div");
    sw.className = "ob-color-swatch" + (i === 0 ? " active" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      palette.querySelectorAll(".ob-color-swatch").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
      selectedCatColor = c;
      colorBtn.style.background = c;
      colorBtn.dataset.color = c;
      palette.hidden = true;
    });
    palette.appendChild(sw);
  });

  colorBtn.addEventListener("click", () => {
    palette.hidden = !palette.hidden;
  });

  nameInput.addEventListener("input", () => {
    addBtn.disabled = !nameInput.value.trim();
  });

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !addBtn.disabled) addBtn.click();
  });

  addBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    if (createdCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;

    const resp = await browser.runtime.sendMessage({
      action: "createCategory",
      name,
      color: selectedCatColor
    });

    if (resp.success) {
      createdCategories.push({ id: resp.id, name, color: selectedCatColor });
      nameInput.value = "";
      addBtn.disabled = true;
      renderCatList();
      nameInput.focus();
    }
  });
}

async function setupThemeStep() {
  const themeInputs = $$('input[name="theme"]');
  let initialTheme = "auto";

  try {
    const resp = await browser.runtime.sendMessage({ action: "getSettings" });
    initialTheme = tylNormalizeThemeMode(resp.settings && resp.settings.themeMode);
  } catch {
    initialTheme = "auto";
  }

  const selected = document.querySelector(`input[name="theme"][value="${initialTheme}"]`)
    || document.querySelector('input[name="theme"][value="auto"]');
  if (selected) selected.checked = true;
  tylApplyTheme(selected ? selected.value : "auto");

  themeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        tylApplyTheme(input.value);
      }
    });
  });
}

function renderCatList() {
  const list = $("#ob-cat-list");
  list.innerHTML = "";

  if (createdCategories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ob-hint";
    empty.textContent = tylT("onboarding_cat_empty", lang);
    list.appendChild(empty);
    return;
  }

  createdCategories.forEach((cat, idx) => {
    const chip = document.createElement("span");
    chip.className = "ob-cat-chip";

    const dot = document.createElement("span");
    dot.className = "ob-cat-chip-dot";
    dot.style.background = cat.color;
    chip.appendChild(dot);

    const label = document.createTextNode(cat.name);
    chip.appendChild(label);

    const del = document.createElement("button");
    del.className = "ob-cat-chip-del";
    del.innerHTML = "&times;";
    del.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ action: "deleteCategory", id: cat.id });
      createdCategories.splice(idx, 1);
      renderCatList();
    });
    chip.appendChild(del);

    list.appendChild(chip);
  });
}

async function finishOnboarding() {
  const syncEnabled = document.querySelector('input[name="storage"]:checked').value === "sync";
  const encryptEnabled = $("#ob-encrypt-toggle").checked;
  const passphrase = $("#ob-passphrase").value;

  const remindersEnabled = !$("#ob-reminders-toggle").disabled && $("#ob-reminders-toggle").checked;
  const dailySummaryEnabled = remindersEnabled ? $("#ob-daily-toggle").checked : true;
  const dailyReminderTime = remindersEnabled && dailySummaryEnabled ? $("#ob-daily-time").value || "20:00" : "20:00";
  const themeMode = tylNormalizeThemeMode((document.querySelector('input[name="theme"]:checked') || {}).value);

  const settings = {
    syncEnabled,
    autoDelete: false,
    language: lang,
    themeMode,
    remindersEnabled,
    dailySummaryEnabled,
    dailyReminderTime
  };

  await browser.runtime.sendMessage({ action: "saveSettings", settings });

  if (encryptEnabled && passphrase) {
    await browser.runtime.sendMessage({ action: "enableEncryption", passphrase });
  }

  const currentTab = await browser.tabs.getCurrent();
  if (currentTab) {
    browser.tabs.remove(currentTab.id);
  }
}
