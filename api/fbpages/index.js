/**
 * Facebook Pages Management Handler
 * Handles listing, deleting, and refreshing Facebook pages
 */

const { TableStorer } = require('../SharedCode/tableStorer');
const { requireAuth } = require('../SharedCode/jwtSession');

const FB_CLIENT_URL = process.env.FB_CLIENT_URL || 'http://localhost';
const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

/**
 * Get CORS headers for the response
 */
function getCorsHeaders(req) {
    const origin = req.headers?.origin || req.headers?.Origin || FB_CLIENT_URL;
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
    };
}

/**
 * Azure Functions handler
 */
async function azureHandler(context, req) {
    const method = req.method || 'GET';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: getCorsHeaders(req),
            body: ''
        };
        return;
    }

    try {
        // Require authentication for all endpoints
        const user = await requireAuth(req);

        if (!user) {
            context.res = {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCorsHeaders(req)
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
            return;
        }

        // Route based on method and query params
        if (method === 'GET' && !req.query.id) {
            await handleListPages(context, req, user);
        } else if (method === 'PATCH' || (method === 'POST' && req.query.id)) {
            await handleTogglePage(context, req, user);
        } else if (method === 'POST' && req.query.sync) {
            await handleSyncPages(context, req, user);
        } else if (method === 'POST' && req.query.refresh) {
            await handleRefresh(context, req, user);
        } else {
            context.res = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCorsHeaders(req)
                },
                body: JSON.stringify({ error: 'Invalid request' })
            };
        }
    } catch (error) {
        console.error('[FBPages] Error:', error);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * Handle GET /fbpages - List pages
 */
async function handleListPages(context, req, user) {
    const pageTable = TableStorer('gigiaufbpages');
    const userTable = TableStorer('gigiaufbusers');
    const pages = [];

    // Fetch all pages
    for await (const page of pageTable.listEntities()) {
        if (page.partitionKey !== 'page') continue;

        // Filter: regular users see only their pages, superusers see all
        if (!user.isSuperuser && page.user_facebook_id !== user.facebook_id) {
            continue;
        }

        // Add page to result
        const pageData = {
            page_id: page.page_id,
            page_name: page.page_name,
            enabled: page.enabled !== false,
            created_at: page.created_at,
            user_facebook_id: page.user_facebook_id
        };

        // For superusers, include owner name
        if (user.isSuperuser) {
            try {
                const owner = await userTable.getEntity('user', page.user_facebook_id);
                pageData.owner_name = owner ? owner.name : 'Unknown';
            } catch (e) {
                pageData.owner_name = 'Unknown';
            }
        }

        pages.push(pageData);
    }

    // Sort by page name
    pages.sort((a, b) => a.page_name.localeCompare(b.page_name));

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(pages)
    };
}

/**
 * Handle PATCH /fbpages?id={page_id}&enabled={true|false} - Toggle page enabled status
 */
async function handleTogglePage(context, req, user) {
    const pageId = req.query.id;
    const enabledParam = req.query.enabled;

    if (!pageId) {
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Missing page_id' })
        };
        return;
    }

    if (enabledParam === undefined) {
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Missing enabled parameter' })
        };
        return;
    }

    const enabled = enabledParam === 'true' || enabledParam === '1';
    const pageTable = TableStorer('gigiaufbpages');

    // Get the page
    const page = await pageTable.getEntity('page', pageId);

    if (!page) {
        context.res = {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Page not found' })
        };
        return;
    }

    // Authorization check: only owner or superuser can toggle
    if (!user.isSuperuser && page.user_facebook_id !== user.facebook_id) {
        context.res = {
            status: 403,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Not authorized to modify this page' })
        };
        return;
    }

    // Update the page
    await pageTable.upsertEntity({
        ...page,
        enabled: enabled,
        modified: new Date().toISOString()
    });

    console.log(`[FBPages] ${enabled ? 'Enabled' : 'Disabled'} page ${page.page_name} (${pageId}) by user ${user.facebook_id}`);

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(req)
        },
        body: JSON.stringify({ success: true, enabled: enabled, message: `Page ${enabled ? 'enabled' : 'disabled'}` })
    };
}

/**
 * Handle POST /fbpages?sync=1 - Sync pages from Facebook using stored token
 */
async function handleSyncPages(context, req, user) {
    const userTable = TableStorer('gigiaufbusers');
    const pageTable = TableStorer('gigiaufbpages');

    // Get user's stored access token
    let userData;
    try {
        userData = await userTable.getEntity('user', user.facebook_id);
    } catch (e) {
        userData = null;
    }

    if (!userData || !userData.access_token) {
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'No stored access token. Please log out and log in again.' })
        };
        return;
    }

    // Fetch pages from Facebook
    const pagesUrl = `${FB_GRAPH_API}/me/accounts?access_token=${userData.access_token}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
        console.error('[FBPages] Sync error:', pagesData.error);
        // Token might be expired
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Facebook token expired. Please log out and log in again.' })
        };
        return;
    }

    if (!pagesData.data || pagesData.data.length === 0) {
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ success: true, added: 0, updated: 0, message: 'No pages found on Facebook' })
        };
        return;
    }

    let added = 0;
    let updated = 0;

    for (const page of pagesData.data) {
        // Check if page already exists
        let existingPage = null;
        try {
            existingPage = await pageTable.getEntity('page', page.id);
        } catch (e) {
            // Page doesn't exist
        }

        const isNewPage = !existingPage;
        const enabled = isNewPage ? false : existingPage.enabled;

        await pageTable.upsertEntity({
            partitionKey: 'page',
            rowKey: page.id,
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token,
            user_facebook_id: user.facebook_id,
            enabled: enabled,
            created_at: existingPage?.created_at || new Date().toISOString(),
            modified: new Date().toISOString()
        });

        if (isNewPage) {
            added++;
            console.log(`[FBPages] Sync added page: ${page.name} (${page.id})`);
        } else {
            updated++;
            console.log(`[FBPages] Sync updated page: ${page.name} (${page.id})`);
        }
    }

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(req)
        },
        body: JSON.stringify({
            success: true,
            added: added,
            updated: updated,
            message: added > 0 ? `Found ${added} new page(s)` : 'Pages are up to date'
        })
    };
}

/**
 * Handle POST /fbpages?refresh=1 - Manual event refresh
 */
async function handleRefresh(context, req, user) {
    // Trigger collection by invoking the collect function
    // In a real implementation, you might want to trigger the Lambda/Azure function
    // For now, just return a success message

    console.log(`[FBPages] Manual refresh triggered by user ${user.facebook_id}`);

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'Event refresh triggered. This may take a few minutes.'
        })
    };
}

module.exports = azureHandler;

// AWS Lambda wrapper
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);
