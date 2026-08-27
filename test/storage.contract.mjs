// 저장 계층 계약 (D-002)
//
// 여기 있는 것은 "백엔드가 무엇이든 이렇게 동작해야 한다"이다.
// 같은 파일을 메모리·localStorage·서버 흉내 백엔드에 그대로 돌린다.
// 셋이 같은 결과를 내지 못하면 "안쪽만 바꾸면 된다"는 말은 증명되지 않은 것이다.
//
// 새 백엔드(진짜 서버 어댑터 포함)를 만들면 이 파일을 통과시키는 것이 조건이다.

import {
  configureStorage,
  loadState,
  saveState,
  loadData,
  lastToken,
  forgetState,
  sweepExpired,
  RETENTION_DAYS,
} from "../src/storage.js";

const DAY = 864e5;
const T0 = new Date("2026-08-26T12:00:00.000Z");

export async function runContract({ name, makeBackend, t }) {
  const label = (s) => `[${name}] ${s}`;
  const backend = makeBackend();
  configureStorage(backend);

  const A = "ab3k9m";
  const B = "xy7fq2pt";

  // ── 1. 없는 것 ───────────────────────────────────
  t(label("없는 토큰은 null"), (await loadState(A)) === null);

  // ── 2. 왕복 ──────────────────────────────────────
  const state = {
    district: "mapo",
    tenure: "renter",
    product_suspected: "unknown",
    completed: ["photo-before-cleanup", "scene-release"],
    water_damage_role: "both",
  };
  const saved = await saveState(A, state, { now: T0 });
  t(label("저장에 성공한다"), saved.persisted === true, saved.reason);

  const back = await loadState(A, { now: T0 });
  t(label("저장한 그대로 돌아온다"), JSON.stringify(back?.state) === JSON.stringify(state));
  t(label("배열이 배열로 돌아온다"), Array.isArray(back?.state.completed) && back.state.completed.length === 2);
  t(label("토큰이 함께 돌아온다"), back?.token === A);

  // ── 3. 격리 ──────────────────────────────────────
  await saveState(B, { district: "gangnam" }, { now: T0 });
  const a2 = await loadState(A, { now: T0 });
  const b2 = await loadState(B, { now: T0 });
  t(label("토큰이 다르면 상태가 섞이지 않는다"), a2.state.district === "mapo" && b2.state.district === "gangnam");

  // ── 4. 덮어쓰기와 시각 ───────────────────────────
  const T1 = new Date(T0.getTime() + 3 * DAY);
  const again = await saveState(A, { ...state, district: "seongbuk" }, { now: T1 });
  t(label("created_at은 처음 값을 지킨다"), again.created_at === T0.toISOString(), again.created_at);
  t(label("updated_at은 갱신된다"), again.updated_at === T1.toISOString());
  t(
    label(`expires_at은 마지막으로 연 날 + ${RETENTION_DAYS}일`),
    again.expires_at === new Date(T1.getTime() + RETENTION_DAYS * DAY).toISOString()
  );
  t(label("덮어쓴 값이 읽힌다"), (await loadState(A, { now: T1 })).state.district === "seongbuk");

  // ── 5. 만료 (D-002 자동 삭제 정책) ───────────────
  const 만료후 = new Date(T1.getTime() + (RETENTION_DAYS + 1) * DAY);
  t(label("보관 기간이 지나면 null"), (await loadState(A, { now: 만료후 })) === null);
  t(
    label("만료된 것은 저장소에서도 지워진다"),
    !(await backend.keys()).includes("after47:state:" + A)
  );

  // ── 6. 손상된 값 ─────────────────────────────────
  await backend.set("after47:state:" + A, "{이건 JSON이 아니다");
  t(label("깨진 값은 null로 degrade한다"), (await loadState(A, { now: T0 })) === null);
  await backend.set("after47:state:" + A, JSON.stringify({ v: 1, 딴것: true }));
  t(label("모양이 다른 값도 null"), (await loadState(A, { now: T0 })) === null);

  // ── 7. 잘못된 토큰 ───────────────────────────────
  for (const bad of ["", "abc", "toolongtoken12", "ab3k9M", "ab-k9m", "ab0k9m", "ab1k9m", null, 42]) {
    t(label(`잘못된 토큰 거부: ${JSON.stringify(bad)}`), (await loadState(bad)) === null);
  }
  const badSave = await saveState("ab0k9m", { district: "mapo" });
  t(label("잘못된 토큰으로는 저장하지 않는다"), badSave.persisted === false && badSave.reason === "invalid_token");

  // ── 8. 이 기기의 마지막 토큰 (주소 분실 구명줄) ──
  await saveState(B, { district: "gangnam" }, { now: T1 });
  t(label("마지막으로 저장한 토큰을 기억한다"), (await lastToken()) === B);

  // ── 9. 삭제 ──────────────────────────────────────
  t(label("forgetState가 지운다"), (await forgetState(B)) === true && (await loadState(B, { now: T1 })) === null);

  // ── 10. 일괄 청소 ────────────────────────────────
  await saveState("aaaaaa", { district: "mapo" }, { now: T0 });
  await saveState("bbbbbb", { district: "guro" }, { now: T0 });
  const swept = await sweepExpired({ now: new Date(T0.getTime() + (RETENTION_DAYS + 1) * DAY) });
  t(label("만료된 것을 일괄로 치운다"), swept >= 2, `치운 개수 ${swept}`);

  // ── 11. 데이터 로딩 ──────────────────────────────
  const data = await loadData();
  t(
    label("loadData가 셋을 다 준다"),
    Array.isArray(data.actions) && Array.isArray(data.districts) && Array.isArray(data.questions),
    Object.keys(data).join(",")
  );
  t(label("loadData는 같은 객체를 캐시한다"), (await loadData()) === data);

  // ── 12. 전부 Promise다 ───────────────────────────
  // 동기 백엔드에서도 Promise여야 한다. 아니면 서버로 갈 때 호출부가 바뀐다.
  t(
    label("세 함수가 모두 Promise를 돌려준다"),
    [loadState("aaaaaa"), saveState("aaaaaa", {}), loadData()].every((x) => x instanceof Promise)
  );
}
