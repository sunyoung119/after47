// 화면 — 뷰모델이 정한 것을 그리기만 한다.
//
// 판단은 여기 없다. view.js가 무엇을 그릴지 정하고, 이 파일은 DOM을 만든다.
// 그래서 이 파일에는 테스트가 없고 view.test.mjs가 대신 본다.
//
// ★ 저장소를 직접 만지지 않는다(D-002). localStorage·sessionStorage·
//   document.cookie·fetch 어느 것도 여기 없다 — 전부 storage.js 경유다.
//   test/storage.test.mjs의 누수 탐지가 src/ 아래를 재귀로 훑는다.

import { openSession, anchorSession, shareUrl, spellToken } from "../session.js";
import { saveState } from "../storage.js";
import { evaluate } from "../engine.js";
import { applyDefaults } from "../questions.js";
import { entryView, surveyView, saveNoticeView } from "./view.js";
import { timelineView, locate } from "./timeline.js";
import { renderTimeline, el, clear } from "./render.js";
import { COPY } from "./copy.js";

// ── 상태 ───────────────────────────────────────────
const app = {
  session: null,
  state: {},
  cursor: null, // 지금 보고 있는 질문 id. 인덱스가 아니다
  screen: "survey", // picker · survey · result
  savedOnce: false, // D-015 예외를 첫 답변 직후 한 번만 띄우기 위한 표시
  spelled: false,
  tv: null, // 마지막으로 그린 타임라인 뷰모델. goTo가 이것에 묻는다
};

const $ = (id) => document.getElementById(id);

// 화면에 띄우는 주소는 **여기서 만든다.** shareUrl의 기본 base가
// https://after47.kr/ 인데 v1 배포처가 아니다. 없는 주소를 안내하는 것이
// 주소를 안 보여주는 것보다 나쁘다.
const baseHere = () => `${location.origin}${location.pathname}`;
const myUrl = () => shareUrl(app.session.token, app.state.district, baseHere());

// ── 진입 ───────────────────────────────────────────
async function boot() {
  app.session = await openSession();
  // D-015 0층 — 아무것도 시키지 않는다. 진입 즉시 이 기기에 토큰을 붙인다.
  app.session = await anchorSession(app.session);
  app.state = { ...app.session.state };
  if (!Array.isArray(app.state.completed)) app.state.completed = [];

  const entry = entryView(app.session);
  app.screen = entry.picker.needed ? "picker" : "survey";
  syncAddressBar();
  render();
}

// 주소창에 ?d=&t=를 반영해 둔다. 사용자가 주소창을 그대로 복사해도 되게.
// 저장이 아니라 표시다 — 0층은 anchorSession이 이미 했다.
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

// ── 렌더 ───────────────────────────────────────────
function render() {
  const entry = entryView({ ...app.session, state: app.state });
  renderBanners(entry);
  renderExpires(entry);

  const main = $("main");
  clear(main);
  if (app.screen === "picker") renderPicker(main, entry);
  else if (app.screen === "result") renderResult(main, entry);
  else renderSurvey(main);
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

function renderExpires(entry) {
  $("expires").textContent = entry.expires ? entry.expires.text : "";
}

async function onBannerAction(a) {
  if (a.id === "switch_district") {
    app.state = { ...app.state, district: a.value };
    await persist();
    // 알림을 손으로 지우지 않는다. 배너를 남길지 말지는 뷰모델이
    // 지금 state를 보고 정한다 — 규칙이 두 곳에 있으면 어긋난다.
    app.session = { ...app.session, state: app.state };
    syncAddressBar();
    render();
  } else if (a.id === "restart") {
    // 체험장에서 한 기기를 여러 사람이 쓴다. 앞사람 기록을 지우지 않고
    // 새 토큰으로 시작한다 — 지우면 앞사람이 돌아올 길이 없다.
    app.session = await anchorSession(await openSession({ resume: false }));
    app.state = { completed: [] };
    app.cursor = null;
    app.savedOnce = false;
    app.screen = "picker";
    syncAddressBar();
    render();
  }
}

// ── ⓪ 자치구 선택 ──────────────────────────────────
function renderPicker(main, entry) {
  main.appendChild(el("h2", "h2", COPY.picker.title));
  main.appendChild(el("p", "hint", COPY.picker.help));

  const list = el("ul", "picker");
  for (const o of entry.picker.options) {
    const li = el("li");
    const btn = el("button", "picker__item", o.name);
    btn.type = "button";
    // 조례 유무는 여기 없다. 선택은 "내가 사는 곳"을 고르는 사실 확인이지
    // 구 비교가 아니다. 차이는 결과 화면의 fallback 안내로 드러난다.
    btn.addEventListener("click", () => chooseDistrict(o.id));
    li.appendChild(btn);
    list.appendChild(li);
  }
  main.appendChild(list);

  const skip = el("button", "btn btn--quiet", COPY.picker.skip);
  skip.type = "button";
  skip.addEventListener("click", () => {
    // 자치구 없이도 진행할 수 있다. 엔진이 `미판정`으로 받아 준다(D-019 §6).
    app.screen = "survey";
    render();
  });
  main.appendChild(skip);
  main.appendChild(el("p", "hint", COPY.picker.skipHelp));
}

async function chooseDistrict(id) {
  app.state = { ...app.state, district: id };
  await persist();
  app.session = { ...app.session, state: app.state };
  app.screen = "survey";
  syncAddressBar();
  render();
}

// ── ① 설문 — 한 화면 한 질문 ───────────────────────
function renderSurvey(main) {
  const sv = surveyView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
    cursor: app.cursor,
  });

  if (!sv.current) {
    main.appendChild(el("h2", "h2", COPY.survey.done));
    const go = el("button", "btn btn--primary", COPY.survey.toResult);
    go.type = "button";
    go.addEventListener("click", () => {
      app.screen = "result";
      render();
    });
    main.appendChild(go);
    main.appendChild(backLink(sv));
    return;
  }

  // 남은 수만 보여준다. **분모를 쓰지 않는다** — 질문 수가 답에 따라 변해서
  // "3/17"이 거짓말이 된다. 진행률 바도 없다(거짓 진행률 금지).
  const meta = el("p", "meta", COPY.survey.remaining(sv.remaining));
  meta.appendChild(el("span", "meta__hint", ` ${COPY.survey.remainingHint}`));
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
  row.appendChild(backLink(sv));
  if (sv.canPeek) {
    const peek = el("button", "btn btn--quiet", COPY.survey.peek);
    peek.type = "button";
    peek.addEventListener("click", () => {
      app.screen = "result";
      render();
    });
    row.appendChild(peek);
  }
  main.appendChild(row);
}

function backLink(sv) {
  const prev = sv.prev;
  const btn = el("button", "btn btn--quiet", COPY.survey.back);
  btn.type = "button";
  btn.disabled = !prev;
  if (prev)
    btn.addEventListener("click", () => {
      app.cursor = prev.id;
      render();
    });
  return btn;
}

function choiceField(q) {
  const box = el("div", "choices");
  for (const o of q.options || []) {
    const btn = el("button", "choice", o.label);
    btn.type = "button";
    // 고른 것은 색이 아니라 글자로도 표시한다(WCAG 1.4.1).
    if (o.value === q.answer) {
      btn.classList.add("choice--on");
      btn.appendChild(el("span", "choice__mark", " (선택함)"));
    }
    btn.addEventListener("click", () => answer(q.key, o.value));
    box.appendChild(btn);
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
  const quick = [
    [COPY.survey.dateQuick.today, () => new Date().toISOString()],
    [COPY.survey.dateQuick.yesterday, () => day(1)],
    [COPY.survey.dateQuick.dayBefore, () => day(2)],
  ];
  for (const [label, make] of quick) {
    const btn = el("button", "choice", label);
    btn.type = "button";
    btn.addEventListener("click", () => answer(q.key, make()));
    box.appendChild(btn);
  }

  const det = el("details", "pick");
  det.appendChild(el("summary", null, COPY.survey.dateQuick.pick));
  const input = el("input");
  input.type = "date";
  input.className = "pick__input";
  input.addEventListener("change", () => {
    if (!input.value) return;
    // 시각은 모른다. 그 날의 정오로 둔다 — 자정으로 두면 하루가 통째로
    // 더 지난 것처럼 계산된다.
    answer(q.key, new Date(`${input.value}T12:00:00`).toISOString());
  });
  det.appendChild(input);
  box.appendChild(det);
  return box;
}

async function answer(key, value) {
  app.state = { ...app.state, [key]: value };
  app.cursor = null; // 답하면 다시 첫 미답변으로

  // ★ 저장하는 것은 **실제로 답한 것만**이다. 기본값을 state에 써 넣으면
  //   "안 물어본 것"과 "기본값으로 답한 것"이 구분되지 않고 unansweredKeys가
  //   거짓이 된다. applyDefaults는 판정할 때만 사본으로 쓴다.
  const r = await persist();

  // D-015 예외 — 저장이 막힌 브라우저에서는 0층이 아예 없다.
  // 결과 화면까지 기다리지 않고 첫 답변 직후 즉시 띄운다.
  if (!app.savedOnce) {
    app.savedOnce = true;
    if (r.persisted === false) showSaveNotice();
  }
  render();
}

// ── D-015 예외 화면 ────────────────────────────────
function showSaveNotice() {
  const sn = saveNoticeView({
    persisted: app.session.persisted,
    stage: "survey_first_answer",
    url: myUrl(),
    token: app.session.token,
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

  // 주소를 큰 글씨로 그대로 보여준다. 종이에 적을 수 있어야 하고
  // 전화로 불러줄 수 있어야 한다.
  const addr = el("p", "savebox__url", sn.url);
  box.appendChild(addr);
  const spell = el("p", "savebox__spell", spellToken(sn.token));
  spell.hidden = true;
  box.appendChild(spell);

  const row = el("div", "actions");
  for (const a of sn.actions) {
    const btn = el("button", "btn", a.label);
    btn.type = "button";
    if (a.id === "copy") {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(sn.url);
          btn.textContent = COPY.save.copied;
        } catch {
          // 복사가 막히면 선택 상태로 만들어 준다. 손으로 적을 수도 있다.
          const r = document.createRange();
          r.selectNodeContents(addr);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
      });
    } else if (a.id === "spell") {
      btn.addEventListener("click", () => {
        app.spelled = !app.spelled;
        spell.hidden = !app.spelled;
        btn.textContent = app.spelled ? COPY.save.spellOff : COPY.save.spell;
      });
    } else if (a.id === "ack") {
      // "나중에"가 아니다. 저장을 마쳤다는 사용자의 표시다(D-015 예외 규정).
      btn.addEventListener("click", () => {
        box.hidden = true;
      });
    }
    row.appendChild(btn);
  }
  box.appendChild(row);
}

// ── ② 타임라인 ─────────────────────────────────────
// 자리표시자를 대체한다(UI-A②). 판단은 timeline.js가, 그리기는 render.js가
// 한다. 여기서 하는 것은 둘을 잇고 사용자 행동을 state로 되돌리는 것뿐이다.
function renderResult(main, entry) {
  // 판정할 때만 기본값을 채운 **사본**을 만든다. app.state는 그대로 둔다 —
  // 기본값을 써 넣으면 "안 물어본 것"과 "기본값으로 답한 것"이 구분되지 않는다.
  const forEngine = applyDefaults(app.session.data.questions, app.state);
  const result = evaluate(forEngine, app.session.data);
  const district = entry.district
    ? app.session.data.districts.find((d) => d.id === entry.district.id)
    : null;
  const tv = timelineView({ result, state: app.state, data: app.session.data });
  app.tv = tv; // onGoTo가 "지금 화면 어디에 있나"를 묻는다

  // QR 오배포 방어 — "지금 어느 구 기준으로 보고 있는지"를 맨 위에 둔다.
  const basis = el("p", "basis");
  basis.appendChild(
    el("strong", null, district ? COPY.result.basis(district.name) : COPY.result.noDistrict)
  );
  const change = el("button", "btn btn--quiet", district ? COPY.picker.change : COPY.picker.choose);
  change.type = "button";
  change.addEventListener("click", goPicker);
  basis.appendChild(change);
  main.appendChild(basis);

  // 재방문에서 답하지 않은 질문이 생겼을 때 — 한 줄로만.
  const sv = surveyView({
    questions: app.session.data.questions,
    state: app.state,
    data: app.session.data,
  });
  if (sv.remaining > 0) {
    const row = el("p", "todo");
    row.appendChild(el("span", null, COPY.survey.unanswered(sv.remaining)));
    const go = el("button", "btn btn--quiet", COPY.survey.unansweredAction);
    go.type = "button";
    go.addEventListener("click", () => {
      app.screen = "survey";
      app.cursor = null;
      render();
    });
    row.appendChild(go);
    main.appendChild(row);
  }

  renderTimeline(main, tv, {
    onCheck: check,
    onGoTo: goTo,
    onPickDistrict: goPicker,
  });
}

function goPicker() {
  app.screen = "picker";
  render();
}

// 체크 → completed + completed_at 기록 → saveState → 재평가.
// **`completed_at`을 넣는 것은 UI 몫이다**(4/4-F②). 엔진은 실어 보내기만 한다.
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

// 잠긴 행에서 선행 카드로 보낸다. 접힌 구간 안이면 펼치고 스크롤·강조한다 —
// 화면에 "지금 못 하는 것"이 있는데 여는 열쇠가 같은 화면에 없던 것이
// D-019 §4의 관측이었다.
function goTo(id) {
  if (!app.tv || !locate(app.tv, id)) return;
  const node = document.querySelector(`[data-row="${id}"]`);
  if (!node) return;
  // 조상 details를 전부 연다. 접혀 있으면 스크롤이 의미가 없다.
  for (let p = node; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
  if (node.tagName === "DETAILS" || node.querySelector) {
    const own = node.tagName === "DETAILS" ? node : node.querySelector("details");
    if (own) own.open = true;
  }
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("row--flash");
  setTimeout(() => node.classList.remove("row--flash"), 1600);
}

// ── 시작 ───────────────────────────────────────────
boot().catch((e) => {
  const main = $("main");
  clear(main);
  main.appendChild(el("p", "error", "화면을 불러오지 못했습니다. 잠시 후 다시 열어 주세요."));
  main.appendChild(el("p", "hint", String(e?.message || e)));
});
