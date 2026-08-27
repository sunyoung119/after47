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

// ── 시한 만료 판정 (D-017 R2) ───────────────────────
// timing_hours는 0보다 클 때만 만료 시각으로 쓴다. 0인 항목 6개 중
// 하나도 "0시간 후 만료"라는 뜻이 아니다 — 넷은 standing(금지)이라
// R0이 막고, 나머지 둘(photo-before-cleanup "치우기 전에",
// scene-release "조사관에게 확인")은 즉시성의 표시다. 0을 만료로 읽으면
// photo-before-cleanup이 irreversible이라 화재 3시간째에 missed로
// 내려가고 D-006이 뒤집힌다. 한 필드에 두 뜻이 있다는 것은 D-017 §2에
// 적어 두었다.
function expiry(action, elapsedHours, deadlineDays) {
  return {
    timing:
      action.timing_hours != null &&
      action.timing_hours > 0 &&
      elapsedHours > action.timing_hours,
    deadline: deadlineDays != null && elapsedHours / 24 > deadlineDays,
  };
}

// ── when 재배치 (D-017) ─────────────────────────────
// 순수 함수다. `해당` 항목이 어느 블록에 들어가는지만 정한다.
// deadline_days를 인자로 받는 이유는 조례 항목의 기한이 자치구에서
// 오기 때문이다(행 수준 값).
//
// 제외 판정은 여기서 하지 않는다. excluded는 when이 아니라 status다.
export function placement(action, elapsedHours, deadlineDays = null) {
  if (action.when === "standing") return "standing";           // R0 금지는 안 움직인다
  if (action.when === "after_report") return "after_report";   // R1 report_received로만

  const e = expiry(action, elapsedHours, deadlineDays);        // R2
  if (e.timing || e.deadline) {
    return action.irreversible ? "missed" : action.when;       // R3 / R4
  }
  // R5 — 시간 필드가 없는 this_week만. 사실 축은 스케일이 짧아 먼저 닫힌다(D-001)
  if (action.timing_hours == null && deadlineDays == null && action.when === "this_week") {
    const limitDays = action.axis === "사실" ? 7 : 30;
    if (elapsedHours / 24 > limitDays) return "anytime";
  }
  return action.when;
}

// ── 기한 도과 제외 (D-017 §3) ───────────────────────
// 신청 기한이 지난 것은 제자리에도 missed에도 두지 않는다. 신청할 수
// 없는 것을 "오늘 하실 것"에 두면 화면이 거짓말을 하고, missed는
// irreversible 전용이다(원칙 2). D-011의 세 상태를 그대로 쓴다.
//
// 기산점은 화재일이다. 조례가 기산점을 화재일로 정하는지 피해 확정일·
// 신고일로 정하는지 아직 확인하지 못해 문구에 헤지를 둔다 — 단정하면
// 실제로 신청할 수 있는 사람을 돌려세운다(D-006).
function deadlineExclusion(action, elapsedHours, deadlineDays, district) {
  if (action.irreversible) return null;   // 시효는 R3이 missed로 가져간다
  if (!expiry(action, elapsedHours, deadlineDays).deadline) return null;
  return {
    excluded: true,
    reason: `신청 기한(${deadlineDays}일)이 지났을 수 있습니다 — ${
      district ? district.name + " " : ""
    }재난안전과에 문의하세요`,
  };
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

    // 자치구 신청기한은 조례 기반 항목에만 적용된다
    const deadlineDays =
      a.deadline_days ?? (a.ordinance_based ? district?.deadline_days : null) ?? null;

    let status = "해당", reason = null;
    if (dx?.excluded) {
      status = district.emergency_exception ? "조건부" : "제외";
      reason = dx.reason;
    } else if (a.excluded_when && matches(a.excluded_when, s)) {
      status = a.exception_available ? "조건부" : "제외";
      reason = a.exclusion_reason;
    } else {
      // 자격 제외를 통과한 것만 기한을 본다. 자격 제외는 시간과 무관하게
      // 확정적이고 기한 도과는 기산점이 불확실해 헤지가 붙는다 —
      // 확정 사유를 불확실한 사유로 덮으면 정보가 나빠진다(D-017 §3).
      const dl = deadlineExclusion(a, s.elapsed_hours, deadlineDays, district);
      if (dl) {
        status = district?.emergency_exception ? "조건부" : "제외";
        reason = dl.reason;
      }
    }

    const blockedBy = (a.depends_on || []).filter((id) => !done.has(id));
    rows.push({
      action: a,
      status,
      reason,
      blockedBy,
      deadline_days: deadlineDays,
      // 3층 타임라인. 데이터의 when이 아니라 여기서 계산된 값이 화면 위치다(D-001)
      when: placement(a, s.elapsed_hours, deadlineDays),
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
    const items = pool.filter((r) => r.when === key);
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
