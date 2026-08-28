// 페이지 뷰모델 — 6단계의 화면 구조를 정한다. **DOM을 모른다.**
//
// 화면이 단일 세로 스크롤에서 **가로 페이지 덱**으로 바뀌었다.
//
//   [인트로] → [안내] → [설문 → 요약] ⇄ [타임라인] ⇄ [체크] ⇄ [근거] ⇄ [연락처]
//    첫 방문만                          ←—— 가로 스와이프 덱 ——→
//
// 각 페이지가 무엇을 담을지는 여기서 정하고 screens.js가 그린다.
// 판단이 브라우저 안에 숨으면 계기판이 못 본다 — 엔진과 같은 이유다.
//
// ★ 여기서 판정을 다시 하지 않는다. 엔진이 준 행을 고르고 묶을 뿐이다.

import { COPY, CONTACTS, CONTACT_BY_ACTION } from "./copy.js";
import { visibleQuestions, unansweredKeys } from "../questions.js";

// 가로 덱의 페이지. 순서가 곧 스와이프 순서다.
export const DECK = ["timeline", "check", "sources", "contacts"];

// ── 인트로 ─────────────────────────────────────────
//
// 첫 방문에만 뜬다. 플래그는 **state에 넣어 saveState로 저장한다** —
// localStorage 직접 호출 금지는 UI에서도 그대로다(누수 탐지가 잡는다).
export function introView(state = {}) {
  return {
    show: state.intro_seen !== true,
    eyebrow: COPY.intro.eyebrow,
    lead: COPY.intro.lead,
    letters: COPY.intro.letters,
    line: COPY.intro.line,
    cta: COPY.intro.cta,
    micro: COPY.intro.micro,
  };
}

// 설문 앞 한 화면. 왜 묻는지만 말한다 — 속도도 결과도 약속하지 않는다.
export function guideView() {
  return { title: COPY.guide.title, lines: COPY.guide.lines, cta: COPY.guide.cta };
}

// ── 요약 ───────────────────────────────────────────
//
// 답한 내용 전체를 질문·답 쌍으로. **각 줄이 그 질문으로 돌아가는 문이다** —
// 기존 [답한 내용 바꾸기] 헤더 버튼이 이 화면으로 흡수됐다.
export function summaryView({ questions, state, data, now = Date.now() } = {}) {
  const visible = visibleQuestions(questions, state, data, now);
  const rows = visible
    .filter((q) => state[q.key] !== undefined)
    .map((q) => ({
      id: q.id,
      key: q.key,
      question: q.text,
      answer: labelOf(q, state[q.key]),
    }));
  const remaining = unansweredKeys(questions, state, data, now).length;
  return { rows, remaining, complete: remaining === 0 };
}

// ── 체크 페이지 ────────────────────────────────────
//
// 시점이 없는 것들. 두 묶음이 성격이 정반대라 탭으로 가른다.
// **기본 탭은 "해두면 좋은 일"이다** — 처음 보는 화면이 금지 목록이면
// 정신없는 사람에게 첫인상이 "하지 마라"가 된다.
export function checkView(tv) {
  return {
    tabs: [
      { key: "todo", label: COPY.check.todo, count: tv.anytime.count },
      { key: "avoid", label: COPY.check.avoid, count: tv.standing.count },
    ],
    // 체크할 수 있는 것. 완료하면 아래 완료 로그로 내려간다.
    todo: { groups: tv.anytime.groups, items: tv.anytime.items },
    // 금지는 체크 개념이 없다(D-018). 항상 전부 보인다.
    avoid: { items: tv.standing.items },
    done: tv.done,
  };
}

// ── 근거 페이지 ────────────────────────────────────
//
// 이 사람에게 해당하는 행 중 출처가 있는 것을 분야로 묶는다.
// **설문 결과에 따라 달라진다** — 엔진 행에서 그대로 뽑고 재판정하지 않는다.
export function sourcesView(tv) {
  // 해당·조건부·미판정까지 포함한다. "아직 확인 못 함"도 그 사람 화면의
  // 일부이고, 근거를 숨길 이유가 없다.
  const live = [
    tv.cards.lead,
    ...tv.cards.rest,
    ...tv.more.flatMap((m) => m.items),
    ...tv.anytime.items,
    ...tv.standing.items,
    ...tv.missed.items,
    ...tv.waiting,
    ...tv.blocked,
    ...tv.done.items,
    ...tv.excluded.filter((r) => r.status !== "제외"),
  ].filter(Boolean);

  const seen = new Set();
  const groups = [];
  for (const r of live) {
    if (!r.sourceUrl || seen.has(r.id)) continue;
    seen.add(r.id);
    const host = hostOf(r.sourceUrl);
    if (!host) continue;
    const g = groups.find((x) => x.group === r.group);
    const item = { id: r.id, title: r.title, url: r.sourceUrl, host, grade: r.sourceGrade };
    if (g) g.items.push(item);
    else groups.push({ group: r.group || COPY.sources.etc, items: [item] });
  }

  // 해당 없는 것도 사라지지 않는다(D-011). 사유와 함께 접어 둔다.
  const excluded = tv.excluded
    .filter((r) => r.status === "제외")
    .map((r) => ({ id: r.id, title: r.title, reason: r.reason, status: r.status }));

  return { groups, excluded, count: seen.size };
}

// ── 연락처 페이지 ──────────────────────────────────
//
// **v1은 구별 전화번호 없이 구성한다.** 그 데이터는 다음 패스에서 온다 —
// 자리를 뷰모델에 비워 두되(tel: null) 화면에 "준비 중"을 쓰지 않는다.
// 없는 줄은 안 그린다.
export function contactsView(tv, { state = {}, data = {} } = {}) {
  const district = (data.districts || []).find((d) => d.id === state.district) || null;

  // 조례 항목이 화면에 있으면 그 구의 담당 부서를 안내한다. 부서를 모르는
  // 구가 9개라 그때는 이름 없이 "구청 대표번호로 문의"만 남는다(D-003).
  const hasOrdinanceRow = [
    tv.cards.lead,
    ...tv.cards.rest,
    ...tv.more.flatMap((m) => m.items),
    ...tv.anytime.items,
    ...tv.blocked,
    ...tv.excluded,
    ...tv.done.items,
  ].some((r) => r && r.ordinanceBased);

  // 화면에 그 안내가 있을 때만 창구를 띄운다 — 설문 맞춤이다.
  const shown = new Set(
    [
      tv.cards.lead,
      ...tv.cards.rest,
      ...tv.more.flatMap((m) => m.items),
      ...tv.anytime.items,
      ...tv.standing.items,
      ...tv.waiting,
      ...tv.blocked,
      ...tv.done.items,
    ]
      .filter(Boolean)
      .map((r) => r.id)
  );
  const orgs = Object.entries(CONTACT_BY_ACTION)
    .filter(([id]) => shown.has(id))
    .map(([id, c]) => ({ id, name: c.name, tel: c.tel, note: c.note ?? null }));

  return {
    global: CONTACTS.map((c) => ({ ...c })),
    district:
      district && hasOrdinanceRow
        ? {
            id: district.id,
            name: district.name,
            dept: district.dept ?? null,
            // 구별 번호는 다음 패스. 비워 두되 화면은 없는 줄을 안 그린다.
            tel: null,
            note: district.dept
              ? COPY.contacts.deptNote(district.name, district.dept)
              : COPY.contacts.deptUnknown(district.name),
          }
        : null,
    orgs,
  };
}

// ── 덱 ─────────────────────────────────────────────
// 점 인디케이터와 라벨. **라벨 탭으로도 이동한다** — 스와이프를 못 찾는
// 사람에게 길이 하나뿐이면 그 사람은 갇힌다.
export function deckView(current = DECK[0]) {
  const index = Math.max(0, DECK.indexOf(current));
  return {
    pages: DECK.map((key, i) => ({ key, label: COPY.deck[key], current: i === index })),
    index,
    prev: index > 0 ? DECK[index - 1] : null,
    next: index < DECK.length - 1 ? DECK[index + 1] : null,
  };
}

// ── 부수 ───────────────────────────────────────────

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function labelOf(q, value) {
  if (q.options) {
    const hit = q.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  if (q.type === "date" && value) {
    const d = new Date(value);
    if (!Number.isNaN(+d)) return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return String(value);
}
