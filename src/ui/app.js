// 화면 — 뷰모델이 정한 것을 그리고, 사용자 행동을 state로 되돌린다.
//
//   [인트로] → [안내] → [설문 → 요약] ⇄ [타임라인] ⇄ [체크] ⇄ [근거] ⇄ [연락처]
//    첫 방문만                          ←—— 가로 스와이프 덱 ——→
//
// 판단은 여기 없다. view.js·timeline.js·pages.js가 정하고 이 파일은 잇는다.
// 그래서 이 파일에는 테스트가 없고 test/view.test.mjs가 대신 본다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). localStorage·sessionStorage·
//   document.cookie·fetch 어느 것도 여기 없다 — 전부 storage.js 경유다.
// ★ 색값을 쓰지 않는다. 시각은 tokens.css의 변수뿐이다.

import { openSession, anchorSession, shareUrl, spellToken } from "../session.js";
import { saveState } from "../storage.js";
import { evaluate } from "../engine.js";
import { applyDefaults } from "../questions.js";
import { entryView, surveyView, saveNoticeView } from "./view.js";
import { timelineView, locate } from "./timeline.js";
import {
  introView,
  guideView,
  summaryView,
  checkView,
  sourcesView,
  contactsView,
  deckView,
  DECK,
} from "./pages.js";
import { renderTimeline, el, clear } from "./render.js";
import { renderIntro, renderGuide, renderSummary, renderCheck, renderSources, renderContacts } from "./screens.js";
import { COPY } from "./copy.js";

// ── 상태 ───────────────────────────────────────────
const app = {
  session: null,
  state: {},
  screen: "guide", // intro · guide · picker · survey · summary · deck
  page: DECK[0], // 덱 안에서 보고 있는 장
  cursor: null, // 지금 보고 있는 질문 id. 인덱스가 아니다
  checkTab: "todo", // 체크 페이지의 탭
  tv: null, // 마지막 타임라인 뷰모델. goTo가 이것에 묻는다
  spelled: false,
  addrTouched: false, // 주소를 복사하거나 한 글자씩 봤다 — 남겼는지는 모른다
  hinted: false, // 덱 힌트 모션을 한 번 보여줬다
};

const $ = (id) => document.getElementById(id);
const pageEl = (key) => document.querySelector(`[data-page="${key}"]`);

// 화면에 띄우는 주소는 여기서 만든다. shareUrl의 기본 base가
// https://after47.kr/ 인데 v1 배포처가 아니다.
const baseHere = () => `${location.origin}${location.pathname}`;
const myUrl = () => shareUrl(app.session.token, app.state.district, baseHere());

// ── 진입 ───────────────────────────────────────────
async function boot() {
  app.session = await anchorSession(await openSession()); // D-015 0층
  app.state = { ...app.session.state };
  if (!Array.isArray(app.state.completed)) app.state.completed = [];
  route();
  syncAddressBar();
  render();
}

// 어디로 보낼지 정한다. **재방문(답이 있는 사람)은 인트로·안내를 건너뛰고
// 타임라인으로 바로 간다** — 이미 아는 화면을 다시 통과시키지 않는다.
function route() {
  const entry = entryView({ ...app.session, state: app.state });
  if (introView(app.state).show) {
    app.screen = "intro";
    return;
  }
  if (answered() > 0) {
    app.screen = "deck";
    app.page = DECK[0];
    return;
  }
  app.screen = entry.picker.needed ? "picker" : "guide";
}

const answered = () =>
  summaryView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
  }).rows.length;

function syncAddressBar() {
  try {
    history.replaceState(null, "", myUrl());
  } catch {
    /* 파일에서 열었거나 히스토리를 막은 브라우저. 화면은 그대로 돈다 */
  }
}

async function persist() {
  const r = await saveState(app.session.token, app.state);
  app.session = { ...app.session, saved: r, persisted: r.persisted };
  return r;
}

// 인트로가 떠 있는 동안만 body 스크롤을 잠근다. CSS는 tokens/app.css에 있고
// 여기는 클래스 하나만 붙인다 — 색값도 치수도 JS에 쓰지 않는다.
function setIntroLock(on) {
  const b = document.body;
  if (!b || !b.classList) return;
  if (on) b.classList.add("is-intro");
  else b.classList.remove("is-intro");
}

// ── 렌더 ───────────────────────────────────────────
function render() {
  const intro = $("intro");
  const flow = $("flow");

  if (app.screen === "intro") {
    flow.hidden = true;
    // 뒤 화면이 비치거나 스크롤되면 안 된다. 복원은 바로 아래에서 한다.
    setIntroLock(true);
    renderIntro(intro, introView(app.state), passIntro);
    return;
  }
  setIntroLock(false);
  intro.hidden = true;
  flow.hidden = false;

  const entry = entryView({ ...app.session, state: app.state });
  renderBanners(entry);
  $("expires").textContent = entry.expires ? entry.expires.text : "";
  renderAddrSlot();

  const main = $("main");
  const deck = $("deck");
  clear(main);

  // D-015 1층은 요약 화면의 자리다. 다른 화면으로 넘어가면 닫는다 —
  // 2층 버튼으로 다시 열 수 있다.
  if (app.screen !== "summary") $("save-notice").hidden = true;

  if (app.screen === "deck") {
    main.hidden = true;
    deck.hidden = false;
    renderDeck(entry);
    return;
  }
  main.hidden = false;
  deck.hidden = true;

  if (app.screen === "picker") renderPicker(main, entry);
  else if (app.screen === "guide") renderGuide(main, guideView(), () => go("survey"));
  else if (app.screen === "summary") renderSummaryScreen(main);
  else renderSurvey(main);
}

function go(screen) {
  app.screen = screen;
  render();
}

async function passIntro() {
  // 버튼과 화면 탭이 같이 들어와도 한 번만 통과한다.
  if (app.state.intro_seen === true) return;
  // 플래그는 **state 필드**다. 저장은 saveState 경유이고 storage는 무변이다.
  app.state = { ...app.state, intro_seen: true };
  // **전환이 먼저다.** 저장이 느리거나 막혀도 첫 화면에 갇히면 안 된다 —
  // 인트로는 정보가 아니라 문이고, 문이 저장을 기다릴 이유가 없다.
  route();
  render();
  try {
    await persist();
  } catch {
    // 저장 실패는 다음 화면의 D-015 안내가 말한다. 전환을 되돌리지 않는다.
  }
}

function renderBanners(entry) {
  const box = $("banners");
  clear(box);
  for (const b of entry.banners) {
    const n = el("div", `banner banner--${b.type}`);
    n.appendChild(el("p", "banner__text", b.text));
    if (b.sub) n.appendChild(el("p", "banner__sub", b.sub));
    if (b.actions.length) {
      const row = el("div", "banner__actions");
      for (const a of b.actions) {
        const btn = el("button", "btn btn--quiet", a.label);
        btn.type = "button";
        btn.addEventListener("click", () => onBannerAction(a));
        row.appendChild(btn);
      }
      n.appendChild(row);
    }
    box.appendChild(n);
  }
}

async function onBannerAction(a) {
  if (a.id === "switch_district") {
    app.state = { ...app.state, district: a.value };
    await persist();
    // 알림을 손으로 지우지 않는다. 배너를 남길지는 뷰모델이 지금 state를
    // 보고 정한다 — 규칙이 두 곳에 있으면 어긋난다.
    app.session = { ...app.session, state: app.state };
    syncAddressBar();
    render();
  } else if (a.id === "restart") {
    // 체험장에서 한 기기를 여러 사람이 쓴다. 앞사람 기록을 지우지 않고
    // 새 토큰으로 시작한다 — 지우면 앞사람이 돌아올 길이 없다.
    app.session = await anchorSession(await openSession({ resume: false }));
    app.state = { completed: [] };
    app.cursor = null;
    app.addrTouched = false;
    route();
    syncAddressBar();
    render();
  }
}

// ── 자치구 선택 ────────────────────────────────────
function renderPicker(main, entry) {
  main.appendChild(el("h2", "h2", COPY.picker.title));
  main.appendChild(el("p", "hint", COPY.picker.help));

  const list = el("ul", "picker");
  for (const o of entry.picker.options) {
    const li = el("li");
    const b = el("button", "picker__item", o.name);
    b.type = "button";
    // 조례 유무는 여기 없다. 없는 구에 낙인을 찍는 표시가 된다.
    b.addEventListener("click", () => chooseDistrict(o.id));
    li.appendChild(b);
    list.appendChild(li);
  }
  main.appendChild(list);

  const skip = el("button", "btn btn--quiet", COPY.picker.skip);
  skip.type = "button";
  skip.addEventListener("click", () => go(answered() ? "deck" : "guide"));
  main.appendChild(skip);
  main.appendChild(el("p", "hint", COPY.picker.skipHelp));
}

async function chooseDistrict(id) {
  app.state = { ...app.state, district: id };
  await persist();
  app.session = { ...app.session, state: app.state };
  syncAddressBar();
  go(answered() ? "deck" : "guide");
}

// ── 설문 — 한 화면 한 질문 ─────────────────────────
function renderSurvey(main) {
  const sv = surveyView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
    cursor: app.cursor,
  });

  if (!sv.current) {
    go("summary");
    return;
  }

  // 남은 수만 보여준다. **분모도 진행률 바도 없다** — 질문 수가 답에 따라
  // 변해서 "3/17"이 거짓말이 된다.
  const meta = el("p", "meta", COPY.survey.remaining(sv.remaining));
  meta.appendChild(el("span", null, ` ${COPY.survey.remainingHint}`));
  main.appendChild(meta);

  const q = sv.current;
  main.appendChild(el("h2", "h2", q.text));

  if (q.help) {
    const det = el("details", "why");
    det.appendChild(el("summary", null, COPY.survey.why));
    det.appendChild(el("p", "why__body", q.help));
    main.appendChild(det);
  }

  main.appendChild(q.type === "date" ? dateField(q) : choiceField(q));

  const row = el("div", "actions");
  const back = el("button", "btn btn--quiet", COPY.survey.back);
  back.type = "button";
  back.disabled = !sv.prev;
  if (sv.prev)
    back.addEventListener("click", () => {
      app.cursor = sv.prev.id;
      render();
    });
  row.appendChild(back);

  // D-003 — 설문을 끝내지 않아도 결과가 나온다.
  const peek = el("button", "btn btn--quiet", COPY.survey.peek);
  peek.type = "button";
  peek.addEventListener("click", () => go("deck"));
  row.appendChild(peek);
  main.appendChild(row);
}

function choiceField(q) {
  const box = el("div", "choices");
  for (const o of q.options || []) {
    const b = el("button", "choice", o.label);
    b.type = "button";
    // 고른 것은 색이 아니라 글자로도 표시한다(WCAG 1.4.1).
    if (o.value === q.answer) {
      b.classList.add("choice--on");
      b.appendChild(el("span", "choice__mark", " (선택함)"));
    }
    b.addEventListener("click", () => answer(q.key, o.value));
    box.appendChild(b);
  }
  return box;
}

// 우리 사용자는 화재 당일에 들어온다. 달력부터 열지 않는다.
function dateField(q) {
  const box = el("div", "choices");
  const day = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };
  for (const [label, make] of [
    [COPY.survey.dateQuick.today, () => new Date().toISOString()],
    [COPY.survey.dateQuick.yesterday, () => day(1)],
    [COPY.survey.dateQuick.dayBefore, () => day(2)],
  ]) {
    const b = el("button", "choice", label);
    b.type = "button";
    b.addEventListener("click", () => answer(q.key, make()));
    box.appendChild(b);
  }

  const det = el("details", "pick");
  det.appendChild(el("summary", null, COPY.survey.dateQuick.pick));
  const input = el("input");
  input.type = "date";
  input.className = "pick__input";
  input.addEventListener("change", () => {
    if (!input.value) return;
    // 시각은 모른다. 그 날의 정오로 둔다 — 자정이면 하루가 통째로 더
    // 지난 것처럼 계산된다.
    answer(q.key, new Date(`${input.value}T12:00:00`).toISOString());
  });
  det.appendChild(input);
  box.appendChild(det);
  return box;
}

async function answer(key, value) {
  app.state = { ...app.state, [key]: value };
  app.cursor = null;

  // ★ 저장하는 것은 **실제로 답한 것만**이다. 기본값을 state에 써 넣으면
  //   "안 물어본 것"과 "기본값으로 답한 것"이 구분되지 않는다.
  const r = await persist();

  // D-015 예외 — 저장이 막힌 브라우저에는 0층이 아예 없다.
  if (r.persisted === false && !app.addrTouched) showSaveNotice("survey_first_answer");
  render();
}

// ── 요약 ───────────────────────────────────────────
function renderSummaryScreen(main) {
  const sm = summaryView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
  });
  renderSummary(main, sm, {
    onEdit: (id) => {
      app.cursor = id;
      go("survey");
    },
    onResult: () => {
      app.page = DECK[0];
      go("deck");
    },
  });
  // D-015 1층이 이 자리로 왔다(6단계). 결과로 넘어가기 직전이 "잃을 것이
  // 생겼다"를 가장 잘 아는 시점이다. **주소를 이미 만져 본 사람에게는
  // 다시 띄우지 않는다** — 매번 뜨면 그것이 곧 노이즈다.
  if (!app.addrTouched) showSaveNotice("result_first");
}

// ── 덱 ─────────────────────────────────────────────
function renderDeck(entry) {
  const forEngine = applyDefaults(app.session.data.questions, app.state);
  const result = evaluate(forEngine, app.session.data);
  const tv = timelineView({ result, state: app.state, data: app.session.data });
  app.tv = tv;

  renderDeckNav();
  renderTimelinePage(pageEl("timeline"), tv, entry);
  renderCheck(pageEl("check"), checkView(tv), {
    tab: app.checkTab,
    onTab: (k) => {
      app.checkTab = k;
      render();
    },
    onCheck: check,
    onGoTo: goTo,
  });
  renderSources(pageEl("sources"), sourcesView(tv));
  renderContacts(pageEl("contacts"), contactsView(tv, { state: app.state, data: app.session.data }), {
    onCopy: copyText,
  });

  scrollToPage(app.page, false);
  hintOnce();
}

function renderDeckNav() {
  const nav = $("deck-nav");
  clear(nav);
  const dv = deckView(app.page);
  for (const p of dv.pages) {
    // 라벨 탭으로도 이동한다 — 스와이프를 못 찾는 사람에게 길이 하나뿐이면
    // 그 사람은 갇힌다.
    const b = el("button", `deck__tab${p.current ? " deck__tab--on" : ""}`);
    b.type = "button";
    b.appendChild(el("span", "deck__dot"));
    b.appendChild(el("span", null, p.label));
    if (p.current) b.setAttribute("aria-current", "page");
    b.addEventListener("click", () => {
      app.page = p.key;
      renderDeckNav();
      scrollToPage(p.key, true);
    });
    nav.appendChild(b);
  }
}

function scrollToPage(key, smooth) {
  const rail = $("deck-rail");
  const node = pageEl(key);
  if (!rail || !node) return;
  rail.scrollTo({ left: node.offsetLeft, behavior: smooth ? "smooth" : "auto" });
}

// 스와이프로 옮겨도 인디케이터가 따라온다.
function watchRail() {
  const rail = $("deck-rail");
  if (!rail) return;
  let t = null;
  rail.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth));
      const key = DECK[Math.min(DECK.length - 1, Math.max(0, i))];
      if (key !== app.page) {
        app.page = key;
        renderDeckNav();
      }
    }, 90);
  });
}

// 첫 도달에 다음 장이 살짝 삐져나왔다 들어간다. 한 번만.
function hintOnce() {
  if (app.hinted) return;
  app.hinted = true;
  const rail = $("deck-rail");
  if (!rail) return;
  rail.classList.add("deck__rail--hint");
  setTimeout(() => rail.classList.remove("deck__rail--hint"), 1000);
}

// ── 타임라인 페이지 ────────────────────────────────
function renderTimelinePage(page, tv, entry) {
  clear(page);
  const district = entry.district
    ? app.session.data.districts.find((d) => d.id === entry.district.id)
    : null;

  // QR 오배포 방어 — "지금 어느 구 기준으로 보고 있는지"를 맨 위에 둔다.
  const basis = el("p", "basis");
  basis.appendChild(
    el("strong", null, district ? COPY.result.basis(district.name) : COPY.result.noDistrict)
  );
  const change = el("button", "btn btn--quiet", district ? COPY.picker.change : COPY.picker.choose);
  change.type = "button";
  change.addEventListener("click", () => go("picker"));
  basis.appendChild(change);
  // 답을 고치러 가는 길. **헤더가 아니라 이 페이지 안이다** — 상황은 바뀌고
  // (손해사정사가 오고, 조사서가 나온다) 다 답한 뒤에도 돌아갈 수 있어야 한다.
  const toSummary = el("button", "btn btn--quiet", COPY.summary.title);
  toSummary.type = "button";
  toSummary.addEventListener("click", () => go("summary"));
  basis.appendChild(toSummary);
  page.appendChild(basis);

  // 재방문에서 새 질문이 생겼을 때 — 한 줄로만.
  const sv = surveyView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
  });
  if (sv.remaining > 0) {
    const row = el("p", "todo");
    row.appendChild(el("span", null, COPY.survey.unanswered(sv.remaining)));
    const b = el("button", "btn btn--quiet", COPY.survey.unansweredAction);
    b.type = "button";
    b.addEventListener("click", () => {
      app.cursor = null;
      go("survey");
    });
    row.appendChild(b);
    page.appendChild(row);
  }

  renderTimeline(page, tv, { onCheck: check, onGoTo: goTo, onPickDistrict: () => go("picker") });
}

// 체크 → completed + completed_at 기록 → saveState → 재평가.
// **completed_at을 넣는 것은 UI 몫이다**(4/4-F②).
async function check(id, on) {
  const set = new Set(app.state.completed || []);
  const at = { ...(app.state.completed_at || {}) };
  if (on) {
    set.add(id);
    at[id] = new Date().toISOString();
  } else {
    set.delete(id);
    delete at[id];
  }
  app.state = { ...app.state, completed: [...set], completed_at: at };
  await persist();
  render();
}

// 잠긴 행에서 선행 카드로 보낸다. 접힌 구간 안이면 펼치고 스크롤·강조한다.
function goTo(id) {
  if (!app.tv || !locate(app.tv, id)) return;
  const node = document.querySelector(`[data-row="${id}"]`);
  if (!node) return;
  for (let p = node; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
  const own = node.tagName === "DETAILS" ? node : node.querySelector && node.querySelector("details");
  if (own) own.open = true;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("row--flash");
  setTimeout(() => node.classList.remove("row--flash"), 1600);
}

// ── D-015 저장 안내 ────────────────────────────────
function showSaveNotice(stage) {
  const sn = saveNoticeView({
    persisted: app.session.persisted,
    stage,
    url: myUrl(),
    token: app.session.token,
    canShare: typeof navigator !== "undefined" && typeof navigator.share === "function",
  });
  const box = $("save-notice");
  clear(box);
  if (!sn.show) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  box.appendChild(el("h2", "h2", sn.lines[0]));
  box.appendChild(el("p", "savebox__line", sn.lines[1]));

  // 주소를 큰 글씨로. 종이에 적고 전화로 불러줄 수 있어야 한다.
  const addr = el("p", "savebox__url", sn.url);
  box.appendChild(addr);
  const spell = el("p", "savebox__spell", spellToken(sn.token));
  spell.hidden = true;
  box.appendChild(spell);

  const gated = [];
  const touch = () => {
    app.addrTouched = true;
    for (const b of gated) b.disabled = false;
    renderAddrSlot();
  };

  const row = el("div", "actions");
  for (const a of sn.actions) {
    const b = el("button", a.id === "go" ? "btn btn--primary" : "btn", a.label);
    b.type = "button";
    if (a.gated) {
      // ★ 사실이 아닌 것을 주장하지 않는다. 주소를 만져 본 뒤에만 열린다.
      b.disabled = !app.addrTouched;
      gated.push(b);
    }
    if (a.id === "share") {
      b.addEventListener("click", async () => {
        try {
          await navigator.share({ title: COPY.app.title, url: sn.url });
          touch();
        } catch {
          await copyText(sn.url, b);
          touch();
        }
      });
    } else if (a.id === "copy") {
      b.addEventListener("click", async () => {
        await copyText(sn.url, b, addr);
        touch();
      });
    } else if (a.id === "spell") {
      b.addEventListener("click", () => {
        app.spelled = !app.spelled;
        spell.hidden = !app.spelled;
        b.textContent = app.spelled ? COPY.save.spellOff : COPY.save.spell;
        touch();
      });
    } else {
      b.addEventListener("click", () => {
        box.hidden = true;
      });
    }
    row.appendChild(b);
  }
  box.appendChild(row);
  if (sn.actions.some((a) => a.gated)) box.appendChild(el("p", "hint", COPY.save.goHint));
}

async function copyText(text, b, fallbackNode) {
  try {
    await navigator.clipboard.writeText(text);
    if (b) b.textContent = COPY.save.copied;
  } catch {
    // 복사가 막히면 선택 상태로 만들어 준다. 손으로 적을 수도 있다.
    if (!fallbackNode) return;
    const r = document.createRange();
    r.selectNodeContents(fallbackNode);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
}

// D-015 2층 — 결과에 닿은 뒤로는 헤더에 작게 상시.
// **누르면 실제로 패널이 열린다.** 저장 행동을 하면 표시가 바뀐다.
function renderAddrSlot() {
  const slot = $("addr-slot");
  clear(slot);
  if (app.screen !== "deck" && app.screen !== "summary") return;
  const b = el("button", "btn btn--quiet", app.addrTouched ? COPY.save.headerDone : COPY.save.header);
  b.type = "button";
  b.addEventListener("click", () => showSaveNotice("result_first"));
  slot.appendChild(b);
}

// ── 시작 ───────────────────────────────────────────
boot()
  .then(watchRail)
  .catch((e) => {
    const main = $("main");
    $("flow").hidden = false;
    $("intro").hidden = true;
    clear(main);
    main.appendChild(el("p", "error", "화면을 불러오지 못했습니다. 잠시 후 다시 열어 주세요."));
    main.appendChild(el("p", "hint", String(e?.message || e)));
  });
