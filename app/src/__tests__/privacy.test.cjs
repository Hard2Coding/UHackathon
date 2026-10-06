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
function host() {
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
    HistoryPage = marker("HistoryPage");
  const delayed = {
    image: deferred(),
    analysis: deferred(),
    logout: deferred(),
  };
  const calls = [];
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
      Platform: { OS: "web" },
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
    "expo-document-picker": {},
    "expo-clipboard": {},
    "expo-sharing": {},
    "expo-file-system": {},
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
        if (route === "/image") return delayed.image.promise;
        throw Error("Unexpected API " + route);
      },
      post: async (route) => {
        calls.push(route);
        if (route === "/analyze") return delayed.analysis.promise;
        if (route === "/auth/logout") return delayed.logout.promise;
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
    "./src/Check": { Home, Checker: marker("Checker") },
    "./src/Result": { Result },
    "./src/GraphCanvas": { GraphCanvas: marker("GraphCanvas") },
    "./src/Records": { HistoryPage, ReportsPage: marker("ReportsPage") },
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
    delayed,
    calls,
    store,
    user,
  };
}
async function restored() {
  const h = host();
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
  console.log(
    "4 App privacy regressions passed (mock hooks/platform/HTTP; actual App actions).",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
