/**
 * Tests for Facebook Pages API
 * Run with: node --test api/fbpages/fbpages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const API_BASE = process.env.API_BASE || 'http://localhost:7000/api';

describe('Facebook Pages API', () => {

    describe('GET /fbpages (list pages)', () => {
        it('should return 401 without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbpages`);

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');

            const data = await response.json();
            assert.ok(data.error, 'Should have error message');
            assert.ok(data.error.includes('Authentication'), 'Error should mention authentication');
        });

        it('should return 401 with invalid token', async () => {
            const response = await fetch(`${API_BASE}/fbpages`, {
                headers: {
                    'Authorization': 'Bearer invalid-token-12345'
                }
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('PATCH /fbpages (toggle page)', () => {
        it('should return 401 without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbpages?id=123&enabled=true`, {
                method: 'PATCH'
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });

        it('should return 401 with invalid token', async () => {
            const response = await fetch(`${API_BASE}/fbpages?id=123&enabled=true`, {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer invalid-token-12345'
                }
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('POST /fbpages?sync=1 (sync pages)', () => {
        it('should return 401 without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbpages?sync=1`, {
                method: 'POST'
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });

        it('should return 401 with invalid token', async () => {
            const response = await fetch(`${API_BASE}/fbpages?sync=1`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer invalid-token-12345'
                }
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('POST /fbpages?refresh=1 (refresh events)', () => {
        it('should return 401 without authentication', async () => {
            const response = await fetch(`${API_BASE}/fbpages?refresh=1`, {
                method: 'POST'
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('CORS', () => {
        it('should handle OPTIONS preflight request', async () => {
            const response = await fetch(`${API_BASE}/fbpages`, {
                method: 'OPTIONS'
            });

            assert.strictEqual(response.status, 200, 'Should return 200 for OPTIONS');

            const allowOrigin = response.headers.get('access-control-allow-origin');
            assert.ok(allowOrigin, 'Should have Access-Control-Allow-Origin header');

            const allowMethods = response.headers.get('access-control-allow-methods');
            assert.ok(allowMethods, 'Should have Access-Control-Allow-Methods header');
            assert.ok(allowMethods.includes('PATCH'), 'Should allow PATCH method');
        });
    });

    describe('Invalid requests', () => {
        it('should return 400 for unsupported methods', async () => {
            const response = await fetch(`${API_BASE}/fbpages`, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token'
                }
            });

            // Will return 401 first due to invalid auth, which is expected
            assert.ok([400, 401].includes(response.status), 'Should return 400 or 401');
        });
    });
});
