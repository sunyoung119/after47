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
// openSession이 준 notices를 배너로 옮긴다. **판정을 새로 하지 않는다** —
// 여섯째(`no_saved_state`: 남의 재접속 링크로 왔는데 이 기기에 기록이 없는
// 사람)도 세션 계층이 밀어 준다. 여기서 `!saved`로 판정하던 것이 앱에서
// 한 번도 안 참이었던 이유는 아래 주석에 적었다.
// `atEntry` — **답을 걷기 시작하기 전인가.** 진입 알림 중에는 그 앞에서만
// 뜻이 있는 것이 있다(아래 `resumed_on_device`). 화면 이름을 여기서 알 필요는
// 없으므로 판정은 app.js가 하고 여기는 결과만 받는다.
export function entryView(session, { atEntry = true } = {}) {
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
      //
      // ★ **그 길은 진입 화면에서만 필요하다**(사용자 실기기 관찰).
      // 이 배너의 일은 "지금 보는 것이 앞사람 기록일 수 있다"를 들어서는
      // 순간에 알리고 빠져나갈 문을 주는 것이다. 한 걸음 걷고 나면 그 일이
      // 끝났는데도 세션 내내 모든 화면에 따라붙었다 — 설문·전환·결과·상세
      // 전부. 게다가 **답을 다시 걷는 중에는 문장이 거짓이다**: 이어서 보는
      // 것이 아니라 새로 걷는 중이다.
      //
      // 자치구 배너들이 "사실이 지나가면 접는" 것과 같은 규칙이고
      // (이 파일 위 주석), 여기서는 그 사실이 **화면의 위치**다.
      if (!atEntry) continue;
      banners.push({
        type: "resumed_on_device",
        text: COPY.banner.resumed_on_device,
        sub: null,
        actions: [{ id: "restart", value: null, label: COPY.banner.resumed_on_device_action }],
      });
    } else if (n.type === "token_invalid") {
      // 진입 알림과 같은 규칙 — 들어서는 순간에 "이 주소가 잘못됐다"를
      // 말하는 것이 일이고, 걷기 시작한 뒤에는 소음이다.
      if (!atEntry) continue;
      banners.push({
        type: "token_invalid",
        text: COPY.banner.token_invalid,
        sub: COPY.banner.token_invalid_sub,
        actions: [],
      });
    } else if (n.type === "no_saved_state") {
      // 남의 재접속 링크로 왔는데 이 기기에 기록이 없는 사람. **자기
      // 기록을 이어 보는 사람에게는 절대 안 뜬다** — 그 사람에게는
      // 이 문장이 거짓이다(세션 계층이 분기 ③에서만 민다).
      if (!atEntry) continue;
      banners.push({
        type: "no_saved_state",
        text: COPY.banner.no_saved_state,
        sub: COPY.banner.no_saved_state_sub,
        actions: [],
      });
    }
    // expires_at은 배너가 아니라 하단 고지 한 줄이다. 아래에서 따로 뽑는다.
  }

  // **여섯째는 이제 notice로 온다.** 앞서는 여기서 `!saved && !isNew`로
  // 판정했는데 그 조건은 앱에서 한 번도 참이 되지 않았다 — D-015 0층의
  // anchorSession이 진입 직후 저장해 `saved`를 채우기 때문이다(실측:
  // anchor 전 `no_saved_state` 있음 → anchor 후 없음). 그래서 판정을
  // **세션 계층으로 올렸고**, 그쪽은 저장 이전의 사실을 안다.

  // 일곱째였던 **책임 경계 배너는 사라졌다**(확정 UX). 건물 종류가
  // "그 외"인 사람에게 말해야 하는 것은 그대로지만, 배너 한 줄이 아니라
  // 확정 화면 `안내 범위`(04A)가 그 자리를 맡는다 — 세 문장으로 무엇이
  // 검증됐고 무엇이 범위 밖인지 말하고, 계속할지 건물 종류를 다시 고를지
  // 묻는다. 판단은 entry.js의 scopeNoticeView에 있다.

  const expiresNotice = notices.find((n) => n.type === "expires_at");

  // **자치구 선택 자리(picker)는 사라졌다.** 지역은 확정 화면 `기본 확인`의
  // 필드가 되었고 선택지는 basicCheckView가 만든다. 여기 남는 것은 진입
  // 알림과 보관 기간 고지다.
  return {
    district: selected ? { id: selected, name: nameOf(selected) } : null,
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
      // **한 줄이다.** 제목을 없앴다(사용자 실기기 검수 결정) —
      // 큰 제목 + 긴 설명 + 버튼 넷이 결과 화면에서 경고처럼 읽혔다.
      lines: [COPY.save.saveLine],
      url,
      token,
      actions: [
        // OS 공유 시트. 미지원이면 화면이 복사로 폴백한다.
        ...(canShare ? [{ id: "share", label: COPY.save.share }] : []),
        { id: "copy", label: COPY.save.copy },
        // ★ `한 글자씩 보기`와 `나중에`를 뺐다. 전자는 저장이 막힌
        //   브라우저(blocked)의 도구이고, 후자는 없어도 갇히지 않는다 —
        //   HOME을 떠나면 이 블록은 사라진다.
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
