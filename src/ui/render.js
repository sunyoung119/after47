// DOM 헬퍼 — 화면 코드가 공통으로 쓰는 두 함수.
//
// 6단계까지 이 파일은 가로 덱의 타임라인 페이지를 그렸다. 그 화면이
// 사라지면서(D-021 → D-023) 남은 것은 헬퍼뿐이다. 지운 것을 다시 쓰고
// 싶으면 git 이력을 보라 — 되살리지 말고 확정 화면부터 확인하라.
//
// ★ 저장소를 직접 만지지 않는다(D-002). 누수 탐지가 src/ 아래를 재귀로 훑는다.
// ★ 색값을 쓰지 않는다. 시각은 전부 tokens.css의 변수다.

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export const clear = (n) => {
  while (n.firstChild) n.removeChild(n.firstChild);
};

// 전화기 아이콘 — **`tel:` 링크에만 붙는다.**
//
// 아이콘은 "누르면 걸린다"는 약속이다. 안 걸리는 자리에 달면 거짓말이
// 되므로 번호 텍스트가 링크가 아닌 곳에는 쓰지 않는다.
//
// 인라인 SVG이고 `currentColor`를 쓴다 — 글자색을 그대로 따라가서
// 남색 면 위든 흰 면 위든 따로 손댈 곳이 없다. **이모지를 쓰지 않는다**:
// 기기마다 모양과 크기가 달라 같은 화면이 사람마다 달라진다.
//
// `createElementNS`가 필요하다 — `createElement("svg")`는 HTML 네임스페이스라
// 브라우저가 그리지 않는다.
const SVG_NS = "http://www.w3.org/2000/svg";
const HANDSET =
  "M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6" +
  ".6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1" +
  " 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z";

export const telIcon = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "telicon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("fill", "currentColor");
  // 번호 텍스트가 이미 링크 라벨이다. 아이콘은 읽지 않는다.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", HANDSET);
  svg.appendChild(path);
  return svg;
};
