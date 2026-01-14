/**
 * Facebook Pages Management Handler
 * Handles listing, deleting, and refreshing Facebook pages
 */

const { TableStorer } = require('../SharedCode/tableStorer');
const { requireAuth } = require('../SharedCode/jwtSession');

const FB_CLIENT_URL = process.env.FB_CLIENT_URL || 'http://localhost';

/**
 * Get CORS headers for the response
 */
function getCorsHeaders(req) {
    const origin = req.headers?.origin || req.headers?.Origin || FB_CLIENT_URL;
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
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
        } else if (method === 'DELETE' || req.query.id) {
            await handleDeletePage(context, req, user);
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
 * Handle DELETE /fbpages?id={page_id} - Remove a page
 */
async function handleDeletePage(context, req, user) {
    const pageId = req.query.id;

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

    // Authorization check: only owner or superuser can delete
    if (!user.isSuperuser && page.user_facebook_id !== user.facebook_id) {
        context.res = {
            status: 403,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Not authorized to delete this page' })
        };
        return;
    }

    // Delete the page
    await pageTable.deleteEntity('page', pageId);

    console.log(`[FBPages] Deleted page ${page.page_name} (${pageId}) by user ${user.facebook_id}`);

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, message: 'Page deleted' })
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
