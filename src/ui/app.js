// 화면 — 뷰모델이 정한 것을 그리고, 사용자 행동을 state로 되돌린다.
//
//   첫 방문:  랜딩 → 기본 확인 → 질문(MASTER) → 전환 → 내 회복 경로 HOME
//   재방문:   경과시간 게이트 → (남은 질문이 있으면 설문 →) HOME
//
//   HOME ⇄ { 먼저 볼 내용 · 체크리스트 · 알아둘 내용 ·
//            회복 타임라인 · 주제별로 보기 } ⇄ 상세
//
// 판단은 여기 없다. view.js·entry.js·result.js가 정하고 이 파일은 잇는다.
// 그래서 이 파일에는 테스트가 없고 test/view.test.mjs와 test/walk.test.mjs가
// 대신 본다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). localStorage·sessionStorage·
//   document.cookie·fetch 어느 것도 여기 없다 — 전부 storage.js 경유다.
// ★ 색값을 쓰지 않는다. 시각은 tokens.css의 변수뿐이다.
// ★ 화면 전환은 `el.hidden`이고, 표시 여부를 연출의 끝에 걸지 않는다.

import { openSession, anchorSession, shareUrl, spellToken } from "../session.js";
import { saveState } from "../storage.js";
import { evaluate } from "../engine.js";
import { applyDefaults, pruneStale } from "../questions.js";
import { entryView, surveyView, saveNoticeView } from "./view.js";
import {
  landingView,
  basicCheckView,
  masterView,
  scopeNoticeView,
  transitionView,
  revisitView,
  SELECT_FEEDBACK_MS,
} from "./entry.js";
import {
  resultBase,
  homeView,
  priorityView,
  checklistView,
  referenceView,
  recoveryTimelineView,
  topicsView,
  topicDetailView,
  actionDetailView,
  undeterminedView,
} from "./result.js";
import { el, clear } from "./render.js";
import {
  renderLanding,
  renderBasicCheck,
  renderQuestion,
  renderScopeNotice,
  renderTransition,
  renderRevisit,
} from "./screens.js";
import {
  renderHome,
  renderPriority,
  renderChecklist,
  renderReference,
  renderTimelinePage,
  renderTopics,
  renderTopicDetail,
  renderActionDetail,
  renderUndetermined,
} from "./recovery.js";
import { COPY } from "./copy.js";

// 결과 화면의 이름 — HOME이 보내는 곳과 같은 키다.
const RESULT = ["priority", "checklist", "reference", "timeline", "topics"];

// ── 상태 ───────────────────────────────────────────
const app = {
  session: null,
  state: {},
  // 이 기기에 이전 기록이 있었나. **anchorSession 전에 재어 둔다** —
  // 진입 직후 한 번 저장하므로 그 뒤에는 누구나 "저장된 사람"이 된다.
  returning: false,
  gate: false, // 이번 방문에서 경과시간 게이트를 지났다(저장하지 않는다)
  screen: "landing",
  cursor: null, // 지금 보고 있는 질문 id. 인덱스가 아니다
  topic: null, // 주제 상세가 보고 있는 domain_group
  actionId: null, // Action 상세가 보고 있는 행
  from: null, // 이 상세를 어디서 열었나(결과 화면의 뒤를 여기서 안다)
  restoring: false, // 기기 뒤로가기로 복원하는 중이다
  returnTo: null, // 답을 고치러 갔다가 돌아올 자리
  base: null, // 마지막 결과 바탕. 상세가 이것에 묻는다
  savedShown: false, // D-015 1층을 이번 방문에서 이미 띄웠다
  spelled: false,
  addrTouched: false, // 주소를 복사하거나 한 글자씩 봤다 — 남겼는지는 모른다
};

const $ = (id) => document.getElementById(id);

// 화면에 띄우는 주소는 여기서 만든다. shareUrl의 기본 base가
// https://after47.kr/ 인데 v1 배포처가 아니다.
const baseHere = () => `${location.origin}${location.pathname}`;
const myUrl = () => shareUrl(app.session.token, app.state.district, baseHere());

const survey = (cursor = app.cursor) =>
  masterView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
    cursor,
  });

// 기본 확인을 지났는가. **V1은 결과 진입 시 지역이 이미 선택되어 있다는
// 전제를 쓴다**(확정 핸드오프 §5).
const ready = () => app.state.fire_at !== undefined && Boolean(app.state.district);

// ── 진입 ───────────────────────────────────────────
async function boot() {
  const opened = await openSession();
  app.returning = Boolean(opened.saved);
  app.session = await anchorSession(opened); // D-015 0층
  app.state = { ...app.session.state };
  if (!Array.isArray(app.state.completed)) app.state.completed = [];
  route();
  syncAddressBar();
  render();
}

// 어디로 보낼지 정한다.
//
// **모든 재방문은 경과시간 게이트를 거친다.** 방문 횟수로 건너뛰지 않고,
// 이번 방문에서 한 번 지났는지만 본다(app.gate는 저장하지 않는다).
// 게이트 다음은 남은 질문이 있으면 설문, 없으면 HOME이다 — 7일이 지나
// 조사서 질문이 새로 생긴 사람이 그 길로 온다.
function route() {
  if (landingView(app.state).show) return void (app.screen = "landing");
  if (app.returning && !app.gate && revisitView({ state: app.state, saved: true }).show)
    return void (app.screen = "revisit");
  if (!ready()) return void (app.screen = "basic");
  if (scopeNoticeView(app.state).show) return void (app.screen = "scope");
  if (survey(null).current) return void (app.screen = "survey");
  app.screen = "home";
}

// ── 기기 뒤로가기 ──────────────────────────────────
//
// 화면 전환이 내부 상태로만 일어나면 폰의 뒤로가기가 이전 화면이 아니라
// **앱 밖으로** 나간다. 우상단 [이전]과 기기 뒤로가기가 다르면 안 된다 —
// 사용자는 둘을 구분하지 않는다.
//
// 그래서 화면을 옮길 때마다 히스토리에 그 자리를 남기고, `popstate`는
// 그 자리를 **기존 이전 경로로 다시 그리기만 한다.** 새 판정을 만들지
// 않는다 — 어댑터일 뿐이다.
//
// **URL은 바꾸지 않는다.** `?d=`·`?t=` 토큰 체계는 그대로이고 히스토리에
// 얹는 것은 state 페이로드뿐이다. **저장이 아니라 세션 내비게이션**이라
// D-002의 저장 계층과도 무관하다.
//
// 지나가면 돌아올 자리가 아닌 화면(랜딩·재방문 게이트·전환)을 **떠날 때는**
// 쌓지 않고 앞 칸을 덮는다. 그래서 재방문에서 HOME의 뒤로가기는 앱을
// 나간다 — 이탈을 막으려고 히스토리를 인위로 쌓는 짓은 하지 않는다.
const CONSUMED = new Set(["landing", "revisit", "transition"]);

// 히스토리 한 칸이 가리키는 화면 좌표.
const spot = () => ({
  screen: app.screen,
  cursor: app.cursor,
  topic: app.topic,
  actionId: app.actionId,
  from: app.from,
});
const SPOT_KEYS = ["screen", "cursor", "topic", "actionId", "from"];
const sameSpot = (a, b) =>
  Boolean(a && b) && SPOT_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));

// 지금 자리를 히스토리에 남긴다. `leaving`은 방금 떠난 화면이다.
function mark(leaving, replace = false) {
  try {
    // **복원 중에는 절대 쌓지 않는다** — 뒤로가기가 앞으로 가는 것처럼 보인다.
    const over = replace || app.restoring || CONSUMED.has(leaving);
    history[over ? "replaceState" : "pushState"](spot(), "", location.href);
  } catch {
    /* 파일에서 열었거나 히스토리를 막은 브라우저. 화면은 그대로 돈다 */
  }
}

// 화면을 옮긴다. **모든 전환이 이 문을 지난다** — 여기를 지나지 않으면
// 히스토리에 자리가 안 남아 기기 뒤로가기가 앱을 나가버린다.
function go(next) {
  const leaving = app.screen;
  const before = spot();
  app.screen = next.screen;
  app.cursor = next.cursor ?? null;
  app.topic = next.topic ?? null;
  app.actionId = next.actionId ?? null;
  app.from = next.from ?? null;
  if (!sameSpot(before, spot())) mark(leaving);
  render();
}

// route()가 정한 자리로 옮긴다. 앞의 답을 지우고 다시 계산하는 전환들이 쓴다.
function routeGo(replace = false) {
  const leaving = app.screen;
  app.cursor = null;
  app.topic = null;
  app.actionId = null;
  app.from = null;
  route();
  // 설문으로 갈 때는 **어느 질문인지까지** 자리에 적는다. 커서가 비면
  // 기기 뒤로가기로 돌아왔을 때 "첫 미답변"으로 계산돼 앞 질문이 아니라
  // 지금 질문이 다시 나온다.
  if (app.screen === "survey") app.cursor = survey(null).current?.id ?? null;
  mark(leaving, replace);
  render();
}

// 결과 화면의 뒤. **어디서 왔는지는 자리에 실려 있다**(`from`) — 별도
// 스택을 두면 기기 뒤로가기로 돌아왔을 때 그 스택만 어긋난다.
function parentOf(s) {
  if (s.screen === "action" || s.screen === "undetermined") {
    if (s.from === "topic" && s.topic) return { screen: "topic", topic: s.topic };
    return { screen: RESULT.includes(s.from) ? s.from : "home" };
  }
  if (s.screen === "topic") return { screen: "topics" };
  return { screen: "home" };
}

// 그릴 수 없는 자리면 가장 가까운 유효 화면으로. **앞으로가기는 지원
// 범위 밖**이고, 답이 바뀌어 사라진 질문으로 돌아오는 경우가 여기 걸린다.
function nearest(s) {
  if (s.screen === "survey") {
    const mv = survey(s.cursor ?? null);
    return mv.current ? { ...s, cursor: mv.current.id } : { screen: "home" };
  }
  if (s.screen === "scope" && !scopeNoticeView(app.state).show) return { screen: "home" };
  return s;
}

// 기기 뒤로가기. [이전] 버튼과 **같은 내부 경로**로 그 화면을 다시 그린다.
function restore(s) {
  app.restoring = true;
  try {
    const at = nearest(s);
    app.screen = at.screen;
    app.cursor = at.cursor ?? null;
    app.topic = at.topic ?? null;
    app.actionId = at.actionId ?? null;
    app.from = at.from ?? null;
    render(); // 못 그리는 자리는 render 안에서도 가장 가까운 화면으로 넘어간다
    if (!sameSpot(spot(), s)) mark(s.screen, true); // 정정한다
  } finally {
    app.restoring = false;
  }
}

// **event.state가 없으면 개입하지 않는다.** 최초 엔트리 바깥이고, 앱을
// 나가는 것을 막지 않는다.
addEventListener("popstate", (e) => {
  const s = e && e.state;
  if (!s || typeof s.screen !== "string") return;
  restore(s);
});

function syncAddressBar() {
  try {
    // **지금 자리를 함께 실어 둔다.** null로 덮으면 최초 엔트리가 좌표를
    // 잃어 기기 뒤로가기가 그 자리를 못 그린다.
    history.replaceState(spot(), "", myUrl());
  } catch {
    /* 파일에서 열었거나 히스토리를 막은 브라우저. 화면은 그대로 돈다 */
  }
}

async function persist() {
  const r = await saveState(app.session.token, app.state);
  app.session = { ...app.session, saved: r, persisted: r.persisted };
  return r;
}

// 랜딩이 떠 있는 동안만 body 스크롤을 잠근다. CSS는 app.css에 있고
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

  if (app.screen === "landing") {
    flow.hidden = true;
    // 뒤 화면이 비치거나 스크롤되면 안 된다. 복원은 바로 아래에서 한다.
    setIntroLock(true);
    renderLanding(intro, landingView(app.state), passLanding);
    return;
  }
  setIntroLock(false);
  intro.hidden = true;
  flow.hidden = false;

  const entry = entryView({ ...app.session, state: app.state });
  renderBanners(entry);
  $("expires").textContent = entry.expires ? entry.expires.text : "";
  renderHeader();

  const main = $("main");
  clear(main);

  // D-015 1층은 HOME의 자리다. 다른 화면으로 넘어가면 닫는다 —
  // HOME의 2층 버튼으로 다시 열 수 있다.
  if (app.screen !== "home") $("save-notice").hidden = true;

  if (app.screen === "basic") return renderBasic(main);
  if (app.screen === "survey") return renderSurvey(main);
  if (app.screen === "scope") return renderScope(main);
  if (app.screen === "transition")
    return renderTransition(main, transitionView(), () => go({ screen: "home" }));
  if (app.screen === "revisit")
    return renderRevisit(main, revisitView({ state: app.state, saved: true }), passGate);

  renderResult(main);
}

// 결과 화면 사이의 이동. **어디서 왔는지를 자리에 싣는다** — 기기
// 뒤로가기로 돌아와도 어긋나지 않는 유일한 방법이다.
function push(screen, extra = {}) {
  go({ screen, ...extra, from: app.screen, topic: extra.topic ?? app.topic });
}

function goBack() {
  go(parentOf(spot()));
}

// 좌상단 서비스명 · 우상단 [이전]. 확정 화면의 머리 문법이다.
function renderHeader() {
  $("brand").textContent = COPY.brand;
  const slot = $("top-right");
  clear(slot);
  const back = backTarget();
  if (!back) return;
  const b = el("button", "top__back", COPY.master.back);
  b.type = "button";
  b.addEventListener("click", back);
  slot.appendChild(b);
}

// [이전]이 무엇을 하는지. 없으면 null이고 버튼도 안 그린다 —
// 랜딩·기본 확인·게이트·HOME에는 뒤가 없다.
function backTarget() {
  if (app.screen === "survey") {
    const mv = survey();
    // 첫 질문의 뒤는 설문 안이 아니라 기본 확인이다.
    if (mv.atStart) return () => go({ screen: "basic" });
    return () => go({ screen: "survey", cursor: mv.back.id });
  }
  if (app.screen === "transition")
    return () =>
      go({ screen: "survey", cursor: survey(null).current ? null : lastAnswered() });
  if (RESULT.includes(app.screen) || app.screen === "topic" || app.screen === "action" || app.screen === "undetermined")
    return goBack;
  return null;
}

// 전환 화면에서 뒤로 갈 때 돌아갈 질문 — 마지막으로 답한 것.
function lastAnswered() {
  const sv = surveyView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
  });
  return sv.answered.length ? sv.answered[sv.answered.length - 1].id : null;
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
    const opened = await openSession({ resume: false });
    app.returning = Boolean(opened.saved);
    app.session = await anchorSession(opened);
    app.state = { completed: [] };
    app.gate = false;
    app.returnTo = null;
    app.addrTouched = false;
    syncAddressBar();
    routeGo(true);
  }
}

// ── 랜딩 · 게이트 ──────────────────────────────────
async function passLanding() {
  // 버튼과 화면 탭이 같이 들어와도 한 번만 통과한다. **플래그가 아니라
  // 화면으로 잡는다** — 기기 뒤로가기로 랜딩에 되돌아온 사람은 플래그가
  // 이미 서 있는데, 플래그로 막으면 그 사람이 문 앞에 갇힌다.
  if (app.screen !== "landing") return;
  const 처음 = app.state.intro_seen !== true;
  // 플래그는 **state 필드**다. 저장은 saveState 경유이고 storage는 무변이다.
  if (처음) app.state = { ...app.state, intro_seen: true };
  // **전환이 먼저다.** 저장이 느리거나 막혀도 첫 화면에 갇히면 안 된다 —
  // 랜딩은 정보가 아니라 문이고, 문이 저장을 기다릴 이유가 없다.
  routeGo();
  if (!처음) return;
  try {
    await persist();
  } catch {
    // 저장 실패는 다음 화면의 D-015 안내가 말한다. 전환을 되돌리지 않는다.
  }
}

// 게이트는 이번 방문에서 한 번만. **저장하지 않는다** — 다음 방문에도
// 다시 거쳐야 한다.
function passGate() {
  app.gate = true;
  routeGo();
}

// ── 기본 확인 ──────────────────────────────────────
function renderBasic(main) {
  const bv = basicCheckView({ state: app.state, data: app.session.data });
  renderBasicCheck(main, bv, {
    onDate: (value) => {
      if (!value) return;
      // 시각은 모른다. 그 날의 정오로 둔다 — 자정이면 하루가 통째로 더
      // 지난 것처럼 계산된다.
      setBasic({ fire_at: new Date(`${value}T12:00:00`).toISOString() });
    },
    onDistrict: (id) => setBasic({ district: id || undefined }),
    // [다음]을 누르는 것이 "채워 둔 오늘이 맞다"는 확인이다. 그 순간
    // fire_at은 답한 값으로 확정된다(확정 결정).
    onNext: (value) => confirmBasic(value),
  });
}

async function setBasic(patch) {
  app.state = { ...app.state, ...patch };
  if (patch.district === undefined) delete app.state.district;
  await persist();
  app.session = { ...app.session, state: app.state };
  syncAddressBar();
  render();
}

async function confirmBasic(inputValue) {
  if (app.state.fire_at === undefined) {
    const v = inputValue
      ? new Date(`${inputValue}T12:00:00`).toISOString()
      : new Date().toISOString();
    app.state = { ...app.state, fire_at: v };
    await persist();
    app.session = { ...app.session, state: app.state };
  }
  routeGo();
}

// ── 설문 — 한 화면 한 질문 ─────────────────────────
function renderSurvey(main) {
  const mv = survey();
  if (!mv.current) {
    go({ screen: "transition" });
    return;
  }
  renderQuestion(main, mv, { onAnswer: answer, feedbackMs: SELECT_FEEDBACK_MS });
}

async function answer(key, value) {
  // 앞 답을 고치면 뒤 질문이 통째로 사라질 수 있다. 그때 남은 옛 답은
  // **사용자가 화면에서 볼 수도 고칠 수도 없는 값**이 되므로 함께 지운다.
  // 지우는 것은 저장하는 state뿐이고, 판정용 기본값(applyDefaults)은 그대로다.
  app.state = pruneStale(
    app.session.data.questions,
    { ...app.state, [key]: value },
    app.session.data
  );
  app.cursor = null;

  // ★ 저장하는 것은 **실제로 답한 것만**이다. 기본값을 state에 써 넣으면
  //   "안 물어본 것"과 "기본값으로 답한 것"이 구분되지 않는다.
  const r = await persist();

  // D-015 예외 — 저장이 막힌 브라우저에는 0층이 아예 없다.
  if (r.persisted === false && !app.addrTouched) showSaveNotice("survey_first_answer");

  // 건물 종류가 '그 외'면 안내 범위를 먼저 말한다(6단계의 경계 배너를
  // 이 화면이 대체한다).
  if (scopeNoticeView(app.state).show) return go({ screen: "scope" });

  // 답을 고치러 왔던 사람은 남은 질문이 없으면 보던 자리로 돌아간다.
  // **history.back()으로 흉내 내지 않는다** — 답이 바뀐 뒤라 히스토리와
  // 화면이 갈린다. 코드가 화면을 바꾸는 것이므로 자리를 새로 쌓는다.
  if (app.returnTo && !survey(null).current) {
    const back = app.returnTo;
    app.returnTo = null;
    return go(back);
  }
  const next = survey(null);
  if (!next.current) return go({ screen: "transition" });
  // 질문 이동도 한 칸씩 쌓는다 — 기기 뒤로가기가 앞 질문으로 가야 한다.
  go({ screen: "survey", cursor: next.current.id });
}

// ── 안내 범위 ──────────────────────────────────────
function renderScope(main) {
  renderScopeNotice(main, scopeNoticeView(app.state), {
    onContinue: async () => {
      // 확인했다는 것을 state에 남긴다 — 매번 다시 세우면 재방문마다
      // 같은 벽을 만난다.
      app.state = { ...app.state, scope_ack: true };
      await persist();
      routeGo();
    },
    onBack: async () => {
      // 건물 종류를 다시 고른다. 되돌린 답에 매달린 확인 플래그도 함께 지운다.
      const next = { ...app.state };
      delete next.housing_type;
      delete next.scope_ack;
      app.state = pruneStale(app.session.data.questions, next, app.session.data);
      await persist();
      go({ screen: "survey", cursor: "q-housing-type" });
    },
  });
}

// ── 내 회복 경로 ───────────────────────────────────
function renderResult(main) {
  const forEngine = applyDefaults(app.session.data.questions, app.state);
  const result = evaluate(forEngine, app.session.data);
  const base = resultBase({ result, state: app.state, data: app.session.data });
  app.base = base;

  const open = (id) => openDetail(id);

  if (app.screen === "home") {
    renderHome(main, homeView(base), {
      onGo: (key) => push(key),
      onSave: () => showSaveNotice("result_first"),
      saved: app.addrTouched,
    });
    // D-015 1층 — 결과에 **처음 닿았을 때 한 번**. HOME은 다섯 화면에서
    // 돌아오는 허브라 조건이 "HOME이면"이면 매번 뜬다 — 그것이 곧
    // 노이즈다. 주소를 이미 만져 본 사람에게도 띄우지 않는다.
    // 다시 보고 싶으면 아래 2층 버튼이 연다.
    if (!app.savedShown && !app.addrTouched) {
      app.savedShown = true;
      showSaveNotice("result_first");
    }
    return;
  }
  if (app.screen === "priority") return renderPriority(main, priorityView(base), { onOpen: open });
  if (app.screen === "checklist")
    return renderChecklist(main, checklistView(base), { onOpen: open, onCheck: check });
  if (app.screen === "reference") return renderReference(main, referenceView(base), { onOpen: open });
  if (app.screen === "timeline")
    return renderTimelinePage(main, recoveryTimelineView(base), { onOpen: open });
  if (app.screen === "topics")
    return renderTopics(main, topicsView(base), { onOpen: (g) => push("topic", { topic: g }) });
  if (app.screen === "topic")
    return renderTopicDetail(main, topicDetailView(base, app.topic), { onOpen: open });
  if (app.screen === "undetermined") {
    const uv = undeterminedView(base, app.actionId, { questions: app.session.data.questions });
    // 답을 고쳐서 더는 미판정이 아니면 그 행의 보통 상세를 보여준다.
    // 자리를 새로 쌓지 않는다 — 뒤로가기가 같은 화면을 두 번 지나면 안 된다.
    if (uv) return renderUndetermined(main, uv, { onAnswer: goAnswer });
    app.screen = "action";
    mark("undetermined", true); // 자리를 새로 쌓지 않고 그 칸을 정정한다
  }
  const ad = actionDetailView(base, app.actionId);
  if (!ad) return go({ screen: "home" });
  renderActionDetail(main, ad, { onGoTo: (id) => openDetail(id) });
}

// 카드를 탭했을 때 어디로 가는가. **미판정은 전용 화면이 있다** —
// `해당 없음`으로 보이면 안 되고, 무엇을 확인하면 되는지를 말해야 한다.
function openDetail(id, forceAction = false) {
  const row = app.base?.byId.get(id);
  if (!row) return;
  if (!forceAction && row.status === "미판정" && !row.needsDistrict)
    return push("undetermined", { actionId: id });
  // 자치구를 안 골라서 미판정인 건은 기본 확인으로 보낸다(V1에서는
  // 여기까지 오지 않는다 — 지역이 이미 선택되어 있다는 전제다).
  if (!forceAction && row.needsDistrict) return go({ screen: "basic" });
  push("action", { actionId: id });
}

// '아직 확인 못 함'에서 그 답으로 직행하고, 고치면 보던 자리로 돌아온다.
function goAnswer(targets) {
  if (!targets || !targets.length) return;
  app.returnTo = spot();
  go({ screen: "survey", cursor: targets[0].id });
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
          await navigator.share({ title: COPY.brand, url: sn.url });
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

// ── 시작 ───────────────────────────────────────────
boot().catch((e) => {
  const main = $("main");
  $("flow").hidden = false;
  $("intro").hidden = true;
  clear(main);
  main.appendChild(el("p", "error", "화면을 불러오지 못했습니다. 잠시 후 다시 열어 주세요."));
  main.appendChild(el("p", "hint", String(e?.message || e)));
});
