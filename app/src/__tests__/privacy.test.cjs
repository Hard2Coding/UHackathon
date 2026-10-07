// Run the actual App state/actions with a minimal hook host and delayed HTTP.
// This is a client state regression, not a browser/native-device test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../../App.tsx"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
}
function host(options = {}) {
  const slots = [],
    effects = [],
    updates = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (
        !previous ||
        !deps ||
        deps.some((value, i) => value !== previous.deps[i])
      ) {
        effects[index] = { deps, cleanup: previous?.cleanup };
        updates.push(() => {
          effects[index].cleanup?.();
          effects[index].cleanup = fn();
        });
      }
    },
  };
  const marker = (name) =>
    Object.assign(function Component() {}, { displayName: name });
  const Home = marker("Home"),
    SettingsPage = marker("SettingsPage"),
    LoginScreen = marker("LoginScreen"),
    Result = marker("Result"),
    HistoryPage = marker("HistoryPage"),
    ReportsPage = marker("ReportsPage"),
    Checker = marker("Checker");
  const delayed = {
    image: deferred(),
    analysis: deferred(),
    logout: deferred(),
    batchExport: deferred(),
  };
  const calls = [];
  const requests = [], downloads = [], shares = [], nativeFiles = [];
  const analyses = options.analyses || [delayed.analysis];
  const batchJobs = options.batchJobs || [];
  let sharingChecks = 0;
  let savedHistory;
  const user = {
    id: "privacy-user",
    name: "Test",
    email: "test@example.com",
    role: "user",
  };
  const store = new Map([["scamgraph-token", "test-token"]]);
  const c = {
    bg: "#050b18",
    card: "#0d172a",
    ink: "#fff",
    muted: "#aaa",
    line: "#234",
    soft: "#123",
    teal: "#987",
    tealDark: "#654",
    nav: "#123",
  };
  const modules = {
    react: hooks,
    "react-native": {
      View: marker("View"),
      ScrollView: marker("ScrollView"),
      Pressable: marker("Pressable"),
      Modal: marker("Modal"),
      Image: marker("Image"),
      ActivityIndicator: marker("ActivityIndicator"),
      Platform: { OS: options.platform || "web" },
      Share: {},
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    "expo-status-bar": { StatusBar: marker("StatusBar") },
    "react-native-safe-area-context": {
      SafeAreaProvider: marker("SafeAreaProvider"),
      SafeAreaView: marker("SafeAreaView"),
    },
    "@expo-google-fonts/noto-sans-thai": {
      useFonts: () => [true],
      NotoSansThai_400Regular: 1,
      NotoSansThai_500Medium: 2,
      NotoSansThai_700Bold: 3,
    },
    "expo-image-picker": {
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ uri: "test://private-image", fileSize: 10 }],
      }),
    },
    "expo-document-picker": { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "test://batch.csv", name: "batch.csv" }] }) },
    "expo-clipboard": { setStringAsync: async value => { shares.push({ text: value }); } },
    "expo-sharing": {
      isAvailableAsync: async () => {
        sharingChecks++;
        return options.sharingAvailable ? options.sharingAvailable.promise : true;
      },
      shareAsync: async uri => { shares.push({ uri }); },
    },
    "expo-file-system": {
      Paths: { cache: "test://cache" },
      File: class {
        constructor(base, name) { this.uri = `${base}/${name}`; }
        create() { nativeFiles.push(this); }
        write(contents) { this.contents = contents; }
      },
    },
    "expo-linking": {
      addEventListener: () => ({ remove() {} }),
      getInitialURL: async () => null,
    },
    "expo-camera": {
      CameraView: marker("CameraView"),
      useCameraPermissions: () => [
        { granted: true },
        async () => ({ granted: true }),
      ],
    },
    "lucide-react-native": new Proxy(
      {},
      { get: (_, name) => marker(String(name)) },
    ),
    "./src/visual": { MotionView: marker("MotionView"), GradientSurface: marker("GradientSurface") },
    "./src/Support": { HelpPage: marker("HelpPage"), AlertsPage: marker("AlertsPage"), WebappPanel: marker("WebappPanel") },
    "./src/webapp": { useWebapp: () => ({ isWeb: false, online: true, install() {}, applyUpdate() {} }) },
    "./src/ui": {
      UIContext: React.createContext({}),
      palette: { light: c, dark: c },
      ...Object.fromEntries(
        [
          "Txt",
          "Button",
          "Panel",
          "Field",
          "Pill",
          "Note",
          "Empty",
          "Heading",
        ].map((name) => [name, marker(name)]),
      ),
      useCopy: () => (th) => th,
      levelCopy: () => "",
      statusCopy: () => "",
    },
    "./src/api": {
      api: async (route) => {
        calls.push(route);
        if (route === "/auth/me") return user;
        if (route === "/health") return {};
        if (route === "/auth/export") return { private_profile: "previous account data" };
        if (route === "/image") return delayed.image.promise;
        if (route === "/batch") {
          if (!batchJobs.length) throw Error("No queued batch response");
          return batchJobs.shift();
        }
        if (route.startsWith("/jobs/") && route.endsWith("/export")) return delayed.batchExport.promise;
        if (route.startsWith("/history/") && route.endsWith("/share")) return { result: savedHistory.result };
        throw Error("Unexpected API " + route);
      },
      post: async (route, body) => {
        calls.push(route);
        requests.push({ route, body });
        if (route === "/analyze") {
          const next = analyses.shift();
          if (!next) throw Error("No queued analysis response");
          return next.promise;
        }
        if (route === "/auth/logout") return delayed.logout.promise;
        if (route === "/export") return { result: { id: "masked-result", summary: body.text, level: "MEDIUM", score: 45, entities: [] } };
        if (route === "/history") {
          savedHistory = options.historySave
            ? await options.historySave.promise
            : { id: "saved-history", result: { id: "saved-analysis", summary: body.text } };
          return savedHistory;
        }
        if (route === "/feedback") return {};
        throw Error("Unexpected POST " + route);
      },
      setAuthToken() {},
      fileForm: async () => ({}),
    },
    "./src/storage": {
      storage: {
        get: async (key) => store.get(key) || null,
        set: async (key, value) => {
          store.set(key, value);
        },
        remove: async (key) => {
          store.delete(key);
        },
      },
    },
    "./src/social": {
      finishOAuthRedirect: async () => null,
      isOAuthCallback: () => false,
      hasOAuthRetry: async () => false,
      retryOAuthExchange: async () => null,
      clearOAuthState: async () => {},
      authErrorMessage: (message) => message,
    },
    "./src/callerSync": { useCallerEvidenceRefresh() {} },
    "./src/Check": { Home, Checker },
    "./src/Result": { Result },
    "./src/GraphCanvas": { GraphCanvas: marker("GraphCanvas") },
    "./src/Records": { HistoryPage, ReportsPage },
    "./src/Account": { SettingsPage, AuthModal: marker("AuthModal") },
    "./src/LoginScreen": { LoginScreen },
    "./src/Brand": { BrandMark: marker("BrandMark") },
    "./src/Admin": { AdminPage: marker("AdminPage") },
  };
  const module = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "location",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "document",
    "navigator",
    "URL",
    compiled,
  )(
    (name) => {
      if (!modules[name]) throw Error("Unexpected import " + name);
      return modules[name];
    },
    module,
    module.exports,
    { href: "http://localhost:8081/" },
    () => 1,
    () => {},
    () => 1,
    () => {},
    { createElement: () => ({ click() {} }) },
    { share: async value => { shares.push(value); } },
    class extends URL {
      static createObjectURL(blob) { downloads.push(blob); return "blob:test"; }
      static revokeObjectURL() {}
    },
  );
  const App = module.exports.default;
  const render = () => {
    cursor = 0;
    const tree = App();
    while (updates.length) updates.shift()();
    return tree;
  };
  function find(tree, type) {
    if (!tree) return null;
    if (Array.isArray(tree)) {
      for (const child of tree) {
        const found = find(child, type);
        if (found) return found;
      }
      return null;
    }
    if (!React.isValidElement(tree)) return null;
    return tree.type === type ? tree : find(tree.props.children, type);
  }
  return {
    render,
    find,
    Home,
    SettingsPage,
    LoginScreen,
    Result,
    HistoryPage,
    ReportsPage,
    Checker,
    delayed,
    calls,
    requests,
    downloads,
    shares,
    nativeFiles,
    sharingChecks: () => sharingChecks,
    store,
    user,
  };
}
async function restored(options) {
  const h = host(options);
  h.render();
  await tick();
  await tick();
  assert(h.find(h.render(), h.Home), "Account session is restored");
  return h;
}
async function signOut(h) {
  h.find(h.render(), h.Home).props.onGo("settings");
  const exiting = h.find(h.render(), h.SettingsPage).props.onLogout();
  await tick();
  assert(
    h.find(h.render(), h.LoginScreen),
    "Local sign-out is immediate even while server revocation is pending",
  );
  assert.equal(h.store.has("scamgraph-token"), false);
  h.delayed.logout.resolve({});
  await exiting;
  h.find(h.render(), h.LoginScreen).props.onGuest();
}
function go(h, label) {
  function findAction(node) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findAction(child);
        if (found) return found;
      }
      return null;
    }
    if (!React.isValidElement(node)) return null;
    if ((node.props.accessibilityLabel === label || node.props.children === label) && node.props.onPress) return node;
    return findAction(node.props.children);
  }
  const action = findAction(h.render());
  assert(action, `Navigation ${label} is present`);
  return action.props.onPress();
}
async function main() {
  {
    const h = await restored();
    const uploading = h.find(h.render(), h.Home).props.checker.media("image");
    await tick();
    assert(h.calls.includes("/image"));
    await signOut(h);
    h.delayed.image.resolve({
      extracted_text: "PRIVATE OCR FROM PREVIOUS USER",
      status: "ready",
    });
    await uploading;
    const home = h.find(h.render(), h.Home);
    assert(home, "Guest stays on home");
    assert.equal(home.props.checker.text, "");
    const tree = h.render();
    const visible = [];
    function visit(node) {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!React.isValidElement(node)) return;
      if (node.type.displayName === "Modal" && node.props.visible)
        visible.push(node);
      visit(node.props.children);
    }
    visit(tree);
    assert.equal(
      visible.length,
      0,
      "Late private OCR must not reopen a preview after logout",
    );
  }
  {
    const h = await restored();
    h.find(h.render(), h.Home).props.checker.setText(
      "PRIVATE TEXT FROM PREVIOUS USER",
    );
    const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
    await tick();
    assert(h.calls.includes("/analyze"));
    await signOut(h);
    h.delayed.analysis.resolve({
      id: "late-analysis",
      summary: "PRIVATE TEXT FROM PREVIOUS USER",
    });
    await analyzing;
    const tree = h.render();
    assert(
      h.find(tree, h.Home),
      "Late analysis must not navigate into a prior result",
    );
    assert.equal(h.find(tree, h.Home).props.checker.text, "");
    assert.equal(h.find(tree, h.Result), null);
  }
  {
    const h = await restored();
    h.find(h.render(), h.Home).props.onGo("settings");
    const oldProfileCallback = h.find(h.render(), h.SettingsPage).props
      .onUserUpdate;
    h.find(h.render(), h.SettingsPage).props.onLogout();
    await tick();
    oldProfileCallback({ ...h.user, name: "PRIVATE PREVIOUS PROFILE" });
    assert(
      h.find(h.render(), h.LoginScreen),
      "Late profile save must not restore a signed-out identity",
    );
    h.delayed.logout.resolve({});
  }
  {
    const h = await restored();
    h.find(h.render(), h.Home).props.onGo("history");
    const oldHistoryCallback = h.find(h.render(), h.HistoryPage).props.onOpen;
    h.find(h.render(), h.HistoryPage).props.onLogin();
    // Navigate through a fresh Home action to obtain the real Settings logout.
    const nav = (node) => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = nav(child);
          if (found) return found;
        }
        return null;
      }
      if (!React.isValidElement(node)) return null;
      if (node.props.accessibilityLabel === "หน้าหลัก" && node.props.onPress)
        return node;
      return nav(node.props.children);
    };
    nav(h.render()).props.onPress();
    await signOut(h);
    oldHistoryCallback(
      { id: "private-history" },
      "PRIVATE HISTORY FROM PREVIOUS USER",
      "text",
      "old-history",
    );
    assert(
      h.find(h.render(), h.Home),
      "Late private history must not reopen after logout",
    );
    assert.equal(h.find(h.render(), h.Home).props.checker.text, "");
  }
  {
    const first = deferred(), second = deferred();
    const h = await restored({ analyses: [first, second] });
    h.find(h.render(), h.Home).props.checker.setText("  ORIGINAL RESULT A  ");
    const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
    first.resolve({ id: "analysis-a", summary: "Result A", level: "MEDIUM", score: 66 });
    await analyzing;
    const originalActions = h.find(h.render(), h.Result).props;
    await originalActions.onExport();
    await originalActions.onShare();
    assert.deepEqual(h.requests.filter(x => x.route === "/export").map(x => x.body), [
      { text: "ORIGINAL RESULT A", kind: "text" },
      { text: "ORIGINAL RESULT A", kind: "text" },
    ], "Export and share use exactly the input accepted for the displayed result");
    assert.equal(JSON.parse(await h.downloads[0].text()).result.summary, "ORIGINAL RESULT A");
    assert.ok(h.shares[0].text.includes("ORIGINAL RESULT A"));
    originalActions.onReport();
    assert.equal(h.find(h.render(), h.ReportsPage).props.initialText, "ORIGINAL RESULT A");
    go(h, "หน้าหลัก");
    h.find(h.render(), h.Home).props.checker.setText("A DIFFERENT DRAFT B");
    go(h, "ตรวจสอบ");
    assert.equal(h.find(h.render(), h.Result), null, "Editing Home must remove the old result before Scan is opened");
    assert.equal(h.find(h.render(), h.Checker).props.text, "A DIFFERENT DRAFT B");
    const previousRequests = h.requests.length;
    await originalActions.onSave();
    await originalActions.onExport();
    await originalActions.onShare();
    originalActions.onReport();
    assert.equal(h.requests.length, previousRequests, "Actions captured from a replaced result cannot save/export/share another draft");
    assert.equal(h.find(h.render(), h.ReportsPage), null, "A stale report action cannot submit the newer draft");
    const nextAnalysis = h.find(h.render(), h.Checker).props.analyze();
    second.resolve({ id: "analysis-b", summary: "Result B" });
    await nextAnalysis;
    const currentActions = h.find(h.render(), h.Result).props;
    await currentActions.onSave();
    assert.deepEqual(h.requests.find(x => x.route === "/history").body, { text: "A DIFFERENT DRAFT B", kind: "text" });
    h.find(h.render(), h.Result).props.onReport();
    assert.equal(h.find(h.render(), h.ReportsPage).props.initialText, "A DIFFERENT DRAFT B");
  }
  {
    const h = await restored();
    h.find(h.render(), h.Home).props.checker.setText("OTP message under review");
    const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
    h.find(h.render(), h.Home).props.checker.setKind("phone");
    h.delayed.analysis.resolve({ id: "old-text-result", summary: "Outdated text analysis" });
    await analyzing;
    assert(h.find(h.render(), h.Home), "Changing the input type must keep the current page");
    assert.equal(h.find(h.render(), h.Home).props.checker.kind, "phone");
    assert.equal(h.find(h.render(), h.Home).props.checker.busy, false);
    go(h, "ตรวจสอบ");
    assert.equal(h.find(h.render(), h.Result), null, "A response for the previous input type cannot reopen its result");
  }
  {
    const first = deferred(), second = deferred();
    const h = await restored({ analyses: [first, second] });
    h.find(h.render(), h.Home).props.checker.setText("Older request A");
    const older = h.find(h.render(), h.Home).props.checker.analyze();
    h.find(h.render(), h.Home).props.checker.setText("0812345678");
    h.find(h.render(), h.Home).props.checker.setKind("phone");
    const newer = h.find(h.render(), h.Home).props.checker.analyze();
    second.resolve({ id: "newer-phone", summary: "Unknown phone" });
    await newer;
    first.resolve({ id: "older-text", summary: "Old text result" });
    await older;
    assert.equal(h.find(h.render(), h.Result).props.result.id, "newer-phone", "A slower earlier request cannot replace the latest analysis");
    await h.find(h.render(), h.Result).props.onSave();
    assert.deepEqual(h.requests.find(x => x.route === "/history").body, { text: "0812345678", kind: "phone" });
  }
  {
    const saved = deferred();
    const h = await restored({ historySave: saved });
    h.find(h.render(), h.Home).props.checker.setText("Saved request A");
    const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
    h.delayed.analysis.resolve({ id: "save-a", summary: "Original A" });
    await analyzing;
    const saving = h.find(h.render(), h.Result).props.onSave();
    go(h, "หน้าหลัก");
    h.find(h.render(), h.Home).props.checker.setText("New draft B while save is pending");
    saved.resolve({ id: "saved-a", result: { id: "saved-analysis-a", summary: "Original A" } });
    await saving;
    assert.equal(h.find(h.render(), h.Home).props.checker.text, "New draft B while save is pending");
    go(h, "ตรวจสอบ");
    assert.equal(h.find(h.render(), h.Result), null, "An earlier Save response cannot reopen its result over a newer draft");
  }
  {
    const h = await restored();
    h.find(h.render(), h.Home).props.checker.setText("1234567890");
    h.find(h.render(), h.Home).props.checker.setKind("account");
    const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
    h.delayed.analysis.resolve({ id: "account-result", summary: "Unverified account" });
    await analyzing;
    h.find(h.render(), h.Result).props.onReport();
    const report = h.find(h.render(), h.ReportsPage);
    assert.equal(report.props.initialText, "1234567890");
    assert.equal(report.props.initialKind, "account", "Reporting a bare account preserves its entity type");
  }
  for (const mode of ["result-logout", "profile-logout", "result-replaced"]) {
    const availability = deferred();
    const h = await restored({ platform: "ios", sharingAvailable: availability });
    let exporting;
    if (mode === "profile-logout") {
      h.find(h.render(), h.Home).props.onGo("settings");
      exporting = h.find(h.render(), h.SettingsPage).props.onExport();
    } else {
      h.find(h.render(), h.Home).props.checker.setText("Private result from previous view");
      const analyzing = h.find(h.render(), h.Home).props.checker.analyze();
      h.delayed.analysis.resolve({ id: "native-export-result", summary: "Private content" });
      await analyzing;
      exporting = h.find(h.render(), h.Result).props.onExport();
    }
    await tick();
    assert.equal(h.sharingChecks(), 1, "Export is waiting for native sharing availability");
    go(h, "หน้าหลัก");
    if (mode === "result-replaced") h.find(h.render(), h.Home).props.checker.setText("Replacement draft");
    else await signOut(h);
    availability.resolve(mode !== "profile-logout"); // also exercise clipboard fallback cancellation
    await exporting;
    assert.equal(h.shares.length, 0, `${mode}: late native availability must not share or copy private content`);
    assert.equal(h.nativeFiles.length, 0, `${mode}: cancelled export must not create a private cache file`);
  }
  for (const mode of ["logout", "job-replaced"]) {
    const job = id => ({ id, status: "completed", progress: 100, result: { items: [] } });
    const h = await restored({ batchJobs: [job("batch-old"), job("batch-new")] });
    await h.find(h.render(), h.Home).props.checker.media("batch");
    const exporting = go(h, "ส่งออกผลแบบปกปิด");
    await tick();
    assert(h.calls.includes("/jobs/batch-old/export"));
    if (mode === "logout") await signOut(h);
    else await h.find(h.render(), h.Home).props.checker.media("batch");
    h.delayed.batchExport.resolve({ private_batch: "previous job content" });
    await exporting;
    assert.equal(h.downloads.length, 0, `${mode}: a late export response cannot download an obsolete private batch`);
  }
  console.log(
    "14 App state regressions passed: 4 privacy + 4 result/input integrity + report kind + 5 export cancellation cases (mock hooks/platform/HTTP; actual App actions).",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
