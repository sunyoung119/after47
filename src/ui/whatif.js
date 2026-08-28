// 가정 판정 — "이렇게 답하면?" 과 "다른 구라면?"
//
// 둘 다 같은 일을 한다. **state 사본을 만들어 evaluate를 돌리고 결과만
// 본다.** 저장하지 않는다 — 가정 답도, 비교 대상 구도 마찬가지다.
//
// ★ 이 파일이 만든 state는 절대 saveState로 가면 안 된다. 사용자가 실제로
//   답한 것과 "만약에"를 섞으면 그 뒤의 모든 판정이 거짓이 된다.
//
// DOM을 모른다. view.js·timeline.js와 같은 이유로 순수함수다.

import { evaluate } from "../engine.js";
import { applyDefaults, visibleQuestions, unansweredKeys } from "../questions.js";

// 결과의 모든 행을 id → 행으로. 섹션·버킷을 가리지 않는다.
function indexOf(result) {
  const m = new Map();
  for (const s of result.sections || [])
    for (const g of s.groups || []) for (const it of g.items || []) m.set(it.action.id, { ...it, bucket: s.key });
  for (const b of ["done", "waiting", "blocked", "excluded"])
    for (const it of result[b] || []) m.set(it.action.id, { ...it, bucket: b });
  return m;
}

// **가정 판정은 사본으로만 돈다.** 원본 state는 건드리지 않는다.
const judge = (questions, state, data, now) =>
  evaluate(applyDefaults(questions, state, now), data, now);

// ── 갈림길 ─────────────────────────────────────────
//
// 아직 답하지 않은 질문을 타임라인 위의 노드로 놓는다. 답이 갈리면 화면이
// 어떻게 달라지는지를 **유령 미리보기**로 보여준다 — 각 선택지로 실제
// evaluate를 돌려 "그 답이면 새로 나올 것"의 제목을 두세 개 뽑는다.
//
// 미리보기가 추측이 아니라 실제 판정이라는 점이 중요하다. 콘텐츠를 새로
// 쓰지 않으므로 문구가 어긋날 자리도 없다.
export function forkView({ questions, state, data, now = Date.now(), peek = 3 } = {}) {
  const left = unansweredKeys(questions, state, data, now);
  if (!left.length) return { question: null, remaining: 0 };

  const visible = visibleQuestions(questions, state, data, now);
  const q = visible.find((x) => x.key === left[0]);
  if (!q) return { question: null, remaining: left.length };

  const base = judge(questions, state, data, now);
  const baseIds = indexOf(base);

  const options = (q.options || []).map((o) => {
    // ★ 사본이다. 이 객체는 저장 계층으로 가지 않는다.
    const alt = judge(questions, { ...state, [q.key]: o.value }, data, now);
    const fresh = [];
    for (const [id, row] of indexOf(alt)) {
      if (baseIds.has(id)) continue;
      fresh.push({ id, title: row.action.title, when: row.when ?? null });
    }
    // 새로 생기는 것이 없으면 순위가 바뀌는 것을 보여준다. 아무것도 안
    // 달라지는 답도 있고, 그때는 빈 배열이다 — 없는 변화를 지어내지 않는다.
    const moved = [];
    if (!fresh.length) {
      for (const [id, row] of indexOf(alt)) {
        const was = baseIds.get(id);
        if (!was || typeof row.rank !== "number" || typeof was.rank !== "number") continue;
        if (row.rank < was.rank) moved.push({ id, title: row.action.title, from: was.rank, to: row.rank });
      }
      moved.sort((a, b) => a.to - b.to);
    }
    return {
      value: o.value,
      label: o.label,
      // 유령 미리보기 — 2~3개까지만. 전부 보여주면 답하기 전에 화면이 는다.
      preview: fresh.slice(0, peek),
      moved: moved.slice(0, peek),
    };
  });

  return {
    question: { id: q.id, key: q.key, text: q.text, help: q.help ?? null, options },
    remaining: left.length,
  };
}

// ── 자치구 비교 ────────────────────────────────────
//
// "같은 화재, 다른 구, 다른 답." 발표의 한 장면이고, 이 서비스의 존재
// 이유를 한 화면에 담는 자리다(problem-definition §2-3).
//
// **보기 전환일 뿐이다.** 저장 state의 `district`는 바뀌지 않는다 —
// `evaluate`에 사본만 넘긴다.
export function compareView({ questions, state, data, now = Date.now(), otherId = null } = {}) {
  const districts = data.districts || [];
  const mineId = state.district ?? null;
  const mine = districts.find((d) => d.id === mineId) || null;
  const other = districts.find((d) => d.id === otherId) || null;

  const options = districts
    .filter((d) => d.id !== mineId)
    .map((d) => ({ id: d.id, name: d.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  if (!other) return { active: false, mine, other: null, options, rows: [] };

  const a = indexOf(judge(questions, state, data, now));
  // ★ 사본. 비교 대상 구는 저장되지 않는다.
  const b = indexOf(judge(questions, { ...state, district: other.id }, data, now));

  // 양쪽을 합친 뒤 **다른 것만** 남긴다. 자치구가 바꾸는 것은 조례 항목뿐이라
  // 대부분은 같고, 그 "대부분 같다"도 정보다(개수로 말한다).
  const ids = new Set([...a.keys(), ...b.keys()]);
  const rows = [];
  let same = 0;
  for (const id of ids) {
    const x = a.get(id) || null;
    const y = b.get(id) || null;
    const xs = x ? x.status : null;
    const ys = y ? y.status : null;
    const xr = x ? x.reason ?? null : null;
    const yr = y ? y.reason ?? null : null;
    if (xs === ys && xr === yr) {
      same++;
      continue;
    }
    rows.push({
      id,
      title: (x || y).action.title,
      mine: x ? { status: xs, reason: xr, dept: x.dept ?? null } : null,
      other: y ? { status: ys, reason: yr, dept: y.dept ?? null } : null,
    });
  }
  rows.sort((p, q2) => p.id.localeCompare(q2.id));

  return { active: true, mine, other, options, rows, sameCount: same };
}
