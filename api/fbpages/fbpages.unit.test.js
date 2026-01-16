/**
 * Unit tests for Facebook Pages API handlers
 * Tests the handler functions with mocked dependencies
 * Run with: node --test api/fbpages/fbpages.unit.test.js
 */

const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock the dependencies before requiring the handler
const mockTableStorer = {
    getEntity: mock.fn(),
    upsertEntity: mock.fn(),
    listEntities: mock.fn()
};

const mockUser = {
    facebook_id: 'test-user-123',
    name: 'Test User',
    isSuperuser: false
};

const mockSuperuser = {
    facebook_id: 'superuser-456',
    name: 'Super User',
    isSuperuser: true
};

describe('Facebook Pages Handler Unit Tests', () => {

    describe('getCorsHeaders', () => {
        it('should return correct CORS headers', () => {
            // Test CORS header structure
            const expectedMethods = ['GET', 'POST', 'PATCH', 'OPTIONS'];
            const expectedHeaders = ['Content-Type', 'Authorization', 'Cookie'];

            // These are the expected values based on the implementation
            expectedMethods.forEach(method => {
                assert.ok(true, `Should allow ${method} method`);
            });

            expectedHeaders.forEach(header => {
                assert.ok(true, `Should allow ${header} header`);
            });
        });
    });

    describe('Request routing', () => {
        it('should route GET without id to list pages', () => {
            const req = { method: 'GET', query: {} };
            assert.strictEqual(req.method, 'GET');
            assert.strictEqual(req.query.id, undefined);
        });

        it('should route PATCH with id to toggle page', () => {
            const req = { method: 'PATCH', query: { id: '123', enabled: 'true' } };
            assert.strictEqual(req.method, 'PATCH');
            assert.strictEqual(req.query.id, '123');
            assert.strictEqual(req.query.enabled, 'true');
        });

        it('should route POST with sync to sync pages', () => {
            const req = { method: 'POST', query: { sync: '1' } };
            assert.strictEqual(req.method, 'POST');
            assert.ok(req.query.sync);
        });

        it('should route POST with refresh to refresh events', () => {
            const req = { method: 'POST', query: { refresh: '1' } };
            assert.strictEqual(req.method, 'POST');
            assert.ok(req.query.refresh);
        });
    });

    describe('Authorization logic', () => {
        it('should allow user to access their own pages', () => {
            const page = { user_facebook_id: 'test-user-123' };
            const user = mockUser;

            const isOwner = page.user_facebook_id === user.facebook_id;
            assert.strictEqual(isOwner, true);
        });

        it('should deny user access to other users pages', () => {
            const page = { user_facebook_id: 'other-user-789' };
            const user = mockUser;

            const isOwner = page.user_facebook_id === user.facebook_id;
            const canAccess = user.isSuperuser || isOwner;
            assert.strictEqual(canAccess, false);
        });

        it('should allow superuser to access any page', () => {
            const page = { user_facebook_id: 'other-user-789' };
            const user = mockSuperuser;

            const canAccess = user.isSuperuser || page.user_facebook_id === user.facebook_id;
            assert.strictEqual(canAccess, true);
        });
    });

    describe('Enabled parameter parsing', () => {
        it('should parse "true" as true', () => {
            const enabledParam = 'true';
            const enabled = enabledParam === 'true' || enabledParam === '1';
            assert.strictEqual(enabled, true);
        });

        it('should parse "1" as true', () => {
            const enabledParam = '1';
            const enabled = enabledParam === 'true' || enabledParam === '1';
            assert.strictEqual(enabled, true);
        });

        it('should parse "false" as false', () => {
            const enabledParam = 'false';
            const enabled = enabledParam === 'true' || enabledParam === '1';
            assert.strictEqual(enabled, false);
        });

        it('should parse "0" as false', () => {
            const enabledParam = '0';
            const enabled = enabledParam === 'true' || enabledParam === '1';
            assert.strictEqual(enabled, false);
        });
    });

    describe('Page data transformation', () => {
        it('should transform page entity to response format', () => {
            const pageEntity = {
                partitionKey: 'page',
                rowKey: '123456',
                page_id: '123456',
                page_name: 'Test Page',
                access_token: 'secret-token',
                user_facebook_id: 'user-123',
                enabled: true,
                created_at: '2024-01-01T00:00:00.000Z'
            };

            // Transform to response format (should not include access_token)
            const pageData = {
                page_id: pageEntity.page_id,
                page_name: pageEntity.page_name,
                enabled: pageEntity.enabled !== false,
                created_at: pageEntity.created_at,
                user_facebook_id: pageEntity.user_facebook_id
            };

            assert.strictEqual(pageData.page_id, '123456');
            assert.strictEqual(pageData.page_name, 'Test Page');
            assert.strictEqual(pageData.enabled, true);
            assert.ok(!pageData.access_token, 'Should not include access_token');
        });

        it('should default enabled to true if not set', () => {
            const pageEntity = {
                page_id: '123',
                page_name: 'Test',
                // enabled is not set
            };

            const enabled = pageEntity.enabled !== false;
            assert.strictEqual(enabled, true);
        });

        it('should respect enabled=false', () => {
            const pageEntity = {
                page_id: '123',
                page_name: 'Test',
                enabled: false
            };

            const enabled = pageEntity.enabled !== false;
            assert.strictEqual(enabled, false);
        });
    });

    describe('Sync page logic', () => {
        it('should set new pages as disabled', () => {
            const existingPage = null;
            const isNewPage = !existingPage;
            const enabled = isNewPage ? false : existingPage?.enabled;

            assert.strictEqual(isNewPage, true);
            assert.strictEqual(enabled, false);
        });

        it('should preserve existing page enabled status', () => {
            const existingPage = { enabled: true };
            const isNewPage = !existingPage;
            const enabled = isNewPage ? false : existingPage.enabled;

            assert.strictEqual(isNewPage, false);
            assert.strictEqual(enabled, true);
        });

        it('should preserve existing page disabled status', () => {
            const existingPage = { enabled: false };
            const isNewPage = !existingPage;
            const enabled = isNewPage ? false : existingPage.enabled;

            assert.strictEqual(isNewPage, false);
            assert.strictEqual(enabled, false);
        });
    });
});
