import {
  constants,
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
import {
  acceptInvite,
  createMember,
  ensureTenant,
  findInvite,
  findMemberByExternalId,
  setMemberRole,
  touchMember,
} from './db.js';

/**
 * Identity and authorisation.
 *
 * The API never trusts a caller-asserted user id. Depending on AUTH_MODE it
 * either verifies a signed token itself (`oidc`), trusts headers injected by a
 * proxy it sits behind (`headers`), or uses a fixed development identity
 * (`dev`). Anything else refuses to start — failing closed matters more here
 * than being convenient.
 *
 * Verification uses node:crypto against the provider's JWKS, so there is no
 * dependency to add and no native build, matching the node:sqlite choice.
 *
 * Access is invite-only: an authenticated person with no member row and no
 * invite is rejected rather than silently given a workspace. People whose email
 * is listed in AUTH_ADMIN_EMAILS are our own staff and are provisioned into a
 * staff tenant on first login.
 */

const trim = (value) => String(value ?? '').trim();
const fromEnv = (name, fallback = '') => trim(process.env[name]) || fallback;

const NODE_ENV = fromEnv('NODE_ENV', 'development');
const ISSUER = fromEnv('OIDC_ISSUER');
const JWKS_URL = fromEnv(
  'OIDC_JWKS_URL',
  ISSUER ? `${ISSUER.replace(/\/+$/, '')}/.well-known/jwks.json` : '',
);
const AUDIENCE = fromEnv('OIDC_AUDIENCE');
const INSTANCE_ID = fromEnv('AUTH_INSTANCE_ID');
const INSTANCE_GROUP = fromEnv('AUTH_INSTANCE_GROUP');
const HMAC_SECRET = fromEnv('OIDC_HMAC_SECRET');
const TOKEN_HEADER = fromEnv('AUTH_TOKEN_HEADER', 'authorization').toLowerCase();
const USER_HEADER = fromEnv('AUTH_USER_HEADER', 'x-auth-request-user').toLowerCase();
const EMAIL_HEADER = fromEnv('AUTH_EMAIL_HEADER', 'x-auth-request-email').toLowerCase();
const NAME_HEADER = fromEnv('AUTH_NAME_HEADER', 'x-auth-request-name').toLowerCase();
const STAFF_TENANT = fromEnv('AUTH_STAFF_TENANT', 'staff');
const DEV_TENANT = fromEnv('AUTH_DEV_TENANT', fromEnv('NECROZINE_DEFAULT_USER_ID', 'default'));
const DEV_USER = fromEnv('AUTH_DEV_USER', 'dev-user');
const DEV_EMAIL = fromEnv('AUTH_DEV_EMAIL', 'dev@localhost');
const LEEWAY_SECONDS = Number(fromEnv('AUTH_CLOCK_LEEWAY_SECONDS', '60')) || 60;
const ADMIN_EMAILS = new Set(
  fromEnv('AUTH_ADMIN_EMAILS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const MODE = (() => {
  const requested = fromEnv('AUTH_MODE').toLowerCase();
  if (requested) return requested;
  // Infer a sane default, but never silently trust anything in production.
  if (ISSUER) return 'oidc';
  return NODE_ENV === 'production' ? '' : 'dev';
})();

/** Non-empty when the server must refuse to start. */
export const authConfigError = (() => {
  if (INSTANCE_ID || INSTANCE_GROUP) {
    if (!INSTANCE_ID || !INSTANCE_GROUP || MODE !== 'oidc' || !ISSUER || !AUDIENCE) {
      return 'Instance access requires AUTH_INSTANCE_ID, AUTH_INSTANCE_GROUP, AUTH_MODE=oidc, OIDC_ISSUER and OIDC_AUDIENCE.';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(INSTANCE_ID)) {
      return 'AUTH_INSTANCE_ID must be a stable identifier containing only letters, digits, hyphens or underscores.';
    }
  }
  if (!MODE) {
    return 'No authentication configured. Set OIDC_ISSUER (plus AUTH_MODE=oidc), or AUTH_MODE=headers behind a trusted proxy.';
  }
  if (!['oidc', 'headers', 'dev'].includes(MODE)) {
    return `Unknown AUTH_MODE "${MODE}". Expected oidc, headers or dev.`;
  }
  if (MODE === 'oidc' && !JWKS_URL) {
    return 'AUTH_MODE=oidc requires OIDC_ISSUER or OIDC_JWKS_URL so tokens can be verified.';
  }
  if (MODE === 'headers' && fromEnv('AUTH_TRUST_PROXY_HEADERS_ACK') !== 'true') {
    return 'AUTH_MODE=headers trusts identity headers, so it only works when the API is reachable solely through the authenticating proxy. Acknowledge with AUTH_TRUST_PROXY_HEADERS_ACK=true.';
  }
  if (MODE === 'dev' && NODE_ENV === 'production') {
    return 'AUTH_MODE=dev is refused in production. Configure oidc or headers.';
  }
  return '';
})();

export const authConfig = {
  mode: MODE,
  issuer: ISSUER,
  jwksUrl: JWKS_URL,
  audience: AUDIENCE,
  tokenHeader: TOKEN_HEADER,
  adminEmails: [...ADMIN_EMAILS],
  staffTenant: STAFF_TENANT,
};

export const describeAuth = () => {
  if (MODE === 'dev') {
    return `dev — every request is treated as ${DEV_EMAIL} in tenant "${DEV_TENANT}". DEVELOPMENT ONLY.`;
  }
  if (MODE === 'headers') {
    return `headers — trusting "${USER_HEADER}"/"${EMAIL_HEADER}" from a proxy that authenticates callers.`;
  }
  return `oidc — verifying tokens from ${TOKEN_HEADER} against ${JWKS_URL}${
    AUDIENCE ? ` (audience ${AUDIENCE})` : ''
  }.`;
};

/* --- Token verification ------------------------------------------------- */

const ALGORITHMS = {
  RS256: { hash: 'RSA-SHA256' },
  RS384: { hash: 'RSA-SHA384' },
  RS512: { hash: 'RSA-SHA512' },
  PS256: { hash: 'RSA-SHA256', padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
  PS384: { hash: 'RSA-SHA384', padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 },
  PS512: { hash: 'RSA-SHA512', padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 },
  ES256: { hash: 'SHA256', dsaEncoding: 'ieee-p1363' },
  ES384: { hash: 'SHA384', dsaEncoding: 'ieee-p1363' },
  ES512: { hash: 'SHA512', dsaEncoding: 'ieee-p1363' },
};

const HMAC_ALGORITHMS = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache = { url: '', keys: [], fetchedAt: 0 };

const loadJwks = async (force = false) => {
  const fresh = Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!force && jwksCache.url === JWKS_URL && fresh) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`JWKS request failed with ${response.status}`);
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (!keys.length) throw new Error('JWKS response contained no keys');
  jwksCache = { url: JWKS_URL, keys, fetchedAt: Date.now() };
  return keys;
};

const decodeSegment = (segment) =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

const normalizedIssuer = (value) => String(value ?? '').replace(/\/+$/, '');

/** Verify a compact JWS and return its claims. Throws on anything untrusted. */
export const verifyToken = async (token) => {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeSegment(encodedHeader);
  const claims = decodeSegment(encodedPayload);
  const alg = String(header.alg ?? '');

  if (!alg || alg.toLowerCase() === 'none') {
    throw new Error('Unsigned tokens are not accepted');
  }

  const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = Buffer.from(encodedSignature, 'base64url');

  if (HMAC_ALGORITHMS[alg]) {
    if (!HMAC_SECRET) throw new Error(`${alg} requires OIDC_HMAC_SECRET`);
    const expected = createHmac(HMAC_ALGORITHMS[alg], HMAC_SECRET).update(signed).digest();
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
      throw new Error('Token signature is invalid');
    }
  } else {
    const spec = ALGORITHMS[alg];
    if (!spec) throw new Error(`Unsupported token algorithm: ${alg}`);
    const pick = (keys) =>
      keys.find((key) => key.kid && key.kid === header.kid) ??
      (keys.length === 1 ? keys[0] : null);
    let jwk = pick(await loadJwks());
    if (!jwk) jwk = pick(await loadJwks(true));
    if (!jwk) throw new Error(`No signing key matches kid "${header.kid}"`);
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const options = { key };
    if (spec.padding) options.padding = spec.padding;
    if (spec.saltLength) options.saltLength = spec.saltLength;
    if (spec.dsaEncoding) options.dsaEncoding = spec.dsaEncoding;
    if (!verifySignature(spec.hash, signed, options, signature)) {
      throw new Error('Token signature is invalid');
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && now > claims.exp + LEEWAY_SECONDS) {
    throw new Error('Token has expired');
  }
  if (typeof claims.nbf === 'number' && now + LEEWAY_SECONDS < claims.nbf) {
    throw new Error('Token is not valid yet');
  }
  if (ISSUER && normalizedIssuer(claims.iss) !== normalizedIssuer(ISSUER)) {
    throw new Error('Token issuer mismatch');
  }
  if (AUDIENCE) {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(AUDIENCE)) throw new Error('Token audience mismatch');
  }
  return claims;
};

/* --- Resolving a request to a tenant ------------------------------------ */

const readCredentials = async (req) => {
  if (MODE === 'dev') {
    return { externalId: `dev:${DEV_USER}`, email: DEV_EMAIL, name: 'Development user' };
  }

  if (MODE === 'headers') {
    const externalId = trim(req.header(USER_HEADER));
    if (!externalId) return null;
    return {
      externalId,
      email: trim(req.header(EMAIL_HEADER)) || null,
      name: trim(req.header(NAME_HEADER)) || null,
    };
  }

  const raw = trim(req.header(TOKEN_HEADER));
  if (!raw) return null;
  const token = raw.replace(/^bearer\s+/i, '');
  const claims = await verifyToken(token);
  const externalId = trim(claims.sub);
  if (!externalId) throw new Error('Token has no sub claim');
  if (INSTANCE_ID) {
    if (authConfigError) throw new Error(authConfigError);
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
      throw new Error('Instance access requires a token expiry');
    }
    if (!Array.isArray(claims.groups) || !claims.groups.includes(INSTANCE_GROUP)) {
      throw new Error('Token does not grant access to this instance');
    }
    if (req.header('x-hosting-user-id') !== claims.sub ||
        req.header('x-hosting-user-issuer') !== claims.iss) {
      throw new Error('Forwarded identity does not match the verified token');
    }
  }
  const fullName =
    trim(claims.name) ||
    [trim(claims.given_name), trim(claims.family_name)].filter(Boolean).join(' ') ||
    null;
  return {
    externalId: INSTANCE_ID ? JSON.stringify([claims.iss, externalId]) : externalId,
    username: trim(claims.preferred_username) || null,
    email:
      trim(claims.email) || trim(claims.preferred_username) || trim(claims.upn) || null,
    name: fullName,
  };
};

/**
 * Map a request to `{ member, tenantId, isAdmin }`, or a `{ reason }` when the
 * caller is authenticated but not allowed in.
 */
export const resolveIdentity = async (db, req) => {
  const credentials = await readCredentials(req);
  if (!credentials) return { reason: 'missing-credentials' };

  const { externalId, email, name } = credentials;
  if (INSTANCE_ID) {
    // Hosting grants entry; each dedicated instance owns one shared workspace.
    // Never use email-based staff promotion or local invites in this mode.
    ensureTenant(db, INSTANCE_ID);
    const existing = findMemberByExternalId(db, externalId);
    if (existing && existing.tenantId !== INSTANCE_ID) {
      throw new Error('Existing member belongs to a different workspace; migration is required');
    }
    const member = existing ?? createMember(db, {
      id: randomUUID(), tenantId: INSTANCE_ID, externalId, email, name, role: 'member',
    });
    touchMember(db, externalId);
    return {
      member: { ...member, email, name, username: credentials.username },
      tenantId: INSTANCE_ID,
      isAdmin: member.role === 'admin',
    };
  }
  const emailKey = email ? email.toLowerCase() : '';
  // Our own staff are provisioned automatically; everyone else needs an invite.
  const isStaff = Boolean(emailKey) && ADMIN_EMAILS.has(emailKey);

  // Dev mode has no invites to check, so it is provisioned straight into the
  // local tenant. Deliberately NOT the staff tenant: that would hide whatever
  // already sits in the default tenant's folder.
  if (MODE === 'dev') {
    ensureTenant(db, DEV_TENANT, 'Local development');
    const member =
      findMemberByExternalId(db, externalId) ??
      createMember(db, {
        id: randomUUID(),
        tenantId: DEV_TENANT,
        externalId,
        email,
        name,
        role: 'admin',
      });
    touchMember(db, externalId);
    return { member, tenantId: member.tenantId, isAdmin: true };
  }

  const existing = findMemberByExternalId(db, externalId);
  if (existing) {
    touchMember(db, externalId);
    if (isStaff && existing.role !== 'admin') {
      setMemberRole(db, externalId, 'admin');
      return { member: { ...existing, role: 'admin' }, tenantId: existing.tenantId, isAdmin: true };
    }
    return {
      member: existing,
      tenantId: existing.tenantId,
      isAdmin: existing.role === 'admin',
    };
  }

  if (isStaff) {
    ensureTenant(db, STAFF_TENANT, 'D-Zine staff');
    const member = createMember(db, {
      id: randomUUID(),
      tenantId: STAFF_TENANT,
      externalId,
      email,
      name,
      role: 'admin',
    });
    return { member, tenantId: member.tenantId, isAdmin: true };
  }

  // Invite-only: no member row and no invite means no workspace.
  const invite = emailKey ? findInvite(db, emailKey) : null;
  if (!invite) return { reason: 'not-invited', email: email ?? externalId };

  ensureTenant(db, invite.tenantId);
  const member = createMember(db, {
    id: randomUUID(),
    tenantId: invite.tenantId,
    externalId,
    email,
    name,
    role: invite.role,
  });
  acceptInvite(db, emailKey);
  return { member, tenantId: member.tenantId, isAdmin: member.role === 'admin' };
};

/** Express middleware: attach `req.identity` or reject. */
export const createIdentityMiddleware = (db) => async (req, res, next) => {
  try {
    const identity = await resolveIdentity(db, req);
    if (identity.reason === 'missing-credentials') {
      res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
      return;
    }
    if (identity.reason === 'not-invited') {
      res.status(403).json({
        error: 'No workspace for this account',
        code: 'no-workspace',
        detail: `${identity.email} has not been invited to a workspace.`,
      });
      return;
    }
    req.identity = identity;
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Could not verify credentials',
      code: 'unauthenticated',
      detail: error.message,
    });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.identity?.isAdmin) {
    // A plain permission failure, distinct from "your session ended", so the
    // client can tell the two apart instead of logging the user out.
    res.status(403).json({ error: 'Administrator access required', code: 'forbidden' });
    return;
  }
  next();
};
