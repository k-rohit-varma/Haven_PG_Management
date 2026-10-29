import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/csrf_flow_test';
process.env.JWT_SECRET = 'csrf-flow-test-jwt-secret-at-least-32-chars';
process.env.COOKIE_SECRET = 'csrf-flow-test-cookie-secret-at-least-32-chars';
process.env.CLIENT_URL = 'https://haven.example.test';
process.env.JOB_SECRET = 'csrf-flow-test-job-secret-at-least-32-characters';
process.env.LOG_LEVEL = 'error';

const { csrfToken, csrfProtection } = await import('../src/controllers/authController.js');

function request({ origin = process.env.CLIENT_URL, cookie, header } = {}) {
  return {
    id: 'csrf-test-request', method: 'POST', path: '/api/v1/auth/login', signedCookies: cookie === undefined ? {} : { csrf: cookie },
    get(name) {
      if (name.toLowerCase() === 'origin') return origin;
      if (name.toLowerCase() === 'x-csrf-token') return header;
      return undefined;
    },
  };
}

function runProtection(req) {
  let error;
  let nextCalled = false;
  csrfProtection(req, {}, (value) => { error = value; nextCalled = true; });
  return { error, nextCalled };
}

test('CSRF token uses a secure host-only Lax cookie and matching header is accepted', () => {
  let cookie;
  let body;
  csrfToken({ get: () => process.env.CLIENT_URL }, {
    cookie: (_name, value, options) => { cookie = { value, options }; },
    json: (value) => { body = value; },
  }, assert.fail);
  assert.equal(cookie.options.signed, true);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'lax');
  assert.equal(cookie.options.domain, undefined);
  assert.equal(body.data.csrfToken, cookie.value);

  const accepted = runProtection(request({ cookie: cookie.value, header: body.data.csrfToken }));
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.nextCalled, true);
});

test('CSRF protection rejects absent cookies, absent headers, mismatches, and untrusted origins', () => {
  for (const req of [
    request({ header: 'token' }),
    request({ cookie: 'token' }),
    request({ cookie: 'cookie-token', header: 'header-token' }),
  ]) {
    const result = runProtection(req);
    assert.equal(result.error?.statusCode, 403);
    assert.equal(result.error?.code, 'CSRF_VALIDATION_FAILED');
  }

  const rejected = runProtection(request({ origin: 'https://untrusted.example.test', cookie: 'token', header: 'token' }));
  assert.equal(rejected.error?.statusCode, 403);
  assert.equal(rejected.error?.code, 'CSRF_ORIGIN_REJECTED');
});
