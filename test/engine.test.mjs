import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const D = join(dirname(fileURLToPath(import.meta.url)), "..");
import { evaluate } from "../src/engine.js";
const data = {
  actions: JSON.parse(readFileSync(join(D,"data/actions.json"),"utf8")),
  districts: JSON.parse(readFileSync(join(D,"data/districts.json"),"utf8")),
};
const ref = (district, over={}) => ({
  district, fire_at:new Date(Date.now()-8*36e5).toISOString(),
  tenure:"renter", housing_type:"officetel", registered_resident:true,
  insurance_self:false, insurance_dwelling:true, compensated:false,
  residence_possible:false, origin_area:"unknown", product_suspected:false,
  scene_preserved:false, wet_appliances:true, powder_present:true,
  other_units_affected:false,
  water_damage_role:"none", adjuster_present:false, product_maker_contacted:false,
  report_received:false,
  completed:[], ...over,
});
function show(label, state, opened=1) {
  const r = evaluate(state, data);
  console.log("\n"+"=".repeat(62)+"\n"+label+"\n"+"=".repeat(62));
  r.sections.forEach((sec, i) => {
    const open = i < opened;
    console.log(`\n▼ ${sec.label} (${sec.count})${open?"":"   ...접힘"}`);
    if (!open) return;
    sec.groups.forEach(g => {
      console.log(`  ${g.group}`);
      g.items.forEach(x => {
        const d = x.deadline_days ? ` [기한 ${x.deadline_days}일]` : "";
        console.log(`    · ${x.action.title}${d}`);
        console.log(`      ${x.action.summary}`);
      });
    });
  });
  if (r.waiting.length) { console.log(`\n▼ 기다리는 중 (${r.waiting.length})`);
    r.waiting.forEach(x=>console.log(`    · ${x.action.title} — ${x.action.wait_days?.join("~")}일`)); }
  if (r.blocked.length) console.log(`\n▼ 아직 못 함 (${r.blocked.length})   ...접힘`);
  if (r.excluded.length) { console.log(`\n▼ 해당 없음 (${r.excluded.length})`);
    r.excluded.forEach(x=>console.log(`    · [${x.status}] ${x.action.title} — ${x.reason??""}`)); }
  return r;
}
show("(1) QR 진입 직후 — 마포구", ref("mapo"), 2);
show("(2) 같은 화재 — 강남구", ref("gangnam"), 2);
show("(3) 2주 뒤 — 조사서 수령, 제조물 의심 확인", ref("gangnam",{
  fire_at:new Date(Date.now()-14*24*36e5).toISOString(),
  origin_area:"common", product_suspected:true, powder_present:false,
  completed:["photo-before-cleanup","fire-cert","investigation-report","ppe-powder",
             "powder-removal","dry-water","scene-release","support-housing","support-supplies"],
}), 6);

// 수손 가해/피해 분기 검증 — 지시가 정반대라 섞이면 안 된다
const vic = evaluate(ref("mapo",{water_damage_role:"victim"}), data);
const cau = evaluate(ref("mapo",{water_damage_role:"causer"}), data);
const flat = r => r.sections.flatMap(s=>s.groups.flatMap(g=>g.items.map(x=>x.action.id)))
  .concat(r.blocked.map(x=>x.action.id));
console.log("\n"+"=".repeat(62));
console.log("수손 가해/피해 분기 검증");
console.log("=".repeat(62));
const V=flat(vic), C=flat(cau);
let failed = 0;
const t=(n,ok)=>{ if(!ok) failed++; console.log(`  ${ok?"PASS":"FAIL"}  ${n}`); };
t("피해자에게 '관리사무소에 알리세요'가 뜬다", V.includes("water-damage-victim-notify"));
t("피해자에게 '책임 인정하지 마세요'는 안 뜬다", !V.includes("water-damage-causer-caution"));
t("가해자에게 '책임 인정하지 마세요'가 뜬다", C.includes("water-damage-causer-caution"));
t("가해자에게 '관리사무소에 알리세요'는 안 뜬다", !C.includes("water-damage-victim-notify"));
t("피해자에게 '소방 손실보상 아님' 안내가 뜬다", V.includes("fire-loss-compensation-not-applicable"));
t("양쪽 다 '젖은 범위 기록' 안내를 받는다",
  V.includes("water-damage-document-now") && C.includes("water-damage-document-now"));
const bo=flat(evaluate(ref("mapo",{water_damage_role:"both"}), data));
t("both면 양쪽 안내를 모두 받는다",
  bo.includes("water-damage-victim-notify") && bo.includes("water-damage-causer-caution"));
// 손해사정사 조건
const noAdj=flat(evaluate(ref("mapo"), data));
t("손해사정사 안 왔으면 '내 편 창구' 안 뜬다", !noAdj.includes("my-side-channels-overview"));
t("손해사정사 오면 '내 편 창구'가 뜬다",
  flat(evaluate(ref("mapo",{adjuster_present:true}), data)).includes("my-side-channels-overview"));

// ── done 버킷 왕복 (D-018) ─────────────────────────
// 체크 해제는 구현할 게 없다 — completed에서 빠지면 evaluate가 다시
// 계산해서 항목이 돌아오고 의존이 다시 잠긴다. 그것이 실제로 그런지를
// 여기서 본다. "구현이 없다"와 "동작하지 않는다"는 다르다.
console.log("");
console.log("=".repeat(62));
console.log("done 버킷 — 체크 / 해제 / 왕복");
console.log("=".repeat(62));
// water_damage_role을 victim으로 두는 이유는 water-damage-document-now가
// 그 조건에만 걸리기 때문이다. none이면 항목 자체가 없어 의존 검증이 안 된다.
const base = ref("mapo", { water_damage_role: "victim" });
// 잠긴 행은 blocked 버킷이 아니라 placement 위치의 섹션에 있다(D-019 §5).
// 그냥 s.key로 적으면 "풀렸다"와 "제자리에 잠겨 있다"가 구별되지 않아
// 왕복 검증이 통과하면서도 잠금이 안 걸리는 구현이 가능해진다.
const where = (r) => {
  const m = new Map();
  r.sections.forEach(s=>s.groups.forEach(g=>g.items.forEach(
    x=>m.set(x.action.id, x.locked ? `${s.key}:잠김` : s.key))));
  r.done.forEach(x=>m.set(x.action.id,"DONE"));
  r.blocked.forEach(x=>m.set(x.action.id,"BLOCKED"));
  r.waiting.forEach(x=>m.set(x.action.id,"WAITING"));
  r.excluded.forEach(x=>m.set(x.action.id,"EXCLUDED"));
  return m;
};
const NOW = Date.parse(base.fire_at) + 3*36e5;   // 시각을 고정해야 왕복이 의미를 갖는다
const r0 = evaluate(base, data, NOW);
const r1 = evaluate({...base, completed:["photo-before-cleanup"]}, data, NOW);
const r2 = evaluate({...base, completed:[]}, data, NOW);
const w0 = where(r0), w1 = where(r1), w2 = where(r2);

t("체크하면 done으로 간다", w1.get("photo-before-cleanup") === "DONE");
t("체크 전에는 done이 비어 있다", r0.done.length === 0);
t("체크하면 목록에서 빠진다", w0.get("photo-before-cleanup") === "today" && w1.get("photo-before-cleanup") !== "today");
// 불가역은 접히지 않고 제자리에 잠긴 채로 있다가 풀린다(D-019 §5).
// 되돌릴 수 있는 것(textile-caution)은 지금처럼 blocked 버킷에 접힌다.
t("매달린 것이 풀린다 — water-damage-document-now (불가역 · 제자리 잠김)",
  w0.get("water-damage-document-now") === "today:잠김" && w1.get("water-damage-document-now") === "today");
t("매달린 것이 풀린다 — textile-caution (되돌릴 수 있음 · blocked 버킷)",
  w0.get("textile-caution") === "BLOCKED" && w1.get("textile-caution") === "this_week");
t("해제하면 원래 블록으로 돌아온다", w2.get("photo-before-cleanup") === "today" && r2.done.length === 0);
t("해제하면 매달린 것이 다시 잠긴다",
  w2.get("water-damage-document-now") === "today:잠김" && w2.get("textile-caution") === "BLOCKED");
t("왕복하면 처음과 완전히 같다", JSON.stringify(r0) === JSON.stringify(r2));
t("금지는 체크해도 done으로 안 간다 (standing 방어)",
  evaluate({...base, completed:["preserve-product"]}, data, NOW).done.length === 0);
t("섹션 행이 checkable을 싣고 있다",
  r0.sections.every(s=>s.groups.every(g=>g.items.every(x=>typeof x.checkable === "boolean"))));
t("standing과 잠김만 checkable이 false다",
  r0.sections.every(s=>s.groups.every(g=>g.items.every(
    x=>x.checkable === (s.key !== "standing" && !x.locked)))));

// ── 잠김 노출 (D-019 §5) ───────────────────────────
// blocked 버킷의 뜻이 좁아졌다 — "선행이 안 끝난 것" 전부가 아니라
// "그중 되돌릴 수 있는 것"만이다. 되돌릴 수 없는 것은 placement가 가리키는
// 자리에 잠긴 채로 남는다. 접어 두면 시한이 지난 뒤에도 missed에 못 간다.
t("blocked 버킷에 irreversible이 없다",
  r0.blocked.every(x=>x.action.irreversible !== true),
  r0.blocked.filter(x=>x.action.irreversible).map(x=>x.action.id).join(", "));
t("잠긴 행이 선행 정보를 그대로 싣는다",
  w0.get("water-damage-document-now") === "today:잠김" &&
  r0.sections.flatMap(s=>s.groups.flatMap(g=>g.items))
    .find(x=>x.action.id==="water-damage-document-now")
    ?.blockedBy?.[0]?.title === "치우기 전에 방마다 사진·영상을 남기세요");

// 시한이 지난 불가역이 잠겨 있어도 missed로 간다 — 이것이 §5의 목적이다.
// +5d에 powder-removal(24h)·dry-water(48h)는 placement가 missed를 돌려주는데
// 전에는 blocked 필터가 먼저 걸러서 어느 블록에도 안 나타났다.
const late = where(evaluate(base, data, Date.parse(base.fire_at) + 5*24*36e5));
t("시한이 지난 불가역은 잠겨 있어도 missed에 나타난다 — powder-removal",
  late.get("powder-removal") === "missed:잠김", late.get("powder-removal"));
t("시한이 지난 불가역은 잠겨 있어도 missed에 나타난다 — dry-water",
  late.get("dry-water") === "missed:잠김", late.get("dry-water"));

// ── guidance_type — 안내의 종류를 데이터가 말한다 ────
//
// 결과 화면의 상위 IA(우선 확인 / 지금 실행 / 알아둘 것)가 읽을 축이다.
// **아직 어떤 런타임 코드도 이 필드를 읽지 않는다** — 다음 단계에서 UI가
// `row.action.guidance_type`으로 읽는다(엔진 행의 action이 원본 Action
// 객체 전체라 엔진은 손댈 것이 없다).
//
// ★ 누락은 FAIL이다. **"없으면 action으로 친다"는 기본값을 어디에도
//   만들지 마라** — 조용한 기본값은 분류를 빼먹은 것과 일부러 실행으로
//   둔 것을 구분할 수 없게 만든다.
const GT = ["action", "do_not", "awareness"];
const DO_NOT = [
  "wet-appliance-power",
  "preserve-product",
  "product-handover-caution",
  "scene-preserved-hold",
  "water-damage-causer-caution",
  "tenant-dont-do",
];
const AWARENESS = ["adjusters-may-all-be-opposing", "product-maker-position-may-change"];
const 없는것 = data.actions.filter((a) => !("guidance_type" in a)).map((a) => a.id);
t(`${data.actions.length}개 Action 전부가 guidance_type을 갖는다`, 없는것.length === 0, 없는것.join(", "));
const 밖의값 = data.actions.filter((a) => !GT.includes(a.guidance_type));
t(
  "값이 action / do_not / awareness 셋 중 하나다 (넷째를 만들지 않는다)",
  밖의값.length === 0,
  밖의값.map((a) => `${a.id}=${a.guidance_type}`).join(", ")
);
const 뽑기 = (v) => data.actions.filter((a) => a.guidance_type === v).map((a) => a.id).sort();
t(
  `do_not이 정확히 ${DO_NOT.length}건이다`,
  뽑기("do_not").join(",") === [...DO_NOT].sort().join(","),
  뽑기("do_not").join(", ")
);
t(
  `awareness가 정확히 ${AWARENESS.length}건이다`,
  뽑기("awareness").join(",") === [...AWARENESS].sort().join(","),
  뽑기("awareness").join(", ")
);
// ★ 축 분리의 회귀 가드. irreversible로 do_not을 추론하면 이 한 건이 샌다 —
//   "현장 보존 상태를 유지하세요"는 되돌릴 수 있지만 금지다.
const 보존 = data.actions.find((a) => a.id === "scene-preserved-hold");
t(
  "scene-preserved-hold는 irreversible=false인데 do_not이다 (irreversible과 독립된 축)",
  보존?.irreversible === false && 보존?.guidance_type === "do_not",
  `irreversible=${보존?.irreversible} guidance_type=${보존?.guidance_type}`
);

console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
