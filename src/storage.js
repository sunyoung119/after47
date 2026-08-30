// 저장 계층 + 데이터 로딩 (D-002)
//
// 지금은 localStorage와 정적 JSON이다. 정식 채택되면 서버로 간다.
// 그때 바꾸는 것은 이 파일 맨 위의 백엔드 하나뿐이어야 한다.
// 바깥으로 나가는 것은 아래 세 함수와 토큰 유틸이 전부다.
//
//   loadState(token) / saveState(token, state) / loadData()
//
// 세 함수는 전부 async다. localStorage는 동기지만 서버는 아니다.
// 지금 동기로 만들면 서버로 옮길 때 호출부가 전부 바뀐다.
// 그러면 "안쪽만 바꾼다"가 거짓말이 된다.
//
// localStorage라는 단어는 이 파일 안에만 있어야 한다.
// test/storage.test.mjs가 그것을 검사한다.

const NS = "after47";
const SCHEMA_VERSION = 1;

// 보관 기간 (D-002 "보관 기간과 자동 삭제 정책, 그리고 고지").
// 타임라인이 약 3개월이므로 90일. 마지막으로 연 날부터 다시 센다 —
// 계속 쓰는 사람의 기록이 사라지면 안 된다.
export const RETENTION_DAYS = 90;

// 0/O, 1/l/I 제외. 전부 소문자라 O·I는 애초에 없고 0·1·l을 뺐다.
// 카톡으로 보내고 전화로 불러줄 수 있어야 한다.
export const ALPHABET = "23456789abcdefghijkmnopqrstuvwxyz";
export const TOKEN_MIN = 6;
export const TOKEN_MAX = 8;
const TOKEN_LEN = 8;

const stateKey = (token) => `${NS}:state:${token}`;
const LAST_KEY = `${NS}:last`;

// ── 백엔드 ─────────────────────────────────────────
// 계약: get/set/remove/keys/readJson.
// 동기로 돌려줘도 되고 Promise로 돌려줘도 된다. 바깥에서는 항상 await 한다.
// 서버로 갈 때 만들 것은 이 모양의 객체 하나다.

export function memoryBackend(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    name: "memory",
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
    readJson: async () => {
      throw new Error("memoryBackend에는 데이터가 없다. readJson을 넘겨라");
    },
  };
}

// 브라우저용. storage와 readJson을 주입받으므로 테스트에서 가짜를 끼울 수 있다.
export function webBackend({ storage, readJson } = {}) {
  const ls = storage || globalThis.localStorage;
  const load =
    readJson ||
    (async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${path} 를 읽지 못했다 (${res.status})`);
      return res.json();
    });
  return {
    name: "web",
    get: (k) => ls.getItem(k),
    set: (k, v) => ls.setItem(k, v),
    remove: (k) => ls.removeItem(k),
    keys: () => Object.keys(ls),
    readJson: load,
  };
}

let backend = null;
let dataCache = null;

// 백엔드 교체 지점. 서버로 옮길 때 건드리는 곳은 여기까지다.
export function configureStorage(next) {
  backend = next;
  dataCache = null;
  return backend;
}

function current() {
  if (!backend) backend = webBackend();
  return backend;
}

// ── 토큰 ───────────────────────────────────────────

function defaultRandom(n) {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") return c.getRandomValues(new Uint8Array(n));
  // 폴백. 토큰이 서버에서 신원 역할을 하게 되면 이 경로는 막아야 한다.
  return Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));
}

export function newToken(len = TOKEN_LEN, random = defaultRandom) {
  if (!Number.isInteger(len) || len < TOKEN_MIN || len > TOKEN_MAX) {
    throw new RangeError(`토큰은 ${TOKEN_MIN}~${TOKEN_MAX}자다`);
  }
  // 나머지 연산만 쓰면 앞쪽 글자가 더 자주 나온다. 치우친 몫은 버린다.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out = [];
  while (out.length < len) {
    for (const b of random(len * 2)) {
      if (b >= limit) continue;
      out.push(ALPHABET[b % ALPHABET.length]);
      if (out.length === len) break;
    }
  }
  return out.join("");
}

export function isValidToken(token) {
  if (typeof token !== "string") return false;
  if (token.length < TOKEN_MIN || token.length > TOKEN_MAX) return false;
  for (const ch of token) if (!ALPHABET.includes(ch)) return false;
  return true;
}

// ── 세 함수 ────────────────────────────────────────

// 없으면 null. 깨졌거나 만료됐어도 null이고, 이때 조용히 치운다.
// 던지지 않는다 — 저장소를 못 읽는다고 화면이 안 나오면 안 된다(D-003).
export async function loadState(token, { now = new Date() } = {}) {
  if (!isValidToken(token)) return null;
  const b = current();
  let raw;
  try {
    raw = await b.get(stateKey(token));
  } catch {
    return null;
  }
  if (raw == null) return null;

  let env;
  try {
    env = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await discard(b, token);
    return null;
  }
  if (!env || typeof env !== "object" || !env.state) {
    await discard(b, token);
    return null;
  }
  if (env.expires_at && new Date(env.expires_at) <= now) {
    await discard(b, token);
    return null;
  }
  return { ...env, token, state: migrate(env.state) };
}

// ── 옛 state 정리 ───────────────────────────────────
//
// 폐기된 키를 읽는 순간 떨어뜨린다. **옛 값을 새 키로 옮기지 않는다.**
//
// `water_damage_role`의 `victim`은 "위층 물에 우리 집이 젖었다"였고 새
// `water_damage_home`은 "불을 끄는 과정에서 우리 집이 젖었다"라 **묻는 것이
// 다르다.** 기계적으로 옮기면 답한 적 없는 것을 답한 것으로 만든다.
// 지우면 두 질문이 미답으로 남아 다음 진입에서 다시 묻는다 — 그것이 맞다.
const DROPPED_KEYS = ["water_damage_role"];

function migrate(state) {
  if (!state || typeof state !== "object") return state;
  if (!DROPPED_KEYS.some((k) => k in state)) return state;
  const out = { ...state };
  for (const k of DROPPED_KEYS) delete out[k];
  return out;
}

// 저장 못 해도 던지지 않는다. 사파리 프라이빗 모드나 용량 초과에서 던진다.
// 대신 persisted:false를 돌려준다 — 화면은 "이 기기에 저장할 수 없으니
// 주소를 꼭 남기세요"로 바뀌어야 하고, 그러려면 호출부가 알아야 한다.
export async function saveState(token, state, { now = new Date() } = {}) {
  if (!isValidToken(token)) {
    return { persisted: false, reason: "invalid_token", token, state };
  }
  const b = current();
  const prev = await loadState(token, { now });
  const env = {
    v: SCHEMA_VERSION,
    created_at: prev?.created_at || now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_DAYS * 864e5).toISOString(),
    state,
  };
  try {
    await b.set(stateKey(token), JSON.stringify(env));
  } catch (e) {
    return { ...env, token, persisted: false, reason: "storage_unavailable" };
  }
  // 주소를 잃어도 같은 기기면 살아나게 한다 (D-002 "브라우저 저장으로 자동 복원").
  try {
    await b.set(LAST_KEY, token);
  } catch {
    /* 본체가 저장됐으면 이건 실패해도 된다 */
  }
  return { ...env, token, persisted: true, reason: null };
}

export async function loadData({ base = "data", reload = false } = {}) {
  if (dataCache && !reload) return dataCache;
  const b = current();
  const [actions, districts, questions] = await Promise.all([
    b.readJson(`${base}/actions.json`),
    b.readJson(`${base}/districts.json`),
    b.readJson(`${base}/questions.json`),
  ]);
  dataCache = { actions, districts, questions };
  return dataCache;
}

// ── 부수 유틸 ──────────────────────────────────────

// 이 기기에서 마지막으로 보던 토큰. 주소를 잃은 사람의 유일한 구명줄이다.
export async function lastToken() {
  try {
    const t = await current().get(LAST_KEY);
    return isValidToken(t) ? t : null;
  } catch {
    return null;
  }
}

export async function forgetState(token) {
  if (!isValidToken(token)) return false;
  await discard(current(), token);
  return true;
}

// 만료된 것을 한 번에 치운다. 브라우저에서는 진입 시 한 번 부르면 된다.
export async function sweepExpired({ now = new Date() } = {}) {
  const b = current();
  let removed = 0;
  let keys;
  try {
    keys = await b.keys();
  } catch {
    return 0;
  }
  for (const k of keys) {
    if (!k.startsWith(`${NS}:state:`)) continue;
    const token = k.slice(`${NS}:state:`.length);
    if ((await loadState(token, { now })) === null) removed++;
  }
  return removed;
}

async function discard(b, token) {
  try {
    await b.remove(stateKey(token));
  } catch {
    /* 지우지 못해도 만료 판정은 유효하다 */
  }
}
