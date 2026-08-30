// 저장 계층 검증 (D-002)
//
// 이 파일이 답해야 할 질문은 하나다.
// "정말로 이 세 함수 안쪽만 바꾸면 서버로 갈 수 있는가."
//
// 같은 계약(storage.contract.mjs)을 서로 다른 백엔드 넷에 돌린다.
// 그중 하나는 전부 async인 서버 흉내다. 그것이 통과하면
// 동기→비동기 전환이 호출부를 건드리지 않는다는 것이 증명된다.

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  configureStorage,
  memoryBackend,
  webBackend,
  newToken,
  isValidToken,
  saveState,
  loadState,
  ALPHABET,
  TOKEN_MIN,
  TOKEN_MAX,
} from "../src/storage.js";
import { openSession, anchorSession, shareUrl, spellToken } from "../src/session.js";
import { runContract } from "./storage.contract.mjs";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

const readJson = async (path) => JSON.parse(readFileSync(join(D, path), "utf8"));

// ── 백엔드 넷 ──────────────────────────────────────

// 1. 메모리. 서버 어댑터를 만들 때의 출발점.
const 메모리 = () => ({ ...memoryBackend(), readJson });

// 2. localStorage API를 그대로 흉내낸다. 브라우저에서 실제로 타는 경로.
function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    _map: m,
  };
}
const 브라우저 = () => {
  const ls = fakeLocalStorage();
  const b = webBackend({ storage: ls, readJson });
  // Object.keys(localStorage)는 실제 브라우저에서만 동작한다. 흉내에 맞춰 준다.
  return { ...b, keys: () => [...ls._map.keys()] };
};

// 3. 서버 흉내. 전부 Promise이고 실제로 지연도 있다.
//    D-002의 "안쪽만 바꾼다"가 참인지 여기서 갈린다.
function 서버흉내() {
  const m = new Map();
  const tick = (v) => new Promise((r) => setTimeout(() => r(v), 1));
  return {
    name: "async-server",
    get: async (k) => tick(m.has(k) ? m.get(k) : null),
    set: async (k, v) => tick(void m.set(k, v)),
    remove: async (k) => tick(void m.delete(k)),
    keys: async () => tick([...m.keys()]),
    readJson: async (p) => tick(await readJson(p)),
  };
}

// 4. 쓰기가 막힌 저장소. 사파리 프라이빗 모드·용량 초과.
function 쓰기불가() {
  const b = memoryBackend();
  return {
    ...b,
    readJson,
    set: () => {
      throw new DOMExceptionLike("QuotaExceededError");
    },
  };
}
class DOMExceptionLike extends Error {}

// ── 1~4. 계약을 넷 다 통과하는가 ───────────────────
section("1. 같은 계약을 백엔드 셋이 똑같이 통과하는가");
for (const [name, make] of [
  ["memory", 메모리],
  ["localStorage", 브라우저],
  ["async-server", 서버흉내],
]) {
  console.log(`\n▼ ${name}`);
  await runContract({ name, makeBackend: make, t });
}

section("2. 저장 못 하는 브라우저에서 degrade하는가");
configureStorage(쓰기불가());
const blocked = await saveState("ab3k9m", { district: "mapo" });
t("쓰기가 막혀도 던지지 않는다", blocked.persisted === false);
t("이유를 알려준다 (화면이 '주소를 꼭 남기세요'로 바뀌어야 한다)", blocked.reason === "storage_unavailable");
t("그래도 상태 자체는 돌려준다", blocked.state.district === "mapo");
let threw = false;
try {
  await loadState("ab3k9m");
} catch {
  threw = true;
}
t("읽기도 던지지 않는다", !threw);

// ── 2-b. 폐기된 키를 읽는 순간 떨어뜨리는가 ─────────
//
// `water_damage_role`은 물 피해 2축(home·neighbor)으로 대체됐다.
// **옛 값을 새 키로 옮기지 않는다** — `victim`은 "위층 물에 우리 집이 젖었다"였고
// 새 `water_damage_home`은 "불을 끄는 과정에서 우리 집이 젖었다"라 묻는 것이
// 다르다. 옮기면 답한 적 없는 것을 답한 것으로 만든다. 지우면 두 질문이
// 미답으로 남아 다음 진입에서 다시 묻는다 — 그것이 맞다.
{
  const mem = memoryBackend();
  configureStorage(mem);
  const T = "ab3k9m";
  // 옛 스키마를 직접 심는다(saveState를 거치면 지금 코드가 만들어 낸 값이 된다).
  await mem.set(
    `after47:state:${T}`,
    JSON.stringify({
      v: 1,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      state: { district: "mapo", water_damage_role: "victim", tenure: "renter" },
    })
  );
  const 옛것 = await loadState(T);
  t("폐기된 water_damage_role은 읽을 때 사라진다", !("water_damage_role" in 옛것.state));
  t(
    "새 두 축은 미답으로 남는다 (자동 매핑하지 않는다)",
    옛것.state.water_damage_home === undefined && 옛것.state.water_damage_neighbor === undefined
  );
  t("나머지 답은 그대로다", 옛것.state.district === "mapo" && 옛것.state.tenure === "renter");
  // 폐기 키가 없는 state는 손대지 않는다 — 불필요한 사본을 만들지 않는다.
  await saveState(T, { district: "mapo", water_damage_home: true });
  const 새것 = await loadState(T);
  t("새 스키마는 그대로 왕복한다", 새것.state.water_damage_home === true);
}

// ── 5. 누수 탐지 ───────────────────────────────────
// D-002의 진짜 제약은 "저장 호출이 흩어지지 않는 것"이다.
// 계약 테스트는 storage.js가 옳은지만 보고, 이건 다른 파일이 몰래
// localStorage를 만지는지를 본다. 둘 다 있어야 D-002가 지켜진다.
section("3. 저장 호출이 storage.js 밖으로 새지 않는가");
const 금지 = [
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bindexedDB\b/, "indexedDB"],
  [/\bdocument\.cookie\b/, "document.cookie"],
  [/(^|[^.\w])fetch\s*\(/m, "fetch("],
];
// **재귀로 훑는다.** 한 겹만 읽으면 `src/ui/` 같은 하위 폴더가 통째로
// 사각이 된다 — UI가 거기 생겼고, 화면 코드야말로 localStorage를 직접
// 부르고 싶어지는 자리다.
function jsFiles(dir, prefix = "src") {
  const out = [];
  for (const e of readdirSync(join(D, dir), { withFileTypes: true })) {
    const rel = `${prefix}/${e.name}`;
    if (e.isDirectory()) out.push(...jsFiles(join(dir, e.name), rel));
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out.sort();
}
const 검사대상 = jsFiles("src");
t(`src/ 아래 .js를 재귀로 전부 본다 (${검사대상.length}개)`, 검사대상.length > 0);
for (const rel of 검사대상) {
  const src = readFileSync(join(D, rel), "utf8");
  // 주석은 뺀다. 설명에 단어가 나오는 것까지 막을 필요는 없다.
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [re, 이름] of 금지) {
    const hit = re.test(code);
    const 허용 = rel === "src/storage.js";
    t(`${rel} 안의 ${이름}`, 허용 ? true : !hit, `${rel}이 ${이름}를 직접 부른다`);
  }
}
// storage.js 안에서도 localStorage를 만지는 곳은 webBackend 하나여야 한다.
// 세 함수(loadState/saveState/loadData)가 직접 만지기 시작하면
// 백엔드 교체가 다시 어려워진다.
const storageCode = readFileSync(join(D, "src/storage.js"), "utf8")
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const webBackendBody = storageCode.slice(
  storageCode.indexOf("export function webBackend"),
  storageCode.indexOf("let backend")
);
const 전체언급 = storageCode.split("localStorage").length - 1;
const 백엔드언급 = webBackendBody.split("localStorage").length - 1;
t(
  "storage.js 안에서도 localStorage는 webBackend 안에만 있다",
  전체언급 > 0 && 전체언급 === 백엔드언급,
  `코드에 ${전체언급}번 나오는데 webBackend 안에는 ${백엔드언급}번뿐이다`
);
t(
  "세 함수는 백엔드만 부른다",
  !/(loadState|saveState|loadData)[\s\S]{0,600}?localStorage/.test(storageCode),
  "세 함수 중 하나가 localStorage를 직접 만진다"
);

// ── 6. 토큰 ────────────────────────────────────────
section("4. 토큰");
const 혼동 = ["0", "O", "1", "l", "I"];
t(`알파벳 ${ALPHABET.length}자에 혼동 문자가 없다`, !혼동.some((c) => ALPHABET.includes(c)), ALPHABET);
t("대문자가 없다 (불러줄 때 헷갈린다)", ALPHABET === ALPHABET.toLowerCase());

const 표본 = Array.from({ length: 5000 }, () => newToken());
t("기본 길이는 8자", 표본.every((x) => x.length === 8));
t("5000개에 금지 문자가 하나도 없다", 표본.every((x) => [...x].every((c) => ALPHABET.includes(c))));
t("5000개가 전부 다르다", new Set(표본).size === 5000);
const 분포 = {};
표본.join("").split("").forEach((c) => (분포[c] = (분포[c] || 0) + 1));
const 값 = Object.values(분포);
const 기대 = (5000 * 8) / ALPHABET.length;
t(
  "글자가 고르게 나온다 (나머지 연산 치우침 없음)",
  Object.keys(분포).length === ALPHABET.length && Math.min(...값) > 기대 * 0.8 && Math.max(...값) < 기대 * 1.2,
  `기대 ${Math.round(기대)} / 실제 ${Math.min(...값)}~${Math.max(...값)}, 등장한 글자 ${Object.keys(분포).length}종`
);

for (const len of [6, 7, 8]) t(`${len}자 발급 가능`, newToken(len).length === len);
for (const len of [5, 9, 0, 8.5]) {
  let ok = false;
  try {
    newToken(len);
  } catch {
    ok = true;
  }
  t(`${len}자는 거부한다 (${TOKEN_MIN}~${TOKEN_MAX}자)`, ok);
}
t("카톡에 붙일 만한 길이다", shareUrl("ab3k9m", "mapo").length <= 45, shareUrl("ab3k9m", "mapo"));
t("주소 형태가 ?d=&t= 다", shareUrl("ab3k9m", "mapo") === "https://after47.kr/?d=mapo&t=ab3k9m");
t("불러주기 좋게 끊어준다", spellToken("ab3k9m") === "a b 3 k 9 m");
t("사람이 잘못 옮겨 적은 토큰을 걸러낸다", !isValidToken("ab0k9m") && !isValidToken("abIk9m"));

// ── 7. 진입 규칙 ───────────────────────────────────
section("5. 진입 — ?d= 와 저장값이 부딪힐 때");

const 새백엔드 = () => configureStorage({ ...memoryBackend(), readJson });

새백엔드();
let s = await openSession({ url: "https://after47.kr/?d=mapo" });
t("QR로 처음 들어오면 토큰이 발급된다", isValidToken(s.token) && s.isNew);
t("?d= 가 자치구 힌트로 들어간다", s.state.district === "mapo");
t("돌려주는 주소에 토큰이 붙어 있다", s.url === shareUrl(s.token, "mapo"));

await anchorSession(s);
const 토큰 = s.token;

// 사용자가 앱 안에서 성북구로 바꿨다
await saveState(토큰, { ...s.state, district: "seongbuk" });

s = await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` });
t("저장값이 ?d= 를 이긴다", s.state.district === "seongbuk", s.state.district);
t("충돌을 조용히 넘기지 않고 알려준다", s.notices.some((n) => n.type === "district_conflict"));
const 충돌 = s.notices.find((n) => n.type === "district_conflict");
t("무엇과 무엇이 부딪혔는지 알려준다", 충돌.fromUrl === "mapo" && 충돌.saved === "seongbuk");

s = await openSession({ url: `https://after47.kr/?d=seongbuk&t=${토큰}` });
t("같은 값이면 충돌 알림이 없다", !s.notices.some((n) => n.type === "district_conflict"));

s = await openSession({ url: `https://after47.kr/?t=${토큰}` });
t("?d= 가 없어도 저장값으로 돈다", s.state.district === "seongbuk");

// 주소를 잃고 맨몸으로 다시 들어온 경우
s = await openSession({ url: "https://after47.kr/" });
t("주소를 잃어도 같은 기기면 이어진다", s.token === 토큰 && s.state.district === "seongbuk");
t("이어붙였다는 것을 알려준다", s.notices.some((n) => n.type === "resumed_on_device"));

s = await openSession({ url: "https://after47.kr/", resume: false });
t("새로 시작하기를 고르면 새 토큰이 나온다", s.token !== 토큰 && Object.keys(s.state).length === 0);

// 이상한 주소
새백엔드();
// bucheon은 서울 자치구가 아니다. 25개 전수를 채운 뒤로 "데이터에 없는 구"를
// 서울 안에서 고를 수 없어졌다.
s = await openSession({ url: "https://after47.kr/?d=bucheon&t=ab0k9m" });
t("모르는 자치구는 힌트로 안 쓴다", s.state.district === undefined);
t("자치구를 물어야 한다고 알려준다", s.notices.some((n) => n.type === "district_needed"));
t("망가진 토큰은 버리고 새로 발급한다", isValidToken(s.token) && s.token !== "ab0k9m");
t("토큰이 이상했다는 것도 알려준다", s.notices.some((n) => n.type === "token_invalid"));

// 카톡으로 받은 링크를 다른 기기에서 연 경우 — v1의 한계를 명시한다
새백엔드();
s = await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` });
t(
  "다른 기기에서 같은 주소를 열면 상태는 비어 있다 (v1 한계)",
  s.token === 토큰 && !s.saved && s.state.district === "mapo"
);

// 만료 고지 (D-002 "보관 기간과 자동 삭제 정책, 그리고 고지")
새백엔드();
s = await openSession({ url: "https://after47.kr/?d=mapo" });
await anchorSession(s);
s = await openSession({ url: `https://after47.kr/?t=${s.token}` });
t("언제 사라지는지 화면에 띄울 수 있다", s.notices.some((n) => n.type === "expires_at" && n.at));

console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
