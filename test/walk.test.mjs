// 화면을 실제로 밟는다 — 브라우저 없이.
//
// view.test.mjs가 **뷰모델의 판단**을 보는 곳이라면 여기는 **연결**을 본다.
// 탭했을 때 다음 화면이 실제로 그려지는가, 라우팅이 사람을 막다른 곳에
// 두지 않는가. 뷰모델이 아무리 옳아도 app.js가 그것을 안 부르면 사용자에게는
// 아무 일도 일어나지 않는다.
//
// **진짜 브라우저가 아니다.** 여백·색·줄바꿈·overflow는 여기서 못 본다 —
// 그것은 배포 뒤 실기기 확인의 몫이고, 보고서의 "실기기 확인 대기" 목록이
// 무엇을 봐야 하는지 적는다.
//
// 밟는 여정 넷
//   ① 첫 방문 — 랜딩 → 기본 확인 → 설문 전량 → 전환 → HOME → 다섯 화면 → 상세
//   ② 재방문 — 경과시간 게이트 → HOME
//   ③ 아직 확인 못 함 → 해당 질문 직행 → 답 변경 → 원래 자리 복귀
//   ④ 건물 종류 '그 외' → 안내 범위 화면의 두 갈래

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { configureStorage, memoryBackend } from "../src/storage.js";
import { installDom, all, button, buttonLike, has, hasClass, texts, tick } from "./dom.stub.mjs";

const D = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(readFileSync(join(D, path), "utf8"));

let failed = 0;
const t = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`          -> ${detail}`);
};
const section = (s) => console.log(`\n${"=".repeat(62)}\n${s}\n${"=".repeat(62)}`);

// 선택 피드백(150~250ms)이 지나야 다음 질문으로 넘어간다. 여유를 둔다.
const STEP = 320;

let dom;
const $ = (id) => dom.byId.get(id);
const main = () => $("main");

// 저장소는 메모리 하나를 계속 쓴다 — 여정 ②·③이 ①의 기록을 이어받는다.
const backend = memoryBackend();
configureStorage({ ...backend, readJson });

// app.js는 최상위에서 boot()을 부른다. 다시 밟으려면 새로 평가해야 하므로
// 쿼리를 붙여 재수입한다(하위 모듈은 같은 인스턴스라 저장소가 유지된다).
let 회차 = 0;
async function 열기() {
  dom = installDom();
  회차 += 1;
  await import(`../src/ui/app.js?walk=${회차}`);
  await tick(30);
}

// 질문 화면에서 고를 답. 없으면 첫 선택지를 고른다.
const 답 = {
  "불이 난 건물의 종류가 무엇인가요?": "아파트·연립·다세대",
  "본인 명의로 든 화재보험이 있나요?": "잘 모르겠어요",
};

const 질문중 = () => all(main(), (n) => hasClass(n, "q__title"))[0] ?? null;

async function 한문항(override = {}) {
  const q = 질문중();
  if (!q) return false;
  const label = { ...답, ...override }[q.own];
  const choices = all(main(), (n) => hasClass(n, "q__choice"));
  const pick = (label && choices.find((c) => c.textContent.trim() === label)) || choices[0];
  pick.click();
  await tick(STEP);
  return true;
}

async function 설문끝까지(override = {}) {
  for (let i = 0; i < 30; i++) if (!(await 한문항(override))) return i;
  throw new Error("설문이 끝나지 않는다");
}

// ── ① 첫 방문 ──────────────────────────────────────
section("① 첫 방문 — 랜딩에서 내 회복 경로까지");

await 열기();

t("랜딩이 뜬다", $("intro").hidden === false && $("flow").hidden === true);
t("서비스명과 메인 문구가 확정 문구다",
  has($("intro"), "일상으로") && has($("intro"), "불이 꺼진 뒤, 다시 일상으로 가는 길을 함께 합니다"),
  texts($("intro")).join(" | "));
t("푸터가 확정 문구다", has($("intro"), "흩어진 제도와 정보를, 당신의 상황과 시간에 맞게 잇습니다."));
t("랜딩 동안 스크롤이 잠긴다", document.body.classList.contains("is-intro"));

button($("intro"), "회복 시작하기").click();
await tick(30);

t("랜딩을 통과하면 기본 확인이다", has(main(), "화재가 있었던 날짜와 지역을 알려주세요"), texts(main()).join(" | "));
t("랜딩이 닫히고 본문이 열린다", $("intro").hidden === true && $("flow").hidden === false);
t("스크롤 잠금이 풀린다", !document.body.classList.contains("is-intro"));
t("좌상단이 서비스명이다", $("brand").textContent === "일상으로");
t("기본 확인에는 [이전]이 없다", $("top-right").children.length === 0);

{
  const date = all(main(), (n) => n.type === "date")[0];
  const sel = all(main(), (n) => n.tagName === "SELECT")[0];
  t("날짜가 오늘로 채워져 있다", /^\d{4}-\d{2}-\d{2}$/.test(date.value), date.value);
  t("지역 선택지가 25개 + 빈 항목이다", sel.children.length === 26, String(sel.children.length));
  t("지역을 고르기 전에는 [다음]이 잠겨 있다", button(main(), "다음").disabled === true);
  sel.change("gangnam");
  await tick(30);
}
t("지역을 고르면 [다음]이 열린다", button(main(), "다음").disabled === false);

button(main(), "다음").click();
await tick(30);

t("설문 MASTER로 넘어간다", has(main(), "상황 확인") && 질문중() !== null, texts(main()).join(" | "));
t("첫 질문이 날짜가 아니다", 질문중().own === "지금 그 집에서 지낼 수 있나요?", 질문중().own);
t("하단 한 줄이 확정 문구다", has(main(), "답변에 따라 상황에 맞는 질문만 이어집니다."));
t("분모형 진행률이 없다", !texts(main()).some((s) => /\d+\s*\/\s*\d+/.test(s)), texts(main()).join(" | "));
t("첫 질문의 [이전]은 기본 확인으로 간다", $("top-right").children.length === 1);

{
  // 두 번째 질문에서 [이전]을 눌러 첫 질문으로 돌아온다.
  await 한문항();
  const 둘째 = 질문중().own;
  $("top-right").children[0].click();
  await tick(30);
  t("[이전]이 앞 질문으로 되돌린다",
    질문중().own === "지금 그 집에서 지낼 수 있나요?", `${둘째} → ${질문중()?.own}`);
  await 한문항();
}

const 문항수 = await 설문끝까지();
t(`설문이 끝나고 전환 화면이 나온다 (남은 ${문항수}문항)`, has(main(), "확인했습니다"), texts(main()).join(" | "));
t("전환 문구가 확정 문구다",
  has(main(), "지금 상황과 화재 후 경과 시간을 바탕으로") && has(main(), "먼저 확인할 것부터 정리합니다."));
t("'AI 분석 중'류 표현이 없다", !texts(main()).some((s) => /AI|분석 중|생성 중/.test(s)));

button(main(), "내 회복 경로 보기").click();
await tick(30);

t("HOME이 나온다", has(main(), "내 회복 경로") && has(main(), "지금 필요한 안내를 정리했습니다."));
t("핵심 카드가 셋이다", all(main(), (n) => hasClass(n, "hcard")).length === 3);
t("카드 제목이 확정 문구다",
  has(main(), "먼저 볼 내용") && has(main(), "체크리스트") && has(main(), "알아둘 내용"));
t("보조 탐색이 둘이다", all(main(), (n) => hasClass(n, "mcard")).length === 2);
t("경과시간 칩이 있다", texts(main()).some((s) => /^\d{2}일 \d{2}:\d{2}$/.test(s)), texts(main()).join(" | "));
t("HOME에는 [이전]이 없다", $("top-right").children.length === 0);
t("D-015 1층이 결과 첫 도달에 뜬다", $("save-notice").hidden === false);

// 다섯 화면을 하나씩 들어갔다 나온다.
const 카드 = (name) => all(main(), (n) => hasClass(n, "hcard") || hasClass(n, "mcard"))
  .find((n) => n.textContent.includes(name));

for (const [이름, 표시] of [
  ["먼저 볼 내용", "제일 먼저 확인해야 할 정보입니다."],
  ["체크리스트", "하나씩 해나가야 하는 일입니다."],
  ["알아둘 내용", "당장 행동할 필요는 없지만, 알아두어야 할 정보입니다."],
  ["시간 순서로 보기", "시간이 지나며 필요한 안내가 어떻게 이어지는지 보여드립니다."],
  ["필요한 주제별로 보기", "지금 내 상황에 해당하는 안내를 주제별로 모았습니다."],
]) {
  카드(이름).click();
  await tick(10);
  t(`[${이름}] → 그 화면이 그려진다`, has(main(), 표시), texts(main()).slice(0, 6).join(" | "));
  t(`[${이름}] 화면에 [이전]이 있다`, $("top-right").children.length === 1);
  $("top-right").children[0].click();
  await tick(10);
  t(`[${이름}] → [이전]이 HOME으로 되돌린다`, has(main(), "지금 필요한 안내를 정리했습니다."));
}

t("HOME으로 돌아와도 저장 안내가 다시 뜨지 않는다 (한 번뿐)", $("save-notice").hidden === true);

// 체크리스트 — 잠긴 카드의 선행 문장과 체크
카드("체크리스트").click();
await tick(10);
{
  const 잠김 = all(main(), (n) => hasClass(n, "lock"));
  t("잠긴 카드에 선행 문장이 표면에 있다", 잠김.length > 0, String(잠김.length));
  t("문장 안에서 '먼저 확인'만 강조된다",
    잠김.every((n) => all(n, (x) => hasClass(x, "lock__key")).length === 1));
  const 신호 = all(main(), (n) => hasClass(n, "chip--warn"));
  t("되돌리기 어려운 것에 글자 신호가 붙는다", 신호.length > 0 && 신호[0].textContent === "놓치면 되돌리기 어려움");
  t("하단 문구가 확정 문구다", has(main(), "체크한 항목은 완료한 일로 표시됩니다."));

  const box = all(main(), (n) => hasClass(n, "card__box") && !hasClass(n, "card__box--off"))[0];
  const 전 = all(main(), (n) => hasClass(n, "card__box")).length;
  box.click();
  await tick(40);
  t("체크하면 완료로 내려간다", has(main(), "완료한 것"), texts(main()).slice(-6).join(" | "));
  t("목록에서 하나 줄었다", all(main(), (n) => hasClass(n, "card__box")).length === 전 - 1);
}

// 주제별 → 주제 상세 → Action 상세 → 뒤로 두 번
$("top-right").children[0].click();
await tick(10);
카드("필요한 주제별로 보기").click();
await tick(10);
{
  const 주제 = all(main(), (n) => hasClass(n, "tcard"));
  t("주제 카드가 그려진다", 주제.length > 0, String(주제.length));
  t("몸이 아니라 '건강'으로 보인다",
    주제.some((n) => n.textContent.includes("건강")) && !주제.some((n) => /(^|\s)몸(\s|\d)/.test(n.textContent)),
    주제.map((n) => n.textContent).join(" | "));
  주제.find((n) => n.textContent.includes("건강")).click();
  await tick(10);
  t("주제 상세가 그려진다", has(main(), "건강") && texts(main()).some((s) => /^\d+개의 안내$/.test(s)));
  t("주제 상세 하단 문구가 확정 문구다", has(main(), "원문 링크가 확인된 안내에만 ‘원문 보기’를 표시합니다."));

  const 첫카드 = all(main(), (n) => hasClass(n, "card__hit"))[0];
  첫카드.click();
  await tick(10);
  t("Action 상세로 들어간다",
    has(main(), "안내 내용은 확인된 근거를 바탕으로 정리하며, 원문이 있는 경우 직접 확인할 수 있습니다."),
    texts(main()).slice(0, 4).join(" | "));
  $("top-right").children[0].click();
  await tick(10);
  t("[이전]이 주제 상세로 되돌린다", texts(main()).some((s) => /^\d+개의 안내$/.test(s)));
  $("top-right").children[0].click();
  await tick(10);
  t("한 번 더 [이전]이면 주제별로 보기다", has(main(), "지금 내 상황에 해당하는 안내를 주제별로 모았습니다."));
}

// ── ② 재방문 ───────────────────────────────────────
section("② 재방문 — 경과시간 게이트를 항상 거친다");

await 열기();

t("재방문은 랜딩이 아니라 게이트다", $("intro").hidden === true && has(main(), "화재 발생 후"), texts(main()).join(" | "));
t("화재 발생일을 보여준다", has(main(), "화재 발생일"));
t("경과시간이 일·시간·분 세 토막이다",
  all(main(), (n) => hasClass(n, "elapsed__item")).length === 3);
t("게이트 문구가 확정 문구다",
  has(main(), "지금 시점에 맞춰") && has(main(), "필요한 안내를 다시 정리합니다."));
t("현재 시각 시계가 아니다", !texts(main()).some((s) => /일째/.test(s)));

button(main(), "지금 안내 보기").click();
await tick(30);
t("게이트를 지나면 HOME이다", has(main(), "지금 필요한 안내를 정리했습니다."));
t("답한 내용이 이어진다 (체크한 것이 남아 있다)",
  Number((all(main(), (n) => hasClass(n, "hcard"))[1].textContent.match(/(\d+)개/) || [])[1]) > 0);

// ── ③ 아직 확인 못 함 → 답 고치기 → 복귀 ───────────
section("③ 아직 확인 못 함 — 해당 질문으로 직행하고 돌아온다");

카드("필요한 주제별로 보기").click();
await tick(10);
{
  const 건강 = all(main(), (n) => hasClass(n, "tcard")).find((n) => n.textContent.includes("건강"));
  건강.click();
  await tick(10);
  const 미판정 = all(main(), (n) => hasClass(n, "card__hit")).find((n) =>
    n.textContent.includes("아직 확인 못 함")
  );
  t("주제 상세에 '아직 확인 못 함' 카드가 있다", Boolean(미판정), texts(main()).join(" | "));
  미판정.click();
  await tick(10);
  t("전용 화면이 열린다", has(main(), "왜 아직 확인할 수 없나요?") && has(main(), "확인하려면"));
  t("사유가 엔진의 말 그대로다", has(main(), "본인 화재보험 가입 여부에 따라 달라집니다"), texts(main()).join(" | "));
  t("'해당 없음'이라고 하지 않는다", !texts(main()).some((s) => s === "해당 없음"));
  t("안내 기준이 그 구의 조례다", has(main(), "서울특별시 강남구 화재피해주민 지원 조례"));

  button(main(), "보험 답변 다시 확인하기").click();
  await tick(30);
  t("그 질문으로 바로 간다", 질문중()?.own === "본인 명의로 든 화재보험이 있나요?", 질문중()?.own);

  await 한문항({ "본인 명의로 든 화재보험이 있나요?": "없어요" });
  t("답을 고치면 보던 자리로 돌아온다",
    has(main(), "안내 내용은 확인된 근거를 바탕으로 정리하며, 원문이 있는 경우 직접 확인할 수 있습니다.") ||
      has(main(), "왜 아직 확인할 수 없나요?"),
    texts(main()).slice(0, 5).join(" | "));
  t("더는 미판정이 아니다", !has(main(), "왜 아직 확인할 수 없나요?"), texts(main()).slice(0, 5).join(" | "));
}

// ── ④ 안내 범위 (건물 종류 = 그 외) ────────────────
section("④ 안내 범위 — 두 갈래가 다 살아 있다");

configureStorage({ ...memoryBackend(), readJson }); // 새 사람
await 열기();
button($("intro"), "회복 시작하기").click();
await tick(30);
{
  const sel = all(main(), (n) => n.tagName === "SELECT")[0];
  sel.change("gangnam");
  await tick(20);
  button(main(), "다음").click();
  await tick(20);
}
await 한문항(); // 거주 가능 여부
await 한문항({ "불이 난 건물의 종류가 무엇인가요?": "그 외" });

t("'그 외'를 고르면 안내 범위 화면이 뜬다", has(main(), "안내 범위"), texts(main()).join(" | "));
t("본문이 확정된 세 문장이다",
  has(main(), "현재 ‘일상으로’는 주택 화재를 기준으로 안내 내용을 검증하고 있습니다.") &&
    has(main(), "주택 화재가 아닌 경우에도 화재 직후 필요한 현장 보존, 보험, 서류, 피해 기록 등 공통 안내는 계속 확인할 수 있습니다.") &&
    has(main(), "다만 영업 피해, 사업장 특유의 보상·복구 절차 등은 현재 안내 범위에 포함되지 않습니다."));
t("큰 제목이 없다", all(main(), (n) => hasClass(n, "pg__title")).length === 0);

button(main(), "건물 종류 다시 선택").click();
await tick(30);
t("[건물 종류 다시 선택]이 그 질문으로 되돌린다",
  질문중()?.own === "불이 난 건물의 종류가 무엇인가요?", 질문중()?.own);

await 한문항({ "불이 난 건물의 종류가 무엇인가요?": "그 외" });
t("다시 고르면 안내 범위가 또 뜬다", has(main(), "안내 범위"));
button(main(), "이 범위로 계속하기").click();
await tick(30);
t("[이 범위로 계속하기]는 설문을 이어간다", 질문중() !== null, texts(main()).slice(0, 4).join(" | "));

await 설문끝까지();
t("'그 외'로도 끝까지 도달한다", has(main(), "확인했습니다"));
button(main(), "내 회복 경로 보기").click();
await tick(30);
t("'그 외'도 내 회복 경로에 닿는다", has(main(), "지금 필요한 안내를 정리했습니다."));

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
