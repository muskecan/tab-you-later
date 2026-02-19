document.addEventListener("DOMContentLoaded", async () => {
  const lang = tylDetectBrowserLang();
  tylApplyI18n(lang);
});

document.getElementById("continue-btn").addEventListener("click", async () => {
  const syncEnabled =
    document.querySelector('input[name="storage"]:checked').value === "sync";

  const settings = {
    syncEnabled,
    autoDelete: false,
    language: tylDetectBrowserLang()
  };

  await chrome.runtime.sendMessage({
    action: "saveSettings",
    settings
  });

  const currentTab = await chrome.tabs.getCurrent();
  if (currentTab) {
    chrome.tabs.remove(currentTab.id);
  }
});
