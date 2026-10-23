// The public wiki (ADR-0011): what the pages do in the browser. Search over the site's own index, the menu on
// phones, day and night, spoilers, sections that fold, tabs, sortable tables, a picture viewer and diagrams. Every page reads the same
// way without it.
(() => {
  const html = document.documentElement;
  const root = html.dataset.root || "";
  const store = (key, value) => {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch {}
    return null;
  };

  // ── The page's scrollbar (ui/Scrollbar.tsx's PageScrollbar) ─────────────────────────────────────────────────
  // Drawn over the page, so it never takes room: the thumb fades in while scrolling or hovered, drags, and a click on
  // the track pages toward it.
  {
    const el = document.scrollingElement || html;
    const bar = document.createElement("div");
    bar.className = "sh-scrollbar sh-scrollbar-page";
    bar.dataset.axis = "y";
    bar.setAttribute("aria-hidden", "true");
    const knob = document.createElement("div");
    knob.className = "sh-scrollbar-thumb";
    bar.append(knob);
    document.body.append(bar);
    // It starts under the header, whose height changes when the search moves to its own row on narrow screens.
    const header = document.querySelector(".pw-header");
    const underHeader = () => html.style.setProperty("--page-bar-top", `${header?.offsetHeight ?? 0}px`);
    underHeader();
    if (header) new ResizeObserver(underHeader).observe(header);
    let frame = 0;
    let hide = 0;
    let travel = 0;
    let drag = null;
    const layout = () => {
      frame = 0;
      const range = el.scrollHeight - el.clientHeight;
      bar.toggleAttribute("data-none", range <= 1);
      if (range <= 1) return;
      const room = bar.clientHeight;
      const length = Math.max(28, (room * el.clientHeight) / el.scrollHeight);
      travel = room - length;
      knob.style.height = `${length}px`;
      knob.style.transform = `translateY(${(Math.min(Math.max(el.scrollTop, 0), range) / range) * travel}px)`;
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(layout);
    };
    const wake = () => {
      bar.setAttribute("data-active", "");
      clearTimeout(hide);
      hide = setTimeout(() => bar.removeAttribute("data-active"), 900);
    };
    window.addEventListener(
      "scroll",
      () => {
        schedule();
        wake();
      },
      { passive: true },
    );
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    const sizes = new ResizeObserver(schedule);
    sizes.observe(document.body);
    sizes.observe(bar);
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.target === knob) {
        drag = { at: e.clientY, pos: el.scrollTop };
        bar.setPointerCapture(e.pointerId);
        bar.setAttribute("data-dragging", "");
      } else {
        const after = e.clientY > knob.getBoundingClientRect().top;
        const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        window.scrollBy({ top: (after ? 0.9 : -0.9) * el.clientHeight, behavior });
      }
    });
    bar.addEventListener("pointermove", (e) => {
      if (drag)
        el.scrollTop = drag.pos + ((e.clientY - drag.at) * (el.scrollHeight - el.clientHeight)) / Math.max(travel, 1);
    });
    const up = () => {
      if (!drag) return;
      drag = null;
      bar.removeAttribute("data-dragging");
      wake();
    };
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    layout();
  }

  // ── Day and night ─────────────────────────────────────────────────────────────────────────────────────────────
  const mode = document.getElementById("pw-mode");
  const label = () => {
    if (!mode) return;
    const day = html.dataset.mode === "light";
    mode.setAttribute("aria-label", day ? mode.dataset.night : mode.dataset.day);
    mode.title = mode.getAttribute("aria-label");
  };
  label();
  mode?.addEventListener("click", () => {
    html.dataset.mode = html.dataset.mode === "light" ? "dark" : "light";
    store("pw-mode", html.dataset.mode);
    label();
  });

  // ── Menu (phones) ─────────────────────────────────────────────────────────────────────────────────────────────
  const menu = document.querySelector(".pw-menu");
  const nav = document.getElementById("pw-nav");
  const setMenu = (open) => {
    html.classList.toggle("pw-menu-open", open);
    menu?.setAttribute("aria-expanded", String(open));
    if (open) nav?.querySelector("a")?.focus();
  };
  menu?.addEventListener("click", () => setMenu(!html.classList.contains("pw-menu-open")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && html.classList.contains("pw-menu-open")) {
      setMenu(false);
      menu?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (html.classList.contains("pw-menu-open") && !nav?.contains(e.target) && !menu?.contains(e.target))
      setMenu(false);
  });

  // The sidebar's cards remember being folded, per site; the one holding the open page always stays open.
  const foldKey = `pw-nav-folded:${document.title.split(" — ").pop()}`;
  let folded = [];
  try {
    folded = JSON.parse(localStorage.getItem(foldKey) || "[]");
  } catch {}
  for (const card of document.querySelectorAll(".pw-nav-card")) {
    if (folded.includes(card.dataset.nav) && !card.hasAttribute("data-here")) card.open = false;
    card.addEventListener("toggle", () => {
      const rest = folded.filter((k) => k !== card.dataset.nav);
      folded = card.open ? rest : [...rest, card.dataset.nav];
      store(foldKey, JSON.stringify(folded));
    });
  }

  // ── Spoilers ──────────────────────────────────────────────────────────────────────────────────────────────────
  const all = document.getElementById("pw-spoilers");
  const spoilerBlocks = () => document.querySelectorAll("details.sh-spoiler");
  const setAll = (on) => {
    html.classList.toggle("pw-spoilers-shown", on);
    all?.setAttribute("aria-checked", String(on));
    all?.setAttribute("data-state", on ? "checked" : "unchecked");
    for (const d of spoilerBlocks()) d.open = on;
  };
  if (all) {
    setAll(html.classList.contains("pw-spoilers-shown"));
    all.addEventListener("click", () => {
      const on = !html.classList.contains("pw-spoilers-shown");
      setAll(on);
      store("pw-spoilers", on ? "1" : "0");
    });
  }
  for (const s of document.querySelectorAll(".sh-spoiler-inline")) {
    const reveal = () => {
      s.setAttribute("data-shown", "");
      for (const a of ["role", "tabindex", "aria-label"]) s.removeAttribute(a);
      s.firstElementChild?.removeAttribute("aria-hidden");
    };
    s.addEventListener("click", reveal);
    s.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        reveal();
      }
    });
  }

  // ── Sections that fold ────────────────────────────────────────────────────────────────────────────────────────
  for (const button of document.querySelectorAll(".sh-section-fold-button")) {
    const section = button.closest(".sh-section");
    button.addEventListener("click", () => {
      const folded = !section.hasAttribute("data-folded");
      section.toggleAttribute("data-folded", folded);
      button.setAttribute("aria-expanded", String(!folded));
    });
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const tabs of document.querySelectorAll(".sh-tabs")) {
    const buttons = [...tabs.querySelectorAll(":scope > .sh-tabs-list > [role=tab]")];
    const panels = [...tabs.querySelectorAll(":scope > .sh-tabs-panel")];
    const pick = (i, focus) => {
      buttons.forEach((b, j) => {
        b.setAttribute("aria-selected", String(i === j));
        b.dataset.state = i === j ? "active" : "inactive";
        b.tabIndex = i === j ? 0 : -1;
      });
      panels.forEach((p, j) => {
        p.dataset.state = i === j ? "active" : "inactive";
      });
      if (focus) buttons[i].focus();
    };
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => pick(i));
      b.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (step) pick((i + step + buttons.length) % buttons.length, true);
      });
    });
    pick(0);
  }

  // ── Data tables: sort and filter (as DataTable.tsx) ───────────────────────────────────────────────────────────
  const number = (raw) => {
    let t = raw
      .trim()
      .replace(/[\s_]/g, "")
      .replace(/^[$€£¥]/, "")
      .replace(/%$/, "");
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?[kKmM]?$/.test(t)) t = t.replace(/,/g, "");
    else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+))([kKmM]?)$/.exec(t);
    if (!m) return null;
    const n = Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1);
    return Number.isFinite(n) ? n : null;
  };
  const compare = (a, b, numeric, dir) => {
    const ea = a === "";
    const eb = b === "";
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    if (numeric) {
      const na = number(a);
      const nb = number(b);
      if (na !== null && nb !== null) return (na - nb) * dir;
      if (na !== null || nb !== null) return na === null ? 1 : -1;
    }
    return a.localeCompare(b, html.lang, { numeric: true, sensitivity: "base" }) * dir;
  };
  for (const table of document.querySelectorAll("table[data-sortable]")) {
    const body = table.tBodies[0];
    if (!body) continue;
    const heads = [...(table.tHead?.rows[0]?.cells ?? [])];
    const original = [...body.rows];
    const cell = (row, col) => row.cells[col]?.textContent.trim() ?? "";
    const numeric = heads.map((_, col) => {
      const filled = original.map((r) => cell(r, col)).filter((v) => v !== "");
      return filled.length > 0 && filled.filter((v) => number(v) !== null).length / filled.length >= 0.8;
    });
    numeric.forEach((yes, col) => {
      if (!yes) return;
      heads[col].dataset.numeric = "true";
      for (const r of original) if (r.cells[col]) r.cells[col].dataset.numeric = "true";
    });
    heads.forEach((th, col) => {
      th.querySelector(".sh-data-sort")?.addEventListener("click", () => {
        const now = th.getAttribute("aria-sort");
        const dir = now === "ascending" ? -1 : now === "descending" ? 0 : 1;
        for (const h of heads) h.setAttribute("aria-sort", "none");
        if (dir) th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
        const rows = dir
          ? [...original].sort((a, b) => compare(cell(a, col), cell(b, col), numeric[col], dir))
          : original;
        body.append(...rows);
      });
    });
    const filter = table.closest(".sh-data")?.querySelector(".pw-data-filter");
    const count = table.closest(".sh-data")?.querySelector(".sh-data-count");
    filter?.addEventListener("input", () => {
      const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const r of original) {
        const text = r.textContent.toLowerCase();
        const keep = words.every((w) => text.includes(w));
        r.hidden = !keep;
        if (keep) shown++;
      }
      if (count) count.textContent = words.length ? `${shown} of ${original.length} rows` : `${original.length} rows`;
    });
  }

  // ── Picture viewer ────────────────────────────────────────────────────────────────────────────────────────────
  // A card in the middle of the window: the picture on a quiet stage, its caption under it. Any click closes it.
  const viewer = document.createElement("dialog");
  viewer.className = "pw-viewer";
  viewer.innerHTML =
    '<figure class="pw-viewer-frame"><div class="pw-viewer-stage"><img alt=""></div><figcaption class="pw-viewer-caption"></figcaption></figure>' +
    '<button type="button" class="pw-viewer-close" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  document.body.append(viewer);
  const big = viewer.querySelector("img");
  const caption = viewer.querySelector("figcaption");
  viewer.addEventListener("click", () => viewer.close());
  const open = (src, alt, text) => {
    big.src = src;
    big.alt = alt || "";
    caption.textContent = text || alt || "";
    caption.hidden = !caption.textContent;
    viewer.showModal();
  };
  for (const a of document.querySelectorAll(".pw-zoom")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      open(a.getAttribute("href"), a.querySelector("img")?.alt, a.querySelector(".sh-shot-caption")?.textContent);
    });
  }
  for (const img of document.querySelectorAll(".sh-prose img:not(.pw-zoom img):not(a img):not(.sh-icon-img)")) {
    img.classList.add("pw-zoomable");
    img.addEventListener("click", () => open(img.currentSrc || img.src, img.alt));
  }

  // ── Citations (article.tsx's CiteEl) ──────────────────────────────────────────────────────────────────────────
  // What a citation cites, in the app's tooltip above it, on the page itself so no section or table cuts it off.
  const tip = document.createElement("div");
  tip.className = "sh-tooltip pw-cite-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  const showTip = (cite) => {
    const note = cite.querySelector(".sh-cite-note")?.textContent;
    if (!note) return;
    tip.textContent = note;
    tip.hidden = false;
    const at = cite.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, at.left + at.width / 2 - box.width / 2), innerWidth - box.width - 8);
    const top = at.top - box.height - 6 < 8 ? at.bottom + 6 : at.top - box.height - 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hideTip = () => {
    tip.hidden = true;
  };
  for (const cite of document.querySelectorAll(".sh-cite")) {
    cite.addEventListener("pointerenter", () => showTip(cite));
    cite.addEventListener("pointerleave", hideTip);
    cite.addEventListener("focusin", () => showTip(cite));
    cite.addEventListener("focusout", hideTip);
  }
  addEventListener("scroll", hideTip, { passive: true, capture: true });

  // ── Search ────────────────────────────────────────────────────────────────────────────────────────────────────
  const input = document.getElementById("pw-q");
  const results = document.getElementById("pw-results");
  const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const prepare = (docs) => docs.map((d) => ({ ...d, ft: fold(d.t), fx: fold(`${d.s || ""} ${d.x}`) }));
  let loading = null;
  const load = () => {
    loading ??= new Promise((resolve) => {
      if (window.PW_SEARCH) return resolve(prepare(window.PW_SEARCH));
      const script = document.createElement("script");
      script.src = `${root}_site/search.js?v=${html.dataset.version || ""}`;
      script.onload = () => resolve(prepare(window.PW_SEARCH || []));
      script.onerror = () => resolve([]);
      document.head.append(script);
    });
    return loading;
  };
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const snippet = (d, words) => {
    const text = `${d.s ? `${d.s} ` : ""}${d.x}`;
    const at = Math.max(0, d.fx.indexOf(words[0]) - 40);
    const cut = text.slice(at, at + 140);
    return (at ? "…" : "") + escapeHtml(cut) + (at + 140 < text.length ? "…" : "");
  };
  let active = -1;
  const show = async () => {
    const q = fold(input.value.trim());
    if (!q) {
      results.hidden = true;
      return;
    }
    const words = q.split(/\s+/).filter(Boolean);
    const docs = await load();
    const hits = docs
      .map((d) => {
        if (!words.every((w) => d.ft.includes(w) || d.fx.includes(w))) return null;
        const score = words.reduce((n, w) => n + (d.ft.startsWith(w) ? 6 : d.ft.includes(w) ? 4 : 1), 0);
        return { d, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.d.t.localeCompare(b.d.t))
      .slice(0, 8);
    active = -1;
    results.innerHTML = hits.length
      ? hits
          .map(
            ({ d }) =>
              `<a role="option" class="pw-result" href="${root}${d.u}"><strong>${escapeHtml(d.t)}</strong><span>${snippet(d, words)}</span></a>`,
          )
          .join("")
      : `<p class="pw-result-none">${escapeHtml(input.dataset.noResults || "Nothing found")}</p>`;
    results.hidden = false;
  };
  if (input && results) {
    input.addEventListener("focus", () => void load());
    input.addEventListener("input", () => void show());
    input.addEventListener("keydown", (e) => {
      const links = [...results.querySelectorAll("a")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => {
          l.toggleAttribute("data-active", i === active);
        });
      } else if (e.key === "Enter") {
        const target = links[active] ?? links[0];
        if (target) location.href = target.href;
      } else if (e.key === "Escape") {
        input.value = "";
        results.hidden = true;
      }
    });
    document.addEventListener("click", (e) => {
      if (!results.contains(e.target) && e.target !== input) results.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName ?? "");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.focus();
      }
    });
    // The front page's search block (ADR-0012) opens the header's search.
    for (const big of document.querySelectorAll("[data-pw-search]"))
      big.addEventListener("click", () => {
        input.scrollIntoView({ block: "nearest" });
        input.focus();
      });
  }

  // ── Diagrams ──────────────────────────────────────────────────────────────────────────────────────────────────
  const diagrams = document.querySelectorAll(".pw-diagram");
  if (diagrams.length && window.mermaid) {
    const css = getComputedStyle(html);
    const v = (name) => css.getPropertyValue(name).trim();
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        background: v("--surface"),
        primaryColor: v("--raised"),
        primaryTextColor: v("--text"),
        primaryBorderColor: v("--accent"),
        lineColor: v("--muted"),
        textColor: v("--text"),
        fontFamily: v("--font-body"),
      },
    });
    window.mermaid.run({ nodes: [...diagrams] }).catch(() => {});
  }
})();
