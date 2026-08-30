// 브라우저 없이 화면을 밟기 위한 최소 DOM.
//
// **진짜 브라우저가 아니다.** 레이아웃도 CSS도 없다. 여기서 잡는 것은
// "탭하면 다음 화면이 그려지는가 · 그 화면에 무엇이 있는가"이고,
// 여백·색·줄바꿈은 실기기 확인의 몫이다.
//
// app.js가 실제로 부르는 것만 구현한다. 없는 것을 만나면 그 자리에서
// 터지는 편이 낫다 — 조용히 통과하면 walk가 아무것도 못 본다.

class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.className = "";
    this.children = [];
    this.parent = null;
    this.own = ""; // 이 노드가 직접 가진 글자
    this.hidden = false;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.type = "";
    this.value = "";
    this.disabled = false;
    this.selected = false;
    this.open = false;
    this.id = "";
    this.href = "";
    const self = this;
    this.classList = {
      add: (...c) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const x of c) set.add(x);
        self.className = [...set].join(" ");
      },
      remove: (...c) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const x of c) set.delete(x);
        self.className = [...set].join(" ");
      },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }

  // textContent는 "이 노드의 글자 + 자식들의 글자"다. 실제 DOM과 같게,
  // 대입하면 자식이 통째로 날아간다.
  get textContent() {
    return this.own + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this.own = v == null ? "" : String(v);
    for (const c of this.children) c.parent = null;
    this.children = [];
  }

  // 실제 DOM의 childNodes에는 글자 노드도 들어가지만, 이 스텁에서 글자는
  // own이고 여기 쓰는 곳(빈 컨테이너에 chip을 붙였나)에는 own이 없다.
  get childNodes() {
    return this.children;
  }

  get firstChild() {
    if (this.own) return { __text: true };
    return this.children[0] ?? null;
  }

  appendChild(c) {
    if (!c) throw new Error("appendChild(null)");
    c.parent = this;
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    if (c && c.__text) {
      this.own = "";
      return c;
    }
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    if (c) c.parent = null;
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  // 탭. 실제 브라우저처럼 조상으로 올라간다(랜딩이 화면 전체 탭을 받는다).
  dispatch(ev) {
    let stopped = false;
    const e = { type: ev, target: this, stopPropagation: () => (stopped = true) };
    for (let n = this; n; n = n.parent) {
      for (const fn of n.listeners[ev] || []) fn(e);
      if (stopped) break;
    }
  }
  click() {
    if (this.disabled) throw new Error(`disabled를 눌렀다: ${this.textContent}`);
    this.dispatch("click");
  }
  change(v) {
    if (v !== undefined) this.value = v;
    this.dispatch("change");
  }
  querySelector() {
    return null;
  }
}

export function installDom() {
  const byId = new Map();
  // 이벤트(지금은 popstate 하나)와 히스토리 스택. **진짜 브라우저가
  // 아니지만 앞뒤 관계는 진짜와 같아야 한다** — 기기 뒤로가기가 앱 이전과
  // 맞는지를 보는 검사가 여기 얹힌다.
  const listeners = {};
  const hist = { entries: [{ state: null }], i: 0 };
  const doc = {
    createElement: (tag) => new Node(tag),
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: () => null,
    createRange: () => ({ selectNodeContents() {} }),
    body: new Node("body"),
  };
  // index.html의 뼈대. 여기 없는 id를 app.js가 찾으면 그 자리에서 터진다.
  for (const id of ["intro", "flow", "brand", "top-right", "banners", "main", "save-notice", "expires"]) {
    const n = new Node(id === "main" ? "main" : "div");
    n.id = id;
    n.hidden = id === "intro" || id === "flow" || id === "save-notice";
    byId.set(id, n);
  }
  globalThis.document = doc;
  globalThis.location = { origin: "https://example.test", pathname: "/", href: "https://example.test/" };
  globalThis.history = {
    get state() {
      return hist.entries[hist.i].state;
    },
    get length() {
      return hist.entries.length;
    },
    // 앞으로 가지 않는다 — 새 칸을 쌓으면 뒤쪽은 버린다(브라우저와 같다).
    pushState(state) {
      hist.entries.splice(hist.i + 1);
      hist.entries.push({ state });
      hist.i += 1;
    },
    replaceState(state) {
      hist.entries[hist.i] = { state };
    },
  };
  globalThis.addEventListener = (ev, fn) => {
    (listeners[ev] ||= []).push(fn);
  };
  globalThis.getSelection = () => ({ removeAllRanges() {}, addRange() {} });

  // 기기 뒤로가기. 맨 앞 칸에서 누르면 **앱 밖으로 나간다** — 그것을
  // 막지 않는 것이 규칙이라, 여기서도 막지 않고 나갔다고 알려준다.
  const back = () => {
    if (hist.i === 0) return { left: true, state: null };
    hist.i -= 1;
    const state = hist.entries[hist.i].state;
    for (const fn of listeners.popstate || []) fn({ state });
    return { left: false, state };
  };
  // 스택을 건드리지 않고 핸들러만 때린다(최초 엔트리 바깥을 흉내 낸다).
  const popstate = (state) => {
    for (const fn of listeners.popstate || []) fn({ state });
  };

  return { doc, byId, hist, back, popstate, depth: () => hist.entries.length, reset: () => installDom() };
}

// ── 훑기 도구 ──────────────────────────────────────

export function walk(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}

export const all = (root, pred) => walk(root).filter(pred);

export const hasClass = (n, c) => n.className.split(/\s+/).includes(c);

// 정확히 이 글자를 가진 버튼. 화면에서 사람이 누르는 것과 같은 기준이다.
export function button(root, label) {
  return (
    all(root, (n) => n.tagName === "BUTTON" && n.textContent.trim() === label)[0] ?? null
  );
}
export function buttonLike(root, part) {
  return all(root, (n) => n.tagName === "BUTTON" && n.textContent.includes(part))[0] ?? null;
}
export const has = (root, part) => walk(root).some((n) => n.own.includes(part));
export const texts = (root) => walk(root).map((n) => n.own).filter(Boolean);

// 비동기 저장을 기다린다. 선택 피드백(150~250ms) 뒤 전환도 여기서 지나간다.
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
