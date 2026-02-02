import initWidget from './init';

// In dev: expose global helper and do NOT auto-init
if (import.meta.env.DEV) {
  (window as any).GradWidgetDevInit = (cfg: any) => initWidget(cfg);
}

// In production: auto-init by reading data-* from script tag
if (import.meta.env.PROD) {
  initWidget();
}

// Export for manual initialization in dev
export default initWidget;
