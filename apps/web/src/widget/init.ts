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

  // Create host div
  const host = document.createElement('div');
  host.id = 'grad-widget-host';
  host.style.position = 'fixed';
  host.style.bottom = '16px';
  host.style.right = '16px';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none'; // So only widget itself handles clicks
  host.style.width = 'auto';
  host.style.height = 'auto';

  document.body.appendChild(host);

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
