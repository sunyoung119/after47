// questions.json 검증
// 핵심 질문: "설문만으로 레퍼런스 케이스의 state에 도달할 수 있는가"
// 손으로 채운 state로 엔진을 돌리면 통과하지만 실제 UI에서는 안 도는 상황을 잡는다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { evaluate, deriveState } from "../src/engine.js";
import { resolveDistrict, visibleQuestions, applyDefaults, pruneStale } from "../src/questions.js";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));
const questions = read("data/questions.json");
const data = { actions: read("data/actions.json"), districts: read("data/districts.json") };

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

// 자치구에서 파생되는 값 + 저장 계층이 채우는 값. 질문이 없어도 되는 키.
const DERIVED = [
  "district_has_ordinance",
  "district_residency",
  "district_insurance_exclusion",
  "elapsed_hours",
  "elapsed_bucket",
];
const NOT_ASKED = {
  district: "URL 파라미터 ?d=",
  completed: "저장 계층",
  completed_at: "저장 계층",
};

// ── 1. 구조 ────────────────────────────────────────
section("1. questions.json 구조");

const FIELDS = ["id", "key", "text", "type", "options", "ask_when", "help"];
const missing = questions.filter((q) => FIELDS.some((f) => !(f in q)));
t("모든 질문이 필수 필드를 갖는다", missing.length === 0, missing.map((q) => q.id).join(", "));

const dupId = questions.map((q) => q.id).filter((v, i, a) => a.indexOf(v) !== i);
const dupKey = questions.map((q) => q.key).filter((v, i, a) => a.indexOf(v) !== i);
t("id 중복 없음", dupId.length === 0, dupId.join(", "));
t("key 중복 없음", dupKey.length === 0, dupKey.join(", "));

const badOpts = questions.filter(
  (q) =>
    q.type === "single" &&
    (!Array.isArray(q.options) ||
      !q.options.length ||
      q.options.some((o) => !("value" in o) || typeof o.label !== "string"))
);
t("single 질문은 모두 options를 갖는다", badOpts.length === 0, badOpts.map((q) => q.id).join(", "));

// "모름"은 반드시 "unknown" 문자열이다. null은 matches()에서 true 조건에도
// false 조건에도 안 걸려서, 모른다고 답한 사람이 양쪽 안내를 다 못 받는다.
// 조건 데이터만 봐서는 알아챌 수 없는 종류의 버그라 여기서 막는다. (D-013)
const nullOption = questions.filter((q) => (q.options || []).some((o) => o.value === null));
t(
  '"모름"을 null로 두지 않는다 (D-013)',
  nullOption.length === 0,
  `${nullOption.map((q) => q.id).join(", ")} 의 선택지에 null이 있다. "unknown"을 써라`
);

// 같은 값을 가진 선택지가 둘이면 UI에서 하나를 고를 때 다른 것도 선택돼 보인다.
const dupOption = questions.filter((q) => {
  const vs = (q.options || []).map((o) => JSON.stringify(o.value));
  return new Set(vs).size !== vs.length;
});
t(
  "한 질문 안에 값이 같은 선택지가 없다",
  dupOption.length === 0,
  dupOption.map((q) => `${q.id}: ${q.options.map((o) => JSON.stringify(o.value)).join(" ")}`).join(" / ")
);

const badDefault = questions.filter((q) => {
  if (!("default" in q)) return false;
  if (q.type === "date") return q.default !== "today";
  return !q.options.some((o) => o.value === q.default);
});
t("default는 options 안의 값이다", badDefault.length === 0, badDefault.map((q) => q.id).join(", "));

// ── 2. ask_when이 살아 있는가 ──────────────────────
// q-maker가 죽은 조건이었던 것과 같은 사고를 막는다.
section("2. ask_when - 죽은 조건 없음");

const keyIndex = new Map(questions.map((q, i) => [q.key, i]));
const DISTRICT_FIELD = {
  district_residency: "residency",
  district_insurance_exclusion: "insurance_exclusion",
  district_has_ordinance: "has_ordinance",
};

for (const [i, q] of questions.entries()) {
  if (!q.ask_when) continue;
  for (const [k, v] of Object.entries(q.ask_when)) {
    const derived = DERIVED.includes(k);
    const src = keyIndex.get(k);
    const want = Array.isArray(v) ? v : [v];

    t(
      `${q.id} · ask_when.${k} 를 채울 수단이 있다`,
      derived || src !== undefined,
      `${k}를 채우는 질문도 파생값도 없다`
    );

    if (!derived && src !== undefined) {
      t(
        `${q.id} · ${k} 를 묻는 질문이 앞에 있다`,
        src < i,
        `${questions[src].id}(${src}번)가 ${q.id}(${i}번)보다 뒤에 있다`
      );
      const have = questions[src].options.map((o) => o.value);
      const unreachable = want.filter((x) => !have.includes(x));
      t(
        `${q.id} · ask_when.${k} 값이 실제 선택지에 있다`,
        unreachable.length === 0,
        `선택할 수 없는 값: ${JSON.stringify(unreachable)}`
      );
    }

    if (derived && DISTRICT_FIELD[k]) {
      const have = data.districts.map((d) => d[DISTRICT_FIELD[k]]);
      t(
        `${q.id} · ask_when.${k} 값을 가진 자치구가 있다`,
        want.some((x) => have.includes(x)),
        `현재 자치구 데이터에 ${JSON.stringify(want)}가 없다`
      );
    }
  }
}

// ── 3. state 키 커버리지 ───────────────────────────
// 엔진이 읽는 키를 데이터와 소스에서 긁어 온다. 손으로 관리하면 또 어긋난다.
section("3. 엔진이 읽는 state 키를 전부 채울 수 있는가");

const used = new Set();
for (const a of data.actions) {
  Object.keys(a.applies_when || {}).forEach((k) => used.add(k));
  Object.keys(a.excluded_when || {}).forEach((k) => used.add(k));
}
const engineSrc = readFileSync(join(D, "src/engine.js"), "utf8");
for (const m of engineSrc.matchAll(/\bstate\.([a-z_]+)/g)) used.add(m[1]);

// 질문이 아니라 저장 계층이 채우는 키. 설문을 끝내도 비어 있는 것이 정상이다.
const STORAGE_KEYS = Object.keys(NOT_ASKED).filter((k) => k !== "district");
const asked = new Set(questions.map((q) => q.key));
for (const k of [...used].sort()) {
  if (DERIVED.includes(k)) continue;
  const how = asked.has(k) ? "질문" : NOT_ASKED[k];
  t(`${k.padEnd(24)} <- ${how || "??"}`, Boolean(how), "이 키를 채우는 질문이 없다");
}

const orphan = [...asked].filter((k) => !used.has(k));
t("쓰이지 않는 질문이 없다", orphan.length === 0, `아무 조건도 읽지 않는 키: ${orphan.join(", ")}`);

// ── 4. 자치구 유입 (D-012) ─────────────────────────
section("4. 자치구 유입 - QR 없이도 들어올 수 있는가");

const urlCases = [
  ["https://after47.kr/?d=mapo", "mapo", false],
  ["?d=gangnam", "gangnam", false],
  // 25개 전수를 채운 뒤로 "아직 안 채운 구"가 없어졌다. 서울 자치구가
  // 아닌 값으로 바꾼다 — 이웃 도시 QR이나 잘못 온 링크가 그 자리다.
  ["?d=bucheon", null, true],
  ["?d=<script>", null, true],
  ["/", null, true],
  [null, null, true],
];
for (const [url, id, picker] of urlCases) {
  const r = resolveDistrict(url, data.districts);
  t(
    `${String(url).padEnd(26)} -> ${picker ? "선택 화면" : id}`,
    r.id === id && r.needsPicker === picker,
    JSON.stringify({ id: r.id, needsPicker: r.needsPicker })
  );
}

let noDistrictOk = true;
try {
  noDistrictOk = evaluate(applyDefaults(questions, { completed: [] }), data).sections.length > 0;
} catch (e) {
  noDistrictOk = false;
}
t("구 미선택이어도 엔진이 돌아간다", noDistrictOk);

// ── 5. 레퍼런스 케이스 ─────────────────────────────
// 오피스텔 임차인 / 현관등(공용부) 발화 / 제조물 의심 / 본인·집주인 보험 없음 / 건물 보험 존재
section("5. 레퍼런스 케이스 - 설문만으로 state에 도달하는가");

// 질문 순서대로 훑으면서 ask_when을 매번 다시 본다. 앞 답이 뒤 질문을 연다.
function runSurvey(base, answers) {
  const state = { ...base };
  const askedIds = [];
  for (const q of questions) {
    if (!visibleQuestions(questions, state, data).some((v) => v.id === q.id)) continue;
    askedIds.push(q.id);
    if (q.key in answers) state[q.key] = answers[q.key];
  }
  return { state: applyDefaults(questions, state), askedIds };
}

const buckets = (r) => {
  const m = new Map();
  r.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((x) => m.set(x.action.id, s.key))));
  r.waiting.forEach((x) => m.set(x.action.id, "waiting"));
  r.blocked.forEach((x) => m.set(x.action.id, "blocked"));
  r.excluded.forEach((x) => m.set(x.action.id, `excluded:${x.status}`));
  return m;
};

const COMMON = {
  residence_possible: false,
  housing_type: "officetel",
  tenure: "renter",
  registered_resident: true,
  insurance_self: false,
  insurance_dwelling: true,
  scene_preserved: true,
  powder_present: true,
  wet_appliances: true,
  other_units_affected: false,
  water_damage_home: false,
  water_damage_neighbor: false,
};

const SCENES = [
  [
    "화면1 - 화재 당일 (원인 아직 모름)",
    {
      ...COMMON,
      origin_area: "unknown",
      // origin_area가 unknown이면 제품 질문을 묻지 않는다(설문 확정본).
      // 그래도 default "unknown"이 판정 사본을 채워 제품 금지는 그대로 뜼다(D-013).
      adjuster_present: false,
    },
    [
      "ppe-powder",
      "wet-appliance-power",
      "photo-before-cleanup",
      "preserve-product",
      "product-handover-caution",
      "scene-preserved-hold",
    ],
  ],
  [
    "화면2 - 손해사정사 등장, 제조사 접촉",
    {
      ...COMMON,
      // 현관등 발화를 문서가 공용부로 보고 있다(reference-case). 원인을 들은
      // 상태여야 제품·제조사 질문이 등장한다 — 제조사 접촉은 제품 의심을
      // 들은 뒤에 일어나는 사건이고, 그 순서를 게이트가 그대로 지킨다.
      origin_area: "common",
      product_suspected: "unknown",
      adjuster_present: true,
      product_maker_contacted: true,
    },
    [
      "adjuster-position",
      "adjusters-may-all-be-opposing",
      "my-side-channels-overview",
      "product-maker-position-may-change",
      "preserve-product",
      // 본인 보험 없음 + 건물 보험 있음 = 레퍼런스 케이스의 조합.
      // 조건이 insurance_dwelling:false 를 요구하던 동안 이 안내가 안 떴다.
      "no-personal-insurance-building-path",
    ],
  ],
  [
    "화면3 - 조사서 수령, 공용부 발화 + 제조물 결함 확인",
    {
      ...COMMON,
      origin_area: "common",
      product_suspected: true,
      adjuster_present: true,
      product_maker_contacted: true,
    },
    [
      "common-area-liability",
      "common-area-management-role",
      "recall-lookup",
      "product-defect-presumption",
      "dispute-mediation",
      "product-claim-limitation",
    ],
  ],
];

for (const [label, answers, expect] of SCENES) {
  console.log(`\n▼ ${label}`);
  const { state, askedIds } = runSurvey({ district: "mapo", completed: [] }, answers);

  // (a) 답한 값이 전부 실제로 물어본 질문에서 나왔는가
  const askedKeys = new Set(askedIds.map((id) => questions.find((q) => q.id === id).key));
  const smuggled = Object.keys(answers).filter((k) => !askedKeys.has(k));
  t(
    `답변 ${Object.keys(answers).length}개가 모두 실제 질문에서 나온다 (물어본 질문 ${askedIds.length}개)`,
    smuggled.length === 0,
    `질문 없이 들어간 키: ${smuggled.join(", ")}`
  );

  // (b) 엔진이 읽는 키 중 undefined가 남지 않았는가
  const s = deriveState(state, data);
  const holes = [...used].filter(
    (k) => !DERIVED.includes(k) && !STORAGE_KEYS.includes(k) && s[k] === undefined
  );
  t("엔진이 읽는 키에 빈 값이 없다", holes.length === 0, `비어 있음: ${holes.join(", ")}`);

  // (c) 레퍼런스 케이스 문서가 이 장면에 있어야 한다고 적은 안내가 나오는가
  const b = buckets(evaluate(state, data));
  for (const id of expect) t(`  ${id}`, b.has(id), "화면 어디에도 없다");
}

// 자치구를 바꾸면 답이 달라지는가 (레퍼런스 케이스 §5 마지막 항목)
console.log("\n▼ 지역 비교 레이어");
const base = runSurvey(
  { district: "mapo", completed: [] },
  {
    ...COMMON,
    origin_area: "unknown",
    product_suspected: "unknown",
    adjuster_present: false,
    product_maker_contacted: false,
  }
).state;

const byDistrict = {};
for (const d of data.districts) {
  const r = evaluate({ ...base, district: d.id }, data);
  byDistrict[d.id] = [...buckets(r).keys()].filter(
    (id) => id.startsWith("support-") || id === "no-ordinance-fallback"
  );
}
t(
  "마포(조례 없음)와 강남(조례 있음)의 결과가 다르다",
  JSON.stringify(byDistrict.mapo) !== JSON.stringify(byDistrict.gangnam),
  JSON.stringify(byDistrict)
);
Object.entries(byDistrict).forEach(([d, ids]) =>
  console.log(`      ${d.padEnd(10)} ${ids.join(", ") || "(없음)"}`)
);

// 건물 보험만 있는 이 케이스가 구로에서는 제외된다 - insurance_dwelling이 판정에 실제로 쓰인다
const guro = evaluate({ ...base, district: "guro" }, data);
t(
  "건물 보험 가입 -> 구로에서는 제외 판정이 뜬다",
  guro.excluded.length > 0,
  "insurance_dwelling 답이 판정에 반영되지 않았다"
);

// ── 6. 설문을 끝내지 않아도 깨지지 않는가 (D-003) ──
section("6. 중간 이탈 - 설문 미완료 degrade");

const partial = { district: "gangnam", completed: [] };
const order = questions.filter((q) =>
  visibleQuestions(questions, partial, data).some((v) => v.id === q.id)
);
let stepOk = true;
let stepDetail = "";
for (let i = 0; i <= order.length; i++) {
  try {
    const r = evaluate(applyDefaults(questions, partial), data);
    if (!Array.isArray(r.sections)) throw new Error("sections 없음");
  } catch (e) {
    stepOk = false;
    stepDetail = `${i}번째 답변 시점에서 ${e.message}`;
    break;
  }
  const q = order[i];
  if (q) partial[q.key] = q.options ? q.options[0].value : new Date().toISOString();
}
t("한 문항씩 답해 나가는 모든 중간 상태에서 화면이 나온다", stepOk, stepDetail);

const noAnswer = evaluate(applyDefaults(questions, { district: "mapo", completed: [] }), data);
t("아무것도 답하지 않아도 안내가 나온다", noAnswer.sections.length > 0);
t(
  "아무것도 답하지 않아도 '제품 버리지 마세요'가 뜬다 (모름 기본값)",
  buckets(noAnswer).has("preserve-product"),
  "product_suspected 기본값이 안전한 쪽으로 걸리지 않았다"
);

// 시각을 고정한다 — elapsed_bucket 게이트(report_received)가 실제 시간을 보면
// 날짜가 바뀔 때마다 결과가 달라진다.
const FIRE = "2026-03-01T12:00:00.000Z";
const NOW = Date.parse(FIRE) + 3 * 36e5;

section("6. 설문 확정본 — 순서·건너뛰기·사라진 답 정리");

// 배열 순서가 곷 설문 순서다. 확정본과 한 칸도 달라지면 안 된다.
const 확정순서 
= ["fire_at","residence_possible","housing_type","tenure","registered_resident",
   "scene_preserved","origin_area","product_suspected","powder_present",
   "wet_appliances","other_units_affected","water_damage_home","water_damage_neighbor",
   "insurance_self","insurance_dwelling","compensated","adjuster_present",
   "report_received","product_maker_contacted"];
t("설문 순서가 확정본과 같다",
  questions.map((q) => q.key).join(",") === 확정순서.join(","),
  questions.map((q) => q.key).join(","));

// origin_area를 모르면 제품 질문을 건너뛰고, 그러면 제조사 질문도 함께 사라진다.
const 보이는 = (st) => visibleQuestions(questions, st, data, NOW).map((q) => q.key);
const 모름 = 보이는({ district: "mapo", origin_area: "unknown" });
const 집안 = 보이는({ district: "mapo", origin_area: "private" });
t("origin_area가 unknown이면 product_suspected를 안 묻는다", !모름.includes("product_suspected"));
t("그때 product_maker_contacted도 함께 사라진다", !모름.includes("product_maker_contacted"));
t("원인을 들은 사람에게는 product_suspected를 묻는다", 집안.includes("product_suspected"));

// ★ D-013. 안 물었다고 No가 아니다 — default unknown이 판정 사본을 채워
// 제품 보존 금지가 그대로 켜진다. 이것이 깨지면 모르는 사람이 증거를 버린다.
{
  const st = { district: "mapo", fire_at: FIRE, origin_area: "unknown" };
  const 판정 = evaluate(applyDefaults(questions, st), data, NOW);
  const ids = 판정.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((x) => x.action.id)));
  t("origin_area unknown으로 product를 안 물어도 preserve-product는 뜼다",
    ids.includes("preserve-product"));
}

// ── pruneStale — 사라진 질문의 답을 남기지 않는다 ──
{
  const base = { district: "mapo", fire_at: FIRE, completed: ["photo-before-cleanup"], intro_seen: true };
  // ① 제품 가지로 들어가 답을 저장한다
  const 들어감 = { ...base, origin_area: "private", product_suspected: true, product_maker_contacted: true };
  t("① 가지 안에서는 두 답이 살아 있다",
    pruneStale(questions, 들어감, data, NOW).product_suspected === true &&
    pruneStale(questions, 들어감, data, NOW).product_maker_contacted === true);
  // ② upstream을 고치면 가지가 사라지고 둘 다 지워진다(고정점까지)
  const 바꿈 = pruneStale(questions, { ...들어감, origin_area: "unknown" }, data, NOW);
  t("② upstream 수정으로 product_suspected가 지워진다", !("product_suspected" in 바꿈));
  t("② 연쇄로 product_maker_contacted도 지워진다 (고정점)", !("product_maker_contacted" in 바꿈));
  t("② 질문이 아닌 키는 건드리지 않는다",
    바꿈.district === "mapo" && 바꿈.intro_seen === true &&
    바꿈.completed.length === 1 && 바꿈.fire_at === FIRE);
  // ③ 지운 뒤 판정에 잔존 영향이 없다 — 처음부터 그 가지에 안 들어간 사람과 같다
  const 안들어간 = { ...base, origin_area: "unknown" };
  t("③ 지운 뒤 판정이 '애초에 안 들어간 사람'과 같다",
    JSON.stringify(evaluate(applyDefaults(questions, 바꿈), data, NOW)) ===
    JSON.stringify(evaluate(applyDefaults(questions, 안들어간), data, NOW)));
  // ④ 세 상태가 섞이지 않는다 — 안 물음(키 없음) / false / "unknown"
  const 명시false = pruneStale(questions, { ...base, origin_area: "private", product_suspected: false }, data, NOW);
  const 명시unknown = pruneStale(questions, { ...base, origin_area: "private", product_suspected: "unknown" }, data, NOW);
  t("④ 명시적 false는 살아있고 안 물은 것과 구별된다",
    명시false.product_suspected === false && !("product_suspected" in 바꿈));
  t("④ 명시적 unknown도 그대로 남는다", 명시unknown.product_suspected === "unknown");
  t("④ 명시적 false면 제조사 질문은 안 보인다 (ask_when이 [true,unknown])",
    !보이는({ ...명시false }).includes("product_maker_contacted"));
}

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
