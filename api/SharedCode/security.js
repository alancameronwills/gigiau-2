/**
 * Security utilities for input validation and sanitization
 */

/**
 * Sanitize filename to prevent path traversal attacks
 * @param {string} name - Filename to sanitize
 * @returns {string} Sanitized filename
 * @throws {Error} If filename contains invalid characters
 */
function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid filename: must be a non-empty string');
    }

    // Remove path traversal sequences
    let sanitized = name.replace(/\.\./g, '').replace(/[\/\\]/g, '');

    // Remove leading dots to prevent hidden file access
    sanitized = sanitized.replace(/^\.+/, '');

    // Validate against safe character set (alphanumeric, dash, underscore, dot)
    if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
        throw new Error('Invalid filename: contains unsafe characters');
    }

    // Prevent empty result after sanitization
    if (!sanitized) {
        throw new Error('Invalid filename: empty after sanitization');
    }

    return sanitized;
}

/**
 * Validate and sanitize image URL to prevent SSRF attacks
 * @param {string} url - URL to validate
 * @returns {string} Validated URL
 * @throws {Error} If URL is invalid or points to private network
 */
function validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL: must be a non-empty string');
    }

    // Fix protocol-relative URLs
    if (url.indexOf('//') === 0) {
        url = 'https:' + url;
    }

    try {
        const parsed = new URL(url);

        // Only allow http/https protocols
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Invalid protocol: only http and https allowed');
        }

        // Block internal/private IPs and special hostnames
        const hostname = parsed.hostname.toLowerCase();

        // Block localhost variations
        if (hostname === 'localhost' ||
            hostname === '0.0.0.0' ||
            hostname.startsWith('127.') ||
            hostname === '[::1]' ||
            hostname === '::1') {
            throw new Error('Private network access not allowed');
        }

        // Block private IPv4 ranges
        const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipv4Match) {
            const [, a, b, c, d] = ipv4Match.map(Number);

            // 10.0.0.0/8
            if (a === 10) {
                throw new Error('Private network access not allowed');
            }

            // 172.16.0.0/12
            if (a === 172 && b >= 16 && b <= 31) {
                throw new Error('Private network access not allowed');
            }

            // 192.168.0.0/16
            if (a === 192 && b === 168) {
                throw new Error('Private network access not allowed');
            }

            // 169.254.0.0/16 (AWS metadata, link-local)
            if (a === 169 && b === 254) {
                throw new Error('Metadata service access not allowed');
            }

            // Validate octets are in range
            if (a > 255 || b > 255 || c > 255 || d > 255) {
                throw new Error('Invalid IP address');
            }
        }

        // Block private IPv6 ranges (simplified check)
        if (hostname.includes(':') && (
            hostname.startsWith('fc') ||  // fc00::/7
            hostname.startsWith('fd') ||  // fd00::/8
            hostname.startsWith('fe80')   // fe80::/10 link-local
        )) {
            throw new Error('Private network access not allowed');
        }

        return url;
    } catch (e) {
        if (e.message.includes('not allowed') || e.message.includes('Invalid')) {
            throw e;
        }
        throw new Error('Invalid URL format');
    }
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML insertion
 */
function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Escape regex special characters
 * @param {string} str - String to escape for use in RegExp
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate counter/series name
 * @param {string} name - Counter name to validate
 * @returns {string} Validated name
 * @throws {Error} If name is invalid
 */
function validateCounterName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid counter name: must be a non-empty string');
    }

    // Allow alphanumeric, dash, underscore (max 50 chars)
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(name)) {
        throw new Error('Invalid counter name: must be alphanumeric with dash/underscore (max 50 chars)');
    }

    return name;
}

/**
 * Validate venue name for event cache
 * @param {string} venueName - Venue name to validate
 * @returns {string} Validated venue name
 * @throws {Error} If venue name is invalid
 */
function validateVenueName(venueName) {
    if (!venueName || typeof venueName !== 'string') {
        throw new Error('Invalid venue name: must be a non-empty string');
    }

    // Allow alphanumeric and common venue name characters (max 100 chars)
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(venueName)) {
        throw new Error('Invalid venue name: must be alphanumeric with dash/underscore (max 100 chars)');
    }

    return venueName;
}

module.exports = {
    sanitizeFilename,
    validateImageUrl,
    escapeHtml,
    escapeRegex,
    validateCounterName,
    validateVenueName
};
