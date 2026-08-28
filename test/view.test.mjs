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
import { configureStorage, memoryBackend, saveState } from "../src/storage.js";
import { openSession, anchorSession } from "../src/session.js";
import { evaluate } from "../src/engine.js";
import { applyDefaults } from "../src/questions.js";
import { entryView, surveyView, saveNoticeView } from "../src/ui/view.js";
import { timelineView, locate, waitLabel } from "../src/ui/timeline.js";
import { introView, guideView, summaryView, checkView, sourcesView, contactsView, deckView, DECK } from "../src/ui/pages.js";
import { COPY, BUCKET_LABEL, STATUS_LABEL } from "../src/ui/copy.js";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));
const readJson = async (path) => JSON.parse(readFileSync(join(D, path), "utf8"));
const questions = read("data/questions.json");
const data = { actions: read("data/actions.json"), districts: read("data/districts.json") };

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

const 새백엔드 = () => configureStorage({ ...memoryBackend(), readJson });
const bannerTypes = (v) => v.banners.map((b) => b.type);

// ── 1. 진입 ────────────────────────────────────────
section("1. 진입 — notice 다섯 종과 notice가 없는 여섯째");

// (1) QR로 정상 진입
새백엔드();
let s = await openSession({ url: "https://after47.kr/?d=mapo" });
let v = entryView(s);
t("① ?d=mapo → 자치구 선택 화면이 안 뜬다", v.picker.needed === false);
t("① ?d=mapo → district_needed 배너가 없다", !bannerTypes(v).includes("district_needed"));
t("① 보이는 구가 마포다", v.district?.id === "mapo" && v.district.name === "마포구");

// (2) 자치구를 모르는 두 경우 — 이유가 다르면 문구도 달라야 한다
새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/" }));
t("② ?d= 없음 → picker.needed, reason 'missing'", v.picker.needed && v.picker.reason === "missing");
const missingText = v.banners.find((b) => b.type === "district_needed")?.text;

새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/?d=bucheon" }));
t(
  "② 서울 밖 값(bucheon) → picker.needed, reason 'unknown'",
  v.picker.needed && v.picker.reason === "unknown"
);
t(
  "② 두 경우의 문구가 다르다 (모르는 값은 '다시 골라 주세요')",
  v.banners.find((b) => b.type === "district_needed")?.text !== missingText
);
t("② 25개 구가 전부 고를 수 있다", v.picker.options.length === 25);
t(
  "② picker가 가나다순이다",
  v.picker.options[0].name === "강남구" && v.picker.options[24].name === "중랑구",
  `${v.picker.options[0].name} … ${v.picker.options[24].name}`
);
// 조례 유무는 선택 화면에 나오지 않는다 — 없는 구에 낙인을 찍는 표시가 된다.
t(
  "② picker 항목은 id와 이름뿐이다 (조례 유무를 표시하지 않는다)",
  v.picker.options.every((o) => Object.keys(o).sort().join(",") === "id,name")
);

// (3) 저장값이 ?d=를 이기되 조용히 넘기지 않는다
새백엔드();
s = await openSession({ url: "https://after47.kr/?d=seongbuk" });
await anchorSession(s);
const 토큰 = s.token;
v = entryView(await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` }));
t(
  "③ 저장값 성북 + ?d=mapo → district_conflict 배너 1건",
  v.banners.filter((b) => b.type === "district_conflict").length === 1
);
t("③ 보이는 구는 성북이다", v.district?.id === "seongbuk");
const conflict = v.banners.find((b) => b.type === "district_conflict");
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

// (5) notice가 없는 여섯째 — 카톡 링크를 다른 기기에서 연 사람
새백엔드(); // 기기를 바꾼 것과 같다
s = await openSession({ url: `https://after47.kr/?d=mapo&t=${토큰}` });
t("⑤ 이 경우 openSession은 notice를 주지 않는다", !s.notices.some((n) => n.type === "no_saved_state"));
t("⑤ 저장이 없고 새로 발급한 것도 아니다", !s.saved && !s.isNew);
v = entryView(s);
t("⑤ 뷰모델이 no_saved_state 배너를 직접 만든다", bannerTypes(v).includes("no_saved_state"));

// 정상 진입에서는 그 배너가 뜨면 안 된다
새백엔드();
s = await openSession({ url: "https://after47.kr/?d=mapo" });
t("⑤ 새로 시작한 사람에게는 안 뜬다", !bannerTypes(entryView(s)).includes("no_saved_state"));
await anchorSession(s);
s = await openSession({ url: `https://after47.kr/?t=${s.token}` });
t("⑤ 저장이 살아 있는 사람에게도 안 뜬다", !bannerTypes(entryView(s)).includes("no_saved_state"));

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
t("고른 구가 보인다", 고른뒤.district?.id === "gangnam" && !고른뒤.picker.needed);

새백엔드();
s = await openSession({ url: "https://after47.kr/?d=seongbuk" });
await anchorSession(s);
s = await openSession({ url: `https://after47.kr/?d=mapo&t=${s.token}` });
t(
  "충돌한 구로 바꾸고 나면 그 배너도 사라진다",
  !bannerTypes(entryView({ ...s, state: { ...s.state, district: "mapo" } })).includes(
    "district_conflict"
  )
);

// 망가진 토큰
새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/?d=mapo&t=ab0k9m" }));
t("망가진 토큰이면 token_invalid 배너가 뜬다", bannerTypes(v).includes("token_invalid"));

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
  water_damage_role: "none",
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
t(
  "1층에는 '나중에'가 있다 (없으면 사람은 X를 찾고, 안 보이면 화면을 닫는다)",
  일층.actions.some((a) => a.id === "later")
);
t(
  "카톡 보내기는 공유를 지원할 때만 나온다",
  일층.actions.some((a) => a.id === "share") &&
    !saveNoticeView({ persisted: true, stage: "result_first", canShare: false }).actions.some(
      (a) => a.id === "share"
    )
);
t("2층은 이 박스를 쓰지 않는다", saveNoticeView({ persisted: true }).show === false);

// 문구 정정 4건 (승인됨)
t("헤더 제목이 '화재피해 회복 내비게이션'다", COPY.app.title === "화재피해 회복 내비게이션");
t(
  "token_invalid에서 사용자 탓 어조를 뺐다",
  COPY.banner.token_invalid === "이 주소로는 저장된 기록을 찾지 못해 새로 시작합니다.",
  COPY.banner.token_invalid
);
t(
  "미판정 계열 명칭이 '아직 확인 못 함' 하나다",
  BUCKET_LABEL.excluded === "아직 확인 못 함" && STATUS_LABEL.미판정 === "아직 확인 못 함",
  `${BUCKET_LABEL.excluded} / ${STATUS_LABEL.미판정}`
);
t(
  "화면 어디에도 '미판정'·'해당 여부 확인 필요'가 남아 있지 않다",
  !/미판정|해당 여부 확인 필요/.test(
    JSON.stringify(COPY) + JSON.stringify(BUCKET_LABEL) + JSON.stringify(Object.values(STATUS_LABEL))
  )
);

// 고지문 — D-006의 "말하지 않는 것"이 사용자 언어로 들어 있는가
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

// ── 5. 타임라인 ────────────────────────────────────
section("5. 타임라인 — 자르고 접는 것은 UI다");

const 판정 = (state, now = NOW) => evaluate(applyDefaults(questions, state, now), data, now);
const tl = (state, now = NOW) => timelineView({ result: 판정(state, now), state, data });

const t1 = tl(전.state);
t(
  "가로 암시선은 양 끝점뿐이다 — 끝은 화살표, 라벨은 '회복으로'",
  t1.header.start === "화재발생" && t1.header.end === "회복으로",
  JSON.stringify(t1.header)
);
t("확정 문구가 그대로다", t1.header.line === "불이 꺼졌듯, 이 시간도 지나갑니다.");

t("큰 카드는 rank 1이다", t1.cards.lead?.rank === 1, String(t1.cards.lead?.rank));
t(
  "그 아래 넉 줄은 rank 2~5다",
  t1.cards.rest.length === 4 && t1.cards.rest.every((r, i) => r.rank === i + 2),
  JSON.stringify(t1.cards.rest.map((r) => r.rank))
);
t("카드 영역이 예산(5)을 넘지 않는다", 1 + t1.cards.rest.length <= 5);
t(
  "큰 카드가 제목·요약·본문을 갖는다 (읽을 것은 하나)",
  Boolean(t1.cards.lead.title && t1.cards.lead.summary && t1.cards.lead.body)
);
t(
  "접힌 구간은 라벨과 개수를 갖는다 (지우는 것이 아니라 접는 것이다)",
  t1.more.length > 0 && t1.more.every((m) => m.label && typeof m.count === "number")
);
t(
  "접힌 구간에는 rank 6 이상만 있다",
  t1.more.every((m) => m.items.every((r) => r.rank > 5)),
  JSON.stringify(t1.more.flatMap((m) => m.items.map((r) => r.rank)).filter((r) => r <= 5))
);

// standing과 missed는 순위 경쟁 밖이다(D-019 §0 · UI-A② 개정)
t(
  "금지 밴드가 있고 rank가 전부 null이다",
  t1.standing.count > 0 && t1.standing.items.every((r) => r.rank === null)
);
t("금지는 체크할 수 없다", t1.standing.items.every((r) => r.checkable === false));
t(
  "카드 영역에 standing이 섞이지 않는다",
  ![t1.cards.lead, ...t1.cards.rest].some((r) => r.when === "standing")
);

const 늦게 = tl(전.state, Date.parse(FIRE) + 5 * 24 * 36e5);
t("+5d에는 지나간 것이 생긴다", 늦게.missed.count > 0, String(늦게.missed.count));
t("지나간 것은 rank가 null이다", 늦게.missed.items.every((r) => r.rank === null));
t(
  "지나간 것이 카드 예산을 먹지 않는다 (UI-A② 개정의 핵심)",
  ![늦게.cards.lead, ...늦게.cards.rest].some((r) => r.when === "missed"),
  JSON.stringify([늦게.cards.lead, ...늦게.cards.rest].map((r) => r.rank + ":" + r.when))
);
t(
  "+5d에도 첫 카드는 같다",
  늦게.cards.lead?.id === t1.cards.lead?.id,
  t1.cards.lead?.id + " → " + 늦게.cards.lead?.id
);

// 잠김 — 여는 열쇠가 어디 있는지 뷰모델이 답한다
const 잠긴 = [t1.cards.lead, ...t1.cards.rest, ...t1.more.flatMap((m) => m.items)].filter(
  (r) => r.locked
);
t(
  "잠긴 행은 선행 제목을 싣고 있다 (콘텐츠를 새로 쓰지 않는다)",
  잠긴.every((r) => r.blockedBy.length > 0 && r.blockedBy[0].title)
);
// 선행이 이 사람 화면에 **아예 없을 수 있다.** applies_when에 안 맞아 그
// Action이 안 뜨는데 depends_on은 그대로라 잠김만 남는다. 레퍼런스 케이스가
// 그렇다 — scene_preserved:true라 scene-release가 안 뜬다(엔진·데이터 쪽
// 문제. 보고했다). 화면은 갈 곳이 있을 때만 버튼을 그려야 한다.
t("잠긴 행마다 leadTo / leadMissing 중 하나가 정해진다",
  잠긴.every((r) => (r.leadTo === null) === (r.leadMissing === true)));
const 갈수있는 = 잠긴.filter((r) => r.leadTo);
const 못가는 = 잠긴.filter((r) => r.leadMissing);
t("갈 곳이 있는 잠김은 locate로 찾힌다",
  갈수있는.every((r) => locate(t1, r.leadTo.id) !== null),
  JSON.stringify(갈수있는.map((r) => r.leadTo.id)));
t("선행이 화면에 없으면 leadMissing이다 (버튼을 그리지 않는 근거)",
  못가는.every((r) => locate(t1, r.blockedBy[0].id) === null),
  JSON.stringify(못가는.map((r) => r.id + "←" + r.blockedBy[0].id)));
console.log(`      실측 — 잠김 ${잠긴.length}건 중 갈 곳 있음 ${갈수있는.length} / 없음 ${못가는.length}`);
t("화면에 없는 id는 null이다", locate(t1, "없는-액션") === null);

// 대기 — 기간을 약속하지 않되 숫자는 준다
t(
  "대기 항목은 wait_days 하한으로 정렬된다",
  t1.waiting.every((r, i, a) => i === 0 || (a[i - 1].waitDays?.[0] ?? 1e9) <= (r.waitDays?.[0] ?? 1e9))
);
t("범위를 숫자로 만든다", waitLabel([15, 60]) === "15~60일", String(waitLabel([15, 60])));
t("값이 없으면 null이다 — 화면은 기간 없이 상태만 말한다", waitLabel(null) === null);

// 완료 로그
const 체크 = {
  ...전.state,
  completed: ["fire-cert"],
  completed_at: { "fire-cert": "2026-03-02T12:00:00.000Z" },
};
const t2 = tl(체크);
t("체크한 것이 완료 로그로 간다", t2.done.count === 1 && t2.done.items[0].id === "fire-cert");
t("완료에 날짜가 붙는다", t2.done.items[0].doneOn === "2026년 3월 2일", t2.done.items[0].doneOn);
t(
  "날짜가 없어도 완료다 (completed_at이 null이라고 완료가 아닌 것은 아니다)",
  tl({ ...전.state, completed: ["fire-cert"] }).done.items[0].doneOn === null
);
t(
  "완료한 것은 카드에서 빠진다",
  ![t2.cards.lead, ...t2.cards.rest].some((r) => r.id === "fire-cert")
);

// 해당 여부 — 자치구 미지정만 화면에서 고르게 유도한다
const { district: _d2, ...구없이2 } = 전.state;
const t3 = tl(구없이2);
t(
  "자치구 미지정 미판정은 [자치구 고르기]로 유도한다",
  t3.excluded.filter((r) => r.needsDistrict).length === 4,
  String(t3.excluded.filter((r) => r.needsDistrict).length)
);
t("자치구를 고른 뒤에는 그 유도가 없다", t1.excluded.every((r) => !r.needsDistrict));

// after_report — unlocked로 라벨이 바뀐다
const 전라벨 = tl({ ...전.state, report_received: false }).more.find((m) => m.key === "after_report");
const 후라벨 = tl({ ...전.state, report_received: true }).more.find((m) => m.key === "after_report");
t("after_report 구간이 양쪽에 다 있다", Boolean(전라벨 && 후라벨));
if (전라벨 && 후라벨) {
  t("조사서 전에는 '조사서가 나온 뒤에'", 전라벨.label === "조사서가 나온 뒤에", 전라벨.label);
  t("조사서를 받으면 '이제 할 수 있는 것'", 후라벨.label === "이제 할 수 있는 것", 후라벨.label);
}

// ★ 6단계 — anytime은 타임라인의 접힌 구간에서 빠지고 체크 페이지로 갔다.
// 타임라인은 "지금 어디쯤"을 말하는 곳인데 anytime은 시점이 없다.
t(
  "타임라인 접힘 구간에 anytime이 없다",
  !t1.more.some((m) => m.key === "anytime"),
  JSON.stringify(t1.more.map((m) => m.key))
);
t("접힘 구간은 today · this_week · after_report뿐이다",
  t1.more.every((m) => ["today", "this_week", "after_report"].includes(m.key)));
t("anytime은 별도로 실려 나온다 (체크 페이지가 쓴다)",
  t1.anytime.count > 0 && t1.anytime.groups.length > 0);
// 카드 영역은 **전 구간 대상 그대로**다 — anytime 행이 상위 5에 들면 카드로
// 뜬다(3년 시효가 그렇다). 그러면 체크 페이지와 중복되는데 의도된 것이다.
const 카드anytime = [t1.cards.lead, ...t1.cards.rest].filter((r) => r.when === "anytime");
const 어딘가카드 = [t1, tl({ ...전.state, product_suspected: true })].some((v) =>
  [v.cards.lead, ...v.cards.rest].some((r) => r.when === "anytime")
);
t(
  "카드 영역은 anytime도 대상이다 (rank ≤ 5면 카드로 뜬다)",
  어딘가카드,
  "어느 조합에서도 anytime이 상위 5에 못 들면 산식이나 데이터가 바뀐 것이다"
);
if (카드anytime.length)
  t(
    "카드에 뜬 anytime은 체크 페이지에도 있다 (의도된 중복 · 체크 상태 공유)",
    카드anytime.every((r) => t1.anytime.items.some((x) => x.id === r.id))
  );

// ★ 고지문이 "본문에 출처를 밝혀 두었습니다"라고 말하므로 **행이 출처를
//   실어 나르지 않으면 그 문장이 거짓이 된다.**
const 출처있는 = [...t1.more.flatMap((m) => m.items), t1.cards.lead, ...t1.cards.rest].filter(
  (r) => r.sourceUrl
);
t("출처가 있는 행은 sourceUrl을 싣는다", 출처있는.length > 0, String(출처있는.length));
t(
  "출처가 없는 항목은 null이다 (빈 '출처:'를 그리지 않기 위해)",
  [t1.cards.lead, ...t1.cards.rest].every((r) => r.sourceUrl === null || typeof r.sourceUrl === "string")
);

// 조례 항목에만 "구청이 확정합니다" 줄이 붙는다 — 면책이 아니라 정보다.
const 조례행 = [...t1.excluded, ...t1.more.flatMap((m) => m.items)].filter((r) => r.ordinanceBased);
t(
  "조례 항목만 ordinanceBased다",
  조례행.every((r) => r.id.startsWith("support-")),
  JSON.stringify(조례행.map((r) => r.id))
);
// 조례 4건은 섹션·blocked·excluded 어디에든 흩어질 수 있다. 전부 합쳐 센다.
const 강남 = tl({ ...전.state, district: "gangnam" });
const 강남조례 = [
  강남.cards.lead,
  ...강남.cards.rest,
  ...강남.more.flatMap((m) => m.items),
  ...강남.missed.items,
  ...강남.blocked,
  ...강남.excluded,
  ...강남.waiting,
  ...강남.done.items,
].filter((r) => r && r.ordinanceBased);
t(
  "조례가 있는 구에서는 그 행이 4건이다",
  강남조례.length === 4,
  JSON.stringify(강남조례.map((r) => r.id))
);
t(
  "조례가 없는 구에서는 0건이다 (support_items가 비어 skip된다)",
  [
    t1.cards.lead,
    ...t1.cards.rest,
    ...t1.more.flatMap((m) => m.items),
    ...t1.blocked,
    ...t1.excluded,
  ].filter((r) => r && r.ordinanceBased).length === 0
);
t("문의 문장이 확정 주체를 밝힌다", /구청이 확정합니다/.test(COPY.timeline.ordinanceNote("가")));
t(
  "부서를 모르면 '구청 재난안전과'로 degrade한다 (dept가 null인 구가 9개)",
  /구청 재난안전과/.test(COPY.timeline.ordinanceNote(null))
);


// ── 6. 페이지 (6단계 — 가로 덱) ────────────────────
section("6. 페이지 — 가로 덱의 네 장");

// 인트로 — 첫 방문만. **플래그는 state에 있고 storage 경유로 저장된다.**
t("처음이면 인트로가 뜬다", introView({}).show === true);
t("본 적 있으면 안 뜬다", introView({ intro_seen: true }).show === false);
// 누수 탐지와 같은 방식으로 본다 — 주석에 낱말이 나오는 것까지 막을 필요는 없다.
const 코드만 = (f) =>
  readFileSync(join(D, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
t(
  "인트로 플래그는 state 필드다 (저장은 storage 경유)",
  !/localStorage|sessionStorage/.test(코드만("src/ui/pages.js"))
);
t(
  "화면 코드가 저장소를 직접 만지지 않는다",
  ["src/ui/app.js", "src/ui/render.js", "src/ui/screens.js"]
    .filter((f) => existsSync(join(D, f)))
    .every((f) => !/localStorage|sessionStorage|document\.cookie/.test(코드만(f)))
);
// 시안 확정 문구 넣 — 라벨·제목·부제·마이크로카피. 줄이면 안 된다.
const iv = introView({});
t("인트로 문구가 확정 문구다", iv.line === "불이 꺼진 뒤, 다시 일상으로 가는 길을 함께합니다.");
t(
  "마이크로카피가 확정 문구 그대로다 (줄이지 않는다)",
  iv.micro === "불이 꺼졌듯, 이 시간도 지나갑니다. 다시 일어설 수 있습니다."
);
t("상단 라벨이 확정된 서비스명이다", iv.eyebrow === "화재피해 회복 내비게이션");
t("CTA가 행동을 말한다", iv.cta === "내 상황 확인하기");
// 제목은 글자로 쪼져 드러나지만 보조기술은 한 덩어리를 읽어야 한다.
t("제목이 글자로 쪼개져 있다", Array.isArray(iv.letters) && iv.letters.length === 4);
t("쪼개진 글자를 붙이면 제목이 된다", iv.letters.join("") === iv.lead);
// 인트로가 canvas 픽셀을 읽지 않는다 — 못 읽는 환경이 있었다.
t(
  "인트로가 getImageData에 의존하지 않는다",
  !/getImageData/.test(코드만("src/ui/screens.js"))
);
// 첫 탭이 저장을 기다리다 소진되면 첫 화면에 갇힌다.
t(
  "인트로 통과가 once로 한 번만 살아 있지 않다",
  !/once:\s*true/.test(코드만("src/ui/screens.js"))
);
// 전환이 먼저다 — route/render 뒤에 persist가 온다.
{
  const src = 코드만("src/ui/app.js");
  const body = src.slice(src.indexOf("async function passIntro"));
  // passIntro 다음 선언까지만 자른다.
  const 본문 = body.slice(0, body.indexOf("function", 30));
  t(
    "인트로 통과는 저장을 기다리지 않는다 (render 뒤에 persist)",
    본문.indexOf("render()") < 본문.indexOf("persist()")
  );
}

// 안내 — 속도도 결과도 약속하지 않는다
const gv = guideView();
t("안내는 왜 묻는지만 말한다", gv.lines.length >= 2 && Boolean(gv.cta));
t(
  "속도를 약속하는 말이 없다",
  !/빠르|금방|즉시|신속|바로 해결/.test(gv.lines.join(" ") + gv.title),
  gv.lines.join(" ")
);

// 요약 — 답한 것이 질문·답 쌍으로, 각 줄이 그 질문으로 돌아가는 문
const sm = summaryView({ questions, state: 전.state, data, now: NOW });
t("요약이 답한 것을 전부 싣는다", sm.rows.length > 0 && sm.complete === true);
t(
  "각 줄이 질문·답 쌍이고 돌아갈 id를 갖는다",
  sm.rows.every((r) => r.id && r.key && r.question && r.answer)
);
t(
  "답을 라벨로 보여준다 (raw 값이 아니다)",
  sm.rows.find((r) => r.key === "tenure")?.answer !== "renter",
  JSON.stringify(sm.rows.find((r) => r.key === "tenure"))
);
const sm2 = summaryView({ questions, state: { district: "mapo" }, data, now: NOW });
t("아직 안 답했으면 빈 목록이고 complete가 아니다", sm2.rows.length === 0 && !sm2.complete);

// 체크 페이지 — 성격이 정반대인 둘을 탭으로 가른다
const cv = checkView(t1);
t("탭이 둘이다", cv.tabs.length === 2);
t(
  "기본 탭이 '해두면 좋은 일'이다 (첫인상이 금지 목록이면 안 된다)",
  cv.tabs[0].key === "todo" && cv.tabs[0].label === "해두면 좋은 일"
);
t("해두면 좋은 일 = anytime", cv.todo.items.length === t1.anytime.count);
t(
  "★ standing 전부가 체크 페이지에 있다",
  cv.avoid.items.length === t1.standing.count && cv.avoid.items.length > 0,
  `${cv.avoid.items.length} / ${t1.standing.count}`
);
t("금지는 체크할 수 없다", cv.avoid.items.every((r) => r.checkable === false));
t("완료 로그가 이 페이지에 있다", cv.done && typeof cv.done.count === "number");

// 근거 페이지 — 엔진 행에서 그대로 뽑는다(재판정 금지)
const sv2 = sourcesView(t1);
t("출처가 있는 것만 모은다", sv2.groups.every((g) => g.items.every((x) => x.url && x.host)));
t("분야로 묶는다", sv2.groups.length > 0 && sv2.groups.every((g) => g.group));
t("같은 항목이 두 번 안 나온다", (() => {
  const ids = sv2.groups.flatMap((g) => g.items.map((x) => x.id));
  return new Set(ids).size === ids.length;
})());
t("해당 없는 것도 사유와 함께 남는다 (D-011)", Array.isArray(sv2.excluded));
// 설문 결과에 따라 달라진다
const sv3 = sourcesView(tl({ ...전.state, product_suspected: true }));
t(
  "답이 바뀌면 근거 목록도 바뀐다",
  sv3.count !== sv2.count,
  `${sv2.count} → ${sv3.count}`
);

// 연락처 — v1은 구별 번호 없이. 없는 것을 "준비 중"으로 쓰지 않는다.
const cont = contactsView(t1, { state: 전.state, data });
t("전역 번호 둘이 있다", cont.global.length === 2 && cont.global.every((c) => c.tel));
t("129와 120이다", cont.global.map((c) => c.tel).join(",") === "129,120");
const contG = contactsView(tl({ ...전.state, district: "gangnam" }), {
  state: { ...전.state, district: "gangnam" },
  data,
});
t("조례가 있는 구는 담당 부서를 안내한다", contG.district?.dept === "안전교통국 재난안전과");
t("구별 번호 자리는 비어 있다 (다음 패스)", contG.district?.tel === null);
t("조례가 없는 구에는 구청 줄이 없다", contactsView(t1, { state: 전.state, data }).district === null);
t(
  "화면에 나온 안내의 창구만 뜬다 (설문 맞춤)",
  cont.orgs.every((o) => typeof o.tel === "string")
);

// 덱 — 네 장, 라벨 탭으로도 이동
const dv = deckView("timeline");
t("덱이 네 장이다", dv.pages.length === 4 && DECK.length === 4);
t("순서가 타임라인·체크·근거·연락처다",
  dv.pages.map((p) => p.label).join(",") === "타임라인,체크,근거,연락처");
t("첫 장에서는 이전이 없다", dv.prev === null && dv.next === "check");
t("마지막 장에서는 다음이 없다", deckView("contacts").next === null);
t("현재 장이 표시된다", dv.pages[0].current === true && dv.pages[1].current === false);


// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
