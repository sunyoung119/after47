// 진입 해석 — 주소를 읽어서 "누구의 어떤 상태인가"를 정한다.
//
// 저장 계층(storage.js)은 건드리지 않는다. 여기서 하는 일은 세 함수를
// 부르는 순서와 충돌 규칙뿐이다. 그래서 서버로 옮겨도 이 파일은 그대로다.

import { readParam, resolveDistrict } from "./questions.js";
import { loadState, saveState, loadData, lastToken, newToken, isValidToken } from "./storage.js";

const DEFAULT_BASE = "https://after47.kr/";

// 카톡에 붙이고 전화로 불러줄 주소. ?d=mapo&t=ab3k9m
export function shareUrl(token, district, base = DEFAULT_BASE) {
  const p = new URLSearchParams();
  if (district) p.set("d", district);
  if (token) p.set("t", token);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

// 주소 한 줄로 읽어주기 좋게 끊는다. "ab3k9m" → "a b 3 k 9 m"
export function spellToken(token) {
  return String(token || "").split("").join(" ");
}

// ── 진입 ───────────────────────────────────────────
//
// 토큰 결정 순서
//   1. ?t= 가 유효하면 그것
//   2. 없으면 이 기기의 마지막 토큰 (주소를 잃은 사람의 구명줄)
//   3. 그것도 없으면 새로 발급
//
// 자치구 결정 규칙
//   저장된 값이 이긴다. ?d= 는 최초 진입 힌트일 뿐이고
//   사용자가 나중에 앱 안에서 바꿨을 수 있다.
//   다만 다르면 조용히 무시하지 않고 notices로 알린다 — 조사관에게 받은
//   QR을 다시 찍었는데 다른 구가 보이면 그것도 혼란이다.
export async function openSession({
  url = globalThis.location?.href ?? null,
  resume = true,
  now = new Date(),
} = {}) {
  const data = await loadData();
  const fromUrl = resolveDistrict(url, data.districts);
  const urlToken = readParam(url, "t");
  const notices = [];

  let token = isValidToken(urlToken) ? urlToken : null;
  if (urlToken && !token) notices.push({ type: "token_invalid", value: String(urlToken).slice(0, 16) });

  let resumed = false;
  if (!token && resume) {
    const last = await lastToken();
    if (last) {
      token = last;
      resumed = true;
    }
  }

  const minted = !token;
  if (!token) token = newToken();

  const saved = await loadState(token, { now });
  const state = saved ? { ...saved.state } : {};

  // ?d= 와 저장값이 충돌하면 저장값이 이긴다.
  if (state.district) {
    if (fromUrl.id && fromUrl.id !== state.district) {
      notices.push({ type: "district_conflict", fromUrl: fromUrl.id, saved: state.district });
    }
  } else if (fromUrl.id) {
    state.district = fromUrl.id; // 저장값이 없을 때만 힌트를 쓴다
  }

  if (!state.district) notices.push({ type: "district_needed", reason: fromUrl.reason });
  if (resumed) notices.push({ type: "resumed_on_device", token });
  if (saved) notices.push({ type: "expires_at", at: saved.expires_at });

  return {
    token,
    state,
    data,
    saved,
    isNew: minted && !saved,
    resumed,
    url: shareUrl(token, state.district),
    notices,
  };
}

// 진입 직후 한 번 저장해 토큰을 이 기기에 붙인다.
// 이걸 안 하면 주소를 잃었을 때 lastToken이 비어 있어 구명줄이 없다.
export async function anchorSession(session, { now = new Date() } = {}) {
  const r = await saveState(session.token, session.state, { now });
  return { ...session, saved: r, persisted: r.persisted, url: shareUrl(session.token, session.state.district) };
}
