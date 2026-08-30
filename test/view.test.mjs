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
import { contactOf, sourcesView, directoryView } from "../src/ui/result.js";
import { COPY, STATUS_LABEL } from "../src/ui/copy.js";
import { TOPIC_LABEL, TOPIC_ORDER, NODE_LABEL, topicLabel } from "../src/ui/copy.js";
import {
  landingView, basicCheckView, masterView, scopeNoticeView, transitionView, revisitView,
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

// ── 1. 진입 ────────────────────────────────────────
section("1. 진입 — notice 다섯 종과 notice가 없는 여섯째");

// (1) QR로 정상 진입
새백엔드();
let s = await openSession({ url: "https://after47.kr/?d=mapo" });
let v = entryView(s);
t("① ?d=mapo → district_needed 배너가 없다", !bannerTypes(v).includes("district_needed"));
t("① 보이는 구가 마포다", v.district?.id === "mapo" && v.district.name === "마포구");

// (2) 자치구를 모르는 두 경우 — 이유가 다르면 문구도 달라야 한다
새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/" }));
t("② ?d= 없음 → 자치구를 알려 달라는 배너가 뜬다", bannerTypes(v).includes("district_needed"));
const missingText = v.banners.find((b) => b.type === "district_needed")?.text;

새백엔드();
v = entryView(await openSession({ url: "https://after47.kr/?d=bucheon" }));
t("② 서울 밖 값(bucheon)도 같은 배너를 낸다", bannerTypes(v).includes("district_needed"));
t(
  "② 두 경우의 문구가 다르다 (모르는 값은 '다시 골라 주세요')",
  v.banners.find((b) => b.type === "district_needed")?.text !== missingText
);
// 지역 목록은 이제 확정 화면 `기본 확인`의 필드가 갖는다 — 절 7이 본다.

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
t("고른 구가 보인다", 고른뒤.district?.id === "gangnam");

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
  t("연락처가 8건이다", dv.count === 8, String(dv.count));
  t(
    "그룹 순서가 긴급 → 복지 → 법률 → 심리다",
    dv.groups.map((g) => g.group).join(" → ") === "긴급 → 복지·긴급지원 → 법률·분쟁 → 심리",
    dv.groups.map((g) => g.group).join(" → ")
  );
  t("네 그룹이 다 있다", dv.groups.length === 4);
  t("전부 tel: 링크를 만든다", dv.groups.every((g) => g.items.every((c) => c.telHref === `tel:${c.tel}`)));
  t("'검증됨'·'공식 인증' 같은 과장이 없다", !/검증됨|공식 인증/.test(JSON.stringify(dv)));

  // 자치구 줄 — 조례 안내가 화면에 있을 때만, **번호 없이.**
  t("조례가 없는 구에는 구청 줄이 없다", dv.district === null);
  const 강남state = { ...전.state, district: "gangnam" };
  const dvG = directoryView(바탕(강남state));
  t("조례가 있는 구는 담당 부서를 안내한다", dvG.district?.dept === "안전교통국 재난안전과");
  t("구별 번호 자리는 비어 있다 (보류 유지)", dvG.district?.tel === null);
  t("부서를 모르면 '구청 재난안전 담당 부서'로 degrade한다",
    /재난안전 담당 부서/.test(COPY.contacts.deptUnknown("도봉구")));
}

// 근거 법령 화면 — 그 사람 안내들의 sources를 묶는다. **재판정하지 않는다.**
{
  const 물 = 바탕({ ...전.state, district: "gangnam", water_damage_home: true, residence_possible: false });
  const sv = sourcesView(물);
  t("근거가 하나 이상 있다", sv.count > 0, String(sv.count));
  t("그룹 키가 어휘 안에 있다",
    sv.groups.every((g) => ["law", "public_guidance", "case", "academic"].includes(g.key)),
    sv.groups.map((g) => g.key).join(","));
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
// 전환이 먼저다 — route/render 뒤에 persist가 온다.
{
  const src = 코드만("src/ui/app.js");
  const body = src.slice(src.indexOf("async function passLanding"));
  const 본문 = body.slice(0, body.indexOf("function", 30));
  t(
    "랜딩 통과는 저장을 기다리지 않는다 (render 뒤에 persist)",
    본문.indexOf("render()") < 본문.indexOf("persist()")
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
}
{
  const html = readFileSync(join(D, "index.html"), "utf8");
  const refs = html.match(/(?:href|src)="src\/ui\/[^"]+"/g) || [];
  // ★ 값까지 본다. 존재만 보면 "올리는 것을 잊은 배포"를 못 잡는다 —
  //   화면 파일을 고치면서 v를 올리면 **이 줄의 숫자도 함께 올린다.**
  const V = "?v=13";
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
t("이음말이 '을 바탕으로'다", tr.basisTail === "을 바탕으로");
t("전환 문구가 확정 한 줄이다", tr.message === "당신의 회복에 필요한 내용을 안내합니다.", tr.message);
t("전환 CTA가 '내 회복 경로 보기'다", tr.cta === "내 회복 경로 보기");
// 자치구를 못 고른 사람에게 빈 조각을 그리지 않는다.
const tr구없이 = transitionView({ state: { fire_at: FIRE }, data, now: Date.parse(FIRE) + 27 * 36e5 });
t("값이 없는 조각은 빠진다", tr구없이.basis.length === 2, tr구없이.basis.join(" · "));
t(
  "'AI 분석 중'·'결과 생성 중'류 표현이 없다",
  ![tr.title, ...tr.basis, tr.message, tr.cta].some((s) => /AI|분석 중|생성 중|처리 중/.test(s))
);

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
t("게이트 CTA가 '안내 보기'다", 게이트.cta === "안내 보기");
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

// HOME — 카드 셋과 보조 둘. 개수는 동적이다.
t("HOME 제목이 '내 회복 경로'다", r1.home.title === "내 회복 경로");
t("HOME 리드가 확정 문구다", r1.home.lead === "지금 필요한 안내를 정리했습니다.");
// 확정 화면이 경과시간 칩을 걷고 문장 한 줄로 바꿨다.
t("경과시간 칩이 없다", !("chip" in r1.home));
t(
  "기준 줄이 자치구 · 경과 · 상황이다",
  r1.home.basis === "마포구 · 화재 발생 후 3시간 · 당신의 상황을 기준으로",
  r1.home.basis
);
t("기준 줄에 현재 시각이 없다", !/\d{2}:\d{2}/.test(r1.home.basis), r1.home.basis);
t(
  "핵심 카드가 셋이고 확정 제목·설명이다",
  r1.home.cards.map((c) => `${c.title}/${c.desc}`).join(" | ") ===
    "먼저 볼 내용/제일 먼저 확인해야 할 정보 | 체크리스트/하나씩 해나가야 하는 일 | 알아둘 내용/당장은 하지 않아도 되는 정보",
  r1.home.cards.map((c) => `${c.title}/${c.desc}`).join(" | ")
);
// 화면 이름 그대로다 — 눌러서 가는 곳의 이름과 라벨이 같아야 한다.
t(
  "보조 탐색이 둘이고 화면 이름 그대로다",
  r1.home.more.map((m) => m.label).join(",") === "회복 타임라인,주제별 보기",
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
