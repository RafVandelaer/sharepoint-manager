/**
 * Config Management - Handle Azure App Registration credentials via browser
 * No environment variables, fully self-service
 */

import { api } from './api.js';
import { state } from './state.js';

export function setupConfigModal() {
    const loginModal = document.getElementById('loginModal');
    const closeBtn = document.getElementById('closeLoginModal');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const showInstructionsBtn = document.getElementById('showSetupInstructionsBtn');
    const setupInstructions = document.getElementById('setupInstructions');
    const redirectUriDisplay = document.getElementById('redirectUriDisplay');

    // Set redirect URI display
    if (redirectUriDisplay) {
        redirectUriDisplay.textContent = `${window.location.origin}/auth/callback`;
    }

    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            loginModal.style.display = 'none';
        });
    }

    // Toggle setup instructions
    if (showInstructionsBtn) {
        showInstructionsBtn.addEventListener('click', () => {
            const isHidden = setupInstructions.style.display === 'none';
            setupInstructions.style.display = isHidden ? 'block' : 'none';
            showInstructionsBtn.innerHTML = isHidden 
                ? '<i class="fas fa-eye-slash"></i> Hide Instructions'
                : '<i class="fas fa-question-circle"></i> Setup Instructions';
        });
    }

    // Save config and login
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', async () => {
            await saveConfig();
        });
    }

    // Close on outside click
    loginModal?.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
        }
    });

    // Enter key to save
    ['tenantId', 'clientId', 'clientSecret'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    saveConfig();
                }
            });
        }
    });
}

async function saveConfig() {
    const tenantId = document.getElementById('tenantId').value.trim();
    const clientId = document.getElementById('clientId').value.trim();
    const clientSecret = document.getElementById('clientSecret').value.trim();

    if (!tenantId || !clientId || !clientSecret) {
        showError('Alle velden zijn verplicht');
        return;
    }

    // Validate GUID format
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(tenantId)) {
        showError('Tenant ID is geen geldige GUID');
        return;
    }
    if (!guidRegex.test(clientId)) {
        showError('Client ID is geen geldige GUID');
        return;
    }

    try {
        const saveBtn = document.getElementById('saveConfigBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opslaan...';

        const response = await fetch('/api/auth/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tenantId,
                clientId,
                clientSecret,
                redirectUri: `${window.location.origin}/auth/callback`
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save configuration');
        }

        const data = await response.json();
        
        // Store session ID
        state.sessionId = data.sessionId;
        localStorage.setItem('sessionId', data.sessionId);

        // Clear form
        document.getElementById('tenantId').value = '';
        document.getElementById('clientId').value = '';
        document.getElementById('clientSecret').value = '';

        // Close modal
        document.getElementById('loginModal').style.display = 'none';

        // Show success
        showSuccess('Configuratie opgeslagen! Je kunt nu inloggen.');

        // Trigger login
        setTimeout(() => {
            if (typeof window.app !== 'undefined' && typeof window.app.login === 'function') {
                window.app.login();
            }
        }, 1000);

    } catch (error) {
        console.error('Error saving config:', error);
        showError(error.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save & Login';
    }
}

export async function checkConfigStatus() {
    const sessionId = state.sessionId || localStorage.getItem('sessionId');
    
    if (!sessionId) {
        return { hasConfig: false };
    }

    try {
        const response = await fetch('/api/auth/config/status', {
            headers: {
                'X-Session-ID': sessionId
            }
        });

        if (!response.ok) {
            return { hasConfig: false };
        }

        return await response.json();
    } catch (error) {
        console.error('Error checking config status:', error);
        return { hasConfig: false };
    }
}

export function showConfigModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    } else {
        alert('Error: ' + message);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}
