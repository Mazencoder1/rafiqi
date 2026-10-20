/* views/weather.js — الطقس + أوقات الصلاة لأي مدينة */
(() => {
  "use strict";
  const R = window.R;
  const { h, db, fmt, date } = R;

  R.views.weather = {
    title: "الطقس والصلاة",
    mount(root) {
      let alive = true;
      let reqId = 0; // نتجاهل الردود القديمة لو غيّر المدينة بسرعة

      const status = h("p", { class: "banner", hidden: true, role: "status" });
      const cityIn = h("input", { type: "search", placeholder: "اكتب اسم مدينتك... (مثال: الرياض، أبها)", "aria-label": "اسم المدينة", required: true, autocomplete: "off" });
      const suggest = h("ul", { class: "suggest", hidden: true });
      const searchForm = h("form", { class: "row", onSubmit: onSearch }, cityIn,
        h("button", { type: "submit", class: "btn" }, "دوّر"),
        h("button", { type: "button", class: "btn ghost", title: "استخدم موقعي", "aria-label": "استخدم موقعي", onClick: locate }, "📍"));
      const chips = h("div", { class: "chips" }, R.weather.cities.map((c) =>
        h("button", { type: "button", class: "chip", onClick: () => pick(c) }, c.name)));

      const place = h("h2"), desc = h("p", { class: "muted" }), temp = h("strong", { class: "temp" });
      const advice = h("p", { class: "advice" });
      const feels = h("b"), humidity = h("b"), wind = h("b");
      const current = h("section", { class: "card", hidden: true },
        h("div", { class: "row between" }, h("div", {}, place, desc), temp), advice,
        h("div", { class: "grid3 mini-stats" },
          h("div", {}, h("small", { class: "muted" }, "الإحساس"), feels),
          h("div", {}, h("small", { class: "muted" }, "الرطوبة"), humidity),
          h("div", {}, h("small", { class: "muted" }, "الرياح"), wind)));
      const hourly = h("div", { class: "hourly" });
      const hourlyCard = h("section", { class: "card", hidden: true }, h("h3", {}, "الساعات الجاية"), hourly);
      const daily = h("ul", { class: "daily" });
      const dailyCard = h("section", { class: "card", hidden: true }, h("h3", {}, "الأسبوع كله"), daily);
      const prayerGrid = h("div", { class: "prayers" });
      const nextLine = h("p", { class: "big-line" });
      const prayerCard = h("section", { class: "card", hidden: true }, h("h3", {}, "🕌 أوقات الصلاة"), nextLine, prayerGrid);

      root.append(h("h1", { class: "page-title" }, "الطقس والصلاة 🌤️"), searchForm, suggest, chips, status,
        h("div", { class: "grid2" }, h("div", { class: "stack" }, current, prayerCard), h("div", { class: "stack" }, hourlyCard, dailyCard)),
        h("p", { class: "hint" }, "الطقس من Open-Meteo وأوقات الصلاة من Aladhan (تقويم أم القرى). بدون مفاتيح API."));

      const setStatus = (text, bad = false) => { status.hidden = !text; status.textContent = text || ""; status.className = "banner" + (bad ? " bad" : ""); };

      function showWeather(city, data, stale) {
        const cur = data.current;
        const d = R.weather.describe(cur.weather_code, cur.is_day);
        place.textContent = city.region ? `${city.name} — ${city.region}` : city.name;
        desc.textContent = d.text + (stale ? " · (آخر نسخة محفوظة)" : "");
        temp.textContent = `${d.icon} ${fmt.deg(cur.temperature_2m)}`;
        advice.textContent = R.weather.advice({ temp: cur.temperature_2m, code: cur.weather_code });
        feels.textContent = fmt.deg(cur.apparent_temperature);
        humidity.textContent = fmt.percent(cur.relative_humidity_2m);
        wind.textContent = `${fmt.int(cur.wind_speed_10m)} كم/س · ${R.weather.windNote(cur.wind_speed_10m)}`;
        current.hidden = false;

        const start = Math.max(0, data.hourly.time.findIndex((t) => t >= cur.time));
        hourly.replaceChildren(...data.hourly.time.slice(start, start + 12).map((t, i) => {
          const idx = start + i;
          const hd = R.weather.describe(data.hourly.weather_code[idx], data.hourly.is_day[idx]);
          return h("div", { class: "hour" }, h("small", { class: "muted" }, fmt.hour(new Date(t))), h("span", {}, hd.icon), h("b", {}, fmt.deg(data.hourly.temperature_2m[idx])));
        }));
        hourlyCard.hidden = false;

        daily.replaceChildren(...data.daily.time.map((t, i) => {
          const p = data.daily.precipitation_probability_max[i];
          return h("li", {},
            h("span", { class: "dname" }, i === 0 ? "اليوم" : fmt.weekday(new Date(t + "T12:00:00"))),
            h("span", {}, R.weather.describe(data.daily.weather_code[i]).icon),
            h("small", { class: "muted" }, p ? `💧 ${fmt.percent(p)}` : ""),
            h("b", {}, `${fmt.deg(data.daily.temperature_2m_max[i])} / ${fmt.deg(data.daily.temperature_2m_min[i])}`));
        }));
        dailyCard.hidden = false;
      }

      function showPrayer(timings) {
        const next = R.weather.nextPrayer(timings);
        const at = (hhmm) => { const [hh, mm] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); return d; };
        nextLine.textContent = `${next.label}${next.tomorrow ? " (بكرة)" : ""} بعد ${fmt.duration(next.minutes)}`;
        const rows = [["Fajr", "الفجر"], ["Sunrise", "الشروق"], ...R.weather.prayers.slice(1)];
        prayerGrid.replaceChildren(...rows.map(([k, label]) =>
          h("div", { class: `prayer${k === next.key ? " next" : ""}` }, h("small", {}, label), h("b", {}, fmt.clock(at(timings[k]))))));
        prayerCard.hidden = false;
      }

      async function pick(city, { remember = true } = {}) {
        const id = ++reqId;
        suggest.hidden = true;
        setStatus("لحظة، أجيب لك الجو وأوقات الصلاة... ⏳");
        if (remember) db.setSettings({ city: { name: city.name, lat: city.lat, lon: city.lon } });
        const [wx, pr] = await Promise.allSettled([R.weather.forecast(city.lat, city.lon), R.weather.prayer(city.lat, city.lon)]);
        if (!alive || id !== reqId) return;
        if (wx.status === "fulfilled") showWeather(city, wx.value.data, wx.value.stale);
        if (pr.status === "fulfilled") showPrayer(pr.value.data);
        if (wx.status === "rejected" && pr.status === "rejected") {
          setStatus(navigator.onLine ? "صار خلل وما قدرت أجيب البيانات. جرب بعد شوي." : "ما فيه نت عندك، تأكد من الاتصال وجرب مرة ثانية 📶", true);
        } else setStatus("");
      }

      async function onSearch(e) {
        e.preventDefault();
        const q = cityIn.value.trim();
        if (!q) return;
        setStatus("أدوّر على المدينة... 🔎");
        try {
          const results = await R.weather.search(q);
          if (!alive) return;
          if (!results.length) return setStatus("ما لقيت هالمدينة، تأكد من الاسم وجرب ثاني.", true);
          if (results.length === 1) return pick(results[0]);
          setStatus("");
          suggest.replaceChildren(...results.map((r) => h("li", {}, h("button", { type: "button", onClick: () => pick(r) }, r.region ? `${r.name} — ${r.region}` : r.name))));
          suggest.hidden = false;
        } catch { if (alive) setStatus("تعذر البحث الحين، جرب مرة ثانية.", true); }
      }

      function locate() {
        if (!navigator.geolocation) return setStatus("متصفحك ما يدعم تحديد الموقع.", true);
        setStatus("أحدد موقعك... 📍");
        navigator.geolocation.getCurrentPosition(
          (p) => pick({ name: "موقعك الحالي", lat: p.coords.latitude, lon: p.coords.longitude }),
          () => setStatus("ما قدرت أحدد موقعك. فعّل الإذن أو اختر مدينتك.", true),
          { timeout: 10000 });
      }

      pick(db.settings().city, { remember: false });
      const tick = setInterval(() => { /* تحديث العدّاد التنازلي */
        const c = db.settings().city;
        R.weather.prayer(c.lat, c.lon).then((r) => alive && showPrayer(r.data)).catch(() => {});
      }, 60000);
      return () => { alive = false; clearInterval(tick); };
    },
  };
})();
