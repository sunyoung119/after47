// 연락처 뷰모델 — **보류 중인 모듈이다.** 라우팅에 연결돼 있지 않다.
//
// 확정된 결과 IA(내 회복 경로)에 연락처 화면은 없다. 화면 UX를 먼저
// 확정하고 연락처 아키텍처는 별도 패스에서 정하기로 했기 때문이다 —
// 서울 자치구 민원은 다산콜센터 같은 대표창구 라우팅이 있어서, 구청
// 직통번호를 전수 수집하는 것이 늘 최선인지부터 판단해야 한다.
//
// **지우지 않는 이유**는 이 판단이 이미 한 번 내려진 것이라서다. 어떤
// Action에 어떤 창구가 붙는지, 부서를 모르는 구를 어떻게 degrade하는지는
// 다시 도출할 필요가 없다. 후속 패스가 화면을 정하면 이 함수가 그 자리에
// 붙는다. 그때까지 테스트만 이것을 밟는다.
//
// 후속 패스가 정할 것 — 외부 문의가 필요한 Action 전수 · 목적별 1차 창구
// (대표번호 / 직통 / 국가 전문기관) · 공식 번호와 운영시간 검증 ·
// `tel:` 제공 여부 · 최종 시안.

import { COPY, CONTACTS, CONTACT_BY_ACTION } from "./copy.js";

// base는 result.js의 resultBase가 준 행 묶음이다. 옛 가로 덱의 타임라인
// 뷰모델에 매달려 있던 것을 떼어냈다 — 그 화면은 사라졌고 이 모듈은 남는다.
export function contactsView(base = {}, { state = {}, data = {} } = {}) {
  const district = (data.districts || []).find((d) => d.id === state.district) || null;

  // 그 사람에게 해당하는 행. 해당하지 않는 것(excluded)의 창구는 띄우지 않는다.
  const live = [
    ...(base.sections || []),
    ...(base.waiting || []),
    ...(base.blocked || []),
    ...(base.done || []),
  ];

  // 조례 항목이 화면에 있으면 그 구의 담당 부서를 안내한다. 부서를 모르는
  // 구가 9개라 그때는 이름 없이 "구청 대표번호로 문의"만 남는다(D-003).
  const hasOrdinanceRow = [...live, ...(base.excluded || [])].some((r) => r && r.ordinanceBased);

  // 화면에 그 안내가 있을 때만 창구를 띄운다 — 설문 맞춤이다.
  const shown = new Set(live.filter(Boolean).map((r) => r.id));
  const orgs = Object.entries(CONTACT_BY_ACTION)
    .filter(([id]) => shown.has(id))
    .map(([id, c]) => ({ id, name: c.name, tel: c.tel, note: c.note ?? null }));

  return {
    global: CONTACTS.map((c) => ({ ...c })),
    district:
      district && hasOrdinanceRow
        ? {
            id: district.id,
            name: district.name,
            dept: district.dept ?? null,
            // 구별 번호는 다음 패스. 비워 두되 화면은 없는 줄을 안 그린다.
            tel: null,
            note: district.dept
              ? COPY.contacts.deptNote(district.name, district.dept)
              : COPY.contacts.deptUnknown(district.name),
          }
        : null,
    orgs,
  };
}

// 출처 한 줄에 쓰던 호스트 추출. 연락처와 무관하지만 옛 pages.js에서
// 함께 옮겨 왔다 — 쓰는 곳이 생기기 전까지는 여기 둔다.
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
