// 내 회복 경로 — 결과 IA의 뷰모델. **DOM을 모른다.**
//
//   HOME ⇄ { 먼저 볼 내용 · 체크리스트 · 알아둘 내용 ·
//            회복 타임라인 · 주제별로 보기 } ⇄ 상세
//
// ★ **엔진이 준 것을 고르고 묶을 뿐 다시 판정하지 않는다**(ENGINE-FIRST).
//   rank도 placement도 여기서 계산하지 않고, 날짜·기한을 만들어내지 않고,
//   id·title·body 문자열에서 의미를 추론하지 않는다. 화면이 읽는 것은
//   `guidance_type`·`status`·`when`·`locked` 같은 명시 메타데이터뿐이다.

import { COPY, STATUS_LABEL, NODE_LABEL, TOPIC_ORDER, topicLabel } from "./copy.js";
import { buildRows } from "./rows.js";
// 체크리스트 자리표를 위해 엔진을 **재사용한다**(다시 판정하는 것이
// 아니다 — 가정 답을 넣고 같은 엔진을 한 번 더 돌릴 뿐이다).
import { evaluate } from "../engine.js";
import { applyDefaults } from "../questions.js";
import { formatDate } from "./view.js";
import { dotDate, clockTime, shortDate, elapsedText } from "./format.js";

// HOME에서 갈 수 있는 다섯 화면.
export const RESULT_PAGES = [
  "priority", "checklist", "reference", "timeline", "topics",
  // 구 덱에 있다가 새 IA에서 자리를 잃었던 둘이 사용자 결정으로 돌아왔다.
  "sources", "directory",
];

// 타임라인 노드에 놓이는 섹션. **`missed`와 `standing`은 없다** —
// 지나간 것과 금지는 `먼저 볼 내용`이 따로 맡는 IA이고, 여기 다시 넣으면
// 같은 것이 두 번 보인다.
const NODE_ORDER = ["today", "this_week", "anytime", "after_report"];

// 체크리스트가 읽는 섹션. `missed`·`standing`은 빠진다(위와 같은 이유).
const CHECK_SECTIONS = NODE_ORDER;

// 잠긴 카드의 선행이 이것이면 확정 문장을 쓴다. **id로 의미를 추론하는
// 것이 아니라, 확정 UX가 이 선행에 대해 문장 하나를 지정한 것이다.**
const SCENE_RELEASE = "scene-release";

// `미판정`을 만드는 답. 엔진의 undetermined 경로는 둘뿐이다 —
// 자치구 미선택(그쪽은 자치구 선택으로 보낸다)과 이 보험 두 키.
// **test/view.test.mjs가 이 목록이 여전히 전부인지 검사한다.**
const UNDETERMINED_KEYS = ["insurance_self", "insurance_dwelling"];

// 상태 배지의 색 갈래. **엔진 status가 근거다** — 라벨 문자열을 읽어
// 색을 고르지 않는다(제목·id에서 의미를 추론하지 않는 규칙과 같다).
// 여기 없는 status는 색 없는 기본 배지로 그려진다.
const CHIP_KIND = { 완료: "done", 미판정: "undetermined" };

// ── 바탕 ───────────────────────────────────────────
// 화면 여섯이 같은 행 묶음을 읽는다. 화면마다 다시 만들면 같은 사람의
// 같은 시각에 대해 화면끼리 다른 답을 낼 수 있다.
export function resultBase({ result, orderResult = null, state = {}, data = {}, now = Date.now() } = {}) {
  const rows = buildRows({ result, state, data });
  // 체크리스트 **자리표** — 완료를 지운 가정으로 엔진을 돌린 결과의 rank다.
  // 체크해도 항목이 제자리에 남아야 하는데, 실제 결과에서는 완료가 done
  // 버킷으로 빠져 rank를 잃기 때문이다.
  //
  // 부르는 쪽이 만들어 주면 그것을 쓰고(app.js가 `applyDefaults`를 거친
  // state로 만든다), 없으면 여기서 한 번 돌린다. **UI가 rank를 계산하는
  // 것이 아니라 엔진을 재사용하는 것이다.**
  // 완료가 하나도 없으면 실제 결과가 곧 자리표다 — 굳이 한 번 더 돌리지
  // 않는다(그 편이 빠르고, 두 계산이 미세하게 어긋날 여지도 없다).
  const nothingDone = !(state.completed || []).length;
  const src = orderResult ?? (nothingDone ? result : asIfNothingDone(state, data, now)) ?? result;
  const order = seatMap(src);
  return { ...rows, now, fireAt: state.fire_at ?? null, order };
}

// 자리 번호를 매긴다 — **rank가 아니라 자리다.**
//
// rank만 쓰면 선행이 풀린 항목이 목록 위로 뛰어오른다. 사용자 눈에는
// "체크했더니 목록이 재배치됐다"이고, 그것이 바로 하지 않기로 한 일이다
// (사용자 결정: 자동 재정렬 없음). 그래서 **잠긴 것에도 자리를 준다** —
// 완료가 하나도 없던 시점의 rank 순서, 그 뒤에 잠긴 것들, 그 뒤에 나머지.
// 이 번호는 답이 바뀌지 않는 한 고정이다.
function seatMap(src) {
  const order = new Map();
  let seat = 0;
  const put = (it) => {
    const id = it?.action?.id ?? it?.id;
    if (id && !order.has(id)) order.set(id, seat++);
  };
  const ranked = [];
  for (const sec of src?.sections || [])
    for (const g of sec.groups || []) for (const it of g.items || []) ranked.push(it);
  ranked.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  for (const it of ranked) put(it);
  for (const it of src?.blocked || []) put(it);
  for (const it of src?.done || []) put(it);
  return order;
}

// 완료를 지운 가정. 데이터가 없으면(단위 테스트) null을 돌려주고
// 부르는 쪽이 실제 결과로 폴백한다.
function asIfNothingDone(state, data, now) {
  // questions가 없으면 실제 판정과 같은 defaults를 태울 수 없다 —
  // 어긋난 자리표보다 없는 편이 낫다(부르는 쪽이 실제 결과로 폴백한다).
  if (!data || !Array.isArray(data.actions) || !Array.isArray(data.questions)) return null;
  const forEngine = applyDefaults(data.questions || [], { ...state, completed: [] });
  return evaluate({ ...forEngine, completed: [] }, data, now);
}

export function resultView(args) {
  const base = resultBase(args);
  return {
    base,
    home: homeView(base),
    priority: priorityView(base),
    checklist: checklistView(base),
    reference: referenceView(base),
    timeline: recoveryTimelineView(base),
    topics: topicsView(base),
  };
}

// ── HOME ───────────────────────────────────────────
export function homeView(base) {
  const p = priorityView(base);
  const c = checklistView(base);
  const r = referenceView(base);
  // **기준 줄과 리드가 없다**(사용자 실기기 검수 결정). 바로 앞 전환
  // 화면이 같은 말을 하고, 여기는 도착지다 — 도착지의 일은 갈 곳을
  // 보여 주는 것이다.
  return {
    title: COPY.home.title,
    // 핵심 카드 셋. 개수는 동적이다 — 와이어프레임의 숫자는 예시였다.
    cards: [
      { key: "priority", ...COPY.home.cards.priority, count: p.count },
      { key: "checklist", ...COPY.home.cards.checklist, count: c.count },
      { key: "reference", ...COPY.home.cards.reference, count: r.count },
    ],
    // 보조 탐색. '다른 방식으로 보기' 같은 중간 heading은 없다.
    more: [
      { key: "timeline", label: COPY.home.more.timeline },
      { key: "topics", label: COPY.home.more.topics },
    ],
    // 참고 자료 — 한 줄 더. 결과를 보는 방식이 아니라 근거와 창구다.
    extra: [
      { key: "sources", label: COPY.home.extra.sources },
      { key: "directory", label: COPY.home.extra.directory },
    ],
  };
}

// ── 먼저 볼 내용 ───────────────────────────────────
//
// `하지 마세요`는 guidance_type, `늦었어도 확인하세요`는 missed 버킷이다.
// **missed를 "이제 할 수 없음"으로 단정하지 않는다** — 시한이 지났어도
// 확인할 값이 남아 있다는 뜻이다.
export function priorityView(base) {
  const doNot = base.sections.filter(
    (r) => r.guidanceType === "do_not" && r.section !== "missed"
  );
  const missed = base.missed;
  const sections = [
    { key: "do_not", label: COPY.priority.doNot, items: doNot },
    { key: "missed", label: COPY.priority.missed, items: missed },
  ].filter((s) => s.items.length);
  return {
    title: COPY.priority.title,
    desc: COPY.priority.desc,
    sections,
    count: doNot.length + missed.length,
  };
}

// ── 체크리스트 ─────────────────────────────────────
//
// 사용자가 실행해야 하는 것. **잠긴 irreversible도 여기 남는다** — 접어
// 두면 가장 급한 것이 화면에서 사라진다. 순위는 엔진의 rank 그대로이고
// 다시 계산하지 않는다. 버킷 행(blocked)은 rank가 없어서 뒤에 붙는다.
export function checklistView(base) {
  const live = base.sections.filter(
    (r) => r.guidanceType === "action" && CHECK_SECTIONS.includes(r.section)
  );
  // 완료한 것도 **목록에 남는다**(사용자 결정). 아래로 내려가지도, 접힌
  // 블록으로 옮겨가지도 않는다 — 체크한 순간에도, 나갔다 돌아와도 그
  // 자리다. 체크 표시와 완료 스타일만 달라진다.
  //
  // 자리는 `base.order`가 정한다. 실제 결과에서 완료는 done 버킷으로
  // 빠져 rank를 잃으므로, **완료를 지운 가정으로 돌린 엔진 결과**의
  // rank를 자리표로 쓴다(app.js가 만든다). 상태·잠금·사유는 전부 실제
  // 결과 그대로다 — 자리만 자리표에서 온다.
  const done = base.done.map((r) => ({
    ...r,
    statusLabel: STATUS_LABEL["완료"],
    statusKind: CHIP_KIND["완료"],
    completed: true,
    // 기록이 없다고 완료가 아닌 것은 아니다.
    doneOn: r.completedAt ? formatDate(r.completedAt) : null,
  }));
  const seat = (r) => base.order.get(r.id) ?? r.rank ?? Infinity;
  const items = [...live, ...base.blocked, ...done]
    .sort((a, b) => seat(a) - seat(b))
    .map(checkItem);
  return {
    title: COPY.checklist.title,
    desc: COPY.checklist.desc,
    items,
    // 개수는 **완료를 뺀 것**이다 — HOME 카드가 "남은 일"로 읽힌다.
    count: items.filter((r) => !r.completed).length,
    doneCount: done.length,
    footer: COPY.checklist.footer,
  };
}

// 잠김과 불가역 신호를 카드 표면에 붙인다.
//
// **rank를 다시 계산해서 잠긴 것을 아래로 내리지 않는다.** 급한 것이
// 잠긴 채 위에 있는 것은 사실이고, 화면이 할 일은 그 자리에서 무엇을
// 먼저 해야 하는지 말해 주는 것이다. 별도 heading·badge를 만들지 않고
// 더보기 안에 숨기지 않는다.
function checkItem(r) {
  // 문장이 가리키는 선행. scene-release가 걸려 있으면 그것이고,
  // 아니면 남은 선행 중 첫째다.
  const named = r.blockedBy.find((b) => b.id === SCENE_RELEASE) ?? r.blockedBy[0] ?? null;
  const lock = named
    ? {
        sentence:
          named.id === SCENE_RELEASE
            ? COPY.checklist.lockedScene
            : COPY.checklist.lockedOther(named.title ?? ""),
        // 문장 안에서 이 부분만 강조한다.
        emphasis: COPY.checklist.lockedEmphasis,
        // ★ **문장이 가리키는 선행과 목적지가 같을 때만 이동을 그린다.**
        //   레퍼런스 케이스에서 둘이 갈린다 — powder-removal의 문장은
        //   scene-release("조사관에게 확인")인데 그 Action이 그 사람
        //   화면에 없어서 leadTo는 photo-before-cleanup이다. 그대로
        //   버튼을 달면 읽은 문장과 도착한 카드가 다르다. 버튼이 사실이
        //   아닌 것을 주장하지 않게 한다 — photo-before-cleanup은 어차피
        //   rank 1 큰 카드라 길을 잃지 않는다.
        goTo: r.leadTo && r.leadTo.id === named.id ? named.id : null,
        // 선행이 하나도 화면에 없다(안내 문구용).
        missing: r.leadMissing === true,
      }
    : null;
  return {
    ...r,
    lock,
    // 색만으로 전하지 않는다. 글자가 함께 있어야 한다(WCAG 1.4.1).
    warn: r.irreversible ? COPY.checklist.irreversible : null,
  };
}

// ── 알아둘 내용 ────────────────────────────────────
//
// awareness와 waiting을 한 목록에 넣는다. 중간 heading 없이 카드로 나열하고
// **waiting만 카드 수준 상태 `기다리는 중`으로 구분한다.**
// waiting은 blocked와 완전히 다르다 — 사용자가 할 일은 끝났고 외부 절차가
// 도는 중이다. 이것을 `먼저 할 일이 있음`으로 표현하면 거짓이 된다.
export function referenceView(base) {
  const awareness = base.sections
    .filter((r) => r.guidanceType === "awareness")
    .map((r) => ({ ...r, stateLabel: null }));
  const waiting = base.waiting.map((r) => ({
    ...r,
    stateLabel: COPY.reference.waiting,
    stateKind: "waiting",
  }));
  const items = [...awareness, ...waiting];
  return {
    title: COPY.reference.title,
    desc: COPY.reference.desc,
    items,
    count: items.length,
  };
}

// ── 회복 타임라인 ──────────────────────────────────
//
// 전체 흐름을 시간순으로 본다. **완료 처리는 여기가 아니라 체크리스트다.**
//
// 엔진 키 `this_week`를 화면에서 `가까운 시일에`로 부를 뿐 키를 바꾸지
// 않는다. `7일 안에`·`○월 ○일까지`를 만들어내지 않는다 — `this_week` 중
// 일부는 실제 기한이 아니라 표시 버킷이라 거짓 기한이 된다.
export function recoveryTimelineView(base) {
  const nodes = [
    {
      key: "fire",
      kind: "info",
      label: COPY.recovery.fire,
      // 박스 없이 디지털 텍스트로. **없는 시각을 지어내지 않는다.**
      date: dotDate(base.fireAt),
      time: clockTime(base.fireAt),
      text: [dotDate(base.fireAt), clockTime(base.fireAt)].filter(Boolean).join("  "),
    },
  ];
  for (const key of NODE_ORDER) {
    const items = base.bySection(key);
    const meta = base.sectionMeta.get(key) ?? null;
    // `row.locked=true`와 `sections[after_report].unlocked=false`는 다른 것이다.
    // 이쪽은 섹션의 성질이고, 조사서를 받으면 열린다.
    const unlocked = meta ? meta.unlocked !== false : true;
    nodes.push({
      key,
      kind: "section",
      label: NODE_LABEL[key],
      // '오늘'에만 실제 날짜를 보조로 붙인다.
      note:
        key === "today"
          ? shortDate(base.now)
          : key === "after_report" && !unlocked
            ? COPY.recovery.afterReportLocked
            : null,
      count: items.length,
      items,
      unlocked,
      // 노드는 기본 접힘이다. 비어 있어도 축은 남는다 — 노드를 지우면
      // "지금 어디쯤인가"를 읽을 눈금이 사라진다.
      empty: items.length === 0,
    });
  }
  return {
    title: COPY.recovery.title,
    desc: COPY.recovery.desc,
    nodes,
    footer: COPY.recovery.footer,
  };
}

// ── 주제별로 보기 ──────────────────────────────────
//
// 표시 라벨만 갈아 끼운다 — `몸`→`건강`, `서류`→`필요서류`.
// **데이터의 domain_group은 그대로다.** 주제 선택 화면에는 출처를 넣지
// 않는다(출처는 Action 단위다).
export function topicsView(base) {
  const topics = [];
  for (const group of TOPIC_ORDER) {
    const detail = topicDetailView(base, group);
    if (!detail.count) continue; // 해당하는 안내가 있는 주제만
    topics.push({ group, label: detail.label, count: detail.count });
  }
  return {
    title: COPY.topics.title,
    desc: COPY.topics.desc,
    topics,
    footer: COPY.topics.footer,
  };
}

// ── 주제 상세 (7주제 공통 템플릿) ──────────────────
//
// 주제마다 화면을 따로 만들지 않는다. 데이터로 자동 생성한다.
//
// **엔진 excluded 버킷은 status로 나눠서 표현한다.** 한 그룹으로 뭉치면
// "예외적으로 확인해볼 수 있는 것"이 "해당 없음"으로 읽힌다(D-011).
// `미판정`은 접힘이 아니라 본목록에 상태 라벨과 함께 남는다 — 판정 결과가
// 아니라 판정 이전이고, `해당 없음`으로 표시하면 거짓이 된다.
export function topicDetailView(base, group) {
  const mine = (r) => r.group === group;

  const live = [...base.sections, ...base.waiting, ...base.blocked]
    .filter(mine)
    .map((r) => ({ ...r, statusLabel: null }));
  const undetermined = base.excluded
    .filter((r) => mine(r) && r.status === "미판정")
    .map((r) => ({
      ...r,
      statusLabel: STATUS_LABEL["미판정"],
      statusKind: CHIP_KIND["미판정"],
      undetermined: true,
    }));
  // 완료했다고 그 안내가 내 상황에 해당하지 않게 되는 것은 아니다.
  // 완료 '처리'는 체크리스트의 일이고, 여기는 지도다.
  const done = base.done
    .filter(mine)
    .map((r) => ({ ...r, statusLabel: STATUS_LABEL["완료"], statusKind: CHIP_KIND["완료"] }));

  const items = [...live, ...undetermined, ...done].map((r) => ({
    ...r,
    source: sourceOf(r),
  }));

  const pick = (status) =>
    base.excluded
      .filter((r) => mine(r) && r.status === status)
      .map((r) => ({ ...r, statusLabel: STATUS_LABEL[status], statusKind: CHIP_KIND[status] ?? null }));
  const conditional = pick("조건부");
  const excluded = pick("제외");

  const label = topicLabel(group);
  return {
    group,
    label,
    // 주제명 아래 한 줄. 표시 라벨로 조합한다(맞춤 문장은 콘텐츠 백로그).
    desc: COPY.topicDetail.desc(label),
    countLabel: COPY.topicDetail.count(items.length),
    count: items.length,
    items,
    // 사라지지 않는다(D-011). 사유와 함께 접어 둔다.
    folds: [
      { key: "조건부", label: COPY.topicDetail.conditional(conditional.length), items: conditional },
      { key: "제외", label: COPY.topicDetail.excluded(excluded.length), items: excluded },
    ].filter((f) => f.items.length),
    footer: COPY.topicDetail.footer,
  };
}

// ── Action 상세 (공통 템플릿) ──────────────────────
//
// 58개를 개별 확정하지 않는다. 이 템플릿으로 자동 생성한다.
// 출처는 본문보다 낮은 위계다. `검증됨`·`공식 인증` 같은 과장은 쓰지 않는다.
export function actionDetailView(base, id) {
  const r = base.byId.get(id);
  if (!r) return null;
  return {
    topic: topicLabel(r.group),
    title: r.title,
    summary: r.summary,
    body: r.body,
    // 잠김의 의미는 체크리스트와 같은 문장으로 노출한다. 새 화면 유형을
    // 만들지 않는다.
    lock: checkItem(r).lock,
    warn: r.irreversible ? COPY.checklist.irreversible : null,
    statusLabel: r.status && r.status !== "해당" ? STATUS_LABEL[r.status] ?? null : null,
    statusKind: r.status && r.status !== "해당" ? CHIP_KIND[r.status] ?? null : null,
    // 조례 항목의 degrade(D-003) — 지원 여부와 금액을 확정하는 곳은 구청이다.
    // 금액은 25개 구 전부 미상이고 부서도 9개 구가 null이라 이 줄이 기본 경로다.
    ordinanceNote: r.ordinanceBased ? COPY.actionDetail.ordinanceNote(r.dept) : null,
    source: sourceOf(r),
    contact: contactOf(r),
    footer: COPY.actionDetail.footer,
  };
}

// ── 문의처 ─────────────────────────────────────────
//
// **한 Action에 1차 문의처 하나다.** 여럿을 늘어놓으면 사용자가 다시
// "어디로 걸어야 하나"를 판단해야 한다 — 그 판단을 대신하는 것이 이
// 서비스의 일이다. 지금 데이터도 항목마다 하나씩이다.
//
// 비어 있으면 `null`이고 화면은 줄 자체를 그리지 않는다. **없는 번호를
// 만들지 않고 "준비 중"도 쓰지 않는다.** 59건 중 5건만 차 있다.
export function contactOf(r) {
  const c = (r?.contacts || [])[0];
  if (!c || !(c.tel || c.url)) return null;
  return {
    label: COPY.actionDetail.contactTitle,
    org: c.org ?? null,
    tel: c.tel ?? null,
    // `tel:` 링크에 그대로 들어간다. 데이터 계약이 숫자와 하이픈만 허용한다.
    telHref: c.tel ? `tel:${c.tel}` : null,
    url: c.url ?? null,
    note: c.note ?? null,
  };
}

// ── 근거 법령 ──────────────────────────────────────
//
// 그 사람에게 해당하는 안내들이 **무엇을 근거로 서 있는지**를 모아 보여
// 준다. 판정을 다시 하지 않는다 — 엔진이 준 행에서 `sources`를 꺼내
// 묶기만 한다.
//
// **`sources`가 빈 안내는 여기 나오지 않는다.** 빠진 것을 세어 보여 주면
// 그것이 곧 "우리가 못 채운 목록"이 되고 읽는 사람에게는 쓸모가 없다.
// 없는 것은 없다.
//
// 자치구 조례는 맨 위에 따로 선다. **원문 링크를 걸지 않는다** — 지금
// 가진 것은 elis 홈페이지 주소뿐이고, 홈페이지를 '원문 보기'로 걸면
// 정확한 원문을 보여준다는 거짓말이 된다(sourceOf와 같은 규칙).
const SOURCE_GROUPS = ["law", "public_guidance", "case", "academic"];

export function sourcesView(base) {
  // 그 사람에게 해당하는 것만. 제외·조건부·미판정의 근거는 싣지 않는다 —
  // 이 화면은 "내 안내가 무엇에 서 있나"를 보는 자리다.
  const live = [...base.sections, ...base.waiting, ...base.blocked, ...base.done];

  // type → title → article 순으로 접는다. 같은 법의 다른 조문이 한 줄에
  // 섞이면 "무엇을 근거로 하는가"가 안 보인다.
  const byType = new Map();
  for (const r of live) {
    for (const s of r.sources || []) {
      if (!SOURCE_GROUPS.includes(s.type)) continue;
      if (!byType.has(s.type)) byType.set(s.type, new Map());
      const byTitle = byType.get(s.type);
      const key = s.title || "";
      if (!byTitle.has(key)) byTitle.set(key, new Map());
      const byArticle = byTitle.get(key);
      // 조문이 없는 것은 하나의 줄로 모인다(없는 조문을 만들지 않는다).
      const ak = s.article || "";
      if (!byArticle.has(ak)) {
        byArticle.set(ak, {
          article: s.article ?? null,
          url: s.url ?? null,
          publisher: s.publisher ?? null,
          checkedAt: dotDate(s.checked_at),
          year: s.year ?? null,
          actions: [],
        });
      }
      const entry = byArticle.get(ak);
      if (!entry.actions.some((a) => a.id === r.id)) entry.actions.push({ id: r.id, title: r.title });
    }
  }

  const groups = SOURCE_GROUPS.filter((t) => byType.has(t)).map((type) => ({
    key: type,
    label: COPY.sourceList.groups[type],
    items: [...byType.get(type).entries()].map(([title, byArticle]) => ({
      title,
      entries: [...byArticle.values()].map((e) => ({
        ...e,
        link: e.url ? COPY.actionDetail.link : null,
        uses: COPY.sourceList.uses(e.actions.length),
      })),
    })),
  }));

  // 자치구 조례 — 그 구의 조문과 그것을 쓰는 안내.
  const 구 = (base.data?.districts || []).find((d) => d.id === base.state?.district) || null;
  const ordinanceRows = live.filter((r) => r.ordinanceBased && r.ordinanceArticle);
  const ordinance =
    구 && 구.ordinance_name && ordinanceRows.length
      ? {
          label: COPY.sourceList.ordinance,
          title: 구.ordinance_name,
          checkedAt: dotDate(구.checked_at),
          // 같은 조문을 여러 안내가 쓸 수 있다.
          entries: [...new Map(ordinanceRows.map((r) => [r.ordinanceArticle, r])).keys()].map(
            (article) => {
              const rows = ordinanceRows.filter((r) => r.ordinanceArticle === article);
              return {
                article,
                url: null, // elis 홈페이지를 원문으로 걸지 않는다
                link: null,
                actions: rows.map((r) => ({ id: r.id, title: r.title })),
                uses: COPY.sourceList.uses(rows.length),
              };
            }
          ),
        }
      : null;

  const count =
    groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.entries.length, 0), 0) +
    (ordinance ? ordinance.entries.length : 0);

  return {
    title: COPY.sourceList.title,
    desc: COPY.sourceList.desc,
    footer: COPY.sourceList.footer,
    ordinance,
    groups,
    count,
  };
}

// ── 연락처 ─────────────────────────────────────────
//
// `data/directory.json`을 그룹 순서대로 그린다. **목록에 없는 번호를
// 만들지 않는다** — 그 파일에 있는 것은 전부 공식 페이지에서 확인하고
// `verified_at_url`을 남긴 값이다.
//
// 자치구 줄에는 **번호가 없다**(보류). 25개 구의 부서 직통을 확인할 경로가
// 아직 없고 9개 구는 부서명조차 모른다 — 그때는 이름 없이 대표번호 안내만
// 남는다(D-003의 degrade와 같은 규칙).
const DIRECTORY_ORDER = ["긴급", "복지·긴급지원", "법률·분쟁", "심리"];

export function directoryView(base) {
  const list = base.data?.directory || [];
  const groups = DIRECTORY_ORDER.filter((g) => list.some((c) => c.group === g)).map((group) => ({
    group,
    items: list
      .filter((c) => c.group === group)
      .map((c) => ({
        org: c.org,
        tel: c.tel ?? null,
        telHref: c.tel ? `tel:${c.tel}` : null,
        url: c.url ?? null,
        note: c.note ?? null,
      })),
  }));

  // 그 사람 구의 **관할 소방서 화재조사 직통.** 구를 안 골랐으면 줄 자체를
  // 그리지 않는다 — 없는 것은 없다.
  //
  // 옛 구청 부서 줄을 대신한다. 구청 대표번호는 걸면 120으로 연결되어
  // 도달점이 같고, 이 사람이 지금 물어야 하는 것(화재증명원 발급·조사
  // 진행)은 그쪽이 답하지 않는다.
  const 구 = (base.data?.districts || []).find((d) => d.id === base.state?.district) || null;
  const f = 구?.fire_investigation ?? null;
  const district =
    f && f.tel
      ? {
          org: COPY.contacts.fireStation(f.station),
          tel: f.tel,
          telHref: `tel:${f.tel}`,
          url: null,
          note: COPY.contacts.fireStationNote,
        }
      : null;

  return {
    title: COPY.contacts.title,
    desc: COPY.contacts.desc,
    groups,
    district,
    // 번호·링크 없는 문장 하나. 개인이 거는 곳이 아니라는 사실이 정보다.
    relief: COPY.contacts.relief,
    count: groups.reduce((n, g) => n + g.items.length, 0) + (district ? 1 : 0),
  };
}

// ── 아직 확인 못 함 ────────────────────────────────
//
// 질문을 빼먹은 것도 해당 없음도 아니다. 사용자가 `잘 모르겠어요`라고
// 답했고 그 값이 실제 판정 조건에 걸린 상태다. **unknown을 No로 바꾸지
// 않고, 미판정을 `해당 없음`으로 표시하지 않는다.**
//
// 자치구 미선택은 이 화면의 대상이 아니다 — 그쪽은 `needsDistrict`가
// 표시하고 자치구 선택으로 보낸다.
export function undeterminedView(base, id, { questions = [] } = {}) {
  const r = base.byId.get(id);
  if (!r || r.status !== "미판정" || r.needsDistrict) return null;

  const state = base.state || {};
  // 무엇을 확인하면 되는지 — **엔진 reason이 왜를 말하고, 이쪽은 어떤
  // 답을 바꾸면 되는지를 말한다.** 사용자가 `잘 모르겠어요`라고 답한
  // 질문만 고른다(안 물어본 질문으로 보내지 않는다).
  const targets = questions
    .filter((q) => UNDETERMINED_KEYS.includes(q.key) && state[q.key] === "unknown")
    .map((q) => ({ id: q.id, key: q.key, text: q.text }));

  return {
    label: COPY.undetermined.label,
    labelKind: CHIP_KIND["미판정"],
    topic: topicLabel(r.group),
    title: r.title,
    summary: r.summary,
    why: { title: COPY.undetermined.why, line: r.reason },
    how: {
      title: COPY.undetermined.how,
      line: COPY.undetermined.howLine,
      targets,
      // 갈 곳이 없으면 버튼을 그리지 않는다.
      cta: targets.length ? COPY.undetermined.cta : null,
    },
    // 안내 기준 — 그 사람 자치구의 조례다. **원문 링크는 없다**(sourceOf 주석).
    basis: r.ordinanceName
      ? {
          label: COPY.undetermined.basis,
          title: r.ordinanceName,
          article: r.ordinanceArticle,
          checkedAt: dotDate(r.ordinanceCheckedAt),
          url: null,
        }
      : null,
  };
}

// ── 출처 ───────────────────────────────────────────
//
// 읽는 순서: `sources[]` → 조례 → legacy `source_url` → 생략.
//
// **URL이나 본문을 파싱해 법령명·조문을 만들어내지 않는다.** sources가
// 비어 있으면 문서명 없이 '원문 보기'만 걸고, 그것도 없으면 출처 영역을
// 통째로 그리지 않는다. 지금 `sources`는 59건 전부 빈 배열이라 legacy
// 경로가 기본이다 — 채우는 것은 원문을 하나씩 확인하는 콘텐츠 패스다.
export function sourceOf(r) {
  if (!r) return null;
  const item = (o) => ({
    title: o.title ?? null,
    article: o.article ?? null,
    publisher: o.publisher ?? null,
    checkedAt: o.checkedAt ?? null,
    url: o.url ?? null,
    link: o.url ? COPY.actionDetail.link : null,
    meta: o.checkedAt ? COPY.actionDetail.meta(o.publisher ?? null, o.checkedAt) : null,
  });

  if (Array.isArray(r.sources) && r.sources.length) {
    return {
      kind: "sources",
      label: COPY.actionDetail.sourceTitle,
      items: r.sources.map((s) =>
        item({
          title: s.title,
          article: s.article,
          publisher: s.publisher,
          checkedAt: dotDate(s.checked_at),
          url: s.url,
        })
      ),
      // 목록 카드는 첫 항목만 싣는다. 나머지가 몇 건인지는 밝힌다 —
      // **없는 척하지 않는다.** 전량은 Action 상세가 그린다.
      more: r.sources.length > 1 ? COPY.topicDetail.sourceMore(r.sources.length - 1) : null,
    };
  }

  // 조례 항목의 출처는 그 사람 자치구의 조례 원문이다. **원문 URL은 없다** —
  // 지금 가진 것은 elis 홈페이지 주소뿐이고, 홈페이지를 '원문 보기'로 걸면
  // 정확한 원문을 보여준다는 거짓말이 된다.
  if (r.ordinanceBased && r.ordinanceName) {
    return {
      kind: "ordinance",
      label: COPY.actionDetail.sourceTitle,
      items: [
        item({
          title: r.ordinanceName,
          article: r.ordinanceArticle,
          checkedAt: dotDate(r.ordinanceCheckedAt),
          url: null,
        }),
      ],
      more: null,
    };
  }

  if (r.sourceUrl) {
    return {
      kind: "legacy",
      label: COPY.actionDetail.sourceTitle,
      items: [item({ checkedAt: dotDate(r.checkedAt), url: r.sourceUrl })],
      more: null,
    };
  }

  return null;
}
