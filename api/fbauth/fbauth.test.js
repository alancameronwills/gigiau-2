/**
 * Tests for Facebook Authentication API
 * Run with: node --test api/fbauth/fbauth.test.js
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const API_BASE = process.env.API_BASE || 'http://localhost:7000/api';

describe('Facebook Auth API', () => {

    describe('GET /fbauth-login', () => {
        it('should redirect to Facebook OAuth', async () => {
            const response = await fetch(`${API_BASE}/fbauth-login`, {
                redirect: 'manual'
            });

            assert.strictEqual(response.status, 302, 'Should return 302 redirect');

            const location = response.headers.get('location');
            assert.ok(location, 'Should have Location header');
            assert.ok(location.includes('facebook.com'), 'Should redirect to Facebook');
            assert.ok(location.includes('oauth'), 'Should be OAuth URL');
            assert.ok(location.includes('client_id='), 'Should include client_id');
            assert.ok(location.includes('redirect_uri='), 'Should include redirect_uri');
            assert.ok(location.includes('scope='), 'Should include scope');
        });
    });

    describe('GET /fbauth-me', () => {
        it('should return 401 without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbauth-me`);

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');

            const data = await response.json();
            assert.ok(data.error, 'Should have error message');
        });

        it('should return 401 with invalid token', async () => {
            const response = await fetch(`${API_BASE}/fbauth-me`, {
                headers: {
                    'Authorization': 'Bearer invalid-token-12345'
                }
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('GET /fbauth-logout', () => {
        it('should return success even without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbauth-logout`);

            assert.strictEqual(response.status, 200, 'Should return 200 OK');

            const data = await response.json();
            assert.strictEqual(data.success, true, 'Should indicate success');
        });
    });

    describe('CORS', () => {
        it('should handle OPTIONS preflight request', async () => {
            const response = await fetch(`${API_BASE}/fbauth-me`, {
                method: 'OPTIONS'
            });

            assert.strictEqual(response.status, 200, 'Should return 200 for OPTIONS');

            const allowOrigin = response.headers.get('access-control-allow-origin');
            assert.ok(allowOrigin, 'Should have Access-Control-Allow-Origin header');
        });
    });
});
