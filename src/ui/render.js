// 타임라인 그리기 — 뷰모델이 정한 것을 DOM으로 옮긴다.
//
// 판단은 timeline.js가 한다. 여기는 만들기만 한다. app.js에서 떼어낸 것은
// 부트·라우팅과 타임라인이 한 파일에 있으면 800줄이 넘어서다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). 누수 탐지가 src/ 아래를 재귀로 훑는다.

import { COPY, STATUS_LABEL } from "./copy.js";
import { waitLabel } from "./timeline.js";

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
export const clear = (n) => {
  while (n.firstChild) n.removeChild(n.firstChild);
};
const btn = (cls, label, fn) => {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
};

// ── 본체 ───────────────────────────────────────────
// handlers: { onCheck(id, on) · onGoTo(id) · onPickDistrict() · onAnswer() }
export function renderTimeline(main, tv, handlers = {}) {
  main.appendChild(hintLine(tv.header));

  if (tv.missed.count) main.appendChild(missedBlock(tv.missed, handlers));

  // 카드 영역 — 읽을 것은 하나, 있는 것은 다섯 (D-019 개정 결정 4)
  const cards = el("section", "cards");
  if (tv.cards.lead) cards.appendChild(leadCard(tv.cards.lead, handlers));
  if (tv.cards.rest.length) {
    const list = el("ul", "cardlist");
    for (const r of tv.cards.rest) list.appendChild(lineCard(r, handlers));
    cards.appendChild(list);
  }
  main.appendChild(cards);

  // 접힌 구간 — 라벨과 개수만. 지우는 것이 아니라 접는 것이다(D-011).
  for (const m of tv.more) main.appendChild(moreBlock(m, handlers));

  // 타임라인 밖 별도 밴드. 항상 보인다.
  if (tv.standing.count) main.appendChild(standingBand(tv.standing));

  if (tv.waiting.length) main.appendChild(waitingBlock(tv.waiting));
  if (tv.blocked.length) main.appendChild(bucketBlock("blocked", tv.blocked, handlers));
  if (tv.excluded.length) main.appendChild(excludedBlock(tv.excluded, handlers));
  if (tv.done.count) main.appendChild(doneBlock(tv.done, handlers));
}

// 출처 한 줄. **고지문의 "본문에 출처를 밝혀 두었습니다"를 참으로 만드는
// 자리다** — 안 그리면 그 문장이 거짓이 된다. `source_url`이 없는 항목이
// 21건이라 그때는 줄 자체를 만들지 않는다(빈 "출처:"가 더 나쁘다).
function sourceLine(r) {
  if (!r.sourceUrl) return null;
  let host;
  try {
    host = new URL(r.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const p = el("p", "src");
  const a = el("a", "src__link", COPY.timeline.source(host));
  a.href = r.sourceUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  p.appendChild(a);
  return p;
}

// 조례 항목에 붙는 줄. **면책 문구가 아니라 정보다** — 확정하는 곳이
// 구청이라는 사실을 미리 알면 헛걸음과 실망이 줄고, 무엇을 물으러 가는지도
// 분명해진다. 금액은 25개 구 전부 미상이라 이 줄이 D-003의 degrade다.
function ordinanceLine(r) {
  if (!r.ordinanceBased) return null;
  return el("p", "row__dept", COPY.timeline.ordinanceNote(r.dept));
}

const append = (node, child) => {
  if (child) node.appendChild(child);
};

// ── 갈림길 노드 ────────────────────────────────────
// 아직 답하지 않은 질문이 타임라인 위의 노드로 놓인다. 답이 갈리면 화면이
// 어떻게 달라지는지를 **유령 미리보기**로 먼저 보여준다 — 추측이 아니라
// 그 답으로 실제 판정을 돌려 뽑은 제목이다.
export function forkNode(fv, handlers = {}) {
  const sec = el("section", "fork");
  sec.appendChild(el("p", "fork__kicker", COPY.fork.title));
  sec.appendChild(el("h3", "fork__q", fv.question.text));
  if (fv.question.help) sec.appendChild(el("p", "hint", fv.question.help));

  const list = el("ul", "fork__opts");
  for (const o of fv.question.options) {
    const li = el("li", "fork__opt");
    li.appendChild(
      btn("choice", o.label, () => handlers.onAnswer && handlers.onAnswer(fv.question.key, o.value))
    );
    // 아직 고르지 않은 가지는 흐리게. 2~3개까지만 — 전부 보여주면 답하기
    // 전에 화면이 는다.
    const ghost = el("div", "ghost");
    if (o.preview.length) {
      ghost.appendChild(el("p", "ghost__label", COPY.fork.preview));
      const ul = el("ul", "ghost__list");
      for (const g of o.preview) ul.appendChild(el("li", "ghost__item", g.title));
      ghost.appendChild(ul);
    } else if (o.moved.length) {
      ghost.appendChild(el("p", "ghost__label", COPY.fork.moved));
      const ul = el("ul", "ghost__list");
      for (const g of o.moved) ul.appendChild(el("li", "ghost__item", g.title));
      ghost.appendChild(ul);
    } else {
      ghost.appendChild(el("p", "ghost__label", COPY.fork.noChange));
    }
    li.appendChild(ghost);
    list.appendChild(li);
  }
  sec.appendChild(list);
  sec.appendChild(el("p", "hint", COPY.fork.hint));
  return sec;
}

// ── 자치구 비교 ────────────────────────────────────
// **보기 전환일 뿐이다.** 저장된 자치구는 바뀌지 않는다.
export function compareBlock(cv, handlers = {}, { picking = false } = {}) {
  const sec = el("section", "compare");
  if (!cv.active) {
    if (!cv.mine) {
      sec.appendChild(el("p", "hint", COPY.compare.needMine));
      return sec;
    }
    if (!picking) {
      sec.appendChild(btn("btn", COPY.compare.open, () => handlers.onCompareOpen && handlers.onCompareOpen()));
      return sec;
    }
    sec.appendChild(el("h3", "h3", COPY.compare.pick));
    const list = el("ul", "picker");
    for (const o of cv.options) {
      const li = el("li");
      li.appendChild(btn("picker__item", o.name, () => handlers.onComparePick && handlers.onComparePick(o.id)));
      list.appendChild(li);
    }
    sec.appendChild(list);
    sec.appendChild(btn("btn btn--quiet", COPY.compare.back, () => handlers.onCompareClose && handlers.onCompareClose()));
    return sec;
  }

  // 비교 중이라는 것이 화면에 계속 보여야 한다.
  const head = el("p", "compare__head");
  head.appendChild(el("strong", null, COPY.compare.active(cv.mine.name, cv.other.name)));
  head.appendChild(btn("btn btn--quiet", COPY.compare.back, () => handlers.onCompareClose && handlers.onCompareClose()));
  sec.appendChild(head);
  sec.appendChild(el("p", "hint", COPY.compare.note));

  const table = el("ul", "compare__rows");
  for (const r of cv.rows) {
    const li = el("li", "compare__row");
    li.appendChild(el("p", "compare__title", r.title));
    const pair = el("div", "compare__pair");
    const opt = { fallbackRow: r.id === "no-ordinance-fallback" };
    pair.appendChild(side(cv.mine.name, r.mine, opt));
    pair.appendChild(side(cv.other.name, r.other, opt));
    li.appendChild(pair);
    table.appendChild(li);
  }
  sec.appendChild(table);
  sec.appendChild(el("p", "hint", COPY.compare.same(cv.sameCount)));
  return sec;
}

function side(name, cell, { fallbackRow = false } = {}) {
  const box = el("div", "compare__side");
  box.appendChild(el("p", "compare__name", name));
  // 조례 미보유 안내 행은 "없습니다 · 해당"으로 읽혀 어색했다. 그 행에
  // 한해 두 구를 **같은 축**으로 말한다 — 이 행이 있다는 것 자체가
  // "전용 조례가 없다"는 뜻이고, 없다는 것은 "있다"는 뜻이다.
  if (fallbackRow) {
    box.appendChild(
      el("p", "compare__status", cell ? COPY.compare.noOrdinance : COPY.compare.hasOrdinance)
    );
    return box;
  }
  if (!cell) {
    box.appendChild(el("p", "compare__status", COPY.compare.absent));
    return box;
  }
  box.appendChild(el("p", "compare__status", STATUS_LABEL[cell.status] ?? cell.status));
  if (cell.reason) box.appendChild(el("p", "compare__reason", cell.reason));
  if (cell.dept !== null || cell.status) {
    const d = cell.dept ? COPY.timeline.deptKnown(cell.dept) : null;
    if (d) box.appendChild(el("p", "compare__dept", d));
  }
  return box;
}

// ── 가로 암시선 ────────────────────────────────────
// 양 끝점만. **중간 노드도 현재 위치 표시도 없다** — 점을 찍는 순간
// "아직 이만큼 남았다"가 되고, 정신없는 사람에게 그것은 압박이다.
function hintLine(h) {
  const box = el("section", "arc");
  const row = el("p", "arc__row");
  row.appendChild(el("span", "arc__end", h.start));
  // 끝은 점이 아니라 화살표다(D-019 개정 결정 3).
  row.appendChild(el("span", "arc__line", "————————→"));
  row.appendChild(el("span", "arc__end arc__end--to", h.end));
  box.appendChild(row);
  box.appendChild(el("p", "arc__line-copy", h.line));
  return box;
}

// ── 지나간 것 ──────────────────────────────────────
// 카드 예산 밖 별도 블록. rank가 null이라 순위 경쟁에 없다.
function missedBlock(m, handlers) {
  const det = el("details", "block block--missed");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", m.label));
  sum.appendChild(el("span", "block__count", String(m.count)));
  det.appendChild(sum);
  det.appendChild(el("p", "hint", COPY.timeline.missedHint));
  const ul = el("ul", "rows");
  for (const r of m.items) ul.appendChild(rowItem(r, handlers, { dim: true }));
  det.appendChild(ul);
  return det;
}

// ── 카드 ───────────────────────────────────────────
function leadCard(r, handlers) {
  const card = el("article", "card card--lead");
  card.dataset.row = r.id;
  card.appendChild(el("h2", "card__title", r.title));
  if (r.summary) card.appendChild(el("p", "card__summary", r.summary));
  card.appendChild(tags(r));
  append(card, ordinanceLine(r));
  if (r.body) {
    const det = el("details", "card__more");
    det.appendChild(el("summary", null, COPY.timeline.detail));
    det.appendChild(el("p", "card__body", r.body));
    append(det, sourceLine(r));
    card.appendChild(det);
  }
  if (r.locked) card.appendChild(lockedNote(r, handlers));
  else if (r.checkable) card.appendChild(checkbox(r, handlers));
  return card;
}

// 2~5위 — 제목 한 줄. 탭하면 **그 자리에서** 펼친다.
// 통째로 접으면 "다음 4개"가 "뭔지 모를 4개"가 되어 §1이 무너진다.
function lineCard(r, handlers) {
  const li = el("li", "cardline");
  li.dataset.row = r.id;
  const det = el("details");
  const sum = el("summary", "cardline__sum");
  sum.appendChild(el("span", "cardline__rank", String(r.rank)));
  sum.appendChild(el("span", "cardline__title", r.title));
  if (r.locked) sum.appendChild(el("span", "tag tag--locked", "잠김"));
  det.appendChild(sum);
  if (r.summary) det.appendChild(el("p", "card__summary", r.summary));
  det.appendChild(tags(r));
  append(det, ordinanceLine(r));
  if (r.body) det.appendChild(el("p", "card__body", r.body));
  append(det, sourceLine(r));
  if (r.locked) det.appendChild(lockedNote(r, handlers));
  else if (r.checkable) det.appendChild(checkbox(r, handlers));
  li.appendChild(det);
  return li;
}

// ── 접힌 구간 ──────────────────────────────────────
function moreBlock(m, handlers) {
  const det = el("details", "block");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", m.label));
  sum.appendChild(el("span", "block__count", String(m.count)));
  det.appendChild(sum);
  det.dataset.section = m.key;

  // anytime이 비대해진다(D-019 §7 · 실측 최대 14). 분야로 한 번 더 묶는다.
  if (m.key === "anytime" && m.groups.length > 1) {
    for (const g of m.groups) {
      const sub = el("details", "block block--sub");
      const s2 = el("summary", "block__sum");
      s2.appendChild(el("span", "block__label", g.group || "그 밖"));
      s2.appendChild(el("span", "block__count", String(g.items.length)));
      sub.appendChild(s2);
      const ul = el("ul", "rows");
      for (const r of g.items) ul.appendChild(rowItem(r, handlers));
      sub.appendChild(ul);
      det.appendChild(sub);
    }
    return det;
  }

  const ul = el("ul", "rows");
  for (const r of m.items) ul.appendChild(rowItem(r, handlers));
  det.appendChild(ul);
  return det;
}

// ── 금지 밴드 ──────────────────────────────────────
// 타임라인 밖이다. 시점에 꽂으면 "언제 하는 일"로 읽힌다. 체크가 없다.
function standingBand(b) {
  const sec = el("section", "band");
  sec.appendChild(el("h3", "band__title", b.label));
  const ul = el("ul", "rows");
  for (const r of b.items) {
    const li = el("li", "row row--standing");
    li.dataset.row = r.id;
    const det = el("details");
    det.appendChild(el("summary", "row__sum", r.title));
    if (r.summary) det.appendChild(el("p", "row__summary", r.summary));
    if (r.body) det.appendChild(el("p", "card__body", r.body));
    append(det, sourceLine(r));
    li.appendChild(det);
    ul.appendChild(li);
  }
  sec.appendChild(ul);
  sec.appendChild(el("p", "hint", COPY.timeline.standingNote));
  return sec;
}

// ── 버킷 ───────────────────────────────────────────
function waitingBlock(rows) {
  const det = el("details", "block");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", "기다리는 중"));
  sum.appendChild(el("span", "block__count", String(rows.length)));
  det.appendChild(sum);
  const ul = el("ul", "rows");
  for (const r of rows) {
    const li = el("li", "row");
    li.dataset.row = r.id;
    li.appendChild(el("p", "row__sum", r.title));
    if (r.summary) li.appendChild(el("p", "row__summary", r.summary));
    append(li, sourceLine(r));
    const w = waitLabel(r.waitDays);
    if (w) {
      li.appendChild(el("p", "row__wait", `${COPY.timeline.waitTitle} ${w}`));
      // 기간을 약속하지 않는다. 화재조사는 법정 표준기간이 없다(4/4-F).
      li.appendChild(el("p", "hint", COPY.timeline.waitHint));
    }
    ul.appendChild(li);
  }
  det.appendChild(ul);
  return det;
}

function bucketBlock(key, rows, handlers) {
  const det = el("details", "block");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", "먼저 할 일이 있음"));
  sum.appendChild(el("span", "block__count", String(rows.length)));
  det.appendChild(sum);
  const ul = el("ul", "rows");
  for (const r of rows) ul.appendChild(rowItem(r, handlers, { dim: true }));
  det.appendChild(ul);
  return det;
}

// 해당 여부 — 지우지 않는다(D-011). "이런 지원이 있지만 당신은 이 사유로
// 해당되지 않는다"도 정보다.
function excludedBlock(rows, handlers) {
  const det = el("details", "block");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", "해당 여부 확인 필요"));
  sum.appendChild(el("span", "block__count", String(rows.length)));
  det.appendChild(sum);
  const ul = el("ul", "rows");
  for (const r of rows) {
    const li = el("li", "row row--dim");
    li.dataset.row = r.id;
    const head = el("p", "row__sum");
    head.appendChild(el("span", null, r.title));
    // 상태는 색이 아니라 글자다(WCAG 1.4.1). **엔진 문자열을 그대로 쓰지
    // 않는다** — "미판정"은 내부 용어이고 화면에서는 "아직 확인 못 함"이다.
    head.appendChild(el("span", "tag", STATUS_LABEL[r.status] ?? r.status));
    li.appendChild(head);
    if (r.reason) li.appendChild(el("p", "row__reason", r.reason));
    // 금액을 몰라도 창구는 말한다(D-003). dept가 null인 구가 9개다.
    // 조례 항목은 카드와 같은 문장을 쓴다 — 같은 사실을 두 가지로 말하지 않는다.
    if (r.ordinanceBased) append(li, ordinanceLine(r));
    else if (r.dept !== null)
      li.appendChild(el("p", "row__dept", COPY.timeline.deptKnown(r.dept)));
    if (r.needsDistrict && handlers.onPickDistrict)
      li.appendChild(btn("btn btn--quiet", COPY.timeline.pickDistrict, handlers.onPickDistrict));
    ul.appendChild(li);
  }
  det.appendChild(ul);
  return det;
}

// 완료 로그 — 아래에 쌓인다. 숫자만이고 배지·축하는 없다.
function doneBlock(d, handlers) {
  const det = el("details", "block block--done");
  const sum = el("summary", "block__sum");
  sum.appendChild(el("span", "block__label", COPY.timeline.doneTitle));
  sum.appendChild(el("span", "block__count", COPY.timeline.doneCount(d.count)));
  det.appendChild(sum);
  const ul = el("ul", "rows");
  for (const r of d.items) {
    const li = el("li", "row row--done");
    li.dataset.row = r.id;
    const head = el("p", "row__sum");
    head.appendChild(el("span", null, r.title));
    // completed_at이 null이라고 완료가 아닌 것은 아니다(4/4-F②).
    head.appendChild(el("span", "row__date", r.doneOn || COPY.timeline.doneNoDate));
    li.appendChild(head);
    if (r.checkable && handlers.onCheck)
      li.appendChild(btn("btn btn--quiet", COPY.timeline.uncheck, () => handlers.onCheck(r.id, false)));
    ul.appendChild(li);
  }
  det.appendChild(ul);
  return det;
}

// ── 행 ─────────────────────────────────────────────
function rowItem(r, handlers, { dim = false } = {}) {
  const li = el("li", `row${dim ? " row--dim" : ""}`);
  li.dataset.row = r.id;
  const det = el("details");
  const sum = el("summary", "row__sum");
  sum.appendChild(el("span", null, r.title));
  if (r.locked) sum.appendChild(el("span", "tag tag--locked", "잠김"));
  det.appendChild(sum);
  if (r.summary) det.appendChild(el("p", "row__summary", r.summary));
  append(det, ordinanceLine(r));
  if (r.body) det.appendChild(el("p", "card__body", r.body));
  append(det, sourceLine(r));
  if (r.locked) det.appendChild(lockedNote(r, handlers));
  else if (r.checkable && handlers.onCheck) det.appendChild(checkbox(r, handlers));
  li.appendChild(det);
  return li;
}

// 잠김 — 제자리에 흐림으로 남고 "먼저: OO"를 단다(D-019 §5).
// **탭하면 그 선행 카드로 보낸다.** 화면에 "지금 못 하는 것"이 있는데
// 여는 열쇠가 같은 화면에 없는 것이 §4의 관측이었다.
function lockedNote(r, handlers) {
  const box = el("div", "locked");
  const first = r.blockedBy[0];
  const label = first?.title
    ? `${COPY.timeline.lockedPrefix}: ${first.title}`
    : COPY.timeline.lockedPrefix;
  box.appendChild(el("p", "locked__text", label));
  if (r.blocksReason) box.appendChild(el("p", "hint", r.blocksReason));
  // **갈 곳이 있을 때만 버튼을 그린다.** 선행이 이 사람 화면에 아예 없는
  // 경우가 있고(timeline.js의 leadMissing), 그때 버튼은 아무 데도 못 간다 —
  // 버튼이 사실이 아닌 것을 주장하게 된다.
  if (r.leadTo && handlers.onGoTo)
    box.appendChild(btn("btn btn--quiet", COPY.timeline.lockedGo, () => handlers.onGoTo(r.leadTo.id)));
  else if (r.leadMissing) box.appendChild(el("p", "hint", COPY.timeline.lockedElsewhere));
  return box;
}

// 체크는 `checkable` 행만. 금지(standing)와 잠김은 체크 UI를 그리지 않는다.
function checkbox(r, handlers) {
  if (!handlers.onCheck) return el("span");
  const label = el("label", "check");
  const input = el("input");
  input.type = "checkbox";
  input.className = "check__box";
  input.checked = false;
  input.addEventListener("change", () => handlers.onCheck(r.id, true));
  label.appendChild(input);
  label.appendChild(el("span", "check__label", COPY.timeline.check));
  return label;
}

// 상태를 글자로 말한다. 색은 보조다.
function tags(r) {
  const box = el("p", "tags");
  if (r.irreversible) box.appendChild(el("span", "tag", "되돌릴 수 없음"));
  if (r.deadlineDays) box.appendChild(el("span", "tag", `기한 ${r.deadlineDays}일`));
  if (r.category) box.appendChild(el("span", "tag tag--quiet", r.category));
  return box;
}
