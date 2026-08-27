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

console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
