'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installFingerprint, sameFingerprint, appLockReady, embeddingFilesReady, saveState, install } = require('./install.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scamgraph-install-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
}
function fixture() {
  const root = fs.mkdtempSync(path.join(scratch, 'project-'));
  for (const file of ['requirements.lock', 'app/package.json', 'ocr-runtime.lock.json', 'scripts/bootstrap.sh',
    'scripts/env.sh', 'scripts/check_install.py', 'scripts/install_local_ocr.py']) write(root, file, 'fixture');
  write(root, 'app/package-lock.json', { packages: { '': {}, 'node_modules/expo': { version: '55.0.31' },
    'node_modules/required': { version: '1.0.0' }, 'node_modules/optional-other-platform': { version: '2.0.0', optional: true } } });
  write(root, 'app/node_modules/expo/package.json', { version: '55.0.31' });
  write(root, 'app/node_modules/expo/bin/cli', 'fixture');
  write(root, 'app/node_modules/required/package.json', { version: '1.0.0' });
  write(root, 'scripts/download_embeddings.py', 'MODEL_ID = "test-model"\nMODEL_REVISION = "pinned-revision"\n');
  const model = 'ml/artifacts/embedding-model/';
  write(root, `${model}scamgraph_source.json`, { source: 'test-model', revision: 'pinned-revision' });
  for (const file of ['model.safetensors', 'config.json', 'modules.json', 'tokenizer.json', '1_Pooling/config.json']) write(root, model + file, 'fixture');
  return root;
}

test('fingerprints detect lock and setup-option changes without serializing private environment', () => {
  const root = fixture();
  const original = installFingerprint(root, { GOOGLE_CLIENT_SECRET: 'never-save-this' });
  assert.ok(!JSON.stringify(original).includes('never-save-this'));
  assert.ok(sameFingerprint(original, installFingerprint(root, {})));
  write(root, 'requirements.lock', 'changed pinned requirement');
  assert.ok(!sameFingerprint(original, installFingerprint(root, {})));
  assert.ok(!sameFingerprint(installFingerprint(root, {}), installFingerprint(root, { DOWNLOAD_EMBEDDINGS: '0' })));
});

test('readiness rejects absent or changed required npm packages but allows skipped optional packages', () => {
  const root = fixture();
  assert.equal(appLockReady(root), true);
  write(root, 'app/node_modules/required/package.json', { version: '1.0.1' });
  assert.equal(appLockReady(root), false);
  fs.rmSync(path.join(root, 'app/node_modules/required/package.json'));
  assert.equal(appLockReady(root), false);
});

test('embedding readiness requires the pinned revision and tokenizer/pooling files', () => {
  const root = fixture();
  assert.equal(embeddingFilesReady(root), true);
  write(root, 'ml/artifacts/embedding-model/scamgraph_source.json', { source: 'test-model', revision: 'different-revision' });
  assert.equal(embeddingFilesReady(root), false);
  write(root, 'ml/artifacts/embedding-model/scamgraph_source.json', { source: 'test-model', revision: 'pinned-revision' });
  fs.rmSync(path.join(root, 'ml/artifacts/embedding-model/tokenizer.json'));
  assert.equal(embeddingFilesReady(root), false);
});

test('a ready installation is verified each time and never runs bootstrap or downloads', async () => {
  const root = fixture();
  let verified = 0;
  let bootstraps = 0;
  const options = { root, environment: {}, log: () => {},
    verify: () => { verified++; return { ready: true, reasons: [], details: { python: '3.12', ocr: 'tesseract' } }; },
    bootstrap: async () => { bootstraps++; },
  };
  assert.equal(await install(options), 0);
  assert.equal(await install(options), 0);
  assert.equal(verified, 2);
  assert.equal(bootstraps, 0);
  const state = JSON.parse(fs.readFileSync(path.join(root, '.runtime/install-state.json'), 'utf8'));
  assert.equal(state.success, true);
  assert.deepEqual(state.fingerprint, installFingerprint(root, {}));
  assert.deepEqual(fs.readdirSync(path.join(root, '.runtime')), ['install-state.json']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(root, '.runtime/install-state.json')).mode & 0o777, 0o600);
});

test('missing dependencies are bootstrapped once and verified before success is saved', async () => {
  const root = fixture();
  let repaired = false;
  let verifications = 0;
  const result = await install({ root, environment: {}, log: () => {},
    verify: () => { verifications++; return { ready: repaired, reasons: repaired ? [] : ['Missing runtime'], details: null }; },
    bootstrap: async () => { repaired = true; },
  });
  assert.equal(result, 0);
  assert.equal(verifications, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.runtime/install-state.json'), 'utf8')).success, true);
});

test('failed setup invalidates an old success marker and reports failure', async () => {
  const root = fixture();
  saveState(root, { success: true });
  await assert.rejects(install({ root, environment: {}, log: () => {},
    verify: () => ({ ready: false, reasons: ['Missing runtime'], details: null }),
    bootstrap: async () => { throw new Error('Download failed'); },
  }), /Download failed/);
  assert.equal(fs.existsSync(path.join(root, '.runtime/install-state.json')), false);
  await assert.rejects(install({ root, environment: {}, log: () => {},
    verify: () => ({ ready: false, reasons: ['Missing runtime'], details: null }),
    bootstrap: async () => {},
  }), /runtime verification failed/);
  assert.equal(fs.existsSync(path.join(root, '.runtime/install-state.json')), false);
});
