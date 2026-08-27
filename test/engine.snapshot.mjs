// 엔진 출력 스냅샷 — 계기판
//
// ★ 이 파일이 담는 것은 "옳은 출력"이 아니라 "현재 출력"이다. ★
//
// 지금 틀린 것들이 그대로 박혀 있다. 예를 들면
//   · fridge-4h(냉장 4시간)가 화재 3시간째에 이미 "혹시 아직 안 하셨다면"에 있다
//   · 강남 "오늘 하실 것"에 조례 지원신청 2건이 올라와 있다
//   · P4(자치구 미지정)에 조례 지원 4건이 "해당"으로 뜬다
// 여기서 고치지 마라. 이 파일의 일은 옳고 그름을 판정하는 게 아니라
// 다음 단계에서 무엇이 움직였는지를 한 글자도 빠짐없이 보여주는 것이다.
//
// engine.test.mjs의 ref()를 import하지 않는다. 그쪽은 데모용이라 앞으로
// 바뀔 수 있고, 그때 기준선이 같이 흔들리면 계기판의 의미가 없다.
// 페르소나 정의는 이 파일이 스스로 갖는다. 그리고 그 정의를 기준선에
// 통째로 박아, 코드와 기준선이 어긋나면 실패로 잡는다.
//
//   node test/engine.snapshot.mjs            비교. 다르면 exit 1
//   node test/engine.snapshot.mjs --update   기준선 갱신

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { evaluate } from "../src/engine.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const data = { actions: read("data/actions.json"), districts: read("data/districts.json") };

const BASELINE = join(ROOT, "fixtures/engine-baseline.json");
const UPDATE = process.argv.includes("--update");

// ── 공통 베이스 — 레퍼런스 케이스 ───────────────────
// 오피스텔 임차인 / 공용부 발화 / 제조물 의심 미확정 /
// 본인보험 없음 / 건물보험 있음 / 거주 불가
const FIRE_AT = "2026-03-01T12:00:00.000Z"; // 고정. 실제 시각과 무관해야 한다

const BASE = {
  fire_at: FIRE_AT,
  tenure: "renter",
  housing_type: "officetel",
  registered_resident: true,
  insurance_self: false,
  insurance_dwelling: true,
  compensated: false,
  residence_possible: false,
  origin_area: "common",
  product_suspected: "unknown",
  scene_preserved: false,
  wet_appliances: true,
  powder_present: true,
  other_units_affected: false,
  water_damage_role: "none",
  adjuster_present: false,
  product_maker_contacted: false,
  completed: [],
};

// P6~P8은 다음 단계(water_damage_role의 none 분리)를 위한 것이다.
// 지금 전부 none이면 그때 무엇이 변했는지 측정할 수 없다.
// engine.test.mjs에 "both면 양쪽 안내를 모두 받는다"가 이미 있지만,
// 그 검증은 통과하면서도 잘못된 구현이 가능하다. 여기가 그 사각을 덮는다.
const PERSONAS = [
  ["P1", "마포 — 조례 없음", { district: "mapo" }],
  ["P2", "강남 — 조례 + 보험 제외조건(본인 가입)", { district: "gangnam" }],
  ["P3", "성북 — 조례 + 제외조건 없음", { district: "seongbuk" }],
  ["P4", "자치구 미지정", {}],
  ["P5", "강남 — 3상태 6키를 전부 unknown", {
    district: "gangnam",
    scene_preserved: "unknown",
    insurance_self: "unknown",
    insurance_dwelling: "unknown",
    other_units_affected: "unknown",
    origin_area: "unknown",
    product_suspected: "unknown",
  }],
  ["P6", "강남 — 수손 피해자", { district: "gangnam", water_damage_role: "victim" }],
  ["P7", "강남 — 수손 가해자", { district: "gangnam", water_damage_role: "causer" }],
  ["P8", "강남 — 수손 가해·피해 양쪽", { district: "gangnam", water_damage_role: "both" }],

  // P9~P13은 excluded를 보기 위한 것이다.
  // P1~P8만으로는 D-011의 세 상태 중 `조건부`와 `제외`가 39조합 어디에도
  // 나타나지 않았다. 조례 판정 경로를 건드릴 때 무엇이 깨져도 못 잡는
  // 계기판이라는 뜻이다. 다섯 자치구의 제외 변종을 하나씩 밟는다.
  //
  //   P9  거주 요건    P10 enrolled_dwelling   P11 compensated + 예외 항목
  //   P12 enrolled_self                        P13 housing_only
  //
  // districtExclusion()의 판정 순서가 support_items → housing_only →
  // residency → exclusion_exempt_items → insurance라, 먼저 걸리는 것이
  // 뒤를 가린다. 페르소나를 하나씩 떼어놓은 이유다.
  ["P9", "성북 — 주민등록·실거주 미충족 (긴급 예외 있는 유일한 구 → 조건부)",
    { district: "seongbuk", registered_resident: false }],
  ["P10", "구로 — 건물 보험 가입 (enrolled_dwelling → 제외)",
    { district: "guro" }],
  ["P11", "양천 — 보상금 수령 (compensated → 제외, 단 psych·housing은 예외 항목)",
    { district: "yangcheon", compensated: true }],
  ["P12", "강남 — 본인 보험 가입 (enrolled_self → 제외)",
    { district: "gangnam", insurance_self: true }],
  ["P13", "구로 — 주택이 아님 (housing_only → 제외. 보험보다 먼저 걸린다)",
    { district: "guro", housing_type: "other" }],

  // P14는 D-016(water_damage_role의 "모르겠다" 분리)을 지키는 자리다.
  // 역할 특정 3개(victim 2 / causer 1)가 여기 뜨면 반대 지시가 섞인 것이다.
  // unknown을 both처럼 배열로 펼치는 실수가 정확히 그렇게 나타난다.
  ["P14", "강남 — 수손 상황 미확인 (역할 중립 항목만 떠야 한다)",
    { district: "gangnam", water_damage_role: "unknown" }],

  // P15~P17은 D-013이 만든 게이트의 반대편을 밟는다.
  // 베이스가 product_suspected "unknown" / adjuster_present false /
  // product_maker_contacted false라, 이 셋을 켜야만 나오는 Action 9개가
  // 42조합 어디에도 없었다. 그 9개가 레퍼런스 케이스 §4의 화면 2·3이고,
  // deadline_days를 가진 Action 둘 중 하나(product-claim-limitation)가
  // 여기 있다 — irreversible + anytime + 기한 1095일이라
  // "시한이 지난 irreversible만 missed로 내린다"는 3/4 규칙의 시험대다.
  //
  // 하나씩 떼어놓는다. 합치면 어느 조건이 그 항목을 켰는지 diff에서
  // 안 갈린다. 자치구를 강남으로 두어 P2(강남 · 베이스)와 나란히 읽는다.
  ["P15", "강남 — 제조물 결함 확정 (D-013 게이트 반대편, 제조물 5개)",
    { district: "gangnam", product_suspected: true }],
  ["P16", "강남 — 손해사정사 등장 (레퍼런스 케이스 화면 2, 3개)",
    { district: "gangnam", adjuster_present: true }],
  ["P17", "강남 — 제조사 접촉함 (1개)",
    { district: "gangnam", product_maker_contacted: true }],
];

const CLOCKS = [
  ["+3h", 3],
  ["+5d", 5 * 24],
  ["+90d", 90 * 24],
];
const at = (hours) => new Date(Date.parse(FIRE_AT) + hours * 36e5).toISOString();

// ── 뜨는 것 ─────────────────────────────────────────
// axis와 irreversible을 함께 기록하는 이유는 다음 단계의 재배치 규칙이
// 그 둘을 입력으로 쓰기 때문이다. id만 남기면 diff를 봐도 왜 움직였는지
// 읽히지 않는다. group은 화면 묶음 경계라 순서와 함께 뜻이 생긴다.
const bucketRow = (x) => ({
  id: x.action.id,
  status: x.status,
  blocked_by: x.blockedBy ?? [],
  deadline_days: x.deadline_days ?? null,
});

// `reason`은 excluded에만 담는다. sections·blocked 행은 전부 `해당` 상태라
// 42조합에서 하나도 남김없이 null이었다(측정). 여기가 null이 아니게 되면
// 내가 모르는 판정 경로가 생긴 것이므로 그때 이 결정을 다시 봐야 한다.
const excludedRow = (x) => ({ ...bucketRow(x), reason: x.reason ?? null });

function capture(state, now) {
  const r = evaluate(state, data, now);
  return {
    sections: r.sections.map((sec) => ({
      key: sec.key,
      count: sec.count,
      // groups를 화면 순서 그대로 편다. group을 항목에 붙여 경계를 보존한다.
      items: sec.groups.flatMap((g) =>
        g.items.map((x) => ({
          id: x.action.id,
          group: g.group,
          axis: x.action.axis,
          timing_hours: x.action.timing_hours ?? null,
          // 행 수준 값이다. 조례 기반 항목은 자치구에서 온다(양천만 30일).
          // 3/4 재배치가 이 값을 입력으로 쓰기로 돼 있어 기록해 둔다.
          deadline_days: x.deadline_days ?? null,
          irreversible: x.action.irreversible === true,
        }))
      ),
    })),
    waiting: r.waiting.map(bucketRow),
    blocked: r.blocked.map(bucketRow),
    excluded: r.excluded.map(excludedRow),
  };
}

// 키를 정렬해 담는다. 페르소나마다 덮어쓰는 키가 달라 자연 순서가
// 제각각이면 입력이 같은데도 기록이 달라 보인다.
const sortKeys = (o) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

function build() {
  const cases = {};
  for (const [pid, desc, over] of PERSONAS) {
    const state = { ...BASE, ...over };
    // 덮어쓴 부분(over)이 아니라 완전한 state를 박는다. 페르소나 정의가
    // 코드 안에만 있으면, 코드가 바뀔 때 기준선이 조용히 다른 입력의
    // 것이 된다. 계기판이 자기가 무엇을 쟀는지 기록해야 한다.
    cases[pid] = { _desc: desc, _state: sortKeys(state) };
    for (const [label, hours] of CLOCKS) {
      cases[pid][label] = capture(state, at(hours));
    }
  }
  return {
    _: "엔진 출력 스냅샷. 옳은 출력이 아니라 현재 출력이다. test/engine.snapshot.mjs 참조",
    fire_at: FIRE_AT,
    clocks: Object.fromEntries(CLOCKS.map(([l, h]) => [l, at(h)])),
    cases,
  };
}

// ── 비교 ────────────────────────────────────────────
const fmt = (it) =>
  `${it.id}` +
  `  [${it.axis} · ${it.group} · timing=${it.timing_hours ?? "-"}` +
  `${it.deadline_days ? ` · 기한 ${it.deadline_days}일` : ""}` +
  `${it.irreversible ? " · 불가역" : ""}]`;
const fmtBucket = (it) =>
  `${it.id}  [${it.status}` +
  `${it.deadline_days ? ` · 기한 ${it.deadline_days}일` : ""}` +
  `${it.blocked_by?.length ? " · 막힘:" + it.blocked_by.join(",") : ""}]` +
  `${it.reason ? `
          사유: ${it.reason}` : ""}`;

const byId = (arr) => new Map((arr || []).map((x) => [x.id, x]));

// 한 섹션(또는 버킷) 안의 변화를 사람이 읽는 줄로 편다.
function diffList(before, after, format) {
  const lines = [];
  const B = byId(before), A = byId(after);
  for (const [id, x] of A) if (!B.has(id)) lines.push(`      + ${format(x)}`);
  for (const [id, x] of B) if (!A.has(id)) lines.push(`      - ${format(x)}`);
  // 남아 있지만 속성이 바뀐 것 — 데이터를 고쳤다는 뜻이다
  for (const [id, a] of A) {
    const b = B.get(id);
    if (!b) continue;
    if (JSON.stringify(a) !== JSON.stringify(b))
      lines.push(`      ~ ${format(b)}\n        → ${format(a)}`);
  }
  // 들고 남이 없는데 줄이 바뀌었으면 순서가 뒤집힌 것
  const bIds = (before || []).map((x) => x.id);
  const aIds = (after || []).map((x) => x.id);
  if (!lines.length && bIds.join(">") !== aIds.join(">")) {
    lines.push(`      ↕ 순서만 바뀜`);
    lines.push(`          전: ${bIds.join(" > ")}`);
    lines.push(`          후: ${aIds.join(" > ")}`);
  }
  return lines;
}

// 페르소나의 입력이 기준선과 어긋났는지. 판정 결과가 같아도 입력이
// 다르면 그 결과는 다른 사람의 것이다.
function diffState(before, after) {
  const b = before || {}, a = after || {};
  const lines = [];
  for (const k of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()) {
    const bv = JSON.stringify(b[k]), av = JSON.stringify(a[k]);
    if (bv === av) continue;
    if (!(k in b)) lines.push(`      + ${k}: ${av}`);
    else if (!(k in a)) lines.push(`      - ${k}: ${bv}`);
    else lines.push(`      ~ ${k}: ${bv} → ${av}`);
  }
  return lines;
}

const SECTION_LABEL = {
  missed: "혹시 아직 안 하셨다면",
  today: "오늘 하실 것",
  standing: "당분간 하지 마실 것",
  this_week: "이번 주에 하실 것",
  anytime: "계속 신경 쓰실 것",
  after_report: "조사서가 나온 뒤에",
};

function diffCase(before, after) {
  const out = [];
  const bs = new Map((before.sections || []).map((s) => [s.key, s]));
  const as = new Map((after.sections || []).map((s) => [s.key, s]));
  for (const key of [...new Set([...bs.keys(), ...as.keys()])]) {
    const b = bs.get(key), a = as.get(key);
    const label = `${SECTION_LABEL[key] ?? key} (${key})`;
    if (!b) { out.push(`    ▼ ${label}  섹션이 새로 생김 (${a.count}건)`);
      a.items.forEach((x) => out.push(`      + ${fmt(x)}`)); continue; }
    if (!a) { out.push(`    ▼ ${label}  섹션이 사라짐 (${b.count}건)`);
      b.items.forEach((x) => out.push(`      - ${fmt(x)}`)); continue; }
    const lines = diffList(b.items, a.items, fmt);
    if (!lines.length && b.count === a.count) continue;
    out.push(`    ▼ ${label}  ${b.count} → ${a.count}`);
    out.push(...lines);
  }
  // 섹션 자체의 등장 순서
  const bo = (before.sections || []).map((s) => s.key).join(">");
  const ao = (after.sections || []).map((s) => s.key).join(">");
  if (bo !== ao && bs.size === as.size)
    out.push(`    ▼ 섹션 순서\n        전: ${bo}\n        후: ${ao}`);

  for (const bucket of ["waiting", "blocked", "excluded"]) {
    const lines = diffList(before[bucket], after[bucket], fmtBucket);
    if (!lines.length) continue;
    out.push(`    ▼ ${bucket}  ${(before[bucket] || []).length} → ${(after[bucket] || []).length}`);
    out.push(...lines);
  }
  return out;
}

// ── 불변식 ──────────────────────────────────────────
// 스냅샷 비교는 "지난번과 같은가"만 본다. 계기판이 눈을 잃어도
// 기준선이 같이 바뀌면 통과해 버린다.
//
// 지금 `조건부` 전체가 자치구 하나에 매달려 있다 — 5개 구 중
// emergency_exception이 성북만 true이고, Action 경로(excluded_when +
// exception_available)는 해당 Action이 0개다. 성북 데이터가 바뀌면
// `조건부`가 42조합에서 조용히 사라지고 비교는 통과한다.
//
// 그래서 비교와 별개로 둔다. **숫자는 못 박지 않는다** — 12건·33건은
// 데이터가 늘면 자연히 변한다. 0이 되는 것만 막는다.
function checkInvariants(snapshot) {
  const rows = [];
  for (const pid of Object.keys(snapshot.cases || {})) {
    for (const [label] of CLOCKS) {
      const c = snapshot.cases[pid][label];
      if (c) rows.push(...(c.excluded || []));
    }
  }
  const fails = [];
  if (!rows.length) fails.push("excluded 버킷이 어느 조합에도 없다");
  for (const st of ["조건부", "제외"]) {
    if (!rows.some((x) => x.status === st))
      fails.push(`\`${st}\` 상태를 밟는 조합이 하나도 없다`);
  }
  return fails;
}

// ── 실행 ────────────────────────────────────────────
const fresh = build();

const broken = checkInvariants(fresh);
if (broken.length) {
  console.log("=".repeat(62));
  console.log("  FAIL  계기판이 이 상태를 더 이상 관측하지 못한다");
  broken.forEach((f) => console.log(`          · ${f}`));
  console.log("");
  console.log("        페르소나가 사라졌거나 판정 경로가 끊긴 것이다.");
  console.log("        스냅샷 비교로는 못 잡는다 — 기준선도 같이 바뀌면");
  console.log("        통과하기 때문에 따로 둔 검사다. --update로도 넘어가지 않는다.");
  console.log("=".repeat(62));
  process.exit(1);
}

if (UPDATE || !existsSync(BASELINE)) {
  if (!existsSync(BASELINE) && !UPDATE) {
    console.log(`기준선이 없다: ${BASELINE}`);
    console.log("먼저 만들어라:  node test/engine.snapshot.mjs --update");
    process.exit(1);
  }
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  console.log(`기준선 갱신: fixtures/engine-baseline.json`);
  console.log(`  페르소나 ${PERSONAS.length} × 시각 ${CLOCKS.length} = ${PERSONAS.length * CLOCKS.length}개 조합`);
  process.exit(0);
}

const old = JSON.parse(readFileSync(BASELINE, "utf8"));
let failed = 0;

console.log("=".repeat(62));
console.log(`엔진 스냅샷 — 페르소나 ${PERSONAS.length} × 시각 ${CLOCKS.length} = ${PERSONAS.length * CLOCKS.length}개 조합`);
console.log(`화재 ${FIRE_AT}`);
console.log("=".repeat(62));

if (old.fire_at !== fresh.fire_at) {
  console.log(`\n  FAIL  화재 시각이 바뀌었다: ${old.fire_at} → ${fresh.fire_at}`);
  console.log("        기준선 전체가 무의미해진다. --update로 다시 떠라.");
  failed++;
}

for (const [pid, desc] of PERSONAS.map((p) => [p[0], p[1]])) {
  const ob = old.cases?.[pid];
  if (!ob) {
    console.log(`\n  FAIL  ${pid} (${desc}) — 기준선에 없는 페르소나다`);
    failed++;
    continue;
  }
  const stateLines = diffState(ob._state, fresh.cases[pid]._state);
  if (stateLines.length) {
    console.log(`\n  FAIL  ${pid} — 페르소나 입력이 기준선과 다르다  (${desc})`);
    stateLines.forEach((l) => console.log(l));
    failed++;
  }
  for (const [label] of CLOCKS) {
    const lines = ob[label] ? diffCase(ob[label], fresh.cases[pid][label]) : ["    (기준선에 이 시각이 없다)"];
    if (!lines.length) continue;
    failed++;
    console.log(`\n  FAIL  ${pid} · ${label}  — ${desc}`);
    lines.forEach((l) => console.log(l));
  }
}

console.log(`\n${"=".repeat(62)}`);
// 코드에서 지워진 페르소나가 기준선에만 남아 있으면 조용히 사라진다
const known = new Set(PERSONAS.map((p) => p[0]));
for (const pid of Object.keys(old.cases || {})) {
  if (known.has(pid)) continue;
  console.log(`\n  FAIL  ${pid} — 기준선에는 있는데 코드에서 사라진 페르소나다`);
  console.log(`        ${old.cases[pid]._desc ?? ""}`);
  failed++;
}

if (failed) {
  console.log(`스냅샷 불일치 ${failed}건`);
  console.log("의도한 변화라면:  node test/engine.snapshot.mjs --update");
} else {
  console.log(`전부 통과 — ${PERSONAS.length * CLOCKS.length}개 조합이 기준선과 같다`);
}
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
