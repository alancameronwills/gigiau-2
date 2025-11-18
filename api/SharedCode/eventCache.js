/**
 * Event Result Cache
 * Caches successfully extracted events per venue handler.
 * Falls back to cached events if fresh scrape returns empty results.
 */

class EventCache {
    #storer;
    #context;

    /**
     * @param {{get(name), put(name, type, buffer), has(name)}} storer File storage backend
     * @param {*} context Logger context
     */
    constructor(storer, context) {
        this.#context = context || console;
        this.#storer = storer;
    }

    /**
     * Get cache filename for a venue handler
     * @param {string} venueName Handler name (e.g., "mwldan", "torch")
     * @returns {string} Cache filename
     */
    #getCacheKey(venueName) {
        return `cache-${venueName}.json`;
    }

    /**
     * Get cached events for a venue
     * @param {string} venueName Handler name
     * @returns {Promise<Array|null>} Cached events array or null if not found
     */
    async get(venueName) {
        const cacheKey = this.#getCacheKey(venueName);
        try {
            const cached = await this.#storer.has(cacheKey);
            if (!cached) return null;

            const content = await this.#storer.get(cacheKey);
            const data = JSON.parse(content);
            return data.events || null;
        } catch (e) {
            this.#context.log(`Error reading cache for ${venueName}: ${e.message}`);
            return null;
        }
    }

    /**
     * Store events for a venue (only if non-empty)
     * @param {string} venueName Handler name
     * @param {Array} events Events array
     * @returns {Promise<boolean>} True if cached, false if empty
     */
    async set(venueName, events) {
        if (!events || !Array.isArray(events) || events.length === 0) {
            return false;
        }

        const cacheKey = this.#getCacheKey(venueName);
        const data = {
            events,
            cached: Date.now(),
            count: events.length
        };

        try {
            await this.#storer.put(cacheKey, "application/json", JSON.stringify(data, null, 2));
            return true;
        } catch (e) {
            this.#context.log(`Error caching events for ${venueName}: ${e.message}`);
            return false;
        }
    }

    /**
     * Clear cache for a specific venue
     * @param {string} venueName Handler name
     */
    async invalidate(venueName) {
        const cacheKey = this.#getCacheKey(venueName);
        try {
            await this.#storer.delete(cacheKey);
        } catch (e) {
            this.#context.log(`Error invalidating cache for ${venueName}: ${e.message}`);
        }
    }

    /**
     * Clear all venue event caches
     */
    async purgeAll() {
        // This would require listing all cache-*.json files
        // For now, rely on storer.purge() if needed
        this.#context.log("EventCache: purgeAll not fully implemented");
    }
}

module.exports = {
    EventCache: (storer, context) => new EventCache(storer, context)
};
