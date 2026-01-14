/**
 * JWT Session Management
 * Provides stateless session handling compatible with Lambda/Azure Functions
 */

const jwt = require('jsonwebtoken');
const { TableStorer } = require('./tableStorer');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const SESSION_DURATION_DAYS = 7;

/**
 * Generate a new session for a Facebook user
 * @param {string} facebook_id - User's Facebook ID
 * @returns {Promise<{token: string, expires: Date}>}
 */
async function generateSession(facebook_id) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + SESSION_DURATION_DAYS);
    const expires = Math.floor(expiresDate.getTime() / 1000); // Unix timestamp

    // Create JWT token
    const token = jwt.sign(
        {
            facebook_id,
            jti: sessionId  // JWT ID for session tracking
        },
        JWT_SECRET,
        {
            expiresIn: `${SESSION_DURATION_DAYS}d`
        }
    );

    // Store session in table
    const sessionTable = TableStorer('gigiaufbsessions');
    await sessionTable.upsertEntity({
        partitionKey: 'session',
        rowKey: sessionId,
        facebook_id,
        expires: expiresDate.toISOString(),
        created_at: new Date().toISOString(),
        ttl: expires  // DynamoDB TTL (Unix timestamp)
    });

    return {
        token,
        expires: expiresDate
    };
}

/**
 * Validate a session token and return user info
 * @param {string} token - JWT session token
 * @returns {Promise<{facebook_id: string, name: string, isSuperuser: boolean} | null>}
 */
async function validateSession(token) {
    if (!token) return null;

    try {
        // Verify JWT signature and expiration
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check session exists in table
        const sessionTable = TableStorer('gigiaufbsessions');
        const session = await sessionTable.getEntity('session', decoded.jti);

        if (!session) {
            return null;
        }

        // Check if session expired
        if (new Date(session.expires) < new Date()) {
            await sessionTable.deleteEntity('session', decoded.jti);
            return null;
        }

        // Get user info
        const userTable = TableStorer('gigiaufbusers');
        const user = await userTable.getEntity('user', session.facebook_id);

        if (!user) {
            return null;
        }

        return {
            facebook_id: user.facebook_id,
            name: user.name,
            isSuperuser: user.isSuperuser || false,
            access_token: user.access_token
        };
    } catch (error) {
        // Invalid token, expired, or other error
        console.error('[Session] Validation error:', error.message);
        return null;
    }
}

/**
 * Destroy a session
 * @param {string} token - JWT session token
 * @returns {Promise<boolean>}
 */
async function destroySession(token) {
    if (!token) return false;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const sessionTable = TableStorer('gigiaufbsessions');
        await sessionTable.deleteEntity('session', decoded.jti);
        return true;
    } catch (error) {
        console.error('[Session] Destroy error:', error.message);
        return false;
    }
}

/**
 * Extract session token from request
 * Checks both cookie and Authorization header
 * @param {Object} req - Request object
 * @returns {string|null}
 */
function extractToken(req) {
    // Check Authorization header (case-insensitive)
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check cookie header (case-insensitive)
    const cookieHeader = req.headers?.cookie || req.headers?.Cookie;
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});

        if (cookies.fb_session) {
            return cookies.fb_session;
        }
    }

    return null;
}

/**
 * Middleware to require authentication
 * Returns user object or null if not authenticated
 * @param {Object} req - Request object
 * @returns {Promise<Object|null>}
 */
async function requireAuth(req) {
    const token = extractToken(req);
    return await validateSession(token);
}

module.exports = {
    generateSession,
    validateSession,
    destroySession,
    extractToken,
    requireAuth
};
