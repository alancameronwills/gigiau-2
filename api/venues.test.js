/**
 * Venue tests for live AWS API
 * Run with: node --test api/venues.test.js
 *
 * Tests that each venue handler returns valid results.
 * Dynamically fetches the list of venues from the API.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const API_BASE = 'https://0qa9ai0tq5.execute-api.eu-west-2.amazonaws.com';

describe('Venue API Tests', () => {
    let venues = {};
    let venueKeys = [];

    before(async () => {
        // Fetch list of venues from the API
        const response = await fetch(`${API_BASE}/events`);
        assert.strictEqual(response.status, 200, 'Should be able to fetch venue list');
        venues = await response.json();
        venueKeys = Object.keys(venues);
        console.log(`Found ${venueKeys.length} venues: ${venueKeys.join(', ')}`);
    });

    it('GET /events should return list of venues', async () => {
        assert.ok(typeof venues === 'object', 'Should return an object');
        assert.ok(venueKeys.length > 0, 'Should have at least one venue');

        // Check some expected venues exist
        const expectedVenues = ['gwaun', 'mwldan', 'span', 'cellar'];
        for (const venue of expectedVenues) {
            assert.ok(venues[venue], `Should have venue: ${venue}`);
        }
    });

    it('Each venue should return valid response', async () => {
        for (const venue of venueKeys) {
            const response = await fetch(`${API_BASE}/events?venue=${venue}`);

            assert.strictEqual(response.status, 200, `${venue}: Should return 200 OK`);

            const contentType = response.headers.get('content-type');
            assert.ok(contentType.includes('application/json'), `${venue}: Should return JSON`);

            const data = await response.json();

            // Should return an array (possibly empty)
            assert.ok(Array.isArray(data), `${venue}: Should return an array`);

            // If there are events, validate their structure
            if (data.length > 0) {
                const event = data[0];

                // Required fields
                assert.ok(event.title !== undefined, `${venue}: Event should have title`);
                assert.ok(event.venue !== undefined, `${venue}: Event should have venue`);

                // Optional but common fields
                if (event.date) {
                    assert.ok(typeof event.date === 'string', `${venue}: date should be string`);
                }
                if (event.dt) {
                    assert.ok(typeof event.dt === 'number', `${venue}: dt should be number`);
                }
                if (event.url) {
                    assert.ok(typeof event.url === 'string', `${venue}: url should be string`);
                }
                if (event.image) {
                    assert.ok(typeof event.image === 'string', `${venue}: image should be string`);
                }
                if (event.category) {
                    assert.ok(typeof event.category === 'string', `${venue}: category should be string`);
                }
            }

            console.log(`  ✓ ${venue} (${venues[venue]}): ${data.length} events`);
        }
    });

    it('All venues should respond within 30 seconds', async () => {
        for (const venue of venueKeys) {
            const start = Date.now();
            const response = await fetch(`${API_BASE}/events?venue=${venue}`);
            const duration = Date.now() - start;

            assert.ok(
                response.status === 200,
                `${venue}: Should return 200 (got ${response.status})`
            );
            assert.ok(
                duration < 30000,
                `${venue}: Should respond within 30s (took ${duration}ms)`
            );
        }
    });

    it('Invalid venue should return empty array or error', async () => {
        const response = await fetch(`${API_BASE}/events?venue=nonexistent_venue_xyz`);

        // Should return 200 with empty array or 404
        assert.ok(
            [200, 404].includes(response.status),
            'Should return 200 or 404 for invalid venue'
        );

        if (response.status === 200) {
            const data = await response.json();
            // Either empty array or error object
            assert.ok(
                Array.isArray(data) || data.error,
                'Should return empty array or error object'
            );
        }
    });
});
