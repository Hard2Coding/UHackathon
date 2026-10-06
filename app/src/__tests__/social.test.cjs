// Run: node app/src/__tests__/social.test.cjs
// Compile the real social.ts module; platform/storage/HTTP/browser are stubbed.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../social.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const key = "scamgraph-oauth-pending";
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function harness(os = "web", store = new Map()) {
  const state = {
    now: Date.now(),
    exchangeCalls: 0,
    challenge: null,
    intent: "login",
    nextError: null,
    blocker: null,
    coldUrl: null,
    browser: deferred(),
    assigned: null,
  };
  const platform = { OS: os };
  const location = {
    origin: "https://app.example",
    pathname: "/",
    href: "https://app.example/",
    assign: (url) => {
      state.assigned = url;
    },
  };
  const history = {
    replaceState: (_, __, value) => {
      location.href = location.origin + value;
    },
  };
  const storage = {
    get: async (k) => store.get(k) || null,
    set: async (k, v) => {
      store.set(k, v);
    },
    remove: async (k) => {
      store.delete(k);
    },
  };
  const sessionStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const user = {
    id: "user-test",
    name: "Test",
    email: "test@example.com",
    role: "user",
    created_at: "2026-10-06T00:00:00Z",
  };
  const post = async (route, body) => {
    if (route.endsWith("/start")) {
      state.challenge = body.code_challenge;
      state.intent = body.intent;
      assert.equal(state.challenge.length, 43);
      return { authorization_url: "https://accounts.google.com/authorize" };
    }
    assert.equal(route, "/auth/oauth/exchange");
    state.exchangeCalls += 1;
    assert.equal(
      crypto
        .createHash("sha256")
        .update(body.code_verifier)
        .digest("base64url"),
      state.challenge,
    );
    if (state.nextError) {
      const error = state.nextError;
      state.nextError = null;
      throw error;
    }
    if (state.blocker) await state.blocker.promise;
    return state.intent === "link"
      ? { linked: true, user, provider: "google" }
      : {
          token: "opaque-app-session-token",
          user,
          linked: false,
          provider: "google",
        };
  };
  const dependencies = {
    "react-native": { Platform: platform },
    "expo-crypto": {
      getRandomBytesAsync: async (size) => crypto.randomBytes(size),
      CryptoDigestAlgorithm: { SHA256: "sha256" },
      digestStringAsync: async (_, value) =>
        crypto.createHash("sha256").update(value).digest("hex"),
    },
    "expo-web-browser": {
      openAuthSessionAsync: async () => state.browser.promise,
    },
    "expo-linking": { getInitialURL: async () => state.coldUrl },
    "./storage": { storage },
    "./api": { post },
  };
  class Clock extends Date {
    static now() {
      return state.now;
    }
  }
  const module = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "URL",
    "location",
    "history",
    "sessionStorage",
    "Date",
    compiled,
  )(
    (name) => {
      if (!dependencies[name]) throw Error("Unexpected dependency " + name);
      return dependencies[name];
    },
    module,
    module.exports,
    URL,
    location,
    history,
    sessionStorage,
    Clock,
  );
  const code = "client-handoff-code-" + crypto.randomBytes(20).toString("hex");
  const callback =
    os === "web"
      ? location.origin + "/?exchange_code=" + code
      : "scamgraph://oauth?exchange_code=" + code;
  return { social: module.exports, state, platform, store, location, callback };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function nativePending() {
  const first = harness("android");
  const pendingBrowser = first.social.startSocial("google");
  await tick();
  assert(first.store.has(key));
  return { first, pendingBrowser };
}
async function main() {
  let checks = 0;
  {
    const h = harness();
    await h.social.startSocial("google");
    h.location.href = h.callback;
    h.state.blocker = deferred();
    const a = h.social.finishOAuthRedirect(h.callback);
    const b = h.social.finishOAuthRedirect(h.callback);
    await tick();
    assert.equal(
      h.state.exchangeCalls,
      1,
      "duplicate warm callbacks must share one exchange",
    );
    assert.equal(
      h.location.href,
      h.location.origin + "/",
      "handoff code removed from browser URL immediately",
    );
    h.state.blocker.resolve();
    const results = await Promise.all([a, b]);
    assert.equal(results[0].token, results[1].token);
    assert.equal(h.store.has(key), false);
    checks += 1;
  }
  {
    const { first } = await nativePending();
    const fresh = harness("android", first.store);
    fresh.state.challenge = first.state.challenge;
    fresh.state.coldUrl = fresh.callback;
    const result = await fresh.social.finishOAuthRedirect();
    assert.equal(
      result.token,
      "opaque-app-session-token",
      "fresh native process redeems stored PKCE callback",
    );
    assert.equal(fresh.state.exchangeCalls, 1);
    checks += 1;
  }
  {
    const h = harness();
    await h.social.startSocial("google");
    h.state.nextError = new Error("Network request failed");
    await assert.rejects(h.social.finishOAuthRedirect(h.callback));
    assert.equal(await h.social.hasOAuthRetry(), true);
    assert(
      h.store.has(key),
      "transport failure retains verifier/code for explicit bounded retry",
    );
    const result = await h.social.retryOAuthExchange();
    assert.equal(result.token, "opaque-app-session-token");
    assert.equal(
      h.state.exchangeCalls,
      2,
      "one failed attempt plus one user retry",
    );
    assert.equal(h.store.has(key), false);
    checks += 1;
  }
  {
    const h = harness();
    await h.social.startSocial("google");
    h.state.nextError = Object.assign(
      new Error("Invalid or expired OAuth handoff"),
      { status: 400 },
    );
    await assert.rejects(h.social.finishOAuthRedirect(h.callback));
    assert.equal(await h.social.hasOAuthRetry(), false);
    assert.equal(
      h.store.has(key),
      false,
      "terminal HTTP failure clears pending credentials",
    );
    checks += 1;
  }
  {
    const h = harness();
    await h.social.startSocial("google");
    h.state.nextError = new Error("Request timed out");
    await assert.rejects(h.social.finishOAuthRedirect(h.callback));
    h.state.now += 61_000;
    assert.equal(
      await h.social.hasOAuthRetry(),
      false,
      "handoff retry cannot outlive the local 60-second bound",
    );
    await assert.rejects(h.social.retryOAuthExchange());
    assert.equal(
      h.state.exchangeCalls,
      1,
      "expired retry performs no HTTP request",
    );
    checks += 1;
  }
  {
    const h = harness();
    await h.social.startSocial("google", "link");
    const result = await h.social.finishOAuthRedirect(h.callback);
    assert.equal(result.linked, true);
    assert.equal(
      "token" in result,
      false,
      "linking must not switch the app session",
    );
    checks += 1;
  }
  {
    const h = harness();
    await h.social.startSocial("google");
    h.state.blocker = deferred();
    const pending = h.social.finishOAuthRedirect(h.callback);
    await tick();
    await h.social.clearOAuthState();
    h.state.blocker.resolve();
    await assert.rejects(
      pending,
      /cancelled/,
      "logout cancels an in-flight login outcome",
    );
    assert.equal(h.store.has(key), false);
    checks += 1;
  }
  {
    const h = harness("android");
    assert.equal(
      h.social.isOAuthCallback("scamgraph://oauth.attacker?exchange_code=x"),
      false,
    );
    assert.equal(
      h.social.isOAuthCallback("scamgraph://caller?exchange_code=x"),
      false,
    );
    const web = harness();
    assert.equal(
      web.social.isOAuthCallback("https://attacker.example/?exchange_code=x"),
      false,
    );
    assert.equal(
      await web.social.finishOAuthRedirect(
        "https://attacker.example/?exchange_code=x",
      ),
      null,
    );
    assert.equal(web.state.exchangeCalls, 0);
    checks += 1;
  }
  console.log(
    `${checks} client OAuth flow checks passed (mock platform/HTTP; no provider login).`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
