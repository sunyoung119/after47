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

  // 자치구를 모르면 조례 판정 자체가 불가능하다. 통과시키면 조례가 있는지도
  // 모르는 사람에게 "지원 대상"이라고 말하게 되고, 반대로 `skip`으로 지우면
  // 지원 제도가 있다는 것 자체가 안 보인다 — 1/4-C가 후자를 골랐고
  // D-011 아래에 미결로 남겨 뒀던 자리다.
  //
  // 네 번째 상태 `미판정`이 그 미결을 닫는다(D-019 §6). 판정 이전이라는 것을
  // 그대로 말하고, 사유가 무엇을 물어야 하는지를 가리킨다.
  if (!district) {
    return {
      undetermined: true,
      reason: "자치구를 알려주시면 지원 대상인지 확인해 드립니다",
    };
  }

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

  // `unknown`이면 판정을 못 한다 — 그런데 **그 구가 실제로 보는 키만**이다.
  // 조례마다 보험 제외가 4변종이라 같은 `unknown`이 구에 따라 판정을 막기도
  // 하고 아무 상관이 없기도 하다. 성북(none)은 보험을 안 보므로 모르는 채로도
  // `해당`이 확정이고, 키 단위로 일괄 적용하면 그 구에서까지 안내가 사라진다.
  //
  // 확정 제외를 먼저 본다. `enrolled_dwelling` 구에서 본인 보험이 `true`면
  // 건물 보험을 몰라도 제외가 확정이다 — 확정 사유를 불확실한 사유로 덮지
  // 않는다(D-017 §3이 기한 도과에서 세운 것과 같은 원칙).
  const unknownIns = { undetermined: true, reason: "화재보험 가입 여부에 따라 달라집니다" };
  switch (district.insurance_exclusion) {
    case "enrolled_self":
      if (state.insurance_self === true)
        return { excluded: true, reason: "본인 화재보험 가입자는 제외됩니다" };
      if (state.insurance_self === "unknown")
        return { ...unknownIns, reason: "본인 화재보험 가입 여부에 따라 달라집니다" };
      break;
    case "enrolled_dwelling":
      if (state.insurance_dwelling === true || state.insurance_self === true)
        return { excluded: true, reason: "해당 주택이 화재보험에 가입되어 있으면 제외됩니다" };
      if (state.insurance_dwelling === "unknown" || state.insurance_self === "unknown")
        return { ...unknownIns, reason: "그 주택의 화재보험 가입 여부에 따라 달라집니다" };
      break;
    case "compensated":
      // compensated는 3상태 키가 아니다(q-compensated의 값은 true/false뿐).
      // 여기에 `unknown` 가지가 생기면 설문부터 바뀐 것이다.
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
  const elapsed = state.fire_at
    ? Math.floor((+new Date(now) - new Date(state.fire_at)) / 36e5)
    : 0;
  return {
    ...state,
    // 물 피해는 이제 독립된 두 축이다(water_damage_home · water_damage_neighbor).
    // 옛 `both`처럼 한 값을 두 조건으로 펼칠 일이 없어졌다 — 둘 다 겪은 사람은
    // 두 키가 각각 true다.
    district_has_ordinance: district ? district.has_ordinance : null,
    district_residency: district ? district.residency : null,
    district_insurance_exclusion: district ? district.insurance_exclusion : null,
    elapsed_hours: elapsed,
    elapsed_bucket: bucketOf(elapsed),
  };
}

// D-017 §1. 경계 4h·48h·30d·1095d는 데이터에 실재하는 값이고
// 7d만 임의다(this_week가 가리키는 기간일 뿐 근거가 없다).
//
// **재배치는 이 키를 쓰지 않는다.** placement는 항목마다 자기 시간 필드와
// elapsed_hours를 직접 비교한다 — 구간으로 뭉개면 같은 구간 안의 4시간과
// 24시간이 구별되지 않는다. 이 키의 소비자는 ask_when 하나다.
// 데이터의 조건은 범위 비교를 못 하므로(D-010) 시점별 설문 분할은
// 이산값을 배열 OR로 받아야 한다.
function bucketOf(h) {
  const d = h / 24;
  if (h < 4) return "immediate";
  if (h < 48) return "first_hours";
  if (d < 7) return "first_week";
  if (d < 30) return "first_month";
  if (d < 1095) return "months";
  return "years";
}

// ── 평가 ────────────────────────────────────────────
// now는 안쪽 deriveState까지 흘려보낸다. 여기서 끊으면 주입한 시각이
// 안에서 Date.now()로 조용히 덮여 "고정한 줄 알았는데 안 된" 상태가 된다.
export function evaluate(state, data, now = Date.now()) {
  const { actions, districts } = data;
  const district = districts.find((d) => d.id === state.district) || null;

  const s = deriveState(state, data, now);
  const done = new Set(state.completed || []);
  // 완료 시각. `{ action_id: ISO시각 }` 맵이고 체크할 때 UI가 기록한다.
  // 저장 계층은 state를 통째로 저장하므로 새 키가 그대로 실린다 —
  // **마이그레이션이 없다.** 이 키가 없던 사용자는 빈 맵이 되고 행의
  // completed_at은 null이다. 완료 여부의 진실은 계속 completed 배열이고
  // 이것은 "언제"만 담는다 — 여기가 비어도 완료는 완료다.
  const completedAt = state.completed_at || {};

  // 조사서를 받았으면 "조사서를 신청하세요"는 화면에서 사라진다(결정 2).
  // 그런데 blocked 판정은 completed 배열만 보므로, 사라진 항목은 체크할
  // 수도 없고 거기 매달린 넷은 영원히 blocked가 된다 — 조사서를 받은
  // 사람이 정확히 그것들을 봐야 하는 사람인데.
  // 조사서가 손에 있다는 것이 그 신청의 목적 달성이므로 충족으로 본다.
  //
  // **이 규칙은 investigation-report 한 항목에만 적용된다.**
  // "applies 안 되는 선행은 충족으로 본다"로 일반화하지 마라 —
  // scene-release가 안 뜨는 사람의 청소 금지가 그 일반화에서 풀린다.
  if (s.report_received === true) done.add("investigation-report");

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
    if (dx?.undetermined) {
      // 네 번째 상태(D-019 §6). `제외`와 다르다 — 이건 판정 결과가 아니라
      // 판정 이전이다. emergency_exception을 보지 않는 이유이기도 하다.
      // 구청장 예외는 제외된 사람에게 열리는 문이고, 여기는 아직 제외인지
      // 아닌지를 모른다. 자치구 미지정이면 district 자체가 null이다.
      status = "미판정";
      reason = dx.reason;
    } else if (dx?.excluded) {
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

    // 선행의 제목을 함께 싣는다. UI가 "'OO'을(를) 먼저 하세요"를 조합할 수
    // 있어야 actions.json을 다시 뒤지지 않는다(D-019 §5). 막힘 문구를 콘텐츠로
    // 새로 쓰지 않는 이유이기도 하다 — 제목이 이미 그 일을 한다.
    const blockedBy = (a.depends_on || [])
      .filter((id) => !done.has(id))
      .map((id) => ({ id, title: actions.find((x) => x.id === id)?.title ?? null }));
    const whenNow = placement(a, s.elapsed_hours, deadlineDays);
    rows.push({
      action: a,
      status,
      reason,
      blockedBy,
      // 왜 이 순서인지를 덧붙이는 특수 설명. 5건에만 있고 나머지는 null이다 —
      // 선행 제목으로 충분한 자리에 문구를 새로 쓰지 않는다.
      blocks_reason: a.blocks_reason ?? null,
      // 조례 항목의 문의처와 금액 확인 여부. D-003의 degrade("지원 대상이지만
      // 금액은 구청 문의")를 UI가 districts.json을 안 열고 그릴 수 있어야 한다.
      // excluded만이 아니라 `해당` 행에서도 필요하므로 rows 수준에 둔다.
      dept: a.ordinance_based ? district?.dept ?? null : null,
      amount_known: a.ordinance_based ? district?.amount_known ?? null : null,
      deadline_days: deadlineDays,
      // 분야와 종류를 행에 싣는다. 섹션 행은 groups가 group을 주지만 버킷
      // 행에는 아무것도 없어서, UI가 blocked·excluded를 그리려면 actions.json을
      // 다시 열어야 했다. dept를 행에 실은 것과 같은 이유다(4/4-B).
      group: a.domain_group,
      category: a.category,
      // "얼마나 기다리나". UI가 "보름~두 달"을 그린다. 나머지는
      // null(2/4-C의 키 일관성 규칙). **`대기` 전용이 아니다** — 현재 2건이고
      // 그중 dispute-mediation은 `신청`이다. category로 유무를 추정하지 마라.
      wait_days: a.wait_days ?? null,
      // 3층 타임라인. 데이터의 when이 아니라 여기서 계산된 값이 화면 위치다(D-001)
      when: whenNow,
      // 금지는 완료 개념이 없다. "전원 넣지 않기 ✓"는 이상하다(D-018).
      checkable: whenNow !== "standing",
      // 선행이 안 끝나 잠긴 채로 제자리에 있는 행(D-019 §5). 아래 분배에서
      // 켜진다. 기본값을 여기 두는 것은 키 일관성 때문이다 — 섹션 행마다
      // 있고 없고 하면 UI가 undefined를 만난다.
      locked: false,
      // 화면을 가로지르는 순위(D-019 §2). 섹션이 정해진 뒤에 매긴다.
      rank: null,
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

  const out = { sections: [], done: [], waiting: [], blocked: [], excluded: [] };
  const pool = [];
  for (const r of rows) {
    // done이 어떤 판정보다도 먼저다 — excluded보다도(D-018).
    // 양천에서 30일 안에 신청을 마치고 체크한 사람이 +90d에 열었을 때
    // "기한이 지났습니다"가 아니라 "완료"를 봐야 한다.
    // 체크는 사용자가 한 일의 기록이고 판정은 시스템의 추정이다.
    //
    // checkable을 함께 보는 것은 방어다. UI가 막겠지만 completed에
    // standing 항목 id가 들어와도 무시하고 그 블록에 남긴다.
    //
    // status를 "완료"로 정규화한다(D-019 §10). 버킷 순서로만 지키던 것을
    // 페이로드로도 지킨다 — UI가 버킷이 아니라 status를 읽으면 "완료"가
    // "제외"로 보이고, D-018이 그쪽을 더 나쁘다고 명시했다. 원래 판정은
    // status_if_pending에 남으므로 정보는 잃지 않는다.
    //
    // **reason도 함께 정규화한다**(4/4-E). status만 고치고 사유를 남기면
    // "완료"인데 "신청 기한(30일)이 지났을 수 있습니다"가 붙는다 —
    // P20 양천이 +90d부터 그랬다. 완료한 사람에게 그것은 틀린 말이고,
    // "완료가 아니었다면 무엇이었을지"는 status_if_pending이 이미 담는다.
    if (done.has(r.action.id) && r.checkable) {
      out.done.push({
        ...r,
        status: "완료",
        reason: null,
        status_if_pending: r.status,
        // 없으면 null. 기록이 없다고 완료가 아닌 것은 아니다(위 주석).
        completed_at: completedAt[r.action.id] ?? null,
      });
      continue;
    }
    // `미판정`도 여기로 온다. 새 버킷을 만들지 않는다(D-019 §6) —
    // excluded는 "목록에서 빠졌지만 사라지지는 않은 것"을 모으는 자리이고
    // 미판정이 정확히 그것이다. 버킷을 늘리면 UI가 자리를 하나 더 그려야
    // 하는데 그럴 값이 없다. 무엇인지는 status가 말한다.
    if (r.status !== "해당") { out.excluded.push(r); continue; }
    // 선행이 안 끝난 것 — 되돌릴 수 있는 것만 blocked 버킷으로 접는다.
    //
    // `irreversible`은 placement가 가리키는 자리에 잠긴 채로 남는다(D-019 §5).
    // 접어 두면 fact-layer §0이 최우선이라고 못박은 것이 첫 화면에서 사라지고,
    // 더 나쁘게는 시한이 지난 뒤에도 `missed`에 못 간다 — powder-removal(24h)과
    // dry-water(48h)가 +5d부터 그랬다. placement는 missed를 돌려주는데 이
    // 분배가 먼저 걸러서 어느 블록에도 안 나타났다(100조합 220건 중 160건).
    //
    // D-008("행동할 수 있는 것만 담는다")과 긴장하지만 위반은 아니다.
    // D-008이 빼는 것은 `기관자율`(피해자가 개입할 수 없는 것)이고 이것은
    // 선행만 끝내면 할 수 있는 것이다. 선행 제목은 blocked_by에 실려 있다.
    //
    // **금지는 선행을 기다리지 않는다**(D-018의 짝). `standing`이 여기서
    // 접히면 타임라인 밖 밴드에도 섹션에도 없어 화면에서 통째로 사라진다 —
    // adjusters-may-all-be-opposing이 100조합 중 P16의 5조합에서 그랬다.
    // 데이터에서 depends_on을 뺐지만(4/4-E①) 같은 유형이 다시 들어올 수
    // 있으므로 분배에서도 막는다. blockedBy는 행에 그대로 둔다 —
    // 자리를 바꾸는 것이지 정보를 지우는 것이 아니다.
    if (r.blockedBy.length && r.when !== "standing") {
      if (!r.action.irreversible) { out.blocked.push(r); continue; }
      r.locked = true;
      // 선행이 안 끝났는데 체크되면 done이 거짓이 된다. 위 done 판정은
      // 이미 지나갔으므로 이 대입이 "체크한 것을 잠근다"로 새지 않는다.
      r.checkable = false;
      pool.push(r);
      continue;
    }
    if (r.action.category === "대기") { out.waiting.push(r); continue; }
    pool.push(r);
  }

  // ── 순위 (D-019 §2) ─────────────────────────────
  // 화면을 가로지르는 값이다. **엔진은 자르지 않는다** — UI가 rank <= N만
  // 펴고 나머지는 라벨+개수로 접는다(D-011: Action은 사라지지 않는다).
  // 순위도 순서이므로 D-001이 이미 답을 갖고 있다 — 계산은 엔진의 일이다.
  // UI가 이것을 다시 계산하면 규칙이 두 곳에 흩어지고 계기판이 못 본다.
  //
  // **순위 경쟁에서 빠지는 것이 둘이다** — `standing`과 `missed`.
  //
  // `standing`은 타임라인 밖 별도 밴드라 처음부터 빠져 있었다(D-019 §0).
  // `missed`가 여기 합류한 것은 UI-A②의 개정이다. 지나간 것이 카드 예산을
  // 먹으면 **+5d부터 상위 3이 전부 `missed`가 되어**(개정 전 96/120 조합)
  // 지금 할 수 있는 일이 4위부터 시작한다. 화면에서 지우는 것이 아니라
  // 카드 영역 위 별도 블록으로 뺀 것이다 — Action은 사라지지 않는다(D-011).
  // 둘 다 rank는 null이고, 자르는 것도 접는 것도 UI의 일이다.
  const BLOCK_ORDER = SECTIONS.map(([k]) => k);
  const dataIndex = new Map(actions.map((a, i) => [a.id, i]));
  // Infinity - Infinity가 NaN이라 뺄셈으로 비교하지 않는다. NaN이 falsy라
  // 우연히 다음 규칙으로 넘어가기는 하지만, 우연에 기대면 규칙을 하나 더
  // 얹을 때 조용히 깨진다.
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  // "얼마나 급한가". timing_hours: 0은 만료가 아니라 즉시성의 표시인데
  // (D-017 §2) 정렬에서는 그 뜻 그대로 가장 급한 값이 된다. R2의 `> 0`
  // 가드와 어긋나지 않는다 — 그쪽은 만료 판정이고 이쪽은 정렬이다.
  const urgency = (r) =>
    r.action.timing_hours ??
    (r.deadline_days != null ? r.deadline_days * 24 : null) ??
    Infinity;
  // tier는 **시간 창을 본다**(UI-A② 개정). 개정 전에는 `irreversible`만 보고
  // 시간 창을 안 봐서, 3년짜리 시효(product-claim-limitation)가 24시간짜리
  // 청소와 같은 tier에 앉았다. `missed`가 빠진 자리를 이것이 메운다.
  const tier = (r) => {
    if (r.action.irreversible) return 1;            // 되돌릴 수 없다
    const hasClock = r.action.timing_hours != null || r.deadline_days != null;
    return hasClock ? 2 : 3;                        // 시간 창이 있다 / 없다
  };
  pool
    .filter((r) => r.when !== "standing" && r.when !== "missed")
    .sort(
      (a, b) =>
        cmp(tier(a), tier(b)) ||
        // **급한 것이 잠긴 것보다 먼저다**(UI-A② 개정). 순서가 반대였을 때
        // 24시간짜리 잠김이 3년 시효 뒤로 밀렸다 — 레퍼런스 케이스가 그
        // 조합에 있었다. 잠겨 있어도 "곧 못 하게 된다"는 사실은 그대로다.
        cmp(urgency(a), urgency(b)) ||
        // 같은 급함이면 지금 할 수 있는 것이 앞이다
        cmp(a.locked === true ? 1 : 0, b.locked === true ? 1 : 0) ||
        cmp(BLOCK_ORDER.indexOf(a.when), BLOCK_ORDER.indexOf(b.when)) ||
        // 최종 tie-break. 이 줄이 있어야 같은 입력이 항상 같은 순위를 낸다
        cmp(dataIndex.get(a.action.id), dataIndex.get(b.action.id))
    )
    .forEach((r, i) => { r.rank = i + 1; });

  // 섹션 안쪽 정렬은 rank와 별개로 그대로 둔다. 순위는 화면을 가로지르는
  // 값이고 이것은 블록 안의 값이다 — 하나로 합치면 분야 묶음이 깨진다.
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
    // 조사서를 받아야 뜻이 생기는 블록인지. after_report 항목은 재배치하지
    // 않고(결정 1) 여기 그대로 두되, "나오면 할 수 있는 것"과 "이제 할 수
    // 있는 것" 중 무엇으로 부를지는 UI가 이 값으로 정한다.
    //
    // 모든 섹션에 넣는다. 섹션 객체의 모양이 일정해야 UI가 분기 없이 읽고,
    // 나중에 다른 블록에 잠금 조건이 생겨도 구조를 안 바꾼다.
    const unlocked = key === "after_report" ? s.report_received === true : true;
    out.sections.push({ key, label, count: items.length, unlocked, groups });
  }

  return out;
}
