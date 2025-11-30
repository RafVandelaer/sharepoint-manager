// Site Card Component
import { Component, h, formatDate } from '../lib/component.js';
import { t } from '../lib/i18n.js';

export class SiteCard extends Component {
  constructor(siteData, container) {
    super(container);
    this.data = siteData;
  }

  render() {
    const { id, displayName, name, description, webUrl } = this.data;
    const siteName = displayName || name || t('unnamedSite');
    const siteDesc = description || t('noDescription');
    const cleanUrl = webUrl ? webUrl.replace(/^https?:\/\//, '') : '';

    // Read last cleanup history from localStorage (legacy history storage)
    let lastCleanupText = t('notCleanedYet');
    try {
      const historyKey = `cleanupHistory_${id}`; // Assuming history stored per site
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const entries = JSON.parse(raw);
        if (Array.isArray(entries) && entries.length > 0) {
          const last = entries[0]; // Assume newest first; adjust if needed
          if (last.timestamp) {
            const date = new Date(last.timestamp);
            lastCleanupText = formatDate(date.toISOString());
          }
        }
      }
    } catch (e) {
      // Swallow parsing errors silently
    }

    const card = h('div', { class: 'site-card', 'data-site-id': id },
      h('div', { class: 'site-card-header' },
        // Selection checkbox
        h('div', { class: 'site-select' },
          h('input', {
            type: 'checkbox',
            class: 'site-select-checkbox',
            'aria-label': `${t('selectSite')} ${siteName}`,
            onchange: (e) => {
              e.stopPropagation();
              const isSelected = e.target.checked;
              this.emit('selectionChanged', { siteId: id, selected: isSelected });
              // Update card visual state
              if (isSelected) {
                card.classList.add('selected');
              } else {
                card.classList.remove('selected');
              }
            }
          })
        ),
        h('div', { class: 'site-icon' },
          h('i', { class: 'fas fa-sitemap' })
        ),
        h('div', { class: 'site-info' },
          h('div', { class: 'site-title' }, siteName),
          h('div', { class: 'site-description' }, siteDesc)
        )
      ),
      h('div', { class: 'site-url' }, cleanUrl),
      h('div', { class: 'text-xs', style: 'margin-top: var(--space-2); color: var(--color-text-secondary);' },
        h('i', { class: 'fas fa-history', style: 'margin-right: 4px;' }),
        h('span', { 'data-i18n': 'lastCleanup' }, t('lastCleanup')),
        ': ', lastCleanupText
      ),
      h('div', { class: 'site-actions' },
        h('button', {
          class: 'btn btn-sm btn-outline',
          style: 'flex: 1;',
          onclick: (e) => {
            e.stopPropagation();
            this.emit('viewDetails', { siteId: id });
          }
        },
          h('i', { class: 'fas fa-info-circle' }),
          t('details')
        ),
        h('button', {
          class: 'btn btn-sm btn-primary',
          style: 'flex: 1;',
          onclick: (e) => {
            e.stopPropagation();
            this.emit('startCleanup', { siteId: id });
          }
        },
          h('i', { class: 'fas fa-broom' }),
          t('cleanup')
        )
      )
    );

    // Make whole card clickable - same as cleanup button
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking checkbox or buttons
      if (e.target.closest('.site-select-checkbox') || e.target.closest('.btn')) {
        return;
      }
      this.emit('startCleanup', { siteId: id });
    });

    this.el.innerHTML = '';
    this.el.appendChild(card);
    return card;
  }

  static renderSkeleton(container) {
    const skeleton = h('div', { class: 'site-card' },
      h('div', { class: 'site-card-header' },
        h('div', { class: 'skeleton', style: 'width: 20px; height: 20px; border-radius: var(--radius-sm);' }),
        h('div', { class: 'skeleton', style: 'width: 48px; height: 48px; border-radius: var(--radius-md);' }),
        h('div', { class: 'site-info', style: 'flex: 1;' },
          h('div', { class: 'skeleton', style: 'height: 20px; width: 60%; margin-bottom: var(--space-2);' }),
          h('div', { class: 'skeleton', style: 'height: 16px; width: 80%;' })
        )
      ),
      h('div', { class: 'skeleton', style: 'height: 14px; width: 50%; margin-top: var(--space-2);' }),
      h('div', { class: 'skeleton', style: 'height: 12px; width: 40%; margin-top: var(--space-2);' }),
      h('div', { class: 'site-actions' },
        h('div', { class: 'skeleton', style: 'height: 32px; flex: 1;' }),
        h('div', { class: 'skeleton', style: 'height: 32px; flex: 1;' })
      )
    );

    container.appendChild(skeleton);
  }
}
