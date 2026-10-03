import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { openDatabase } from './db.js';

const directory = mkdtempSync(path.join(tmpdir(), 'canvas-instance-auth-'));
const issuer = 'https://identity.example.test/realms/agency';
const signingKey = 'local-test-key-not-a-deployment-secret';
Object.assign(process.env, {
  AUTH_MODE: 'oidc', OIDC_ISSUER: issuer, OIDC_AUDIENCE: 'instance-a',
  OIDC_HMAC_SECRET: signingKey, AUTH_INSTANCE_ID: 'instance-a',
  AUTH_INSTANCE_GROUP: '/instances/a', AUTH_ADMIN_EMAILS: 'sam@example.test',
});
const a = await import('./identity.js?instance-a');
Object.assign(process.env, {
  OIDC_AUDIENCE: 'instance-b', AUTH_INSTANCE_ID: 'instance-b',
  AUTH_INSTANCE_GROUP: '/instances/b',
});
const b = await import('./identity.js?instance-b');
const dbA = openDatabase(path.join(directory, 'a'));
const dbB = openDatabase(path.join(directory, 'b'));
after(() => { dbA.close(); dbB.close(); rmSync(directory, { recursive: true }); });

function request(overrides = {}, headers = {}) {
  const claims = {
    iss: issuer, sub: 'sam-stable', aud: 'instance-a',
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ['/instances/a'], email: 'sam@example.test',
    preferred_username: 'sam', name: 'Sam Example', ...overrides,
  };
  const content = [
    { alg: 'HS256', typ: 'JWT' }, claims,
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const signature = createHmac('sha256', signingKey).update(content).digest('base64url');
  const values = {
    authorization: `Bearer ${content}.${signature}`,
    'x-hosting-user-id': claims.sub, 'x-hosting-user-issuer': claims.iss,
    ...headers,
  };
  return { header: name => values[name.toLowerCase()] };
}

test('assigned people share one instance workspace without local invitations or automatic admin', async () => {
  assert.equal(a.authConfigError, '');
  const sam = await a.resolveIdentity(dbA, request());
  const alice = await a.resolveIdentity(dbA, request({ sub: 'alice', email: 'alice@example.test' }));
  assert.equal(sam.tenantId, 'instance-a');
  assert.equal(alice.tenantId, sam.tenantId);
  assert.notEqual(alice.member.id, sam.member.id);
  assert.equal(sam.member.role, 'member');
  assert.equal(sam.isAdmin, false); // Even AUTH_ADMIN_EMAILS cannot silently promote an instance invitee.
  assert.equal(sam.member.username, 'sam');
  const renamed = await a.resolveIdentity(dbA, request({ email: 'new@example.test', name: 'Sam Updated' }));
  assert.equal(renamed.member.id, sam.member.id);
  assert.equal(renamed.member.name, 'Sam Updated');
});

test('instance checks apply on every request, including existing members and forged headers', async () => {
  for (const [claims, headers] of [
    [{ groups: [] }, {}], [{ aud: 'instance-b' }, {}], [{ iss: 'https://other.example.test' }, {}],
    [{ exp: undefined }, {}], [{ exp: 1 }, {}],
    [{}, { 'x-hosting-user-id': 'forged' }], [{}, { 'x-hosting-user-issuer': 'forged' }],
    [{}, { 'x-hosting-user-id': undefined }], [{}, { 'x-hosting-user-id': 'sam-stable, forged' }],
  ]) {
    await assert.rejects(() => a.resolveIdentity(dbA, request(claims, headers)));
  }
  const missing = await a.resolveIdentity(dbA, { header: () => undefined });
  assert.equal(missing.reason, 'missing-credentials');
});

test('the same person needs a B token and assignment; B gets a separate workspace', async () => {
  await assert.rejects(() => b.resolveIdentity(dbB, request()));
  const samB = await b.resolveIdentity(dbB, request({ aud: 'instance-b', groups: ['/instances/b'] }));
  const samA = await a.resolveIdentity(dbA, request());
  assert.equal(samB.tenantId, 'instance-b');
  assert.notEqual(samA.tenantId, samB.tenantId);
  assert.equal(samA.member.externalId, samB.member.externalId);
  assert.notEqual(samA.member.id, samB.member.id);
  assert.equal(samB.isAdmin, false);
});
