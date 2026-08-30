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
import { formatDate } from "./view.js";
import { dotDate, clockTime, shortDate, elapsedText } from "./format.js";

// HOME에서 갈 수 있는 다섯 화면.
export const RESULT_PAGES = ["priority", "checklist", "reference", "timeline", "topics"];

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
export function resultBase({ result, state = {}, data = {}, now = Date.now() } = {}) {
  const rows = buildRows({ result, state, data });
  return { ...rows, now, fireAt: state.fire_at ?? null };
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
  // 기준 줄 — **그 사람의 자치구와 화재로부터의 거리다.** 확정 화면이
  // 경과시간 칩을 걷고 이 문장으로 바꿨다. 숫자를 따로 띄우면 그것이
  // 화면의 주인공이 되는데, HOME에서 주인공은 다음에 볼 카드 셋이다.
  const 구 = (base.data?.districts || []).find((d) => d.id === base.state?.district) || null;
  return {
    title: COPY.home.title,
    basis: COPY.home.basis(구?.name ?? null, elapsedText(base.fireAt, base.now)),
    lead: COPY.home.lead,
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
  const live = base.sections
    .filter((r) => r.guidanceType === "action" && CHECK_SECTIONS.includes(r.section))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const items = [...live, ...base.blocked].map(checkItem);
  const done = base.done.map((r) => ({
    ...r,
    statusLabel: STATUS_LABEL["완료"],
    statusKind: CHIP_KIND["완료"],
    // 기록이 없다고 완료가 아닌 것은 아니다.
    doneOn: r.completedAt ? formatDate(r.completedAt) : null,
  }));
  return {
    title: COPY.checklist.title,
    desc: COPY.checklist.desc,
    items,
    done: { count: done.length, items: done },
    footer: COPY.checklist.footer,
    count: items.length,
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
    footer: COPY.actionDetail.footer,
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
