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
//   1. ?t= 가 유효하고 **이 기기에 그 토큰의 저장이 실재하면** 그것
//   2. 아니면 이 기기의 마지막 토큰 (주소를 잃은 사람의 구명줄)
//   3. 그것도 없으면 새로 발급
//
// ★ **1번의 "저장이 실재하면"이 핵심이다.** 주소창은 늘
// `?d=<자치구>&t=<토큰>`으로 덮여 있어서(개인 재접속 링크) 그 주소가 남에게
// 건너가기 쉽다. 유효성만 보고 채택하면 **처음 온 사람이 인트로도 랜딩도
// 없이, 남의 자치구가 선택된 채로 흐름 안쪽에 떨어진다.** 게다가 진입 직후
// 저장(D-015 0층)이 남의 토큰 아래에서 시작된다.
//
// 저장이 없으면 그 토큰은 **이 기기의 것이 아니다.** 기각하고 2번으로 간다.
//
// 자치구 결정 규칙
//   저장된 값이 이긴다. ?d= 는 최초 진입 힌트일 뿐이고
//   사용자가 나중에 앱 안에서 바꿨을 수 있다.
//   다만 다르면 조용히 무시하지 않고 notices로 알린다 — 조사관에게 받은
//   QR을 다시 찍었는데 다른 구가 보이면 그것도 혼란이다.
//
//   ★ **t를 기각했으면 같은 주소의 d도 함께 버린다.** t가 딸린 주소는 개인
//   재접속 링크이고 그 d는 그 사람의 것이다 — 남의 구를 힌트로 쓰면 안 된다.
//   **t 없이 d만 있는 주소(구별 QR·데모 `?d=mapo`)는 그대로 프리필한다.**
//   이 구분이 깨지면 조사관이 나눠 주는 QR이 죽는다.
export async function openSession({
  url = globalThis.location?.href ?? null,
  resume = true,
  now = new Date(),
} = {}) {
  const data = await loadData();
  const fromUrl = resolveDistrict(url, data.districts);
  const urlToken = readParam(url, "t");
  const notices = [];

  const urlOk = isValidToken(urlToken);
  if (urlToken && !urlOk) notices.push({ type: "token_invalid", value: String(urlToken).slice(0, 16) });

  let token = null;
  let saved = null;
  let resumed = false;
  // 주소의 t를 **기각했나.** 기각했으면 같은 주소의 d도 함께 버린다.
  let strangerLink = false;

  // ① 주소의 토큰 — **이 기기에 그 저장이 실재할 때만.**
  if (urlOk) {
    const s = await loadState(urlToken, { now });
    if (s) {
      token = urlToken;
      saved = s;
    } else {
      strangerLink = true;
    }
  }
  // ② 이 기기의 마지막 토큰. **내 기록이 남의 주소 조각보다 먼저다.**
  if (!token && resume) {
    const last = await lastToken();
    if (last) {
      token = last;
      resumed = true;
      saved = await loadState(last, { now });
    }
  }
  // ③ 둘 다 없으면 새로 발급 — 완전한 첫 방문이고 인트로부터 걷는다.
  const minted = !token;
  if (!token) token = newToken();

  const state = saved ? { ...saved.state } : {};

  // 남의 재접속 링크에서 온 d는 힌트로 쓰지 않는다(위 주석).
  const hint = strangerLink ? null : fromUrl.id;

  // ?d= 와 저장값이 충돌하면 저장값이 이긴다.
  if (state.district) {
    if (hint && hint !== state.district) {
      notices.push({ type: "district_conflict", fromUrl: hint, saved: state.district });
    }
  } else if (hint) {
    state.district = hint; // 저장값이 없을 때만 힌트를 쓴다
  }

  if (!state.district) notices.push({ type: "district_needed", reason: strangerLink ? "missing" : fromUrl.reason });
  if (resumed) notices.push({ type: "resumed_on_device", token });
  // 남의 주소로 왔는데 이 기기에 기록도 없다 — **왜 아무것도 안 보이는지**를
  // 이 사람만 들어야 한다. 조건(`!saved && !isNew`)으로는 잡을 수 없다:
  // 여기서 isNew가 true이고, 무엇보다 D-015 0층이 진입 직후 저장해
  // `saved`를 채운다. 그래서 분기에서 직접 민다.
  if (minted && strangerLink) notices.push({ type: "no_saved_state" });
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
