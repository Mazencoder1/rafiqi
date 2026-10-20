/*
 * store.js — قاعدة بيانات رفيقي (localStorage)
 *  - تحقق وتنظيف لكل المدخلات (sanitize) قبل الحفظ، وعند استيراد النسخ الاحتياطية
 *  - ترقية نسخة البيانات (schema version)
 *  - عمليات إضافة/تعديل/حذف مع إمكانية التراجع (Undo)
 *  - استعلامات جاهزة للتقارير (شهري، حسب التصنيف، آخر ٦ شهور)
 * الفكرة العامة مستوحاة من مشاريع Todo/Expense Tracker مفتوحة المصدر (MIT)؛ الكود مكتوب من جديد.
 */
(() => {
  "use strict";
  const R = window.R;

  R.VAT_RATE = 0.15;

  R.CATEGORIES = {
    expense: [
      { id: "food", label: "مطاعم وكوفيهات", color: "#c9a24b" },
      { id: "grocery", label: "بقالة وسوبرماركت", color: "#2e7d32" },
      { id: "fuel", label: "بنزين ومواصلات", color: "#00897b" },
      { id: "rent", label: "إيجار وصيانة", color: "#8d6e63" },
      { id: "bills", label: "فواتير (كهرباء، ماء، جوال)", color: "#3949ab" },
      { id: "shopping", label: "تسوق وملابس", color: "#d81b60" },
      { id: "fun", label: "ترفيه وطلعات", color: "#ef6c00" },
      { id: "family", label: "عايلة وهدايا", color: "#8e24aa" },
      { id: "charity", label: "صدقة وزكاة", color: "#7cb342" },
      { id: "other", label: "أخرى", color: "#78909c" },
    ],
    income: [
      { id: "salary", label: "راتب" },
      { id: "bonus", label: "مكافأة أو حافز" },
      { id: "side", label: "دخل إضافي" },
      { id: "other_in", label: "أخرى" },
    ],
  };
  R.catLabel = (type, id) => (R.CATEGORIES[type].find((c) => c.id === id) || {}).label || id;
  R.TASK_TAGS = ["دراسة", "شغل", "بيت", "عايلة", "تسوق", "صحة"];

  const SCHEMA = 2;
  const round2 = (n) => Math.round(n * 100) / 100;
  const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const numv = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const PRIORITIES = ["high", "normal", "low"];

  function cleanTask(t) {
    if (!t || typeof t !== "object") return null;
    const title = str(t.title, 120);
    if (!title) return null;
    const done = !!t.done;
    return {
      id: str(t.id, 64) || R.uid(),
      title,
      done,
      priority: PRIORITIES.includes(t.priority) ? t.priority : "normal",
      due: isoDate(t.due),
      tag: str(t.tag, 24),
      createdAt: numv(t.createdAt) || Date.now(),
      doneAt: done ? numv(t.doneAt) || null : null,
    };
  }

  function cleanTx(t) {
    if (!t || typeof t !== "object") return null;
    const type = t.type === "income" ? "income" : t.type === "expense" ? "expense" : null;
    const amount = round2(numv(t.amount));
    const date = isoDate(t.date);
    const title = str(t.title, 60);
    if (!type || !(amount > 0) || !date || !title) return null;
    const valid = R.CATEGORIES[type].some((c) => c.id === t.category);
    return {
      id: str(t.id, 64) || R.uid(),
      type,
      title,
      amount,
      date,
      category: valid ? t.category : type === "income" ? "other_in" : "other",
      vat: type === "expense" ? Math.min(amount, Math.max(0, round2(numv(t.vat)))) : 0,
    };
  }

  const defaults = () => ({
    v: SCHEMA,
    settings: { name: "", theme: "auto", city: { name: "الرياض", lat: 24.7136, lon: 46.6753 } },
    tasks: [],
    txs: [],
    budgets: {},
  });

  // تنظيف + ترقية من أي نسخة قديمة
  function clean(raw) {
    const d = defaults();
    if (!raw || typeof raw !== "object") return d;
    const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    d.settings.name = str(s.name, 30);
    d.settings.theme = ["auto", "light", "dark"].includes(s.theme) ? s.theme : "auto";
    const c = s.city;
    if (c && typeof c.lat === "number" && typeof c.lon === "number" && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180) {
      d.settings.city = { name: str(c.name, 40) || "موقعي", lat: c.lat, lon: c.lon };
    }
    d.tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map(cleanTask).filter(Boolean);
    d.txs = (Array.isArray(raw.txs) ? raw.txs : []).map(cleanTx).filter(Boolean);
    for (const [m, v] of Object.entries(raw.budgets && typeof raw.budgets === "object" ? raw.budgets : {})) {
      if (/^\d{4}-\d{2}$/.test(m) && numv(v) > 0) d.budgets[m] = numv(v);
    }
    return d;
  }

  R.createDb = function createDb(key = "data") {
    let data = clean(R.storage.get(key, null));

    const save = () => {
      R.storage.set(key, data);
      R.bus.emit("data:change");
    };

    const db = {
      get data() { return data; },
      settings: () => data.settings,
      setSettings(patch) {
        data.settings = clean({ settings: { ...data.settings, ...patch } }).settings;
        save();
      },

      // ----- المهام -----
      addTask(fields) {
        const t = cleanTask({ ...fields, id: R.uid(), createdAt: Date.now(), done: false });
        if (!t) return null;
        data.tasks.unshift(t);
        save();
        return t;
      },
      updateTask(id, patch) {
        const i = data.tasks.findIndex((t) => t.id === id);
        if (i < 0) return null;
        const merged = cleanTask({ ...data.tasks[i], ...patch, id });
        if (!merged) return null;
        if (patch.done !== undefined) merged.doneAt = merged.done ? Date.now() : null;
        data.tasks[i] = merged;
        save();
        return merged;
      },
      toggleTask(id) {
        const t = data.tasks.find((x) => x.id === id);
        return t ? db.updateTask(id, { done: !t.done }) : null;
      },
      removeTask(id) {
        const index = data.tasks.findIndex((t) => t.id === id);
        if (index < 0) return null;
        const [item] = data.tasks.splice(index, 1);
        save();
        return { item, index };
      },
      restoreTasks(records) { // records: [{item,index}] — ترجع كل عنصر لمكانه
        [...records].sort((a, b) => a.index - b.index).forEach(({ item, index }) =>
          data.tasks.splice(Math.min(index, data.tasks.length), 0, item));
        save();
      },
      moveTask(id, delta) {
        const i = data.tasks.findIndex((t) => t.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= data.tasks.length) return;
        [data.tasks[i], data.tasks[j]] = [data.tasks[j], data.tasks[i]];
        save();
      },
      reorderTasks(dragId, beforeId) { // اسحب مهمة وحطها قبل مهمة ثانية
        const from = data.tasks.findIndex((t) => t.id === dragId);
        if (from < 0 || dragId === beforeId) return;
        const [item] = data.tasks.splice(from, 1);
        const to = data.tasks.findIndex((t) => t.id === beforeId);
        data.tasks.splice(to < 0 ? data.tasks.length : to, 0, item);
        save();
      },
      clearDoneTasks() {
        const removed = [];
        data.tasks = data.tasks.filter((t, index) => {
          if (t.done) removed.push({ item: t, index });
          return !t.done;
        });
        if (removed.length) save();
        return removed;
      },
      taskStats(today = R.date.todayISO()) {
        const active = data.tasks.filter((t) => !t.done);
        return {
          total: data.tasks.length,
          active: active.length,
          done: data.tasks.length - active.length,
          today: active.filter((t) => t.due === today).length,
          overdue: active.filter((t) => t.due && t.due < today).length,
        };
      },

      // ----- العمليات المالية -----
      addTx(fields) {
        const t = cleanTx({ ...fields, id: R.uid() });
        if (!t) return null;
        data.txs.unshift(t);
        save();
        return t;
      },
      updateTx(id, patch) {
        const i = data.txs.findIndex((t) => t.id === id);
        if (i < 0) return null;
        const merged = cleanTx({ ...data.txs[i], ...patch, id });
        if (!merged) return null;
        data.txs[i] = merged;
        save();
        return merged;
      },
      removeTx(id) {
        const index = data.txs.findIndex((t) => t.id === id);
        if (index < 0) return null;
        const [item] = data.txs.splice(index, 1);
        save();
        return { item, index };
      },
      restoreTx({ item, index }) {
        data.txs.splice(Math.min(index, data.txs.length), 0, item);
        save();
      },
      txsByMonth: (m) => data.txs.filter((t) => t.date.startsWith(m)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      monthSummary(m) {
        let income = 0, expense = 0;
        data.txs.forEach((t) => {
          if (!t.date.startsWith(m)) return;
          if (t.type === "income") income += t.amount; else expense += t.amount;
        });
        income = round2(income); expense = round2(expense);
        return { income, expense, balance: round2(income - expense) };
      },
      expenseByCategory(m) {
        const totals = {};
        data.txs.forEach((t) => {
          if (t.type === "expense" && t.date.startsWith(m)) totals[t.category] = (totals[t.category] || 0) + t.amount;
        });
        return R.CATEGORIES.expense
          .filter((c) => totals[c.id])
          .map((c) => ({ ...c, total: round2(totals[c.id]) }))
          .sort((a, b) => b.total - a.total);
      },
      monthlyTotals(endMonth, n = 6) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
          const month = R.date.shiftMonth(endMonth, -i);
          out.push({ month, ...db.monthSummary(month) });
        }
        return out;
      },
      getBudget: (m) => data.budgets[m] || 0,
      setBudget(m, v) {
        const n = numv(v);
        if (n > 0) data.budgets[m] = n; else delete data.budgets[m];
        save();
      },
      toCsv(m) {
        const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const rows = [["التاريخ", "النوع", "الوصف", "التصنيف", "المبلغ (ر.س)", "الضريبة (ر.س)"]];
        db.txsByMonth(m).forEach((t) => rows.push([
          t.date, t.type === "income" ? "دخل" : "مصروف", t.title,
          R.catLabel(t.type, t.category), t.amount.toFixed(2), t.vat.toFixed(2),
        ]));
        // BOM عشان إكسل يقرأ العربي صح
        return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
      },

      // ----- نسخ احتياطي -----
      exportJSON() {
        return JSON.stringify({ app: "rafiqi", exportedAt: new Date().toISOString(), ...data }, null, 2);
      },
      importJSON(text) {
        let raw;
        try { raw = JSON.parse(text); } catch { throw new Error("الملف مو JSON صحيح"); }
        if (!raw || typeof raw !== "object" || (!Array.isArray(raw.tasks) && !Array.isArray(raw.txs))) {
          throw new Error("هذا الملف مو نسخة احتياطية من رفيقي");
        }
        data = clean(raw);
        save();
        return { tasks: data.tasks.length, txs: data.txs.length };
      },
      reset() { data = defaults(); save(); },
    };
    return db;
  };

  R.db = R.createDb("data");
})();
