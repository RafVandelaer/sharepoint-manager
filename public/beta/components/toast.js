// Toast Notification Component
import { Component, h } from '../lib/component.js';

class Toast extends Component {
  constructor() {
    super('#toastContainer');
    this.toasts = [];
  }

  show(message, type = 'info', duration = 5000) {
    const id = `toast-${Date.now()}-${Math.random()}`;
    
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    const toast = h('div', { class: `toast ${type}`, id },
      h('i', { class: `fas ${icons[type]} toast-icon` }),
      h('div', { class: 'toast-content' },
        h('div', { class: 'toast-message' }, message)
      ),
      h('button', {
        class: 'toast-close',
        onclick: () => this.remove(id)
      }, '×')
    );

    this.el.appendChild(toast);
    this.toasts.push({ id, element: toast });

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  remove(id) {
    const toast = this.toasts.find(t => t.id === id);
    if (toast) {
      toast.element.style.animation = 'slideOutRight 0.3s forwards';
      setTimeout(() => {
        toast.element.remove();
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 300);
    }
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  clear() {
    this.toasts.forEach(t => t.element.remove());
    this.toasts = [];
  }
}

// Add slide out animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOutRight {
    to {
      transform: translateX(120%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

export const toast = new Toast();
