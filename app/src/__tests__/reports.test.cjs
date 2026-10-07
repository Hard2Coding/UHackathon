// Exercise the actual ReportsPage actions with a minimal hook host and mocked HTTP.
// The account/wallet kinds must survive handoff, editing and submission.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../Records.tsx"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true } },
).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));

function host(initial = {}) {
  const slots = [], effects = [], updates = [], requests = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || !deps || deps.some((value, i) => value !== previous.deps[i])) {
        effects[index] = { deps, cleanup: previous?.cleanup };
        updates.push(() => { effects[index].cleanup?.(); effects[index].cleanup = fn(); });
      }
    },
  };
  const marker = name => Object.assign(function Component() {}, { displayName: name });
  const Field = marker("Field"), Button = marker("Button"), Pressable = marker("Pressable");
  const modules = {
    react: hooks,
    "react-native": { View: marker("View"), Pressable, ActivityIndicator: marker("ActivityIndicator") },
    "lucide-react-native": new Proxy({}, { get: (_, name) => marker(String(name)) }),
    "expo-document-picker": {},
    "./api": {
      api: async route => { assert.equal(route, "/reports"); return { items: [] }; },
      post: async (route, body) => { assert.equal(route, "/reports"); requests.push({ route, body }); return { id: "test-report" }; },
      fileForm: async () => ({}),
    },
    "./ui": {
      Field, Button,
      ...Object.fromEntries(["Panel", "Txt", "Pill", "Note", "Empty", "Heading"].map(name => [name, marker(name)])),
      useUI: () => ({ english: false, c: {} }),
      useCopy: () => th => th,
      levelCopy: () => "", statusCopy: () => "",
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    assert(modules[name], "Unexpected import " + name);
    return modules[name];
  }, module, module.exports);
  let props = {
    user: { id: "report-test-user", name: "Test", email: "test@example.com", role: "user" },
    onLogin() { throw Error("Unexpected sign-in"); }, notify() {}, ...initial,
  };
  const render = () => {
    cursor = 0;
    const tree = module.exports.ReportsPage(props);
    while (updates.length) updates.shift()();
    return tree;
  };
  function find(node, type, predicate = () => true) {
    if (Array.isArray(node)) {
      for (const child of node) { const match = find(child, type, predicate); if (match) return match; }
      return null;
    }
    if (!React.isValidElement(node)) return null;
    return node.type === type && predicate(node.props) ? node : find(node.props.children, type, predicate);
  }
  const field = label => find(render(), Field, p => p.label === label);
  const kind = label => find(render(), Pressable, p => p.accessibilityLabel === label);
  const submit = () => find(render(), Button, p => p.children === "ส่งเบาะแสให้ตรวจสอบ").props.onPress();
  return { render, field, kind, submit, requests, update: next => { props = { ...props, ...next }; } };
}

async function main() {
  for (const [kind, value] of [["account", "1234567890"], ["wallet", "wallet-user-7"]]) {
    const h = host({ initialText: value, initialKind: kind });
    h.render(); await tick();
    h.field("รายละเอียดและบริบท").props.onChangeText("Evidence and context for review");
    await h.submit();
    assert.equal(h.requests[0].body.kind, kind, "Bare identifier must preserve its source kind");
    assert.equal(h.requests[0].body.text, value);
  }
  {
    const h = host(); h.render(); await tick();
    assert.equal(h.kind("ข้อความ").props.accessibilityState.checked, true, "Direct report defaults to text");
    h.field("ข้อความ ลิงก์ หรือเบาะแส").props.onChangeText("0812345678");
    h.kind("เบอร์โทร").props.onPress();
    h.field("รายละเอียดและบริบท").props.onChangeText("A detailed phone report for review");
    await h.submit();
    assert.equal(h.requests[0].body.kind, "phone", "Explicit user selection is submitted");
    assert.equal(h.requests[0].body.text, "0812345678");
  }
  {
    const h = host({ initialText: "older clue", initialKind: "text" }); h.render(); await tick();
    h.update({ initialText: "1234567890", initialKind: "account" }); h.render();
    assert.equal(h.field("ข้อความ ลิงก์ หรือเบาะแส").props.value, "1234567890");
    assert.equal(h.kind("บัญชี / พร้อมเพย์").props.accessibilityState.checked, true);
    h.update({ initialText: "", initialKind: "text" }); h.render();
    assert.equal(h.field("ข้อความ ลิงก์ หรือเบาะแส").props.value, "", "An empty replacement clears the previous input");
    assert.equal(h.kind("ข้อความ").props.accessibilityState.checked, true);
  }
  console.log("4 ReportsPage regressions passed: account/wallet kind, user selection and replacement handoff (mock hooks/HTTP; actual component actions).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
