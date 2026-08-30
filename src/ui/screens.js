// 화면 그리기 — 뷰모델이 정한 것을 DOM으로 옮긴다.
//
// 진입 흐름(랜딩 · 기본 확인 · 질문 MASTER · 안내 범위 · 전환 · 재방문
// 게이트)이 여기 있고, 결과 화면은 recovery.js가 그린다.
//
// ★ 연락처 그리기는 여기 없다. 보류가 풀리면서 `recovery.js`의
//   `renderDirectory`가 그 자리를 맡았고(data/directory.json을 읽는다),
//   옛 `contacts.js`·`renderContacts`는 이 커밋에서 걷었다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). 누수 탐지가 src/ 아래를 재귀로 훑는다.
// ★ 색값을 쓰지 않는다. 시각은 전부 tokens.css의 변수다.

import { COPY } from "./copy.js";
import { el, clear } from "./render.js";

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
// **확정 사진 배경 위에 글자를 얹는다.** 새벽 그라데이션과 글자 리빌
// 연출은 폐기됐다 — 사진이 그 자리를 대신한다.
//
// 사진은 `<img>`다. CSS 배경이 아니라 요소로 두는 것은 확정 화면의 구조
// 그대로이고(위에서 조금 내려 하늘의 여백을 남긴다), 사진이 안 떠도
// 어두운 바탕에 흰 글자가 남아 읽힌다.
//
// ★ `{ once: true }`를 걸지 않는다. 첫 탭이 저장을 기다리다 소진되면
//   사람이 첫 화면에 갇힌다.
export function renderLanding(host, lv, onPass) {
  clear(host);
  host.hidden = false;

  const bg = el("img", "intro__bg");
  // 배경 사진이다. 정보를 나르지 않으므로 보조기술에서 건너뛴다.
  bg.src = "assets/img/landing-bg.webp";
  bg.setAttribute("alt", "");
  bg.setAttribute("aria-hidden", "true");
  // 첫 화면의 그림이라 늦게 받을 이유가 없다.
  bg.setAttribute("fetchpriority", "high");
  host.appendChild(bg);
  // 위아래 그라데이션 — 글자가 얹히는 자리만 어둡게 눌러 준다.
  host.appendChild(el("div", "intro__veil intro__veil--top"));
  host.appendChild(el("div", "intro__veil intro__veil--bottom"));

  host.appendChild(el("p", "intro__eyebrow", lv.eyebrow));

  const content = el("section", "intro__content");
  content.appendChild(el("h1", "intro__title", lv.brand));
  const sub = el("p", "intro__sub");
  lv.lead.forEach((line, i) => {
    if (i) sub.appendChild(el("br"));
    sub.appendChild(el("span", null, line));
  });
  content.appendChild(sub);
  host.appendChild(content);

  const actions = el("div", "intro__actions");
  const cta = el("button", "intro__cta", lv.cta);
  cta.type = "button";
  cta.addEventListener("click", (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onPass();
  });
  actions.appendChild(cta);
  actions.appendChild(el("p", "intro__footer", lv.footer));
  host.appendChild(actions);

  host.addEventListener("click", onPass);
}

// ── 기본 확인 ──────────────────────────────────────
//
// QR로 값이 미리 들어와도 두 필드 다 확인·수정할 수 있다.
// 날짜는 오늘로 채워져 있고, [다음]을 누르는 것이 "오늘이 맞다"는 확인이다.
export function renderBasicCheck(main, bv, { onDate, onDistrict, onNext }) {
  main.appendChild(el("p", "pg__eyebrow", bv.label));
  main.appendChild(el("h2", "pg__title", bv.title));
  const help = el("p", "pg__desc");
  for (const part of bv.helpParts) help.appendChild(el(part.strong ? "strong" : "span", null, part.text));
  main.appendChild(help);

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

  // 기준 줄 — 그 사람의 실제 값이다. 조각만 진하고 이음말은 흐리다.
  const basis = el("p", "gate__basis");
  tv.basis.forEach((part, i) => {
    if (i) basis.appendChild(el("span", null, " · "));
    basis.appendChild(el("strong", null, part));
  });
  basis.appendChild(el("span", null, tv.basisTail));
  box.appendChild(basis);

  box.appendChild(el("p", "gate__lines", tv.message));
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
  // 숫자 뒤에 작게. 날짜와 경과가 같은 크기로 서고 이것만 작다.
  if (rv.elapsedSuffix) panel.appendChild(el("span", "elapsed__suffix", rv.elapsedSuffix));
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
