import React from 'react';
import { createRoot } from 'react-dom/client';
import WidgetApp from './WidgetApp';

export interface WidgetConfig {
  cityId: string;
  apiBaseUrl?: string;
  lang?: string;
  theme?: {
    primary?: string;
    secondary?: string;
    logoUrl?: string;
  };
}

export interface PartialConfig {
  cityId?: string;
  apiBaseUrl?: string;
  lang?: string;
  theme?: {
    primary?: string;
    secondary?: string;
    logoUrl?: string;
  };
}

function initWidget(overrideConfig?: PartialConfig): void {
  // If overrideConfig is provided, use it directly (dev helper)
  if (overrideConfig) {
    if (!overrideConfig.cityId) {
      console.warn('GradWidget: cityId is required');
      return;
    }
    mountWidget({
      cityId: overrideConfig.cityId,
      apiBaseUrl: overrideConfig.apiBaseUrl,
      lang: overrideConfig.lang,
      theme: overrideConfig.theme,
    });
    return;
  }

  // Otherwise, find the script tag that loaded widget.js
  let scriptTag: HTMLScriptElement | null = null;

  // Try document.currentScript first
  if (document.currentScript && document.currentScript instanceof HTMLScriptElement) {
    scriptTag = document.currentScript;
  } else {
    // Fallback: querySelector
    scriptTag = document.querySelector('script[src*="widget.js"]') as HTMLScriptElement;
  }

  if (!scriptTag) {
    console.warn('GradWidget: Could not find script tag');
    return;
  }

  // Determine cityId with fallback logic:
  // 0. Force 'demo' on gradai.mangai.hr or civisai.mangai.hr (production override)
  // 1. URL parameter ?city=X (highest priority for non-production)
  // 2. data-city-id or data-city attribute on script tag
  // 3. Otherwise fail if missing (backward compatibility)
  let cityId: string | undefined;
  
  // Production override: force 'demo' on gradai.mangai.hr or civisai.mangai.hr
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'gradai.mangai.hr' || window.location.hostname === 'civisai.mangai.hr')) {
    cityId = 'demo';
  } else {
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const cityParam = urlParams.get('city');
    if (cityParam) {
      cityId = cityParam;
    }
    
    // Check data-city-id or data-city attribute second
    if (!cityId) {
      cityId = scriptTag.dataset.cityId || scriptTag.dataset.city;
    }
  }
  
  // Fail-safe: do nothing if cityId is still missing
  if (!cityId) {
    console.warn('GradWidget: cityId is required. Provide ?city=X in URL, data-city attribute, or use on gradai.mangai.hr');
    return;
  }

  const apiBaseUrl = scriptTag.dataset.apiBaseUrl || scriptTag.dataset.apiBase;
  const lang = scriptTag.dataset.lang;
  const primary = scriptTag.dataset.primary;
  const secondary = scriptTag.dataset.secondary;
  const logo = scriptTag.dataset.logo;

  mountWidget({
    cityId,
    apiBaseUrl: apiBaseUrl || undefined,
    lang: lang || undefined,
    theme: {
      primary: primary || undefined,
      secondary: secondary || undefined,
      logoUrl: logo || undefined,
    },
  });
}

function mountWidget(config: WidgetConfig): void {
  // Check if already mounted
  if (document.getElementById('grad-widget-host')) {
    return;
  }

  // Check if we're on an admin route
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  // Create wrapper container for widget and label
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.bottom = '16px';
  wrapper.style.right = '16px';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'flex-end';
  wrapper.style.gap = '0.5rem';
  wrapper.style.pointerEvents = 'none'; // So only widget itself handles clicks
  wrapper.style.maxWidth = 'calc(100vw - 32px)'; // Prevent overflow on mobile

  // Create host div
  const host = document.createElement('div');
  host.id = 'grad-widget-host';
  host.style.pointerEvents = 'none'; // So only widget itself handles clicks
  host.style.width = 'auto';
  host.style.height = 'auto';

  wrapper.appendChild(host);

  // Add admin label if on admin route
  if (isAdminRoute) {
    const label = document.createElement('div');
    label.id = 'grad-widget-admin-label';
    label.textContent = 'Widget građanina (demo)';
    label.style.cssText = `
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 0.75rem;
      color: #6b7280;
      background-color: rgba(255, 255, 255, 0.9);
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
    `;
    wrapper.insertBefore(label, host);
  }

  document.body.appendChild(wrapper);

  // Update label visibility when route changes (for SPA navigation)
  if (typeof window !== 'undefined') {
    let lastPathname = window.location.pathname;
    
    const updateLabelVisibility = () => {
      const currentPathname = window.location.pathname;
      // Only update if pathname actually changed
      if (currentPathname === lastPathname) return;
      lastPathname = currentPathname;
      
      const currentIsAdmin = currentPathname.startsWith('/admin');
      const existingLabel = document.getElementById('grad-widget-admin-label');
      
      if (currentIsAdmin && !existingLabel && wrapper) {
        // Add label
        const label = document.createElement('div');
        label.id = 'grad-widget-admin-label';
        label.textContent = 'Widget građanina (demo)';
        label.style.cssText = `
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: clamp(0.625rem, 2vw, 0.75rem);
          color: #6b7280;
          background-color: rgba(255, 255, 255, 0.9);
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          pointer-events: none;
          white-space: nowrap;
          user-select: none;
          max-width: calc(100vw - 80px);
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        wrapper.insertBefore(label, host);
      } else if (!currentIsAdmin && existingLabel) {
        // Remove label
        existingLabel.remove();
      }
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', updateLabelVisibility);

    // Listen for pushstate/replacestate (programmatic navigation, including React Router)
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function(...args) {
      originalPushState.apply(window.history, args);
      setTimeout(updateLabelVisibility, 0);
    };
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(window.history, args);
      setTimeout(updateLabelVisibility, 0);
    };

    // Fallback: check periodically (every 1s) in case React Router uses other methods
    // This is lightweight and only runs when widget is mounted
    const checkInterval = setInterval(() => {
      if (window.location.pathname !== lastPathname) {
        updateLabelVisibility();
      }
    }, 1000);

    // Cleanup interval when widget is unmounted (if host is removed)
    const observer = new MutationObserver(() => {
      if (!document.getElementById('grad-widget-host')) {
        clearInterval(checkInterval);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Attach Shadow DOM
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Inject styles into shadow root
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
    }
    #grad-widget-root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      pointer-events: auto;
    }
    #grad-widget-root a {
      text-decoration: underline;
      cursor: pointer;
    }
    #grad-widget-root a:hover {
      text-decoration: underline;
      text-decoration-thickness: 2px;
    }
    #grad-widget-root a:focus {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  `;
  shadowRoot.appendChild(style);

  // Create inner div for React root
  const rootDiv = document.createElement('div');
  rootDiv.id = 'grad-widget-root';
  rootDiv.style.pointerEvents = 'auto';
  rootDiv.style.width = 'auto';
  rootDiv.style.height = 'auto';
  rootDiv.style.position = 'relative';
  shadowRoot.appendChild(rootDiv);

  // Mount React
  const root = createRoot(rootDiv);
  root.render(React.createElement(WidgetApp, { config }));
}

export default initWidget;
