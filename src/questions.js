// 질문 계층 — 무엇을 물을 것인가
// 조건 평가는 engine의 matches()를 그대로 쓴다. 매처를 두 개 만들면 D-010이 무너진다.

import { matches, deriveState } from "./engine.js";

// ── 자치구 유입 (D-012) ─────────────────────────────
// QR이면 ?d=mapo 가 붙어 온다. 없거나 모르는 값이면 선택 화면으로 보낸다.
// QR 승인이 안 나도 일반 웹으로 그대로 돌아가야 한다.
export function resolveDistrict(source, districts) {
  const raw = readParam(source, "d");
  const district = raw ? districts.find((d) => d.id === raw) || null : null;
  if (district) return { id: district.id, district, needsPicker: false, reason: null };
  return { id: null, district: null, needsPicker: true, reason: raw ? "unknown" : "missing" };
}

export function readParam(source, name) {
  if (!source) return null;
  if (typeof source.get === "function") return source.get(name); // URLSearchParams
  if (source.searchParams) return source.searchParams.get(name); // URL
  const s = String(source);
  const qs = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s;
  return new URLSearchParams(qs).get(name);
}

// ── 지금 물어야 할 질문 ─────────────────────────────
// ask_when은 앞선 답변과 자치구 파생값을 본다. 배열 순서가 곧 질문 순서다.
// now를 받는 이유는 지금이 아니라 다음이다. ask_when이 경과 시간을 읽게 되면
// (D-014 재검토 조건) 여기가 실제 시각으로 새는 자리가 된다. 규약은
// applyDefaults와 같다 — 마지막 인자, 기본값 있음.
export function visibleQuestions(questions, state, data, now = Date.now()) {
  const s = deriveState(state, data, now);
  return questions.filter((q) => matches(q.ask_when, s));
}

// ── 답하지 않은 질문의 기본값 ───────────────────────
// 설문을 끝내지 않아도 화면이 나와야 한다(D-003).
// ask_when으로 숨긴 질문도 채운다 — 그 답을 안 물었을 뿐이지 값이 없는 건 아니다.
// 지역 비교 레이어는 다른 구 기준으로도 판정하므로 여기서 비면 비교가 틀린다.
export function applyDefaults(questions, state, now = new Date()) {
  const out = { ...state };
  for (const q of questions) {
    if (out[q.key] !== undefined) continue;
    if (!("default" in q)) continue;
    out[q.key] = q.default === "today" && q.type === "date" ? new Date(now).toISOString() : q.default;
  }
  return out;
}

// ── 사라진 질문의 답을 지운다 ───────────────────────
//
// 앞 답을 고치면 뒤 질문이 통째로 사라지는 일이 있다. 예: `origin_area`를
// `unknown`으로 바꾸면 `product_suspected`를 더는 묻지 않고, 그러면 그 답에
// 매달린 `product_maker_contacted`도 사라진다. **그때 옛 답이 state에 남아
// 있으면 사용자가 지금 화면에서 볼 수도 고칠 수도 없는 값이 판정에 남는다.**
//
// 그래서 고정점까지 돈다 — 하나를 지우면 또 사라지는 질문이 생길 수 있다.
// 질문이 소유한 키만 건드린다. `district`·`completed`·`completed_at`·
// `intro_seen`처럼 질문이 아닌 키는 대상이 아니다.
//
// **`applyDefaults`와 헷갈리지 마라.** 이쪽은 저장하는 state에서 답을 빼고,
// 그쪽은 판정용 사본에 기본값을 채운다. `product_suspected`는 지워져도
// default `unknown`이 판정에서 다시 채워져 금지가 유지된다(D-013).
export function pruneStale(questions, state, data, now = Date.now()) {
  const owned = new Set(questions.map((q) => q.key));
  let cur = state;
  // 한 번에 최소 하나는 사라지므로 질문 수만큼 돌면 반드시 고정점에 닿는다.
  for (let i = 0; i <= questions.length; i++) {
    const visible = new Set(visibleQuestions(questions, cur, data, now).map((q) => q.key));
    const stale = [...owned].filter((k) => k in cur && !visible.has(k));
    if (!stale.length) return cur;
    const next = { ...cur };
    for (const k of stale) delete next[k];
    cur = next;
  }
  return cur;
}

// ── 아직 답이 없는 키 ───────────────────────────────
// 설문 진행률과 "다음 질문"에 쓴다.
export function unansweredKeys(questions, state, data, now = Date.now()) {
  return visibleQuestions(questions, state, data, now)
    .filter((q) => state[q.key] === undefined)
    .map((q) => q.key);
}
