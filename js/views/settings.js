/* views/settings.js — الإعدادات: الاسم، الثيم، المدينة، نسخ احتياطي واستعادة، تصفير */
(() => {
  "use strict";
  const R = window.R;
  const { h, db } = R;

  R.views.settings = {
    title: "الإعدادات",
    mount(root) {
      const s = db.settings();

      const nameIn = h("input", { type: "text", maxlength: 30, value: s.name, placeholder: "اسمك (اختياري)", "aria-label": "الاسم" });
      const themeSel = h("select", { "aria-label": "الثيم", value: s.theme },
        [["auto", "تلقائي (حسب جهازك)"], ["light", "نهاري ☀️"], ["dark", "ليلي 🌙"]].map(([v, l]) => h("option", { value: v }, l)));
      const cities = R.weather.cities.some((c) => c.name === s.city.name) ? R.weather.cities : [...R.weather.cities, s.city];
      const citySel = h("select", { "aria-label": "المدينة", value: s.city.name }, cities.map((c) => h("option", { value: c.name }, c.name)));

      const fileIn = h("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return R.ui.toast("الملف كبير مرة، لازم يكون أقل من ٥ ميجا");
        if (!confirm("الاستعادة بتستبدل كل بياناتك الحالية. تبي تكمل؟")) return;
        try {
          const r = await file.text().then((t) => db.importJSON(t));
          R.ui.toast(`تمت الاستعادة: ${R.fmt.int(r.tasks)} مهمة و${R.fmt.int(r.txs)} عملية ✅`);
        } catch (err) { R.ui.toast(err.message); }
      } });

      const saveSettings = () => {
        const c = R.weather.cities.find((x) => x.name === citySel.value) || s.city;
        db.setSettings({ name: nameIn.value, theme: themeSel.value, city: { name: c.name, lat: c.lat, lon: c.lon } });
        R.bus.emit("theme:change");
      };

      const field = (label, el) => h("label", { class: "field" }, h("span", {}, label), el);

      root.append(
        h("h1", { class: "page-title" }, "الإعدادات ⚙️"),
        h("section", { class: "card stack" },
          h("h2", {}, "عامة"),
          field("وش نناديك؟", nameIn), field("الثيم", themeSel), field("مدينتك الافتراضية", citySel),
          h("button", { type: "button", class: "btn", onClick: () => { saveSettings(); R.ui.toast("انحفظت الإعدادات 👌"); } }, "حفظ")),
        h("section", { class: "card stack" },
          h("h2", {}, "نسخة احتياطية"),
          h("p", { class: "muted" }, "بياناتك محفوظة في متصفحك فقط. نزّل نسخة احتياطية بين فترة وفترة عشان ما تضيع لو مسحت بيانات المتصفح."),
          h("div", { class: "row" },
            h("button", { type: "button", class: "btn", onClick: () => R.ui.download(`rafiqi-backup-${R.date.todayISO()}.json`, db.exportJSON(), "application/json;charset=utf-8") }, "تنزيل نسخة"),
            h("button", { type: "button", class: "btn ghost", onClick: () => fileIn.click() }, "استعادة من ملف"), fileIn)),
        h("section", { class: "card stack" },
          h("h2", {}, "اختصارات الكيبورد"),
          h("ul", { class: "kbd-list" },
            h("li", {}, h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "K"), " أو ", h("kbd", {}, "/"), " ← لوحة الأوامر"),
            h("li", {}, h("kbd", {}, "N"), " ← مهمة جديدة"))),
        h("section", { class: "card stack danger-zone" },
          h("h2", {}, "منطقة الخطر"),
          h("button", { type: "button", class: "btn danger", onClick: () => {
            if (confirm("بتنمسح كل بياناتك (مهام وفلوس وإعدادات). متأكد؟")) { db.reset(); R.bus.emit("theme:change"); R.ui.toast("تم تصفير كل شي"); location.hash = "#/home"; }
          } }, "امسح كل بياناتي")));
      return () => {};
    },
  };
})();
