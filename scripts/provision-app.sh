#!/usr/bin/env bash
set -euo pipefail

# Provision or update Azure AD (Entra ID) app registration for Sharepointer.
# REQUIREMENTS:
# - Azure CLI installed (`az login` already done as tenant admin)
# - Permissions: Directory access to create applications
# - This script idempotently creates/updates the app
#
# It will:
# 1. Create app if missing
# 2. Ensure redirect URI http://localhost:3000/auth/callback
# 3. Assign Microsoft Graph application permissions: Sites.Read.All, Sites.ReadWrite.All, Sites.Manage.All, User.Read
# 4. Create a client secret (prints VALUE once)
# 5. Output JSON config you can paste into config/appConfig.js
# 6. Request admin consent (manual step shown)

APP_NAME="SharePointManager"
REDIRECT_URI="http://localhost:3000/auth/callback"
GRAPH_PERMS=("Sites.Read.All" "Sites.ReadWrite.All" "Sites.Manage.All" "User.Read")

echo "[INFO] Checking existing app registration: $APP_NAME"
APP_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv || true)

if [[ -z "$APP_ID" ]]; then
  echo "[INFO] Creating new app registration..."
  APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --web-redirect-uris "$REDIRECT_URI" \
    --query appId -o tsv)
  echo "[OK] Created app with Application (client) ID: $APP_ID"
else
  echo "[INFO] App already exists (clientId=$APP_ID). Ensuring redirect URI is present..."
  CURRENT_URIS=$(az ad app show --id "$APP_ID" --query 'web.redirectUris' -o tsv)
  if ! grep -q "$REDIRECT_URI" <<< "$CURRENT_URIS"; then
    echo "[INFO] Adding missing redirect URI..."
    az ad app update --id "$APP_ID" --web-redirect-uris "$CURRENT_URIS" "$REDIRECT_URI" >/dev/null
    echo "[OK] Redirect URI added."
  else
    echo "[OK] Redirect URI already present."
  fi
fi

echo "[INFO] Creating service principal (if absent)..."
az ad sp create --id "$APP_ID" >/dev/null 2>&1 || true

SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
if [[ -z "$SP_OBJECT_ID" ]]; then
  echo "[ERROR] Failed to retrieve service principal. Exiting." >&2
  exit 1
fi
echo "[OK] Service principal id: $SP_OBJECT_ID"

echo "[INFO] Resolving Microsoft Graph appId..."
GRAPH_APP_ID=$(az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000000'" --query '[0].appId' -o tsv)
if [[ -z "$GRAPH_APP_ID" ]]; then
  echo "[ERROR] Cannot resolve Microsoft Graph service principal." >&2
  exit 1
fi

echo "[INFO] Fetching Microsoft Graph delegated & application permissions catalog..."
PERM_DATA=$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals?
$filter=appId eq '$GRAPH_APP_ID'&$select=appRoles" 2>/dev/null || true)

assign_permission() {
  local PERM_NAME="$1"
  local ROLE_ID=$(echo "$PERM_DATA" | jq -r ".appRoles[] | select(.value == \"$PERM_NAME\" and .allowedMemberTypes[] == \"Application\") | .id")
  if [[ -z "$ROLE_ID" || "$ROLE_ID" == "null" ]]; then
    echo "[WARN] Permission $PERM_NAME not found in Graph app roles for application assignment"
    return
  fi
  # Check if already assigned
  local EXISTING=$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_OBJECT_ID/appRoleAssignments" | jq -r ".value[] | select(.appRoleId == \"$ROLE_ID\") | .id")
  if [[ -n "$EXISTING" ]]; then
    echo "[OK] $PERM_NAME already assigned"
  else
    echo "[INFO] Assigning $PERM_NAME..."
    az rest --method POST --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_OBJECT_ID/appRoleAssignments" \
      --body "{\n  \"principalId\": \"$SP_OBJECT_ID\",\n  \"resourceId\": \"$(az ad sp list --filter \"appId eq '$GRAPH_APP_ID'\" --query '[0].id' -o tsv)\",\n  \"appRoleId\": \"$ROLE_ID\"\n}" >/dev/null
    echo "[OK] Assigned $PERM_NAME"
  fi
}

echo "[INFO] Assigning application permissions (requires admin later to grant consent)..."
for p in "${GRAPH_PERMS[@]}"; do
  assign_permission "$p"
done

echo "[INFO] Creating client secret (1 year validity) ..."
SECRET_VALUE=$(az ad app credential reset --id "$APP_ID" --append --years 1 --query password -o tsv)
echo "[OK] Client secret created (save this NOW)."

TENANT_ID=$(az account show --query tenantId -o tsv)

cat <<ENV

=== Paste into .env file (or set as environment variables) ===
TENANT_ID=$TENANT_ID
CLIENT_ID=$APP_ID
CLIENT_SECRET=$SECRET_VALUE
REDIRECT_URI=$REDIRECT_URI
GRAPH_API_URL=https://graph.microsoft.com/v1.0
PORT=3000
=== END ===

ENV

echo "NEXT STEP: Grant admin consent. In Portal: App registrations > $APP_NAME > API permissions > Grant admin consent."
echo "Or run: az ad app permission admin-consent --id $APP_ID (requires tenant admin)."
echo "Done." 
