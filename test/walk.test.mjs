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
//   ⑤ 기기 뒤로가기 — 히스토리가 앱의 화면 순서와 같은가
//   ⑥ 처음으로 — 브릿지에서 답을 다시 걷고, 지우지 않는가

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

// 저장 계층에 **실제로 들어간 값**을 읽는다. 화면이 옳아도 저장이 안 되면
// 다음 방문에 사라지므로, 값 계약은 여기서 본다.
// (여정 ⑥은 저장소를 갈아끼우므로 그 앞에서만 쓴다)
const 저장된 = () => {
  for (const k of backend.keys()) {
    if (!k.includes("state")) continue;
    try {
      const o = JSON.parse(backend.get(k));
      return (o && o.state) || o;
    } catch {
      /* 다음 키 */
    }
  }
  return {};
};

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

// 지나간 질문을 기록하며 끝까지 걷는다.
async function 설문기록(override = {}) {
  const 본것 = [];
  for (let i = 0; i < 30; i++) {
    const q = 질문중();
    if (!q) return 본것;
    본것.push(q.own);
    await 한문항(override);
  }
  throw new Error("설문이 끝나지 않는다");
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
  has($("intro"), "일상으로") &&
    has($("intro"), "불이 꺼진 뒤,") &&
    has($("intro"), "다시 일상으로 가는 길을 안내합니다."),
  texts($("intro")).join(" | "));
// 시각 FINAL — 배경이 사진이고 글자 리빌은 폐기됐다.
t("배경 사진이 실린다",
  all($("intro"), (n) => n.tagName === "IMG").some((n) => /landing-bg\.webp$/.test(n.src || "")),
  all($("intro"), (n) => n.tagName === "IMG").map((n) => n.src).join(" | "));
t("배경 사진은 보조기술에서 건너뛴다",
  all($("intro"), (n) => n.tagName === "IMG").every((n) => n.getAttribute("alt") === ""));
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
  const sel = all(main(), (n) => n.id === "f-district")[0];
  t("날짜가 오늘로 채워져 있다", /^\d{4}-\d{2}-\d{2}$/.test(date.value), date.value);
  t("지역 선택지가 25개 + 빈 항목이다", sel.children.length === 26, String(sel.children.length));
  t("지역을 고르기 전에는 [다음]이 잠겨 있다", button(main(), "다음").disabled === true);
  sel.change("gangnam");
  await tick(30);
}
t("지역을 고르면 [다음]이 열린다", button(main(), "다음").disabled === false);

// ── 화재 발생 시각 — 실제로 눌러서 돈다 ─────────────
//
// ★ **지역을 고른 뒤에 시각·날짜를 만진다.** 앞서 `setBasic`이 patch에 없는
//   키까지 지워서, 지역을 고른 뒤 날짜를 바꾸면 **지역이 사라지고 [다음]이
//   다시 잠겼다.** 실측으로 잡은 것이라 여기서 함께 지킨다.
{
  const 시각 = () => all(main(), (n) => n.id === "f-time")[0];
  const 날짜 = () => all(main(), (n) => n.type === "date")[0];
  const 지역 = () => all(main(), (n) => n.id === "f-district")[0];
  const 지금 = () => Date.parse(저장된().fire_at ?? "");
  t("시각 필드가 있고 비어 있다", Boolean(시각()) && 시각().value === "", 시각()?.value);
  t("시각 선택지가 24개 + 선택 안 함", 시각().children.length === 25, String(시각().children.length));
  t("모르면 비워두라는 한 줄이 있다", has(main(), "모르면 비워두셔도 됩니다."));

  // ① 시각을 고르면 fire_at이 그 시 정각이 된다.
  시각().change("15");
  await tick(40);
  t("① 시각을 고르면 fire_at이 그 시 정각이다",
    new Date(지금()).getHours() === 15 && new Date(지금()).getMinutes() === 0,
    new Date(지금()).toString());
  t("① 지역이 지워지지 않는다", 지역().value === "gangnam", 지역().value);
  t("① [다음]도 잠기지 않는다", button(main(), "다음").disabled === false);

  // ③ 날짜를 바꿔도 고른 시각은 유지된다.
  const 어제 = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  날짜().change(어제);
  await tick(40);
  t("③ 날짜를 바꿔도 시각은 유지된다", new Date(지금()).getHours() === 15, new Date(지금()).toString());
  t("③ 날짜는 실제로 바뀌었다", new Date(지금()).toISOString().slice(0, 10) === 어제);
  t("③ 여기서도 지역이 살아 있다", 지역().value === "gangnam");
  t("③ 고른 시각이 화면에도 남아 있다", 시각().value === "15", 시각().value);

  // ④ '선택 안 함'으로 되돌리면 근사(정오)로 복귀한다.
  시각().change("");
  await tick(40);
  t("④ 선택 안 함으로 되돌리면 정오 근사다", new Date(지금()).getHours() === 12, new Date(지금()).toString());
  t("④ 되돌려도 날짜는 그대로다", new Date(지금()).toISOString().slice(0, 10) === 어제);

  // 오늘로 되돌려 나머지 여정을 원래대로 걷는다.
  날짜().change(new Date().toISOString().slice(0, 10));
  await tick(40);
  // ★ **오늘의 근사는 정오가 아니라 지금이다**(사용자 결정). 정오로 밀면
  //   아침에 들어온 사람은 경과가 음수가 되고, 저녁에 들어온 사람은 경과가
  //   과대추정되어 골든타임 항목이 성급히 `missed`로 내려간다.
  t("② 비운 채 오늘이면 지금 시각이다",
    Math.abs(Date.now() - 지금()) < 6e4, new Date(지금()).toString());
  t("② 경과가 음수가 되지 않는다", 지금() <= Date.now());

  // ── 아직 오지 않은 시각은 고를 수 없다 ──
  {
    const 지금시 = new Date().getHours();
    const 잠긴 = [...시각().children].filter((o) => o.disabled);
    t("오늘이면 현재 시 이후가 잠긴다",
      잠긴.length === 23 - 지금시 &&
        잠긴.every((o) => Number(o.value) > 지금시),
      `지금 ${지금시}시 · 잠김 ${잠긴.length}개`);
    // 과거 날짜로 가면 전부 열린다.
    const 어제2 = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    날짜().change(어제2);
    await tick(40);
    t("과거 날짜에서는 24개가 전부 열린다",
      [...시각().children].every((o) => !o.disabled));
    // 과거에서 늦은 시각을 고른 뒤 오늘로 되돌리면 `선택 안 함`이 된다.
    시각().change("23");
    await tick(40);
    t("과거 날짜에서 오후 11시를 골랐다", new Date(지금()).getHours() === 23);
    날짜().change(new Date().toISOString().slice(0, 10));
    await tick(40);
    t("★ 오늘로 되돌리면 아직 안 온 시각은 선택 안 함이 된다",
      시각().value === "" && 저장된().fire_hour === undefined,
      `${시각().value} / ${저장된().fire_hour}`);
    t("★ 어떤 경로로도 fire_at이 미래가 되지 않는다", 지금() <= Date.now(),
      new Date(지금()).toString());
  }
}

button(main(), "다음").click();
await tick(30);

t("설문 MASTER로 넘어간다", has(main(), "상황 확인") && 질문중() !== null, texts(main()).join(" | "));
t("첫 질문이 날짜가 아니다", 질문중().own === "지금 그 집에서 지낼 수 있나요?", 질문중().own);
t("하단 한 줄이 확정 문구다", has(main(), "답변에 따라 당신의 상황에 필요한 질문만 이어집니다."));
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
// 기준 줄은 그 사람의 실제 값이다 — 자치구가 화면에 그대로 나온다.
// ★ 순서가 바뀌었다 — 체크 → 세 줄 → `확인했습니다` → 안내 문장.
t("전환 문구가 확정 문구다",
  has(main(), "당신의 회복에 필요한 내용을 안내하겠습니다.") && has(main(), "강남구"),
  texts(main()).join(" | "));
{
  const t2 = texts(main());
  const i = (x) => t2.findIndex((s) => s.includes(x));
  t("세 줄이 제목보다 먼저 온다",
    i("강남구") < i("확인했습니다") && i("확인했습니다") < i("안내하겠습니다"),
    t2.join(" | "));
}
t("'AI 분석 중'류 표현이 없다", !texts(main()).some((s) => /AI|분석 중|생성 중/.test(s)));

button(main(), "내 회복 경로 보기").click();
await tick(30);

// ★ **도착 화면이 타임라인이다**(사용자 결정). 전환 CTA가 약속한 이름과
//   도착지 이름이 같다 — 앞서는 이름이 같은 다른 화면(허브)에 닿았다.
t("전환 CTA가 타임라인으로 데려간다",
  has(main(), "내 회복 경로") && all(main(), (n) => hasClass(n, "tline__node")).length === 5,
  texts(main()).slice(0, 4).join(" | "));
t("D-015 1층이 결과 첫 도달(타임라인)에 뜬다", $("save-notice").hidden === false);
// ★ 사진 배경이 **도착 화면에도** 깔린다(사용자 결정) — 허브와 같은 클래스다.
t("타임라인에 사진 배경이 붙는다", document.body.classList.contains("photo-bg"));
// ★ **도착 화면에는 뒤가 없다.** 전환·게이트는 지나가면 덮이는 화면이라
//   히스토리에 자리가 없고, 그리로 보내는 [이전]은 기기 뒤로가기와 다른
//   곳으로 간다 — 실측으로 어긋나 있던 것을 여기서 닫는다.
t("타임라인 우상단이 [처음으로] 하나다 (도착 화면에는 뒤가 없다)",
  texts($("top-right")).join(",") === "처음으로",
  texts($("top-right")).join(" | "));
// 허브로 가는 문은 **제목 바로 아래, 본문(타임라인 축) 앞**이다.
{
  const 문 = button(main(), "나를 위한 안내 보기");
  const 순 = texts(main());
  t("허브로 가는 문이 제목 아래·본문 앞에 있다",
    Boolean(문) && 순.indexOf("나를 위한 안내 보기") < 순.indexOf("화재 발생일"),
    순.slice(0, 5).join(" | "));
  문.click();
}
await tick(30);

t("허브가 나온다", has(main(), "나를 위한 안내") && all(main(), (n) => hasClass(n, "hcard")).length === 3);
t("핵심 카드가 셋이다", all(main(), (n) => hasClass(n, "hcard")).length === 3);
t("카드 제목이 확정 문구다",
  has(main(), "먼저 볼 내용") && has(main(), "체크리스트") && has(main(), "알아둘 내용"));
// 보조 탐색 둘 + 참고 자료 둘(근거 법령 · 연락처). 뒤 줄은 결과를 보는
// 방식이 아니라 근거와 창구라 줄을 나눴다.
t("보조 탐색과 참고 자료가 각 둘이다",
  all(main(), (n) => hasClass(n, "mcard")).length === 4 &&
    has(main(), "근거 법령") && has(main(), "연락처"),
  texts(main()).join(" | "));
// **HOME은 제목 하나로 시작한다**(사용자 실기기 검수 결정). 기준 줄과
// 리드는 바로 앞 전환 화면이 이미 말했다.
t("기준 줄이 없다",
  !texts(main()).some((s) => /당신의 상황을 기준으로/.test(s)),
  texts(main()).join(" | "));
t("리드가 없다", !has(main(), "지금 필요한 안내를 정리했습니다."));
// 배경 수미상관 — 첫 화면 사진의 흐린 버전이 **허브에만** 깔린다.
t("허브에 배경 클래스가 붙는다", document.body.classList.contains("photo-bg"));
t("경과시간 칩은 없다", !texts(main()).some((s) => /^\d{2}일 \d{2}:\d{2}$/.test(s)));
// HOME 우상단은 [이전]이 아니라 [처음으로]다(사용자 실기기 검수 결정) —
// 결과에 닿은 뒤로는 브릿지를 다시 만날 일이 없어 답을 고치러 갈 길이
// 상세 화면의 CTA 하나뿐이었다.
// HOME 우상단에 둘이 선다 — 온 길로 되돌리는 [이전]과 랜딩으로 가는 [처음으로].
t("허브 우상단이 [이전]과 [처음으로]다",
  texts($("top-right")).join(",") === "이전,처음으로",
  texts($("top-right")).join(" | "));
// 안내는 **띄운 화면에서만** 남는다 — 타임라인을 떠나면서 닫혔다.
t("허브로 넘어오면 저장 안내가 닫힌다", $("save-notice").hidden === true);

// 다섯 화면을 하나씩 들어갔다 나온다.
const 카드 = (name) => all(main(), (n) => hasClass(n, "hcard") || hasClass(n, "mcard"))
  .find((n) => n.textContent.includes(name));

for (const [이름, 표시] of [
  ["먼저 볼 내용", "제일 먼저 확인해야 할 정보입니다."],
  ["체크리스트", "하나씩 해나가야 하는 일입니다."],
  ["알아둘 내용", "당장 행동할 필요는 없지만, 이후를 위해 확인해둘 정보입니다."],
  // 허브의 보조 탐색 라벨도 **도착지 이름 그대로**다.
  ["내 회복 경로", "회복 과정에서 언제 무엇을 확인하면 되는지 살펴보세요."],
  ["주제별 보기", "지금 내 상황에 해당하는 안내를 주제별로 모았습니다."],
  // 구 덱에서 자리를 잃었던 둘이 돌아왔다(사용자 결정).
  ["근거 법령", "이 안내가 어떤 법령과 자료를 근거로 하는지 모았습니다."],
  ["연락처", "자주 필요한 기관 연락처입니다. 누르면 전화로 연결됩니다."],
]) {
  카드(이름).click();
  await tick(10);
  t(`[${이름}] → 그 화면이 그려진다`, has(main(), 표시), texts(main()).slice(0, 6).join(" | "));
  // 타임라인만 둘이다 — 도착 화면이라 [처음으로]가 함께 선다.
  t(`[${이름}] 화면에 [이전]이 있다`,
    $("top-right").children.length === (이름 === "내 회복 경로" ? 2 : 1));
  // ★ 사진은 **두 화면**이 깐다 — 도착 화면(타임라인)과 허브.
  t(`[${이름}] 배경은 사진 두 화면에만 있다`,
    document.body.classList.contains("photo-bg") === (이름 === "내 회복 경로"));
  $("top-right").children[0].click();
  await tick(10);
  // 타임라인의 [이전]은 **온 길**이다 — 허브에서 눌러 들어왔으니 허브다.
  t(`[${이름}] → [이전]이 허브로 되돌린다`, has(main(), "나를 위한 안내"));
}

t("허브로 돌아와도 저장 안내가 다시 뜨지 않는다 (한 번뿐)", $("save-notice").hidden === true);

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
  t("하단 문구가 확정 문구다", has(main(), "체크한 항목은 이 기기에 완료 상태로 기억됩니다."));

  // ★ **체크해도 항목은 제자리다**(사용자 실기기 검수 결정).
  //   아래로 내려가는 `완료한 것` 블록이 없다 — 방금 체크한 것이 눈앞에서
  //   사라지면 되돌릴 자리를 잃는다.
  const 순서 = () => all(main(), (n) => hasClass(n, "card")).map((n) => n.dataset.row);
  const box = all(main(), (n) => hasClass(n, "card__box") && !hasClass(n, "card__box--off"))[0];
  const 전순서 = 순서();
  const 전개수 = all(main(), (n) => hasClass(n, "card")).length;
  box.click();
  await tick(40);
  t("체크해도 목록 길이가 그대로다",
    all(main(), (n) => hasClass(n, "card")).length === 전개수,
    `${전개수} -> ${all(main(), (n) => hasClass(n, "card")).length}`);
  t("순서가 한 칸도 안 움직인다", 순서().join() === 전순서.join(), 순서().join(" > "));
  t("체크한 카드가 완료 표시를 입는다",
    all(main(), (n) => hasClass(n, "card--checked")).length === 1);
  t("'완료한 것' 접힘 블록이 없다", !has(main(), "완료한 것"));
  // 같은 자리에서 해제된다.
  all(main(), (n) => hasClass(n, "card__box--on"))[0].click();
  await tick(40);
  t("같은 자리에서 해제된다",
    all(main(), (n) => hasClass(n, "card--checked")).length === 0 &&
      순서().join() === 전순서.join());
  box.click();
  await tick(40);
}

// ── 근거 법령 — 펼치고, 안내로 갔다가, 돌아온다 ────
{
  // 앞 블록이 체크리스트에서 끝났다. HOME으로 올라가서 시작한다.
  $("top-right").children[0].click();
  await tick(10);
  카드("근거 법령").click();
  await tick(10);
  const 접힘 = all(main(), (n) => hasClass(n, "fold--src"));
  t("근거가 접힌 채로 나온다", 접힘.length > 0, String(접힘.length));
  t("접힌 상태에서는 조문 줄이 안 보인다",
    접힘.every((d) => d.open !== true));
  // ★ 이 페르소나는 보험을 '잘 모르겠어요'로 답해 **조례 안내가 미판정**이다.
  //   확정되지 않은 근거는 이 화면에 오지 않는다 — 근거 페이지는 "지금 내
  //   안내가 무엇에 서 있나"를 보는 자리이지 후보 목록이 아니다.
  //   (조례가 확정된 사람의 화면은 view.test가 본다)
  t("미판정 조례는 근거 화면에 없다", !has(main(), "화재피해주민 지원 조례"),
    texts(main()).join(" | "));

  // 법령 하나를 펼친다.
  const 법령 = 접힘.find((d) => !has(d, "조례"));
  법령.open = true;
  const 줄 = all(법령, (n) => hasClass(n, "srcrow"));
  t("펼치면 조문 줄이 있다", 줄.length > 0, String(줄.length));
  t("각 줄이 그 근거를 쓰는 안내를 센다",
    줄.every((r) => texts(r).some((x) => /^안내 \d+건$/.test(x))),
    texts(줄[0]).join(" | "));

  // 역링크 — 그 안내로 갔다가 [이전]으로 돌아온다.
  const 링크 = all(법령, (n) => hasClass(n, "srcrow__link"))[0];
  const 안내제목 = 링크.textContent;
  링크.click();
  await tick(10);
  t("근거에서 그 안내로 간다", has(main(), 안내제목), texts(main()).slice(0, 4).join(" | "));
  $("top-right").children[0].click();
  await tick(10);
  t("[이전]이 근거 화면으로 되돌린다", has(main(), "이 안내가 어떤 법령과 자료를 근거로 하는지 모았습니다."));
  $("top-right").children[0].click();
  await tick(10);
  t("한 번 더 [이전]이면 HOME이다", has(main(), "내 회복 경로"));
}

// ── 연락처 — 번호가 tel: 링크다 ────────────────────
{
  카드("연락처").click();
  await tick(10);
  t("네 그룹이 다 그려진다",
    ["긴급", "복지·긴급지원", "법률·분쟁", "심리"].every((g) => has(main(), g)),
    texts(main()).join(" | "));
  const tel = all(main(), (n) => n.tagName === "A" && /^tel:/.test(n.href || ""));
  // 전역 9 + 그 구의 관할 소방서 1.
  t("번호가 tel: 링크다", tel.length === 10, String(tel.length));
  // **전화기 아이콘은 `tel:`에만 붙는다** — 아이콘이 "누르면 걸린다"는
  // 약속이라 안 걸리는 자리에 달면 거짓말이 된다.
  t("모든 번호에 전화기 아이콘이 있다",
    tel.every((a) => a.children.some((c) => hasClass(c, "telicon"))),
    String(tel.filter((a) => !a.children.some((c) => hasClass(c, "telicon"))).length));
  t("아이콘은 보조기술에서 건너뛴다",
    all(main(), (n) => hasClass(n, "telicon")).every((n) => n.getAttribute("aria-hidden") === "true"));
  t("119와 1670-9512가 있다",
    tel.some((a) => a.href === "tel:119") && tel.some((a) => a.href === "tel:1670-9512"),
    tel.map((a) => a.href).join(" "));
  // 자치구 줄 — **관할 소방서 화재조사 직통**이다(옛 구청 부서 줄을 대신).
  t("관할 소방서 줄이 있다", has(main(), "강남소방서 화재조사"), texts(main()).join(" | "));
  t("구청 부서 줄은 사라졌다", !has(main(), "구청 대표번호로 문의하세요."));
  // 번호도 링크도 없는 문장 하나.
  t("민간 구호 문장이 있다", has(main(), "동주민센터에 피해를 등록하는 것이 관문입니다."));
  t("'검증됨' 같은 과장이 없다", !texts(main()).some((x) => /검증됨|공식 인증/.test(x)));
  $("top-right").children[0].click();
  await tick(10);
  t("[이전]이 HOME으로 되돌린다", has(main(), "내 회복 경로"));
}

// 주제별 → 주제 상세 → Action 상세 → 뒤로 두 번
// (앞 블록이 이미 HOME으로 돌아왔다. HOME의 우상단 첫 버튼은 이제
//  [이전]이라 여기서 누르면 전환 화면으로 나간다.)
카드("주제별 보기").click();
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

  // ★ 카드 마크업 순서를 고정한다. 실기기에서 제목이 한 글자 열로
  //   떨어진 사고의 절반이 **출처 줄이 제목의 형제로 나란히 선 것**이었다.
  //   확정 위계는 세로다 — 제목·요약이 먼저, 출처 줄이 뒤.
  {
    const 출처카드 = all(main(), (n) => hasClass(n, "card--stack"));
    if (출처카드.length) {
      const kids = 출처카드[0].children.map((c) => c.className || "");
      t("출처가 있는 카드는 card--stack이다", 출처카드.length > 0);
      t(
        "제목 묶음이 먼저이고 출처 줄이 뒤다",
        kids.indexOf("card__hit") >= 0 &&
          kids.indexOf("card__src") > kids.indexOf("card__hit"),
        kids.join(" | ")
      );
    }
  }

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
  has(main(), "지금 시점에 맞는 안내로") && has(main(), "다시 정리합니다."),
  texts(main()).join(" | "));
t("경과 뒤에 '경과'가 붙는다", has(main(), "경과"));
t("현재 시각 시계가 아니다", !texts(main()).some((s) => /일째/.test(s)));

button(main(), "내 회복 경로 보기").click();
await tick(30);
// ★ 브릿지 CTA도 **타임라인 도착**이고 라벨도 도착지 이름이다 — 결과로
//   들어오는 문 셋이 같은 자리에 닿는다.
t("게이트를 지나면 타임라인이다",
  has(main(), "내 회복 경로") && all(main(), (n) => hasClass(n, "tline__node")).length === 5,
  texts(main()).slice(0, 3).join(" | "));
button(main(), "나를 위한 안내 보기").click();
await tick(20);
t("답한 내용이 이어진다 (체크한 것이 남아 있다)",
  Number((all(main(), (n) => hasClass(n, "hcard"))[1].textContent.match(/(\d+)개/) || [])[1]) > 0);

// ── ③ 아직 확인 못 함 → 답 고치기 → 복귀 ───────────
section("③ 아직 확인 못 함 — 해당 질문으로 직행하고 돌아온다");

카드("주제별 보기").click();
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
  const sel = all(main(), (n) => n.id === "f-district")[0];
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
t("'그 외'도 내 회복 경로에 닿는다", has(main(), "내 회복 경로"));

// ── ⑤ 기기 뒤로가기 ────────────────────────────────
section("⑤ 기기 뒤로가기 — [이전] 버튼과 같은 자리로 가는가");

// 화면 전환이 내부 상태로만 일어나면 폰의 뒤로가기가 앱 밖으로 나간다.
// 여기서 보는 것은 **히스토리에 남은 자리가 앱의 화면 순서와 같은가**다.
configureStorage({ ...memoryBackend(), readJson }); // 새 사람
await 열기();
button($("intro"), "회복 시작하기").click();
await tick(30);
{
  const sel = all(main(), (n) => n.id === "f-district")[0];
  sel.change("gangnam");
  await tick(20);
  button(main(), "다음").click();
  await tick(20);
}

// ① 설문 3문항 진행 → 기기 뒤로 2번 = 두 질문 전, 답 보존
const 밟은질문 = [질문중().own];
for (let i = 0; i < 3; i++) {
  await 한문항({ "본인 명의로 든 화재보험이 있나요?": "잘 모르겠어요" });
  밟은질문.push(질문중().own);
}
t("① 설문 3문항을 진행했다", 밟은질문.length === 4, 밟은질문.join(" → "));
{
  const r1 = dom.back();
  await tick(20);
  t("① 기기 뒤로 1번 = 한 질문 전", !r1.left && 질문중()?.own === 밟은질문[2],
    `${밟은질문[3]} → ${질문중()?.own}`);
  const r2 = dom.back();
  await tick(20);
  t("① 기기 뒤로 2번 = 두 질문 전", !r2.left && 질문중()?.own === 밟은질문[1],
    `기대 ${밟은질문[1]} / 실제 ${질문중()?.own}`);
  // 답이 지워지지 않았다 — 고른 것이 글자로 표시된다(색만으로 말하지 않는다).
  t("① 뒤로 가도 답은 보존된다",
    all(main(), (n) => hasClass(n, "q__choice--on")).length === 1,
    texts(main()).join(" | "));
  t("① 앱 밖으로 나가지 않았다", 질문중() !== null);
}

// 다시 앞으로 — 답이 있는 질문을 다시 답해도 흐름이 이어진다.
await 설문끝까지({ "본인 명의로 든 화재보험이 있나요?": "잘 모르겠어요" });
t("① 되돌아왔다가 진행해도 전환에 닿는다", has(main(), "확인했습니다"));
button(main(), "내 회복 경로 보기").click();
await tick(30);
t("① 전환을 지나면 타임라인이다",
  all(main(), (n) => hasClass(n, "tline__node")).length === 5, texts(main()).slice(0, 3).join(" | "));
button(main(), "나를 위한 안내 보기").click();
await tick(20);
t("① 타임라인의 문이 허브로 잇는다", has(main(), "나를 위한 안내"));

// ② 허브 → 체크리스트 → 상세 → 기기 뒤로 2번 = 허브
{
  카드("체크리스트").click();
  await tick(10);
  all(main(), (n) => hasClass(n, "card__hit"))[0].click();
  await tick(10);
  t("② 상세까지 들어갔다",
    has(main(), "안내 내용은 확인된 근거를 바탕으로 정리하며, 원문이 있는 경우 직접 확인할 수 있습니다."));
  dom.back();
  await tick(20);
  t("② 기기 뒤로 1번 = 체크리스트", has(main(), "하나씩 해나가야 하는 일입니다."),
    texts(main()).slice(0, 4).join(" | "));
  dom.back();
  await tick(20);
  t("② 기기 뒤로 2번 = HOME", has(main(), "내 회복 경로"),
    texts(main()).slice(0, 4).join(" | "));
}

// ★ **[이전]이 있는 화면은 전부** 기기 뒤로가기와 같은 자리로 가야 한다.
//
// 실측으로 어긋나 있었다 — 도착 타임라인의 [이전]이 온 길(전환·게이트)로
// 갔는데 그 둘은 **지나가면 덮이는 화면**(CONSUMED)이라 히스토리에 자리가
// 없다. 첫 방문은 [이전]→전환 / 기기뒤로→설문, 재방문은 [이전]→브릿지 /
// 기기뒤로→앱 밖이었다. 덮인 자리를 [이전]이 되살리면 안 된다.
//
// 그래서 검사를 **한 화면이 아니라 규칙으로** 둔다: 결과 화면들을 돌며
// [이전]이 그려진 곳마다 둘을 나란히 눌러 비교한다.
{
  const 자리 = () => texts(main()).slice(0, 4).join(" | ");
  const 이전버튼 = () => [...$("top-right").children].find((n) => n.textContent === "이전") ?? null;
  for (const 이름 of ["먼저 볼 내용", "체크리스트", "알아둘 내용", "내 회복 경로", "주제별 보기"]) {
    카드(이름).click();
    await tick(10);
    const 버튼 = 이전버튼();
    t(`[${이름}]에 [이전]이 있다`, Boolean(버튼), texts($("top-right")).join(","));
    if (!버튼) continue;
    버튼.click();
    await tick(20);
    const 버튼결과 = 자리();
    카드(이름).click();
    await tick(10);
    dom.back();
    await tick(20);
    t(`[${이름}] — [이전]과 기기 뒤로가기가 같은 자리다`,
      버튼결과 === 자리(), `버튼: ${버튼결과}  ||  뒤로: ${자리()}`);
  }
}

// 도착 화면에는 [이전]이 없다 — 뒤가 덮여 있어서 보낼 자리가 없다.
{
  const 타임 = all(main(), (n) => hasClass(n, "mcard")).find((n) => n.textContent.includes("내 회복 경로"));
  타임.click();
  await tick(10);
  t("허브에서 들어간 타임라인에는 [이전]이 있다",
    texts($("top-right")).includes("이전"), texts($("top-right")).join(","));
  $("top-right").children[0].click();
  await tick(20);
}

// [이전] 버튼과 기기 뒤로가기가 같은 자리로 간다
{
  카드("먼저 볼 내용").click();
  await tick(10);
  const 버튼결과 = (() => {
    $("top-right").children[0].click();
    return texts(main()).slice(0, 4).join(" | ");
  })();
  await tick(10);
  카드("먼저 볼 내용").click();
  await tick(10);
  dom.back();
  await tick(20);
  t("[이전] 버튼과 기기 뒤로가기가 같은 화면을 낸다",
    버튼결과 === texts(main()).slice(0, 4).join(" | "),
    `${버튼결과} ||| ${texts(main()).slice(0, 4).join(" | ")}`);
}

// ③ 미판정 → 질문 직행 → 답 변경 → 복귀 후 기기 뒤로 = 어긋남 없음
{
  카드("주제별 보기").click();
  await tick(10);
  all(main(), (n) => hasClass(n, "tcard")).find((n) => n.textContent.includes("건강")).click();
  await tick(10);
  const 미판정 = all(main(), (n) => hasClass(n, "card__hit")).find((n) =>
    n.textContent.includes("아직 확인 못 함")
  );
  t("③ 미판정 카드가 있다", Boolean(미판정), texts(main()).join(" | "));
  미판정.click();
  await tick(10);
  t("③ 전용 화면이 열렸다", has(main(), "왜 아직 확인할 수 없나요?"));

  button(main(), "보험 답변 다시 확인하기").click();
  await tick(30);
  t("③ 그 질문으로 직행했다", 질문중()?.own === "본인 명의로 든 화재보험이 있나요?");

  await 한문항({ "본인 명의로 든 화재보험이 있나요?": "없어요" });
  t("③ 답을 고치면 보던 자리로 돌아온다", !has(main(), "왜 아직 확인할 수 없나요?") && 질문중() === null,
    texts(main()).slice(0, 4).join(" | "));

  // 복귀는 **자리를 새로 쌓는다**(history.back()으로 흉내 내지 않는다).
  // 그래서 여기서 뒤로 가면 방금 답한 그 질문이다 — 화면과 히스토리가 갈리지 않는다.
  dom.back();
  await tick(20);
  t("③ 복귀 후 기기 뒤로 = 방금 답한 질문 (어긋남 없음)",
    질문중()?.own === "본인 명의로 든 화재보험이 있나요?",
    `실제: ${질문중()?.own ?? texts(main()).slice(0, 3).join(" | ")}`);
  t("③ 고친 답이 그대로 보인다",
    all(main(), (n) => hasClass(n, "q__choice--on"))[0]?.textContent.includes("없어요"),
    all(main(), (n) => hasClass(n, "q__choice--on"))[0]?.textContent);
}

// ④ 진입 직후 기기 뒤로 = 핸들러가 개입하지 않는다
{
  const 전 = texts(main()).slice(0, 6).join(" | ");
  const 깊이 = dom.depth();
  dom.popstate(null); // 최초 엔트리 바깥 — 다른 사이트의 칸이다
  await tick(20);
  t("④ state가 없으면 화면을 건드리지 않는다", texts(main()).slice(0, 6).join(" | ") === 전);
  t("④ 붙잡으려고 칸을 쌓지도 않는다", dom.depth() === 깊이, `${깊이} → ${dom.depth()}`);
}

// 재방문에서 도착 화면은 뿌리다 — 게이트를 소비하므로 뒤로가기가 앱을 나간다.
{
  await 열기(); // 같은 저장소로 다시 진입 = 재방문
  t("재방문은 경과시간 게이트다", has(main(), "화재 발생 후"));
  const 깊이 = dom.depth();
  button(main(), "내 회복 경로 보기").click();
  await tick(30);
  // ★ 결과로 들어오는 문이 **전부 타임라인 도착으로 통일**됐다(사용자 결정).
  t("게이트를 지나면 타임라인이다",
    all(main(), (n) => hasClass(n, "tline__node")).length === 5, texts(main()).slice(0, 3).join(" | "));
  t("게이트는 칸을 쌓지 않고 덮는다 (소비되는 화면)", dom.depth() === 깊이,
    `${깊이} → ${dom.depth()}`);
  t("도착 화면에서 기기 뒤로가기는 앱을 나간다 (트랩 없음)", dom.back().left === true);
}

// ── ⑥ 처음으로 ────────────────────────────────────
section("⑥ 처음으로 — 브릿지에서 답을 다시 걷는다");

// 재방문 브릿지의 갈 곳이 CTA 하나뿐이었다. 우상단에 답을 다시 걷는 문을
// 둔다(사용자 결정). **지우는 것이 아니다** — 답·완료 체크가 전부 남는다.
configureStorage({ ...memoryBackend(), readJson }); // 새 사람
await 열기();
button($("intro"), "회복 시작하기").click();
await tick(30);
{
  const sel = all(main(), (n) => n.id === "f-district")[0];
  sel.change("gangnam");
  await tick(20);
  button(main(), "다음").click();
  await tick(20);
}
const 첫질문 = 질문중().own;
await 설문끝까지();
button(main(), "내 회복 경로 보기").click();
await tick(30);
button(main(), "나를 위한 안내 보기").click();
await tick(20);

// 완료 체크를 하나 남긴다 — 재설문이 이것을 건드리면 안 된다.
const 먼저볼 = () => Number((카드("먼저 볼 내용").textContent.match(/(\d+)개/) || [])[1]);
const 처음먼저볼 = 먼저볼();
카드("체크리스트").click();
await tick(10);
all(main(), (n) => hasClass(n, "card__box") && !hasClass(n, "card__box--off"))[0].click();
await tick(40);
t("완료 체크를 하나 남겼다", all(main(), (n) => hasClass(n, "card--checked")).length === 1);
$("top-right").children[0].click();
await tick(10);

// ① 브릿지 → 처음으로 → 랜딩 → 기본 확인 → 첫 질문
await 열기(); // 재진입 = 재방문
t("① 재방문 브릿지다", has(main(), "화재 발생 후"));
t("① 브릿지 우상단에 [처음으로]가 있다",
  $("top-right").children[0]?.textContent === "처음으로",
  $("top-right").children[0]?.textContent);

$("top-right").children[0].click();
await tick(20);
t("① 탭하면 랜딩이다 (브랜드 문부터)",
  $("intro").hidden === false && has($("intro"), "다시 일상으로 가는 길을 안내합니다."),
  texts($("intro")).join(" | "));

// 기기 뒤로가기 = 브릿지 복귀 (브릿지는 소비되는 화면이지만 여기서만 쌓는다)
{
  const r = dom.back();
  await tick(20);
  t("① 기기 뒤로 = 브릿지 복귀", !r.left && has(main(), "화재 발생 후"),
    texts(main()).slice(0, 4).join(" | "));
  $("top-right").children[0].click();
  await tick(20);
}

button($("intro"), "회복 시작하기").click();
await tick(30);
t("① 랜딩 CTA는 기본 확인으로 간다", has(main(), "화재가 있었던 날짜와 지역을 알려주세요"));
{
  const date = all(main(), (n) => n.type === "date")[0];
  const sel = all(main(), (n) => n.id === "f-district")[0];
  t("① 기본 확인의 날짜가 유지된다", /^\d{4}-\d{2}-\d{2}$/.test(date.value), date.value);
  t("① 기본 확인의 지역이 유지된다", sel.value === "gangnam", sel.value);
  button(main(), "다음").click();
  await tick(20);
}
t("① 다 답했어도 설문 첫 질문부터 걷는다", 질문중()?.own === 첫질문, `${첫질문} / ${질문중()?.own}`);
// ★ 사용자가 지적한 자리다 — 이미 새로 걷는 중인데 `이어서 보고 있습니다`가
//   붙어 있었다. 진입 알림은 진입 화면에서만 선다.
t("① 재설문 중에는 진입 알림이 없다 (이어서 보는 중이 아니다)",
  !texts($("banners")).some((x) => x.includes("이어서 보고 있습니다")),
  texts($("banners")).join(" | "));
t("① 기존 답이 선택된 채로 뜬다",
  all(main(), (n) => hasClass(n, "q__choice--on")).length === 1,
  texts(main()).join(" | "));

// 답 하나만 바꾼다 — 젖은 가전 있어요 → 없어요
const 재설문질문 = await 설문기록({ "물에 젖은 가전제품이나 전자기기가 있나요?": "없어요" });
t("① 재설문 끝은 기존 전환 화면이다", has(main(), "확인했습니다"));
t("① 재설문은 보이는 질문을 전부 걷는다",
  재설문질문.length >= 15 && 재설문질문[0] === 첫질문, `${재설문질문.length}문항`);
// ②의 대조군 — 발화 위치를 그대로 두면 제품 질문을 지나간다.
t("① 발화 위치를 그대로 두면 제품 질문을 지나간다",
  재설문질문.includes("불이 사용하던 제품에서 시작됐다고 들으셨나요?"),
  재설문질문.join(" → "));
button(main(), "내 회복 경로 보기").click();
await tick(30);
t("① 전환을 지나면 타임라인이다",
  all(main(), (n) => hasClass(n, "tline__node")).length === 5, texts(main()).slice(0, 3).join(" | "));
button(main(), "나를 위한 안내 보기").click();
await tick(20);
t("① 바꾼 답이 결과에 반영된다 (금지 하나가 빠진다)",
  먼저볼() === 처음먼저볼 - 1, `${처음먼저볼} → ${먼저볼()}`);
{
  카드("체크리스트").click();
  await tick(10);
  // 재진입해도 완료는 제자리에 남아 있다.
  t("① 완료 체크는 그대로다 (답을 지우지 않는다)",
    all(main(), (n) => hasClass(n, "card--checked")).length === 1,
    texts(main()).slice(-6).join(" | "));
  $("top-right").children[0].click();
  await tick(10);
}
// 허브에도 [처음으로]가 있다 — 브릿지와 같은 문이고, 재설문을 마치고
// 돌아온 뒤에도 다시 걸을 수 있다는 뜻이다.
t("① 재설문을 마치면 허브이고 우상단에 [처음으로]가 있다",
  has(main(), "나를 위한 안내") &&
    texts($("top-right")).includes("처음으로"),
  texts($("top-right")).join(" | "));

// ② 재설문 중 upstream 답 변경 → pruneStale이 뒤 질문을 지운다
await 열기();
$("top-right").children[0].click();
await tick(20);
button($("intro"), "회복 시작하기").click();
await tick(30);
button(main(), "다음").click();
await tick(20);
{
  // 발화 위치를 '모른다'로 바꾸면 제품 질문이 사라진다(ask_when).
  const 본것 = [];
  for (let i = 0; i < 30; i++) {
    const q = 질문중();
    if (!q) break;
    본것.push(q.own);
    const 바꾼다 = q.own === "불이 어디에서 시작됐는지 들으셨나요?";
    await 한문항(바꾼다 ? { [q.own]: "아직 모르거나 듣지 못했어요" } : {});
    if (바꾼다)
      t("② upstream을 바꾸면 바로 다음이 제품 질문이 아니다 (pruneStale)",
        질문중()?.own !== "불이 사용하던 제품에서 시작됐다고 들으셨나요?",
        질문중()?.own);
  }
  t("② 이번 재설문에는 제품 질문이 아예 없다",
    !본것.includes("불이 사용하던 제품에서 시작됐다고 들으셨나요?"),
    본것.join(" → "));
}
t("② 재설문이 끝까지 돈다", has(main(), "확인했습니다"));

// ③ 재설문 도중 이탈 → 다음 진입은 평소처럼 브릿지부터
await 열기();
$("top-right").children[0].click();
await tick(20);
button($("intro"), "회복 시작하기").click();
await tick(30);
button(main(), "다음").click();
await tick(20);
await 한문항();
t("③ 재설문 도중이다", 질문중() !== null, texts(main()).slice(0, 3).join(" | "));
await 열기(); // 이탈 후 재진입
t("③ 재진입은 평소처럼 브릿지다", has(main(), "화재 발생 후"), texts(main()).slice(0, 4).join(" | "));
button(main(), "내 회복 경로 보기").click();
await tick(30);
t("③ 브릿지 CTA는 그대로 타임라인이다 (재설문 플래그가 안 남는다)",
  all(main(), (n) => hasClass(n, "tline__node")).length === 5,
  texts(main()).slice(0, 4).join(" | "));

// ④ 랜딩의 보조 버튼 — 설문을 걷지 않고 결과로 되돌아간다
//
// **저장된 기록이 있는 사람에게만** 뜬다(사용자 결정). [처음으로]로
// 랜딩까지 왔다가 마음을 바꾼 사람의 출구이기도 하다.
{
  await 열기(); // 재방문 = 브릿지
  $("top-right").children[0].click(); // [처음으로] → 랜딩
  await tick(20);
  const 보조 = button($("intro"), "그대로 두고 돌아가기");
  t("④ [처음으로]로 온 랜딩에 되돌아가기가 있다", Boolean(보조),
    texts($("intro")).join(" | "));
  // 위계 — 주 CTA는 그대로 있고, 이 버튼이 그 위에 선다.
  {
    const 순 = texts($("intro"));
    t("④ [회복 시작하기]보다 위다",
      순.indexOf("그대로 두고 돌아가기") < 순.indexOf("회복 시작하기"), 순.join(" | "));
  }
  // ★ 버튼이 둘이면 **화면 전체 탭은 끈다.** 윤곽뿐인 보조 버튼을 살짝
  //   빗나간 탭이 조용히 다른 곳으로 데려가면 안 된다.
  $("intro").click();
  await tick(30);
  t("④ 배경을 탭해도 아무 데도 안 간다 (목적지가 둘이면 손가락이 고른다)",
    $("intro").hidden === false, texts(main()).slice(0, 3).join(" | "));
  보조.click();
  await tick(30);
  t("④ 답을 다시 걷지 않고 보던 자리로 돌아온다",
    질문중() === null && all(main(), (n) => hasClass(n, "tline__node")).length === 5,
    texts(main()).slice(0, 3).join(" | "));
  t("④ 기본 확인으로 되돌아가지 않는다 (재설문 플래그가 걷혔다)",
    !has(main(), "화재가 있었던 날짜와 지역을 알려주세요"));
}

// 재방문의 첫 화면에는 이 문이 없다 — 브릿지가 이미 도착 화면으로 데려간다.
{
  await 열기();
  t("④ 재방문 첫 화면은 브릿지다 (랜딩이 아니다)",
    $("intro").hidden === true && has(main(), "화재 발생 후"),
    texts(main()).slice(0, 3).join(" | "));
}

// 저장이 없는 사람에게는 **줄 자체가 없다**.
{
  configureStorage({ ...memoryBackend(), readJson }); // 새 사람
  await 열기();
  t("④ 저장이 없으면 되돌아가기가 없다",
    !button($("intro"), "그대로 두고 돌아가기") && Boolean(button($("intro"), "회복 시작하기")),
    texts($("intro")).join(" | "));
}

// ── 결과 ───────────────────────────────────────────
console.log(`\n${"=".repeat(62)}`);
console.log(failed ? `실패 ${failed}건` : "전부 통과");
console.log("=".repeat(62));
process.exit(failed ? 1 : 0);
