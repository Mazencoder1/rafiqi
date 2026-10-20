/* views/dashboard.js — الرئيسية: نظرة سريعة على يومك (صلاة، طقس، مهام، فلوس) */
(() => {
  "use strict";
  const R = window.R;
  const { h, db, date, fmt } = R;

  function greeting() {
    const hr = new Date().getHours();
    const hello = hr < 4 ? "سهران لين الحين؟" : hr < 12 ? "صباح الخير" : hr < 17 ? "يا هلا والله" : "مساك الله بالخير";
    const name = db.settings().name;
    return name && hr >= 4 ? `${hello} يا ${name}` : hello;
  }

  R.views.home = {
    title: "الرئيسية",
    mount(root) {
      let alive = true;
      const city = () => db.settings().city;

      const hello = h("h1", { class: "page-title" });
      const dates = h("p", { class: "muted" });

      // ---- الصلاة ----
      const prayerBody = h("div", { class: "card-body" }, h("p", { class: "muted" }, "لحظة، أجيب لك أوقات الصلاة... ⏳"));
      // ---- الطقس ----
      const wxBody = h("div", { class: "card-body" }, h("p", { class: "muted" }, "لحظة، أجيب الجو... ⏳"));
      // ---- المهام ----
      const taskBody = h("div", { class: "card-body" });
      const quickIn = h("input", { type: "text", maxlength: 120, placeholder: "أضف مهمة سريعة لليوم...", "aria-label": "مهمة سريعة" });
      const quick = h("form", { class: "row", autocomplete: "off", onSubmit: (e) => {
        e.preventDefault();
        if (db.addTask({ title: quickIn.value, due: date.todayISO() })) quickIn.value = "";
      } }, quickIn, h("button", { type: "submit", class: "btn" }, "أضف"));
      // ---- الفلوس ----
      const moneyBody = h("div", { class: "card-body" });

      const card = (title, link, ...kids) => h("section", { class: "card" },
        h("div", { class: "row between" }, h("h2", {}, title), h("a", { class: "link", href: link }, "المزيد ›")), ...kids);

      root.append(hello, dates, h("div", { class: "grid2" },
        card("🕌 الصلاة", "#/weather", prayerBody),
        card("🌤️ الجو", "#/weather", wxBody),
        card("✅ مهام اليوم", "#/tasks", taskBody, quick),
        card("💰 هالشهر", "#/money", moneyBody)));

      // ---- المهام ----
      function renderTasks() {
        const t0 = date.todayISO();
        const s = db.taskStats(t0);
        const due = db.data.tasks.filter((t) => !t.done && t.due && t.due <= t0).slice(0, 4);
        const parts = [];
        parts.push(h("p", { class: "big-line" },
          s.active === 0 ? "ما باقي عليك شي، الله يعطيك العافية ☕" : `باقي لك ${R.count(s.active, ["مهمة وحدة", "مهمتين", "مهام", "مهمة"])}`));
        if (s.overdue) parts.push(h("p", { class: "pill bad" }, `${R.count(s.overdue, ["مهمة متأخرة", "مهمتين متأخرتين", "مهام متأخرة", "مهمة متأخرة"])} ⚠️`));
        parts.push(h("ul", { class: "mini" }, due.map((t) =>
          h("li", {}, h("span", {}, t.title), h("small", { class: "muted" }, date.relative(t.due))))));
        taskBody.replaceChildren(...parts);
      }

      // ---- الفلوس ----
      function renderMoney() {
        const m = date.month(date.todayISO());
        const { income, expense, balance } = db.monthSummary(m);
        const budget = db.getBudget(m);
        const kids = [
          h("div", { class: "grid3 mini-stats" },
            h("div", {}, h("small", { class: "muted" }, "دخل"), h("b", {}, fmt.money(income))),
            h("div", {}, h("small", { class: "muted" }, "مصروف"), h("b", {}, fmt.money(expense))),
            h("div", {}, h("small", { class: "muted" }, "الباقي"), h("b", { class: balance < 0 ? "neg" : "" }, fmt.money(balance)))),
        ];
        if (budget) {
          const r = expense / budget;
          kids.push(h("div", { class: "bar", "aria-hidden": "true" }, h("div", { class: `fill ${r >= 1 ? "bad" : r >= 0.8 ? "warn" : "good"}`, style: { width: Math.min(100, r * 100) + "%" } })));
          kids.push(h("p", { class: "muted" }, r >= 1 ? `تجاوزت الميزانية بـ ${fmt.money(expense - budget)}` : `باقي ${fmt.money(budget - expense)} من الميزانية`));
        } else {
          kids.push(h("p", { class: "muted" }, "حط لك ميزانية للشهر عشان نتابعك 😉"));
        }
        moneyBody.replaceChildren(...kids);
      }

      // ---- الصلاة ----
      let timings = null;
      function renderPrayer(stale = false) {
        if (!timings) return;
        const next = R.weather.nextPrayer(timings);
        prayerBody.replaceChildren(
          h("p", { class: "big-line" }, `${next.label}${next.tomorrow ? " (بكرة)" : ""} بعد ${fmt.duration(next.minutes)}`),
          h("p", { class: "muted" }, `الساعة ${fmt.clock(next.time)} · ${city().name}${stale ? " · (آخر نسخة محفوظة)" : ""}`),
          h("div", { class: "prayers" }, R.weather.prayers.map(([k, label]) =>
            h("div", { class: `prayer${k === next.key ? " next" : ""}` }, h("small", {}, label), h("b", {}, fmt.clock(at(timings[k])))))));
      }
      const at = (hhmm) => { const [hh, mm] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); return d; };

      async function loadPrayer() {
        try {
          const { data, stale } = await R.weather.prayer(city().lat, city().lon);
          if (!alive) return;
          timings = data; renderPrayer(stale);
        } catch {
          if (alive) prayerBody.replaceChildren(h("p", { class: "muted" }, "ما قدرت أجيب أوقات الصلاة، تأكد من النت وجرب بعد شوي 📶"));
        }
      }

      async function loadWeather() {
        try {
          const { data, stale } = await R.weather.forecast(city().lat, city().lon);
          if (!alive) return;
          const cur = data.current;
          const d = R.weather.describe(cur.weather_code, cur.is_day);
          wxBody.replaceChildren(
            h("div", { class: "row between" },
              h("div", {}, h("p", { class: "big-line" }, `${d.icon} ${fmt.deg(cur.temperature_2m)}`), h("p", { class: "muted" }, `${d.text} · ${city().name}${stale ? " · (آخر نسخة محفوظة)" : ""}`)),
              h("div", { class: "muted tr" }, h("small", {}, "العظمى / الصغرى"), h("b", {}, `${fmt.deg(data.daily.temperature_2m_max[0])} / ${fmt.deg(data.daily.temperature_2m_min[0])}`))),
            h("p", { class: "advice" }, R.weather.advice({ temp: cur.temperature_2m, code: cur.weather_code })));
        } catch {
          if (alive) wxBody.replaceChildren(h("p", { class: "muted" }, "ما قدرت أجيب الجو، تأكد من النت وجرب بعد شوي 📶"));
        }
      }

      hello.textContent = greeting();
      dates.textContent = `${fmt.hijri()} · ${fmt.day(new Date())}`;
      renderTasks(); renderMoney(); loadPrayer(); loadWeather();

      const tick = setInterval(() => renderPrayer(), 30000); // تحديث العدّاد التنازلي
      const offData = R.bus.on("data:change", () => { hello.textContent = greeting(); renderTasks(); renderMoney(); });
      return () => { alive = false; clearInterval(tick); offData(); };
    },
  };
})();
