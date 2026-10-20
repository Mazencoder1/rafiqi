/* app.js — الراوتر، الثيم، لوحة الأوامر، الاختصارات، PWA */
(() => {
  "use strict";
  const R = window.R;
  const { h, db } = R;

  const ROUTES = [
    { id: "home", label: "الرئيسية", icon: "🏠" },
    { id: "tasks", label: "المهام", icon: "✅" },
    { id: "money", label: "الفلوس", icon: "💰" },
    { id: "weather", label: "الطقس", icon: "🌤️" },
    { id: "settings", label: "الإعدادات", icon: "⚙️" },
  ];

  const main = R.$("#app");
  const navEl = R.$("#nav");
  let cleanup = null;

  // ---------- الثيم ----------
  const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const pref = db.settings().theme;
    const dark = pref === "dark" || (pref === "auto" && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = R.$('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0f1a14" : "#006c35";
    R.$("#themeBtn").textContent = dark ? "☀️" : "🌙";
  }
  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    db.setSettings({ theme: dark ? "light" : "dark" });
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", () => { applyTheme(); R.bus.emit("theme:change"); });
  R.bus.on("data:change", () => { applyTheme(); R.bus.emit("theme:change"); });
  R.$("#themeBtn").addEventListener("click", toggleTheme);

  // ---------- الراوتر ----------
  const routeId = () => {
    const id = location.hash.replace(/^#\/?/, "");
    return ROUTES.some((r) => r.id === id) ? id : "home";
  };

  function renderNav(active) {
    navEl.replaceChildren(...ROUTES.map((r) =>
      h("a", { href: `#/${r.id}`, class: r.id === active ? "active" : "", "aria-current": r.id === active ? "page" : null },
        h("span", { class: "ico", "aria-hidden": "true" }, r.icon), h("span", {}, r.label))));
  }

  function route() {
    const id = routeId();
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    main.replaceChildren();
    const view = R.views[id];
    document.title = `${view.title} · رفيقي`;
    renderNav(id);
    try { cleanup = view.mount(main) || null; }
    catch (err) {
      console.error(err);
      main.append(h("p", { class: "banner bad" }, "صار خلل غير متوقع في هالصفحة. جرب تحدّث الصفحة."));
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---------- لوحة الأوامر ----------
  const palette = R.$("#palette");
  const palIn = R.$("#palInput");
  const palList = R.$("#palList");
  let palSel = 0;
  let palItems = [];

  const COMMANDS = [
    ...ROUTES.map((r) => ({ label: `روح لـ ${r.label}`, icon: r.icon, run: () => (location.hash = `#/${r.id}`) })),
    { label: "مهمة جديدة", icon: "➕", run: newTask },
    { label: "بدّل الثيم (نهاري/ليلي)", icon: "🌓", run: toggleTheme },
    { label: "نزّل نسخة احتياطية", icon: "💾", run: () => R.ui.download(`rafiqi-backup-${R.date.todayISO()}.json`, db.exportJSON(), "application/json;charset=utf-8") },
  ];

  function renderPalette() {
    const q = palIn.value.trim();
    palItems = COMMANDS.filter((c) => c.label.includes(q));
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    palList.replaceChildren(...palItems.map((c, i) =>
      h("li", { role: "option", class: i === palSel ? "sel" : "", "aria-selected": i === palSel ? "true" : "false",
        onClick: () => runCommand(c) }, h("span", { "aria-hidden": "true" }, c.icon), h("span", {}, c.label))));
    if (!palItems.length) palList.append(h("li", { class: "muted" }, "ما لقيت أمر بهالاسم"));
  }
  function runCommand(c) { closePalette(); c.run(); }
  function openPalette() { palIn.value = ""; palSel = 0; renderPalette(); R.ui.openDialog(palette); palIn.focus(); }
  function closePalette() { if (palette.close) palette.close(); else palette.removeAttribute("open"); }
  palIn.addEventListener("input", () => { palSel = 0; renderPalette(); });
  palIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); renderPalette(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(palSel - 1, 0); renderPalette(); }
    else if (e.key === "Enter" && palItems[palSel]) { e.preventDefault(); runCommand(palItems[palSel]); }
  });
  palette.addEventListener("click", (e) => { if (e.target === palette) closePalette(); });
  R.$("#paletteBtn").addEventListener("click", openPalette);

  function newTask() {
    const focusInput = () => { const el = R.$("#newTask"); if (el) el.focus(); };
    if (routeId() === "tasks") return focusInput();
    // مستمع الراوتر مسجّل أول، فيشتغل قبل هذا المستمع ويكون النموذج جاهز
    window.addEventListener("hashchange", focusInput, { once: true });
    location.hash = "#/tasks";
  }

  // ---------- اختصارات الكيبورد ----------
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.target.isContentEditable;
    const dialogOpen = !!document.querySelector("dialog[open]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (typing || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); openPalette(); }
    else if (e.key.toLowerCase() === "n" || e.key === "ى") { e.preventDefault(); newTask(); } // ى = حرف N في الكيبورد العربي
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  applyTheme();
  route();
})();
