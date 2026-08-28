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

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
