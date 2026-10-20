/* views/money.js — الفلوس: ملخص شهري، ميزانية، رسوم (دونات + أعمدة)، بحث وفلترة، تعديل، تراجع، تصدير */
(() => {
  "use strict";
  const R = window.R;
  const { h, db, date, fmt } = R;

  const css = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function setupCanvas(canvas, w, hgt) {
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    canvas.style.aspectRatio = `${w} / ${hgt}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    return ctx;
  }

  function drawDonut(canvas, slices, totalLabel) {
    const S = 220;
    const ctx = setupCanvas(canvas, S, S);
    if (!ctx) return;
    const total = slices.reduce((s, x) => s + x.total, 0);
    if (!total) return;
    let a = -Math.PI / 2;
    slices.forEach((s) => {
      const ang = (s.total / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, 100, a, a + ang);
      ctx.arc(S / 2, S / 2, 64, a + ang, a, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      a += ang;
    });
    ctx.fillStyle = css("--text", "#222");
    ctx.textAlign = "center";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(totalLabel, S / 2, S / 2 + 5);
  }

  function drawBars(canvas, months) {
    const W = 340, H = 170, pad = 22;
    const ctx = setupCanvas(canvas, W, H);
    if (!ctx) return;
    const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
    const slot = (W - pad * 2) / months.length;
    const bw = Math.min(16, slot / 3);
    const base = H - 24;
    const plot = base - 10;
    ctx.textAlign = "center";
    ctx.font = "12px system-ui, sans-serif";
    // الاتجاه من اليمين لليسار: أقدم شهر يمين
    months.forEach((m, i) => {
      const cx = W - pad - slot * (i + 0.5);
      const hi = (m.income / max) * plot, he = (m.expense / max) * plot;
      ctx.fillStyle = css("--green", "#006c35");
      ctx.fillRect(cx + 2, base - hi, bw, hi);
      ctx.fillStyle = css("--gold", "#c9a24b");
      ctx.fillRect(cx - bw - 2, base - he, bw, he);
      ctx.fillStyle = css("--muted", "#777");
      ctx.fillText(fmt.monthShort(date.parse(m.month + "-01")), cx, H - 6);
    });
    ctx.strokeStyle = css("--line", "#ddd");
    ctx.beginPath(); ctx.moveTo(pad / 2, base + 0.5); ctx.lineTo(W - pad / 2, base + 0.5); ctx.stroke();
  }

  R.views.money = {
    title: "الفلوس",
    mount(root) {
      const st = { month: date.month(date.todayISO()), q: "", cat: "all", type: "expense" };

      // ---- عناصر ثابتة ----
      const monthLabel = h("strong", { class: "month-label" });
      const nav = h("div", { class: "month-nav" },
        h("button", { type: "button", class: "icon-btn", "aria-label": "الشهر اللي قبل", onClick: () => { st.month = date.shiftMonth(st.month, -1); render(); } }, "›"),
        monthLabel,
        h("button", { type: "button", class: "icon-btn", "aria-label": "الشهر اللي بعد", onClick: () => { st.month = date.shiftMonth(st.month, 1); render(); } }, "‹"));

      const sumIncome = h("strong"), sumExpense = h("strong"), sumBalance = h("strong");
      const cards = h("div", { class: "grid3" },
        h("article", { class: "card stat income" }, h("span", {}, "الدخل"), sumIncome),
        h("article", { class: "card stat expense" }, h("span", {}, "المصروف"), sumExpense),
        h("article", { class: "card stat" }, h("span", {}, "الباقي"), sumBalance));

      const budgetMsg = h("p", { class: "banner", hidden: true });
      const budgetIn = h("input", { type: "number", inputmode: "decimal", min: "0", step: "1", placeholder: "كم تبي تصرف بالشهر؟", "aria-label": "الميزانية" });
      const budgetFill = h("div", { class: "fill" });
      const budgetCard = h("section", { class: "card" },
        h("h2", {}, "ميزانية الشهر"),
        h("div", { class: "row" }, budgetIn,
          h("button", { type: "button", class: "btn", onClick: () => { db.setBudget(st.month, budgetIn.value); R.ui.toast("تم حفظ الميزانية 👌"); } }, "حفظ")),
        h("div", { class: "bar", "aria-hidden": "true" }, budgetFill));

      const donut = h("canvas", { class: "donut", role: "img" });
      const legend = h("ul", { class: "legend" });
      const donutEmpty = h("p", { class: "empty", hidden: true }, "ما فيه مصاريف هالشهر للحين 👌");
      const bars = h("canvas", { class: "bars", role: "img" });
      const chartsCard = h("section", { class: "card" },
        h("h2", {}, "وين راحت الفلوس؟"),
        h("div", { class: "chart-row" }, donut, legend), donutEmpty,
        h("h3", {}, "آخر ٦ شهور"),
        bars,
        h("p", { class: "muted legend-note" }, h("span", { class: "dot g" }), " دخل  ", h("span", { class: "dot y" }), " مصروف"));

      // ---- نموذج الإضافة ----
      const typeRadios = ["expense", "income"].map((v) =>
        h("label", {}, h("input", { type: "radio", name: "type", value: v, checked: v === st.type, onChange: () => { st.type = v; fillCats(); } }), h("span", {}, v === "expense" ? "مصروف" : "دخل")));
      const titleIn = h("input", { type: "text", maxlength: 60, required: true, placeholder: "وش صرفت عليه؟ (مثال: قهوة، بنزين)" });
      const amountIn = h("input", { type: "number", inputmode: "decimal", min: "0.01", step: "0.01", required: true, placeholder: "المبلغ بالريال" });
      const catSel = h("select", { "aria-label": "التصنيف" });
      const dateIn = h("input", { type: "date", required: true, value: date.todayISO(), "aria-label": "التاريخ" });
      const vatIn = h("input", { type: "checkbox" });
      const vatRow = h("label", { class: "check-row" }, vatIn, h("span", {}, "المبلغ يشمل ضريبة القيمة المضافة (١٥٪)"));
      function fillCats() {
        catSel.replaceChildren(...R.CATEGORIES[st.type].map((c) => h("option", { value: c.id }, c.label)));
        vatRow.hidden = st.type === "income";
        titleIn.placeholder = st.type === "income" ? "من وين الدخل؟ (مثال: راتب الشهر)" : "وش صرفت عليه؟ (مثال: قهوة، بنزين)";
      }
      const form = h("form", { class: "card stack", autocomplete: "off",
        onSubmit: (e) => {
          e.preventDefault();
          const amount = Number(amountIn.value);
          const vat = st.type === "expense" && vatIn.checked ? amount - amount / (1 + R.VAT_RATE) : 0;
          const tx = db.addTx({ type: st.type, title: titleIn.value, amount, category: catSel.value, date: dateIn.value, vat });
          if (!tx) return;
          titleIn.value = ""; amountIn.value = ""; vatIn.checked = false;
          st.month = date.month(tx.date); // نعرض الشهر اللي سجلت فيه
          R.ui.toast(st.type === "income" ? "الله يزيدك، سجلنا الدخل 💚" : "أبشر، تم تسجيل المصروف");
          titleIn.focus();
        } },
        h("h2", {}, "سجّل عملية"),
        h("div", { class: "seg" }, typeRadios),
        titleIn, amountIn, catSel, dateIn, vatRow,
        h("button", { type: "submit", class: "btn" }, "أبشر، سجّلها"));

      // ---- قائمة العمليات ----
      const searchIn = h("input", { type: "search", placeholder: "دوّر في العمليات...", "aria-label": "بحث",
        onInput: R.debounce((e) => { st.q = e.target.value.trim().toLowerCase(); renderList(); }, 120) });
      const filterSel = h("select", { "aria-label": "فلتر التصنيف", onChange: (e) => { st.cat = e.target.value; renderList(); } },
        h("option", { value: "all" }, "كل التصنيفات"),
        [...R.CATEGORIES.expense, ...R.CATEGORIES.income].map((c) => h("option", { value: c.id }, c.label)));
      const listEl = h("ul", { class: "txs" });
      const listEmpty = h("p", { class: "empty", hidden: true }, "ما فيه عمليات تطابق هالعرض.");
      const listCard = h("section", { class: "card" },
        h("div", { class: "row between" }, h("h2", {}, "العمليات"),
          h("button", { type: "button", class: "btn link", onClick: () => {
            R.ui.download(`rafiqi-${st.month}.csv`, db.toCsv(st.month), "text/csv;charset=utf-8");
          } }, "تصدير CSV")),
        h("div", { class: "toolbar" }, searchIn, filterSel), listEl, listEmpty);

      root.append(h("h1", { class: "page-title" }, "فلوسي 💰"), nav, cards, budgetMsg, h("div", { class: "grid2" }, h("div", { class: "stack" }, form, budgetCard), h("div", { class: "stack" }, chartsCard, listCard)));

      function budgetMessage(spent, budget) {
        if (!budget) return null;
        const r = spent / budget;
        if (r >= 1) return { cls: "bad", text: `انتبه! تجاوزت ميزانيتك بـ ${fmt.money(spent - budget)} 😅` };
        if (r >= 0.8) return { cls: "warn", text: `قربت تخلص ميزانيتك، باقي ${fmt.money(budget - spent)} بس. شد على الحزام!` };
        return { cls: "good", text: `ماشي حالك زين، باقي ${fmt.money(budget - spent)} من ميزانيتك 👍` };
      }

      function visibleTxs() {
        return db.txsByMonth(st.month).filter((t) =>
          (st.cat === "all" || t.category === st.cat) &&
          (!st.q || t.title.toLowerCase().includes(st.q) || R.catLabel(t.type, t.category).includes(st.q)));
      }

      function renderList() {
        const list = visibleTxs();
        listEmpty.hidden = list.length > 0;
        listEl.replaceChildren(...list.map((t) => {
          const vat = t.vat ? ` · ضريبة ${fmt.money(t.vat)}` : "";
          return h("li", { class: `tx ${t.type}`, dataset: { id: t.id } },
            h("div", { class: "tx-info" },
              h("strong", {}, t.title),
              h("small", { class: "muted" }, `${R.catLabel(t.type, t.category)} · ${fmt.day(date.parse(t.date))}${vat}`)),
            h("span", { class: "amt" }, (t.type === "income" ? "+" : "−") + fmt.money(t.amount)),
            h("button", { type: "button", class: "icon-btn sm", dataset: { action: "edit" }, "aria-label": "عدّل" }, "✎"),
            h("button", { type: "button", class: "icon-btn sm danger", dataset: { action: "delete" }, "aria-label": "احذف" }, "✕"));
        }));
      }

      listEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        const li = e.target.closest(".tx");
        if (!btn || !li) return;
        const id = li.dataset.id;
        if (btn.dataset.action === "delete") {
          const rec = db.removeTx(id);
          if (rec) R.ui.toast("انحذفت العملية", { action: { label: "تراجع", fn: () => db.restoreTx(rec) } });
        } else {
          const t = db.data.txs.find((x) => x.id === id);
          if (!t) return;
          R.ui.formDialog({
            title: "عدّل العملية",
            fields: [
              { name: "title", label: "الوصف", value: t.title, required: true, maxLength: 60 },
              { name: "amount", label: "المبلغ (ر.س)", type: "number", value: t.amount, required: true, min: "0.01", step: "0.01" },
              { name: "category", label: "التصنيف", type: "select", value: t.category, options: R.CATEGORIES[t.type].map((c) => [c.id, c.label]) },
              { name: "date", label: "التاريخ", type: "date", value: t.date, required: true },
            ],
            onSubmit: (v) => { if (!db.updateTx(id, { ...v, amount: Number(v.amount), vat: t.vat ? Number(v.amount) - Number(v.amount) / (1 + R.VAT_RATE) : 0 })) return false; },
          });
        }
      });

      function render() {
        monthLabel.textContent = fmt.month(date.parse(st.month + "-01"));
        const { income, expense, balance } = db.monthSummary(st.month);
        sumIncome.textContent = fmt.money(income);
        sumExpense.textContent = fmt.money(expense);
        sumBalance.textContent = fmt.money(balance);
        sumBalance.className = balance < 0 ? "neg" : "";

        const budget = db.getBudget(st.month);
        if (document.activeElement !== budgetIn) budgetIn.value = budget || "";
        budgetFill.style.width = (budget ? Math.min(100, (expense / budget) * 100) : 0) + "%";
        const msg = budgetMessage(expense, budget);
        budgetMsg.hidden = !msg;
        budgetFill.className = "fill " + (msg ? msg.cls : "");
        if (msg) { budgetMsg.className = "banner " + msg.cls; budgetMsg.textContent = msg.text; }

        const slices = db.expenseByCategory(st.month);
        donut.hidden = legend.hidden = slices.length === 0;
        donutEmpty.hidden = slices.length > 0;
        drawDonut(donut, slices, fmt.money(expense));
        donut.setAttribute("aria-label", slices.map((s) => `${s.label}: ${fmt.money(s.total)}`).join("، ") || "ما فيه مصاريف");
        legend.replaceChildren(...slices.map((s) =>
          h("li", {}, h("i", { style: { background: s.color } }), h("span", {}, s.label), h("b", {}, fmt.money(s.total)))));

        const months = db.monthlyTotals(st.month, 6);
        drawBars(bars, months);
        bars.setAttribute("aria-label", months.map((m) => `${fmt.month(date.parse(m.month + "-01"))}: دخل ${fmt.money(m.income)}، مصروف ${fmt.money(m.expense)}`).join("؛ "));
        renderList();
      }

      fillCats();
      render();
      const offData = R.bus.on("data:change", render);
      const offTheme = R.bus.on("theme:change", render);
      return () => { offData(); offTheme(); };
    },
  };
})();
