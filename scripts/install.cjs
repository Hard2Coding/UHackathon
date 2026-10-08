#!/usr/bin/env node
'use strict';

// Root npm install prepares the shared app and API without shell activation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = '.runtime/install-state.json';
const INPUT_FILES = ['requirements.lock', 'app/package.json', 'app/package-lock.json', 'ocr-runtime.lock.json',
  'scripts/bootstrap.sh', 'scripts/env.sh', 'scripts/check_install.py', 'scripts/download_embeddings.py', 'scripts/install_local_ocr.py'];

function installFingerprint(root, environment = process.env) {
  const files = Object.fromEntries(INPUT_FILES.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  return { files, platform: process.platform, arch: process.arch,
    embeddings: environment.DOWNLOAD_EMBEDDINGS !== '0', localOcr: environment.INSTALL_LOCAL_OCR !== '0' };
}

function sameFingerprint(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function appLockReady(root) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'app/package-lock.json'), 'utf8'));
    for (const [directory, entry] of Object.entries(lock.packages || {})) {
      if (!directory || entry.link) continue;
      const file = path.join(root, 'app', directory, 'package.json');
      if (!fs.existsSync(file) && entry.optional) continue; // npm skips optional packages for other platforms.
      if (!fs.existsSync(file) || JSON.parse(fs.readFileSync(file, 'utf8')).version !== entry.version) return false;
    }
    return fs.existsSync(path.join(root, 'app/node_modules/expo/bin/cli'));
  } catch { return false; }
}

function embeddingFilesReady(root) {
  try {
    const source = fs.readFileSync(path.join(root, 'scripts/download_embeddings.py'), 'utf8');
    const modelId = source.match(/^MODEL_ID\s*=\s*"([^"]+)"/m)?.[1];
    const revision = source.match(/^MODEL_REVISION\s*=\s*"([^"]+)"/m)?.[1];
    const directory = path.join(root, 'ml/artifacts/embedding-model');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'scamgraph_source.json'), 'utf8'));
    return !!modelId && !!revision && manifest.source === modelId && manifest.revision === revision &&
      ['model.safetensors', 'config.json', 'modules.json', 'tokenizer.json', '1_Pooling/config.json']
        .every(file => fs.existsSync(path.join(directory, file)) && fs.statSync(path.join(directory, file)).size > 0);
  } catch { return false; }
}

function projectPython(root) { return path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); }

const PYTHON_CHECK = `
import contextlib, importlib.metadata, io, json, os, pathlib, runpy, subprocess, sys
from packaging.requirements import Requirement
root = pathlib.Path(sys.argv[1])
assert sys.version_info[:2] == (3, 12), "The project requires Python 3.12"
for line in (root / "requirements.lock").read_text().splitlines():
    if not line.strip() or line.lstrip().startswith("#"): continue
    requirement = Requirement(line)
    if requirement.marker and not requirement.marker.evaluate(): continue
    installed = importlib.metadata.version(requirement.name)
    assert requirement.specifier.contains(installed), f"Pinned dependency mismatch: {requirement.name}"
check = subprocess.run([sys.executable, "-m", "pip", "check"], capture_output=True, text=True)
assert check.returncode == 0, "Python dependencies have incompatible requirements"
output = io.StringIO()
with contextlib.redirect_stdout(output):
    runpy.run_path(str(root / "scripts/check_install.py"), run_name="__main__")
runtime = json.loads(output.getvalue())
assert runtime["ocr"] != "unavailable", "Tesseract OCR is unavailable"
if runtime["ocr"] == "tesseract":
    ocr = subprocess.run([os.environ.get("TESSERACT_CMD", "tesseract"), "--list-langs"], capture_output=True, text=True, timeout=15)
    assert ocr.returncode == 0, "The OCR runtime could not start"
    assert {"tha", "eng"}.issubset(set(ocr.stdout.splitlines())), "Thai/English OCR languages are unavailable"
if sys.argv[2] == "1":
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(str(root / "ml/artifacts/embedding-model"), device="cpu", local_files_only=True)
    vector = model.encode(["ตรวจสอบข้อความภาษาไทย"], normalize_embeddings=True)
    assert vector.shape == (1, 384), "Pinned embedding model failed its local check"
print(json.dumps({"python": runtime["python"], "ocr": runtime["ocr"]}))
`;

function verifyRuntime(root, environment = process.env) {
  const reasons = [];
  if (!appLockReady(root)) reasons.push('Shared app dependencies need the pinned npm lockfile');
  else {
    const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--prefix', 'app', '--all', '--json'],
      { cwd: root, env: environment, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
    if (npm.error || npm.status !== 0) reasons.push('The app npm dependency tree is incomplete');
  }
  const embeddings = environment.DOWNLOAD_EMBEDDINGS !== '0';
  if (embeddings && !embeddingFilesReady(root)) reasons.push('The pinned multilingual embedding model needs setup');
  if (process.platform === 'darwin' && process.arch === 'arm64' && environment.INSTALL_LOCAL_OCR !== '0') {
    const ocr = path.join(root, '.runtime/ocr');
    if (!['bin/tesseract', 'share/tessdata/tha.traineddata', 'share/tessdata/eng.traineddata']
      .every(file => fs.existsSync(path.join(ocr, file)))) reasons.push('The pinned Thai/English OCR runtime needs setup');
  }
  const python = projectPython(root);
  let details = null;
  if (!fs.existsSync(python)) reasons.push('The project Python environment needs setup');
  else {
    // env.sh supplies the bundled OpenMP/OCR paths needed by the macOS wheels.
    // Offline flags guarantee that a readiness check never downloads a model.
    const check = spawnSync('bash', ['-c', 'source scripts/env.sh\nexec "$1" -c "$2" "$3" "$4"', '--', python, PYTHON_CHECK, root, embeddings ? '1' : '0'],
      { cwd: root, env: { ...environment, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    if (check.error || check.status !== 0) reasons.push('Pinned Python dependencies, OCR, or the local model need setup');
    else {
      try { details = JSON.parse(check.stdout.trim()); }
      catch { reasons.push('Python runtime verification returned an invalid result'); }
    }
  }
  return { ready: reasons.length === 0, reasons, details };
}

function resolvePython(root, environment) {
  const local = projectPython(root);
  const candidates = [...new Set([environment.PYTHON_BIN, fs.existsSync(local) ? local : null, 'python3.12', 'python3'].filter(Boolean))];
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['-c', 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)'],
      { cwd: root, env: environment, stdio: 'ignore', timeout: 10000 });
    if (!check.error && check.status === 0) return candidate;
  }
  throw new Error('Python 3.12 is required for the API. Install Python 3.12, then run npm install again; virtual-environment activation is handled automatically.');
}

async function runBootstrap(root, environment) {
  if (process.platform === 'win32') throw new Error('This local installer requires Bash. Use WSL with Node.js 22 and Python 3.12, or the documented Docker setup.');
  const python = resolvePython(root, environment);
  await new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/bootstrap.sh'], {
      cwd: root, env: { ...environment, PYTHON_BIN: python }, stdio: 'inherit',
    });
    child.once('error', error => reject(new Error(`Could not start dependency setup: ${error.code || error.message}`)));
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Dependency setup stopped (${signal || code}). Correct the reported prerequisite or download error, then run npm install again.`)));
  });
}

function saveState(root, state) {
  const file = path.join(root, STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

async function install({ root = ROOT, environment = process.env, verify = verifyRuntime, bootstrap = runBootstrap, log = console.log } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const fingerprint = installFingerprint(root, environment);
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8')); } catch { /* No verified setup marker yet. */ }
  let readiness = verify(root, environment);
  if (!readiness.ready) {
    // A previous successful marker must never conceal a failed repair.
    fs.rmSync(path.join(root, STATE_FILE), { force: true });
    log(`ScamGraph setup: ${readiness.reasons.join('; ')}.`);
    await bootstrap(root, environment);
    readiness = verify(root, environment);
    if (!readiness.ready) throw new Error(`Setup completed but runtime verification failed: ${readiness.reasons.join('; ')}. Run npm install again after correcting the reported prerequisite.`);
  } else {
    log(previous?.success && sameFingerprint(previous.fingerprint, fingerprint)
      ? 'ScamGraph setup is already verified; reusing app, API, OCR and model dependencies.'
      : 'Existing pinned dependencies are ready; no reinstall or model download needed.');
  }
  saveState(root, { schemaVersion: 1, success: true, fingerprint, runtime: readiness.details, verifiedAt: new Date().toISOString() });
  log('ScamGraph is ready. Run npm run dev for web, or npm run ios for iOS.');
  return 0;
}

module.exports = { installFingerprint, sameFingerprint, appLockReady, embeddingFilesReady, verifyRuntime, resolvePython, saveState, install };
if (require.main === module) install().catch(error => { console.error(`ScamGraph install: ${error.message}`); process.exitCode = 1; });
