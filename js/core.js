/*
 * core.js — نواة رفيقي: أدوات عامة بدون مكتبات
 *  - h()         إنشاء عناصر DOM بشكل آمن (بدون innerHTML)
 *  - bus         ناقل أحداث بسيط (Pub/Sub)
 *  - storage     غلاف آمن لـ localStorage
 *  - fmt / date  تنسيق الأرقام والتواريخ بالعربي (ميلادي + هجري أم القرى)
 *  - ui          Toast مع تراجع، نماذج حوارية، تنزيل ملفات
 */
(() => {
  "use strict";
  const R = (window.R = window.R || {});

  // ---------- h(): hyperscript ----------
  const PROP_KEYS = new Set(["checked", "hidden", "disabled", "selected", "open", "readOnly"]);

  R.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "value") { value = v; continue; }
      if (PROP_KEYS.has(k)) { el[k] = !!v; continue; }
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (/^on[A-Z]/.test(k) && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    if (value !== undefined) el.value = value; // بعد إضافة الخيارات
    return el;
  };

  R.$ = (sel, root = document) => root.querySelector(sel);
  R.uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  R.debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // ---------- Event bus ----------
  const listeners = new Map();
  R.bus = {
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn); // دالة لإلغاء الاشتراك
    },
    emit(evt, payload) {
      (listeners.get(evt) || []).forEach((fn) => {
        try { fn(payload); } catch (err) { console.error(`[bus:${evt}]`, err); }
      });
    },
  };

  // ---------- Storage ----------
  R.storage = {
    prefix: "rafiqi.",
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(this.prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(this.prefix + key); } catch { /* تجاهل */ }
    },
  };

  // ---------- أرقام وتواريخ ----------
  const nf = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
  const nfInt = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });
  const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "long" });
  const monthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric" });
  const monthShort = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "short" });
  const weekdayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long" });
  const hourFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { hour: "numeric" });
  const clockFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { hour: "numeric", minute: "2-digit" });
  const hijriFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  R.fmt = {
    num: (n) => nf.format(n),
    int: (n) => nfInt.format(n),
    money: (n) => `${nf.format(n)} ر.س`,
    percent: (n) => `${nfInt.format(n)}٪`,
    deg: (n) => `${nfInt.format(n)}°`,
    day: (d) => dayFmt.format(d),
    month: (d) => monthFmt.format(d),
    monthShort: (d) => monthShort.format(d),
    weekday: (d) => weekdayFmt.format(d),
    hour: (d) => hourFmt.format(d),
    clock: (d) => clockFmt.format(d),
    hijri: (d = new Date()) => hijriFmt.format(d),
  };

  // صيغة المفرد/المثنى/الجمع في العربي: [واحد، اثنين، 3-10، 11+]
  R.plural = (n, forms) => {
    n = Math.abs(n);
    return n === 1 ? forms[0] : n === 2 ? forms[1] : n <= 10 ? forms[2] : forms[3];
  };
  R.count = (n, forms) =>
    Math.abs(n) === 1 ? forms[0] : Math.abs(n) === 2 ? forms[1] : `${nfInt.format(n)} ${R.plural(n, forms)}`;

  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  R.date = {
    toISO,
    todayISO: () => toISO(new Date()),
    parse(iso) {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d);
    },
    diffDays(a, b) { // a - b بالأيام
      const [ya, ma, da] = a.split("-").map(Number);
      const [yb, mb, db] = b.split("-").map(Number);
      return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 864e5);
    },
    addDays(iso, n) {
      const d = R.date.parse(iso);
      d.setDate(d.getDate() + n);
      return toISO(d);
    },
    month: (iso) => iso.slice(0, 7),
    shiftMonth(m, delta) {
      const [y, mo] = m.split("-").map(Number);
      const d = new Date(y, mo - 1 + delta, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    },
    // نص نسبي بلهجة سعودية: اليوم، بكرة، متأخرة 3 أيام ...
    relative(iso, today = R.date.todayISO()) {
      const n = R.date.diffDays(iso, today);
      if (n === 0) return "اليوم";
      if (n === 1) return "بكرة";
      if (n === 2) return "بعد بكرة";
      if (n === -1) return "أمس";
      const days = ["يوم", "يومين", "أيام", "يوم"];
      return n > 0 ? `بعد ${R.count(n, days)}` : `متأخرة ${R.count(-n, days)}`;
    },
  };

  // مدة بالدقائق → "ساعة و١٢ دقيقة"
  R.fmt.duration = (mins) => {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hs = R.count(h, ["ساعة", "ساعتين", "ساعات", "ساعة"]);
    const ms = R.count(m, ["دقيقة", "دقيقتين", "دقايق", "دقيقة"]);
    if (!h) return ms;
    return m ? `${hs} و${ms}` : hs;
  };

  // ---------- واجهة مشتركة ----------
  R.ui = {
    toast(message, { action, timeout = 5000 } = {}) {
      let box = document.getElementById("toasts");
      if (!box) {
        box = R.h("div", { id: "toasts", class: "toasts", "aria-live": "polite" });
        document.body.append(box);
      }
      const t = R.h("div", { class: "toast", role: "status" }, R.h("span", {}, message));
      if (action) {
        t.append(R.h("button", {
          type: "button", class: "toast-btn",
          onClick: () => { action.fn(); t.remove(); },
        }, action.label));
      }
      box.append(t);
      setTimeout(() => t.remove(), timeout);
      return t;
    },

    openDialog(dlg) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    },
    closeDialog(dlg) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
      dlg.remove();
    },

    /**
     * نافذة نموذج عامة.
     * fields: [{name,label,type,value,options:[[val,label]],required,min,step,maxLength}]
     * onSubmit(values) ترجع false لو فيه خطأ (تبقى النافذة مفتوحة)
     */
    formDialog({ title, fields, submitLabel = "حفظ", onSubmit }) {
      const inputs = {};
      const rows = fields.map((f) => {
        let el;
        if (f.type === "select") {
          el = R.h("select", { name: f.name }, f.options.map(([v, l]) => R.h("option", { value: v }, l)));
          el.value = f.value;
        } else {
          el = R.h("input", {
            name: f.name, type: f.type || "text", value: f.value ?? "",
            required: f.required, min: f.min, step: f.step, maxlength: f.maxLength,
          });
        }
        inputs[f.name] = el;
        return R.h("label", { class: "field" }, R.h("span", {}, f.label), el);
      });
      const dlg = R.h("dialog", { class: "dlg", "aria-label": title });
      const form = R.h("form", {
        class: "stack",
        onSubmit: (e) => {
          e.preventDefault();
          const values = {};
          fields.forEach((f) => (values[f.name] = inputs[f.name].value));
          if (onSubmit(values) !== false) R.ui.closeDialog(dlg);
        },
      },
      R.h("h3", {}, title),
      rows,
      R.h("div", { class: "row end" },
        R.h("button", { type: "button", class: "btn ghost", onClick: () => R.ui.closeDialog(dlg) }, "إلغاء"),
        R.h("button", { type: "submit", class: "btn" }, submitLabel)));
      dlg.append(form);
      dlg.addEventListener("close", () => dlg.remove());
      document.body.append(dlg);
      R.ui.openDialog(dlg);
      const first = form.querySelector("input,select");
      if (first) first.focus();
      return dlg;
    },

    download(filename, text, mime = "text/plain;charset=utf-8") {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = R.h("a", { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  R.views = {};
})();
