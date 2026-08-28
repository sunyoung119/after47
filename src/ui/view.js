// 뷰모델 — 무엇을 그릴지 정한다. **DOM을 모른다.**
//
// 이 파일의 함수는 전부 순수함수이고 node로 테스트한다(test/view.test.mjs).
// 화면 코드(app.js)는 여기서 나온 것을 받아 그리기만 한다. 분리하는 이유는
// 판정이 브라우저 안에 숨으면 계기판이 못 보기 때문이다 — 엔진에서 했던
// 것과 같은 이유다.
//
// 저장소를 직접 만지지 않는다. 세션은 인자로 받는다(D-002).

import { visibleQuestions, unansweredKeys } from "../questions.js";
import { COPY, BUCKET_LABEL, SECTION_LABEL } from "./copy.js";

// ── 진입 ───────────────────────────────────────────
//
// openSession이 준 notices 다섯 종을 배너로 옮기고, **notice가 없는 여섯째**를
// 여기서 판정한다 — 토큰은 유효한데 이 기기에 저장이 없는 경우다. 세션 계층은
// 그것을 알림으로 만들지 않는다(정상 진입과 구분되지 않으므로). 카톡으로 받은
// 링크를 다른 기기에서 연 사람이 여기 오고, 그 사람은 자기 기록이 안 보이는
// 이유를 들어야 한다.
export function entryView(session) {
  const districts = session?.data?.districts || [];
  const notices = session?.notices || [];
  const byId = (id) => districts.find((d) => d.id === id) || null;
  const nameOf = (id) => byId(id)?.name || id;

  const selected = session?.state?.district || null;
  const banners = [];

  for (const n of notices) {
    if (n.type === "district_conflict") {
      banners.push({
        type: "district_conflict",
        text: COPY.banner.district_conflict(nameOf(n.fromUrl), nameOf(n.saved)),
        sub: null,
        actions: [
          {
            id: "switch_district",
            value: n.fromUrl,
            label: COPY.banner.district_conflict_action(nameOf(n.fromUrl)),
          },
        ],
      });
    } else if (n.type === "district_needed") {
      banners.push({
        type: "district_needed",
        text:
          n.reason === "unknown"
            ? COPY.banner.district_needed_unknown
            : COPY.banner.district_needed_missing,
        sub: null,
        actions: [],
      });
    } else if (n.type === "resumed_on_device") {
      // 체험장에서 한 기기를 여러 사람이 쓴다. 빠져나갈 길이 반드시 있어야 한다.
      banners.push({
        type: "resumed_on_device",
        text: COPY.banner.resumed_on_device,
        sub: null,
        actions: [{ id: "restart", value: null, label: COPY.banner.resumed_on_device_action }],
      });
    } else if (n.type === "token_invalid") {
      banners.push({
        type: "token_invalid",
        text: COPY.banner.token_invalid,
        sub: COPY.banner.token_invalid_sub,
        actions: [],
      });
    }
    // expires_at은 배너가 아니라 하단 고지 한 줄이다. 아래에서 따로 뽑는다.
  }

  // 여섯째 — notice가 없다. `saved`가 비었는데 이 세션이 새로 발급된 것도
  // 아니면, 주소는 멀쩡한데 이 기기에 기록이 없는 것이다.
  if (!session?.saved && !session?.isNew) {
    banners.push({
      type: "no_saved_state",
      text: COPY.banner.no_saved_state,
      sub: COPY.banner.no_saved_state_sub,
      actions: [],
    });
  }

  const needed = !selected;
  const expiresNotice = notices.find((n) => n.type === "expires_at");

  return {
    district: selected ? { id: selected, name: nameOf(selected) } : null,
    picker: {
      needed,
      reason: needed ? notices.find((n) => n.type === "district_needed")?.reason ?? null : null,
      // 25개 전부 고를 수 있다. **조례 유무를 표시하지 않는다** — 선택은
      // "내가 사는 곳"을 고르는 사실 확인이지 구 비교가 아니고, 조례 없는
      // 구에 낙인을 찍는 표시가 된다. 차이는 결과 화면의 fallback 안내로
      // 자연히 드러난다.
      options: districts
        .map((d) => ({ id: d.id, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      selected,
    },
    banners,
    expires: expiresNotice
      ? { at: expiresNotice.at, text: COPY.expires(formatDate(expiresNotice.at)) }
      : null,
  };
}

// ── 설문 ───────────────────────────────────────────
//
// ★ 총 질문 수(분모)를 반환하지 않는다. 질문 수가 답에 따라 변하므로
//   "3/17"이 거짓말이 된다. 남은 수만 준다.
//
// 현재 질문은 인덱스가 아니라 **커서(질문 id)**다. 답을 바꾸면 뒤 질문이
// 사라지거나 생기므로(ask_when) 인덱스로 짜면 어긋난다.
export function surveyView({ questions, state, data, now = Date.now(), cursor = null } = {}) {
  const visible = visibleQuestions(questions, state, data, now);
  const remaining = unansweredKeys(questions, state, data, now).length;

  const answered = visible
    .filter((q) => state[q.key] !== undefined)
    .map((q) => ({
      id: q.id,
      key: q.key,
      text: q.text,
      answerLabel: labelOf(q, state[q.key]),
    }));

  // 커서가 가리키는 질문이 아직 보이면 그것, 아니면 첫 미답변.
  // 답을 바꿔서 커서의 질문이 목록에서 빠지는 일이 실제로 일어난다.
  const atCursor = cursor ? visible.find((q) => q.id === cursor) : null;
  const firstUnanswered = visible.find((q) => state[q.key] === undefined) || null;
  const q = atCursor || firstUnanswered;

  return {
    current: q
      ? {
          id: q.id,
          key: q.key,
          text: q.text,
          type: q.type,
          help: q.help ?? null,
          options: q.options ?? null,
          answer: state[q.key] === undefined ? null : state[q.key],
        }
      : null,
    answered,
    remaining,
    done: remaining === 0,
    // D-003 — 설문을 끝내지 않아도 화면이 나온다. 언제든 넘어갈 수 있다.
    canPeek: true,
  };
}

// ── D-015 저장 안내 ────────────────────────────────
//
// 이번 단계가 실제로 쓰는 것은 **예외 경로 하나**다(저장이 막힌 브라우저).
// 1층(결과 화면에서 한 번)과 2층(그 뒤로 작게 상시)은 UI-A②의 일이라
// 여기서는 show:false로 닫아 둔다 — 분기 자리만 만들어 둔다.
export function saveNoticeView({ persisted, stage = null, url = null, token = null } = {}) {
  // 저장이 막힌 브라우저에서는 0층이 아예 없다. 결과 화면까지 기다리지 않고
  // 설문 첫 답변 직후 즉시 띄우고, **"나중에"를 뺀다.**
  if (persisted === false) {
    return {
      show: true,
      variant: "blocked",
      lines: [COPY.save.blockedTitle, COPY.save.blockedLine],
      url,
      token,
      actions: [
        { id: "copy", label: COPY.save.copy },
        { id: "spell", label: COPY.save.spell },
        { id: "ack", label: COPY.save.ack },
      ],
    };
  }
  // 저장이 되는 경우의 1층은 UI-A②다. 여기서 미리 띄우면 그 단계의 설계를
  // 먼저 굳혀 버린다.
  return { show: false, variant: "saved", lines: [], url, token, actions: [] };
}

// ── 결과 자리표시자 ────────────────────────────────
//
// 꾸미지 않는다. 엔진 출력을 날것으로 보는 자리다. 타임라인·갈림길
// 시각화는 UI-A②의 일이고, 여기서 미리 그리면 그 단계가 아니게 된다.
//
// **자르는 것은 UI다**(D-019 §2) — 엔진은 rank만 주고 자르지 않는다.
// 여기서 rank <= 5를 뽑는다. rank를 다시 계산하지는 않는다.
export function resultPlaceholderView(result, district = null) {
  const rows = [];
  for (const s of result.sections || []) {
    for (const g of s.groups || []) for (const it of g.items || []) rows.push({ ...it, section: s.key });
  }

  const top = rows
    .filter((r) => typeof r.rank === "number" && r.rank <= 5)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      id: r.action.id,
      title: r.action.title,
      rank: r.rank,
      when: r.when,
      locked: r.locked === true,
    }));

  const standingCount = (result.sections || []).find((s) => s.key === "standing")?.count ?? 0;

  return {
    basis: district ? COPY.result.basis(district.name) : COPY.result.noDistrict,
    hasDistrict: Boolean(district),
    buckets: ["done", "waiting", "blocked", "excluded"].map((k) => ({
      key: k,
      label: BUCKET_LABEL[k],
      count: (result[k] || []).length,
    })),
    sections: (result.sections || []).map((s) => ({
      key: s.key,
      label: SECTION_LABEL[s.key] || s.label || s.key,
      count: s.count,
      unlocked: s.unlocked,
    })),
    top,
    standingCount,
    undeterminedCount: (result.excluded || []).filter((x) => x.status === "미판정").length,
  };
}

// ── 부수 ───────────────────────────────────────────

function labelOf(q, value) {
  if (q.options) {
    const hit = q.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  if (q.type === "date" && value) return formatDate(value);
  return String(value);
}

// "2026년 11월 26일". 저장소도 로케일도 안 건드린다 — 브라우저마다
// toLocaleDateString 결과가 달라 테스트가 흔들린다.
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return String(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
