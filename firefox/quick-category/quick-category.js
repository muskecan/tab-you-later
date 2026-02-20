const COLORS = typeof TYL_CATEGORY_COLORS !== "undefined"
  ? TYL_CATEGORY_COLORS
  : ["#0060df","#058b00","#e27900","#e22850","#7542e5","#00b3a4","#e362a0","#4a6785"];

const QC_T = {
  en: { title: "Create Category", placeholder: "Category name", save: "Save", cancel: "Cancel", empty: "Enter a name", duplicate: "Category already exists", savePage: "Save current page to this category" },
  tr: { title: "Kategori Oluştur", placeholder: "Kategori adı", save: "Kaydet", cancel: "İptal", empty: "Bir ad girin", duplicate: "Bu kategori zaten var", savePage: "Mevcut sayfayı bu kategoriye kaydet" },
  de: { title: "Kategorie erstellen", placeholder: "Kategoriename", save: "Speichern", cancel: "Abbrechen", empty: "Name eingeben", duplicate: "Kategorie existiert bereits", savePage: "Aktuelle Seite in diese Kategorie speichern" },
  fr: { title: "Créer une catégorie", placeholder: "Nom de la catégorie", save: "Enregistrer", cancel: "Annuler", empty: "Entrez un nom", duplicate: "Catégorie déjà existante", savePage: "Enregistrer la page dans cette catégorie" },
  es: { title: "Crear categoría", placeholder: "Nombre de categoría", save: "Guardar", cancel: "Cancelar", empty: "Ingrese un nombre", duplicate: "La categoría ya existe", savePage: "Guardar la página actual en esta categoría" },
  zh: { title: "创建分类", placeholder: "分类名称", save: "保存", cancel: "取消", empty: "请输入名称", duplicate: "分类已存在", savePage: "将当前页面保存到此分类" },
  ja: { title: "カテゴリを作成", placeholder: "カテゴリ名", save: "保存", cancel: "キャンセル", empty: "名前を入力", duplicate: "カテゴリは既に存在します", savePage: "現在のページをこのカテゴリに保存" }
};

let selectedColor = COLORS[0];
let lang = "en";

document.addEventListener("DOMContentLoaded", async () => {
  const resp = await browser.runtime.sendMessage({ action: "getLang" });
  lang = resp.lang || "en";
  const t = QC_T[lang] || QC_T.en;

  document.getElementById("qc-title").textContent = t.title;
  document.getElementById("qc-name").placeholder = t.placeholder;
  document.getElementById("qc-save").textContent = t.save;
  document.getElementById("qc-cancel").textContent = t.cancel;
  document.getElementById("qc-save-page-label").textContent = t.savePage;

  const palette = document.getElementById("qc-palette");
  COLORS.forEach((c, i) => {
    const sw = document.createElement("div");
    sw.className = "qc-swatch" + (i === 0 ? " active" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      palette.querySelectorAll(".qc-swatch").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
      selectedColor = c;
    });
    palette.appendChild(sw);
  });

  const nameInput = document.getElementById("qc-name");
  const saveBtn = document.getElementById("qc-save");
  const errorEl = document.getElementById("qc-error");

  nameInput.addEventListener("input", () => {
    saveBtn.disabled = !nameInput.value.trim();
    errorEl.hidden = true;
  });

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click();
    if (e.key === "Escape") window.close();
  });

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { showError(t.empty); return; }

    const sResp = await browser.runtime.sendMessage({ action: "getSettings" });
    const cats = sResp.settings.categories || [];
    if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      showError(t.duplicate);
      return;
    }

    const saveCurrentTab = document.getElementById("qc-save-page").checked;
    await browser.runtime.sendMessage({ action: "createCategory", name, color: selectedColor, saveCurrentTab });
    window.close();
  });

  document.getElementById("qc-cancel").addEventListener("click", () => window.close());
  nameInput.focus();
});

function showError(msg) {
  const el = document.getElementById("qc-error");
  el.textContent = msg;
  el.hidden = false;
}
