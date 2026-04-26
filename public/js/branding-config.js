/**
 * Branding Configuration
 * Centralized branding asset paths and settings
 */

const BRANDING = {
  // Image paths (relative to /public)
  images: {
    favicon: '/images/branding/favicon.ico',
    logoDark: '/images/branding/logo-dark.png',
    mascotFull: '/images/branding/mascot-full.png',
    mascotSmall: '/images/branding/mascot-small.png',
    mascotError: '/images/branding/mascot-error.png',
  },

  // Brand colors (matching dashboard theme)
  colors: {
    primary: '#3b82f6',        // Blue
    accent: '#22d3ee',         // Cyan
    secondary: '#fbbf24',      // Yellow/Gold
    success: '#22c55e',        // Green
    warning: '#f59e0b',        // Orange
    danger: '#ef4444',         // Red
  },

  // Text strings for empty/error states
  text: {
    empty: 'Nothing here yet',
    loading: 'Loading...',
    error: 'Oops! Something went wrong',
    retry: 'Try again',
  },

  // Animation settings
  animation: {
    spinnerDuration: 1000,     // ms
    bounceDuration: 800,       // ms
  },
};

/**
 * Create a mascot loader element
 * @param {string} message - Optional loading message
 * @returns {HTMLElement}
 */
function createMascotLoader(message = 'Loading...') {
  const div = document.createElement('div');
  div.className = 'mascot-loader';
  div.innerHTML = `
    <img src="${BRANDING.images.mascotSmall}" alt="Loading mascot" style="width:100px;height:100px">
    <div class="mascot-loader-text">${escapeHtml(message)}</div>
  `;
  return div;
}

/**
 * Create an empty state element
 * @param {string} title - Empty state title
 * @param {string} message - Optional message
 * @returns {HTMLElement}
 */
function createEmptyState(title = 'Nothing here yet', message = '') {
  const div = document.createElement('div');
  div.className = 'empty-state-mascot';
  div.innerHTML = `
    <img src="${BRANDING.images.mascotFull}" alt="Empty state mascot">
    <div>
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    </div>
  `;
  return div;
}

/**
 * Create an error state element
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @returns {HTMLElement}
 */
function createErrorState(title = 'Oops! Something went wrong', message = '') {
  const div = document.createElement('div');
  div.className = 'error-mascot';
  div.innerHTML = `
    <img src="${BRANDING.images.mascotError}" alt="Error mascot" style="width:100px;height:100px">
    <div class="error-mascot-content">
      <h4>${escapeHtml(title)}</h4>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    </div>
  `;
  return div;
}

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Set favicon dynamically
 */
function setBranding() {
  const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
  link.rel = 'icon';
  link.href = BRANDING.images.favicon;
  if (!link.parentNode) {
    document.head.appendChild(link);
  }
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setBranding);
} else {
  setBranding();
}
