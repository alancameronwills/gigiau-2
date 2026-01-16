/**
 * Facebook OAuth Authentication Handler
 * Handles login, callback, logout, and session validation
 */

const { TableStorer } = require('../SharedCode/tableStorer');
const { generateSession, validateSession, destroySession, extractToken } = require('../SharedCode/jwtSession');

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI;
const FB_CLIENT_URL = process.env.FB_CLIENT_URL || 'http://localhost';
const SUPERUSER_IDS = (process.env.SUPERUSER_IDS || '').split(',').filter(Boolean);

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';
const FB_OAUTH_SCOPES = 'pages_read_engagement,pages_show_list';

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
 * Routes based on URL path instead of query parameters
 */
async function azureHandler(context, req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: getCorsHeaders(req),
            body: ''
        };
        return;
    }

    // Determine action from URL path
    const path = req.url || req.path || '';
    let action = 'login';

    if (path.includes('fbauth-callback') || path.includes('/callback')) {
        action = 'callback';
    } else if (path.includes('fbauth-logout') || path.includes('/logout')) {
        action = 'logout';
    } else if (path.includes('fbauth-me') || path.includes('/me')) {
        action = 'me';
    } else if (path.includes('fbauth-login') || path.includes('/login')) {
        action = 'login';
    }

    try {
        switch (action) {
            case 'login':
                await handleLogin(context, req);
                break;
            case 'callback':
                await handleCallback(context, req);
                break;
            case 'logout':
                await handleLogout(context, req);
                break;
            case 'me':
                await handleMe(context, req);
                break;
            default:
                context.res = {
                    status: 400,
                    body: JSON.stringify({ error: 'Invalid action' })
                };
        }
    } catch (error) {
        console.error('[FBAuth] Error:', error);
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
 * Handle login - redirect to Facebook OAuth
 */
async function handleLogin(context, req) {
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${FB_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&` +
        `scope=${FB_OAUTH_SCOPES}&` +
        `response_type=code`;

    console.log('[FBAuth] Redirecting to OAuth:', authUrl);

    context.res = {
        status: 302,
        headers: {
            'Location': authUrl
        },
        body: ''
    };
}

/**
 * Handle OAuth callback - exchange code for tokens and store user/pages
 */
async function handleCallback(context, req) {
    const code = req.query.code;

    if (!code) {
        context.res = {
            status: 400,
            headers: { 'Content-Type': 'text/html' },
            body: '<html><body><h1>Error</h1><p>No authorization code received from Facebook.</p></body></html>'
        };
        return;
    }

    try {
        // Debug logging
        console.log('[FBAuth] Callback received');
        console.log('[FBAuth] Code (full):', code);
        console.log('[FBAuth] Redirect URI:', FB_REDIRECT_URI);

        // Step 1: Exchange code for short-lived token
        const tokenUrl = `${FB_GRAPH_API}/oauth/access_token?` +
            `client_id=${FB_APP_ID}&` +
            `client_secret=${FB_APP_SECRET}&` +
            `redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&` +
            `code=${encodeURIComponent(code)}`;

        console.log('[FBAuth] Token exchange URL (code redacted):', tokenUrl.replace(/code=[^&]+/, 'code=REDACTED'));

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('[FBAuth] Token exchange error:', tokenData.error);
            throw new Error(`Facebook token exchange error: ${tokenData.error.message}`);
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token (60 days)
        const longLivedUrl = `${FB_GRAPH_API}/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${FB_APP_ID}&` +
            `client_secret=${FB_APP_SECRET}&` +
            `fb_exchange_token=${shortLivedToken}`;

        const longLivedResponse = await fetch(longLivedUrl);
        const longLivedData = await longLivedResponse.json();

        if (longLivedData.error) {
            throw new Error(`Long-lived token error: ${longLivedData.error.message}`);
        }

        const userAccessToken = longLivedData.access_token;

        // Step 3: Get user profile
        const userUrl = `${FB_GRAPH_API}/me?fields=id,name&access_token=${userAccessToken}`;
        const userResponse = await fetch(userUrl);
        const userData = await userResponse.json();

        if (userData.error) {
            throw new Error(`User profile error: ${userData.error.message}`);
        }

        const facebook_id = userData.id;
        const name = userData.name;
        const isSuperuser = SUPERUSER_IDS.includes(facebook_id);

        // Step 4: Store user in database
        const userTable = TableStorer('gigiaufbusers');
        await userTable.upsertEntity({
            partitionKey: 'user',
            rowKey: facebook_id,
            facebook_id,
            name,
            access_token: userAccessToken,
            isSuperuser,
            created_at: new Date().toISOString(),
            modified: new Date().toISOString()
        });

        console.log(`[FBAuth] User ${name} (${facebook_id}) logged in`);

        // Step 5: Fetch user's pages
        const pagesUrl = `${FB_GRAPH_API}/me/accounts?access_token=${userAccessToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            console.error('[FBAuth] Pages fetch error:', pagesData.error);
        } else if (pagesData.data && pagesData.data.length > 0) {
            const pageTable = TableStorer('gigiaufbpages');

            for (const page of pagesData.data) {
                // Check if page already exists to preserve enabled status
                let existingPage = null;
                try {
                    existingPage = await pageTable.getEntity('page', page.id);
                } catch (e) {
                    // Page doesn't exist yet
                }

                const isNewPage = !existingPage;
                const enabled = isNewPage ? false : existingPage.enabled;

                await pageTable.upsertEntity({
                    partitionKey: 'page',
                    rowKey: page.id,
                    page_id: page.id,
                    page_name: page.name,
                    access_token: page.access_token,  // Permanent page token
                    user_facebook_id: facebook_id,
                    enabled: enabled,
                    created_at: existingPage?.created_at || new Date().toISOString(),
                    modified: new Date().toISOString()
                });

                console.log(`[FBAuth] ${isNewPage ? 'Added' : 'Updated'} page: ${page.name} (${page.id}), enabled: ${enabled}`);
            }
        } else {
            console.warn('[FBAuth] No pages found for user');
        }

        // Step 6: Create session
        const session = await generateSession(facebook_id);
        console.log('[FBAuth] Session created:', session.token.substring(0, 20) + '...');

        // Step 7: Redirect to admin page with token in URL
        // (Cross-domain cookies don't work reliably, so we pass token in URL
        // and let the client store it in localStorage)
        context.res = {
            status: 302,
            headers: {
                'Location': `${FB_CLIENT_URL}/fbadmin.html?token=${encodeURIComponent(session.token)}`
            },
            body: ''
        };

    } catch (error) {
        console.error('[FBAuth] Callback error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'text/html' },
            body: `<html><body><h1>Authentication Error</h1><p>${error.message}</p><p><a href="/fbadmin.html">Return to admin page</a></p></body></html>`
        };
    }
}

/**
 * Handle logout - destroy session
 */
async function handleLogout(context, req) {
    const token = extractToken(req);

    if (token) {
        await destroySession(token);
    }

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(req)
        },
        body: JSON.stringify({ success: true, message: 'Logged out' })
    };
}

/**
 * Handle /me - get current user info
 */
async function handleMe(context, req) {
    console.log('[FBAuth] /me called');
    console.log('[FBAuth] Headers:', req.headers);

    const token = extractToken(req);
    console.log('[FBAuth] Token extracted:', token ? token.substring(0, 20) + '...' : 'null');

    const user = await validateSession(token);
    console.log('[FBAuth] User validated:', user ? user.name : 'null');

    if (!user) {
        context.res = {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(req)
            },
            body: JSON.stringify({ error: 'Not authenticated' })
        };
        return;
    }

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(req)
        },
        body: JSON.stringify({
            facebook_id: user.facebook_id,
            name: user.name,
            isSuperuser: user.isSuperuser
        })
    };
}

module.exports = azureHandler;

// AWS Lambda wrapper
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);
