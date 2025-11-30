/**
 * JWT Token Debugging Helper
 * Decodes access tokens to inspect claims and scopes
 */

const DEBUG_MODE = 0;
const debug = {
  log: (...args) => { if (DEBUG_MODE) console.log(...args); },
  warn: (...args) => { if (DEBUG_MODE) console.warn(...args); },
  error: (...args) => console.error(...args),
  group: (...args) => { if (DEBUG_MODE) console.group(...args); },
  groupEnd: () => { if (DEBUG_MODE) console.groupEnd(); }
};

export function decodeJWT(token) {
    if (!token) {
        debug.warn('No token provided to decode');
        return null;
    }

    try {
        // JWT consists of 3 parts: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.error('Invalid JWT format - expected 3 parts');
            return null;
        }

        // Decode base64url (note: different from standard base64)
        const base64Url = parts[1]; // payload is the 2nd part
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Failed to decode JWT:', error);
        return null;
    }
}

/**
 * Log token information for debugging
 */
export function inspectToken(token) {
    const decoded = decodeJWT(token);
    if (!decoded) {
        console.error('Could not decode token');
        return;
    }

    debug.group('Token Inspection');
    debug.log('Issuer (iss):', decoded.iss);
    debug.log('Audience (aud):', decoded.aud);
    debug.log('Subject (sub):', decoded.sub);
    debug.log('User Principal Name:', decoded.upn || decoded.preferred_username);
    debug.log('App ID:', decoded.appid);
    
    // Most important: scopes
    const scopes = decoded.scp || decoded.roles || [];
    debug.log('Scopes:', typeof scopes === 'string' ? scopes.split(' ') : scopes);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.exp - now;
    debug.log('⏱️  Expires in:', expiresIn > 0 ? `${Math.floor(expiresIn / 60)} minutes` : 'EXPIRED');
    
    // Issued at
    const issuedAt = new Date(decoded.iat * 1000).toLocaleString();
    debug.log('Issued at:', issuedAt);
    
    debug.groupEnd();
    
    return decoded;
}

/**
 * Check if token has required scopes
 */
export function hasRequiredScopes(token, requiredScopes = ['Sites.Read.All']) {
    const decoded = decodeJWT(token);
    if (!decoded) return false;
    
    const tokenScopes = decoded.scp ? decoded.scp.split(' ') : (decoded.roles || []);
    const missing = requiredScopes.filter(scope => !tokenScopes.includes(scope));
    
    if (missing.length > 0) {
        debug.warn('Missing scopes:', missing);
        debug.log('Token has:', tokenScopes);
        return false;
    }
    
    debug.log('All required scopes present');
    return true;
}
