// 페이지 그리기 — 뷰모델이 정한 것을 DOM으로 옮긴다.
//
// 타임라인은 render.js가 그린다. 여기는 나머지 화면 — 인트로·안내·요약과
// 덱의 세 장(체크·근거·연락처).
//
// ★ 저장소를 직접 만지지 않는다(D-002). 누수 탐지가 src/ 아래를 재귀로 훑는다.
// ★ 색값을 쓰지 않는다. 시각은 전부 tokens.css의 변수다.

import { COPY } from "./copy.js";
import { el, clear, rowItem, sourceLine } from "./render.js";

const btn = (cls, label, fn) => {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
};

// ── ① 인트로 ───────────────────────────────────────
//
// 흩어진 점이 모여 글자가 된다. **사진은 쓰지 않는다** — 남의 집 화재
// 사진은 지금 이 사람이 볼 것이 아니다. 화면 아무 데나 탭하면 통과한다.
export function renderIntro(host, iv, onPass) {
  clear(host);
  host.hidden = false;
  const box = el("div", "intro__inner");

  const canvas = el("canvas", "intro__canvas");
  box.appendChild(canvas);

  box.appendChild(el("p", "intro__lead", iv.lead));
  box.appendChild(el("p", "intro__line", iv.line));
  box.appendChild(el("p", "intro__skip", iv.skip));
  host.appendChild(box);

  host.addEventListener("click", onPass, { once: true });
  // 키보드로도 넘어갈 수 있어야 한다.
  host.tabIndex = 0;
  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onPass();
  });

  dots(canvas, iv.lead);
}

// 점이 모여 글자가 되는 1~3초. **움직임을 줄여 달라고 한 사람에게는
// 애니메이션 없이 정적으로 보인다**(prefers-reduced-motion).
function dots(canvas, text) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const reduce =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = 120;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  // 글자 모양을 픽셀로 읽어 목표 좌표를 만든다.
  const ink = getComputedStyle(canvas).color;
  ctx.font = `700 ${Math.min(w / 5, 56)}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.fillText(text, w / 2, h / 2);

  let targets = [];
  try {
    const img = ctx.getImageData(0, 0, w * dpr, h * dpr).data;
    const step = 4 * dpr;
    for (let y = 0; y < h * dpr; y += step)
      for (let x = 0; x < w * dpr; x += step)
        if (img[(y * w * dpr + x) * 4 + 3] > 128) targets.push({ x: x / dpr, y: y / dpr });
  } catch {
    return; // 픽셀을 못 읽는 환경이면 위에 그린 글자가 그대로 남는다
  }
  if (!targets.length || reduce) return;

  // 흩어진 자리에서 시작해 제자리로 모인다.
  const P = targets.map((t) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    tx: t.x,
    ty: t.y,
  }));
  const t0 = performance.now();
  const DUR = 1400;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - k, 3);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ink;
    for (const p of P) {
      const x = p.x + (p.tx - p.x) * e;
      const y = p.y + (p.ty - p.y) * e;
      ctx.fillRect(x, y, 2, 2);
    }
    if (k < 1) requestAnimationFrame(tick);
    else {
      // 마지막엔 글자로 또렷하게 바꾼다 — 점 상태로 두면 읽기 어렵다.
      ctx.clearRect(0, 0, w, h);
      ctx.fillText(text, w / 2, h / 2);
    }
  };
  ctx.clearRect(0, 0, w, h);
  requestAnimationFrame(tick);
}

// ── ② 안내 ─────────────────────────────────────────
// 왜 묻는지만 말한다. 속도도 결과도 약속하지 않는다.
export function renderGuide(main, gv, onStart) {
  main.appendChild(el("h2", "h2", gv.title));
  const ul = el("ul", "guide__lines");
  for (const line of gv.lines) ul.appendChild(el("li", null, line));
  main.appendChild(ul);
  main.appendChild(btn("btn btn--primary", gv.cta, onStart));
}

// ── ③ 요약 ─────────────────────────────────────────
// 답한 것이 질문·답 쌍으로. **각 줄이 그 질문으로 돌아가는 문이다.**
export function renderSummary(main, sm, { onEdit, onResult }) {
  main.appendChild(el("h2", "h2", COPY.summary.title));
  main.appendChild(el("p", "hint", COPY.summary.hint));

  if (!sm.rows.length) {
    main.appendChild(el("p", "hint", COPY.summary.empty));
  } else {
    const ul = el("ul", "summary__list");
    for (const r of sm.rows) {
      const li = el("li");
      const b = btn("summary__btn", null, () => onEdit(r.id));
      b.appendChild(el("span", "summary__q", r.question));
      b.appendChild(el("span", "summary__a", r.answer));
      li.appendChild(b);
      ul.appendChild(li);
    }
    main.appendChild(ul);
  }

  if (sm.remaining > 0) {
    const row = el("p", "todo");
    row.appendChild(el("span", null, COPY.survey.unanswered(sm.remaining)));
    row.appendChild(btn("btn btn--quiet", COPY.survey.unansweredAction, () => onEdit(null)));
    main.appendChild(row);
  }

  // 이 전환이 "옆으로 넘기는 앱"임을 가르치는 첫 수업이다.
  const go = btn("btn btn--primary summary__go", COPY.summary.toResult, onResult);
  main.appendChild(go);
}

// ── ⑥ 체크 페이지 ──────────────────────────────────
// 성격이 정반대인 둘을 탭으로 가른다. **기본 탭은 "해두면 좋은 일"** —
// 처음 보는 화면이 금지 목록이면 첫인상이 "하지 마라"가 된다.
export function renderCheck(page, cv, { tab = "todo", onTab, onCheck, onGoTo }) {
  clear(page);
  const tabs = el("div", "tabs");
  for (const t of cv.tabs) {
    const b = btn(`tabs__btn${t.key === tab ? " tabs__btn--on" : ""}`, t.label, () => onTab(t.key));
    b.appendChild(el("span", "tabs__count", ` ${t.count}`));
    // 색만으로 현재 탭을 말하지 않는다.
    if (t.key === tab) b.setAttribute("aria-current", "true");
    tabs.appendChild(b);
  }
  page.appendChild(tabs);

  if (tab === "todo") {
    if (!cv.todo.items.length) page.appendChild(el("p", "hint", COPY.check.emptyTodo));
    for (const g of cv.todo.groups) {
      const sec = el("section", "block");
      const sum = el("p", "block__sum");
      sum.appendChild(el("span", "block__label", g.group || COPY.sources.etc));
      sum.appendChild(el("span", "block__count", String(g.items.length)));
      sec.appendChild(sum);
      const ul = el("ul", "rows");
      for (const r of g.items) ul.appendChild(rowItem(r, { onCheck, onGoTo }));
      sec.appendChild(ul);
      page.appendChild(sec);
    }
  } else {
    const ul = el("ul", "rows");
    for (const r of cv.avoid.items) {
      const li = el("li", "row row--standing");
      li.dataset.row = r.id;
      const det = el("details");
      det.appendChild(el("summary", "row__sum", r.title));
      if (r.summary) det.appendChild(el("p", "row__summary", r.summary));
      if (r.body) det.appendChild(el("p", "card__body", r.body));
      const src = sourceLine(r);
      if (src) det.appendChild(src);
      li.appendChild(det);
      ul.appendChild(li);
    }
    page.appendChild(ul);
    page.appendChild(el("p", "hint", COPY.check.avoidNote));
  }

  // 완료 로그는 이 페이지 하단. 숫자만이고 배지·축하는 없다.
  if (cv.done.count) {
    const det = el("details", "block block--done");
    const sum = el("summary", "block__sum");
    sum.appendChild(el("span", "block__label", COPY.timeline.doneTitle));
    sum.appendChild(el("span", "block__count", COPY.timeline.doneCount(cv.done.count)));
    det.appendChild(sum);
    const ul = el("ul", "rows");
    for (const r of cv.done.items) {
      const li = el("li", "row row--done");
      li.dataset.row = r.id;
      const head = el("p", "row__sum");
      head.appendChild(el("span", null, r.title));
      // completed_at이 null이라고 완료가 아닌 것은 아니다(4/4-F②).
      head.appendChild(el("span", "row__date", r.doneOn || COPY.timeline.doneNoDate));
      li.appendChild(head);
      if (r.checkable && onCheck)
        li.appendChild(btn("btn btn--quiet", COPY.timeline.uncheck, () => onCheck(r.id, false)));
      ul.appendChild(li);
    }
    det.appendChild(ul);
    page.appendChild(det);
  }
}

// ── ⑦ 근거 페이지 ──────────────────────────────────
// 고지문의 "본문에 출처를 밝혀 두었습니다"가 여기서 한 번 더 참이 된다.
export function renderSources(page, sv) {
  clear(page);
  page.appendChild(el("h2", "h2", COPY.sources.title));
  page.appendChild(el("p", "hint", COPY.sources.lead));

  if (!sv.groups.length) page.appendChild(el("p", "hint", COPY.sources.none));

  for (const g of sv.groups) {
    const sec = el("section", "srcgroup");
    sec.appendChild(el("h3", "h3", g.group));
    const ul = el("ul", "srclist");
    for (const it of g.items) {
      const li = el("li", "srcitem");
      li.appendChild(el("p", "srcitem__title", it.title));
      const a = el("a", "srcitem__link", COPY.timeline.source(it.host));
      a.href = it.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.appendChild(a);
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    page.appendChild(sec);
  }

  // 해당 없는 것도 사라지지 않는다(D-011).
  if (sv.excluded.length) {
    const det = el("details", "block");
    const sum = el("summary", "block__sum");
    sum.appendChild(el("span", "block__label", COPY.sources.excluded));
    sum.appendChild(el("span", "block__count", String(sv.excluded.length)));
    det.appendChild(sum);
    det.appendChild(el("p", "hint", COPY.sources.excludedHint));
    const ul = el("ul", "rows");
    for (const r of sv.excluded) {
      const li = el("li", "row row--dim");
      li.appendChild(el("p", "row__sum", r.title));
      if (r.reason) li.appendChild(el("p", "row__reason", r.reason));
      ul.appendChild(li);
    }
    det.appendChild(ul);
    page.appendChild(det);
  }

  page.appendChild(notice());
}

// 고지문 — 이 페이지 하단으로 왔다(6단계).
function notice() {
  const det = el("details", "notice");
  det.appendChild(el("summary", "notice__line", COPY.notice.line));
  det.appendChild(el("h3", "h3", COPY.notice.title));
  const ul = el("ul", "notice__list");
  for (const line of COPY.notice.does) ul.appendChild(el("li", null, line));
  det.appendChild(ul);
  det.appendChild(el("p", "hint", COPY.notice.storage));
  det.appendChild(el("p", "hint", COPY.notice.sources));
  return det;
}

// ── ⑧ 연락처 페이지 ────────────────────────────────
// 번호는 tel: 링크로 — 탭하면 전화 앱이 열린다. 옆에 복사 버튼.
export function renderContacts(page, cv, { onCopy }) {
  clear(page);
  page.appendChild(el("h2", "h2", COPY.contacts.title));
  page.appendChild(el("p", "hint", COPY.contacts.lead));

  const box = el("div", "contacts");

  box.appendChild(group(COPY.contacts.global, cv.global.map((c) => card(c, onCopy))));

  // 구별 번호는 다음 패스. **없는 줄은 안 그린다** — "준비 중"을 쓰지 않는다.
  if (cv.district) {
    const c = el("div", "contact");
    const name = el("p", "contact__name", cv.district.note);
    name.appendChild(el("span", "contact__note", COPY.contacts.viaMain));
    c.appendChild(name);
    if (cv.district.tel) c.appendChild(tel(cv.district.tel, onCopy));
    box.appendChild(group(COPY.contacts.mine, [c]));
  }

  if (cv.orgs.length)
    box.appendChild(group(COPY.contacts.matched, cv.orgs.map((c) => card(c, onCopy))));

  page.appendChild(box);
}

function group(title, nodes) {
  const sec = el("section");
  sec.appendChild(el("h3", "h3", title));
  for (const n of nodes) sec.appendChild(n);
  return sec;
}

function card(c, onCopy) {
  const box = el("div", "contact");
  const name = el("p", "contact__name", c.name);
  if (c.note) name.appendChild(el("span", "contact__note", c.note));
  box.appendChild(name);
  if (c.tel) box.appendChild(tel(c.tel, onCopy));
  return box;
}

function tel(number, onCopy) {
  const wrap = el("span", "actions");
  const a = el("a", "contact__tel", number);
  a.href = `tel:${number}`;
  wrap.appendChild(a);
  wrap.appendChild(
    btn("btn btn--quiet", COPY.contacts.copy, (e) => onCopy(number, e?.target ?? null))
  );
  return wrap;
}
