/**
 * Smoke tests for live AWS API
 * Run with: node --test api/smoke.test.js
 *
 * These tests verify basic functionality of the production API endpoints.
 * They do not require authentication and should pass quickly.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const API_BASE = 'https://0qa9ai0tq5.execute-api.eu-west-2.amazonaws.com';

describe('Live API Smoke Tests', () => {

    describe('Events API', () => {
        it('GET /events should return JSON', async () => {
            const response = await fetch(`${API_BASE}/events`);

            assert.strictEqual(response.status, 200, 'Should return 200 OK');

            const contentType = response.headers.get('content-type');
            assert.ok(contentType.includes('application/json'), 'Should return JSON');

            const data = await response.json();
            assert.ok(Array.isArray(data) || typeof data === 'object', 'Should return array or object');
        });
    });

    describe('Storage URL API', () => {
        it('GET /storageUrl should return 200', async () => {
            const response = await fetch(`${API_BASE}/storageUrl`);

            assert.strictEqual(response.status, 200, 'Should return 200 OK');

            const contentType = response.headers.get('content-type');
            assert.ok(contentType, 'Should have content-type header');
        });
    });

    describe('Facebook Auth API', () => {
        it('GET /fbauth-login should redirect to Facebook', async () => {
            const response = await fetch(`${API_BASE}/fbauth-login`, {
                redirect: 'manual'
            });

            assert.strictEqual(response.status, 302, 'Should return 302 redirect');

            const location = response.headers.get('location');
            assert.ok(location, 'Should have Location header');
            assert.ok(location.includes('facebook.com'), 'Should redirect to Facebook');
        });

        it('GET /fbauth-me should return 401 without auth', async () => {
            const response = await fetch(`${API_BASE}/fbauth-me`);

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });

        it('GET /fbauth-logout should return success', async () => {
            const response = await fetch(`${API_BASE}/fbauth-logout`);

            assert.strictEqual(response.status, 200, 'Should return 200 OK');

            const data = await response.json();
            assert.strictEqual(data.success, true, 'Should indicate success');
        });
    });

    describe('Facebook Pages API', () => {
        it('GET /fbpages should return 401 without auth', async () => {
            const response = await fetch(`${API_BASE}/fbpages`);

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');

            const data = await response.json();
            assert.ok(data.error, 'Should have error message');
        });

        it('PATCH /fbpages should return 401 without auth', async () => {
            const response = await fetch(`${API_BASE}/fbpages?id=test&enabled=true`, {
                method: 'PATCH'
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });

        it('POST /fbpages?sync should return 401 without auth', async () => {
            const response = await fetch(`${API_BASE}/fbpages?sync=1`, {
                method: 'POST'
            });

            assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
        });
    });

    describe('Counter API', () => {
        it('GET /counter should return counters', async () => {
            const response = await fetch(`${API_BASE}/counter`);

            assert.strictEqual(response.status, 200, 'Should return 200 OK');

            const contentType = response.headers.get('content-type');
            assert.ok(contentType.includes('application/json'), 'Should return JSON');
        });
    });

    describe('CORS Headers', () => {
        it('OPTIONS /fbpages should return success', async () => {
            const response = await fetch(`${API_BASE}/fbpages`, {
                method: 'OPTIONS'
            });

            // AWS API Gateway returns 204 for OPTIONS preflight
            assert.ok([200, 204].includes(response.status), 'Should return 200 or 204');
        });

        it('OPTIONS /fbauth-me should return success', async () => {
            const response = await fetch(`${API_BASE}/fbauth-me`, {
                method: 'OPTIONS'
            });

            // AWS API Gateway returns 204 for OPTIONS preflight
            assert.ok([200, 204].includes(response.status), 'Should return 200 or 204');
        });
    });

    describe('Response Times', () => {
        it('API responses should be under 5 seconds', async () => {
            const endpoints = [
                '/events',
                '/storageUrl',
                '/fbauth-me',
                '/fbpages',
                '/counter'
            ];

            for (const endpoint of endpoints) {
                const start = Date.now();
                await fetch(`${API_BASE}${endpoint}`);
                const duration = Date.now() - start;

                assert.ok(duration < 5000, `${endpoint} should respond in under 5 seconds (took ${duration}ms)`);
            }
        });
    });
});
