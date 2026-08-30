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
