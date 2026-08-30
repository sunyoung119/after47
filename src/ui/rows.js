// 행 계약 — 엔진 출력 한 줄을 화면 행으로 옮긴다. **DOM을 모른다.**
//
// 화면이 여럿(체크리스트·먼저 볼 내용·알아둘 내용·타임라인·주제별)인데
// 읽는 행은 하나다. 행 모양이 화면마다 갈리면 같은 Action이 화면마다
// 다른 것을 말하게 된다 — 그래서 변환을 여기 한 곳에 둔다.
//
// ★ **여기서 판정을 다시 하지 않는다.** rank·placement·status는 엔진이
//   준 값을 그대로 옮긴다(ENGINE-FIRST). id·title·body 문자열에서 의미를
//   추론하지도 않는다 — `guidance_type` 같은 명시 메타데이터만 본다.

// 조례 항목의 출처 재료는 Action이 아니라 **그 사람의 자치구 조례**에 있다.
// 자치구를 안 골랐으면 전부 null이고, 그래도 화면은 그려져야 한다(D-003).
export function rowContext({ state = {}, data = {} } = {}) {
  const 구 = (data.districts || []).find((d) => d.id === state.district) || null;
  return {
    ordinanceName: 구?.ordinance_name ?? null,
    articles: 구?.support_articles ?? {},
    ordinanceCheckedAt: 구?.checked_at ?? null,
  };
}

// 값이 없으면 null이지 키가 빠지지 않는다(엔진 계약과 같은 톤).
export function toRow(x, ctx = {}) {
  const a = x.action;
  return {
    id: a.id,
    title: a.title,
    summary: a.summary ?? null,
    body: a.body ?? null,
    group: a.domain_group ?? x.group ?? null,
    category: x.category ?? a.category ?? null,
    irreversible: a.irreversible === true,
    // 안내의 성격. **제목을 읽어서 추측하지 않기 위해 행에 싣는다** —
    // `하지 마세요`(do_not)와 `알아둘 내용`(awareness)이 이 값으로 갈린다.
    guidanceType: a.guidance_type ?? null,
    // 출처 한 줄을 그리기 위한 재료. 없는 항목이 21건이라 null이 정상이다.
    sourceUrl: a.source_url ?? null,
    sourceGrade: a.source_grade ?? null,
    checkedAt: a.checked_at ?? null,
    // 새 출처 구조. **아직 전부 빈 배열이다** — 채우는 것은 원문을 하나씩
    // 확인하는 콘텐츠 패스의 일이고, URL이나 본문을 파싱해 문서명·조문을
    // 만들어 내지 않는다. 화면은 sources → legacy sourceUrl → 생략 순으로 읽는다.
    sources: a.sources ?? [],
    // 조례 항목의 출처는 Action이 아니라 자치구 조례에 있다. 행이 조합에 필요한
    // 재료(조례 이름·해당 조문)를 싣는다 — 엔진이 아니라 여기서.
    ordinanceName: a.ordinance_based ? ctx.ordinanceName ?? null : null,
    ordinanceArticle:
      a.ordinance_based && a.support_item ? (ctx.articles ?? {})[a.support_item] ?? null : null,
    ordinanceCheckedAt: a.ordinance_based ? ctx.ordinanceCheckedAt ?? null : null,
    // 조례 항목에만 붙는 문의 줄의 조건. 엔진이 `dept`·`amount_known`을
    // 조례 항목에만 채우지만, 자치구 미지정이면 그것도 null이 되므로
    // Action 쪽 플래그를 그대로 본다.
    ordinanceBased: a.ordinance_based === true,
    when: x.when ?? null,
    rank: x.rank ?? null,
    locked: x.locked === true,
    checkable: x.checkable === true,
    // 잠긴 행이 "먼저: OO"를 조합하는 재료. 콘텐츠를 새로 쓰지 않는다(4/4-B).
    blockedBy: x.blockedBy ?? [],
    blocksReason: x.blocks_reason ?? null,
    status: x.status ?? null,
    statusIfPending: x.status_if_pending ?? null,
    reason: x.reason ?? null,
    dept: x.dept ?? null,
    amountKnown: x.amount_known ?? null,
    waitDays: x.wait_days ?? null,
    deadlineDays: x.deadline_days ?? null,
    completedAt: x.completed_at ?? null,
  };
}

// ── 잠긴 행의 선행이 이 화면에 있는가 ───────────────
//
// **없을 수 있다.** 선행 Action이 `applies_when`에 안 맞으면 그 사람에게는
// 아예 뜨지 않는데, `depends_on`은 그대로라 잠김만 남는다. 레퍼런스 케이스가
// 그렇다 — `scene_preserved: true`인 사람에게 `scene-release`가 안 뜨고,
// 그것을 선행으로 둔 `powder-removal`·`dry-water`가 잠긴 채로 있다.
//
// 화면이 할 수 있는 것은 **버튼이 사실이 아닌 것을 주장하지 않게 하는 것**
// 이다. 갈 곳이 있을 때만 이동을 그린다.
export function linkLeads(all) {
  const present = new Set(all.map((r) => r.id));
  for (const r of all) {
    // **화면에 있는 첫 선행**을 고른다. `blockedBy[0]`만 보면 그것 하나가
    // 안 뜨는 사람에게 "갈 곳 없음"이 되는데, 나머지 선행은 멀쩡히 화면에
    // 있을 수 있다 — `powder-removal`이 그렇다(scene-release는 안 뜨지만
    // photo-before-cleanup은 화면에 있다).
    r.leadTo = r.blockedBy.find((b) => present.has(b.id)) ?? null;
    // 선행이 **하나도** 화면에 없을 때만 스스로 풀 수 없다.
    r.leadMissing = r.blockedBy.length > 0 && !r.leadTo;
  }
  return all;
}

// ── 한 번만 만드는 행 묶음 ──────────────────────────
//
// 결과 화면 여섯이 같은 묶음을 읽는다. 화면마다 다시 만들면 같은 사람의
// 같은 시각에 대해 화면끼리 다른 답을 낼 수 있다.
export function buildRows({ result, state = {}, data = {} } = {}) {
  const ctx = rowContext({ state, data });

  const sections = [];
  for (const s of result?.sections || [])
    for (const g of s.groups || [])
      for (const it of g.items || []) sections.push({ ...toRow(it, ctx), section: s.key });

  const waiting = (result?.waiting || [])
    .map((x) => toRow(x, ctx))
    // 정렬은 `wait_days` 하한이다. 버킷 행에는 rank가 없다.
    .sort((a, b) => (a.waitDays?.[0] ?? 1e9) - (b.waitDays?.[0] ?? 1e9));
  const blocked = (result?.blocked || []).map((x) => toRow(x, ctx));
  const done = (result?.done || []).map((x) => toRow(x, ctx));

  // 자치구를 안 골라서 미판정인 건은 화면에서 고르게 유도할 수 있다.
  // 다른 미판정(보험 unknown)은 설문으로 돌아가야 하므로 구분한다.
  const noDistrict = !state.district;
  const excluded = (result?.excluded || []).map((x) => {
    const r = toRow(x, ctx);
    return { ...r, needsDistrict: noDistrict && r.status === "미판정" };
  });

  const all = [...sections, ...waiting, ...blocked, ...excluded, ...done];
  linkLeads(all);

  const bySection = (key) => sections.filter((r) => r.section === key);

  return {
    ctx,
    state,
    data,
    all,
    byId: new Map(all.map((r) => [r.id, r])),
    sections,
    bySection,
    // 섹션의 잠금 상태(after_report). 행이 아니라 섹션의 성질이라 따로 싣는다 —
    // `row.locked=true`와 `sections[after_report].unlocked=false`는 다른 것이다.
    sectionMeta: new Map((result?.sections || []).map((s) => [s.key, s])),
    missed: bySection("missed"),
    standing: bySection("standing"),
    waiting,
    blocked,
    excluded,
    done,
  };
}
