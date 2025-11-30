/* Shared Navigation Bar Component */

export function createNavBar(currentPage = 'home') {
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    
    return `
        <header class="app-header">
            <div class="app-header-content">
                <a href="/beta/index.html" class="app-logo">
                    <img src="/favicon.svg" alt="Sharepointer" class="app-logo-icon" width="32" height="32">
                    <div class="app-title">
                        Sharepointer
                        <span class="beta-badge">Beta</span>
                    </div>
                </a>
                
                <nav class="app-nav">
                    <a href="/beta/index.html" class="nav-link ${currentPage === 'home' ? 'active' : ''}">
                        <i class="fas fa-home"></i> Sites
                    </a>
                    <a href="/analytics.html" class="nav-link ${currentPage === 'analytics' ? 'active' : ''}">
                        <i class="fas fa-chart-bar"></i> Analytics
                    </a>
                    ${isAdmin ? `
                        <a href="/admin-logs.html" class="nav-link ${currentPage === 'admin' ? 'active' : ''}">
                            <i class="fas fa-shield-alt"></i> Admin
                        </a>
                    ` : ''}
                    <div class="nav-divider"></div>
                    <div class="flex items-center gap-3">
                        <label class="text-xs" for="languageSelect">Lang</label>
                        <select id="languageSelect" class="input" style="width:auto; padding-right: var(--space-6);">
                            <option value="nl">NL</option>
                            <option value="en">EN</option>
                        </select>
                    </div>
                </nav>
            </div>
        </header>
    `;
}

// Shared navigation styles
export const navBarStyles = `
    .app-header {
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
        box-shadow: var(--shadow-sm);
    }

    .app-header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4);
        max-width: 1400px;
        margin: 0 auto;
    }

    .app-logo {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        text-decoration: none;
        color: var(--color-text);
        transition: transform 0.2s ease;
    }

    .app-logo:hover {
        transform: translateY(-2px);
    }

    .app-logo-icon {
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
    }

    .app-logo i {
        font-size: var(--text-2xl);
        color: var(--color-primary);
    }

    .app-title {
        font-size: var(--text-xl);
        font-weight: var(--font-bold);
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .beta-badge {
        font-size: var(--text-xs);
        padding: 2px 8px;
        background: linear-gradient(135deg, var(--color-primary), var(--color-info));
        color: white;
        border-radius: var(--radius-full);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: var(--font-bold);
    }

    .app-nav {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }

    .nav-link {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-md);
        text-decoration: none;
        color: var(--color-text-secondary);
        font-weight: var(--font-medium);
        transition: all var(--transition-base);
    }

    .nav-link:hover {
        background: var(--color-background);
        color: var(--color-primary);
    }

    .nav-link.active {
        background: var(--color-primary-light);
        color: var(--color-primary);
    }

    .nav-divider {
        width: 1px;
        height: 24px;
        background: var(--color-border);
        margin: 0 var(--space-2);
    }
`;
