import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Uses only disposable containers and a uniquely named volume; no host ports.
// Run after docker build -t dzine-canvas:ci .
const image = process.argv[2] || 'dzine-canvas:ci';
const name = `canvas-check-${randomUUID()}`;
const volume = `${name}-data`;
const started = Date.now();
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const run = () => docker(
  'run', '-d', '--name', name,
  '--mount', `type=volume,source=${volume},target=/data`,
  '-e', 'BASE_PATH=/demo', '-e', 'AUTH_MODE=oidc',
  '-e', 'OIDC_ISSUER=https://issuer.invalid', '-e', 'OIDC_AUDIENCE=canvas-check',
  '-e', 'OIDC_HMAC_SECRET=disposable-container-test-only',
  '-e', 'AUTH_ADMIN_EMAILS=smoke@example.invalid', image,
);
const check = (phase) => execFileSync('docker', ['exec', '-i', name, 'node', '--input-type=module'], {
  encoding: 'utf8',
  input: `
    import assert from 'node:assert/strict';
    import { createHmac } from 'node:crypto';
    import { existsSync } from 'node:fs';
    const base = 'http://127.0.0.1:4201';
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { ready = (await fetch(base + '/health')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'API did not become ready');
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = encode({ alg: 'HS256' }) + '.' + encode({
      sub: 'smoke', email: 'smoke@example.invalid', iss: process.env.OIDC_ISSUER,
      aud: process.env.OIDC_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 60,
    });
    const token = payload + '.' + createHmac('sha256', process.env.OIDC_HMAC_SECRET)
      .update(payload).digest('base64url');
    const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const request = async (path, options = {}, status = 200) => {
      const response = await fetch(base + '/demo/api' + path, { headers, ...options });
      assert.equal(response.status, status, path);
      return response;
    };
    const html = await (await fetch(base + '/demo/')).text();
    assert.ok(html.includes('data-base-path="/demo"'));
    const script = html.match(/src="([^\"]+\.js)"/)[1];
    assert.equal((await fetch(new URL(script, base + '/demo/'))).status, 200);
    await request('/designs', { headers: {} }, 401);
    await request('/designs', { headers: { authorization: 'Bearer invalid' } }, 401);
    assert.ok((await (await request('/templates')).json()).length > 0);
    await request('/fonts/files/nunito-regular.woff2', { headers: {} });
    if ('${phase}' === 'write') {
      const template = JSON.parse(await (await import('node:fs/promises')).readFile(
        '/app/api/data/templates/blank-white.json', 'utf8'));
      await request('/designs/container-check', {
        method: 'PUT', body: JSON.stringify({ name: 'Container persistence', pages: [template.elements] }),
      });
    }
    const design = await (await request('/designs/container-check')).json();
    assert.equal(design.name, 'Container persistence');
    assert.ok(existsSync('/data/db.sqlite'));
    assert.ok(existsSync('/app/scripts/backup-storage.mjs'));
    console.log('${phase}: frontend, signed API access, templates, fonts and persistent design passed');
  `,
});

try {
  docker('volume', 'create', volume);
  run();
  console.log(check('write').trim());
  docker('rm', '-f', name);
  run();
  console.log(check('read').trim());
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  console.log(`Container checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (error) {
  try { console.error(docker('logs', name)); } catch {}
  throw error;
} finally {
  docker('rm', '-f', name);
  docker('volume', 'rm', volume);
}
