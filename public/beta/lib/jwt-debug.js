/**
 * JWT Token Debugging Helper
 * Decodes access tokens to inspect claims and scopes
 */

export function decodeJWT(token) {
    if (!token) {
        console.warn('No token provided to decode');
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

    console.group('Token Inspection');
    console.log('Issuer (iss):', decoded.iss);
    console.log('Audience (aud):', decoded.aud);
    console.log('Subject (sub):', decoded.sub);
    console.log('User Principal Name:', decoded.upn || decoded.preferred_username);
    console.log('App ID:', decoded.appid);
    
    // Most important: scopes
    const scopes = decoded.scp || decoded.roles || [];
    console.log('Scopes:', typeof scopes === 'string' ? scopes.split(' ') : scopes);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.exp - now;
    console.log('⏱️  Expires in:', expiresIn > 0 ? `${Math.floor(expiresIn / 60)} minutes` : 'EXPIRED');
    
    // Issued at
    const issuedAt = new Date(decoded.iat * 1000).toLocaleString();
    console.log('Issued at:', issuedAt);
    
    console.groupEnd();
    
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
        console.warn('Missing scopes:', missing);
        console.log('Token has:', tokenScopes);
        return false;
    }
    
    console.log('All required scopes present');
    return true;
}
