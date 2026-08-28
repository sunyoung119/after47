// 뷰모델 검증 — 화면이 무엇을 그릴지 정하는 자리
//
// 이 파일이 답해야 할 질문은 하나다.
// "브라우저 없이도 화면의 판단을 전부 검사할 수 있는가."
//
// DOM은 여기 없다. 뷰모델은 순수함수이고, app.js는 여기서 나온 것을 그리기만
// 한다. 세션은 storage.test.mjs가 쓰는 **메모리 백엔드 주입 패턴을 그대로**
// 가져온다 — 브라우저 없이 openSession을 돌리는 방법이 이미 거기 있다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { configureStorage, memoryBackend, saveState } from "../src/storage.js";
import { openSession, anchorSession } from "../src/session.js";
import { evaluate } from "../src/engine.js";
import { applyDefaults } from "../src/questions.js";
import { entryView, surveyView, saveNoticeView, resultPlaceholderView } from "../src/ui/view.js";
import { timelineView, locate, waitLabel } from "../src/ui/timeline.js";
import { forkView, compareView } from "../src/ui/whatif.js";

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
// 1층(결과 화면에서 한 번)은 UI-A②다. 지금 켜면 그 단계의 설계를 먼저 굳힌다.
t("저장이 되는 경우의 1층은 아직 닫혀 있다", saveNoticeView({ persisted: true }).show === false);

// 절대 쓰면 안 되는 문구 — v1에서 거짓이다(D-015)
const 문구 = readFileSync(join(D, "src/ui/copy.js"), "utf8").replace(/\/\/.*$/gm, "");
t(
  "'다른 기기에서도 이어서 보실 수 있습니다'가 문구에 없다",
  !/다른 기기에서도/.test(문구)
);

// ── 4. 결과 자리표시자 ─────────────────────────────
section("4. 결과 자리표시자 — 자르는 것은 UI다");

const 판정 = (state, now = NOW) => evaluate(applyDefaults(questions, state, now), data, now);
const rv = resultPlaceholderView(판정(전.state), data.districts.find((d) => d.id === "mapo"));
t("자치구 이름이 상단에 실린다", rv.basis === "마포구 기준" && rv.hasDistrict);
t("버킷 넷의 개수를 준다", rv.buckets.length === 4 && rv.buckets.every((b) => typeof b.count === "number"));
t("버킷 라벨이 색이 아니라 글자다", rv.buckets.every((b) => typeof b.label === "string" && b.label.length > 0));
t("섹션 개수를 준다", rv.sections.length > 0 && rv.sections.every((x) => typeof x.count === "number"));
t("rank 5 이하만 편다 (자르는 것은 UI다)", rv.top.length <= 5 && rv.top.every((x) => x.rank <= 5));
t("펴는 다섯이 rank 순이다", rv.top.every((x, i, a) => i === 0 || a[i - 1].rank <= x.rank));
t("제목·when·locked를 함께 싣는다", rv.top.every((x) => x.title && x.when && "locked" in x));

// 설문은 다 했는데 자치구만 안 고른 경우 — D-019 §6이 겨냥한 자리다.
const { district: _버림, ...구없이 } = 전.state;
const 미선택 = resultPlaceholderView(판정(구없이), null);
t("자치구 미선택이면 그렇게 말한다", 미선택.basis === "자치구 미선택" && !미선택.hasDistrict);
t(
  "자치구 미선택이면 조례 4건이 전부 미판정이다 (D-019 §6)",
  미선택.undeterminedCount === 4,
  String(미선택.undeterminedCount)
);

// D-003 — 아무것도 답하지 않아도 화면이 나온다. 이때 조례 행이 3건인 것은
// support-housing의 applies_when이 residence_possible을 보기 때문이고,
// 아직 그 질문에 답하지 않았으므로 애초에 대상이 아니다. 결손이 아니다.
const 빈판정 = resultPlaceholderView(판정({ completed: [] }), null);
t("아무것도 답하지 않아도 화면이 나온다 (D-003)", 빈판정.sections.length > 0);
t(
  "이때 미판정은 3건이다 — 거주 가능 여부를 아직 안 물어서다",
  빈판정.undeterminedCount === 3,
  String(빈판정.undeterminedCount)
);
t("standing은 별도로 센다 (rank 경쟁 밖)", rv.standingCount > 0);

// ── 5. 타임라인 ────────────────────────────────────
section("5. 타임라인 — 자르고 접는 것은 UI다");

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

// anytime 비대 — 분야로 한 번 더 묶는다(D-019 §7)
const any = t1.more.find((m) => m.key === "anytime");
if (any) t("anytime은 분야 묶음을 갖는다", any.groups.length > 0 && Boolean(any.groups[0].group));


// ── 6. 갈림길과 자치구 비교 ────────────────────────
section("6. 가정 판정 — 저장하지 않는다");

// 아직 안 답한 상태에서 갈림길이 선다
const 반쯤 = { district: "mapo", completed: [], fire_at: FIRE, residence_possible: false };
const 원본 = JSON.parse(JSON.stringify(반쯤));
const fv = forkView({ questions, state: 반쯤, data, now: NOW });
t("답할 것이 남으면 갈림길 노드가 선다", fv.question !== null, JSON.stringify(fv.remaining));
t("갈림길은 첫 미답 질문이다", fv.question.key === "housing_type", fv.question?.key);
t("선택지마다 미리보기가 붙는다", fv.question.options.every((o) => Array.isArray(o.preview)));
t(
  "미리보기는 2~3개까지만이다 (답하기 전에 화면이 늘지 않게)",
  fv.question.options.every((o) => o.preview.length <= 3 && o.moved.length <= 3)
);

// ★ 이 파일의 핵심 검사 — 가정 답이 state로 새면 그 뒤 판정이 전부 거짓이 된다
t(
  "가정 답이 원본 state를 건드리지 않는다",
  JSON.stringify(반쯤) === JSON.stringify(원본),
  JSON.stringify(반쯤)
);

t("다 답하면 갈림길이 없다", forkView({ questions, state: 전.state, data, now: NOW }).question === null);

// 자치구 비교 — 보기 전환일 뿐이다
const 내상태 = { ...전.state };
const 사본 = JSON.parse(JSON.stringify(내상태));
const cv0 = compareView({ questions, state: 내상태, data, now: NOW });
t("비교 대상을 안 고르면 비활성이다", cv0.active === false && cv0.rows.length === 0);
t("내 구를 뺀 24개를 고를 수 있다", cv0.options.length === 24, String(cv0.options.length));
t("내 구는 목록에 없다", !cv0.options.some((o) => o.id === "mapo"));

const cv = compareView({ questions, state: 내상태, data, now: NOW, otherId: "gangnam" });
t("비교를 켜면 두 구가 잡힌다", cv.active && cv.mine.id === "mapo" && cv.other.id === "gangnam");
t(
  "★ 비교해도 저장 state의 district는 그대로다",
  JSON.stringify(내상태) === JSON.stringify(사본) && 내상태.district === "mapo"
);
t("다른 것만 행으로 나온다", cv.rows.length > 0 && cv.rows.length < 20, String(cv.rows.length));
t(
  "같은 것은 개수로만 말한다",
  typeof cv.sameCount === "number" && cv.sameCount > cv.rows.length,
  `다름 ${cv.rows.length} / 같음 ${cv.sameCount}`
);
t(
  "차이는 조례 항목에서 난다",
  cv.rows.every((r) => r.id.startsWith("support-") || r.id === "no-ordinance-fallback"),
  JSON.stringify(cv.rows.map((r) => r.id))
);
console.log("      실측 — 마포 ↔ 강남:");
for (const r of cv.rows)
  console.log(
    `        ${r.title.slice(0, 26).padEnd(28)}마포 ${(r.mine?.status ?? "없음").padEnd(5)} 강남 ${r.other?.status ?? "없음"}`
  );

// 자치구를 안 고른 사람은 비교 자체가 성립하지 않는다
const { district: _d3, ...구없이3 } = 전.state;
t(
  "내 구를 안 골랐으면 비교를 못 한다",
  compareView({ questions, state: 구없이3, data, now: NOW, otherId: "gangnam" }).mine === null
);


// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
