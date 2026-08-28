// districts.json 검증 — 서울 25개 자치구 전수
//
// 데이터 검사와 판정 검사를 나눈다. 값 분포만 봐도 되는 것과 실제로
// 엔진을 돌려봐야 하는 것이 다르다. 앞쪽은 districts.json만 보고,
// 뒤쪽은 변종별 state를 설계해 evaluate()를 실제로 돌린다.
//
//   node test/districts.test.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { evaluate } from "../src/engine.js";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));
const districts = read("data/districts.json");
const actions = read("data/actions.json");
const data = { actions, districts };

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

const where = (f) => districts.filter(f);

// ── 1. 데이터 ──────────────────────────────────────
section("1. 데이터 — 25개 구가 전부 있고 값이 어휘 안에 있는가");

const SEOUL_25 = [
  "jongno", "jung", "yongsan", "seongdong", "gwangjin",
  "dongdaemun", "jungnang", "seongbuk", "gangbuk", "dobong",
  "nowon", "eunpyeong", "seodaemun", "mapo", "yangcheon",
  "gangseo", "guro", "geumcheon", "yeongdeungpo", "dongjak",
  "gwanak", "seocho", "gangnam", "songpa", "gangdong",
];

t("자치구가 25개다", districts.length === 25, `${districts.length}개`);
const ids = districts.map((d) => d.id);
const absent = SEOUL_25.filter((id) => !ids.includes(id));
t("서울 25개 구 id가 전부 있다", absent.length === 0, `없는 id: ${absent.join(", ")}`);
const unexpected = ids.filter((id) => !SEOUL_25.includes(id));
t("모르는 id가 없다", unexpected.length === 0, unexpected.join(", "));
const dup = ids.filter((v, i, a) => a.indexOf(v) !== i);
t("id 중복 없음", dup.length === 0, dup.join(", "));

// ?d= QR 값이라 나중에 못 바꾼다. 소문자 로마자만.
const badId = ids.filter((id) => !/^[a-z]+$/.test(id));
t("id가 전부 소문자 로마자다 (?d= 파라미터)", badId.length === 0, badId.join(", "));

const FIELDS = [
  "id", "name", "has_ordinance", "ordinance_name", "ordinance_no", "enacted",
  "amended", "dept", "tier", "insurance_exclusion", "deadline_days", "residency",
  "housing_only", "emergency_exception", "amount_source", "amount_known",
  "fallback", "source_url", "checked_at", "support_items", "exclusion_exempt_items",
  "exclusion_note",
];
const lacking = districts.filter((d) => FIELDS.some((f) => !(f in d)));
t(
  "모든 구가 필수 필드를 갖는다 (값이 없으면 null이지 키가 빠지지 않는다)",
  lacking.length === 0,
  lacking.map((d) => `${d.id}: ${FIELDS.filter((f) => !(f in d)).join(",")}`).join(" / ")
);
const extra = districts.flatMap((d) => Object.keys(d).filter((k) => !FIELDS.includes(k)));
t("모르는 필드가 없다", extra.length === 0, [...new Set(extra)].join(", "));

const ENUM = {
  tier: ["full", "minimal", "none"],
  insurance_exclusion: ["none", "enrolled_self", "enrolled_dwelling", "compensated"],
  residency: ["none", "address", "address_and_actual"],
  amount_source: ["attachment", "rule", "mayor", "none"],
};
for (const [field, vocab] of Object.entries(ENUM)) {
  const bad = districts.filter((d) => !vocab.includes(d[field]));
  t(
    `${field} 값이 전부 어휘 안에 있다`,
    bad.length === 0,
    bad.map((d) => `${d.id}=${d[field]}`).join(", ")
  );
}

// 변종이 데이터에서 사라지면 그 판정 경로를 밟는 조합이 없어진다.
// 자치구를 늘리다 한 변종이 0이 되는 것을 여기서 잡는다.
for (const v of ENUM.insurance_exclusion) {
  const has = where((d) => d.insurance_exclusion === v);
  t(
    `insurance_exclusion "${v}" 를 가진 구가 있다 (${has.length}개)`,
    has.length > 0,
    "이 변종을 밟는 조합이 없어졌다"
  );
}
for (const v of ENUM.residency) {
  const has = where((d) => d.residency === v);
  t(`residency "${v}" 를 가진 구가 있다 (${has.length}개)`, has.length > 0);
}

const VOCAB = ["psych", "waste", "housing", "supplies", "meal"];
const badItems = districts.filter((d) => d.support_items.some((x) => !VOCAB.includes(x)));
t(
  "support_items 값이 전부 어휘 안에 있다",
  badItems.length === 0,
  badItems.map((d) => `${d.id}: ${d.support_items.join(",")}`).join(" / ")
);
const dupItems = districts.filter(
  (d) => new Set(d.support_items).size !== d.support_items.length
);
t("support_items에 중복이 없다", dupItems.length === 0, dupItems.map((d) => d.id).join(", "));
const badExempt = districts.filter((d) =>
  d.exclusion_exempt_items.some((x) => !d.support_items.includes(x))
);
t(
  "exclusion_exempt_items는 그 구가 지원하는 항목 안에 있다",
  badExempt.length === 0,
  badExempt.map((d) => d.id).join(", ")
);

// 조례 유무와 나머지 필드의 정합성
const ordCount = where((d) => d.has_ordinance).length;
t(
  "조례 보유 13 / 미보유 12",
  ordCount === 13 && districts.length - ordCount === 12,
  `보유 ${ordCount} / 미보유 ${districts.length - ordCount}`
);
const noOrdBad = where(
  (d) =>
    !d.has_ordinance &&
    (d.tier !== "none" ||
      d.support_items.length ||
      d.ordinance_name !== null ||
      d.insurance_exclusion !== "none" ||
      d.residency !== "none" ||
      d.amount_source !== "none")
);
t(
  "조례 미보유 구는 조례 관련 값이 전부 비어 있다",
  noOrdBad.length === 0,
  noOrdBad.map((d) => d.id).join(", ")
);
const ordBad = where(
  (d) =>
    d.has_ordinance &&
    (d.tier === "none" || !d.support_items.length || !d.ordinance_name || !d.ordinance_no)
);
t(
  "조례 보유 구는 조례명·조례번호·지원항목을 갖는다",
  ordBad.length === 0,
  ordBad.map((d) => d.id).join(", ")
);

// 원문에 없는 값은 추정하지 않는다. 신규 구는 확인 경로가 없어 dept가 null이고,
// fallback은 그 구의 사회재난 조례를 실제로 확인한 마포에만 있다.
t(
  "금액은 25개 구 전부 미상이다 (D-003의 degrade가 유일한 경로)",
  districts.every((d) => d.amount_known === false)
);
t(
  "dept가 null인 구가 있다 — UI가 '구청 문의'로 degrade해야 한다",
  where((d) => d.dept === null).length > 0
);
t(
  "fallback 문구는 실제로 확인한 구에만 있다",
  where((d) => d.fallback !== null).every((d) => d.id === "mapo"),
  where((d) => d.fallback !== null).map((d) => d.id).join(", ")
);

// exclusion_note는 기록용이다. 엔진이 읽으면 판정 규칙이 두 곳으로 흩어진다.
t(
  "exclusion_note를 engine.js가 읽지 않는다 (판정에 쓰지 않는 기록 필드)",
  !readFileSync(join(D, "src/engine.js"), "utf8").includes("exclusion_note")
);
t(
  "원문이 enum에 정확히 안 맞는 구는 exclusion_note로 그 사실을 남긴다",
  where((d) => d.exclusion_note !== null).length > 0,
  "근사한 것이 기록되지 않으면 나중에 판독 실수로 보인다"
);

// ── 2. 긴급급식 — 대응 Action이 없는 것은 의도다 ────
section("2. meal — 조례에는 있고 Action에는 없다 (결손이 아니다)");

// ★ 지우지 마라. `meal`을 support_items에 남기는 것과 meal Action을 만들지
//   않는 것은 둘 다 결정이다.
//
//   · support_items의 meal은 **조례가 무엇을 지원한다고 써놨는지의 기록**이다.
//     지우면 데이터가 조례를 틀리게 기술한다.
//   · meal Action을 만들지 않는 이유는 **집행이 확인되지 않아서**다. 급식
//     조항은 7개 구에 있고 전부 "구청장이 예산의 범위에서 지원할 수 있다"는
//     재량 규정이다. 금액·기간·신청서식이 없고 하위 규칙은 25개 구 전수조사에서
//     0건이다. 대피소 급식 체계에 얹힌 항목이라 개별 주택화재에서 집행되는
//     그림이 없다. 실행되는지 확인 안 된 제도는 안내하지 않는다(D-020 초안).
//
//   이 테스트가 없으면 다음 사람이 "meal만 Action이 없네"를 결손으로 읽고
//   되살린다. 아래 0건은 **버그가 아니라 결정의 관측점**이다.
const mealDistricts = where((d) => d.support_items.includes("meal"));
t(
  `긴급급식 조항을 가진 구가 7개다 (${mealDistricts.map((d) => d.name).join("·")})`,
  mealDistricts.length === 7,
  `${mealDistricts.length}개: ${mealDistricts.map((d) => d.id).join(", ")}`
);
const mealActions = actions.filter((a) => a.support_item === "meal");
t(
  "support_item이 meal인 Action은 0건이다 — 의도다 (집행 미확인. D-020 초안)",
  mealActions.length === 0,
  `되살아났다: ${mealActions.map((a) => a.id).join(", ")}`
);

const ITEM_ACTIONS = ["psych", "waste", "housing", "supplies"];
const covered = [...new Set(actions.filter((a) => a.support_item).map((a) => a.support_item))];
t(
  "meal을 뺀 네 항목은 전부 대응 Action이 있다",
  ITEM_ACTIONS.every((x) => covered.includes(x)),
  `없는 항목: ${ITEM_ACTIONS.filter((x) => !covered.includes(x)).join(", ")}`
);

// ── 3. 판정 ────────────────────────────────────────
section("3. 판정 — 변종별 state를 실제로 돌린다");

const FIRE_AT = "2026-03-01T12:00:00.000Z";
const NOW = Date.parse(FIRE_AT) + 3 * 36e5; // +3h. 신청기한 30일 안이라 기한 도과가 안 섞인다

// 조례 판정만 남기기 위한 베이스. 거주 요건·주택 한정·보험 셋 다 통과하는 값이다
// (판정 순서가 support_items → housing_only → residency → 보험이라, 앞의 것이
// 걸리면 뒤가 가려진다). 각 검사는 여기서 필요한 키 하나씩만 뒤집는다.
const BASE = {
  fire_at: FIRE_AT,
  tenure: "renter",
  housing_type: "officetel",
  registered_resident: true,
  insurance_self: false,
  insurance_dwelling: false,
  compensated: false,
  residence_possible: false, // support-housing의 applies_when
  origin_area: "common",
  product_suspected: "unknown",
  scene_preserved: false,
  wet_appliances: true,
  powder_present: true,
  other_units_affected: false,
  water_damage_role: "none",
  adjuster_present: false,
  product_maker_contacted: false,
  report_received: false,
  completed: [],
};

// 모든 버킷·섹션의 행을 id로 모은다. skip된 항목은 어디에도 없다.
const allRows = (r) => {
  const m = new Map();
  r.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((x) => m.set(x.action.id, x))));
  [...r.done, ...r.waiting, ...r.blocked, ...r.excluded].forEach((x) => m.set(x.action.id, x));
  return m;
};
const ordRows = (state) => {
  const m = allRows(evaluate({ ...BASE, ...state }, data, NOW));
  return new Map([...m].filter(([id]) => id.startsWith("support-")));
};
const statusOf = (state) => [...ordRows(state).values()].map((x) => x.status);

// 3-1. 전부 돈다
const threw = [];
for (const d of districts) {
  try {
    const r = evaluate({ ...BASE, district: d.id }, data, NOW);
    if (!r.sections.length) threw.push(`${d.id}: 섹션 0개`);
  } catch (e) {
    threw.push(`${d.id}: ${e.message}`);
  }
}
t("25개 구 전부 evaluate가 예외 없이 돌고 화면이 나온다", threw.length === 0, threw.join(" / "));

// 3-2. 조례 행 수 == support_items ∩ 네 항목
// skip된 항목은 어느 버킷에도 행이 없다. meal은 대응 Action이 없어 세지 않는다.
// 이 하나가 support_items 매핑 오류를 대부분 잡는다.
const wrongCount = [];
for (const d of districts) {
  const want = d.support_items.filter((x) => ITEM_ACTIONS.includes(x)).length;
  const got = ordRows({ district: d.id }).size;
  if (want !== got) wrongCount.push(`${d.id}: 기대 ${want} / 실제 ${got}`);
}
t(
  "각 구의 조례 행 수 == support_items ∩ {psych,waste,housing,supplies}",
  wrongCount.length === 0,
  wrongCount.join(" / ")
);

// 3-3. 보험 변종 — 제외는 emergency_exception이 있으면 `조건부`로 뜬다
// "제외됩니다"로 끝내지 않고 "구청장 긴급 예외가 있으니 문의"까지 가는 구가
// 6개라, 검사도 그 구에서는 조건부를 기대값으로 받는다.
const isExcluded = (s) => s === "제외" || s === "조건부";
const expectStatus = (d) => (d.emergency_exception ? "조건부" : "제외");

for (const d of where((x) => x.insurance_exclusion === "enrolled_self")) {
  const on = statusOf({ district: d.id, insurance_self: true });
  t(
    `${d.name}(enrolled_self) · 본인 보험 가입 → 전부 ${expectStatus(d)}`,
    on.length > 0 && on.every((s) => s === expectStatus(d)),
    JSON.stringify(on)
  );
  const unknown = statusOf({ district: d.id, insurance_self: "unknown" });
  t(
    `${d.name}(enrolled_self) · 본인 보험 모름 → 전부 미판정`,
    unknown.length > 0 && unknown.every((s) => s === "미판정"),
    JSON.stringify(unknown)
  );
  const off = statusOf({ district: d.id, insurance_dwelling: true });
  t(
    `${d.name}(enrolled_self) · 건물 보험만 있으면 해당 (본인 보험만 본다)`,
    off.length > 0 && off.every((s) => s === "해당"),
    JSON.stringify(off)
  );
}

for (const d of where((x) => x.insurance_exclusion === "enrolled_dwelling")) {
  const on = statusOf({ district: d.id, insurance_dwelling: true });
  t(
    `${d.name}(enrolled_dwelling) · 건물 보험 가입 → 전부 ${expectStatus(d)}`,
    on.length > 0 && on.every((s) => s === expectStatus(d)),
    JSON.stringify(on)
  );
  const unknown = statusOf({ district: d.id, insurance_dwelling: "unknown" });
  t(
    `${d.name}(enrolled_dwelling) · 건물 보험 모름 → 전부 미판정`,
    unknown.length > 0 && unknown.every((s) => s === "미판정"),
    JSON.stringify(unknown)
  );
}

for (const d of where((x) => x.insurance_exclusion === "compensated")) {
  const rows = ordRows({ district: d.id, compensated: true });
  const exempt = d.exclusion_exempt_items;
  const hit = [...rows].filter(([, x]) => isExcluded(x.status));
  const alive = [...rows].filter(([, x]) => x.status === "해당");
  t(
    `${d.name}(compensated) · 보험금 수령 → 예외 항목을 뺀 나머지가 ${expectStatus(d)}`,
    hit.length > 0 && hit.every(([, x]) => x.status === expectStatus(d)),
    JSON.stringify([...rows].map(([id, x]) => `${id}=${x.status}`))
  );
  t(
    `${d.name} · 제외 예외 항목 ${exempt.length}건이 살아남는다`,
    alive.length === exempt.length &&
      alive.every(([id]) => exempt.some((x) => id === `support-${x}`)),
    `살아남은 것: ${alive.map(([id]) => id).join(", ")} / 예외: ${exempt.join(", ")}`
  );
  // compensated는 3상태 키가 아니다(q-compensated의 값은 true/false뿐).
  // 여기에 미판정이 생기면 설문부터 바뀐 것이다.
  const unknown = statusOf({
    district: d.id,
    insurance_self: "unknown",
    insurance_dwelling: "unknown",
  });
  t(
    `${d.name}(compensated) · 보험 가입 여부를 몰라도 미판정이 아니다`,
    !unknown.includes("미판정"),
    JSON.stringify(unknown)
  );
}

for (const d of where((x) => x.insurance_exclusion === "none" && x.has_ordinance)) {
  for (const [label, s] of [
    ["본인 가입", { insurance_self: true }],
    ["건물 가입", { insurance_dwelling: true }],
    ["보험금 수령", { compensated: true }],
    ["전부 모름", { insurance_self: "unknown", insurance_dwelling: "unknown" }],
  ]) {
    const got = statusOf({ district: d.id, ...s });
    t(
      `${d.name}(none) · ${label} — 보험과 무관하게 해당`,
      got.length > 0 && got.every((x) => x === "해당"),
      JSON.stringify(got)
    );
  }
}

// 3-4. 거주 요건 · 주택 한정
for (const d of where((x) => x.residency === "address_and_actual")) {
  const got = statusOf({ district: d.id, registered_resident: false });
  t(
    `${d.name} · 전입신고 안 한 임차인 → ${expectStatus(d)}`,
    got.length > 0 && got.every((s) => s === expectStatus(d)),
    JSON.stringify(got)
  );
}
for (const d of where((x) => x.housing_only)) {
  const got = statusOf({ district: d.id, housing_type: "other" });
  t(
    `${d.name} · 주택이 아니면 ${expectStatus(d)} (보험보다 먼저 걸린다)`,
    got.length > 0 && got.every((s) => s === expectStatus(d)),
    JSON.stringify(got)
  );
}

// 3-5. 신청기한
for (const d of where((x) => x.deadline_days !== null)) {
  const late = Date.parse(FIRE_AT) + (d.deadline_days + 5) * 24 * 36e5;
  const rows = allRows(evaluate({ ...BASE, district: d.id }, data, late));
  const ord = [...rows].filter(([id]) => id.startsWith("support-"));
  t(
    `${d.name} · 신청기한 ${d.deadline_days}일이 지나면 ${expectStatus(d)}`,
    ord.length > 0 && ord.every(([, x]) => isExcluded(x.status)),
    JSON.stringify(ord.map(([id, x]) => `${id}=${x.status}`))
  );
}

// 3-6. 자치구 미지정 · 조례 미보유
const undetermined = statusOf({});
t(
  "자치구를 안 고르면 조례 4건이 전부 미판정이다 (D-019 §6)",
  undetermined.length === 4 && undetermined.every((s) => s === "미판정"),
  JSON.stringify(undetermined)
);

const noOrd = where((d) => !d.has_ordinance);
const missingFallback = noOrd.filter(
  (d) => !allRows(evaluate({ ...BASE, district: d.id }, data, NOW)).has("no-ordinance-fallback")
);
t(
  `조례 미보유 ${noOrd.length}개 구에서 no-ordinance-fallback이 켜진다`,
  missingFallback.length === 0,
  missingFallback.map((d) => d.id).join(", ")
);
const wrongFallback = where((d) => d.has_ordinance).filter((d) =>
  allRows(evaluate({ ...BASE, district: d.id }, data, NOW)).has("no-ordinance-fallback")
);
t(
  "조례 보유 구에서는 안 켜진다",
  wrongFallback.length === 0,
  wrongFallback.map((d) => d.id).join(", ")
);
t(
  "조례 미보유 구에는 조례 행이 0건이다",
  noOrd.every((d) => ordRows({ district: d.id }).size === 0),
  noOrd.filter((d) => ordRows({ district: d.id }).size).map((d) => d.id).join(", ")
);

// ── 구별 전수 출력 ─────────────────────────────────
section("4. 구별 판정 전수 (제외 조건을 밟지 않는 기본 state)");
console.log(
  `      ${"id".padEnd(13)}${"계열".padEnd(8)}${"보험".padEnd(18)}${"거주".padEnd(19)}조례 행`
);
for (const d of districts) {
  const items =
    [...ordRows({ district: d.id }).keys()].map((id) => id.replace("support-", "")).join(",") ||
    "(없음)";
  console.log(
    `      ${d.id.padEnd(13)}${d.tier.padEnd(8)}${d.insurance_exclusion.padEnd(18)}` +
      `${d.residency.padEnd(19)}${items}`
  );
}

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
