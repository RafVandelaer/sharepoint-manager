// Base Component Class for modular UI components
export class Component {
  constructor(selector) {
    this.el = selector instanceof HTMLElement 
      ? selector 
      : document.querySelector(selector);
    
    if (!this.el) {
      console.warn(`Component: Element not found for selector "${selector}"`);
    }
    
    this.state = {};
    this.listeners = new Map();
  }

  // Render method to be overridden by child classes
  render() {
    throw new Error('render() must be implemented by child class');
  }

  // Set component state and trigger re-render
  setState(newState) {
    const changed = Object.keys(newState).some(
      key => this.state[key] !== newState[key]
    );
    
    if (changed) {
      this.state = { ...this.state, ...newState };
      this.render();
    }
  }

  // Event delegation helper (within component element)
  on(selectorOrEvent, eventOrHandler, handlerOrUndefined) {
    // Support two signatures:
    // 1. on(selector, event, handler) - delegate within this.el
    // 2. on(event, handler) - attach to this.el directly
    
    if (typeof eventOrHandler === 'function') {
      // Signature 2: on(event, handler)
      const event = selectorOrEvent;
      const handler = eventOrHandler;
      this.el?.addEventListener(event, handler);
      this.listeners.set(`direct:${event}`, handler);
    } else {
      // Signature 1: on(selector, event, handler)
      const selector = selectorOrEvent;
      const event = eventOrHandler;
      const handler = handlerOrUndefined;
      
      const wrappedHandler = (e) => {
        const target = e.target.closest(selector);
        if (target && this.el.contains(target)) {
          handler.call(target, e);
        }
      };
      
      this.el?.addEventListener(event, wrappedHandler);
      this.listeners.set(`${event}:${selector}`, wrappedHandler);
    }
  }

  // Remove event listeners
  off(event, selector) {
    const key = `${event}:${selector}`;
    const handler = this.listeners.get(key);
    
    if (handler) {
      this.el.removeEventListener(event, handler);
      this.listeners.delete(key);
    }
  }

  // Clean up component
  destroy() {
    this.listeners.forEach((handler, key) => {
      const [event] = key.split(':');
      this.el.removeEventListener(event, handler);
    });
    this.listeners.clear();
    if (this.el) {
      this.el.innerHTML = '';
    }
  }

  // Utility: query selector within component
  $(selector) {
    return this.el?.querySelector(selector);
  }

  // Utility: query all selectors within component
  $$(selector) {
    return this.el?.querySelectorAll(selector) || [];
  }

  // Show element (supports selector or uses this.el)
  show(selector) {
    if (selector) {
      const el = this.$(selector);
      if (el) {
        el.style.display = '';
        el.classList.remove('hidden');
        // Trigger reflow for animation
        void el.offsetWidth;
        el.style.opacity = '1';
      }
    } else if (this.el) {
      this.el.classList.remove('hidden');
      this.el.style.display = '';
      void this.el.offsetWidth;
      this.el.style.opacity = '1';
    }
  }

  // Hide element (supports selector or uses this.el)
  hide(selector) {
    if (selector) {
      const el = this.$(selector);
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.style.display = 'none';
        }, 200);
      }
    } else if (this.el) {
      this.el.style.opacity = '0';
      setTimeout(() => {
        this.el.classList.add('hidden');
      }, 200);
    }
  }

  // Toggle visibility
  toggle() {
    if (this.el) this.el.classList.toggle('hidden');
  }

  // Emit custom event
  emit(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      cancelable: true
    });
    this.el?.dispatchEvent(event);
  }

  // Listen to custom events
  listen(eventName, handler) {
    this.el?.addEventListener(eventName, handler);
  }
}

// Simple reactive store
export class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  setState(updates) {
    const changed = Object.keys(updates).some(
      key => this.state[key] !== updates[key]
    );

    if (changed) {
      this.state = { ...this.state, ...updates };
      this.notify();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Event Bus for cross-component communication
export class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
    
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event, data) {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  clear() {
    this.events.clear();
  }
}

// Singleton instances
export const eventBus = new EventBus();
export const appStore = new Store({
  sessionId: null,
  authType: null,
  sites: [],
  currentSite: null,
  lang: localStorage.getItem('lang') || 'nl',
  loading: false,
  error: null,
  sharePointRestToken: null
});

// Utility: debounce
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility: throttle
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Utility: format file size
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Utility: format date
export function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Utility: escape HTML
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Utility: create element
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class' || key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'style' && typeof value === 'string') {
      el.setAttribute('style', value);
    } else if (key.startsWith('on')) {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  });
  
  // Support HTML strings for children
  const flatChildren = children.flat();
  if (flatChildren.length === 1 && typeof flatChildren[0] === 'string' && flatChildren[0].includes('<')) {
    el.innerHTML = flatChildren[0];
  } else {
    flatChildren.forEach(child => {
      if (child instanceof Node) {
        el.appendChild(child);
      } else if (child != null) {
        el.appendChild(document.createTextNode(String(child)));
      }
    });
  }
  
  return el;
}
