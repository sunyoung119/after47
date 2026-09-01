// 진입 흐름 뷰모델 — 랜딩 · 기본 확인 · 질문 MASTER · 안내 범위 ·
// 질문 종료 전환 · 재방문 경과시간 게이트. **DOM을 모른다.**
//
//   첫 방문:  랜딩 → 기본 확인 → 질문(MASTER) → 전환 → 내 회복 경로
//   재방문:   경과시간 게이트 → 내 회복 경로
//
// 판단이 브라우저 안에 숨으면 계기판이 못 본다 — 엔진에서 했던 것과 같은
// 이유다. 화면 코드는 여기서 나온 것을 받아 그리기만 한다.

import { COPY } from "./copy.js";
import { surveyView, formatDate } from "./view.js";
import { elapsedParts, elapsedText, isoDay, splitEmphasis } from "./format.js";

// 선택지를 탭한 뒤 다음 질문으로 넘어가기까지의 시간. 확정 범위는
// 150–250ms다 — **탭이 먹혔다는 감각**을 주기 위한 것이고, 그 이상 끌면
// 정신없는 사람에게는 멈춘 화면이 된다. 별도 [다음] 버튼은 없다.
export const SELECT_FEEDBACK_MS = 200;

// 기본 확인 화면이 가진 질문의 키. 설문 목록에서는 뺀다.
export const BASIC_KEYS = ["fire_at"];

// ── 랜딩 (첫 방문만) ───────────────────────────────
//
// 기능 목록을 늘어놓는 홈이 아니라 서비스의 **문**이다.
//
// **배경은 확정 사진이다.** 화재 사진이 아니라 불이 꺼진 뒤의 하늘이고,
// negative space를 충분히 남기는 것이 시안의 요구다. 글자 리빌 연출은
// 폐기됐다 — 사진이 그 자리를 대신한다.
//
// 플래그는 **state에 넣어 saveState로 저장한다** — localStorage 직접
// 호출 금지는 UI에서도 그대로다(누수 탐지가 잡는다).
export function landingView(state = {}, { saved = null, again = false } = {}) {
  return {
    show: state.intro_seen !== true,
    // ★ **[처음으로]로 온 랜딩에서만 선다**(역할 축소 · 사용자 결정).
    //
    // 앞서는 저장 기록만 보고 그렸는데, 그 조건이 노린 자리 — 재방문자의
    // 첫 화면 — 에는 **랜딩이 아예 뜨지 않는다.** `route()`가 저장 기록이
    // 있는 사람을 곧장 재방문 브릿지로 보내기 때문이다. 그래서 그 이름의
    // 지름길은 한 번도 보이지 않았고, 보이는 유일한 자리가 여기였다.
    //
    // 조건에 `again`을 더한 것은 안전장치이기도 하다. 이번 방문에서
    // 브릿지를 지나지 않은 사람(플래그가 없는 옛 기록)이 이 문으로 들어오면
    // **새로 생긴 질문을 건너뛴다** — 화재 7일이 지나 조사서 수령을 묻는
    // 사람이 정확히 그 경우다.
    resume: again && revisitView({ state, saved }).show ? COPY.landing.resume : null,
    eyebrow: COPY.landing.eyebrow,
    brand: COPY.landing.brand,
    // 두 줄이다. 화면 코드가 줄바꿈을 만들지 않도록 여기서 나눠 준다.
    lead: COPY.landing.lead.split("\n"),
    cta: COPY.landing.cta,
    footer: COPY.landing.footer,
  };
}

// ── 기본 확인 (화재 발생일 + 지역) ─────────────────
//
// QR로 값이 미리 들어와도 **두 필드 다 확인·수정할 수 있어야 한다.**
// 지역 선택지는 25개 전수이고 **조례 유무를 표시하지 않는다** — 선택은
// "내가 사는 곳"을 고르는 사실 확인이지 구 비교가 아니고, 조례 없는 구에
// 낙인을 찍는 표시가 된다.
//
// 날짜는 오늘로 채워 둔다. 기본 진입점이 **화재 당일**이라 대부분은
// 그대로 넘어가고, 아닌 사람은 고치면 된다. 채운 값과 사용자가 실제로
// 확인한 값은 `answered`로 갈린다 — 안 물어본 것을 답한 것으로 세지 않는다.
// 하루의 24시간. 화면이 매번 만들지 않도록 한 번만 편다.
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: COPY.basic.hour(h) }));

// 날짜(YYYY-MM-DD)와 **고른 시**로 fire_at을 만든다.
//
// 시각을 안 골랐으면 그 날의 **정오**로 둔다 — 자정이면 하루가 통째로 더
// 지난 것처럼 계산된다. 정오는 그 하루의 가운데라 어느 쪽으로도 반나절만
// 틀린다. **시각을 받았으면 그 값이 우선이고, 근사는 쓰지 않는다.**
export function fireAtOf(day, hour = null) {
  if (!day) return null;
  const hh = Number.isInteger(hour) ? String(hour).padStart(2, "0") : "12";
  return new Date(`${day}T${hh}:00:00`).toISOString();
}

export function basicCheckView({ state = {}, data = {}, now = Date.now() } = {}) {
  const districts = data.districts || [];
  const selected = state.district || null;
  const 구 = districts.find((d) => d.id === selected) || null;
  const value = state.fire_at ?? new Date(now).toISOString();

  return {
    label: COPY.basic.label,
    title: COPY.basic.title,
    help: COPY.basic.help,
    // `경과 시간`과 `지역`만 굵다. 화면은 조각을 받아 그리기만 한다.
    helpParts: splitEmphasis(COPY.basic.help, COPY.basic.helpEmphasis),
    date: {
      label: COPY.basic.date,
      value,
      inputValue: isoDay(value),
      text: formatDate(value),
      answered: state.fire_at !== undefined,
    },
    // 시각은 선택이다. **비워 둔 채로도 [다음]을 누를 수 있다.**
    time: {
      label: COPY.basic.time,
      help: COPY.basic.timeHelp,
      empty: COPY.basic.timeEmpty,
      // ★ **사용자가 고른 것만 선택 상태다.** 근사로 채워진 시각을 고른
      //   것처럼 보여주면 "채운 값"이 "확인한 값"으로 읽힌다 — 날짜의
      //   `answered`와 같은 규칙이고, 재방문·QR 진입이 그 자리다.
      value: Number.isInteger(state.fire_hour) ? state.fire_hour : null,
      answered: state.fire_hour !== undefined,
      options: HOURS,
    },
    district: {
      label: COPY.basic.district,
      id: selected,
      name: 구?.name ?? null,
      empty: COPY.basic.districtEmpty,
      options: districts
        .map((d) => ({ id: d.id, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    },
    cta: COPY.basic.cta,
    // 지역을 안 골랐으면 넘어갈 수 없다. 날짜는 채워져 있으므로 항상 참이다.
    ready: Boolean(selected),
  };
}

// ── 질문 MASTER 문법 ───────────────────────────────
//
// 모든 질문 화면이 같은 문법을 쓴다. 판정은 surveyView가 하고 여기서는
// 화면의 겉(브랜드·이전·소라벨·하단 한 줄)을 얹는다.
//
// ★ **분모를 내보내지 않는다.** surveyView가 `remaining`만 주는 이유와
//   같다 — 조건에 따라 질문 수가 변해서 `3/18`이 거짓말이 된다. 이 화면은
//   `remaining`도 쓰지 않는다(확정 규칙: 숫자형 전체 진행률 없음).
export function masterView({ questions = [], state, data, now = Date.now(), cursor = null } = {}) {
  // 화재 발생일은 기본 확인 화면이 가진 질문이라 설문 목록에서 뺀다.
  // 안 빼면 첫 질문의 [이전]이 방금 지나온 기본 확인의 날짜 질문을
  // 설문 문법으로 다시 그린다 — 같은 것을 두 화면이 묻게 된다.
  const sv = surveyView({ questions: questions.filter((q) => !BASIC_KEYS.includes(q.key)), state, data, now, cursor });
  return {
    brand: COPY.brand,
    back: sv.prev ? { label: COPY.master.back, id: sv.prev.id, key: sv.prev.key } : null,
    // 첫 질문이다 — [이전]은 설문 안이 아니라 기본 확인으로 간다.
    atStart: !sv.prev,
    eyebrow: COPY.master.eyebrow,
    current: sv.current,
    footer: COPY.master.footer,
    // 남은 질문이 없으면 전환 화면으로 간다.
    done: sv.done,
    // D-003 — 설문을 끝내지 않아도 결과가 나온다.
    canPeek: sv.canPeek,
  };
}

// ── 안내 범위 (건물 종류 = 그 외) ──────────────────
//
// **콘텐츠를 늘리는 대신 경계를 밝힌다**(D-006). 공통 행동은 상가·고시원
// 사용자에게도 유효하지만 사업장 특유의 절차는 이 서비스의 데이터에 없다.
// 침묵하면 "내 경우도 전부 다뤄진다"로 읽힌다.
//
// 6단계의 경계 배너를 이 화면이 대체한다. 확인 여부는 state 필드
// `scope_ack`에 남는다 — 매번 다시 세우면 재방문마다 같은 벽을 만난다.
export function scopeNoticeView(state = {}) {
  return {
    // 엄격 비교다. 아직 안 답한 사람(undefined)에게 뜨면 아무 뜻도 없는 벽이 된다.
    show: state.housing_type === "other" && state.scope_ack !== true,
    label: COPY.scopeNotice.label,
    // 큰 제목이 없는 화면이다. 세 문장이 본문 전부다.
    lines: COPY.scopeNotice.lines,
    primary: COPY.scopeNotice.primary,
    secondary: COPY.scopeNotice.secondary,
  };
}

// ── 질문 종료 전환 ─────────────────────────────────
//
// **'AI 분석 중'·'결과 생성 중'류 표현 금지.** 기술 시스템이 주인공인
// 말은 지금 이 사람에게 아무 의미가 없다.
// 기준 줄은 **그 사람의 실제 값으로 조립한다.** 값이 없는 조각은 빠진다
// (자치구를 못 고른 경우). 화면 코드는 이 배열을 **세로로** 나열한다 —
// 가운뎃점 한 줄이었던 것을 목록으로 바꿨다(사용자 실기기 검수 결정).
export function transitionView({ state = {}, data = {}, now = Date.now() } = {}) {
  const 구 = (data.districts || []).find((d) => d.id === state.district) || null;
  const elapsed = elapsedText(state.fire_at ?? null, now);
  return {
    title: COPY.transition.title,
    basis: [
      구?.name ?? null,
      elapsed ? COPY.transition.elapsedLabel(elapsed) : null,
      COPY.transition.situation,
    ].filter(Boolean),
    message: COPY.transition.message,
    cta: COPY.transition.cta,
  };
}

// ── 재방문 경과시간 게이트 ─────────────────────────
//
// **모든 재방문이 항상 거친다.** 방문 횟수로 건너뛰지 않는다 — 같은 답이어도
// 화재 당일과 90일 뒤의 화면이 다르고, 그 차이가 이 서비스의 본체다.
//
// 현재 시각 시계가 아니다. 아날로그 시계도, 위협적인 카운트다운도 아니다.
// `3일째` 같은 중복 표기도 하지 않는다 — 숫자는 한 번만 말한다.
export function revisitView({ state = {}, saved = null, now = Date.now() } = {}) {
  const fireAt = state.fire_at ?? null;
  return {
    // 저장된 기록이 있고 기본 확인을 지난 사람이 재방문이다.
    show: Boolean(saved) && fireAt != null,
    brand: COPY.brand,
    dateLabel: COPY.revisit.dateLabel,
    date: fireAt ? formatDate(fireAt) : null,
    elapsedLabel: COPY.revisit.elapsedLabel,
    elapsed: elapsedItems(fireAt, now),
    // 숫자 뒤에 작게 붙는 한 글자. 날짜와 경과가 같은 크기로 나란히 서고
    // 이것만 작아서, 둘이 같은 층의 정보라는 것이 크기로 읽힌다.
    elapsedSuffix: COPY.revisit.elapsedSuffix,
    lines: COPY.revisit.lines,
    cta: COPY.revisit.cta,
    // 우상단. **랜딩으로 갈 뿐 아무것도 지우지 않는다.**
    home: COPY.revisit.home,
  };
}

// 게이트의 디지털 경과시간. `1일 03시간 30분` — 일은 그대로, 시·분은
// 두 자리로 채운다. HOME 칩(`01일 03:00`)과 형식이 다른 것이 확정이다.
export function elapsedItems(fireAt, now = Date.now()) {
  const p = elapsedParts(fireAt, now);
  if (!p) return [];
  const u = COPY.revisit.units;
  return [
    { num: String(p.days), unit: u.days },
    { num: String(p.hours).padStart(2, "0"), unit: u.hours },
    { num: String(p.minutes).padStart(2, "0"), unit: u.minutes },
  ];
}
