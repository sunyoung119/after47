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

// ── ① 인트로 ───────────────────────────────────
//
// 사용자가 확정한 시안이다. 구조·타이밍·문구를 그대로 옮겼다.
// **사진은 쓰지 않는다** — 남의 집 화재 사진은 지금 이 사람이 볼 것이 아니다.
//
// 여기 있는 것은 문 하나다. [내 상황 확인하기]가 **진짜 버튼**이고
// 화면 아무 데나 탭하는 것은 보조다. 키보드는 버튼이 그대로 받는다.
//
// ★ `{ once: true }`를 걸지 않는다. 첫 탭이 저장을 기다리다 소진되면
//   사람이 첫 화면에 갇힌다 — 다시 눌 수 있어야 한다.
export function renderIntro(host, iv, onPass) {
  clear(host);
  host.hidden = false;

  const content = el("section", "intro__content");
  content.appendChild(el("p", "intro__eyebrow", iv.eyebrow));

  // 제목 — 글자가 하나씩 드러난다. 보조기술에는 한 덩어리로 읽힌다.
  const title = el("h1", "intro__title");
  title.setAttribute("aria-label", iv.lead);
  const reveal = el("span", "intro__reveal");
  reveal.setAttribute("aria-hidden", "true");
  for (const ch of iv.letters) reveal.appendChild(el("span", null, ch));
  title.appendChild(reveal);
  content.appendChild(title);

  content.appendChild(el("p", "intro__sub", iv.line));

  const actions = el("div", "intro__actions");
  const cta = el("button", "intro__cta", iv.cta);
  cta.type = "button";
  cta.addEventListener("click", (e) => {
    // 화면 탭 핸들러까지 올라가면 같은 전환이 두 번 돌아간다.
    if (e && e.stopPropagation) e.stopPropagation();
    onPass();
  });
  actions.appendChild(cta);
  content.appendChild(actions);
  host.appendChild(content);

  // 확정 문구. 이 화면에서 유일하게 사람에게 건네는 말이다.
  host.appendChild(el("p", "intro__micro", iv.micro));

  host.addEventListener("click", onPass);
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

// ═══ 확정 프론트 UX — 진입 흐름 ═══════════════════
//
// 랜딩 · 기본 확인 · 질문 MASTER · 안내 범위 · 전환 · 재방문 게이트.
// 판단은 entry.js가 하고 여기는 그린다.
//
// ★ **표시 여부를 연출에 걸지 않는다.** 기본 상태가 보이는 것이고,
//   등장 연출은 @keyframes의 from에만 둔다. 선택 피드백도 `animationend`가
//   아니라 setTimeout으로 잰다 — 연출이 안 돌아도 다음 질문으로 간다.

// ── 랜딩 (첫 방문만) ───────────────────────────────
//
// 기존 인트로의 새벽 그라데이션과 글자 리빌 연출을 그대로 쓰고 콘텐츠만
// 바꾼다. [회복 시작하기]가 진짜 버튼이고 화면 탭은 보조다.
//
// ★ `{ once: true }`를 걸지 않는다. 첫 탭이 저장을 기다리다 소진되면
//   사람이 첫 화면에 갇힌다.
export function renderLanding(host, lv, onPass) {
  clear(host);
  host.hidden = false;

  const content = el("section", "intro__content");
  content.appendChild(el("p", "intro__eyebrow", lv.eyebrow));

  const title = el("h1", "intro__title");
  title.setAttribute("aria-label", lv.brand);
  const reveal = el("span", "intro__reveal");
  reveal.setAttribute("aria-hidden", "true");
  for (const ch of lv.letters) reveal.appendChild(el("span", null, ch));
  title.appendChild(reveal);
  content.appendChild(title);

  content.appendChild(el("p", "intro__sub", lv.lead));

  const actions = el("div", "intro__actions");
  const cta = el("button", "intro__cta", lv.cta);
  cta.type = "button";
  cta.addEventListener("click", (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onPass();
  });
  actions.appendChild(cta);
  content.appendChild(actions);
  host.appendChild(content);

  host.appendChild(el("p", "intro__footer", lv.footer));
  host.addEventListener("click", onPass);
}

// ── 기본 확인 ──────────────────────────────────────
//
// QR로 값이 미리 들어와도 두 필드 다 확인·수정할 수 있다.
// 날짜는 오늘로 채워져 있고, [다음]을 누르는 것이 "오늘이 맞다"는 확인이다.
export function renderBasicCheck(main, bv, { onDate, onDistrict, onNext }) {
  main.appendChild(el("p", "pg__eyebrow", bv.label));
  main.appendChild(el("h2", "pg__title", bv.title));
  main.appendChild(el("p", "pg__desc", bv.help));

  const f1 = el("div", "field");
  f1.appendChild(el("label", "field__label", bv.date.label));
  const date = el("input", "field__input");
  date.type = "date";
  date.value = bv.date.inputValue || "";
  date.id = "f-date";
  f1.appendChild(date);
  date.addEventListener("change", () => onDate(date.value));
  main.appendChild(f1);

  const f2 = el("div", "field");
  f2.appendChild(el("label", "field__label", bv.district.label));
  const sel = el("select", "field__input");
  sel.id = "f-district";
  const none = el("option", null, bv.district.empty);
  none.value = "";
  sel.appendChild(none);
  for (const o of bv.district.options) {
    // 조례 유무는 여기 없다 — 없는 구에 낙인을 찍는 표시가 된다.
    const op = el("option", null, o.name);
    op.value = o.id;
    if (o.id === bv.district.id) op.selected = true;
    sel.appendChild(op);
  }
  sel.value = bv.district.id || "";
  sel.addEventListener("change", () => onDistrict(sel.value || null));
  f2.appendChild(sel);
  main.appendChild(f2);

  const go = el("button", "btn btn--primary pg__cta", bv.cta);
  go.type = "button";
  go.disabled = !bv.ready;
  go.addEventListener("click", () => onNext(date.value));
  main.appendChild(go);
}

// ── 질문 MASTER ────────────────────────────────────
//
// 소라벨 · 큰 질문 · 필요할 때만 help 한 줄 · 텍스트 선택지 · 하단 한 줄.
// **분모형 진행률이 없다.** 선택지를 탭하면 별도 [다음] 없이 넘어가되,
// 탭이 먹혔다는 감각을 위해 짧은 피드백을 둔다.
export function renderQuestion(main, mv, { onAnswer, feedbackMs = 200 }) {
  main.appendChild(el("p", "pg__eyebrow", mv.eyebrow));
  const q = mv.current;
  main.appendChild(el("h2", "q__title", q.text));
  // help는 이유가 자명하지 않을 때만 온다. 접지 않고 한 줄로 보인다.
  if (q.help) main.appendChild(el("p", "q__help", q.help));

  const box = el("div", "q__choices");
  let taken = false;
  for (const o of q.options || []) {
    const b = el("button", "q__choice", o.label);
    b.type = "button";
    // 고른 것은 색이 아니라 글자로도 표시한다(WCAG 1.4.1).
    if (o.value === q.answer) {
      b.classList.add("q__choice--on");
      b.appendChild(el("span", "q__mark", " (선택함)"));
    }
    b.addEventListener("click", () => {
      if (taken) return; // 두 번 눌러도 한 번만 넘어간다
      taken = true;
      b.classList.add("q__choice--tapped");
      // ★ 연출의 끝(animationend)이 아니라 시계를 기다린다. 연출이 안
      //   돌아도 다음 질문으로 간다.
      setTimeout(() => onAnswer(q.key, o.value), feedbackMs);
    });
    box.appendChild(b);
  }
  main.appendChild(box);
  main.appendChild(el("p", "pg__foot q__foot", mv.footer));
}

// ── 안내 범위 (건물 종류 = 그 외) ──────────────────
// 큰 제목이 없는 화면이다. 세 문장이 본문 전부다.
export function renderScopeNotice(main, sv, { onContinue, onBack }) {
  main.appendChild(el("p", "pg__eyebrow", sv.label));
  const box = el("div", "scope");
  for (const line of sv.lines) box.appendChild(el("p", "scope__line", line));
  main.appendChild(box);

  const p = el("button", "btn btn--primary pg__cta", sv.primary);
  p.type = "button";
  p.addEventListener("click", onContinue);
  main.appendChild(p);

  const s = el("button", "btn btn--quiet", sv.secondary);
  s.type = "button";
  s.addEventListener("click", onBack);
  main.appendChild(s);
}

// ── 질문 종료 전환 ─────────────────────────────────
// 'AI 분석 중'류 표현 금지. 중앙 체크 하나와 두 줄.
export function renderTransition(main, tv, onGo) {
  const box = el("section", "gate");
  const mark = el("p", "gate__mark", "✓");
  mark.setAttribute("aria-hidden", "true");
  box.appendChild(mark);
  box.appendChild(el("h2", "gate__title", tv.title));
  const lines = el("p", "gate__lines");
  tv.lines.forEach((l, i) => {
    if (i) lines.appendChild(el("br"));
    lines.appendChild(el("span", null, l));
  });
  box.appendChild(lines);
  const go = el("button", "btn btn--primary pg__cta", tv.cta);
  go.type = "button";
  go.addEventListener("click", onGo);
  box.appendChild(go);
  main.appendChild(box);
}

// ── 재방문 경과시간 게이트 ─────────────────────────
// 현재 시각 시계가 아니다. 카운트다운 연출도 없다.
export function renderRevisit(main, rv, onGo) {
  const box = el("section", "gate gate--revisit");
  box.appendChild(el("p", "gate__label", rv.dateLabel));
  box.appendChild(el("p", "gate__date", rv.date));

  box.appendChild(el("p", "gate__label", rv.elapsedLabel));
  const panel = el("div", "elapsed");
  for (const e of rv.elapsed) {
    const item = el("span", "elapsed__item");
    item.appendChild(el("span", "elapsed__num", e.num));
    item.appendChild(el("span", "elapsed__unit", e.unit));
    panel.appendChild(item);
  }
  box.appendChild(panel);

  const lines = el("p", "gate__lines");
  rv.lines.forEach((l, i) => {
    if (i) lines.appendChild(el("br"));
    lines.appendChild(el("span", null, l));
  });
  box.appendChild(lines);

  const go = el("button", "btn btn--primary pg__cta", rv.cta);
  go.type = "button";
  go.addEventListener("click", onGo);
  box.appendChild(go);
  main.appendChild(box);
}
