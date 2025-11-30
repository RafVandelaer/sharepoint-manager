# Azure App Registration Setup for SharePoint Manager

## Problem
Error: `AADSTS9002326: Cross-origin token redemption is permitted only for the 'Single-Page Application' client-type`

This means your app is registered as a **Web** application instead of a **Single-Page Application (SPA)**.

## Solution: Configure as SPA

### Step 1: Access Your App Registration
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** (or **Microsoft Entra ID**)
3. Click **App registrations** in the left menu
4. Find and click your app: `9e33b4ea-19df-4cdc-b3e9-1a285390da1f`

### Step 2: Update Platform Configuration
1. In your app, click **Authentication** in the left menu
2. Under **Platform configurations**:
   
   **If you see a "Web" platform:**
   - Click the **trash/delete icon** next to the Web platform
   - Confirm deletion
   
3. Click **+ Add a platform**
4. Select **Single-page application**
5. In the redirect URI field, add:
   ```
   http://localhost:3000/beta/
   ```
6. Click **Configure**

### Step 3: Configure Additional Settings
1. Scroll down to **Implicit grant and hybrid flows**
   - **Uncheck** all boxes (ID tokens, Access tokens) - SPA uses PKCE, not implicit flow
   
2. Under **Advanced settings**:
   - **Allow public client flows**: Set to **No**
   
3. Click **Save** at the top

### Step 4: Verify API Permissions
1. Click **API permissions** in the left menu
2. Ensure you have these **Microsoft Graph Delegated** permissions:
   - `Sites.Read.All`
   - `Sites.ReadWrite.All`
   - `Sites.Manage.All`
   
3. If any are missing:
   - Click **+ Add a permission**
   - Select **Microsoft Graph**
   - Select **Delegated permissions**
   - Search for and add the missing permissions
   
4. Click **Grant admin consent for [Your Tenant]** (requires admin)
5. Wait for status to show green checkmarks

### Step 5: Test
1. Refresh the SharePoint Manager beta UI: `http://localhost:3000/beta/`
2. Clear browser cache/localStorage if needed (F12 → Application → Clear storage)
3. Enter your Tenant ID and Client ID
4. Click "Configureer MSAL"
5. Click "Login Microsoft"
6. Complete the Microsoft login
7. You should be redirected back and see your SharePoint sites

## Troubleshooting

### Still getting AADSTS9002326?
- Double-check the platform type shows **Single-page application** (not Web)
- Ensure redirect URI is exactly: `http://localhost:3000/beta/`
- Try in an incognito/private browser window
- Clear all Azure AD cookies: `login.microsoftonline.com`

### Getting AADSTS50011 (redirect URI mismatch)?
- Verify the redirect URI in Azure **exactly** matches: `http://localhost:3000/beta/`
- Note the trailing slash `/` is important

### Access denied errors?
- Ensure admin consent is granted for all three Sites permissions
- Verify your account has access to SharePoint sites in your tenant

### For production deployment:
- Add production redirect URI (e.g., `https://yourdomain.com/beta/`)
- Never share Client ID or Tenant ID publicly
- SPA apps don't use client secrets (PKCE flow only)
