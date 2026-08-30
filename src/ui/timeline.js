// 타임라인 뷰모델 — 엔진 출력을 화면 구조로 옮긴다. **DOM을 모른다.**
//
// 판단이 브라우저 안에 숨으면 계기판이 못 본다. view.js와 같은 이유로
// 순수함수이고 test/view.test.mjs가 본다.
//
// ★ 여기서 하는 판단은 **자르고 접는 것**뿐이다(D-019 §2 — 엔진은 rank만
//   주고 자르지 않는다). rank를 다시 계산하지 않는다. 규칙이 두 곳에
//   흩어지면 계기판이 못 본다.

import { COPY, SECTION_LABEL } from "./copy.js";
import { formatDate } from "./view.js";

// 카드 예산. D-019 §1의 "1+4"이고 근거는 CLAUDE.md 한 문장이다 —
// 사용자 관찰이 아니므로 재검토 조건에 올라 있다.
export const CARD_BUDGET = 5;

// 타임라인 페이지의 접힌 구간 순서.
//
// **`anytime`이 여기 없다**(6단계). 시점 무관한 것들은 체크 페이지로 갔다 —
// 타임라인은 "지금 어디쯤"을 말하는 곳인데 `anytime`은 시점이 없어서
// 그 축에 놓이지 않는다. `missed`·`standing`도 각자 별도 자리다.
//
// **카드 영역(rank ≤ 5)은 전 구간 대상 그대로다.** anytime 행이 상위 5에
// 들면 카드로 뜬다(3년 시효가 그렇다) — 그러면 그 항목은 카드와 체크
// 페이지에 함께 보이는데, **의도된 중복이고 체크 상태는 공유된다.**
const SECTION_ORDER = ["today", "this_week", "after_report"];

// 엔진 행 → 화면 행. 값이 없으면 null이지 키가 빠지지 않는다(엔진 계약과 같은 톤).
function toRow(x, ctx = {}) {
  const a = x.action;
  return {
    id: a.id,
    title: a.title,
    summary: a.summary ?? null,
    body: a.body ?? null,
    group: a.domain_group ?? x.group ?? null,
    category: x.category ?? a.category ?? null,
    irreversible: a.irreversible === true,
    // 출처 한 줄을 그리기 위한 재료. 없는 항목이 21건이라 null이 정상이다.
    sourceUrl: a.source_url ?? null,
    sourceGrade: a.source_grade ?? null,
    // 새 출처 구조. **아직 전부 빈 배열이다** — 채우는 것은 원문을 하나씩
    // 확인하는 콘텐츠 패스의 일이고, URL이나 본문을 파싱해 문서명·조문을
    // 만들어 내지 않는다. 화면은 sources → legacy sourceUrl → 생략 순으로 읽는다.
    sources: a.sources ?? [],
    // 조례 항목의 출처는 Action이 아니라 자치구 조례에 있다. 행이 조합에 필요한
    // 재료(조례 이름·해당 조문)를 싣는다 — 엔진이 아니라 여기서.
    ordinanceName: a.ordinance_based ? ctx.ordinanceName ?? null : null,
    ordinanceArticle:
      a.ordinance_based && a.support_item ? (ctx.articles ?? {})[a.support_item] ?? null : null,
    ordinanceCheckedAt: a.ordinance_based ? ctx.ordinanceCheckedAt ?? null : null,
    // 조례 항목에만 붙는 문의 줄의 조건. 엔진이 `dept`·`amount_known`을
    // 조례 항목에만 채우지만, 자치구 미지정이면 그것도 null이 되므로
    // Action 쪽 플래그를 그대로 본다.
    ordinanceBased: a.ordinance_based === true,
    when: x.when ?? null,
    rank: x.rank ?? null,
    locked: x.locked === true,
    checkable: x.checkable === true,
    // 잠긴 행이 "먼저: OO"를 조합하는 재료. 콘텐츠를 새로 쓰지 않는다(4/4-B).
    blockedBy: x.blockedBy ?? [],
    blocksReason: x.blocks_reason ?? null,
    status: x.status ?? null,
    statusIfPending: x.status_if_pending ?? null,
    reason: x.reason ?? null,
    dept: x.dept ?? null,
    amountKnown: x.amount_known ?? null,
    waitDays: x.wait_days ?? null,
    deadlineDays: x.deadline_days ?? null,
    completedAt: x.completed_at ?? null,
  };
}

const sectionRows = (result, ctx) => {
  const out = [];
  for (const s of result.sections || [])
    for (const g of s.groups || [])
      for (const it of g.items || []) out.push({ ...toRow(it, ctx), section: s.key });
  return out;
};

export function timelineView({ result, state = {}, data = {}, budget = CARD_BUDGET } = {}) {
  // 조례 항목의 출처 재료. Action이 아니라 그 사람의 자치구 조례에 있다.
  const 구 = (data.districts || []).find((d) => d.id === state.district) || null;
  const ctx = {
    ordinanceName: 구?.ordinance_name ?? null,
    articles: 구?.support_articles ?? {},
    ordinanceCheckedAt: 구?.checked_at ?? null,
  };
  const rows = sectionRows(result, ctx);
  const bySection = (key) => rows.filter((r) => r.section === key);

  // ── 카드 영역 — 자르는 것은 UI다 ────────────────
  // 엔진이 준 rank를 그대로 쓴다. standing과 missed는 rank가 null이라
  // 애초에 여기 들어오지 않는다.
  const ranked = rows.filter((r) => typeof r.rank === "number").sort((a, b) => a.rank - b.rank);
  const top = ranked.filter((r) => r.rank <= budget);

  // 접힌 구간 — 카드 예산을 넘은 섹션 행들. 라벨과 개수만 보인다.
  const more = [];
  for (const key of SECTION_ORDER) {
    const rest = bySection(key).filter((r) => typeof r.rank === "number" && r.rank > budget);
    if (!rest.length) continue;
    const sec = (result.sections || []).find((s) => s.key === key);
    more.push({
      key,
      // after_report만 라벨이 두 개다. `unlocked`가 그 전환을 정한다 —
      // 조사서를 받기 전에는 "나오면 할 수 있는 것", 받은 뒤에는 "이제".
      label:
        key === "after_report" && sec?.unlocked
          ? COPY.timeline.afterReportOpen
          : SECTION_LABEL[key],
      unlocked: sec?.unlocked ?? true,
      count: rest.length,
      // anytime이 비대해진다(D-019 §7 — 실측 최대 14). 분야로 한 번 더 묶는다.
      groups: groupByDomain(rest),
      items: rest.sort((a, b) => a.rank - b.rank),
    });
  }

  // ── 타임라인 밖 ─────────────────────────────────
  const missedRows = bySection("missed");
  const standingRows = bySection("standing");
  // 체크 페이지가 쓴다. **rank로 자르지 않는다** — 카드에 오른 항목도
  // 여기 그대로 있다(의도된 중복).
  const anytimeRows = bySection("anytime");

  // ── 버킷 ────────────────────────────────────────
  // 기다리는 중 — 정렬은 `wait_days` 하한이다. 버킷 행에는 rank가 없다.
  const waiting = (result.waiting || [])
    .map((x) => toRow(x, ctx))
    .sort((a, b) => (a.waitDays?.[0] ?? 1e9) - (b.waitDays?.[0] ?? 1e9));

  const blocked = (result.blocked || []).map((x) => toRow(x, ctx));

  // 자치구를 안 골라서 미판정인 건은 화면에서 고르게 유도할 수 있다.
  // 다른 미판정(보험 unknown)은 설문으로 돌아가야 하므로 구분한다.
  const noDistrict = !state.district;
  const excluded = (result.excluded || []).map((x) => {
    const r = toRow(x, ctx);
    return { ...r, needsDistrict: noDistrict && r.status === "미판정" };
  });

  // 완료 로그 — 아래에 쌓인다. 날짜가 있으면 함께, 없으면 날짜 없이.
  // **`completed_at`이 null이라고 완료가 아닌 것은 아니다**(4/4-F②).
  const done = (result.done || []).map((x) => {
    const r = toRow(x, ctx);
    return { ...r, doneOn: r.completedAt ? formatDate(r.completedAt) : null };
  });

  // ── 잠긴 행의 선행이 이 화면에 있는가 ───────────
  // **없을 수 있다.** 선행 Action이 `applies_when`에 안 맞으면 그 사람에게는
  // 아예 뜨지 않는데, `depends_on`은 그대로라 잠김만 남는다. 레퍼런스
  // 케이스가 그렇다 — `scene_preserved: true`인 사람에게 `scene-release`가
  // 안 뜨고, 그것을 선행으로 둔 `powder-removal`·`dry-water`가 상위 5에서
  // 잠긴 채로 있다. 엔진·데이터 쪽 문제라 여기서 고치지 않았다(보고 대상).
  //
  // 화면이 할 수 있는 것은 **버튼이 사실이 아닌 것을 주장하지 않게 하는 것**
  // 이다. 갈 곳이 있을 때만 [먼저 할 일 보기]를 그린다.
  const all = [...rows, ...waiting, ...blocked, ...excluded, ...done];
  const present = new Set(all.map((r) => r.id));
  for (const r of all) {
    // **화면에 있는 첫 선행**을 고른다. `blockedBy[0]`만 보면 그것 하나가
    // 안 뜨는 사람에게 "갈 곳 없음"이 되는데, 나머지 선행은 멀쩡히 화면에
    // 있을 수 있다 — `powder-removal`이 그렇다(scene-release는 안 뜨지만
    // photo-before-cleanup은 큰 카드다).
    r.leadTo = r.blockedBy.find((b) => present.has(b.id)) ?? null;
    // 선행이 **하나도** 화면에 없을 때만 스스로 풀 수 없다.
    r.leadMissing = r.blockedBy.length > 0 && !r.leadTo;
  }

  return {
    // 가로 암시선 — 양 끝점만. 중간 노드도 현재 위치 표시도 없다(D-019 §0).
    header: {
      start: COPY.timeline.start,
      end: COPY.timeline.end, // "회복으로" — 끝점은 점이 아니라 화살표다
      line: COPY.timeline.line,
    },
    // 카드 예산 밖 별도 블록. 라벨은 엔진 것을 그대로 쓴다.
    missed: {
      label: SECTION_LABEL.missed,
      count: missedRows.length,
      items: missedRows,
    },
    cards: {
      lead: top[0] ?? null, // rank 1 — 큰 카드
      rest: top.slice(1), // rank 2~5 — 제목 한 줄, 탭하면 그 자리 펼침
    },
    more,
    // 기간 내내 유효한 조건이라 시점에 꽂지 않는다. 체크 개념이 없다.
    standing: {
      label: SECTION_LABEL.standing,
      count: standingRows.length,
      items: standingRows,
    },
    // 시점이 없는 것들. 타임라인의 접힌 구간에는 없고 체크 페이지가 쓴다.
    anytime: {
      label: SECTION_LABEL.anytime,
      count: anytimeRows.length,
      items: anytimeRows,
      groups: groupByDomain(anytimeRows),
    },
    waiting,
    blocked,
    excluded,
    done: { count: done.length, items: done },
  };
}

// ── 부수 ───────────────────────────────────────────

function groupByDomain(rows) {
  const out = [];
  for (const r of rows) {
    const g = out.find((x) => x.group === r.group);
    if (g) g.items.push(r);
    else out.push({ group: r.group, items: [r] });
  }
  return out;
}

// 잠긴 행에서 선행 카드로 보낼 때, 그 선행이 지금 화면 어디에 있는지 찾는다.
// 접힌 구간 안이면 그 구간을 펼쳐야 스크롤이 의미를 갖는다.
export function locate(view, id) {
  if (view.cards.lead?.id === id) return { where: "cards", section: null };
  if (view.cards.rest.some((r) => r.id === id)) return { where: "cards", section: null };
  for (const m of view.more) if (m.items.some((r) => r.id === id)) return { where: "more", section: m.key };
  if (view.anytime.items.some((r) => r.id === id)) return { where: "anytime", section: "anytime" };
  if (view.missed.items.some((r) => r.id === id)) return { where: "missed", section: "missed" };
  if (view.standing.items.some((r) => r.id === id)) return { where: "standing", section: "standing" };
  for (const [k, list] of [["waiting", view.waiting], ["blocked", view.blocked], ["excluded", view.excluded]])
    if (list.some((r) => r.id === id)) return { where: k, section: k };
  if (view.done.items.some((r) => r.id === id)) return { where: "done", section: "done" };
  return null;
}

// "15~60일". 범위를 숫자로 준다 — "빠른 시일 내"가 아니라.
// 값이 없으면 null이고 화면은 기간 없이 상태만 말한다.
export function waitLabel(waitDays) {
  if (!Array.isArray(waitDays) || waitDays.length !== 2) return null;
  const [a, b] = waitDays;
  return a === b ? COPY.timeline.waitOne(a) : COPY.timeline.waitRange(a, b);
}
