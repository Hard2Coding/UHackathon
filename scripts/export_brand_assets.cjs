// Mechanical app-asset export from ImageGen masters; preserves logo geometry.
// Uses Expo's own icon export pipeline installed by npm ci in app/.
const fs = require('fs');
const path = require('path');
const { generateImageAsync } = require('../app/node_modules/@expo/image-utils');
const projectRoot = path.resolve(__dirname, '../app');
async function exportAsset(source, output, size, opaque = false) {
  const result = await generateImageAsync({ projectRoot, cacheType: 'scamgraph-brand' }, {
    src: path.join(projectRoot, 'assets', source), width: size, height: size,
    resizeMode: 'contain', removeTransparency: opaque,
    backgroundColor: opaque ? '#ffffff' : 'transparent',
  });
  fs.writeFileSync(path.join(projectRoot, 'assets', output), result.source);
  console.log(output, result.source.length, 'bytes');
}
(async () => {
  await exportAsset('scamgraph-symbol.png', 'scamgraph-symbol-ui.png', 384);
  await exportAsset('scamgraph-symbol.png', 'favicon.png', 128);
  await exportAsset('scamgraph-symbol.png', 'adaptive-icon.png', 1024);
  await exportAsset('scamgraph-icon-master.png', 'icon.png', 1024, true);
  await exportAsset('scamgraph-icon-dark-master.png', 'icon-dark.png', 1024, true);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
