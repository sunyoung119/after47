// 뷰모델 검증 — 화면이 무엇을 그릴지 정하는 자리
//
// 이 파일이 답해야 할 질문은 하나다.
// "브라우저 없이도 화면의 판단을 전부 검사할 수 있는가."
//
// DOM은 여기 없다. 뷰모델은 순수함수이고, app.js는 여기서 나온 것을 그리기만
// 한다. 세션은 storage.test.mjs가 쓰는 **메모리 백엔드 주입 패턴을 그대로**
// 가져온다 — 브라우저 없이 openSession을 돌리는 방법이 이미 거기 있다.

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { configureStorage, memoryBackend, saveState, newToken } from "../src/storage.js";
import { openSession, anchorSession } from "../src/session.js";
import { evaluate } from "../src/engine.js";
import { applyDefaults } from "../src/questions.js";
import { entryView, surveyView, saveNoticeView, TOP_BANNER } from "../src/ui/view.js";
import { contactOf, sourcesView, directoryView } from "../src/ui/result.js";
import { COPY, STATUS_LABEL } from "../src/ui/copy.js";
import { TOPIC_LABEL, TOPIC_ORDER, NODE_LABEL, topicLabel } from "../src/ui/copy.js";
import {
  landingView, basicCheckView, masterView, scopeNoticeView, transitionView, revisitView, fireAtOf, maxHourOn, keepHour,
  SELECT_FEEDBACK_MS, BASIC_KEYS,
} from "../src/ui/entry.js";
import {
  resultBase, resultView, priorityView, checklistView, topicsView, topicDetailView,
  actionDetailView, undeterminedView, sourceOf, RESULT_PAGES,
} from "../src/ui/result.js";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));
const readJson = async (path) => JSON.parse(readFileSync(join(D, path), "utf8"));
const questions = read("data/questions.json");
const data = {
  actions: read("data/actions.json"),
  districts: read("data/districts.json"),
  // 연락처 화면이 읽는 전역 목록. 판정에는 들어가지 않는다.
  directory: read("data/directory.json"),
};

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

const 새백엔드 = () => configureStorage({ ...memoryBackend(), readJson });
const bannerTypes = (v) => v.banners.map((b) => b.type);
const noteTypes = (v) => (v.notes || []).map((b) => b.type);
// 위아래를 합쳐 "그려지긴 하는가"를 볼 때 쓴다.
const 그려진타입 = (v) => [...bannerTypes(v), ...noteTypes(v)];

// ── 1. 진입 ────────────────────────────────────────
section("1. 진입 — notice 다섯 종과 notice가 없는 여섯째");

// (1) QR로 정상 진입
새백엔드();
let s = await openSession({ url: "https://after47.kr/?d=mapo" });
let v = entryView(s);
t("① ?d=mapo → district_needed 배너가 없다", !bannerTypes(v).includes("district_needed"));
t("① 보이는 구가 마포다", v.district?.id === "mapo" && v.district.name === "마포구");

// (2) 자치구를 모르는 두 경우 — **배너로는 그리지 않는다.**
// 지역을 받는 자리가 확정 화면 `기본 확인` 하나뿐이라, 이 배너는 그 화면과
// 늘 같은 말을 했다(셀렉트가 비어 있고 [다음]이 잠긴 것이 이미 같은 요구다).
// notice 자체는 세션 계층에 남는다 — 화면 밖에서 쓸 수 있는 사실이다.
새백엔드();
let s2 = await openSession({ url: "https://after47.kr/" });
v = entryView(s2);
t("② ?d= 없음 → notice는 온다", s2.notices.some((n) => n.type === "district_needed"));
t("② 그러나 배너로는 어디에도 안 그린다", !그려진타입(v).includes("district_needed"), JSON.stringify(그려진타입(v)));
t("② 이유는 'missing'이다", s2.notices.find((n) => n.type === "district_needed")?.reason === "missing");

새백엔드();
s2 = await openSession({ url: "https://after47.kr/?d=bucheon" });
v = entryView(s2);
t("② 서울 밖 값(bucheon)도 마찬가지다", !그려진타입(v).includes("district_needed"));
t(
  "② 두 경우의 이유는 여전히 갈린다 (모르는 값은 'unknown')",
  s2.notices.find((n) => n.type === "district_needed")?.reason === "unknown",
  JSON.stringify(s2.notices)
);
// 문구 둘은 COPY에 남아 있다 — 되살릴 때 다시 쓰라고 지우지 않았다.
t(
  "② 문구 둘은 COPY에 남아 있고 서로 다르다",
  Boolean(COPY.banner.district_needed_missing) &&
    COPY.banner.district_needed_missing !== COPY.banner.district_needed_unknown
);
// 지역 목록은 이제 확정 화면 `기본 확인`의 필드가 갖는다 — 절 7이 본다.

// (3) 저장값이 ?d=를 이기되 조용히 넘기지 않는다
새백엔드();
s = await openSession({ url: "https://after47.kr/?d=seongbuk" });
await anchorSession(s);
const 토큰 = s.token;
v = entryView(await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` }));
t(
  "③ 저장값 성북 + ?d=mapo → district_conflict 1건",
  v.notes.filter((b) => b.type === "district_conflict").length === 1,
  JSON.stringify(그려진타입(v))
);
t(
  "③ 그 자리는 헤드라인 위가 아니라 하단이다",
  !bannerTypes(v).includes("district_conflict")
);
t("③ 보이는 구는 성북이다", v.district?.id === "seongbuk");
const conflict = v.notes.find((b) => b.type === "district_conflict");
t(
  "③ 배너에 [마포구로 바꾸기] 액션이 있다",
  conflict.actions[0]?.id === "switch_district" && conflict.actions[0].value === "mapo",
  JSON.stringify(conflict.actions)
);

// (4) 체험장에서 한 기기를 여러 사람이 쓴다 — 빠져나갈 길이 있어야 한다
v = entryView(await openSession({ url: "https://after47.kr/" }));
t("④ 주소 없이 들어오면 resumed_on_device 배너가 뜬다", bannerTypes(v).includes("resumed_on_device"));
t(
  "④ 그 배너에 [새로 시작하기] 액션이 있다",
  v.banners.find((b) => b.type === "resumed_on_device")?.actions.some((a) => a.id === "restart")
);
// ★ **그 길은 진입 화면에서만 필요하다**(사용자 실기기 관찰). 한 걸음
//   걷고 나면 빠져나갈 문이 아니라 소음이고, 답을 다시 걷는 중에는
//   `이어서 보고 있습니다`가 아예 거짓이다.
{
  const 세션 = await openSession({ url: "https://after47.kr/" });
  const 진입 = bannerTypes(entryView(세션, { atEntry: true }));
  const 걷는중 = bannerTypes(entryView(세션, { atEntry: false }));
  t("④ 걷기 시작하면 그 배너는 사라진다",
    !걷는중.includes("resumed_on_device"), 걷는중.join(","));
  // **사라지는 것이 그 하나뿐이다** — 자치구 알림처럼 눌러서 고칠 수 있는
  // 것까지 걷어내면 고칠 길이 없어진다.
  t("④ 걷어내는 것은 그 배너 하나뿐이다",
    진입.filter((x) => x !== "resumed_on_device").join(",") === 걷는중.join(","),
    `${진입.join(",")} → ${걷는중.join(",")}`);
}

// (5) 여섯째 — **남의 재접속 링크를 다른 기기에서 연 사람.**
// 판정이 뷰모델에서 세션 계층으로 올라갔다: 여기서 쓰던 `!saved && !isNew`는
// D-015 0층이 진입 직후 저장해 버려서 앱에서 한 번도 참이 아니었다.
새백엔드(); // 기기를 바꾼 것과 같다
s = await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` });
t("⑤ 세션 계층이 no_saved_state를 직접 민다", s.notices.some((n) => n.type === "no_saved_state"));
t("⑤ 남의 토큰을 기각하고 새로 발급한다", s.token !== 토큰 && s.isNew, `${s.token} / isNew=${s.isNew}`);
v = entryView(s);
// ★ **그리지 않는다**(2026-09-02 · 사용자 결정). 그 사람이 지금 하려는
// 일은 처음부터 시작하는 것이고, 첫 방문자에게 첫 방문이라고 알리는 말은
// 정보가 아니다 — 없어진 무언가가 있었다는 인상만 남긴다.
// **타 기기 진입은 조용히 첫 방문으로 시작한다.**
t("⑤ 상단에 안 뜬다", !bannerTypes(v).includes("no_saved_state"), JSON.stringify(bannerTypes(v)));
t("⑤ 하단에도 안 뜬다", !noteTypes(v).includes("no_saved_state"), JSON.stringify(noteTypes(v)));
t("⑤ 저장 고지도 함께 걷혔다 (이 분기에서만 서던 줄이다)",
  !noteTypes(v).includes("storage_note"), JSON.stringify(noteTypes(v)));
t("⑤ 그 문구가 화면 어디에도 없다",
  ![...v.banners, ...v.notes].some((b) => `${b.text} ${b.sub || ""}`.includes("저장된 내용이 없어")),
  JSON.stringify([...v.banners, ...v.notes].map((b) => b.text))
);
// 문구 둘은 COPY에 남는다 — 되살릴 때 다시 쓰라고 지우지 않았다.
t("⑤ 문구는 COPY에 남아 있다",
  COPY.banner.no_saved_state === "이 기기에는 저장된 내용이 없어 처음부터 시작합니다." &&
    COPY.banner.no_saved_state_sub === "답하신 내용은 답한 기기에 저장됩니다.");

// 정상 진입에서는 notice 자체가 없다
새백엔드();
s = await openSession({ url: "https://after47.kr/?d=mapo" });
t("⑤ 새로 시작한 사람에게는 notice가 없다", !s.notices.some((n) => n.type === "no_saved_state"));
await anchorSession(s);
s = await openSession({ url: `https://after47.kr/?t=${s.token}` });
t("⑤ 저장이 살아 있는 사람에게도 없다", !s.notices.some((n) => n.type === "no_saved_state"));
// 자기 기록을 이어 보는 사람에게도 안 뜬다 — 그 사람에겐 문장이 거짓이다.
{
  const 남의토큰 = 토큰;
  const 내것 = await openSession({ url: `https://after47.kr/?d=mapo&t=${남의토큰}` });
  t("⑤ 자기 기록을 재개하는 사람에게는 안 뜬다",
    !내것.notices.some((n) => n.type === "no_saved_state") && 내것.notices.some((n) => n.type === "resumed_on_device"),
    내것.notices.map((n) => n.type).join(","));
}
// token_invalid도 같은 규칙으로 접힌다.
{
  새백엔드();
  const 무효 = await openSession({ url: "https://after47.kr/?t=!!!" });
  t("⑤ token_invalid는 진입 화면에 뜬다", bannerTypes(entryView(무효)).includes("token_invalid"));
  t("⑤ token_invalid도 걷기 시작하면 접힌다",
    !bannerTypes(entryView(무효, { atEntry: false })).includes("token_invalid"));
}

// 만료 고지는 배너가 아니라 하단 한 줄이다 (D-002 · D-015)
v = entryView(s);
t("만료 고지가 배너가 아니라 별도 자리에 있다", v.expires !== null && !bannerTypes(v).includes("expires_at"));
t("만료 고지에 날짜가 한국어로 들어간다", /\d{4}년 \d{1,2}월 \d{1,2}일/.test(v.expires.text), v.expires.text);

// notices는 진입 시점의 사실이고 화면은 지금 state를 본다. 어긋나면 화면이 맞다.
const 고른뒤 = entryView({
  ...(await (async () => {
    새백엔드();
    return openSession({ url: "https://after47.kr/" });
  })()),
  state: { district: "gangnam" },
});
t(
  "자치구를 고른 뒤에는 district_needed 배너가 사라진다",
  !bannerTypes(고른뒤).includes("district_needed"),
  JSON.stringify(bannerTypes(고른뒤))
);
t("고른 구가 보인다", 고른뒤.district?.id === "gangnam");

새백엔드();
s = await openSession({ url: "https://after47.kr/?d=seongbuk" });
await anchorSession(s);
s = await openSession({ url: `https://after47.kr/?d=mapo&t=${s.token}` });
t(
  "충돌한 구로 바꾸고 나면 그 배너도 사라진다",
  !그려진타입(entryView({ ...s, state: { ...s.state, district: "mapo" } })).includes(
    "district_conflict"
  )
);

// 망가진 토큰
새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/?d=mapo&t=ab0k9m" }));
t("망가진 토큰이면 token_invalid 배너가 뜬다", bannerTypes(v).includes("token_invalid"));

// ⑦ 주거 형태가 "그 외"일 때 말해야 하는 책임 경계(D-006)는 그대로지만
// **배너가 아니라 확정 화면 `안내 범위`(04A)가 맡는다.** 배너 한 줄로는
// 무엇이 검증됐고 무엇이 범위 밖인지 말할 수 없었고, 갈 곳(계속하기 /
// 건물 종류 다시 선택)도 줄 수 없었다. 판정은 절 7의 scopeNoticeView가 본다.
새백엔드();
const 경계세션 = await openSession({ url: "https://after47.kr/?d=mapo" });
const scopeBanners = (st) =>
  entryView({ ...경계세션, state: { ...경계세션.state, ...st } }).banners.filter(
    (b) => b.type === "scope"
  );
t("⑦ 경계 배너는 사라졌다 (안내 범위 화면이 대체한다)",
  scopeBanners({ housing_type: "other" }).length === 0);
t("⑦ 어떤 답에도 배너로는 안 뜬다",
  scopeBanners({ housing_type: "apartment" }).length === 0 && scopeBanners({}).length === 0);

// ── 1-b. 배너가 서는 자리 ──────────────────────────
section("1-b. 헤드라인 위는 진입 알림 한 장 — 규칙으로 고정한다");

// **화면이 아니라 규칙을 본다.** 첫 화면(기본 확인)에서 배너가 쌓이면
// 메인 질문이 밀려 내려가고, 정신없는 사람이 제일 먼저 읽어야 할 것이
// 세 번째가 된다. 그래서 자리를 화이트리스트로 정하고 — 여기 없는 타입은
// 새로 생겨도 자동으로 하단이다 — 진입 조합을 **전수로 돌려** 못 박는다.
//
// 개별 화면에 검사를 다는 대신 이렇게 두는 이유: notice가 하나 늘 때마다
// 화면마다 다시 세는 대신, 늘어난 그 순간에 여기가 먼저 걸린다.

t(
  "위에 설 수 있는 것은 둘뿐이다",
  TOP_BANNER.length === 2 &&
    ["resumed_on_device", "token_invalid"].every((x) => TOP_BANNER.includes(x)),
  JSON.stringify(TOP_BANNER)
);
// 그리지 않기로 한 타입이 자리 목록에 남아 있으면 규칙이 거짓말을 한다.
t("그리지 않는 타입은 목록에도 없다", !TOP_BANNER.includes("no_saved_state"));

const 유효토큰 = newToken();
const 진입경우 = [
  { 이름: "완전 첫 방문", url: "https://after47.kr/" },
  { 이름: "구별 QR ?d=mapo", url: "https://after47.kr/?d=mapo" },
  { 이름: "서울 밖 ?d=bucheon", url: "https://after47.kr/?d=bucheon" },
  { 이름: "깨진 토큰", url: "https://after47.kr/?t=ab0k9m" },
  { 이름: "깨진 토큰 + d", url: "https://after47.kr/?d=mapo&t=ab0k9m" },
  { 이름: "남의 재접속 링크", url: `https://after47.kr/?d=mapo&t=${유효토큰}` },
  { 이름: "이 기기 저장(구 없음)", 심기: {}, url: "https://after47.kr/" },
  { 이름: "이 기기 저장(구 없음) + 남의 링크", 심기: {}, url: `https://after47.kr/?d=mapo&t=${유효토큰}` },
  { 이름: "이 기기 저장(구 종로) + ?d=mapo", 심기: { district: "jongno" }, url: "https://after47.kr/?d=mapo" },
  { 이름: "이 기기 저장(구 없음) + 깨진 토큰", 심기: {}, url: "https://after47.kr/?t=ab0k9m" },
  {
    이름: "이 기기 저장(구 종로) + 깨진 토큰 + d",
    심기: { district: "jongno" },
    url: "https://after47.kr/?d=mapo&t=ab0k9m",
  },
];

let 위최대 = 0;
let 위반 = [];
let 그린적있는위 = new Set();
for (const c of 진입경우) {
  새백엔드();
  if (c.심기) await saveState(newToken(), c.심기);
  const 세션 = await openSession({ url: c.url });
  const 진입 = entryView(세션, { atEntry: true });
  const 걷는중 = entryView(세션, { atEntry: false });
  위최대 = Math.max(위최대, 진입.banners.length);
  for (const b of 진입.banners) 그린적있는위.add(b.type);
  if (진입.banners.length > 1) 위반.push(`${c.이름}: ${bannerTypes(진입).join("+")}`);
  if (진입.banners.some((b) => !TOP_BANNER.includes(b.type)))
    위반.push(`${c.이름}: 화이트리스트 밖이 위에 섰다 — ${bannerTypes(진입).join("+")}`);
  if (그려진타입(진입).includes("district_needed"))
    위반.push(`${c.이름}: district_needed가 그려졌다`);
  // 걷기 시작한 뒤에는 진입 알림이 위에 남지 않는다(8f1a6ba의 규칙).
  if (걷는중.banners.length > 0) 위반.push(`${c.이름}: 걷는 중인데 위에 배너가 있다`);
}

t(`진입 ${진입경우.length}가지 전수 — 헤드라인 위는 늘 1장 이하다 (최대 ${위최대})`, 위반.length === 0, 위반.join(" / "));
t(
  "그 한 장은 늘 진입 알림이다",
  [...그린적있는위].every((x) => TOP_BANNER.includes(x)),
  JSON.stringify([...그린적있는위])
);
// 계기판이 눈을 잃지 않게 — 조합을 전수로 돌렸는데 위가 한 번도 안 서면
// 위 규칙은 아무것도 지키지 않은 것이다.
t("전수 중에 위 한 장이 실제로 서는 경우가 있다", 그린적있는위.size >= 2, JSON.stringify([...그린적있는위]));

// **자동 방어** — 모르는 타입이 늘어도 위로 올라오지 않는다.
새백엔드();
const 미래 = entryView(
  { ...(await openSession({ url: "https://after47.kr/?d=mapo" })), notices: [{ type: "brand_new_notice" }] },
  { atEntry: true }
);
t("모르는 notice가 생겨도 헤드라인 위에 서지 않는다", 미래.banners.length === 0, JSON.stringify(미래.banners));

// ★ **이어보는 중에는 깨진 주소 얘기를 하지 않는다**(2026-09-02 · 사용자
// 결정). `token_invalid`의 카피는 `이 주소로는 저장된 기록을 찾지 못해
// **새로 시작합니다**`인데, 이 기기 기록이 이어졌으면 그 문장이 거짓이다.
// 앞서 우선순위로 밀어 하단에 뒀지만 자리를 옮겨도 거짓인 것은 그대로였다.
새백엔드();
await saveState(newToken(), {});
const 이어보기세션 = await openSession({ url: "https://after47.kr/?t=ab0k9m" });
const 밀림 = entryView(이어보기세션, { atEntry: true });
t("두 알림이 함께 온다 (세션 계층은 둘 다 안다)",
  ["token_invalid", "resumed_on_device"].every((x) => 이어보기세션.notices.some((n) => n.type === x)),
  JSON.stringify(이어보기세션.notices.map((n) => n.type)));
t("실제로 일어난 일만 위에 선다 (이어보기)", bannerTypes(밀림)[0] === "resumed_on_device", JSON.stringify(bannerTypes(밀림)));
t("깨진 주소 알림은 상·하단 어디에도 없다",
  !그려진타입(밀림).includes("token_invalid"), JSON.stringify(그려진타입(밀림)));
// 그 카피가 참인 자리에는 그대로 선다 — 저장이 없어 정말로 새로 시작하는 사람.
{
  새백엔드();
  const 저장없음 = entryView(await openSession({ url: "https://after47.kr/?t=ab0k9m" }), { atEntry: true });
  t("저장이 없어 정말로 새로 시작하는 사람에게는 뜬다",
    bannerTypes(저장없음).includes("token_invalid"), JSON.stringify(bannerTypes(저장없음)));
  t("카피는 한 글자도 안 바뀌었다",
    COPY.banner.token_invalid === "이 주소로는 저장된 기록을 찾지 못해 새로 시작합니다.");
}

// 남의 재접속 링크(strangerLink) 분기 — **상·하단 어디에도 아무 말이 없다.**
새백엔드();
const 남의링크세션 = await openSession({ url: `https://after47.kr/?d=mapo&t=${newToken()}` });
const 남의링크 = entryView(남의링크세션, { atEntry: true });
t("strangerLink 분기에서 notice는 온다", 남의링크세션.notices.some((n) => n.type === "no_saved_state"));
t("그러나 상단이 비어 있다", 남의링크.banners.length === 0, JSON.stringify(bannerTypes(남의링크)));
t("하단도 비어 있다", 남의링크.notes.length === 0, JSON.stringify(noteTypes(남의링크)));
t(
  "두 문구 어느 쪽도 화면에 없다",
  ![...남의링크.banners, ...남의링크.notes].some((b) =>
    `${b.text} ${b.sub || ""}`.includes("저장") || `${b.text}`.includes("처음부터")
  )
);

// 마크업에서도 자리가 갈려 있다 — 위는 main 앞, 아래는 main 뒤다.
{
  const html = readFileSync(join(D, "index.html"), "utf8");
  const 위 = html.indexOf('id="banners"');
  const 본문 = html.indexOf('id="main"');
  const 아래 = html.indexOf('id="banners-foot"');
  t("마크업에서 위 슬롯은 헤드라인(main)보다 앞이다", 위 > 0 && 위 < 본문);
  t("마크업에서 하단 슬롯은 main보다 뒤다", 아래 > 본문);
}

// ── 2. 설문 ────────────────────────────────────────
section("2. 설문 — 커서와 남은 수");

const FIRE = "2026-03-01T12:00:00.000Z";
const NOW = Date.parse(FIRE) + 3 * 36e5;

// (6) 빈 state
let sv = surveyView({ questions, state: { district: "mapo" }, data, now: NOW });
t("⑥ 빈 state → 첫 질문이 q-fire-date다", sv.current?.id === "q-fire-date", sv.current?.id);
t("⑥ 아직 끝나지 않았다", sv.done === false && sv.remaining > 0);
t("⑥ 답한 것이 없다", sv.answered.length === 0);

// (10) 분모를 주지 않는다 — 질문 수가 답에 따라 변해서 "3/17"이 거짓말이 된다
const 분모후보 = ["total", "totalQuestions", "count", "all", "progress", "percent", "of"];
t(
  "⑩ 뷰모델에 총 질문 수(분모)에 해당하는 필드가 없다",
  분모후보.every((k) => !(k in sv)),
  Object.keys(sv).join(", ")
);
t("⑩ 남은 수만 준다", typeof sv.remaining === "number");

// (7) 레퍼런스 케이스 — 오피스텔 임차인 / 공용부 발화 / 제조물 의심 미확정
const 답 = {
  residence_possible: false,
  housing_type: "officetel",
  tenure: "renter",
  registered_resident: true,
  insurance_self: false,
  insurance_dwelling: true,
  compensated: false,
  scene_preserved: true,
  powder_present: true,
  wet_appliances: true,
  other_units_affected: false,
  water_damage_home: false,
  water_damage_neighbor: false,
  origin_area: "unknown",
  product_suspected: "unknown",
  report_received: false,
  adjuster_present: false,
  product_maker_contacted: false,
};

// 실제 화면처럼 한 문항씩 답해 나간다. 커서를 쓰지 않으면 항상 첫 미답변이
// 나오므로, 이것이 사용자가 밟는 경로 그대로다.
function 완주(district, fireAt, now) {
  let state = { district, completed: [], fire_at: fireAt };
  const asked = ["q-fire-date"]; // fire_at은 진입에서 답하고 들어온다
  for (let i = 0; i < 40; i++) {
    const view = surveyView({ questions, state, data, now });
    if (!view.current) break;
    asked.push(view.current.id);
    const k = view.current.key;
    state = { ...state, [k]: k in 답 ? 답[k] : view.current.options?.[0]?.value ?? fireAt };
  }
  return { state, asked, view: surveyView({ questions, state, data, now }) };
}

const 전 = 완주("mapo", FIRE, Date.parse(FIRE) + 3 * 36e5);
const 후 = 완주("mapo", FIRE, Date.parse(FIRE) + 8 * 24 * 36e5);
t("⑦ 답을 순서대로 넣으면 done이 된다 (7일 전)", 전.view.done && 전.view.remaining === 0);
t("⑦ 답을 순서대로 넣으면 done이 된다 (7일 후)", 후.view.done && 후.view.remaining === 0);
t(
  "⑦ 7일이 지나면 조사서 수령 질문이 하나 늘어난다",
  !전.asked.includes("q-report") && 후.asked.includes("q-report"),
  `전 ${전.asked.length}개 / 후 ${후.asked.length}개`
);
console.log(`      실측 — 마포 7일 전 ${전.asked.length}개 / 7일 후 ${후.asked.length}개`);
const 양천전 = 완주("yangcheon", FIRE, Date.parse(FIRE) + 3 * 36e5);
const 양천후 = 완주("yangcheon", FIRE, Date.parse(FIRE) + 8 * 24 * 36e5);
console.log(`      실측 — 양천 7일 전 ${양천전.asked.length}개 / 7일 후 ${양천후.asked.length}개`);
t(
  "⑦ 보험금 수령을 보는 구에서는 q-compensated가 늘어난다",
  !전.asked.includes("q-compensated") && 양천전.asked.includes("q-compensated")
);

// (8) D-014 — 질문은 생략하되 값은 남는다
const renter = { ...전.state };
t("⑧ 임차인에게는 q-insurance-dwelling을 묻는다", 전.asked.includes("q-insurance-dwelling"));
const owner = { ...renter, tenure: "owner" };
const ownerView = surveyView({ questions, state: owner, data, now: NOW });
const 보임 = (view, id) => view.answered.some((a) => a.id === id) || view.current?.id === id;
t(
  "⑧ tenure를 owner로 되돌리면 q-insurance-dwelling이 목록에서 빠진다",
  !보임(ownerView, "q-insurance-dwelling")
);
t(
  "⑧ 그래도 그 답은 state에 남는다 (D-014)",
  owner.insurance_dwelling === true,
  JSON.stringify(owner.insurance_dwelling)
);

// 커서 — 답한 질문을 다시 열 수 있다
const 되열기 = surveyView({ questions, state: 전.state, data, now: NOW, cursor: "q-tenure" });
t("커서로 답한 질문을 다시 연다", 되열기.current?.id === "q-tenure");
t("다시 열어도 이전 답이 실려 있다", 되열기.current?.answer === "renter");
// 뒤로가기는 커서 기준 앞 질문이다. answered의 마지막으로 보내면 맴돈다.
t("뒤로가기가 커서 기준 앞 질문을 가리킨다", 되열기.prev?.id === "q-housing-type", 되열기.prev?.id);
const 한번더 = surveyView({ questions, state: 전.state, data, now: NOW, cursor: 되열기.prev.id });
t("한 번 더 뒤로 가면 또 앞으로 간다 (같은 자리를 맴돌지 않는다)", 한번더.prev?.id === "q-residence");
t("첫 질문에서는 뒤로갈 곳이 없다", surveyView({ questions, state: {}, data, now: NOW }).prev === null);

// 목록에서 사라진 질문을 가리키는 커서는 무시하고 첫 미답변으로 떨어진다
const 죽은커서 = surveyView({ questions, state: { district: "mapo" }, data, now: NOW, cursor: "q-report" });
t("보이지 않는 질문을 가리키는 커서는 무시된다", 죽은커서.current?.id === "q-fire-date");

// ── 3. D-015 저장 안내 ─────────────────────────────
section("3. D-015 — 저장이 막힌 브라우저");

// (9) 저장 못 하는 브라우저
const blocked = saveNoticeView({ persisted: false, stage: "survey_first_answer", url: "u", token: "ab3k9m" });
t("⑨ persisted:false면 즉시 띄운다", blocked.show === true);
t("⑨ variant가 blocked다", blocked.variant === "blocked");
t(
  "⑨ '나중에' 액션이 없다",
  !blocked.actions.some((a) => a.id === "later" || /나중에/.test(a.label)),
  JSON.stringify(blocked.actions.map((a) => a.label))
);
t(
  "⑨ 주소 복사와 한 글자씩 보기가 있다",
  blocked.actions.some((a) => a.id === "copy") && blocked.actions.some((a) => a.id === "spell")
);
t(
  "⑨ '주소를 남겼습니다'가 아니라 gated [계속하기]다 (앱은 남겼는지 모른다)",
  blocked.actions.some((a) => a.id === "go" && a.gated === true) &&
    !blocked.actions.some((a) => /남겼/.test(a.label)),
  JSON.stringify(blocked.actions)
);

// 1층 — 결과 화면에 처음 닿았을 때 한 번(D-015)
const 일층 = saveNoticeView({
  persisted: true,
  stage: "result_first",
  url: "u",
  token: "ab3k9m",
  canShare: true,
});
t("1층은 결과 첫 도달에서 열린다", 일층.show === true && 일층.variant === "saved");
// **[나중에]를 뺐다**(사용자 실기기 검수 결정). 없어도 갇히지 않는다 —
// HOME을 떠나면 이 블록이 사라진다(app.js가 화면으로 판단한다).
// 남는 것은 공유와 복사 둘뿐이고, 블록 자체가 조용해졌다.
t("1층은 한 줄이다 (제목을 없앴다)", 일층.lines.length === 1, 일층.lines.join(" / "));
t(
  "1층 버튼은 공유와 복사 둘뿐이다",
  일층.actions.map((a) => a.id).join(",") === "share,copy",
  일층.actions.map((a) => a.id).join(",")
);
t("'나중에'와 '한 글자씩 보기'는 1층에 없다",
  !일층.actions.some((a) => a.id === "later" || a.id === "spell"));
t(
  "카톡 보내기는 공유를 지원할 때만 나온다",
  일층.actions.some((a) => a.id === "share") &&
    !saveNoticeView({ persisted: true, stage: "result_first", canShare: false }).actions.some(
      (a) => a.id === "share"
    )
);
t("2층은 이 박스를 쓰지 않는다", saveNoticeView({ persisted: true }).show === false);

// 문구 정정 4건 (승인됨)
// 브랜드는 2층이다 — 서비스명과 설명이 각자 자리를 갖는다(D-023).
t(
  "서비스명과 설명이 따로 있다",
  COPY.brand === "일상으로" && COPY.descriptor === "화재피해 회복 내비게이션",
  `${COPY.brand} / ${COPY.descriptor}`
);
t(
  "token_invalid에서 사용자 탓 어조를 뺐다",
  COPY.banner.token_invalid === "이 주소로는 저장된 기록을 찾지 못해 새로 시작합니다.",
  COPY.banner.token_invalid
);
t(
  "미판정 계열 명칭이 '아직 확인 못 함' 하나다",
  STATUS_LABEL.미판정 === "아직 확인 못 함" && COPY.undetermined.label === "아직 확인 못 함",
  `${STATUS_LABEL.미판정} / ${COPY.undetermined.label}`
);
t(
  "화면 어디에도 '미판정'·'해당 여부 확인 필요'가 남아 있지 않다",
  !/미판정|해당 여부 확인 필요/.test(
    JSON.stringify(COPY) + JSON.stringify(Object.values(STATUS_LABEL))
  )
);

// 고지문 — **지금 화면에 자리가 없다.** 옛 근거 페이지 하단에 있었는데
// 확정 IA에 그 페이지가 없다. 임의로 새 자리를 만들지 않았고 문구는
// 남겨 두었다(보고 대상). D-002 보관 고지는 푸터 한 줄로 살아 있다.
//
// D-006의 "말하지 않는 것"이 사용자 언어로 들어 있는가
// 고지문은 **하는 것 두 줄 + 저장·출처**로 줄였다(마무리 수정).
// 면책 목록은 읽는 사람을 방어적으로 만들 뿐 행동을 돕지 않는다 —
// 경계는 안내 본문 안에서 지킨다(조례 카드의 "구청이 확정합니다").
t("고지문에 면책 목록이 없다", COPY.notice.doesNot === undefined);
t("하는 것 두 줄은 남는다", COPY.notice.does.length === 2);
t(
  "'그대로 읽어'를 뺐다",
  COPY.notice.does[1] === "자치구 지원은 조례 원문을 정리한 것입니다.",
  COPY.notice.does[1]
);
t("고지문이 보관 기간을 고지한다 (D-002)", /90일/.test(COPY.notice.storage));
t("고지문이 해외 출처 인용을 밝힌다", /해외 기준/.test(COPY.notice.sources));



// 절대 쓰면 안 되는 문구 — v1에서 거짓이다(D-015)
const 문구 = readFileSync(join(D, "src/ui/copy.js"), "utf8").replace(/\/\/.*$/gm, "");
t(
  "'다른 기기에서도 이어서 보실 수 있습니다'가 문구에 없다",
  !/다른 기기에서도/.test(문구)
);

// ── 5. 행 계약 ─────────────────────────────────────
section("5. 행 계약 — 결과 화면 여섯이 같은 행을 읽는다");

const 판정 = (state, now = NOW) => evaluate(applyDefaults(questions, state, now), data, now);
// 체크리스트 **자리표** — 완료를 지운 가정으로 엔진을 한 번 더 돌린다.
// app.js가 하는 것과 같은 경로다(뷰모델이 아니라 부르는 쪽이 만든다).
const 자리 = (state, now = NOW) =>
  evaluate(applyDefaults(questions, { ...state, completed: [] }, now), data, now);
const 바탕 = (state, now = NOW) =>
  resultBase({ result: 판정(state, now), orderResult: 자리(state, now), state, data, now });
const 결과 = (state, now = NOW) =>
  resultView({ result: 판정(state, now), orderResult: 자리(state, now), state, data, now });

{
  const b = 바탕(전.state);
  const 필수 = [
    "id", "title", "summary", "body", "group", "category", "irreversible", "guidanceType",
    "sourceUrl", "sourceGrade", "checkedAt", "sources", "ordinanceName", "ordinanceArticle",
    "ordinanceCheckedAt", "ordinanceBased", "when", "rank", "locked", "checkable",
    "blockedBy", "blocksReason", "status", "statusIfPending", "reason", "dept",
    "amountKnown", "waitDays", "deadlineDays", "completedAt",
  ];
  t(
    "모든 행이 같은 키를 싣는다 (값이 없으면 null이지 키가 빠지지 않는다)",
    b.all.every((r) => 필수.every((k) => k in r)),
    필수.filter((k) => !(k in b.all[0])).join(",")
  );
  t("행이 하나 이상 있다", b.all.length > 0, String(b.all.length));
  t("섹션 행은 자기가 어느 섹션인지 안다", b.sections.every((r) => typeof r.section === "string"));
  t("버킷 행에는 rank가 없다", [...b.waiting, ...b.blocked, ...b.excluded].every((r) => r.rank === null));
}

// 잠긴 행의 선행이 이 사람 화면에 있는가 — 레퍼런스 케이스가 그 경계다.
{
  const b = 바탕(전.state);
  const 잠긴 = b.all.filter((r) => r.blockedBy.length);
  t("선행이 있는 행이 있다", 잠긴.length > 0, String(잠긴.length));
  t("leadTo는 화면에 실제로 있는 선행만 가리킨다",
    잠긴.every((r) => !r.leadTo || b.byId.has(r.leadTo.id)));
  t("선행이 하나도 없을 때만 leadMissing이다",
    잠긴.every((r) => r.leadMissing === (r.leadTo === null)));
  t("scene_preserved=true인 사람에게 scene-release는 안 뜬다 (알려진 사각)",
    !b.byId.has("scene-release") && 전.state.scene_preserved === true);
}

// 출처 재료 — sources는 콘텐츠 패스가 하나씩 채우고 조례는 자치구에서 온다(커밋 3).
{
  const 양천 = 바탕({ ...전.state, district: "yangcheon" });
  t("모든 행이 sources 배열을 실어 나른다", 양천.all.every((r) => Array.isArray(r.sources)));
  // 콘텐츠 패스가 원문을 열어 확인한 만큼 채웠다(35/59). 나머지는 legacy
  // URL만 있거나 URL조차 없는 것들이고, **채우지 못한 것을 지어내지 않는다.**
  const 채운행 = 양천.all.filter((r) => r.sources.length);
  t("채워진 출처가 화면에 있다", 채운행.length > 0, String(채운행.length));
  t("채워진 항목은 문서명을 갖는다", 채운행.every((r) => typeof r.sources[0].title === "string"));
  t("아직 빈 것도 있다 (지어내지 않는다)", 양천.all.some((r) => !r.sources.length));
  const 조례행 = 양천.all.filter((r) => r.ordinanceBased);
  t("조례 행이 있다 (양천)", 조례행.length > 0, String(조례행.length));
  t(
    "조례 행이 조례 이름과 조문을 실고 있다",
    조례행.every((r) => typeof r.ordinanceName === "string" && /^제\d+조/.test(r.ordinanceArticle || "")),
    조례행.map((r) => `${r.id}=${r.ordinanceArticle}`).join(" | ")
  );
  t(
    "조례가 아닌 행은 그 재료가 null이다",
    양천.all.filter((r) => !r.ordinanceBased).every((r) => r.ordinanceName === null && r.ordinanceArticle === null)
  );
  // 자치구를 안 고른 사람은 조례 이름을 알 수 없다 — 그래도 죽지 않는다.
  const 구없음 = 바탕({ ...전.state, district: undefined });
  t("자치구 미지정에서도 행이 만들어진다", Array.isArray(구없음.excluded) && 구없음.all.length > 0);
  t("자치구 미선택 미판정은 그 사실을 표시한다",
    구없음.excluded.filter((r) => r.status === "미판정").every((r) => r.needsDistrict === true));
}

// 완료 — 기록이 없다고 완료가 아닌 것은 아니다.
{
  const b = 바탕({ ...전.state, completed: ["photo-before-cleanup"] });
  t("완료한 행은 done으로 간다", b.done.some((r) => r.id === "photo-before-cleanup"));
  t("완료 행의 status가 '완료'다", b.done.every((r) => r.status === "완료"));
  t("완료가 아니었다면 무엇이었을지가 남는다", b.done.every((r) => r.statusIfPending != null));
}


// ── 6. 연락처 — 보류 중인 모듈 ─────────────────────
section("6. 연락처 — 라우팅에서 분리했고 판단은 살아 있다");

// 연락처 화면 — **보류가 풀렸다**(사용자 결정). 목록은 data/directory.json이고
// 화면은 그것을 그룹 순서대로 그린다. 옛 `contacts.js`(하드코딩 번호 셋)는
// 이 커밋에서 걷혔다.
{
  const dv = directoryView(바탕(전.state));
  // 전역 9 + 그 구의 관할 소방서 1.
  t("연락처가 전역 9건 + 소방서 1줄이다", dv.count === 10, String(dv.count));
  // 심리 그룹이 둘이다 — 재난 전용(1670-9512)과 급성 위기(1577-0199).
  t("심리 그룹이 둘이다",
    dv.groups.find((g) => g.group === "심리").items.length === 2);
  t(
    "그룹 순서가 긴급 → 복지 → 법률 → 심리다",
    dv.groups.map((g) => g.group).join(" → ") === "긴급 → 복지·긴급지원 → 법률·분쟁 → 심리",
    dv.groups.map((g) => g.group).join(" → ")
  );
  t("네 그룹이 다 있다", dv.groups.length === 4);
  t("전부 tel: 링크를 만든다", dv.groups.every((g) => g.items.every((c) => c.telHref === `tel:${c.tel}`)));
  t("'검증됨'·'공식 인증' 같은 과장이 없다", !/검증됨|공식 인증/.test(JSON.stringify(dv)));

  // 자치구 줄 — **그 구의 관할 소방서 화재조사 직통.** 옛 구청 부서 줄을
  // 대신한다: 구청 대표번호는 걸면 120으로 연결되어 도달점이 같고,
  // 이 사람이 지금 물어야 하는 것은 그쪽이 답하지 않는다.
  t("소방서 줄이 있다", dv.district !== null && /소방서 화재조사$/.test(dv.district.org),
    JSON.stringify(dv.district));
  t("소방서 줄에 번호와 tel: 링크가 있다",
    /^\d{2}-\d{3,4}-\d{4}$/.test(dv.district.tel) &&
      dv.district.telHref === `tel:${dv.district.tel}`);
  t("보조 한 줄이 확정 문구다",
    dv.district.note === "화재증명원 발급·조사 진행 문의 (주간)", dv.district.note);
  // 중구만 관할 이름이 다르다.
  const dvJung = directoryView(바탕({ ...전.state, district: "jung" }));
  t("중구는 중부소방서다", dvJung.district.org === "중부소방서 화재조사", dvJung.district.org);
  // 구를 안 골랐으면 줄 자체가 없다 — 없는 것은 없다.
  const dv무구 = directoryView(바탕({ ...전.state, district: undefined }));
  t("구를 안 골랐으면 소방서 줄이 없다", dv무구.district === null);
  // 옛 구청 부서 카피는 걷혔다.
  t("구청 부서 카피가 없다",
    !("deptUnknown" in COPY.contacts) && !("viaMain" in COPY.contacts) &&
      !("deptNote" in COPY.contacts));
  // 번호도 링크도 없는 문장 하나.
  t("민간 구호 문장이 있다",
    dv.relief.includes("지자체를 통해 전달됩니다") && dv.relief.includes("동주민센터"),
    dv.relief);
  t("민간 구호 문장에 번호가 없다", !/\d{3,4}-\d{3,4}/.test(dv.relief));
}

// 근거 법령 화면 — 그 사람 안내들의 sources를 묶는다. **재판정하지 않는다.**
{
  const 물 = 바탕({ ...전.state, district: "gangnam", water_damage_home: true, residence_possible: false });
  const sv = sourcesView(물);
  t("근거가 하나 이상 있다", sv.count > 0, String(sv.count));
  t("그룹 키가 어휘 안에 있다",
    sv.groups.every((g) => ["law", "public_guidance", "case", "academic"].includes(g.key)),
    sv.groups.map((g) => g.key).join(","));
  // ★ **해외를 라벨에 밝힌다**(사용자 결정). 이 그룹의 12건 중 5건이
  //   US EPA·American Red Cross다 — `공공기관 안내`라고만 하면 국내 기관의
  //   안내로 읽히고, 그것은 근거의 출처를 잘못 말하는 것이다.
  t("공공기관 그룹이 해외를 밝힌다",
    COPY.sourceList.groups.public_guidance === "공공기관의 안내(해외포함)",
    COPY.sourceList.groups.public_guidance);
  {
    const 공공 = sv.groups.find((g) => g.key === "public_guidance");
    const 발행처 = (공공?.items ?? []).flatMap((i) => i.entries.map((e) => e.publisher));
    t("실제로 해외 출처가 그 그룹에 있다 (라벨이 사실이다)",
      발행처.some((p) => /EPA|Red Cross/.test(p ?? "")), 발행처.join(" | "));
    t("그룹 라벨이 뷰모델에도 실린다", 공공?.label === "공공기관의 안내(해외포함)", 공공?.label);
  }
  const law = sv.groups.find((g) => g.key === "law");
  t("법령 그룹이 있다", Boolean(law));
  t("법령은 제목별로 묶인다 (같은 법이 두 줄로 안 선다)",
    law.items.length === new Set(law.items.map((i) => i.title)).size);
  // **조문이 없는 법령은 조문 없이 그린다** — 없는 조문을 만들지 않는다.
  const 무조문 = law.items.flatMap((i) => i.entries).filter((e) => e.article === null);
  t("조문 없는 줄이 있어도 죽지 않는다", 무조문.every((e) => e.url !== undefined));
  t("모든 줄이 그 근거를 쓰는 안내를 싣는다",
    sv.groups.every((g) => g.items.every((i) => i.entries.every((e) => e.actions.length > 0))));
  // 자치구 조례 — 맨 위. **원문 링크를 걸지 않는다.**
  t("자치구 조례 그룹이 있다", sv.ordinance !== null && sv.ordinance.title.includes("강남구"));
  t("조례에는 원문 링크가 없다", sv.ordinance.entries.every((e) => e.url === null && e.link === null));
  t("조례 조문이 '제N조'로 시작한다", sv.ordinance.entries.every((e) => /^제\d+조/.test(e.article)));
  // sources가 빈 안내는 여기 안 나온다 — "없는 것은 없다".
  const 실린 = new Set(sv.groups.flatMap((g) => g.items.flatMap((i) => i.entries.flatMap((e) => e.actions.map((a) => a.id)))));
  t("sources가 빈 안내는 이 화면에 없다",
    [...실린].every((id) => (물.byId.get(id)?.sources || []).length > 0));
  t("빠진 것을 세어 보여주지 않는다", !/못 채운|미확인|없음 \d/.test(JSON.stringify(sv)));
}

// ── 화면 코드의 위생 ───────────────────────────────
// 누수 탐지와 같은 방식으로 본다 — 주석에 낱말이 나오는 것까지 막을
// 필요는 없다.
const 코드만 = (f) =>
  readFileSync(join(D, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
t(
  "화면 코드가 저장소를 직접 만지지 않는다",
  ["src/ui/app.js", "src/ui/render.js", "src/ui/screens.js", "src/ui/recovery.js"]
    .filter((f) => existsSync(join(D, f)))
    .every((f) => !/localStorage|sessionStorage|document\.cookie/.test(코드만(f)))
);
// 랜딩이 canvas 픽셀을 읽지 않는다 — 못 읽는 환경이 있었다.
t("랜딩이 getImageData에 의존하지 않는다", !/getImageData/.test(코드만("src/ui/screens.js")));
// 첫 탭이 저장을 기다리다 소진되면 첫 화면에 갇힌다.
t(
  "랜딩 통과가 once로 한 번만 살아 있지 않다",
  !/once:\s*true/.test(코드만("src/ui/screens.js"))
);
// 전환이 먼저다 — 화면을 옮긴(move) 뒤에 persist가 온다. **랜딩을
// 떠나는 문이 둘**(CTA · 저장 기록 바로가기)이라 절차를 한 함수에 모았고,
// 검사도 그 함수를 본다.
{
  const src = 코드만("src/ui/app.js");
  const body = src.slice(src.indexOf("function leaveLanding"));
  const 끝 = String.fromCharCode(10) + "}";
  const 본문 = body.slice(0, body.indexOf(끝));
  t(
    "랜딩 통과는 저장을 기다리지 않는다 (화면 이동 뒤에 persist)",
    본문.indexOf("move()") >= 0 && 본문.indexOf("move()") < 본문.indexOf("persist()")
  );
  t(
    "랜딩을 떠나는 두 문이 같은 절차를 지난다",
    /async function passLanding\(\)\s*\{\s*await leaveLanding\(routeGo\)/.test(src) &&
      /async function resumeSaved\(\)[\s\S]{0,200}await leaveLanding\(routeGo\)/.test(src)
  );
  // ★ **되돌아가기도 `route()`를 지난다.** 곧장 타임라인으로 보내면 화재
  //   7일이 지나 새로 생긴 조사서 질문을 건너뛰고, 그 답으로 열리는
  //   `조사서가 나온 뒤` 블록이 잠긴 채인 화면에 도착한다(D-023 §5).
  t(
    "되돌아가기가 도착 화면으로 직행하지 않는다 (남은 질문을 건너뛰지 않는다)",
    !/resumeSaved\(\)[\s\S]{0,300}go\(\{ screen: "timeline" \}\)/.test(src)
  );
  // ★ 날짜를 안 만진 사람의 fire_at은 [다음]을 누른 순간 정해진다.
  //   그 근사도 **같은 함수**를 지나야 규칙이 한 곳에 남는다 — 여기서
  //   `T12:00:00`을 다시 조립하면 오늘도 정오가 되어 규칙이 갈린다.
  t(
    "확인 시점의 근사도 fireAtOf를 지난다",
    /fireAtOf\(inputValue, null\)/.test(src) && !/inputValue\}T12:00:00/.test(src)
  );
  // 날짜와 시각을 쓰는 길이 하나여야 미래 저장을 한 곳에서 막을 수 있다.
  t(
    "날짜·시각은 setDay 한 문으로만 쓴다",
    /function setDay\(day, hour\)[\s\S]{0,200}keepHour\(day, hour\)/.test(src)
  );
}


// ── 연출이 안 돌아도 화면은 남는가 (실기기 사고 재발 방지) ──────
//
// 실기기에서 인트로 글자가 통째로 안 보였다. 새 마크업 + 캐시에 남은 옛
// tokens.css 조합에서 `var(--delay-*)`가 안 풀렸고, **var 하나가 해석되지
// 않으면 그 선언 전체가 무효**라 animation이 사라졌다 — opacity:0으로
// 시작하던 글자가 영원히 나타나지 않았다.
//
// 그래서 규칙 셋을 코드로 박는다. 눈으로 지킬 수 있는 종류가 아니다.
{
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8");
  // @keyframes를 걷어낸 나머지가 "요소의 기본 스타일"이다. 두 겹 중첩까지.
  const 기본 = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const 인트로 = 기본
    .slice(기본.indexOf(".intro {"), 기본.indexOf("/* ── 셸"))
    .replace(/\/\*[\s\S]*?\*\//g, "");

  t("랜딩 기본 상태에 opacity:0이 없다 (연출 없이도 보인다)", !/opacity:\s*0\s*;/.test(인트로));
  t("숨겼다 되돌리는 forwards를 쓰지 않는다", !/forwards/.test(인트로));
  // 시각 FINAL에서 등장 연출이 통째로 폐기됐다(사진 배경이 대신한다).
  // **검사는 남긴다** — 연출이 다시 들어오면 그 순간부터 폴백을 요구한다.
  // 폴백이 없으면 토큰 하나가 빠지는 순간 선언이 통째로 무효가 되고,
  // 그것이 인트로 글자가 영원히 안 보였던 사고의 뿌리였다.
  const anim = 인트로.match(/animation[^;]*;/g) || [];
  t(
    `랜딩 animation의 var에 전부 리터럴 폴백이 있다 (${anim.length}개 선언)`,
    anim.every((a) => !/var\(--[a-z0-9-]+\)/.test(a)),
    anim.join(" | ")
  );
  // 사진이 안 떠도 화면은 남아야 한다 — 배경을 콘텐츠의 전제로 만들지 않는다.
  t("사진이 없어도 바탕색과 글자색이 있다",
    /\.intro\s*\{[^}]*background:[^;]*--c-landing-bg/.test(인트로) &&
      /\.intro\s*\{[^}]*color:[^;]*--c-landing-ink/.test(인트로));
  // 옛 tokens.css가 캐시에 남아 있으면 새 토큰이 안 풀린다. 폴백이 유일한
  // 방어다. **연출에 쓰는 var가 안 풀리면 선언 전체가 무효**가 되고, 그것이
  // 인트로 글자가 통째로 사라졌던 사고의 뿌리였다.
  //
  // 라이트 전환에서 `--c-cta`가 목록에서 빠졌다 — 이제 인트로 밖
  // (.btn--primary)에서도 쓰이는 일반 토큰이고, 그쪽은 값이 안 풀려도
  // 배경색만 빠질 뿐 글자가 남는다. 대신 인트로 전용 색을 전부 넣어
  // 검사를 좁히는 대신 촘촘하게 했다.
  const 신설 = [
    "--c-landing-bg", "--c-landing-ink", "--c-landing-ink-soft", "--c-landing-ink-dim",
    "--c-landing-ink-faint", "--c-veil-top-0", "--c-veil-bottom-2", "--c-landing-shadow",
    "--f-landing-title", "--f-landing-sub", "--f-landing-cta", "--s-landing-edge",
    "--ls", "--ls-tight",
  ];
  t(
    "랜딩 전용 토큰은 어디서도 폴백 없이 쓰이지 않는다",
    신설.every((v) => !css.includes(`var(${v})`)),
    신설.filter((v) => css.includes(`var(${v})`)).join(", ")
  );
}
// ── 새 화면이 두 사고를 다시 부르지 않는가 (커밋 4-② self-check) ──
//
// 지난 두 사고가 전부 이 계층이었다. 화면을 통째로 갈아엎을 때 가장 쉽게
// 되돌아오는 자리라 규칙의 존재를 코드로 박는다.
{
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8");

  // ① 3a93c53 — 작성자의 display가 브라우저 기본 [hidden]{display:none}을
  //    이겨 화면 전환(el.hidden)이 통째로 죽었다. 새 화면에도 display를
  //    쓰는 곳이 많으므로(카드 flex·주제 grid) **display를 !important로
  //    선언하는 곳이 [hidden] 하나뿐인지**까지 본다 — 규칙이 있어도 더 센
  //    선언이 하나 생기면 그대로 무너진다.
  const 강제 = [...css.matchAll(/([^{}]+)[{][^{}]*display:[ ]*[^;}]*!important/g)].map((m) =>
    m[1].trim().split(String.fromCharCode(10)).pop().trim()
  );
  t(
    `display를 !important로 선언하는 곳이 [hidden] 하나뿐이다 (${강제.length}건)`,
    강제.length === 1 && 강제[0] === "[hidden]",
    강제.join(" | ")
  );

  // ② cc6a865 — var 하나가 안 풀려 animation 선언이 무효가 됐고, opacity:0으로
  //    시작하던 글자가 영원히 나타나지 않았다. **기본 상태는 보이는 것**이
  //    화면 전체의 규칙이지 인트로만의 규칙이 아니다.
  const 기본상태 = css.replace(/@keyframes[^{]*[{](?:[^{}]*[{][^{}]*[}])*[^{}]*[}]/g, "");
  const 숨김 = 기본상태.match(/opacity:[ ]*0[ ]*[;}]/g) || [];
  t(`@keyframes 밖에 opacity:0이 없다 (${숨김.length}건)`, 숨김.length === 0, 숨김.join(" "));
  t("숨겼다 되돌리는 forwards가 어디에도 없다", !/forwards/.test(css));

  // ③ 표시가 연출의 **완료**에 걸리면 연출이 안 도는 순간 콘텐츠가 사라진다.
  //    선택 피드백(150~250ms)도 animationend가 아니라 시계로 잰다.
  const 그리기 = ["src/ui/app.js", "src/ui/screens.js", "src/ui/recovery.js", "src/ui/render.js"];
  t(
    "표시 여부를 연출의 끝(animationend·transitionend)에 걸지 않는다",
    그리기.every((f) => !/animationend|transitionend/.test(코드만(f)))
  );
}

// ── 시각이 tokens.css 하나인가 ──────────────────────
//
// 색·글꼴을 마크업·JS·다른 CSS에 적으면 시안이 바뀔 때 그 파일들을 전부
// 찾아다녀야 하고, 하나를 놓치면 화면 안에서 팔레트가 갈라진다. 규칙은
// 처음부터 있었지만 지키는지 보는 눈은 없었다 — 라이트 전환처럼 색을
// 통째로 갈아끼우는 작업이 이 검사를 필요하게 만들었다.
//
// **`var(--x, 리터럴)`의 폴백은 하드코딩이 아니다.** 그쪽은 오히려 규칙이
// 요구하는 것이다(위 재발 방지 검사 참고).
{
  const 색 = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
  const 벗기기 = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/var\(\s*--[a-z0-9-]+\s*,[^()]*(?:\([^()]*\))?[^()]*\)/g, " ");
  const 대상 = [
    "src/ui/app.css", "src/ui/app.js", "src/ui/screens.js", "src/ui/recovery.js",
    "src/ui/render.js", "src/ui/copy.js", "index.html",
  ];
  for (const f of 대상) {
    const hits = 벗기기(readFileSync(join(D, f), "utf8")).match(색) || [];
    t(`${f}에 토큰 밖 색이 없다`, hits.length === 0, hits.slice(0, 8).join(" "));
  }
  // 폰트도 마찬가지다. font-family를 화면 코드에 적으면 폴백 체인이 갈라진다.
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8");
  t("app.css가 font-family를 직접 적지 않는다", !/font-family\s*:/.test(css));
}

// ── 문의처 ─────────────────────────────────────────
//
// 15df99e에서 세운 `contacts[]`를 화면에 연결했다(보류 해제).
// **Action 상세에만, 1차 문의처 하나.** 목록 카드에는 없다.
{
  const 물 = 바탕({ ...전.state, district: "gangnam", residence_possible: false });
  const 있는것 = 물.all.filter((r) => (r.contacts || []).length);
  t("행이 contacts를 실어 나른다", 물.all.every((r) => Array.isArray(r.contacts)));
  t("연락처가 있는 행이 화면에 있다", 있는것.length > 0, String(있는것.length));

  const c = contactOf(있는것[0]);
  t("문의처 라벨이 '문의처'다", c.label === "문의처");
  t("기관명이 있다", typeof c.org === "string" && c.org.length > 0, String(c.org));
  t("tel: 링크를 만든다", c.tel === null || c.telHref === `tel:${c.tel}`, String(c.telHref));
  // **없는 번호를 만들지 않는다.** 비면 줄 자체가 없다.
  const 없는것 = 물.all.filter((r) => !(r.contacts || []).length);
  t("연락처가 없으면 null이다 (줄을 안 그린다)",
    없는것.length > 0 && 없는것.every((r) => contactOf(r) === null));
  t("빈 배열에도 죽지 않는다", contactOf({ contacts: [] }) === null && contactOf({}) === null);
  t("'검증됨'·'공식 인증' 같은 과장이 없다", !/검증됨|공식 인증/.test(JSON.stringify(c)));

  // Action 상세가 그 줄을 싣는다. 다른 화면은 안 싣는다.
  const ad = actionDetailView(물, 있는것[0].id);
  t("Action 상세가 문의처를 싣는다", ad.contact !== null && ad.contact.org === c.org);
  const 목록 = topicDetailView(물, 있는것[0].group);
  t("목록 카드에는 문의처가 없다", 목록.items.every((i) => !("contact" in i)));
}

// ── 한국어가 한 글자씩 세로로 떨어지지 않는가 ───────
//
// 실기기에서 카드 제목이 **한 글자 열**로 렌더됐다. 원인이 둘이었다.
//
//   ① `.card { overflow-wrap: anywhere }` — anywhere는 요소의 min-content
//      폭을 한 글자까지 줄인다. flex 아이템은 기본 `min-width: auto`
//      (=min-content)라, 옆 형제가 폭을 요구하면 제목이 1글자로 짜부라진다
//   ② 주제 상세 카드가 출처 줄을 제목의 **형제**로 붙이는데 `.card`가
//      row라 둘이 좌우로 섰다 — ①의 방아쇠였다
//
// 눈으로만 지킬 수 없어서 규칙을 코드로 박는다.
{
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const cardRule = css.slice(css.indexOf(".card {"), css.indexOf("}", css.indexOf(".card {")));
  t("카드가 어절 단위로 끊는다 (keep-all)", /word-break:\s*keep-all/.test(cardRule), cardRule);
  t(
    "카드에 overflow-wrap: anywhere가 없다 (한 글자 열의 원인)",
    !/overflow-wrap:\s*anywhere/.test(cardRule),
    cardRule
  );
  // 긴 URL만은 예외다 — 안 끊으면 카드를 밀고 나간다.
  t("URL 자리에는 anywhere가 남아 있다", /\.src__link[^{]*\{[^}]*overflow-wrap:\s*anywhere/.test(css));
  // 출처 줄을 가진 카드는 세로로 쌓인다.
  t("card--stack이 세로 방향이다", /\.card--stack\s*\{[^}]*flex-direction:\s*column/.test(css));
}

// ── 웹폰트가 실재하는가 ─────────────────────────────
//
// @font-face가 없는 파일을 가리키면 브라우저는 조용히 폴백으로 넘어간다.
// 화면은 멀쩡해 보이고 디자인만 어긋난다 — 눈으로 잡기 어려운 종류다.
{
  const tk = readFileSync(join(D, "src/ui/tokens.css"), "utf8");
  const srcs = [...tk.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  t("@font-face가 둘이다 (400 · 700)", srcs.length === 2, srcs.join(" "));
  t(
    "가리키는 woff2 파일이 실제로 있다",
    srcs.every((u) => existsSync(join(D, "src/ui", u))),
    srcs.filter((u) => !existsSync(join(D, "src/ui", u))).join(" ")
  );
  t("라이선스 파일을 함께 둔다", existsSync(join(D, "assets/fonts/LICENSE-NanumSquare.txt")));
  // 폰트가 늦어도 글자는 먼저 보여야 한다. 이 서비스에서 빈 화면은
  // "안 열리는 앱"으로 읽힌다.
  const 선언만 = tk.replace(/\/\*[\s\S]*?\*\//g, " ");
  t("두 @font-face 다 font-display: swap이다", (선언만.match(/font-display:\s*swap/g) || []).length === 2);
  t("외부 CDN에서 폰트를 받지 않는다", !/@import|https?:\/\//.test(tk));
}

// ── hidden이 살아 있는가 ────────────────────────────
//
// 화면 전환은 전부 `el.hidden = true/false`다. 그런데 hidden은 브라우저
// 기본 `[hidden]{display:none}`에 기대는데, **작성자의 display 선언이
// 그것을 이긴다** — `.intro{grid}`·`.flow{flex}`·`.deck{flex}`가 있으니
// 세 요소에서 hidden이 통째로 죽어 있었다. 실기기에서 났다: 인트로를
// 통과해도 오버레이(fixed·inset:0·z-index:20)가 남아 설문을 덮었고,
// 재방문에서는 빈 인트로의 배경 그라데이션만 보였다.
// 눈으로 지킬 수 있는 종류가 아니라서 규칙의 존재를 검사로 박는다.
{
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  t(
    "[hidden]을 어떤 display보다 위에 두는 규칙이 있다",
    /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css)
  );
  // ★ **레이아웃 점프 금지**(사용자 결정). `.intro__actions`는 바닥 기준으로
  //   위로 자라는 블록이라, 랜딩 보조 버튼이 흐름 안에 있으면 있고 없음에
  //   따라 [회복 시작하기]가 위아래로 밀린다. 흐름 밖에 세우는 것이
  //   그 약속을 지키는 방법이고, 눈으로는 한쪽 상태만 보게 되니 검사로 박는다.
  {
    const 규칙 = (css.match(/\.intro__resume\s*\{[^}]*\}/) || [""])[0];
    t(
      "랜딩 보조 버튼이 흐름 밖에 선다 (CTA 자리가 안 튄다)",
      /position:\s*absolute/.test(규칙) && /bottom:\s*100%/.test(규칙),
      규칙.replace(/\s+/g, " ")
    );
    t(
      "보조 버튼도 탭 목표를 지킨다",
      /min-height:\s*var\(--tap/.test(규칙)
    );
  }
  // ★ **사진 배경의 세 층**(사용자 결정). 전면 베일은 0.50 안팎으로
  //   고정하고 가독은 다른 층이 책임진다 — 대비가 모자랄 때 전면을
  //   올려서 푸는 것을 금지한 것이 이 결정의 핵심이라 값으로 박는다.
  {
    const tok = readFileSync(join(D, "src/ui/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // `--이름: rgba(255, 255, 255, α)`에서 마지막 값만 꺼낸다.
    const α = (name) => {
      const m = tok.match(new RegExp("--" + name + ":[^;]*?([0-9.]+)\\s*\\)"));
      return m ? Number(m[1]) : NaN;
    };
    const 전면 = α("photo-veil");
    const 국소 = α("photo-veil-edge");
    t("전면 베일이 0.45~0.55다", 전면 >= 0.45 && 전면 <= 0.55, String(전면));
    t("국소 보정이 전면보다 진하다", 국소 > 전면, `${전면} / ${국소}`);
    // 합성 = 1-(1-전면)(1-국소). 위아래 글자 자리가 여기서 AA를 얻는다.
    const 합성 = 1 - (1 - 전면) * (1 - 국소);
    t("합성이 0.88 이상이다 (뮤트 4.67 · 브랜드 4.72)", 합성 >= 0.879, 합성.toFixed(3));
  }
  // 화면 가운데는 국소 보정이 닿지 않는다. **행이 스스로 불투명 면을
  // 가져야** 타임라인 글자가 AA를 얻는다 — 반투명이면 글자 뒤가 자리마다
  // 달라진다.
  {
    const 규칙 = (css.match(/\.tline__sum,\s*\.tline__info\s*\{[^}]*\}/) || [""])[0];
    // 면의 **토큰 이름을 박지 않는다** — 흰색이었다가 푸른색이 됐고 또
    // 바뀔 수 있다. 지켜야 하는 것은 "토큰으로 된 불투명한 면"이다.
    const 면토큰 = (규칙.match(/background:\s*var\((--[a-z0-9-]+)\)/) || [])[1];
    t("타임라인 요약 행이 토큰으로 된 면을 갖는다", Boolean(면토큰), 규칙.replace(/\s+/g, " "));
    if (면토큰) {
      const 토큰본문 = readFileSync(join(D, "src/ui/tokens.css"), "utf8");
      const 값 = ((토큰본문.match(new RegExp(면토큰 + ":\s*([^;]+);")) || [])[1] || "").trim();
      t("그 면이 불투명하다 (알파 없는 색이다)", /^#[0-9a-f]{6}$/i.test(값), `${면토큰}: ${값}`);
    }
    t(
      "반투명(rgba·opacity)으로 면을 만들지 않는다",
      !/rgba|opacity/.test(규칙)
    );
  }

  // ── 구간 면이 허브 파랑과 **같은 진하기**인가 (2026-09-02) ────────
  //
  // 사용자 결정 — 구간 다섯의 면이 보라가 됐고, 진하기는 허브 진입
  // 버튼의 파랑과 같아야 한다. **명도를 HSL L이 아니라 상대휘도로 맞췄다**:
  // 같은 L(40.4%)의 보라는 휘도가 0.069로 떨어져 화면에서 눈에 띄게
  // 어둡다(흰 글자 8.8). "같은 진하기로 보이는" 것은 휘도 쪽이다.
  //
  // 값이 하나라도 바뀌면 여기서 걸린다 — 색을 손대는 사람이 대비를
  // 다시 재지 않고 지나가는 것을 막는다.
  {
    const tk = readFileSync(join(D, "src/ui/tokens.css"), "utf8");
    const 값 = (name) =>
      ((tk.match(new RegExp("[-][-]" + name + ":[ ]*(#[0-9a-fA-F]{6})")) || [])[1] || "").toLowerCase();
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const Y = (h) => {
      const [r, g, b] = rgb(h);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const 대비 = (a, b) => {
      const [hi, lo] = [Y(a), Y(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const 면 = 값("c-band-fill");
    const 파랑 = 값("c-entry");
    t("구간 면과 허브 진입 색을 둘 다 읽었다", Boolean(면 && 파랑), 면 + " / " + 파랑);
    t(
      "구간 보라가 허브 파랑과 같은 진하기다 (상대휘도 차 0.01 미만)",
      Math.abs(Y(면) - Y(파랑)) < 0.01,
      Y(면).toFixed(4) + " / " + Y(파랑).toFixed(4)
    );
    t("면 위 글자가 AA다 (4.5 이상)", 대비(면, 값("c-band-ink")) >= 4.5, 대비(면, 값("c-band-ink")).toFixed(2));
    t(
      "면 위 보조 글자가 AA다 (4.5 이상)",
      대비(면, 값("c-band-ink-soft")) >= 4.5,
      대비(면, 값("c-band-ink-soft")).toFixed(2)
    );
    // 사진 배경 위에 서는 면이다 — 화면 바탕과도 갈려야 한다(비텍스트 3:1).
    t("면이 화면 바탕과 갈린다 (3:1 이상)", 대비(면, 값("c-bg")) >= 3, 대비(면, 값("c-bg")).toFixed(2));
    // 점은 면과 **같은 값**이다. 축은 그 연한 쪽이라 값이 다르다.
    t("구간 점이 면과 같은 색이다", 값("c-node") === 면, 값("c-node") + " / " + 면);
    // 대체된 옛 토큰이 남아 있으면 다음 사람이 어느 것이 사는지 못 가린다.
    t("옛 푸른 면 토큰이 지워졌다", !/[-][-]c-band:|[-][-]c-band-line:/.test(tk));
  }

  // 그리는 쪽 — 면만 보라로 바꾸고 글자를 그대로 두면 본문색이 보라 위에
  // 남는다(1.7 : 1). **면과 글자는 한 짝이다.**
  {
    const 공유 = (css.match(/\.tline__sum,\s*\.tline__info\s*\{[^}]*\}/) || [""])[0];
    t("구간 면 위 글자가 토큰으로 흰 계열이다", /color:\s*var\(--c-band-ink\)/.test(공유), 공유.replace(/\s+/g, " "));
    const tline = (css.match(/\.tline[^{]*\{[^}]*\}/g) || []).join(" ");
    t(
      "구간 규칙에 어두운 뮤트가 남아 있지 않다",
      !/--c-ink-soft|--c-ink-faint/.test(tline),
      (tline.match(/[^{;]*--c-ink-(soft|faint)[^;]*/g) || []).join(" | ")
    );
    // 라벨을 가운데 세우는 짝 — 화살표를 흐름 밖으로 뺀다.
    const 화살표 = (css.match(/\.hub__go \.chev\s*\{[^}]*\}/) || [""])[0];
    t(
      "허브 진입 버튼의 화살표가 흐름 밖이다 (라벨이 가운데로 선다)",
      /position:\s*absolute/.test(화살표) && /margin-left:\s*0/.test(화살표),
      화살표.replace(/\s+/g, " ")
    );
    t("그 버튼이 기준점을 갖는다", /\.hub__go\s*\{[^}]*position:\s*relative/.test(css));
  }
  // ★ **타임라인 네 구간의 높이는 한 곳에서 정한다.**
  //
  // `min-height: 56px`가 그 뜻으로 있었는데 **아래 flex 규칙의
  // `min-height: var(--tap)`가 뒤에서 덮어** 죽어 있었다. 그래서 보조 줄이
  // 있는 구간(`오늘`·`화재 발생일`)과 없는 구간(`가까운 시일에`·`계속 확인`)의
  // 높이가 갈렸다. 같은 실수가 다시 나면 여기서 걸린다.
  {
    // `.tline__sum` **단독** 규칙(공유 규칙 뒤에 오는 것들)에는 높이가 없어야
    // 한다 — 뒤에서 덮는 순간 네 구간이 다시 갈린다.
    const 단독 = (css.match(/\.tline__sum\s*\{[^}]*\}/g) || []).join(" ");
    t(
      "단독 규칙이 높이를 다시 덮지 않는다",
      !/min-height/.test(단독),
      단독.replace(/\s+/g, " ").slice(0, 160)
    );
    const 공유 = (css.match(/\.tline__sum,\s*\.tline__info\s*\{[^}]*\}/) || [""])[0];
    t(
      "높이는 두 클래스의 공유 규칙이 정한다",
      /min-height:\s*calc\([^)]*var\(--lh/.test(공유),
      공유.replace(/\s+/g, " ").slice(0, 200)
    );
    // 숫자로 박지 않는다 — 글꼴·행간이 바뀌면 따라와야 한다.
    t("높이를 픽셀로 박지 않는다", !/min-height:\s*\d+px/.test(공유));
  }

  // 보조 뮤트는 합성 0.88에서도 3.73이다 — 사진 위 두 자리에서 한 단계
  // 진해지는 규칙이 있어야 한다.
  t(
    "사진 위에서는 하단 주석·만료 고지가 뮤트다 (보조 뮤트 금지)",
    /\.photo-bg \.foot__line,\s*\.photo-bg \.pg__foot\s*\{\s*color:\s*var\(--c-ink-soft\)/.test(css)
  );
}
{
  const html = readFileSync(join(D, "index.html"), "utf8");
  const refs = html.match(/(?:href|src)="src\/ui\/[^"]+"/g) || [];
  // ★ 값까지 본다. 존재만 보면 "올리는 것을 잊은 배포"를 못 잡는다 —
  //   화면 파일을 고치면서 v를 올리면 **이 줄의 숫자도 함께 올린다.**
  const V = "?v=32";
  t(
    `화면 파일 참조가 전부 ${V}다 (${refs.length}개)`,
    refs.length >= 3 && refs.every((r) => r.includes(V)),
    refs.join(" ")
  );
}

// ── 7. 진입 흐름 (확정 UX) ─────────────────────────
section("7. 진입 흐름 — 랜딩 · 기본 확인 · 질문 MASTER · 전환 · 재방문 게이트");

// 랜딩 — 서비스의 문이다. 기능 목록을 늘어놓는 홈이 아니다.
const lv = landingView({});
t("첫 방문이면 랜딩이 뜬다", lv.show === true);
t("본 적 있으면 안 뜬다", landingView({ intro_seen: true }).show === false);
t("설명(descriptor)이 확정 문구다", lv.eyebrow === "화재피해 회복 내비게이션");
t("서비스명이 확정 문구다", lv.brand === "일상으로");
t(
  "메인 문구가 확정 문구 그대로다",
  lv.lead.join("\n") === "불이 꺼진 뒤,\n다시 일상으로 가는 길을 안내합니다.",
  lv.lead.join(" / ")
);
t("두 줄로 나뉘어 온다 (화면이 줄바꿈을 만들지 않는다)", lv.lead.length === 2);
t("CTA가 확정 문구다", lv.cta === "회복 시작하기");
// ★ **[처음으로]로 온 랜딩에서만 서는 되돌아가기 문**(역할 축소 · 사용자
//   결정). 앞서는 저장 기록만 보고 그렸는데 그 자리 — 재방문자의 첫 화면 —
//   에는 랜딩이 아예 뜨지 않는다(`route()`가 브릿지로 보낸다). 남은 역할은
//   답을 다시 걸으려다 마음이 바뀐 사람을 돌려보내는 것 하나다.
{
  const 있 = landingView({ fire_at: FIRE }, { saved: { token: "t" }, again: "basic" });
  t("[처음으로]로 왔고 저장 기록이 있으면 되돌아가기가 뜬다",
    있.resume === "저장된 회복 경로 보기", 있.resume);
  t("★그냥 랜딩에는 뜨지 않는다 (재설문 중이 아니다)",
    landingView({ fire_at: FIRE }, { saved: { token: "t" } }).resume === null);
  t("저장 기록이 없으면 없다 (없는 것은 없다)",
    landingView({ fire_at: FIRE }, { again: "basic" }).resume === null);
  t("기본 확인을 지나지 않았으면 없다",
    landingView({}, { saved: { token: "t" }, again: "basic" }).resume === null);
  // 저장 판정만큼은 브릿지 것을 그대로 쓴다 — 두 화면이 다른 답을 내면 안 된다.
  t("저장 판정은 브릿지 것과 같다",
    [[{ fire_at: FIRE }, { token: "t" }], [{ fire_at: FIRE }, null], [{}, { token: "t" }]].every(
      ([st, sv]) =>
        (landingView(st, { saved: sv, again: "basic" }).resume !== null) ===
        revisitView({ state: st, saved: sv }).show
    ));
}
t(
  "푸터가 확정 문구다",
  lv.footer === "흩어진 제도와 정보를, 당신의 상황과 시간에 맞게 잇습니다.",
  lv.footer
);
// 글자 리빌은 시각 FINAL에서 폐기됐다 — 사진 배경이 그 자리를 대신한다.
t("글자 리빌 연출이 없다", !("letters" in lv));
// 6단계의 마이크로카피는 확정 랜딩에서 빠졌다. 남아 있으면 확정 화면과 다르다.
t("6단계 마이크로카피가 랜딩에 없다", !("micro" in lv));
t("푸터에 링크가 없다", !("links" in lv));

// 기본 확인 — 날짜와 지역을 한 화면에서. QR 값이 있어도 고칠 수 있어야 한다.
const bc = basicCheckView({ state: { district: "mapo", fire_at: FIRE }, data, now: NOW });
t("라벨·제목·help가 확정 문구다",
  bc.label === "기본 확인" &&
    bc.title === "화재가 있었던 날짜와 지역을 알려주세요" &&
    bc.help === "경과 시간과 지역에 따라 필요한 안내가 달라집니다.");
t("필드 이름이 '화재 발생일'과 '지역'이다", bc.date.label === "화재 발생일" && bc.district.label === "지역");
// `경과 시간`과 `지역`만 굵다. **화면이 문자열을 다시 뒤지지 않게** 조각으로 온다.
t("help가 조각으로 온다", Array.isArray(bc.helpParts) && bc.helpParts.length === 4, JSON.stringify(bc.helpParts));
t(
  "굵은 조각이 '경과 시간'과 '지역' 둘뿐이다",
  bc.helpParts.filter((x) => x.strong).map((x) => x.text).join(",") === "경과 시간,지역",
  bc.helpParts.filter((x) => x.strong).map((x) => x.text).join(",")
);
t("조각을 이으면 원래 문장이다", bc.helpParts.map((x) => x.text).join("") === bc.help);
t("CTA가 '다음'이다", bc.cta === "다음");
t("QR로 들어온 지역이 채워져 있고 이름으로 보인다", bc.district.id === "mapo" && bc.district.name === "마포구");
t("지역은 25개 전수에서 고른다", bc.district.options.length === 25);
t("지역이 가나다순이다",
  bc.district.options[0].name === "강남구" && bc.district.options[24].name === "중랑구",
  `${bc.district.options[0].name} … ${bc.district.options[24].name}`);
t("조례 유무를 선택지에 표시하지 않는다",
  bc.district.options.every((o) => Object.keys(o).join(",") === "id,name"));
t("날짜 입력값이 YYYY-MM-DD다", /^\d{4}-\d{2}-\d{2}$/.test(bc.date.inputValue), bc.date.inputValue);
t("지역을 골랐으면 넘어갈 수 있다", bc.ready === true);
const bc빈 = basicCheckView({ state: {}, data, now: NOW });
t("지역을 안 골랐으면 못 넘어간다", bc빈.ready === false);
// 기본 진입점이 화재 당일이라 날짜는 채워 둔다. 채운 것과 답한 것은 갈린다.
t("날짜는 오늘로 채워져 있다", typeof bc빈.date.value === "string" && bc빈.date.inputValue !== null);
t("채운 날짜를 '답했다'고 세지 않는다", bc빈.date.answered === false && bc.date.answered === true);

// ── 화재 발생 시각 (시간 단위 · 선택) ────────────────
//
// ★ **분은 묻지 않는다.** 시간 단위면 경과 계산에 충분하고, 분까지 고르게
//   하면 모르는 값을 지어내게 만든다. `<input type="time" step="3600">`을
//   쓰지 않는 이유는 iOS가 step을 무시해 분까지 굴리기 때문이다.
t("시각 필드가 확정 문구다",
  bc.time.label === "대략 몇 시쯤이었나요?" && bc.time.help === "모르면 비워두셔도 됩니다.",
  `${bc.time.label} / ${bc.time.help}`);
t("선택지가 24개이고 비울 수 있다",
  bc.time.options.length === 24 && bc.time.empty === "선택 안 함", String(bc.time.options.length));
t("라벨이 오전 0시 ~ 오후 11시다",
  bc.time.options[0].label === "오전 0시" &&
    bc.time.options[12].label === "오후 0시" &&
    bc.time.options[23].label === "오후 11시",
  `${bc.time.options[0].label} … ${bc.time.options[23].label}`);
// ★ **채운 값 ≠ 확인한 값.** 근사로 들어간 시각을 고른 것처럼 보여주면
//   재방문·QR 진입자가 "내가 답했다"고 읽는다(날짜의 answered와 같은 규칙).
t("근사로 채워진 시각은 선택 상태가 아니다",
  bc.time.value === null && bc.time.answered === false, String(bc.time.value));
t("사용자가 고른 시각만 선택 상태다",
  basicCheckView({ state: { district: "mapo", fire_at: FIRE, fire_hour: 15 }, data, now: NOW }).time.value === 15);
t("시각을 비워도 [다음]은 열린다 (선택이다)", bc.ready === true && bc.time.value === null);

// 저장 규칙 — 순수함수 하나가 정한다.
{
  const 정각 = fireAtOf("2026-08-30", 15);
  t("① 시각을 고르면 그 날 그 시 정각이다",
    /T15:00:00/.test(new Date(정각).toLocaleString("sv-SE").replace(" ", "T") + ":00") ||
      new Date(정각).getHours() === 15,
    정각);
  t("① 분·초는 0이다", new Date(정각).getMinutes() === 0 && new Date(정각).getSeconds() === 0);
  // ② 비우면 근사 — **날짜에 따라 갈린다**(사용자 결정).
  //   과거는 그 날의 정오(자정이면 하루가 통째로 더 지난 것처럼 계산된다).
  //   오늘은 **확인하는 그 시각** — 정오로 밀면 아침 진입자의 경과가 음수가
  //   되고, 저녁 진입자는 경과가 과대추정되어 골든타임 항목이 성급히
  //   `missed`로 내려간다(그 항목들이 `irreversible`이라 불가역 거짓음성).
  // 로컬 날짜 문자열. `fireAtOf`가 로컬 시각으로 파싱하므로 여기도 로컬이다.
  const 날 = (ms) => {
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  };
  {
    const 어제 = 날(NOW - 864e5);
    const 오늘 = 날(NOW);
    t("② 과거 날짜는 그 날 정오다", new Date(fireAtOf(어제, null, NOW)).getHours() === 12);
    t("② 오늘은 확인하는 그 시각이다", Date.parse(fireAtOf(오늘, null, NOW)) === NOW,
      fireAtOf(오늘, null, NOW));
    t("② 오늘 근사가 미래로 가지 않는다", Date.parse(fireAtOf(오늘, null, NOW)) <= NOW);
  }
  // ⑤ 아직 오지 않은 시각은 못 고른다.
  {
    const 오늘 = 날(NOW);
    const 지금시 = new Date(NOW).getHours();
    t("⑤ 오늘의 마지막 선택지는 지금 시다", maxHourOn(오늘, NOW) === 지금시);
    t("⑤ 과거 날짜는 23시까지 열린다", maxHourOn("2026-08-25", NOW) === 23);
    t("⑤ 오늘로 되돌리면 아직 안 온 시각은 선택 안 함이 된다",
      keepHour(오늘, 23, NOW) === (지금시 === 23 ? 23 : null), String(keepHour(오늘, 23, NOW)));
    t("⑤ 지금 시는 그대로 남는다", keepHour(오늘, 지금시, NOW) === 지금시);
    t("⑤ 과거 날짜에서는 늦은 시각도 남는다", keepHour("2026-08-25", 23, NOW) === 23);
    // ★ **23시대에는 "아직 안 온 시각"이 없다.** walk는 앱을 실제로 돌려서
    //   그 시간대에 다른 갈래를 밟는데(`안온시 === null`), 그 갈래가 참인지는
    //   여기 순수함수 층에서 못 박는다 — 검사를 밤 11시에 다시 돌려 보지
    //   않아도 되게.
    {
      const 밤 = Date.parse("2026-03-01T23:30:00+09:00");
      const 그날 = 날(밤);
      t("⑤ 23시대에는 24개가 전부 열린다", maxHourOn(그날, 밤) === 23, String(maxHourOn(그날, 밤)));
      t("⑤ 23시대에는 23시가 살아남는다 (미래가 아니다)", keepHour(그날, 23, 밤) === 23,
        String(keepHour(그날, 23, 밤)));
      const 자정 = Date.parse("2026-03-01T00:20:00+09:00");
      t("⑤ 자정 직후에는 0시만 열린다", maxHourOn(날(자정), 자정) === 0, String(maxHourOn(날(자정), 자정)));
      t("⑤ 자정 직후에 23시를 들고 오면 지워진다", keepHour(날(자정), 23, 자정) === null,
        String(keepHour(날(자정), 23, 자정)));
    }
    // 뷰모델도 같은 판정을 싣는다.
    const bcT = basicCheckView({ state: { district: "mapo" }, data, now: NOW });
    t("⑤ 뷰모델이 잠긴 선택지를 표시한다",
      bcT.time.options.filter((o) => o.disabled).length === 23 - 지금시,
      String(bcT.time.options.filter((o) => o.disabled).length));
    t("⑤ 과거 날짜면 잠긴 것이 없다",
      basicCheckView({ state: { fire_at: "2026-08-25T12:00:00.000Z" }, data, now: NOW })
        .time.options.every((o) => !o.disabled));
  }
  // ③ 날짜를 바꿔도 고른 시각은 유지된다 — 조용히 정오로 되돌리지 않는다.
  t("③ 날짜를 바꿔도 고른 시각이 유지된다",
    new Date(fireAtOf("2026-08-25", 15)).getHours() === 15 &&
      new Date(fireAtOf("2026-08-25", 15)).getDate() === 25);
  // ④ '선택 안 함'으로 되돌리면 근사로 복귀.
  t("④ 선택 안 함으로 되돌리면 근사로 복귀한다",
    new Date(fireAtOf("2026-08-25", null)).getHours() === 12);
  t("날짜가 없으면 만들어내지 않는다", fireAtOf(null, 15) === null);
}

// 질문 MASTER 문법 — 모든 질문 화면이 같은 문법을 쓴다.
const mv = masterView({ questions, state: { district: "mapo", fire_at: FIRE }, data, now: NOW });
t("소라벨이 '상황 확인'이다", mv.eyebrow === "상황 확인");
t("하단 한 줄이 확정 문구다", mv.footer === "답변에 따라 당신의 상황에 필요한 질문만 이어집니다.", mv.footer);
t("좌상단이 서비스명이다", mv.brand === "일상으로");
// ★ 분모형 진행률 금지. 조건에 따라 질문 수가 변해서 `3/18`이 거짓말이 된다.
t(
  "MASTER에도 분모가 없다",
  분모후보.every((k) => !(k in mv)) && !("remaining" in mv),
  Object.keys(mv).join(", ")
);
t("화재 발생일은 기본 확인이 가진 질문이다", BASIC_KEYS.includes("fire_at"));
t("설문 첫 질문이 날짜가 아니다", mv.current?.key === "residence_possible", mv.current?.key);
t("첫 질문에서는 설문 안에 뒤가 없다 (기본 확인으로 돌아간다)", mv.atStart === true && mv.back === null);
const mv2 = masterView({ questions, state: 전.state, data, now: NOW, cursor: "q-tenure" });
t("두 번째 질문부터는 [이전]이 있다", mv2.back?.label === "이전" && mv2.atStart === false);
// 탭이 먹혔다는 감각. 그 이상 끌면 멈춘 화면이 된다.
t("선택 피드백이 150~250ms 안이다", SELECT_FEEDBACK_MS >= 150 && SELECT_FEEDBACK_MS <= 250);

// 안내 범위 — 건물 종류가 '그 외'일 때만.
const sc = scopeNoticeView({ housing_type: "other" });
t("'그 외'를 고른 사람에게만 뜬다",
  sc.show === true &&
    scopeNoticeView({ housing_type: "apartment" }).show === false &&
    scopeNoticeView({}).show === false);
t("확인하면 다시 세우지 않는다", scopeNoticeView({ housing_type: "other", scope_ack: true }).show === false);
t("소라벨이 '안내 범위'다", sc.label === "안내 범위");
t("큰 제목이 없는 화면이다", !("title" in sc));
t("본문이 확정된 세 문장 그대로다",
  sc.lines.length === 3 &&
    sc.lines[0] === "현재 ‘일상으로’는 주택 화재를 기준으로 안내 내용을 검증하고 있습니다." &&
    sc.lines[1] ===
      "주택 화재가 아닌 경우에도 화재 직후 필요한 현장 보존, 보험, 서류, 피해 기록 등 공통 안내는 계속 확인할 수 있습니다." &&
    sc.lines[2] === "다만 영업 피해, 사업장 특유의 보상·복구 절차 등은 현재 안내 범위에 포함되지 않습니다.",
  sc.lines.join(" / "));
t("두 갈래 버튼이 확정 문구다", sc.primary === "이 범위로 계속하기" && sc.secondary === "건물 종류 다시 선택");

// 질문 종료 전환 — 기술이 주인공인 표현 금지.
// 기준 줄은 **그 사람의 실제 값으로 조립된다.** 일반론이 아니다.
const tr = transitionView({
  state: { district: "mapo", fire_at: FIRE },
  data,
  now: Date.parse(FIRE) + 27 * 36e5,
});
t("전환 제목이 '확인했습니다'다", tr.title === "확인했습니다");
t(
  "기준 줄이 자치구 · 경과 · 상황 셋이다",
  tr.basis.join(" · ") === "마포구 · 화재 발생 후 1일 3시간 · 당신의 상황",
  tr.basis.join(" · ")
);
// **꼬리말을 걷었다** — 세 조각이 세로 목록이 됐고, 목록에 꼬리말이
// 붙으면 마지막 줄만 다른 문장이 된다.
t("이음말이 없다", !("basisTail" in tr), Object.keys(tr).join(","));
t("전환 문구가 확정 한 줄이다", tr.message === "당신의 회복에 필요한 내용을 안내하겠습니다.", tr.message);
t("전환 CTA가 '내 회복 경로 보기'다", tr.cta === "내 회복 경로 보기");
// 자치구를 못 고른 사람에게 빈 조각을 그리지 않는다.
const tr구없이 = transitionView({ state: { fire_at: FIRE }, data, now: Date.parse(FIRE) + 27 * 36e5 });
t("값이 없는 조각은 빠진다", tr구없이.basis.length === 2, tr구없이.basis.join(" · "));
t(
  "'AI 분석 중'·'결과 생성 중'류 표현이 없다",
  ![tr.title, ...tr.basis, tr.message, tr.cta].some((s) => /AI|분석 중|생성 중|처리 중/.test(s))
);

// ── 전환 화면의 강조와 간격 (2026-09-02 · 사용자 결정) ──────────
//
// 기준 세 줄이 **주인공이 됐다.** 뮤트색 보통 굵기이던 것을 강조색 굵은
// 글씨로 올리고, 제목과의 사이를 `--s7`의 3배로 벌리고, 안내 문장을
// 화면 아래쪽으로 내렸다.
//
// **재방문 브릿지는 이 커밋의 대상이 아니다.** 같은 `.gate` 뼈대를 쓰므로
// 규칙이 그리로 새면 손대지 않기로 한 화면이 함께 바뀐다 — 전용 클래스
// 스코프를 검사가 지킨다.
{
  const css = readFileSync(join(D, "src/ui/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // `new RegExp` 문자열 안에서는 백슬래시가 한 겹 벗겨진다 — 문자 클래스로 우회한다.
  const 규칙 = (name) => (css.match(new RegExp("[.]gate--transition [.]?" + name + "[ ]*[{][^}]*[}]")) || [""])[0];

  const basis = 규칙("gate__basis");
  t("기준 세 줄이 강조 토큰 색이다", /color:\s*var\(--c-accent\)/.test(basis), basis.replace(/\s+/g, " "));
  t("기준 세 줄이 굵다", /font-weight:\s*var\(--w-bold\)/.test(basis), basis.replace(/\s+/g, " "));
  // 색은 토큰이어야 한다 — 이 파일 어디에도 리터럴 색을 쓰지 않는다는
  // 규칙(아래 하드코딩 검사)과 같은 뜻이다.
  t("강조에 리터럴 색을 쓰지 않는다", !/#[0-9a-f]{3,8}|rgba?\(/i.test(basis), basis.replace(/\s+/g, " "));

  const title = 규칙("gate__title");
  t("제목과의 간격이 --s7의 3배 계산식이다",
    /margin-top:\s*calc\(var\(--s7\)\s*\*\s*3\)/.test(title), title.replace(/\s+/g, " "));
  t("간격을 픽셀로 박지 않는다", !/margin-top:\s*\d+px/.test(title), title.replace(/\s+/g, " "));

  // 안내 문장은 아래로, CTA는 그 바로 아래. 둘 다 auto면 남는 공간을
  // 반씩 나눠 문장이 가운데에 뜬다 — CTA의 auto를 걷는 것이 짝이다.
  const lines = 규칙("gate__lines");
  t("안내 문장이 아래로 밀린다 (margin-top: auto)", /margin-top:\s*auto/.test(lines), lines.replace(/\s+/g, " "));
  t("전환 CTA는 auto를 걷었다", /margin-top:\s*0/.test(규칙("pg__cta")), 규칙("pg__cta").replace(/\s+/g, " "));

  // ★ 같은 선택자를 두 번 선언하면 **뒤엣것이 앞엣것을 죽인다.**
  //   `.gate__title`이 실제로 그랬다(`margin: var(--s7) 0 0`이 `margin: 0`에
  //   덮여 기준 줄과 제목이 붙어 있었다). `min-height`가 두 번 선언돼
  //   구간 높이가 죽었던 것과 같은 부류다.
  const NL = String.fromCharCode(10);
  const 단독선언 = css.split(NL).filter((l) => l.trim().indexOf(".gate__title") === 0).length;
  t("`.gate__title` 단독 선언이 하나뿐이다", 단독선언 === 1, String(단독선언));

  // 브릿지로 새지 않는다 — 이 커밋이 건드리지 않기로 한 화면이다.
  const 브릿지 = (css.match(/\.gate--revisit[^{]*\{[^}]*\}/g) || []).join(" ");
  t("브릿지에 전환의 간격·기준줄 규칙이 없다",
    !/gate__basis/.test(브릿지) && !/var\(--s7\)\s*\*\s*3/.test(브릿지),
    브릿지.replace(/\s+/g, " ").slice(0, 200));
}

// 그리는 쪽도 함께 본다 — CSS만 있고 클래스를 안 달면 아무 일도 안 일어난다.
{
  const src = readFileSync(join(D, "src/ui/screens.js"), "utf8");
  const fn = src.slice(src.indexOf("export function renderTransition"), src.indexOf("export function renderRevisit"));
  t("전환 화면이 gate--transition을 단다", /"gate gate--transition"/.test(fn));
  const rv = src.slice(src.indexOf("export function renderRevisit"));
  t("브릿지는 그 클래스를 달지 않는다", !/gate--transition/.test(rv));
}

// 재방문 경과시간 게이트 — 모든 재방문이 항상 거친다.
const 게이트 = revisitView({
  state: { fire_at: "2026-03-01T12:00:00.000Z" },
  saved: { expires_at: "x" },
  now: Date.parse("2026-03-02T15:30:00.000Z"),
});
t("저장된 기록이 있으면 뜬다", 게이트.show === true);
t("첫 방문에는 안 뜬다", revisitView({ state: {}, saved: null }).show === false);
t("화재 발생일을 날짜로 보여준다", 게이트.date === "2026년 3월 1일", 게이트.date);
t("라벨이 '화재 발생일'과 '화재 발생 후'다",
  게이트.dateLabel === "화재 발생일" && 게이트.elapsedLabel === "화재 발생 후");
t(
  "경과시간이 일·시간·분 세 토막이다 (1일 03시간 30분)",
  게이트.elapsed.map((e) => e.num + e.unit).join(" ") === "1일 03시간 30분",
  게이트.elapsed.map((e) => e.num + e.unit).join(" ")
);
t("게이트 문구가 확정 두 줄이다",
  게이트.lines.join("\n") === "지금 시점에 맞는 안내로\n다시 정리합니다.",
  게이트.lines.join(" / "));
// ★ **브릿지 CTA는 하는 일을 말한다**(2026-09-01 · 사용자 결정).
// 전환 CTA와 한 상수를 나눠 쓰던 것이 갈렸다 — 이 문이 하는 일은
// 경과한 시점으로 **다시 계산하는 것**이고, 첫 방문에는 `다시`가 거짓이다.
// 닿는 자리가 같다는 것은 여정 ⑦(walk)이 계속 본다.
t("게이트 CTA가 하는 일을 말한다", 게이트.cta === "내 회복 경로 다시 계산하기", 게이트.cta);
t("전환 CTA와는 다른 말이다", 게이트.cta !== "내 회복 경로 보기");
t("전환 CTA는 도착지 이름 그대로다", COPY.transition.cta === "내 회복 경로 보기");
t("도착 화면 이름과 이어진다", 게이트.cta.startsWith(결과(전.state).timeline.title));
// 숫자 뒤에 작게 붙는다. 날짜와 경과가 같은 크기로 서고 이것만 작다.
t("경과 뒤에 '경과'가 붙는다", 게이트.elapsedSuffix === "경과");
// 우상단 — **랜딩으로 갈 뿐 아무것도 지우지 않는다.**
t("우상단이 '처음으로'다", 게이트.home === "처음으로", 게이트.home);
t("'다시 설문하기'는 개명됐다", !JSON.stringify(게이트).includes("다시 설문하기"));
// 현재 시각 시계가 아니다. `3일째` 같은 중복 표기도 하지 않는다.
t(
  "게이트가 현재 시각을 그리지 않는다",
  !JSON.stringify(게이트).includes("일째") && 게이트.elapsed.length === 3
);


// ── 8. 내 회복 경로 (결과 IA) ──────────────────────
section("8. 내 회복 경로 — HOME과 다섯 화면");

const r1 = 결과(전.state);

// 허브 — 카드 셋과 보조 둘. 개수는 동적이다.
// ★ **이름이 갈렸다**(사용자 결정): 도착 화면(타임라인)이 `내 회복 경로`,
//   이 허브가 `나를 위한 안내`다.
t("허브 제목이 '나를 위한 안내'다", r1.home.title === "나를 위한 안내", r1.home.title);
// **HOME은 제목 하나다**(사용자 실기기 검수 결정). 기준 줄과 리드를
// 걷었다 — 바로 앞 전환 화면이 같은 말을 하고, 도착지의 일은 갈 곳을
// 보여 주는 것이다.
t("경과시간 칩이 없다", !("chip" in r1.home));
t("기준 줄이 없다", !("basis" in r1.home), Object.keys(r1.home).join(","));
t("리드가 없다", !("lead" in r1.home));
t("제목은 그대로다", r1.home.title === "나를 위한 안내");
t(
  "핵심 카드가 셋이고 확정 제목·설명이다",
  r1.home.cards.map((c) => `${c.title}/${c.desc}`).join(" | ") ===
    "먼저 볼 내용/제일 먼저 확인해야 할 정보 | 체크리스트/하나씩 해나가야 하는 일 | 알아둘 내용/당장은 하지 않아도 되는 정보",
  r1.home.cards.map((c) => `${c.title}/${c.desc}`).join(" | ")
);
// 화면 이름 그대로다 — 눌러서 가는 곳의 이름과 라벨이 같아야 한다.
t(
  "보조 탐색이 둘이고 화면 이름 그대로다",
  r1.home.more.map((m) => m.label).join(",") === "내 회복 경로,주제별 보기",
  r1.home.more.map((m) => m.label).join(",")
);
t("'다른 방식으로 보기' 같은 중간 heading이 없다", !("moreHeading" in r1.home));
t(
  "카드 개수가 각 화면의 개수와 같다",
  r1.home.cards[0].count === r1.priority.count &&
    r1.home.cards[1].count === r1.checklist.count &&
    r1.home.cards[2].count === r1.reference.count
);
// ★ HOME의 '알아둘 내용' 설명과 상세 페이지 설명은 **다른 것이 의도다.**
t(
  "HOME 카드 설명과 상세 desc가 다르다 (동기화 금지)",
  r1.home.cards[2].desc !== r1.reference.desc,
  `${r1.home.cards[2].desc} vs ${r1.reference.desc}`
);
// 구 덱에서 자리를 잃었던 근거·연락처가 돌아와 일곱이 됐다(사용자 결정).
t("HOME에서 갈 수 있는 화면이 일곱이다", RESULT_PAGES.length === 7, RESULT_PAGES.join(","));
t("근거와 연락처가 그 안에 있다",
  RESULT_PAGES.includes("sources") && RESULT_PAGES.includes("directory"));
t("HOME 참고 자료 줄이 둘이다",
  r1.home.extra.map((m) => m.label).join(",") === "근거 법령,연락처",
  r1.home.extra.map((m) => m.label).join(","));
// 개수가 0인 카드도 그대로 그린다(확정) — 0이면 0이라고 말한다.
t("0개 카드를 숨기지 않는다", r1.home.cards.length === 3);
t("빈 상세의 문구가 확정 한 줄이다", COPY.emptyPage === "지금 단계에서는 해당하는 안내가 없습니다.");

// 먼저 볼 내용 — 하지 마세요 / 늦었어도 확인하세요
const 늦게8 = 결과(전.state, Date.parse(FIRE) + 30 * 24 * 36e5);
t("먼저 볼 desc가 확정 문구다", r1.priority.desc === "제일 먼저 확인해야 할 정보입니다.");
t(
  "두 섹션 라벨이 확정 문구다",
  늦게8.priority.sections.map((s) => s.label).join(",") === "하지 마세요,늦었어도 확인하세요",
  늦게8.priority.sections.map((s) => s.label).join(",")
);
t("'혹시 늦었어도'는 폐기됐다", !JSON.stringify(늦게8.priority).includes("혹시 늦었어도"));
// 제목 문자열이 아니라 guidance_type으로 갈린다(UI가 의미를 다시 만들지 않는다).
t(
  "'하지 마세요'는 전부 guidance_type=do_not이다",
  늦게8.priority.sections[0].items.every((r) => r.guidanceType === "do_not"),
  늦게8.priority.sections[0].items.map((r) => `${r.id}:${r.guidanceType}`).join(",")
);
t(
  "'늦었어도 확인하세요'는 전부 missed 버킷이다",
  늦게8.priority.sections[1].items.every((r) => r.section === "missed") &&
    늦게8.priority.sections[1].items.length > 0
);
t(
  "missed를 '이제 할 수 없음'으로 단정하지 않는다",
  !/이제 할 수 없|끝났|늦어서 못/.test(JSON.stringify(늦게8.priority.sections[1]))
);

// 체크리스트 — 실행해야 하는 것. 잠긴 불가역도 남는다.
const cl = r1.checklist;
t("체크리스트 desc가 확정 문구다", cl.desc === "하나씩 해나가야 하는 일입니다.");
t("하단 문구가 확정 문구다", cl.footer === "체크한 항목은 이 기기에 완료 상태로 기억됩니다.", cl.footer);
t("체크리스트는 전부 실행 안내(action)다", cl.items.every((i) => i.guidanceType === "action"));
t(
  "금지와 지나간 것은 체크리스트에 없다",
  cl.items.every((i) => i.section !== "standing" && i.section !== "missed")
);
{
  const ranked = cl.items.filter((i) => typeof i.rank === "number").map((i) => i.rank);
  t("엔진 rank 순서 그대로다 (UI가 다시 계산하지 않는다)",
    ranked.every((v, i) => i === 0 || ranked[i - 1] <= v), ranked.join(","));
  const 첫버킷 = cl.items.findIndex((i) => i.rank == null);
  t("rank 없는 버킷 행(blocked)은 뒤에 붙는다",
    첫버킷 === -1 || cl.items.slice(첫버킷).every((i) => i.rank == null));
}
{
  // 레퍼런스 케이스 — scene_preserved:true라 scene-release가 안 뜨는데
  // 그것을 선행으로 둔 항목들이 잠긴 채 상위에 있다.
  const 잠긴 = cl.items.filter((i) => i.lock);
  t("잠긴 카드가 있다", 잠긴.length > 0, String(잠긴.length));
  t("선행 문장이 카드 표면에 있다 (더보기에 숨기지 않는다)",
    잠긴.every((i) => typeof i.lock.sentence === "string" && i.lock.sentence.length > 0));
  t("문장 안에서 '먼저 확인'만 강조한다",
    잠긴.every((i) => i.lock.emphasis === "먼저 확인" && i.lock.sentence.includes("먼저 확인")));
  const scene = 잠긴.filter((i) => i.blockedBy.some((b) => b.id === "scene-release"));
  t("선행이 현장 정리 확인이면 확정 문장을 쓴다",
    scene.length > 0 &&
      scene.every((i) => i.lock.sentence === "화재조사관에게 현장 정리 가능 여부를 먼저 확인하세요."),
    scene.map((i) => i.id).join(","));
  const 기타 = 잠긴.filter((i) => !i.blockedBy.some((b) => b.id === "scene-release"));
  t("그 밖의 선행은 제목으로 문장을 만든다",
    기타.every((i) => i.lock.sentence === `‘${i.blockedBy[0].title}’을(를) 먼저 확인하세요.`),
    기타.map((i) => i.lock.sentence).join(" | "));
  // Q2 → 확정: 문장이 가리키는 선행과 목적지가 같을 때만 이동을 그린다.
  t("문장이 가리키는 선행과 목적지가 다르면 이동을 안 그린다",
    잠긴.every((i) => {
      const named = i.blockedBy.find((b) => b.id === "scene-release") ?? i.blockedBy[0];
      return i.lock.goTo === null || i.lock.goTo === named.id;
    }),
    잠긴.map((i) => `${i.id}:${i.lock.goTo}`).join(","));
  t("선행이 하나도 화면에 없으면 이동이 없다",
    잠긴.filter((i) => i.lock.missing).every((i) => i.lock.goTo === null));
  t("레퍼런스 케이스에서 현장 확인 문장 카드에는 이동이 없다",
    scene.every((i) => i.lock.goTo === null),
    scene.map((i) => `${i.id}:${i.lock.goTo}`).join(","));
  t("잠김을 '기다리는 중'으로 표현하지 않는다",
    !잠긴.some((i) => JSON.stringify(i.lock).includes("기다리는 중")));
}
t(
  "불가역 신호는 irreversible에만 붙는다",
  cl.items.every((i) => (i.warn === null) === !i.irreversible) &&
    cl.items.some((i) => i.warn === "놓치면 되돌리기 어려움")
);
// **완료해도 항목은 제자리다**(사용자 실기기 검수 결정). 아래로 내려가는
// 블록이 없다 — 방금 체크한 것이 눈앞에서 사라지면 되돌릴 자리를 잃는다.
{
  const 전목록 = cl.items.map((i) => i.id);
  const 완료 = 결과({ ...전.state, completed: ["photo-before-cleanup"] });
  const 후목록 = 완료.checklist.items.map((i) => i.id);
  t("완료해도 목록에 남는다", 후목록.includes("photo-before-cleanup"));
  t("순서가 한 칸도 안 움직인다", 전목록.join() === 후목록.join(), 후목록.join(" > "));
  const 그행 = 완료.checklist.items.find((i) => i.id === "photo-before-cleanup");
  t("완료 표시가 행에 붙는다", 그행.completed === true && 그행.statusLabel === "완료");
  t("하단 완료 블록이 없다", !("done" in 완료.checklist));
  // 개수는 남은 일이다 — HOME 카드가 그것으로 읽힌다.
  t("개수에서 완료가 빠진다", 완료.checklist.count === cl.count - 1,
    `${cl.count} -> ${완료.checklist.count}`);
  t("완료 개수는 따로 센다", 완료.checklist.doneCount === 1);
}

// 알아둘 내용 — awareness와 waiting을 한 목록에, waiting만 상태 라벨
{
  const 대기 = 결과({ ...전.state, adjuster_present: true, completed: ["investigation-report"] },
    Date.parse(FIRE) + 8 * 24 * 36e5);
  t("알아둘 desc가 확정 문구다",
    대기.reference.desc === "당장 행동할 필요는 없지만, 이후를 위해 확인해둘 정보입니다.",
    대기.reference.desc);
  t("폐기된 desc를 쓰지 않는다",
    !JSON.stringify(대기.reference).includes("당장은 하지 않아도 되는 정보입니다."));
  t("awareness와 waiting이 한 목록에 있다",
    대기.reference.items.some((i) => i.guidanceType === "awareness") &&
      대기.reference.items.some((i) => i.stateLabel === "기다리는 중"),
    대기.reference.items.map((i) => `${i.id}:${i.stateLabel ?? "-"}`).join(","));
  t("중간 heading 없이 카드로 나열한다", !("sections" in 대기.reference) && Array.isArray(대기.reference.items));
  t("waiting에만 '기다리는 중'이 붙는다",
    대기.reference.items.filter((i) => i.stateLabel).every((i) => i.category === "대기" || i.waitDays));
  t("blocked는 알아둘 내용에 없다 (waiting과 다르다)",
    대기.base.blocked.every((b) => !대기.reference.items.some((i) => i.id === b.id)));
}

// 회복 타임라인 — 노드 다섯. 날짜를 만들어내지 않는다.
const tlv = r1.timeline;
// ★ **결과의 도착 화면이다**(사용자 결정). 전환 CTA가 `내 회복 경로 보기`라고
//   약속하므로 도착지 이름이 그것과 같고, 허브로 가는 문이 제목 바로 아래에
//   **보이는 자리로** 선다 — 헤더에 숨기지 않는다.
t("타임라인 제목이 '내 회복 경로'다", tlv.title === "내 회복 경로", tlv.title);
t("허브로 가는 문이 있고 라벨이 허브 이름이다",
  tlv.toHub === "나를 위한 안내 보기" && tlv.toHub.startsWith(r1.home.title), tlv.toHub);
t("타임라인 desc가 확정 문구다",
  tlv.desc === "회복 과정에서 언제 무엇을 확인하면 되는지 살펴보세요.", tlv.desc);
t(
  "노드가 화재 발생일 → 오늘 → 가까운 시일에 → 계속 확인 → 조사서가 나온 뒤다",
  tlv.nodes.map((n) => n.label).join(" → ") ===
    "화재 발생일 → 오늘 → 가까운 시일에 → 계속 확인 → 조사서가 나온 뒤",
  tlv.nodes.map((n) => n.label).join(" → ")
);
t("엔진 키는 그대로다 (this_week를 바꾸지 않는다)",
  tlv.nodes[2].key === "this_week" && NODE_LABEL.this_week === "가까운 시일에");
t("`7일 안에` 같은 기한을 만들어내지 않는다",
  !/7일|일 안에|까지|이내/.test(tlv.nodes.map((n) => `${n.label}${n.note ?? ""}`).join(" ")));
t("화재 발생일이 박스 없는 날짜·시각이다",
  /^\d{4}\.\d{2}\.\d{2}$/.test(tlv.nodes[0].date) && /^\d{2}:\d{2}$/.test(tlv.nodes[0].time));
t("'오늘' 노드에 실제 오늘 날짜가 보조로 붙는다", /^\d+월 \d+일$/.test(tlv.nodes[1].note), tlv.nodes[1].note);
t("missed와 standing은 타임라인에 없다",
  tlv.nodes.every((n) => n.key !== "missed" && n.key !== "standing") &&
    tlv.nodes.slice(1).every((n) => n.items.every((i) => i.section !== "missed" && i.section !== "standing")));
t("하단 문구가 확정 문구다",
  tlv.footer === "타임라인에서는 전체 흐름을 보고, 완료 처리는 체크리스트에서 합니다.");
{
  const 전조사 = tlv.nodes.find((n) => n.key === "after_report");
  const 후조사 = 결과({ ...전.state, report_received: true }, Date.parse(FIRE) + 8 * 24 * 36e5)
    .timeline.nodes.find((n) => n.key === "after_report");
  t("조사서를 받기 전에는 잠긴 이유를 말한다",
    전조사.unlocked === false && 전조사.note === "화재현장조사서를 받은 뒤 확인할 수 있습니다.");
  t("받은 뒤에는 그 줄이 사라진다", 후조사.unlocked === true && 후조사.note === null);
}

// 주제별로 보기 — 표시 라벨만 갈아 끼운다
const tp = r1.topics;
t("주제별 desc가 확정 문구다", tp.desc === "지금 내 상황에 해당하는 안내를 주제별로 모았습니다.");
t("주제별 footer가 확정 문구다", tp.footer === "현재 내 상황에 해당하는 안내가 있는 주제만 보여줍니다.");
t("표시 라벨은 몸→건강, 서류→필요서류다", TOPIC_LABEL["몸"] === "건강" && TOPIC_LABEL["서류"] === "필요서류");
t("나머지 주제는 그대로다", topicLabel("보험과 돈") === "보험과 돈" && topicLabel("집 정리") === "집 정리");
t(
  "데이터의 domain_group은 바뀌지 않았다",
  !data.actions.some((a) => a.domain_group === "건강" || a.domain_group === "필요서류")
);
t("주제가 일곱이다 (SCHEMA 산문의 '6개'는 stale이다)", TOPIC_ORDER.length === 7);
t("해당하는 안내가 있는 주제만 나온다", tp.topics.every((x) => x.count > 0));
t("주제 카드에는 출처가 없다 (출처는 Action 단위다)",
  tp.topics.every((x) => Object.keys(x).join(",") === "group,label,count"));

// 주제 상세 — 조건부·제외를 나눠서 접고, 미판정은 본목록에 남긴다
{
  const 제외있는 = 바탕({ ...전.state, district: "guro" }, Date.parse(FIRE) + 8 * 24 * 36e5);
  const 그룹 = 제외있는.excluded.find((r) => r.status === "제외")?.group;
  const td = topicDetailView(제외있는, 그룹);
  t("주제 상세 개수 문구가 `N개의 안내`다", td.countLabel === `${td.count}개의 안내`);
  t("주제 상세 footer가 확정 문구다",
    td.footer === "원문 링크가 확인된 안내에만 ‘원문 보기’를 표시합니다.");
  t("제외 접힘 문구가 확정 문구다",
    td.folds.some((f) => f.key === "제외" && f.label === `현재는 해당하지 않는 안내 ${f.items.length}개`),
    td.folds.map((f) => f.label).join(" | "));
  t("제외를 사유와 함께 남긴다 (지우지 않는다 — D-011)",
    td.folds.find((f) => f.key === "제외").items.every((r) => typeof r.reason === "string"));
}
{
  const 조건부있는 = 바탕({ ...전.state, district: "seongbuk", registered_resident: false });
  const 그룹 = 조건부있는.excluded.find((r) => r.status === "조건부")?.group;
  const td = topicDetailView(조건부있는, 그룹);
  t("조건부 접힘 문구가 확정 문구다",
    td.folds.some((f) => f.key === "조건부" && f.label === `예외적으로 확인해볼 수 있는 안내 ${f.items.length}개`),
    td.folds.map((f) => f.label).join(" | "));
  t("조건부와 제외를 한 그룹으로 뭉치지 않는다",
    td.folds.every((f) => f.items.every((r) => r.status === f.key)));
  t("조건부를 '해당 없음'으로 부르지 않는다",
    !td.folds.filter((f) => f.key === "조건부").some((f) => f.label.includes("해당 없음")));
}
{
  const 미판정있는 = 바탕({ ...전.state, district: "gangnam", insurance_self: "unknown" });
  const 행 = 미판정있는.excluded.find((r) => r.status === "미판정");
  const td = topicDetailView(미판정있는, 행.group);
  t("미판정은 접힘이 아니라 본목록에 남는다",
    td.items.some((i) => i.id === 행.id) && !td.folds.some((f) => f.items.some((x) => x.id === 행.id)));
  t("미판정 카드에 '아직 확인 못 함'이 붙는다",
    td.items.find((i) => i.id === 행.id).statusLabel === "아직 확인 못 함");
  t("미판정을 '해당 없음'으로 표시하지 않는다",
    td.items.find((i) => i.id === 행.id).statusLabel !== "해당 없음");

  // 아직 확인 못 함 상세
  const uv = undeterminedView(미판정있는, 행.id, { questions });
  t("상태 라벨이 '아직 확인 못 함'이다", uv.label === "아직 확인 못 함");
  t("왜 못 하는지는 엔진 reason 그대로다", uv.why.line === 행.reason && uv.why.title === "왜 아직 확인할 수 없나요?");
  t("확인하려면 무엇을 바꾸면 되는지 말한다", uv.how.title === "확인하려면" &&
    uv.how.line === "보험 가입 여부를 확인한 뒤 답변을 바꾸면, 현재 자치구 기준으로 다시 판단합니다.");
  t("바꿔야 할 답이 실제 '잘 모르겠어요'인 질문이다",
    uv.how.targets.length > 0 && uv.how.targets.every((q) => 미판정있는.state[q.key] === "unknown"),
    uv.how.targets.map((q) => q.id).join(","));
  t("그 질문으로 바로 가는 CTA가 있다", uv.how.cta === "보험 답변 다시 확인하기");
  t("안내 기준은 그 구의 조례다", uv.basis?.title === "서울특별시 강남구 화재피해주민 지원 조례");
  // elis 홈페이지는 정확한 원문이 아니다. 원문 링크로 걸지 않는다.
  t("조례 원문 링크는 걸지 않는다 (홈페이지 URL뿐이다)", uv.basis?.url === null);
  // 자치구 미선택은 이 화면의 대상이 아니다 — 그쪽은 자치구 선택으로 보낸다.
  const 구없이 = 바탕({ ...전.state, district: undefined });
  const 구없이행 = 구없이.excluded.find((r) => r.status === "미판정");
  t("자치구 미선택은 이 화면의 대상이 아니다",
    구없이행.needsDistrict === true && undeterminedView(구없이, 구없이행.id, { questions }) === null);
}

// 출처 — sources → 조례 → legacy → 생략
{
  const 강남 = 바탕({ ...전.state, district: "gangnam" });
  const 모든행 = 강남.all;
  t("sources가 비어도 화면이 죽지 않는다", 모든행.every((r) => sourceOf(r) !== undefined));
  const legacy = 모든행.filter((r) => !r.ordinanceBased && r.sourceUrl && !r.sources.length);
  t("URL이 있으면 원문 보기를 건다",
    legacy.length > 0 && legacy.every((r) => sourceOf(r).items[0].link === "원문 보기 ↗"));
  t("문서명은 지어내지 않는다 (sources가 빌 때)",
    legacy.every((r) => sourceOf(r).items[0].title === null));

  // sources가 채워진 첫 항목 — 콘텐츠 패스가 여기서 시작됐다(커밋 A).
  // legacy가 아니라 sources 경로로 읽히는지, 카드가 풀 형태로 서는지를 본다.
  // 이 행은 물 피해를 입은 사람에게만 뜬다.
  {
    const 물 = 바탕({ ...전.state, district: "gangnam", water_damage_home: true });
    const r = 물.byId.get("fire-loss-compensation-not-applicable");
    t("물 피해 화면에 손실보상 안내가 있다", Boolean(r));
    const s = sourceOf(r);
    t("legacy가 아니라 sources로 읽는다", s.kind === "sources", String(s?.kind));
    t("법령 둘을 함께 싣는다 (법률 · 시행령)", s.items.length === 2, String(s.items.length));
    t("출처 카드가 풀 형태로 선다 (문서명 · 조문 · 발행처 · 확인일 · 원문 보기)",
      s.items.every((i) =>
        typeof i.title === "string" && /^제\d+조/.test(i.article || "") &&
        i.publisher === "국가법령정보센터" && /^\d{4}\.\d{2}\.\d{2}$/.test(i.checkedAt || "") &&
        i.link === "원문 보기 ↗" && typeof i.url === "string"),
      JSON.stringify(s.items[0]));
    t("메타 줄이 발행처와 확인일을 함께 읽는다",
      s.items[0].meta === "국가법령정보센터 · 2026.08.30 확인", s.items[0].meta);
    // 존재하지 않는 조문을 근거로 쓰지 않는다 — "원인에 대하여 책임이 있는 자"
    // 제외는 경찰관 직무집행법의 문구이고 소방기본법에는 없다.
    const ad = actionDetailView(물, "fire-loss-compensation-not-applicable");
    t("없는 제외 조항을 본문에 쓰지 않는다",
      !/원인에 대하여 책임|원인 책임자|책임이 있는 자/.test(ad.body));
    t("화재 피해 보상 제도가 아니라고 먼저 말한다",
      ad.title === "소방서 손실보상은 화재 피해를 보상하는 제도가 아닙니다", ad.title);
  }
  const 없음 = 모든행.filter((r) => !r.ordinanceBased && !r.sourceUrl);
  t("URL이 없으면 출처 영역이 통째로 없다", 없음.length > 0 && 없음.every((r) => sourceOf(r) === null));
  const 조례 = 모든행.filter((r) => r.ordinanceBased);
  t("조례 행은 조례 이름과 조문으로 출처를 만든다",
    조례.length > 0 &&
      조례.every((r) => {
        const s = sourceOf(r);
        return s.kind === "ordinance" && s.items[0].title === r.ordinanceName && /^제\d+조/.test(s.items[0].article);
      }));
  t("조례 출처에는 원문 링크가 없다", 조례.every((r) => sourceOf(r).items[0].link === null));
  t("확인일이 YYYY.MM.DD다", 조례.every((r) => /^\d{4}\.\d{2}\.\d{2}$/.test(sourceOf(r).items[0].checkedAt)));
}

// Action 상세 — 공통 템플릿
{
  // 본인 보험이 있는 사람의 화면에서 고른다 — 이 안내는 그 사람 것이다.
  const 보험 = { ...전.state, insurance_self: true };
  const ad = actionDetailView(바탕(보험), "insurance-claim-limitation");
  t("Action 상세에 주제 표시 라벨이 붙는다", ad.topic === "보험과 돈");
  t("제목·요약·본문을 그대로 싣는다",
    typeof ad.title === "string" && typeof ad.summary === "string" && typeof ad.body === "string");
  t("상세 하단 문구가 확정 문구다",
    ad.footer === "안내 내용은 확인된 근거를 바탕으로 정리하며, 원문이 있는 경우 직접 확인할 수 있습니다.");
  t("'검증됨'·'공식 인증' 같은 과장이 없다", !/검증됨|공식 인증/.test(JSON.stringify(ad)));
  t("없는 Action을 물으면 null이다", actionDetailView(바탕(전.state), "no-such-action") === null);
  const 몸 = actionDetailView(바탕(전.state), "fridge-4h");
  t("몸은 화면에서 '건강'으로 불린다", 몸.topic === "건강");
}

// ── 불변식 — 페르소나 훑기 ─────────────────────────
//
// 화면 하나를 고치다 다른 화면이 조용히 어긋나는 것을 막는다.
{
  const 훑기 = [
    ["마포", { district: "mapo" }],
    ["강남", { district: "gangnam" }],
    ["강남·본인보험 모름", { district: "gangnam", insurance_self: "unknown" }],
    ["구로·건물보험", { district: "guro" }],
    ["성북·거주요건", { district: "seongbuk", registered_resident: false }],
    ["양천·보상금", { district: "yangcheon", compensated: true }],
    ["구 없음", { district: undefined }],
    ["조사서 수령", { district: "gangnam", report_received: true }],
    ["조사서 신청 완료", { district: "gangnam", completed: ["investigation-report"] }],
  ];
  const 시각 = [3 * 36e5, 5 * 24 * 36e5, 8 * 24 * 36e5, 30 * 24 * 36e5, 90 * 24 * 36e5];
  let 조합 = 0, 사라진주제 = [], 엉뚱한미판정 = [], 겹침 = [], 라벨없음 = [];
  for (const [이름, over] of 훑기)
    for (const dt of 시각) {
      조합++;
      const state = { ...전.state, ...over };
      const b = 바탕(state, Date.parse(FIRE) + dt);
      const 주제 = new Set(topicsView(b).topics.map((x) => x.group));
      // ① 어느 행도 주제 목록에서 사라지지 않는다(D-011).
      for (const r of b.excluded) if (!주제.has(r.group)) 사라진주제.push(`${이름}+${dt / 36e5}h ${r.id}`);
      // ② 미판정의 원인은 자치구 미선택 아니면 보험 unknown 둘뿐이다.
      //    (undeterminedView가 보험 질문으로 보내는 근거다.)
      for (const r of b.excluded)
        if (r.status === "미판정" && !r.needsDistrict &&
            state.insurance_self !== "unknown" && state.insurance_dwelling !== "unknown")
          엉뚱한미판정.push(`${이름}+${dt / 36e5}h ${r.id}`);
      // ③ 같은 행이 체크리스트와 먼저 볼 내용에 동시에 있지 않다.
      const ck = new Set(checklistView(b).items.map((i) => i.id));
      for (const s of priorityView(b).sections)
        for (const i of s.items) if (ck.has(i.id)) 겹침.push(`${이름}+${dt / 36e5}h ${i.id}`);
      // ④ 상태를 색이 아니라 글자로 말한다 — 미판정·대기·완료에 라벨이 있다.
      for (const g of TOPIC_ORDER)
        for (const i of topicDetailView(b, g).items)
          if (i.status !== "해당" && !i.statusLabel) 라벨없음.push(`${이름} ${i.id}:${i.status}`);
    }
  t(`① excluded 행의 주제가 목록에서 사라지지 않는다 (${조합}조합)`, 사라진주제.length === 0, 사라진주제.slice(0, 3).join(" | "));
  t("② 미판정의 원인은 자치구 미선택 아니면 보험 unknown뿐이다", 엉뚱한미판정.length === 0, 엉뚱한미판정.slice(0, 3).join(" | "));
  t("③ 체크리스트와 먼저 볼 내용이 같은 행을 겹쳐 담지 않는다", 겹침.length === 0, 겹침.slice(0, 3).join(" | "));
  t("④ 해당이 아닌 행에는 상태 라벨이 붙는다 (색만으로 말하지 않는다)", 라벨없음.length === 0, 라벨없음.slice(0, 3).join(" | "));
}

// 새 뷰모델도 저장소를 직접 만지지 않는다(D-002 누수 탐지와 같은 방식).
t(
  "새 뷰모델이 브라우저 저장소를 부르지 않는다",
  ["src/ui/entry.js", "src/ui/result.js", "src/ui/rows.js", "src/ui/format.js"].every(
    (f) => !/localStorage|sessionStorage|document\.cookie/.test(코드만(f))
  )
);
// 뷰모델은 DOM을 모른다 — 판단이 브라우저 안에 숨으면 계기판이 못 본다.
t(
  "새 뷰모델이 DOM을 모른다",
  ["src/ui/entry.js", "src/ui/result.js", "src/ui/rows.js", "src/ui/format.js"].every(
    (f) => !/\bdocument\.|\bwindow\.|createElement/.test(코드만(f))
  )
);

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
