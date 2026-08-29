// 뷰모델 — 무엇을 그릴지 정한다. **DOM을 모른다.**
//
// 이 파일의 함수는 전부 순수함수이고 node로 테스트한다(test/view.test.mjs).
// 화면 코드(app.js)는 여기서 나온 것을 받아 그리기만 한다. 분리하는 이유는
// 판정이 브라우저 안에 숨으면 계기판이 못 보기 때문이다 — 엔진에서 했던
// 것과 같은 이유다.
//
// 저장소를 직접 만지지 않는다. 세션은 인자로 받는다(D-002).

import { visibleQuestions, unansweredKeys } from "../questions.js";
import { COPY } from "./copy.js";

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

  // notices는 **진입 시점의 사실**이고 화면은 **지금 state**를 본다. 둘이
  // 어긋나면 화면 쪽이 맞다 — 자치구를 고른 뒤에도 "어느 구인지 알려주세요"가
  // 남아 있으면 사용자는 자기가 고른 것이 안 먹혔다고 읽는다.
  for (const n of notices) {
    if (n.type === "district_conflict") {
      // 그 구로 바꾸고 나면 충돌은 지난 일이다.
      if (n.fromUrl === selected) continue;
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
      if (selected) continue; // 이미 골랐다
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

  // 일곱째 — 진입 공지가 아니라 **책임 경계**다(D-006). 주거 형태가
  // "그 외"(상가·고시원·공장)인 사람에게만 이 안내가 어디까지 검증됐는지
  // 말한다. 공통 행동 대부분은 그 사람에게도 유효하지만 상가 특유의 절차는
  // 데이터에 없고, **말하지 않으면 "내 경우도 전부 다뤄진다"가 된다.**
  //
  // 엄격 비교다. 아직 안 답한 사람(undefined)에게 뜨면 그 사람에게는
  // 아무 뜻도 없는 경고가 된다.
  // 배열 **끝**인 것도 의도다 — 자치구 충돌 같은 진입 공지가 먼저다.
  if (session?.state?.housing_type === "other") {
    banners.push({
      type: "scope",
      text: COPY.banner.scope_other,
      sub: null,
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

  // 뒤로가기는 **커서 기준 앞 질문**이다. answered의 마지막으로 보내면
  // 한 번 뒤로 간 뒤부터 같은 자리를 맴돈다.
  const here = q ? visible.findIndex((v) => v.id === q.id) : visible.length;
  const prevQ = here > 0 ? visible[here - 1] : null;

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
    prev: prevQ ? { id: prevQ.id, key: prevQ.key, text: prevQ.text } : null,
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
export function saveNoticeView({
  persisted,
  stage = null,
  url = null,
  token = null,
  canShare = false,
} = {}) {
  // 예외 — 저장이 막힌 브라우저에서는 0층이 아예 없다. 결과 화면까지
  // 기다리지 않고 설문 첫 답변 직후 즉시 띄우고, **"나중에"를 뺀다.**
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
        // ★ "주소를 남겼습니다"가 아니다. **앱은 사용자가 남겼는지 모른다.**
        //   복사나 한 글자씩 보기를 쓴 뒤에만 열린다(gated).
        { id: "go", label: COPY.save.go, gated: true },
      ],
    };
  }

  // 1층 — 결과 화면에 처음 닿았을 때 한 번. 이때 비로소 잃을 것이 생겼고,
  // 사용자도 이 화면이 무엇인지 안다(D-015).
  if (stage === "result_first") {
    return {
      show: true,
      variant: "saved",
      lines: [COPY.save.saveTitle, COPY.save.saveLine],
      url,
      token,
      actions: [
        // OS 공유 시트. 미지원이면 화면이 복사로 폴백한다.
        ...(canShare ? [{ id: "share", label: COPY.save.share }] : []),
        { id: "copy", label: COPY.save.copy },
        { id: "spell", label: COPY.save.spell },
        // "나중에"를 둔다. 없으면 사람은 X를 찾고, 그래도 안 보이면 화면을
        // 닫는다. 대신 2층으로 내려간다(D-015).
        { id: "later", label: COPY.save.later },
      ],
    };
  }

  // 2층은 헤더의 작은 한 줄이라 이 박스를 쓰지 않는다.
  return { show: false, variant: "quiet", lines: [], url, token, actions: [] };
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
