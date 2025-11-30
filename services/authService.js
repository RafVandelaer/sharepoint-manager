const { ConfidentialClientApplication } = require('@azure/msal-node');

class AuthService {
    constructor(config = null) {
        // Config can be passed dynamically per-user, no env vars needed
        if (config) {
            this.msalConfig = {
                auth: {
                    clientId: config.clientId,
                    clientSecret: config.clientSecret,
                    authority: `https://login.microsoftonline.com/${config.tenantId}`
                }
            };
            this.cca = new ConfidentialClientApplication(this.msalConfig);
            this.redirectUri = config.redirectUri;
        } else {
            this.cca = null;
            this.redirectUri = null;
        }
    }

    getAuthUrl(state = null) {
        if (!this.cca) {
            throw new Error('AuthService not configured. Please set your Azure App Registration credentials first.');
        }
        const authUrlParameters = {
            scopes: [
                'https://graph.microsoft.com/Sites.Read.All',       // Read sites, libraries, files, versions
                'https://graph.microsoft.com/Sites.ReadWrite.All',  // Delete file versions
                'https://graph.microsoft.com/Sites.FullControl.All' // Optional: Update versioning settings via SharePoint REST
            ],
            redirectUri: this.redirectUri,
            prompt: 'consent' // Force consent screen to show permissions
        };
        
        // Add state parameter to track session ID
        if (state) {
            authUrlParameters.state = state;
        }

        return this.cca.getAuthCodeUrl(authUrlParameters);
    }

    async getTokenByCode(code) {
        if (!this.cca) {
            throw new Error('AuthService not configured. Please set your Azure App Registration credentials first.');
        }
        const tokenRequest = {
            code: code,
            scopes: [
                'https://graph.microsoft.com/Sites.Read.All',       // Read sites, libraries, files, versions
                'https://graph.microsoft.com/Sites.ReadWrite.All',  // Delete file versions
                'https://graph.microsoft.com/Sites.FullControl.All' // Optional: Update versioning settings via SharePoint REST
            ],
            redirectUri: this.redirectUri,
        };

        try {
            const response = await this.cca.acquireTokenByCode(tokenRequest);
            return response;
        } catch (error) {
            console.error('Error acquiring token:', error);
            throw error;
        }
    }

    async getTokenSilent(account) {
        const silentRequest = {
            account: account,
            scopes: [
                'https://graph.microsoft.com/Sites.Read.All',       // Read sites, libraries, files, versions
                'https://graph.microsoft.com/Sites.ReadWrite.All',  // Delete file versions
                'https://graph.microsoft.com/Sites.FullControl.All' // Optional: Update versioning settings via SharePoint REST
            ],
        };

        try {
            const response = await this.cca.acquireTokenSilent(silentRequest);
            return response;
        } catch (error) {
            console.error('Error acquiring token silently:', error);
            throw error;
        }
    }

    // Get SharePoint-specific token for REST API calls
    async getSharePointToken(account, sharePointDomain) {
        if (!this.cca) {
            throw new Error('AuthService not configured.');
        }
        
        // SharePoint scope format: https://<tenant>.sharepoint.com/.default
        const scopes = [`https://${sharePointDomain}/.default`];
        
        const tokenRequest = {
            account: account,
            scopes: scopes
        };

        try {
            const response = await this.cca.acquireTokenSilent(tokenRequest);
            return response.accessToken;
        } catch (error) {
            console.error('Error acquiring SharePoint token:', error.message);
            // Try to get with different scope format
            try {
                const altScopes = [`https://${sharePointDomain}/AllSites.FullControl`];
                const altResponse = await this.cca.acquireTokenSilent({
                    account: account,
                    scopes: altScopes
                });
                return altResponse.accessToken;
            } catch (altError) {
                console.error('Alternative SharePoint token acquisition also failed:', altError.message);
                throw error; // Throw original error
            }
        }
    }

    // App-only authentication (client credentials flow)
    async getAppOnlyToken() {
        const tokenRequest = {
            scopes: ['https://graph.microsoft.com/.default'] // App permissions
        };

        try {
            const response = await this.cca.acquireTokenByClientCredential(tokenRequest);
            return {
                accessToken: response.accessToken,
                expiresOn: new Date(Date.now() + (response.expiresIn || 3600) * 1000),
                account: null, // No user account for app-only
                authType: 'app'
            };
        } catch (error) {
            console.error('Error acquiring app-only token:', error);
            throw error;
        }
    }

    // Attempt to acquire delegated SharePoint token using silent flow
    async getSharePointTokenSilent(account) {
        if (!process.env.SHAREPOINT_HOST) {
            return null; // Host not configured
        }
        const scopes = [`https://${process.env.SHAREPOINT_HOST}/AllSites.FullControl`];
        const request = { account, scopes };
        try {
            const response = await this.cca.acquireTokenSilent(request);
            return response.accessToken;
        } catch (error) {
            // interaction_required means user must consent explicitly
            if (error.errorCode === 'interaction_required') {
                console.log('SharePoint delegated consent required (interaction).');
            } else {
                console.log('Silent SharePoint token acquisition failed:', error.message);
            }
            return null;
        }
    }

    // Build consent URL for SharePoint delegated permission if silent failed
    getSharePointAuthUrl(account) {
        if (!process.env.SHAREPOINT_HOST) {
            throw new Error('SHAREPOINT_HOST not configured');
        }
        return this.cca.getAuthCodeUrl({
            scopes: [`https://${process.env.SHAREPOINT_HOST}/AllSites.FullControl`],
            redirectUri: process.env.REDIRECT_URI,
            prompt: 'consent'
        });
    }
}

module.exports = AuthService;