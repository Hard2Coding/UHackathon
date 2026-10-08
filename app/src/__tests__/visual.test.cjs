// Exercise the actual motion components against mocked platform/DOM lifecycle.
// This does not replace browser layout or native-device verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../visual.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const dashboardCompiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../Dashboard.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function runtime({ platform = 'web', reduced = false, fine = true, observerFails = false, nativeRead, historyRecords = [] } = {}) {
  let currentHost, rafId = 0;
  const frames = new Map(), visibilityListeners = new Set(), animations = [], observers = [];
  const nativeListeners = { reduce: new Set(), state: new Set() };
  const apiCalls = [];
  const query = matches => ({ matches, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } });
  const queries = { reduced: query(reduced), fine: query(fine) };
  const document = {
    visibilityState: 'visible',
    addEventListener: (_, fn) => visibilityListeners.add(fn),
    removeEventListener: (_, fn) => visibilityListeners.delete(fn),
  };
  const window = {
    matchMedia: name => {
      assert.equal(platform, 'web', 'Native components must not read browser media queries');
      return name.includes('reduced-motion') ? queries.reduced : queries.fine;
    },
    requestAnimationFrame: fn => { frames.set(++rafId, fn); return rafId; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const hooks = {
    ...React,
    useState(initial) {
      const h = currentHost, index = h.cursor++;
      if (!(index in h.slots)) h.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [h.slots[index].value, value => { h.slots[index].value = typeof value === 'function' ? value(h.slots[index].value) : value; }];
    },
    useRef(initial) {
      const h = currentHost, index = h.cursor++;
      if (!(index in h.slots)) h.slots[index] = { current: initial };
      return h.slots[index];
    },
    useId: () => 'test-id',
    useEffect(fn, deps) {
      const h = currentHost, index = h.cursor++, previous = h.effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        h.effects[index] = { deps, fn, cleanup: previous?.cleanup };
        h.pending.push(() => { h.effects[index].cleanup?.(); h.effects[index].cleanup = fn(); });
      }
    },
    useSyncExternalStore(subscribe, snapshot) {
      const h = currentHost, index = h.cursor++;
      if (!(index in h.slots)) h.slots[index] = { subscribe, cleanup: subscribe(() => {}) };
      return snapshot();
    },
  };
  const marker = name => Object.assign(function Component() {}, { displayName: name });
  const View = marker('View'), AnimatedView = marker('AnimatedView');
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() {}
    interpolate(options) { return options; }
  }
  const module = { exports: {} };
  const modules = {
    react: hooks,
    'react-native': {
      View, Pressable: marker('Pressable'), Platform: { OS: platform }, StyleSheet: { absoluteFillObject: { position: 'absolute' } },
      ActivityIndicator: marker('ActivityIndicator'), useWindowDimensions: () => ({ width: 1200, height: 900 }),
      Easing: { cubic: value => value, out: fn => fn },
      Animated: { View: AnimatedView, Value, timing: (value, options) => ({ start() { animations.push(options); value.setValue(1); }, stop() {} }) },
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => nativeRead ? nativeRead.promise : false,
        addEventListener: (_, fn) => { nativeListeners.reduce.add(fn); return { remove: () => nativeListeners.reduce.delete(fn) }; },
      },
      AppState: { addEventListener: (_, fn) => { nativeListeners.state.add(fn); return { remove: () => nativeListeners.state.delete(fn) }; } },
    },
    'react-native-svg': { __esModule: true, default: marker('Svg'), ...Object.fromEntries(['Circle', 'Defs', 'Ellipse', 'LinearGradient', 'Path', 'Rect', 'Stop', 'Polyline', 'Line'].map(name => [name, marker(name)])) },
    'lucide-react-native': new Proxy({}, { get: (_, name) => marker(String(name)) }),
    './ui': {
      ...Object.fromEntries(['Txt', 'Panel', 'Button', 'Field', 'Pill'].map(name => [name, marker(name)])),
      useUI: () => ({ dark: false, english: true, c: { soft: '#eee', teal: '#5743d6', line: '#ddd', card: '#fff', muted: '#666' } }),
      useCopy: () => (_, english) => english,
    },
    './Brand': { BrandMark: marker('BrandMark') },
    './Check': { Checker: marker('Checker'), examples: [] },
    './api': { api: async route => { apiCalls.push(route); return { items: historyRecords }; } },
  };
  class Observer {
    constructor(callback) { if (observerFails) throw Error('Unsupported observer'); this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  new Function('require', 'module', 'exports', 'window', 'document', 'IntersectionObserver', compiled)(
    name => { assert(modules[name], `Known module ${name}`); return modules[name]; }, module, module.exports, window, document, Observer,
  );
  modules['./visual'] = module.exports;
  const dashboardModule = { exports: {} };
  new Function('require', 'module', 'exports', dashboardCompiled)(name => { assert(modules[name], `Known dashboard module ${name}`); return modules[name]; }, dashboardModule, dashboardModule.exports);
  function attachRefs(node) {
    if (Array.isArray(node)) return node.forEach(attachRefs);
    if (!React.isValidElement(node)) return;
    const ref = node.props.ref;
    if (ref && !ref.current) ref.current = {
      style: { transform: '', opacity: '0', setProperty(name, value) { this[name] = value; } },
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 140 }),
    };
    attachRefs(node.props.children);
  }
  function mount(component, props = { children: 'Content' }) {
    const h = { slots: [], effects: [], pending: [], cursor: 0 };
    const instance = {
      render() {
        currentHost = h; h.cursor = 0;
        instance.tree = component(props); attachRefs(instance.tree);
        while (h.pending.length) h.pending.shift()();
        return instance.tree;
      },
      unmount() { h.effects.forEach(effect => effect?.cleanup?.()); h.slots.forEach(slot => slot?.cleanup?.()); },
      replayEffects() {
        h.effects.forEach(effect => effect?.cleanup?.());
        h.slots.forEach(slot => slot?.cleanup?.());
        h.slots.forEach(slot => { if (slot?.subscribe) slot.cleanup = slot.subscribe(() => {}); });
        h.effects.forEach(effect => { if (effect) effect.cleanup = effect.fn(); });
      },
    };
    instance.render();
    return instance;
  }
  return {
    ...module.exports, ...dashboardModule.exports, mount, window, document, queries, frames, animations, observers, nativeListeners, visibilityListeners, apiCalls,
    emit(query) { query.listeners.forEach(fn => fn()); },
    flushFrames() { const pending = [...frames]; frames.clear(); pending.forEach(([, fn]) => fn()); },
  };
}

const pointer = (type = 'mouse', x = 260, y = 95) => ({ nativeEvent: { pointerType: type, clientX: x, clientY: y } });
const movingNode = instance => instance.tree.props.children.props.ref.current;
{
  const r = runtime(), a = r.mount(r.InteractiveSurface), b = r.mount(r.InteractiveSurface);
  assert.equal(r.queries.reduced.listeners.size, 1);
  assert.equal(r.queries.fine.listeners.size, 1);
  assert.equal(r.visibilityListeners.size, 1, 'Surfaces share global preference listeners');
  a.tree.props.onPointerMove(pointer());
  a.tree.props.onPointerMove(pointer('mouse', 230, 125));
  assert.equal(r.frames.size, 1, 'Many pointer events coalesce into one frame');
  r.flushFrames();
  assert.match(movingNode(a).style.transform, /perspective/);
  assert.equal(a.tree.props.ref.current.style.transform, '', 'The hit-test and measurement target never moves');
  a.tree.props.onPointerMove(pointer());
  a.tree.props.onPointerLeave();
  assert.equal(r.frames.size, 0, 'Pointer leave cancels scheduled movement');
  assert.equal(movingNode(a).style.transform, '');
  a.unmount(); assert.equal(r.queries.reduced.listeners.size, 1);
  b.unmount(); assert.equal(r.queries.reduced.listeners.size, 0); assert.equal(r.visibilityListeners.size, 0);
}
{
  const r = runtime(), surface = r.mount(r.InteractiveSurface);
  surface.tree.props.onPointerMove(pointer('touch'));
  assert.equal(r.frames.size, 0, 'A touch event never tilts even on a hybrid desktop');
  surface.tree.props.onPointerMove(pointer());
  r.queries.reduced.matches = true; r.emit(r.queries.reduced);
  r.flushFrames();
  assert.equal(movingNode(surface).style.transform, '', 'A preference change stops pending movement before React rerenders');
  surface.render();
  assert.equal(surface.tree.props.onPointerMove, undefined);
  surface.unmount();
}
{
  const r = runtime({ fine: false }), surface = r.mount(r.InteractiveSurface);
  assert.equal(surface.tree.props.onPointerMove, undefined, 'A coarse-pointer browser stays static');
  surface.unmount();
  const native = runtime({ platform: 'ios' }), a = native.mount(native.InteractiveSurface), b = native.mount(native.MotionView);
  assert.equal(a.tree.props.onPointerMove, undefined);
  assert.equal(native.frames.size, 0);
  assert.equal(native.queries.reduced.listeners.size, 0);
  assert.equal(native.nativeListeners.reduce.size, 1, 'Native OS listeners are also shared');
  a.unmount(); b.unmount(); assert.equal(native.nativeListeners.reduce.size, 0);
}
{
  const r = runtime(), surface = r.mount(r.InteractiveSurface);
  surface.tree.props.onPointerMove(pointer());
  r.document.visibilityState = 'hidden'; r.visibilityListeners.forEach(fn => fn());
  r.flushFrames();
  assert.equal(movingNode(surface).style.transform, '', 'Background pages do not run queued pointer motion');
  surface.render(); surface.unmount(); assert.equal(r.frames.size, 0);
}
{
  const r = runtime(), view = r.mount(r.MotionView, { children: 'Content', delay: 900 });
  assert.equal(r.animations.length, 0);
  r.observers[0].callback([{ isIntersecting: true }]);
  r.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(r.animations.length, 1, 'Scroll entrances play once');
  assert.equal(r.animations[0].delay, 240, 'Entrances cannot add long waits');
  assert.ok(r.observers[0].disconnected);
  view.unmount();
  const fallback = runtime({ observerFails: true }), visible = fallback.mount(fallback.MotionView);
  assert.equal(fallback.animations.length, 1, 'Observer failure cannot leave content hidden');
  visible.unmount();
}
function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}
function findAll(node, predicate, output = []) {
  if (Array.isArray(node)) { node.forEach(child => findAll(child, predicate, output)); return output; }
  if (!React.isValidElement(node)) return output;
  if (predicate(node)) output.push(node);
  findAll(node.props.children, predicate, output);
  return output;
}
async function additionalChecks() {
  {
    for (const platform of ['ios', 'android']) {
      const r = runtime({ platform });
      const preferences = r.mount(() => r.useMotionPreferences());
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(preferences.render().reduceMotion, false);
      const props = { children: 'Check form', style: { padding: 18 } };
      const screen = r.mount(r.MotionView, props);
      assert.equal(screen.tree.type.displayName, 'View');
      assert.deepEqual(screen.tree.props.style, props.style);
      props.children = 'Risk result';
      const result = screen.render();
      assert.equal(result.type.displayName, 'View', 'Native form-to-result replacement must not retain an animated opacity container');
      assert.equal(result.props.children, 'Risk result');
      assert.equal(r.animations.length, 0, 'Native result rendering never waits for a decorative entrance');
      assert.equal(r.observers.length, 0);
      screen.unmount(); preferences.unmount();
    }
  }
  {
    const initialRead = deferred(), r = runtime({ platform: 'ios', nativeRead: initialRead });
    const preference = r.mount(() => r.useMotionPreferences());
    r.nativeListeners.reduce.forEach(fn => fn(true));
    assert.equal(preference.render().reduceMotion, true);
    initialRead.resolve(false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(preference.render().reduceMotion, true, 'An older initial native query cannot undo a newer OS setting');
    preference.unmount();
  }
  {
    const r = runtime(), surface = r.mount(r.InteractiveSurface);
    movingNode(surface).getBoundingClientRect = () => { throw Error('Moving layer must never supply pointer geometry'); };
    surface.tree.props.onPointerMove(pointer('mouse', 199, 189));
    r.flushFrames();
    assert.equal(surface.tree.props.ref.current.style.transform, '');
    assert.match(movingNode(surface).style.transform, /translateY/);
    const layers = React.Children.toArray(surface.tree.props.children.props.children);
    const style = element => Object.assign({}, ...element.props.style);
    assert.equal(style(layers[0]).zIndex, 0);
    assert.equal(layers[0].props.pointerEvents, 'none');
    assert.equal(style(layers[1]).zIndex, 1, 'Foreground text and focus borders are painted above decorative glow');
    surface.tree.props.onPointerMove(pointer());
    surface.unmount(); assert.equal(r.frames.size, 0, 'Unmount cancels the active surface frame');
  }
  {
    const r = runtime(), entrance = r.mount(r.MotionView);
    const staleObserver = r.observers[0];
    entrance.replayEffects();
    staleObserver.callback([{ isIntersecting: true }]);
    assert.equal(r.animations.length, 0, 'An observer queued before StrictMode cleanup cannot reveal afterwards');
    r.observers[1].callback([{ isIntersecting: true }]);
    assert.equal(r.animations.length, 1);
    assert.equal(r.queries.reduced.listeners.size, 1, 'StrictMode replay keeps only one global listener');
    entrance.unmount(); assert.equal(r.queries.reduced.listeners.size, 0);
  }
  {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const r = runtime({ historyRecords: [
      { created_at: today.toISOString(), level: 'LOW' },
      { created_at: today.toISOString(), level: 'HIGH' },
      { created_at: yesterday.toISOString(), level: 'MEDIUM' },
    ] });
    const checker = { text: '', kind: 'text', busy: false, setText() {}, setKind() {}, analyze() {}, media() {} };
    const home = r.mount(r.Home, { user: { id: 'chart-user', name: 'Test' }, checker, onExample() {}, onGo() {}, health: {} });
    await new Promise(resolve => setImmediate(resolve));
    const buttons = () => findAll(home.render(), node => node.props.accessibilityHint === "Select to inspect this date's chart point");
    assert.equal(buttons().length, 7);
    assert.match(buttons()[6].props.accessibilityLabel, /2 saved items/);
    buttons()[6].props.onFocus();
    let point = findAll(home.render(), node => node.type.displayName === 'Circle' && node.props.r === 5)[0];
    assert.equal(point.props.cx, 278); assert.equal(point.props.cy, 22);
    assert(findAll(home.render(), node => typeof node.props.children === 'string' && node.props.children.includes('2 saved items')).length);
    buttons()[5].props.onHoverIn();
    point = findAll(home.render(), node => node.type.displayName === 'Circle' && node.props.r === 5)[0];
    assert.equal(point.props.cx, 234); assert.equal(point.props.cy, 49);
    buttons()[0].props.onPress();
    assert(findAll(home.render(), node => typeof node.props.children === 'string' && node.props.children.includes('0 saved items')).length, 'Touch/press can select a real zero-count day');
    assert.deepEqual(r.apiCalls, ['/history'], 'Chart interactions never fetch or invent extra records');
    home.unmount();
  }
  console.log('10 motion/dashboard lifecycle checks passed (actual components; mocked platform/DOM/HTTP).');
}
additionalChecks().catch(error => { console.error(error); process.exitCode = 1; });
