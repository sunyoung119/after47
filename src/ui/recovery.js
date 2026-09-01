// 내 회복 경로 그리기 — 뷰모델이 정한 것을 DOM으로 옮긴다.
//
//   HOME → { 먼저 볼 내용 · 체크리스트 · 알아둘 내용 ·
//            회복 타임라인 · 주제별로 보기 } → 상세
//
// 판단은 result.js가 한다. 여기는 만들기만 한다 — 무엇을 담을지, 무엇을
// 어떤 이름으로 부를지는 전부 뷰모델에서 온다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). 누수 탐지가 src/ 아래를 재귀로 훑는다.
// ★ 색값을 쓰지 않는다. 시각은 전부 tokens.css의 변수다.
// ★ **표시 여부를 연출에 걸지 않는다.** 기본 상태는 보이는 것이고, 등장
//   연출이 있다면 @keyframes의 from에만 둔다. 실기기 사고(cc6a865)의 교훈이다.

import { COPY } from "./copy.js";
import { el, clear, telIcon, chev } from "./render.js";

// 상태 배지. **갈래는 뷰모델이 정한다** — 여기서 라벨 문자열을 읽어
// 색을 고르지 않는다.
const chip = (label, kind) => el("span", kind ? `chip chip--${kind}` : "chip", label);

const btn = (cls, label, fn) => {
  const b = el("button", cls, label);
  b.type = "button";
  if (fn) b.addEventListener("click", fn);
  return b;
};

// 화면 머리 — 큰 제목 + 한 줄 설명. 확정 화면 전부가 같은 형태다.
function head(main, title, desc) {
  main.appendChild(el("h2", "pg__title", title));
  if (desc) main.appendChild(el("p", "pg__desc", desc));
}

// 개수가 0인 카드로 들어왔을 때. 한 줄만이다.
function empty(main) {
  main.appendChild(el("p", "pg__empty", COPY.emptyPage));
}

// ── HOME ───────────────────────────────────────────
//
// 카드 셋 + 보조 둘. **개수가 0이어도 카드를 지우지 않는다** — 0개면
// 0개라고 말한다. 자리가 늘 같아야 재방문에서 화면 구조가 안 흔들린다.
export function renderHome(main, hv, { onGo, onSave, saved }) {
  // **제목 하나다.** 기준 줄과 리드는 바로 앞 전환 화면이 이미 말했다 —
  // 도착지에서 같은 문장을 다시 보이면 "아직 시작 안 됐다"로 읽힌다.
  const hero = el("section", "home__hero");
  hero.appendChild(el("h2", "home__title", hv.title));
  main.appendChild(hero);

  const list = el("div", "home__cards");
  for (const c of hv.cards) {
    const b = btn("hcard", null, () => onGo(c.key));
    const text = el("span", "hcard__text");
    text.appendChild(el("span", "hcard__title", c.title));
    text.appendChild(el("span", "hcard__desc", c.desc));
    b.appendChild(text);
    const tail = el("span", "hcard__tail");
    tail.appendChild(el("span", "hcard__count", COPY.home.count(c.count)));
    tail.appendChild(el("span", "chev", "›"));
    b.appendChild(tail);
    list.appendChild(b);
  }
  main.appendChild(list);

  // 보조 탐색 — 핵심 셋 아래 충분한 간격. 중간 heading은 없다.
  const more = el("div", "home__more");
  for (const m of hv.more) {
    const b = btn("mcard", null, () => onGo(m.key));
    b.appendChild(el("span", null, m.label));
    b.appendChild(el("span", "chev", "›"));
    more.appendChild(b);
  }
  main.appendChild(more);

  // 참고 자료 한 줄 — 같은 스타일, 보조 탐색 아래.
  if (hv.extra?.length) {
    const extra = el("div", "home__more home__more--extra");
    for (const m of hv.extra) {
      const b = btn("mcard", null, () => onGo(m.key));
      b.appendChild(el("span", null, m.label));
      b.appendChild(el("span", "chev", "›"));
      extra.appendChild(b);
    }
    main.appendChild(extra);
  }

  // D-015 2층 — 결과에 닿은 뒤로는 작게 상시. 헤더가 확정 화면에서
  // `일상으로`/`이전`로 차 있어 이 자리로 왔다.
  if (onSave) {
    const s = btn("btn btn--quiet home__save", saved ? COPY.save.headerDone : COPY.save.header, onSave);
    main.appendChild(s);
  }
}

// ── 먼저 볼 내용 ───────────────────────────────────
export function renderPriority(main, pv, { onOpen }) {
  head(main, pv.title, pv.desc);
  if (!pv.count) return empty(main);
  for (const s of pv.sections) {
    const sec = el("section", `pg__sec pg__sec--${s.key}`);
    sec.appendChild(el("h3", "pg__sechead", s.label));
    const ul = el("ul", "cards");
    for (const r of s.items) ul.appendChild(simpleCard(r, onOpen));
    sec.appendChild(ul);
    main.appendChild(sec);
  }
}

// ── 체크리스트 ─────────────────────────────────────
//
// 체크는 여기의 역할이다. 잠긴 카드는 표면에 선행 문장을 그대로 쓴다 —
// 별도 heading도 badge도 없고, 더보기 안에 숨기지 않는다.
export function renderChecklist(main, cv, { onOpen, onCheck }) {
  head(main, cv.title, cv.desc);
  if (!cv.items.length) return empty(main);

  // **완료한 것도 이 목록 안에 그대로 있다**(사용자 실기기 검수 결정).
  // 아래로 내려가는 별도 블록이 없다 — 체크한 순간에도, 나갔다 돌아와도
  // 같은 자리이고 체크 표시와 면 색만 달라진다. 자리는 뷰모델의 자리표가
  // 정하고, 그 자리표는 답이 바뀌지 않는 한 고정이다.
  const ul = el("ul", "cards");
  for (const r of cv.items) ul.appendChild(checkCard(r, { onOpen, onCheck }));
  main.appendChild(ul);

  main.appendChild(el("p", "pg__foot", cv.footer));
}

// ── 알아둘 내용 ────────────────────────────────────
// 중간 heading 없이 카드 바로 나열. waiting만 카드 수준 상태로 구분한다.
export function renderReference(main, rv, { onOpen }) {
  head(main, rv.title, rv.desc);
  if (!rv.count) return empty(main);
  const ul = el("ul", "cards");
  for (const r of rv.items) ul.appendChild(simpleCard(r, onOpen));
  main.appendChild(ul);
}

// ── 회복 타임라인 ──────────────────────────────────
//
// 전체 흐름을 시간순으로. 노드는 기본 접힘이고 탭하면 펼쳐진다.
// **여러 개를 동시에 펼 수 있다** — 한 번에 하나만 펴는 규칙은 확정되지
// 않았고, 접힘/펼침을 서로 닫는 구현은 뒤로가기 감각을 흐린다.
export function renderTimelinePage(main, tv, { onOpen, onHub }) {
  head(main, tv.title, tv.desc);

  const line = el("ol", "tline");

  for (const n of tv.nodes) {
    // 잠김은 섹션의 성질이다(조사서를 받으면 열린다). 행의 locked와 다르다.
    const li = el(
      "li",
      `tline__node tline__node--${n.kind}` +
        `${n.empty ? " tline__node--empty" : ""}` +
        `${n.unlocked === false ? " tline__node--locked" : ""}`
    );
    li.appendChild(el("span", "tline__dot"));

    if (n.kind === "info") {
      const box = el("div", "tline__info");
      box.appendChild(el("p", "tline__label", n.label));
      // 박스 없이 디지털 텍스트로. 시각이 없으면 날짜만 그린다.
      if (n.date) {
        const t = el("p", "tline__stamp", n.date);
        if (n.time) t.appendChild(el("span", "tline__clock", n.time));
        box.appendChild(t);
      }
      li.appendChild(box);
      line.appendChild(li);
      continue;
    }

    const det = el("details", "tline__body");
    const sum = el("summary", "tline__sum");
    const left = el("span", "tline__left");
    left.appendChild(el("span", "tline__label", n.label));
    if (n.note) left.appendChild(el("span", "tline__note", n.note));
    sum.appendChild(left);
    const right = el("span", "tline__tail");
    right.appendChild(el("span", "tline__count", COPY.recovery.count(n.count)));
    right.appendChild(el("span", "chev", "›"));
    sum.appendChild(right);
    det.appendChild(sum);

    if (!n.count) det.appendChild(el("p", "pg__empty", COPY.emptyPage));
    else {
      const ul = el("ul", "cards");
      for (const r of n.items) ul.appendChild(simpleCard(r, onOpen));
      det.appendChild(ul);
    }
    li.appendChild(det);
    line.appendChild(li);
  }

  main.appendChild(line);

  // 맞춤 안내로 가는 문. ★ **타임라인 아래다**(2026-09-02 · 사용자 결정).
  // 앞서 제목 바로 아래에 있었다 — 도착한 사람이 다음 자리를 못 찾을까
  // 봐서였는데, 그 자리에 있으면 **경로보다 먼저 읽혀 도착 화면이 경유지로
  // 보인다.** 여기는 도착지이고, 먼저 보여야 하는 것은 자기 회복 경로다.
  // 탭 단서는 브릿지 CTA와 같은 클래스·같은 글자다(`btn--tap` + `chev`).
  if (tv.toHub && onHub) {
    const go = btn("btn btn--primary hub__go btn--tap", tv.toHub, onHub);
    go.appendChild(chev());
    main.appendChild(go);
  }

  main.appendChild(el("p", "pg__foot", tv.footer));
}

// ── 주제별로 보기 ──────────────────────────────────
// 2열 카드 + 마지막이 홀수로 남으면 전체폭.
export function renderTopics(main, tv, { onOpen }) {
  head(main, tv.title, tv.desc);
  if (!tv.topics.length) {
    empty(main);
    main.appendChild(el("p", "pg__foot", tv.footer));
    return;
  }
  const grid = el("div", "topics");
  // **`필요서류`만 전체 폭이다**(확정 화면 11). 서류는 다른 주제와 성격이
  // 달라서 — 나머지가 '무엇을 하는가'라면 이쪽은 '무엇을 챙기는가'다.
  // 데이터의 domain_group으로 고른다(표시 라벨 문자열이 아니라).
  tv.topics.forEach((t) => {
    const wide = t.group === "서류";
    const b = btn(`tcard${wide ? " tcard--wide" : ""}`, null, () => onOpen(t.group));
    b.appendChild(el("span", "tcard__label", t.label));
    const tail = el("span", "tcard__tail");
    tail.appendChild(el("span", "tcard__count", COPY.topics.count(t.count)));
    tail.appendChild(el("span", "chev", "›"));
    b.appendChild(tail);
    grid.appendChild(b);
  });
  main.appendChild(grid);
  main.appendChild(el("p", "pg__foot", tv.footer));
}

// ── 근거 법령 ──────────────────────────────────────
//
// **기본은 전부 접혀 있다.** 펼치면 조문 줄이 나오고, 각 줄에 원문 링크와
// 그 근거를 쓰는 안내가 붙는다. 한 번에 다 펼쳐 놓으면 목록이 아니라 벽이
// 된다 — 여기 오는 사람은 "무엇이 근거인가"를 훑으러 온다.
//
// 자치구 조례가 맨 위에 선다. **원문 링크는 없다**(elis 홈페이지를 원문으로
// 걸지 않는다).
export function renderSourceList(main, sv, { onOpen }) {
  head(main, sv.title, sv.desc);
  if (!sv.count) return empty(main);

  if (sv.ordinance) {
    const det = el("details", "fold fold--src");
    const sum = el("summary", "fold__sum");
    const left = el("span", "fold__left");
    left.appendChild(el("span", "fold__label", sv.ordinance.label));
    left.appendChild(el("span", "fold__title", sv.ordinance.title));
    sum.appendChild(left);
    sum.appendChild(el("span", "chev", "›"));
    det.appendChild(sum);
    for (const e of sv.ordinance.entries) det.appendChild(sourceRow(e, onOpen));
    main.appendChild(det);
  }

  for (const g of sv.groups) {
    const sec = el("section", "pg__sec");
    sec.appendChild(el("h3", "pg__sechead", g.label));
    for (const item of g.items) {
      const det = el("details", "fold fold--src");
      const sum = el("summary", "fold__sum");
      const left = el("span", "fold__left");
      left.appendChild(el("span", "fold__title", item.title));
      sum.appendChild(left);
      sum.appendChild(el("span", "chev", "›"));
      det.appendChild(sum);
      for (const e of item.entries) det.appendChild(sourceRow(e, onOpen));
      sec.appendChild(det);
    }
    main.appendChild(sec);
  }

  main.appendChild(el("p", "pg__foot", sv.footer));
}

// 근거 한 줄 — 조문(있으면) · 원문 링크 · 이 근거를 쓰는 안내들.
function sourceRow(e, onOpen) {
  const box = el("div", "srcrow");
  const top = el("div", "srcrow__top");
  // **조문이 없으면 그 자리를 비운다** — 없는 조문을 만들어 붙이지 않는다.
  if (e.article) top.appendChild(el("span", "srcrow__article", e.article));
  if (e.url) top.appendChild(extLink(e.url, e.link));
  box.appendChild(top);

  const meta = [e.publisher, e.checkedAt ? COPY.actionDetail.checked(e.checkedAt) : null]
    .filter(Boolean)
    .join(" · ");
  if (meta) box.appendChild(el("p", "srcrow__meta", meta));

  // 이 근거를 쓰는 안내로 간다. 근거만 보고 끝나면 여기 온 이유가 없다.
  const uses = el("div", "srcrow__uses");
  uses.appendChild(el("span", "srcrow__count", e.uses));
  for (const a of e.actions) {
    const b = btn("srcrow__link", a.title, () => onOpen(a.id));
    uses.appendChild(b);
  }
  box.appendChild(uses);
  return box;
}

// ── 연락처 ─────────────────────────────────────────
//
// 그룹 순서대로 그린다(긴급 → 복지·긴급지원 → 법률·분쟁 → 심리).
// 번호는 `tel:` 링크라 탭하면 전화 앱이 열린다.
// **`검증됨`류 과장 문구는 없다.**
export function renderDirectory(main, dv, {}) {
  head(main, dv.title, dv.desc);
  if (!dv.count) return empty(main);

  for (const g of dv.groups) {
    const sec = el("section", "pg__sec");
    sec.appendChild(el("h3", "pg__sechead", g.group));
    const ul = el("ul", "cards");
    for (const c of g.items) ul.appendChild(telCard(c));
    sec.appendChild(ul);
    main.appendChild(sec);
  }

  // 자치구 줄 — **그 구의 관할 소방서 화재조사 직통.** 구를 안 골랐으면
  // 줄 자체가 없다. 옛 구청 부서 줄을 대신한다.
  if (dv.district) {
    const sec = el("section", "pg__sec");
    const ul = el("ul", "cards");
    ul.appendChild(telCard(dv.district));
    sec.appendChild(ul);
    main.appendChild(sec);
  }

  // 번호도 링크도 없는 문장 하나. **개인이 거는 곳이 아니라는 사실이 정보다** —
  // 번호를 실으면 헛걸음을 만든다.
  if (dv.relief) main.appendChild(el("p", "pg__foot", dv.relief));
}

// 연락처 카드 한 장. 기관명 · 큰 번호 · 보조 한 줄.
function telCard(c) {
  const li = el("li", "card card--tel");
  const box = el("div", "tel__box");
  if (c.url) {
    const p = el("p", "tel__org");
    const a = el("a", "src__org", c.org);
    a.href = c.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    p.appendChild(a);
    box.appendChild(p);
  } else {
    box.appendChild(el("p", "tel__org", c.org));
  }
  if (c.tel) {
    const a = el("a", "tel__num");
    a.href = c.telHref;
    // 아이콘이 먼저, 번호가 뒤. **아이콘은 `tel:`에만 붙는다.**
    a.appendChild(telIcon());
    a.appendChild(el("span", "tel__digits", c.tel));
    box.appendChild(a);
  }
  if (c.note) box.appendChild(el("p", "tel__note", c.note));
  li.appendChild(box);
  return li;
}

// ── 주제 상세 (7주제 공통 템플릿) ──────────────────
//
// 주제마다 화면을 따로 만들지 않는다. 조건부·제외는 아래에 **따로따로**
// 접힌다(D-011: 사라지지 않는다). 미판정은 접힘이 아니라 본목록에 남는다.
export function renderTopicDetail(main, td, { onOpen }) {
  main.appendChild(el("p", "pg__eyebrow", COPY.topics.title));
  main.appendChild(el("h2", "pg__title", td.label));
  // 주제명 아래 한 줄. 표시 라벨로 조합한 문장이다.
  if (td.desc) main.appendChild(el("p", "pg__desc", td.desc));
  main.appendChild(el("p", "pg__count", td.countLabel));

  if (!td.count) empty(main);
  else {
    const ul = el("ul", "cards");
    for (const r of td.items) ul.appendChild(topicCard(r, onOpen));
    main.appendChild(ul);
  }

  for (const f of td.folds) {
    const det = el("details", "fold");
    det.appendChild(el("summary", "fold__sum", f.label));
    const ul = el("ul", "cards");
    for (const r of f.items) {
      const li = el("li", "card card--dim");
      li.dataset.row = r.id;
      li.appendChild(el("p", "card__title", r.title));
      // 왜 아닌지가 정보다. 사유 없이 접기만 하면 D-011이 무의미해진다.
      if (r.reason) li.appendChild(el("p", "card__reason", r.reason));
      const meta = el("p", "card__meta");
      meta.appendChild(chip(r.statusLabel, r.statusKind));
      li.appendChild(meta);
      ul.appendChild(li);
    }
    det.appendChild(ul);
    main.appendChild(det);
  }

  main.appendChild(el("p", "pg__foot", td.footer));
}

// ── Action 상세 (공통 템플릿) ──────────────────────
export function renderActionDetail(main, ad, { onGoTo }) {
  main.appendChild(el("p", "pg__eyebrow", ad.topic));
  main.appendChild(el("h2", "pg__title", ad.title));

  const flags = el("p", "card__meta");
  if (ad.statusLabel) flags.appendChild(chip(ad.statusLabel, ad.statusKind));
  if (ad.warn) flags.appendChild(chip(ad.warn, "warn"));
  if (flags.childNodes.length) main.appendChild(flags);

  if (ad.summary) main.appendChild(el("p", "detail__summary", ad.summary));
  // 잠김의 의미는 체크리스트와 같은 문장으로. 새 화면 유형을 만들지 않는다.
  if (ad.lock) main.appendChild(lockLine(ad.lock, onGoTo));
  if (ad.body) main.appendChild(bodyBlock(ad.body));
  // 조례 항목에만 붙는 줄. 앱이 "해당"이라 해도 확정하는 곳은 구청이다 —
  // 확정 템플릿에는 없지만 이 줄이 없으면 앱이 자기 권한을 넘겨 말한다.
  if (ad.ordinanceNote) main.appendChild(el("p", "detail__note", ad.ordinanceNote));

  const src = sourceCard(ad.source);
  if (src) main.appendChild(src);
  const con = contactLine(ad.contact);
  if (con) main.appendChild(con);
  main.appendChild(el("p", "pg__foot", ad.footer));
}

// ── 아직 확인 못 함 ────────────────────────────────
//
// `잘 모르겠어요`를 `해당 없음`으로 바꾸지 않고, 판단에 필요한 조건과
// 다음 행동을 그대로 보여준다.
export function renderUndetermined(main, uv, { onAnswer }) {
  main.appendChild(el("p", "pg__eyebrow", uv.topic));
  const flags = el("p", "card__meta");
  flags.appendChild(chip(uv.label, uv.labelKind));
  main.appendChild(flags);
  main.appendChild(el("h2", "pg__title", uv.title));
  if (uv.summary) main.appendChild(el("p", "detail__summary", uv.summary));

  const why = el("section", "und");
  why.appendChild(el("h3", "und__head", uv.why.title));
  // ★ 엔진이 준 사유 그대로다. 화면이 새로 쓰지 않는다.
  why.appendChild(el("p", "und__line", uv.why.line));
  main.appendChild(why);

  const how = el("section", "und");
  how.appendChild(el("h3", "und__head", uv.how.title));
  how.appendChild(el("p", "und__line", uv.how.line));
  if (uv.how.cta) {
    // 바꿔야 할 답으로 바로 간다. 목적지가 없으면 버튼도 없다.
    how.appendChild(btn("btn btn--primary", uv.how.cta, () => onAnswer(uv.how.targets)));
    const ul = el("ul", "und__qs");
    for (const q of uv.how.targets) ul.appendChild(el("li", null, q.text));
    how.appendChild(ul);
  }
  main.appendChild(how);

  if (uv.basis) {
    const b = el("section", "src");
    b.appendChild(el("p", "src__label", uv.basis.label));
    const t = el("p", "src__title", uv.basis.title);
    if (uv.basis.article) t.appendChild(el("span", "src__article", uv.basis.article));
    b.appendChild(t);
    // 조례 원문 URL이 정확할 때만 '원문 보기'. 지금은 홈페이지뿐이라 없다.
    if (uv.basis.checkedAt) b.appendChild(el("p", "src__meta", COPY.actionDetail.checked(uv.basis.checkedAt)));
    main.appendChild(b);
  }
}

// ── 카드 ───────────────────────────────────────────

// 제목 + 요약 + (상태) → 상세로. 확정 화면의 기본 카드다.
function simpleCard(r, onOpen) {
  const li = el("li", "card");
  li.dataset.row = r.id;
  const b = btn("card__hit", null, () => onOpen(r.id));
  b.appendChild(el("span", "card__title", r.title));
  if (r.summary) b.appendChild(el("span", "card__summary", r.summary));
  const meta = el("span", "card__meta");
  if (r.stateLabel) meta.appendChild(chip(r.stateLabel, r.stateKind));
  if (r.statusLabel) meta.appendChild(chip(r.statusLabel, r.statusKind));
  if (meta.childNodes.length) b.appendChild(meta);
  b.appendChild(el("span", "chev", "›"));
  li.appendChild(b);
  return li;
}

// 주제 상세의 카드 — 출처 한 줄이 붙는다.
//
// **첫 항목만 싣되 나머지가 몇 건인지는 밝힌다**(`외 N건`). 목록에서
// 출처를 여러 줄로 쌓으면 카드의 주인공이 안내가 아니라 근거가 되고,
// 그렇다고 말없이 하나만 보이면 근거가 하나뿐인 것처럼 읽힌다.
// 전량은 Action 상세가 그린다.
function topicCard(r, onOpen) {
  const li = simpleCard(r, onOpen);
  const src = r.source;
  if (src) {
    // **출처 줄은 제목 아래다.** 형제로 붙는데 `.card`가 row라 좌우로
    // 섰고, 그것이 제목을 한 글자 열로 짜부라뜨렸다(실기기 사고).
    li.classList.add("card--stack");
    const box = el("div", "card__src");
    box.appendChild(el("span", "src__label", src.label));
    const it = src.items[0];
    if (it.title) {
      const t = el("span", "src__title", it.title);
      if (it.article) t.appendChild(el("span", "src__article", it.article));
      box.appendChild(t);
    }
    if (src.more) box.appendChild(el("span", "src__more", src.more));
    if (it.url) box.appendChild(extLink(it.url, it.link));
    if (it.meta) box.appendChild(el("span", "src__meta", it.meta));
    li.appendChild(box);
  }
  return li;
}

// 체크리스트 카드 — 체크와 상세 진입이 별개 버튼이다(중첩 버튼 금지).
function checkCard(r, { onOpen, onCheck }) {
  const li = el(
    "li",
    `card card--check${r.completed ? " card--checked" : ""}` +
      `${r.warn && !r.completed ? " card--irreversible" : ""}` +
      `${r.lock && !r.completed ? " card--locked" : ""}`
  );
  li.dataset.row = r.id;

  if (r.checkable && onCheck) {
    // 같은 버튼이 체크와 해제를 겸한다 — 완료가 제자리에 남으므로
    // 해제도 그 자리에서 한다.
    const box = btn(`card__box${r.completed ? " card__box--on" : ""}`, null, () =>
      onCheck(r.id, !r.completed)
    );
    box.setAttribute("aria-pressed", String(Boolean(r.completed)));
    box.setAttribute(
      "aria-label",
      `${r.title} — ${r.completed ? COPY.checklist.uncheck : COPY.checklist.check}`
    );
    li.appendChild(box);
  } else {
    // 선행이 안 끝난 것은 체크할 수 없다. 자리를 비워 두면 줄이 어긋난다.
    li.appendChild(el("span", "card__box card__box--off"));
  }

  const b = btn("card__hit", null, () => onOpen(r.id));
  b.appendChild(el("span", "card__title", r.title));
  const m = el("span", "card__meta");
  // 완료한 것에 `놓치면 되돌리기 어려움`을 다시 말하지 않는다 — 이미
  // 지나온 문턱이고, 그 자리에 `완료`가 선다.
  if (r.completed && r.statusLabel) m.appendChild(chip(r.statusLabel, r.statusKind));
  else if (r.warn) m.appendChild(chip(r.warn, "warn"));
  if (m.childNodes.length) b.appendChild(m);
  if (r.lock && !r.completed) b.appendChild(lockText(r.lock));
  b.appendChild(el("span", "chev", "›"));
  li.appendChild(b);
  return li;
}

// 잠긴 카드의 선행 문장. **문장 안의 `먼저 확인`만 강조한다** —
// 별도 heading이나 badge를 만들지 않는다.
function lockText(lock) {
  const p = el("span", "lock");
  const i = lock.sentence.indexOf(lock.emphasis);
  if (i < 0) {
    p.textContent = lock.sentence;
    return p;
  }
  p.appendChild(el("span", null, lock.sentence.slice(0, i)));
  p.appendChild(el("strong", "lock__key", lock.emphasis));
  p.appendChild(el("span", null, lock.sentence.slice(i + lock.emphasis.length)));
  return p;
}

// Action 상세의 잠김 줄 — 목적지가 있을 때만 이동을 그린다.
function lockLine(lock, onGoTo) {
  const box = el("p", "lock lock--block");
  box.appendChild(lockText(lock));
  if (lock.goTo && onGoTo)
    box.appendChild(btn("btn btn--quiet", COPY.checklist.lockedGo, () => onGoTo(lock.goTo)));
  return box;
}

// 본문 — 빈 줄로 문단을 나눈다. innerHTML을 쓰지 않는다.
function bodyBlock(body) {
  const box = el("div", "detail__body");
  for (const para of String(body).split(/\n{2,}/))
    if (para.trim()) box.appendChild(el("p", null, para.trim()));
  return box;
}

// 출처 카드 — 본문보다 낮은 위계다. 없으면 통째로 안 그린다.
//
// **압축형이다.** 문서명·발행처를 쌓고 확인일과 원문 링크는 아래 한 줄에
// 마주 세운다. 줄 수를 줄이는 것이 목적이 아니라, 출처가 본문보다 커
// 보이면 위계가 뒤집히기 때문이다.
//
// `it.meta`(`발행처 · 확인일 확인`)는 여기서 쓰지 않는다 — 발행처 줄과
// 겹쳐 같은 기관명이 두 번 나온다. 그 형식은 목록 카드의 것이다.
// **sources 여러 건은 전부 그린다**(목록은 첫 항목 + `외 N건`).
function sourceCard(src) {
  if (!src) return null;
  const box = el("section", "src src--card");
  box.appendChild(el("p", "src__label", src.label));
  for (const it of src.items) {
    const one = el("div", "src__item");
    if (it.title) {
      const t = el("p", "src__title", it.title);
      if (it.article) t.appendChild(el("span", "src__article", it.article));
      one.appendChild(t);
    }
    if (it.publisher) one.appendChild(el("p", "src__pub", it.publisher));
    const foot = el("div", "src__foot");
    if (it.checkedAt) foot.appendChild(el("span", "src__checked", COPY.actionDetail.checked(it.checkedAt)));
    if (it.url) foot.appendChild(extLink(it.url, it.link));
    if (foot.childNodes.length) one.appendChild(foot);
    box.appendChild(one);
  }
  return box;
}

// 문의처 한 줄 — 출처 카드와 같은 급이다. **비어 있으면 안 그린다.**
//
// 번호는 `tel:` 링크라 탭하면 전화 앱이 열린다. 기관 페이지가 있으면
// 기관명에 건다 — `검증됨`·`공식 인증` 같은 말은 쓰지 않는다.
function contactLine(c) {
  if (!c) return null;
  const box = el("section", "src src--card contact-line");
  box.appendChild(el("p", "src__label", c.label));
  if (c.org) {
    if (c.url) {
      const p = el("p", "src__title");
      const a = el("a", "src__org", c.org);
      a.href = c.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      p.appendChild(a);
      box.appendChild(p);
    } else {
      box.appendChild(el("p", "src__title", c.org));
    }
  }
  if (c.tel) {
    const p = el("p", "contact-line__tel");
    const a = el("a", "src__link");
    a.href = c.telHref;
    // 연락처 페이지와 **같은 아이콘**이다. 이모지(☎)를 쓰지 않는다 —
    // 기기마다 모양과 크기가 달라 같은 화면이 사람마다 달라진다.
    a.appendChild(telIcon());
    a.appendChild(el("span", "tel__digits", c.tel));
    p.appendChild(a);
    box.appendChild(p);
  }
  // 운영시간·처리기간처럼 확인해 둔 한 줄. 없으면 안 그린다.
  if (c.note) box.appendChild(el("p", "src__meta", c.note));
  return box;
}

// 외부 링크는 새 탭 + noopener. **정확한 원문이 있을 때만 부른다.**
function extLink(url, label, tag = "span") {
  const wrap = el(tag, "src__linkwrap");
  const a = el("a", "src__link", label || COPY.actionDetail.link);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  wrap.appendChild(a);
  return wrap;
}
