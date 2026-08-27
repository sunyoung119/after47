// 화재피해 회복 내비게이터 — 규칙엔진 v0.1
// 순서는 데이터에 없다. 여기서 계산된다. (D-001)

// ── 조건 매칭 (D-010) ──────────────────────────────
// 같은 키 안의 배열 = OR, 다른 키끼리 = AND
export function matches(cond, state) {
  if (!cond) return true;
  return Object.entries(cond).every(([k, v]) => {
    if (v === null) return true;
    const actual = state[k];
    const acts = Array.isArray(actual) ? actual : [actual];
    return Array.isArray(v) ? v.some((x) => acts.includes(x)) : acts.includes(v);
  });
}

// ── 자치구 조례 기반 Action의 제외 규칙 해석 ────────
// 조례마다 보험 제외 방식이 4변종이라 Action에 하드코딩할 수 없다.
// 해당 구의 규칙을 런타임에 적용한다.
function districtExclusion(action, district, state) {
  if (!action.ordinance_based) return null;

  // 자치구를 모르면 조례 판정 자체가 불가능하다. 여기서 통과시키면
  // 조례가 있는지도 모르는 사람에게 "지원 대상"이라고 말하게 된다.
  // 판정에 필요한 입력이 없는데 결과가 낙관 쪽으로 기우는 것 —
  // D-014가 registered_resident에서 잡았던 것과 같은 오류다.
  // 엔진이 UI의 district_needed notice에 기대고 있던 것을 끊는다.
  if (!district) return { skip: true };

  // 이 구가 이 항목을 지원하지 않으면 애초에 적용 대상 아님
  if (!district.support_items.includes(action.support_item)) {
    return { skip: true };
  }
  // 주택 한정 구인데 주택이 아니면 제외
  if (district.housing_only && state.housing_type === "other") {
    return { excluded: true, reason: `${district.name}는 주택 화재로 한정합니다` };
  }
  // 거주 요건
  if (district.residency === "address_and_actual" && state.registered_resident === false) {
    return { excluded: true, reason: `${district.name}는 주민등록과 실거주를 함께 요구합니다` };
  }
  // 보험 제외 — 4변종
  // 단, 이 구가 해당 항목을 제외 예외로 두면 통과 (양천: 심리·임시거처)
  if (district.exclusion_exempt_items.includes(action.support_item)) return null;

  switch (district.insurance_exclusion) {
    case "enrolled_self":
      if (state.insurance_self === true)
        return { excluded: true, reason: "본인 화재보험 가입자는 제외됩니다" };
      break;
    case "enrolled_dwelling":
      if (state.insurance_dwelling === true || state.insurance_self === true)
        return { excluded: true, reason: "해당 주택이 화재보험에 가입되어 있으면 제외됩니다" };
      break;
    case "compensated":
      if (state.compensated === true)
        return { excluded: true, reason: "보험금·보상금을 이미 받은 경우 제외됩니다" };
      break;
    case "none":
      break;
  }
  return null;
}

// ── 파생 state ──────────────────────────────────────
// 사용자에게 묻지 않고 데이터에서 나오는 값들.
// 질문 계층(ask_when)도 이 값을 읽으므로 evaluate 바깥에서 쓸 수 있게 분리한다.
// 예: "주민등록 요건이 있는 구에서만 주민등록을 묻는다"
//
// now를 인자로 받는 이유는 elapsed_hours를 고정할 수 있어야 하기 때문이다.
// 안에서 Date.now()를 부르면 같은 state가 실행할 때마다 다른 결과를 낸다.
// 숫자(Date.now())와 Date 객체를 둘 다 받는다 — applyDefaults·openSession이
// Date를 넘기므로 한쪽으로 강제하면 호출부마다 변환이 흩어진다.
export function deriveState(state, data, now = Date.now()) {
  const district = (data.districts || []).find((d) => d.id === state.district) || null;
  return {
    ...state,
    // 수손 가해·피해를 동시에 겪는 경우가 있다. both는 양쪽 조건에 모두 걸리게 한다.
    water_damage_role:
      state.water_damage_role === "both" ? ["victim", "causer"] : state.water_damage_role,
    district_has_ordinance: district ? district.has_ordinance : null,
    district_residency: district ? district.residency : null,
    district_insurance_exclusion: district ? district.insurance_exclusion : null,
    elapsed_hours: state.fire_at
      ? Math.floor((+new Date(now) - new Date(state.fire_at)) / 36e5)
      : 0,
  };
}

// ── 평가 ────────────────────────────────────────────
// now는 안쪽 deriveState까지 흘려보낸다. 여기서 끊으면 주입한 시각이
// 안에서 Date.now()로 조용히 덮여 "고정한 줄 알았는데 안 된" 상태가 된다.
export function evaluate(state, data, now = Date.now()) {
  const { actions, districts } = data;
  const district = districts.find((d) => d.id === state.district) || null;

  const s = deriveState(state, data, now);
  const done = new Set(state.completed || []);

  const rows = [];
  for (const a of actions) {
    if (a.audience !== "피해자") continue;       // D-008: 기관자율은 화면에서 뺀다
    if (!matches(a.applies_when, s)) continue;

    const dx = districtExclusion(a, district, s);
    if (dx?.skip) continue;

    let status = "해당", reason = null;
    if (dx?.excluded) {
      status = district.emergency_exception ? "조건부" : "제외";
      reason = dx.reason;
    } else if (a.excluded_when && matches(a.excluded_when, s)) {
      status = a.exception_available ? "조건부" : "제외";
      reason = a.exclusion_reason;
    }

    const blockedBy = (a.depends_on || []).filter((id) => !done.has(id));
    rows.push({
      action: a,
      status,
      reason,
      blockedBy,
      // 자치구 신청기한은 조례 기반 항목에만 적용된다
      deadline_days: a.deadline_days ?? (a.ordinance_based ? district?.deadline_days : null) ?? null,
    });
  }

  // ── 버킷 분배 ──
  // 바깥 축은 날짜(when), 안쪽 축은 분야(domain_group).
  // 격자가 아니라 중첩이다 — 정신없는 사람이 먼저 궁금한 건
  // "지금 뭘 해야 하나"지 "청소 관련이 뭐가 있나"가 아니다.
  const SECTIONS = [
    ["missed",       "혹시 아직 안 하셨다면"],
    ["today",        "오늘 하실 것"],
    ["standing",     "당분간 하지 마실 것"],
    ["this_week",    "이번 주에 하실 것"],
    ["anytime",      "계속 신경 쓰실 것"],
    ["after_report", "조사서가 나온 뒤에"],
  ];

  const out = { sections: [], waiting: [], blocked: [], excluded: [] };
  const pool = [];
  for (const r of rows) {
    if (r.status !== "해당") { out.excluded.push(r); continue; }
    if (r.blockedBy.length) { out.blocked.push(r); continue; }
    if (r.action.category === "대기") { out.waiting.push(r); continue; }
    pool.push(r);
  }

  const byTiming = (a, b) =>
    (a.action.timing_hours ?? 9999) - (b.action.timing_hours ?? 9999);

  for (const [key, label] of SECTIONS) {
    const items = pool.filter((r) => r.action.when === key);
    if (!items.length) continue;
    // 분야로 묶기 — 등장 순서를 유지해 순위가 뒤집히지 않게 한다
    const groups = [];
    for (const r of items.sort(byTiming)) {
      const g = groups.find((x) => x.group === r.action.domain_group);
      if (g) g.items.push(r);
      else groups.push({ group: r.action.domain_group, items: [r] });
    }
    out.sections.push({ key, label, count: items.length, groups });
  }

  return out;
}
