/**
 * Facebook Events Fetcher
 * Fetches events from all connected Facebook pages and transforms to standard format
 */

const { TableStorer } = require('./tableStorer');

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';
const DMhmformat = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" };

/**
 * Fetch events from all enabled Facebook pages
 * @returns {Promise<Array>} Array of event objects in standard format
 */
async function fetchFacebookEvents() {
    const pageTable = TableStorer('gigiaufbpages');
    const allEvents = [];

    // Get all enabled pages
    const pages = [];
    for await (const page of pageTable.listEntities()) {
        if (page.partitionKey === 'page' && page.enabled !== false) {
            pages.push(page);
        }
    }

    if (pages.length === 0) {
        console.log('[FB] No Facebook pages configured');
        return [];
    }

    console.log(`[FB] Fetching events from ${pages.length} Facebook pages`);

    // Fetch events from each page in parallel
    await Promise.all(pages.map(async (page) => {
        try {
            const events = await fetchPageEvents(page);
            allEvents.push(...events);
            console.log(`[FB] Fetched ${events.length} events from ${page.page_name}`);
        } catch (error) {
            console.error(`[FB] Error fetching events for ${page.page_name}:`, error.message);
            // Don't throw - continue with other pages
        }
    }));

    console.log(`[FB] Total Facebook events fetched: ${allEvents.length}`);
    return allEvents;
}

/**
 * Fetch events from a single Facebook page
 * @param {Object} page - Page object with access_token
 * @returns {Promise<Array>} Array of events in standard format
 */
async function fetchPageEvents(page) {
    const url = `${FB_GRAPH_API}/${page.page_id}/events?` +
        `access_token=${page.access_token}&` +
        `fields=id,name,description,start_time,end_time,cover,place&` +
        `time_filter=upcoming&` +
        `limit=50`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        throw new Error(`Facebook API error: ${data.error.message}`);
    }

    if (!data.data || data.data.length === 0) {
        return [];
    }

    // Transform Facebook events to standard format
    return data.data.map(fbEvent => transformEvent(fbEvent, page));
}

/**
 * Transform Facebook event to standard event format
 * @param {Object} fbEvent - Facebook event object
 * @param {Object} page - Page object
 * @returns {Object} Event in standard format
 */
function transformEvent(fbEvent, page) {
    const startDate = new Date(fbEvent.start_time);

    return {
        title: fbEvent.name || 'Untitled Event',
        venue: fbEvent.place?.name || page.page_name,
        date: startDate.toLocaleString("en-GB", DMhmformat),
        dt: startDate.valueOf(),
        image: fbEvent.cover?.source || '',
        url: `https://facebook.com/events/${fbEvent.id}`,
        text: (fbEvent.description || '').substring(0, 200),
        category: inferCategory(fbEvent.name, fbEvent.description)
    };
}

/**
 * Infer event category from title and description
 * @param {string} name - Event name
 * @param {string} description - Event description
 * @returns {string} Category: 'film', 'quiz', 'broadcast', or 'live'
 */
function inferCategory(name, description) {
    const text = `${name || ''} ${description || ''}`.toLowerCase();

    if (text.match(/film|cinema|movie|screening/)) {
        return 'film';
    }

    if (text.match(/quiz|trivia/)) {
        return 'quiz';
    }

    if (text.match(/broadcast|ntlive|nt live|live stream|screening/)) {
        return 'broadcast';
    }

    // Default to 'live' for most events
    return 'live';
}

module.exports = {
    fetchFacebookEvents
};
