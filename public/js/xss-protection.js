/**
 * XSS Protection Utility - HTML Sanitization
 * 
 * This file provides utilities to prevent XSS attacks by escaping HTML content.
 * Include this file BEFORE any other JavaScript that handles user-generated content.
 * 
 * Usage:
 *   const safe = escapeHtml(userInput);
 *   element.innerHTML = safe; // Now safe from XSS
 * 
 * Better approach (no innerHTML at all):
 *   element.textContent = userInput; // Automatically escaped
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} unsafe - Potentially dangerous user input
 * @returns {string} - HTML-safe string
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Create a DOM element with safe text content
 * Preferred method - avoids innerHTML entirely
 * 
 * @param {string} tag - HTML tag name
 * @param {Object} options - Configuration object
 * @param {string} options.text - Text content (auto-escaped)
 * @param {string} options.className - CSS class
 * @param {Object} options.attributes - Additional attributes
 * @returns {HTMLElement} - Safe DOM element
 */
function createSafeElement(tag, options = {}) {
    const element = document.createElement(tag);
    
    if (options.text) {
        element.textContent = options.text;
    }
    
    if (options.className) {
        element.className = options.className;
    }
    
    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
    
    return element;
}

/**
 * Safely set HTML content with user data
 * Only use when you need rich HTML formatting
 * All user data should be escaped first
 * 
 * @param {HTMLElement} element - Target element
 * @param {string} template - HTML template with ${} placeholders
 * @param {Object} data - User data to escape and insert
 */
function setSafeHTML(element, template, data) {
    const escapedData = {};
    Object.entries(data).forEach(([key, value]) => {
        escapedData[key] = escapeHtml(value);
    });
    
    element.innerHTML = Object.entries(escapedData).reduce((html, [key, value]) => {
        return html.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }, template);
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml, createSafeElement, setSafeHTML };
}
