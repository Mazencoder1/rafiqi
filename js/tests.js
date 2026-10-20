/* tests.js — اختبارات وحدات بدون أي مكتبة. افتح tests.html في المتصفح. */
(() => {
  "use strict";
  const R = window.R;
  const results = [];

  function test(name, fn) {
    try { fn(); results.push({ name, ok: true }); }
    catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  function eq(actual, expected, msg = "") {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg} المتوقع ${e} لكن الناتج ${a}`);
  }
  function ok(cond, msg = "الشرط غير متحقق") { if (!cond) throw new Error(msg); }

  let n = 0;
  const freshDb = () => R.createDb(`test-${Date.now()}-${n++}`);

  // ---- تواريخ ----
  test("date.diffDays و addDays", () => {
    eq(R.date.diffDays("2026-10-20", "2026-10-18"), 2);
    eq(R.date.diffDays("2026-10-18", "2026-10-20"), -2);
    eq(R.date.addDays("2026-10-31", 1), "2026-11-01");
    eq(R.date.shiftMonth("2026-01", -1), "2025-12");
    eq(R.date.shiftMonth("2026-12", 1), "2027-01");
  });
  test("date.relative بلهجة سعودية", () => {
    eq(R.date.relative("2026-10-18", "2026-10-18"), "اليوم");
    eq(R.date.relative("2026-10-19", "2026-10-18"), "بكرة");
    eq(R.date.relative("2026-10-20", "2026-10-18"), "بعد بكرة");
    ok(R.date.relative("2026-10-15", "2026-10-18").startsWith("متأخرة"));
  });
  test("plural و count للعربي", () => {
    eq(R.count(1, ["مهمة", "مهمتين", "مهام", "مهمة"]), "مهمة");
    eq(R.count(2, ["مهمة", "مهمتين", "مهام", "مهمة"]), "مهمتين");
    ok(R.count(5, ["مهمة", "مهمتين", "مهام", "مهمة"]).endsWith("مهام"));
    ok(R.count(15, ["مهمة", "مهمتين", "مهام", "مهمة"]).endsWith("مهمة"));
  });
  test("fmt.duration", () => {
    ok(R.fmt.duration(75).includes("ساعة") && R.fmt.duration(75).includes("دقيقة"));
    ok(!R.fmt.duration(30).includes("ساعة"));
  });

  // ---- المهام ----
  test("إضافة مهمة وتنظيف المدخلات", () => {
    const db = freshDb();
    eq(db.addTask({ title: "   " }), null, "عنوان فاضي:");
    const t = db.addTask({ title: "  مراجعة  ", priority: "bogus", due: "غلط" });
    eq(t.title, "مراجعة"); eq(t.priority, "normal"); eq(t.due, "");
  });
  test("تبديل الحالة وإحصائيات المهام", () => {
    const db = freshDb();
    const a = db.addTask({ title: "أ", due: "2026-10-10" });
    db.addTask({ title: "ب", due: "2026-10-18" });
    db.toggleTask(a.id);
    const s = db.taskStats("2026-10-18");
    eq([s.total, s.active, s.done, s.today, s.overdue], [2, 1, 1, 1, 0]);
  });
  test("حذف مهمة والتراجع يرجعها لمكانها", () => {
    const db = freshDb();
    db.addTask({ title: "1" }); const m = db.addTask({ title: "2" }); db.addTask({ title: "3" });
    const before = db.data.tasks.map((t) => t.title);
    const rec = db.removeTask(m.id);
    eq(db.data.tasks.length, 2);
    db.restoreTasks([rec]);
    eq(db.data.tasks.map((t) => t.title), before);
  });
  test("إعادة ترتيب المهام (سحب وإفلات)", () => {
    const db = freshDb();
    const a = db.addTask({ title: "أ" }), b = db.addTask({ title: "ب" }), c = db.addTask({ title: "ج" });
    // الترتيب الحالي: ج، ب، أ
    db.reorderTasks(a.id, c.id);
    eq(db.data.tasks.map((t) => t.title), ["أ", "ج", "ب"]);
    db.moveTask(b.id, -1);
    eq(db.data.tasks.map((t) => t.title), ["أ", "ب", "ج"]);
  });
  test("مسح المهام المنتهية مع التراجع", () => {
    const db = freshDb();
    const a = db.addTask({ title: "أ" }); db.addTask({ title: "ب" });
    db.toggleTask(a.id);
    const removed = db.clearDoneTasks();
    eq(db.data.tasks.length, 1);
    db.restoreTasks(removed);
    eq(db.data.tasks.length, 2);
  });

  // ---- الفلوس ----
  test("رفض العمليات غير الصالحة", () => {
    const db = freshDb();
    const base = { type: "expense", title: "x", amount: 5, category: "food", date: "2026-10-01" };
    eq(db.addTx({ ...base, amount: -5 }), null);
    eq(db.addTx({ ...base, amount: "abc" }), null);
    eq(db.addTx({ ...base, title: "" }), null);
    eq(db.addTx({ ...base, date: "01/10/2026" }), null);
    eq(db.addTx({ ...base, type: "weird" }), null);
    ok(db.addTx(base));
  });
  test("الملخص الشهري والتصنيفات والضريبة", () => {
    const db = freshDb();
    db.addTx({ type: "income", title: "راتب", amount: 8000, category: "salary", date: "2026-10-27" });
    db.addTx({ type: "expense", title: "قهوة", amount: 23, category: "food", date: "2026-10-05", vat: 3 });
    db.addTx({ type: "expense", title: "بنزين", amount: 60, category: "fuel", date: "2026-10-06" });
    db.addTx({ type: "expense", title: "قديم", amount: 10, category: "food", date: "2026-09-01" });
    eq(db.monthSummary("2026-10"), { income: 8000, expense: 83, balance: 7917 });
    eq(db.expenseByCategory("2026-10").map((c) => c.id), ["fuel", "food"]);
    eq(db.txsByMonth("2026-10").length, 3);
    const totals = db.monthlyTotals("2026-10", 3);
    eq(totals.map((m) => m.month), ["2026-08", "2026-09", "2026-10"]);
    eq(totals[1].expense, 10);
  });
  test("تصنيف غير موجود يرجع لأخرى", () => {
    const db = freshDb();
    const t = db.addTx({ type: "expense", title: "x", amount: 1, category: "nope", date: "2026-10-01" });
    eq(t.category, "other");
  });
  test("الميزانية", () => {
    const db = freshDb();
    db.setBudget("2026-10", 500); eq(db.getBudget("2026-10"), 500);
    db.setBudget("2026-10", 0); eq(db.getBudget("2026-10"), 0);
  });
  test("CSV يبدأ بـ BOM ويهرّب علامات الاقتباس", () => {
    const db = freshDb();
    db.addTx({ type: "expense", title: 'قهوة "سبانش"', amount: 20, category: "food", date: "2026-10-01" });
    const csv = db.toCsv("2026-10");
    ok(csv.startsWith("﻿")); ok(csv.includes('""سبانش""'));
  });

  // ---- نسخ احتياطي ----
  test("تصدير ثم استيراد يحفظ البيانات", () => {
    const a = freshDb();
    a.addTask({ title: "مهمة" });
    a.addTx({ type: "income", title: "راتب", amount: 100, category: "salary", date: "2026-10-01" });
    const json = a.exportJSON();
    const b = freshDb();
    eq(b.importJSON(json), { tasks: 1, txs: 1 });
  });
  test("الاستيراد يرفض الملفات الغلط وينظف البيانات الملوثة", () => {
    const db = freshDb();
    let threw = 0;
    try { db.importJSON("ليس json"); } catch { threw++; }
    try { db.importJSON('{"hello":1}'); } catch { threw++; }
    eq(threw, 2);
    db.importJSON(JSON.stringify({
      tasks: [{ title: "<img onerror=x>" }, { title: "" }, null, 5],
      txs: [{ type: "expense", title: "ok", amount: 5, date: "2026-10-01" }, { type: "expense", amount: -1 }],
      settings: { theme: "pink", city: { lat: 999, lon: 0 } },
    }));
    eq(db.data.tasks.length, 1); eq(db.data.txs.length, 1);
    eq(db.settings().theme, "auto");
    eq(db.settings().city.name, "الرياض", "مدينة غير صالحة:");
  });
  test("h() ما ينفذ HTML (حماية XSS)", () => {
    const el = R.h("div", {}, '<img src=x onerror="alert(1)">');
    eq(el.children.length, 0); ok(el.textContent.includes("<img"));
  });

  // ---- الصلاة ----
  test("nextPrayer يحدد الصلاة الجاية وفجر بكرة بعد العشاء", () => {
    const t = { Fajr: "04:30", Sunrise: "05:50", Dhuhr: "11:45", Asr: "15:00", Maghrib: "17:40", Isha: "19:10" };
    const noon = new Date(2026, 9, 18, 12, 0);
    const n1 = R.weather.nextPrayer(t, noon);
    eq([n1.key, n1.tomorrow], ["Asr", false]);
    eq(Math.round(n1.minutes), 180);
    const late = new Date(2026, 9, 18, 22, 0);
    const n2 = R.weather.nextPrayer(t, late);
    eq([n2.key, n2.tomorrow], ["Fajr", true]);
  });
  test("وصف الطقس والنصائح", () => {
    eq(R.weather.describe(0, 1).icon, "☀️");
    ok(R.weather.advice({ temp: 46, code: 0 }).includes("نار"));
    ok(R.weather.advice({ temp: 25, code: 63 }).includes("مطر"));
  });

  // ---- العرض ----
  const failed = results.filter((r) => !r.ok);
  window.__results = { total: results.length, failed: failed.length, details: results };
  const list = document.getElementById("results");
  results.forEach((r) => {
    const li = document.createElement("li");
    li.className = r.ok ? "pass" : "fail";
    li.textContent = (r.ok ? "✅ " : "❌ ") + r.name + (r.ok ? "" : ` — ${r.error}`);
    list.append(li);
  });
  document.getElementById("summary").textContent =
    failed.length ? `فشل ${failed.length} من ${results.length}` : `نجحت كل الاختبارات (${results.length}) 🎉`;
})();
