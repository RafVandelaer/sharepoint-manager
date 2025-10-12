const { ConfidentialClientApplication } = require('@azure/msal-node');

class AuthService {
    constructor() {
        this.msalConfig = {
            auth: {
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`
            }
        };
        this.cca = new ConfidentialClientApplication(this.msalConfig);
    }

    getAuthUrl() {
        const authUrlParameters = {
            scopes: [
                'https://graph.microsoft.com/Sites.Read.All',
                'https://graph.microsoft.com/Sites.ReadWrite.All',
                'https://graph.microsoft.com/Sites.Manage.All'
            ],
            redirectUri: process.env.REDIRECT_URI,
        };

        return this.cca.getAuthCodeUrl(authUrlParameters);
    }

    async getTokenByCode(code) {
        const tokenRequest = {
            code: code,
            scopes: [
                'https://graph.microsoft.com/Sites.Read.All',
                'https://graph.microsoft.com/Sites.ReadWrite.All',
                'https://graph.microsoft.com/Sites.Manage.All'
            ],
            redirectUri: process.env.REDIRECT_URI,
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
                'https://graph.microsoft.com/Sites.Read.All',
                'https://graph.microsoft.com/Sites.ReadWrite.All',
                'https://graph.microsoft.com/Sites.Manage.All'
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
}

module.exports = AuthService;