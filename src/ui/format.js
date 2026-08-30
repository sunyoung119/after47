// 표시 형식 — 값 하나를 화면 글자로 옮긴다. **DOM도 저장소도 모른다.**
//
// 여기 모으는 이유는 확정 화면이 자리마다 다른 형식을 쓰기 때문이다.
// 내 회복 경로 HOME의 칩은 `01일 03:00`이고 재방문 게이트는
// `1일 03시간 30분`이다. 형식을 화면 코드에 흩으면 둘이 서로를 모른 채
// 어긋나고, 어긋난 것을 계기판이 못 본다.
//
// ★ **UI는 기한·날짜를 만들어내지 않는다.** 여기 있는 것은 전부 이미
//   있는 값(화재 시각 · 지금)을 옮겨 적는 것뿐이다. `+7일`도 `○월 ○일까지`도
//   없다 — 엔진의 `this_week`는 실제 기한이 아니라 표시 버킷이라서,
//   UI가 날짜를 만들면 그 순간 거짓 기한이 된다.

export const pad2 = (n) => String(n).padStart(2, "0");

const parse = (v) => {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
};

// "2026.08.29" — 타임라인의 화재 발생일, 출처 카드의 확인일.
export function dotDate(iso) {
  const d = parse(iso);
  if (!d) return null;
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

// "14:30" — 화재 발생 시각. **없는 시각을 지어내지 않는다** —
// fire_at에 시각이 없으면 null이고 화면은 날짜만 그린다.
export function clockTime(iso) {
  const d = parse(iso);
  if (!d) return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "8월 30일" — 타임라인 '오늘' 노드의 보조 표시.
export function shortDate(iso) {
  const d = parse(iso);
  if (!d) return null;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 화재 이후 얼마나 지났나. **현재 시각 시계가 아니다**(확정 규칙) —
// 두 시점의 차이다. 미래 날짜를 넣어도 음수로 내려가지 않는다.
export function elapsedParts(fireAt, now = Date.now()) {
  const t0 = parse(fireAt);
  const t1 = parse(now);
  if (!t0 || !t1) return null;
  const min = Math.max(0, Math.floor((+t1 - +t0) / 6e4));
  return {
    days: Math.floor(min / 1440),
    hours: Math.floor((min % 1440) / 60),
    minutes: min % 60,
    totalMinutes: min,
  };
}

// HOME 상단 칩. 확정 화면의 형식은 `01일 03:00`이다 — 일은 두 자리로
// 채우고 시각은 시계 표기를 쓴다. 게이트의 `1일 03시간 30분`과 다른 것이
// 의도다(entry.js의 elapsedItems가 그쪽을 만든다).
//
// ★ **지금 화면에 없다.** 시각 FINAL이 HOME의 칩을 걷고 문장 안의
//   `화재 발생 후 1일 3시간`(아래 elapsedText)으로 바꿨다. 형식은 남겨
//   둔다 — 칩이 다시 필요해지면 여기가 그 자리다.
export function elapsedChip(fireAt, now = Date.now()) {
  const p = elapsedParts(fireAt, now);
  return p ? `${pad2(p.days)}일 ${pad2(p.hours)}:${pad2(p.minutes)}` : null;
}

// 문장 안에 들어가는 경과 — `1일 3시간`. HOME과 전환 화면이 쓴다.
//
// 게이트의 `1일 03시간 30분`과 달리 **분을 말하지 않고 자리를 채우지도
// 않는다.** 게이트는 그 숫자가 화면의 주인공이라 정확하고, 이쪽은 문장의
// 일부라 읽기 쉬운 쪽이 맞다(확정 화면 04·06).
//
// 하루가 안 지났으면 `3시간`, 한 시간도 안 지났으면 `30분`이다. `0일
// 0시간`은 진입 직후의 흔한 값인데 아무 말도 하지 않는 표기다.
export function elapsedText(fireAt, now = Date.now()) {
  const p = elapsedParts(fireAt, now);
  if (!p) return null;
  if (p.days > 0) return `${p.days}일 ${p.hours}시간`;
  if (p.hours > 0) return `${p.hours}시간`;
  return `${p.minutes}분`;
}

// "2026-08-29" — <input type="date">에 넣는 값. 로컬 시각 기준이다.
// toISOString을 쓰면 UTC로 밀려 하루가 어긋난다.
export function isoDay(iso) {
  const d = parse(iso);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 문장 안에서 몇 낱말만 굵게 — `경과 시간`과 `지역`처럼.
//
// **화면 코드가 문자열을 다시 뒤지지 않게** 여기서 조각으로 만든다.
// 강조어가 문장에 없으면 그냥 한 조각으로 돌아온다(빠뜨려도 화면은 산다).
export function splitEmphasis(text, words = []) {
  let parts = [{ text: String(text ?? ""), strong: false }];
  for (const w of words) {
    if (!w) continue;
    const next = [];
    for (const part of parts) {
      const i = part.strong ? -1 : part.text.indexOf(w);
      if (i < 0) {
        next.push(part);
        continue;
      }
      if (i > 0) next.push({ text: part.text.slice(0, i), strong: false });
      next.push({ text: w, strong: true });
      const rest = part.text.slice(i + w.length);
      if (rest) next.push({ text: rest, strong: false });
    }
    parts = next;
  }
  return parts;
}
