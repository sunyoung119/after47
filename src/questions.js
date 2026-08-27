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

// ── 아직 답이 없는 키 ───────────────────────────────
// 설문 진행률과 "다음 질문"에 쓴다.
export function unansweredKeys(questions, state, data, now = Date.now()) {
  return visibleQuestions(questions, state, data, now)
    .filter((q) => state[q.key] === undefined)
    .map((q) => q.key);
}
