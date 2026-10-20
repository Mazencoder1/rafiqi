/* views/tasks.js — المهام: بحث، فلاتر، ترتيب، سحب وإفلات، تعديل، تراجع عن الحذف */
(() => {
  "use strict";
  const R = window.R;
  const { h, db, date, fmt } = R;

  const FILTERS = [["all", "الكل"], ["active", "باقي"], ["today", "اليوم"], ["overdue", "متأخرة"], ["done", "خلصت"]];
  const SORTS = [["manual", "ترتيبي أنا"], ["due", "الأقرب موعداً"], ["priority", "الأهم أول"], ["newest", "الأحدث"]];
  const PRIO = [["high", "مرة مهم 🔥"], ["normal", "عادي"], ["low", "على مهلك"]];
  const PRIO_RANK = { high: 0, normal: 1, low: 2 };

  R.views.tasks = {
    title: "المهام",
    mount(root) {
      const st = { q: "", filter: "all", sort: "manual" };

      const titleIn = h("input", { id: "newTask", type: "text", placeholder: "وش المهمة؟ (مثال: أراجع تقرير الشغل)", maxlength: 120, required: true, autocomplete: "off" });
      const dueIn = h("input", { type: "date", "aria-label": "موعد التسليم" });
      const prioSel = h("select", { "aria-label": "الأولوية", value: "normal" }, PRIO.map(([v, l]) => h("option", { value: v }, l)));
      const tagIn = h("input", { type: "text", list: "tagList", placeholder: "تصنيف (اختياري)", maxlength: 24, "aria-label": "التصنيف" });
      const tagList = h("datalist", { id: "tagList" }, R.TASK_TAGS.map((t) => h("option", { value: t })));

      const form = h("form", { class: "card form-grid", autocomplete: "off",
        onSubmit: (e) => {
          e.preventDefault();
          const t = db.addTask({ title: titleIn.value, due: dueIn.value, priority: prioSel.value, tag: tagIn.value });
          if (!t) return;
          titleIn.value = ""; dueIn.value = ""; tagIn.value = ""; prioSel.value = "normal";
          titleIn.focus();
        } },
        h("div", { class: "span2" }, titleIn),
        dueIn, prioSel, tagIn, tagList,
        h("button", { type: "submit", class: "btn" }, "أبشر، ضيفها"));

      const searchIn = h("input", { type: "search", placeholder: "دوّر في مهامك...", "aria-label": "بحث",
        onInput: R.debounce((e) => { st.q = e.target.value.trim().toLowerCase(); renderList(); }, 120) });
      const sortSel = h("select", { "aria-label": "الترتيب", value: st.sort,
        onChange: (e) => { st.sort = e.target.value; renderList(); } },
        SORTS.map(([v, l]) => h("option", { value: v }, l)));
      const chips = h("div", { class: "chips", role: "tablist" });
      const statsEl = h("p", { class: "muted stats" });
      const listEl = h("ul", { class: "tasks" });
      const emptyEl = h("p", { class: "empty" });
      const clearBtn = h("button", { type: "button", class: "btn link", onClick: () => {
        const removed = db.clearDoneTasks();
        if (removed.length) R.ui.toast(`انمسحت ${R.count(removed.length, ["مهمة", "مهمتين", "مهام", "مهمة"])}`, { action: { label: "تراجع", fn: () => db.restoreTasks(removed) } });
      } }, "امسح اللي خلصت");

      root.append(
        h("h1", { class: "page-title" }, "مهامي ✅"),
        form,
        h("div", { class: "toolbar" }, searchIn, sortSel),
        chips, statsEl, listEl, emptyEl,
        h("div", { class: "row end" }, clearBtn),
        h("p", { class: "hint" }, "اضغط على الدايرة عشان تخلص المهمة، واسحب المهام عشان ترتبها (في الترتيب اليدوي).")
      );

      const today = () => date.todayISO();

      function visible() {
        const t0 = today();
        let list = db.data.tasks.slice();
        const f = {
          all: () => true, active: (t) => !t.done, done: (t) => t.done,
          today: (t) => !t.done && t.due === t0,
          overdue: (t) => !t.done && t.due && t.due < t0,
        }[st.filter];
        list = list.filter(f);
        if (st.q) list = list.filter((t) => t.title.toLowerCase().includes(st.q) || t.tag.toLowerCase().includes(st.q));
        if (st.sort === "due") list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0);
        else if (st.sort === "priority") list.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);
        else if (st.sort === "newest") list.sort((a, b) => b.createdAt - a.createdAt);
        return list;
      }

      const canReorder = () => st.sort === "manual" && st.filter === "all" && !st.q;

      function taskItem(t, reorder) {
        const t0 = today();
        const dueCls = !t.due ? "" : t.done ? "" : t.due < t0 ? "bad" : t.due === t0 ? "warn" : "";
        return h("li", { class: `task ${t.priority}${t.done ? " done" : ""}`, dataset: { id: t.id }, draggable: reorder ? "true" : null },
          h("button", { type: "button", class: "check", dataset: { action: "toggle" }, "aria-pressed": t.done ? "true" : "false", "aria-label": t.done ? "رجّعها باقية" : "خلّصها" }, t.done ? "✓" : ""),
          h("div", { class: "task-body" },
            h("span", { class: "task-title" }, t.title),
            h("span", { class: "meta" },
              t.due && h("span", { class: `pill ${dueCls}` }, "📅 " + date.relative(t.due)),
              t.tag && h("span", { class: "pill" }, "#" + t.tag),
              t.priority === "high" && h("span", { class: "pill bad" }, "مهم"))),
          h("div", { class: "task-actions" },
            reorder && h("button", { type: "button", class: "icon-btn sm", dataset: { action: "up" }, "aria-label": "فوق" }, "↑"),
            reorder && h("button", { type: "button", class: "icon-btn sm", dataset: { action: "down" }, "aria-label": "تحت" }, "↓"),
            h("button", { type: "button", class: "icon-btn sm", dataset: { action: "edit" }, "aria-label": "عدّل" }, "✎"),
            h("button", { type: "button", class: "icon-btn sm danger", dataset: { action: "delete" }, "aria-label": "احذف" }, "✕")));
      }

      function renderList() {
        const s = db.taskStats();
        chips.replaceChildren(...FILTERS.map(([id, label]) =>
          h("button", { type: "button", role: "tab", class: `chip${st.filter === id ? " active" : ""}`, "aria-selected": st.filter === id ? "true" : "false",
            onClick: () => { st.filter = id; renderList(); } }, label)));
        statsEl.textContent = s.total
          ? `${s.active === 0 ? "ما باقي شي" : `باقي لك ${R.count(s.active, ["مهمة وحدة", "مهمتين", "مهام", "مهمة"])}`} · خلصت ${fmt.int(s.done)}${s.overdue ? ` · متأخرة ${fmt.int(s.overdue)}` : ""}`
          : "";
        const list = visible();
        const reorder = canReorder();
        listEl.replaceChildren(...list.map((t) => taskItem(t, reorder)));
        emptyEl.hidden = list.length > 0;
        emptyEl.textContent = st.q ? "ما لقيت شي يطابق بحثك 🔍"
          : s.total === 0 ? "ما عندك مهام للحين، ابدأ بأول وحدة وتوكل على الله 💪"
          : st.filter === "done" ? "للحين ما خلصت شي، يلا شد حيلك!"
          : "الله يعطيك العافية، ما عندك شي هنا ☕";
        clearBtn.hidden = s.done === 0;
      }

      // تفويض الأحداث: مستمع واحد للقائمة كلها
      listEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        const li = e.target.closest(".task");
        if (!btn || !li) return;
        const id = li.dataset.id;
        const action = btn.dataset.action;
        if (action === "toggle") db.toggleTask(id);
        else if (action === "up") db.moveTask(id, -1);
        else if (action === "down") db.moveTask(id, 1);
        else if (action === "delete") {
          const rec = db.removeTask(id);
          if (rec) R.ui.toast("انحذفت المهمة", { action: { label: "تراجع", fn: () => db.restoreTasks([rec]) } });
        } else if (action === "edit") {
          const t = db.data.tasks.find((x) => x.id === id);
          if (!t) return;
          R.ui.formDialog({
            title: "عدّل المهمة",
            fields: [
              { name: "title", label: "العنوان", value: t.title, required: true, maxLength: 120 },
              { name: "due", label: "الموعد", type: "date", value: t.due },
              { name: "priority", label: "الأولوية", type: "select", options: PRIO, value: t.priority },
              { name: "tag", label: "التصنيف", value: t.tag, maxLength: 24 },
            ],
            onSubmit: (v) => !!db.updateTask(id, v) && undefined,
          });
        }
      });

      // سحب وإفلات
      let dragId = null;
      listEl.addEventListener("dragstart", (e) => {
        const li = e.target.closest(".task");
        if (!li) return;
        dragId = li.dataset.id;
        li.classList.add("dragging");
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); }
      });
      listEl.addEventListener("dragover", (e) => {
        if (!dragId) return;
        e.preventDefault();
        const li = e.target.closest(".task");
        listEl.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target"));
        if (li && li.dataset.id !== dragId) li.classList.add("drop-target");
      });
      listEl.addEventListener("drop", (e) => {
        e.preventDefault();
        const li = e.target.closest(".task");
        if (dragId && li) db.reorderTasks(dragId, li.dataset.id);
        dragId = null;
      });
      listEl.addEventListener("dragend", () => { dragId = null; renderList(); });

      renderList();
      const off = R.bus.on("data:change", renderList);
      return () => off();
    },
  };
})();
