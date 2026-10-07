'use strict';
// Validate public build configuration; never print credential or URL values.
function checkWebEnvironment(env, production) {
  const errors = [];
  const risky = Object.keys(env).filter(key => key.startsWith('EXPO_PUBLIC_') && /SECRET|TOKEN|PASSWORD|PRIVATE_KEY/i.test(key) && env[key]);
  if (risky.length) errors.push('Backend secrets must not be placed in EXPO_PUBLIC_* variables: ' + risky.join(', '));
  if (production || env.VERCEL === '1') {
    const value = env.EXPO_PUBLIC_API_URL;
    if (!value) errors.push('Set EXPO_PUBLIC_API_URL to the real HTTPS backend URL ending in /api.');
    else {
      try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        const local = host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
        const reserved = /(?:^|\.)(?:example|invalid|test|localhost)$/.test(host) || /(?:^|\.)example\.(?:com|net|org)$/.test(host) || host.endsWith('.local');
        if (url.protocol !== 'https:' || local || reserved || url.username || url.password || url.search || url.hash || !/^\/api\/?$/.test(url.pathname)) {
          errors.push('EXPO_PUBLIC_API_URL must be a real public HTTPS backend origin with /api, without credentials/query/fragment; localhost and reserved demo domains are invalid for deployment.');
        }
      } catch { errors.push('EXPO_PUBLIC_API_URL is not a valid absolute backend URL.'); }
    }
  }
  return errors;
}
module.exports = { checkWebEnvironment };
if (require.main === module) {
  const errors = checkWebEnvironment(process.env, process.argv.includes('--production'));
  if (errors.length) { for (const error of errors) console.error(error); process.exitCode = 1; }
  else console.log('Public web build configuration validated. Provider secrets stay on the backend.');
}
