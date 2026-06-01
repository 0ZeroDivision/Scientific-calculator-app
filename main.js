const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const BLOCKED_DOMAINS = [
  'googletagmanager.com',
  'googlesyndication.com',
  'google-analytics.com',
  'analytics.google.com',
  'pagead2.googlesyndication.com',
  'infolinks.com',
  'resources.infolinks.com',
  'plausible.dongwuyuan.online',
  'doubleclick.net',
  'adservice.google.com',
  'cloudflareinsights.com',   // the CF beacon script
];

// ─── CSS injected via <style> before any paint ───────────────────────────────
// This goes in as early as possible (will-navigate / did-start-navigation).
// Hides every piece of chrome immediately; #calculatorContainer stays visible.
const HIDE_CHROME_CSS = `
  html, body, #__next {
    background: #1a1a1a !important;
    margin: 0 !important; padding: 0 !important;
    overflow: hidden !important;
    width: 100vw !important; height: 100vh !important;
  }
  /* Hide nav, sidebar, TOC, footer */
  .nextra-nav-container,
  nav.nextra-toc,
  .max-xl\\:nx-hidden,
  .motion-reduce\\:nx-transition-none,
  footer { display: none !important; }
  /* Hide affiliate / promo links and size-control buttons */
  main.flex.flex-col.items-center > a,
  main.flex.flex-col.items-center > div.relative:not(#calculatorContainer) {
    display: none !important;
  }
  /* Ad slots */
  .adsbygoogle,
  iframe[id^="aswift_"],
  iframe[id^="google_ads_frame"] { display: none !important; }

  /* Make all wrapper elements transparent flex-centers */
  div[dir="ltr"],
  #reach-skip-nav,
  article.nextra-content,
  main.nx-w-full,
  main.flex.flex-col.items-center,
  .nx-mx-auto.nx-flex {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;  /* CHANGED: stick to top, no vertical centering */
    width: 100% !important; height: 100% !important;
    max-width: 100% !important;
    min-height: unset !important;
    padding: 0 !important; margin: 0 !important;
    background: #1a1a1a !important;
    overflow: hidden !important;
  }
  #calculatorContainer {
    background: transparent !important;
    padding: 0 !important; margin: 0 auto !important;
    display: flex !important;
    align-items: flex-start !important;     /* CHANGED: align to top */
    justify-content: flex-start !important;
  }
  /* CRITICAL: override the inline left/top the site's JS sets on #calculatorDiv */
  #calculatorDiv {
    position: static !important;
    left: auto !important;
    top: auto !important;
    margin: 0 auto !important;
    margin-bottom: 0 !important;   /* ADDED: kill any bottom space */
    padding-bottom: 0 !important;  /* ADDED: kill any bottom padding */
  }
  #calculatorDiv, #calculatorDiv * { visibility: visible !important; }
`;

// ─── Kill analytics globals & remove ad nodes (injected at dom-ready) ────────
const CLEANUP_JS = `
(function() {
  window.gtag           = function() {};
  window.ga             = function() {};
  window.dataLayer      = { push: function() {} };
  window.adsbygoogle    = { loaded: true, push: function() {} };
  window.infolinks_pid  = undefined;
  window.infolinks_wsid = undefined;

  const AD_SEL = [
    'script[src*="googletagmanager"]',
    'script[src*="googlesyndication"]',
    'script[src*="google-analytics"]',
    'script[src*="infolinks"]',
    'script[src*="plausible"]',
    'script[src*="cloudflareinsights"]',
    'script[id="_next-ga-init"]',
    'script[id="_next-ga"]',
    'script[id="infolinks-config"]',
    'iframe[id^="aswift_"]',
    'iframe[id^="google_ads_frame"]',
  ].join(',');

  function purge() { document.querySelectorAll(AD_SEL).forEach(el => el.remove()); }
  purge();

  new MutationObserver(mutations => {
    let hit = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!node.tagName) continue;
        const src = (node.src || node.href || '').toLowerCase();
        const id  = (node.id  || '').toLowerCase();
        const cls = (typeof node.className === 'string' ? node.className : '').toLowerCase();
        if (src.includes('googletagmanager') || src.includes('googlesyndication') ||
            src.includes('google-analytics') || src.includes('infolinks') ||
            src.includes('plausible') || src.includes('cloudflareinsights') ||
            id === '_next-ga-init' || id === '_next-ga' || id.includes('infolinks') ||
            cls.includes('adsbygoogle')) {
          node.remove(); hit = true;
        }
      }
    }
    if (hit) purge();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

// ─── Fit & center the calculator, fighting the site's inline style ────────────
// The site sets left:572px on #calculatorDiv via JS AFTER our CSS injection,
// so we use a MutationObserver on the div's style attribute to re-center it
// every time the site touches it.
const FIT_JS = `
(function fitCalc() {
  const RATIO = 294.735 / 690;  // TI-84 width : height

  function applyFit(div) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let h = vh;  // CHANGED: use full viewport height (was vh * 0.96)
    let w = h * RATIO;
    if (w > vw * 0.96) { w = vw * 0.96; h = w / RATIO; }
    // Override inline styles directly so they beat any subsequent setAttribute
    div.style.setProperty('width',    w + 'px',    'important');
    div.style.setProperty('height',   h + 'px',    'important');
    div.style.setProperty('position', 'static',    'important');
    div.style.setProperty('left',     'auto',       'important');
    div.style.setProperty('top',      'auto',       'important');
    div.style.setProperty('margin',   '0 auto',     'important');
  }

  function attach(div) {
    applyFit(div);

    // Watch for the site re-setting the style attribute (it does this on resize)
    new MutationObserver(() => applyFit(div))
      .observe(div, { attributes: true, attributeFilter: ['style'] });

    window.addEventListener('resize', () => applyFit(div));
  }

  function waitForDiv() {
    const div = document.getElementById('calculatorDiv');
    if (div) { attach(div); return; }
    // Poll — the calculator initialises asynchronously after Next.js hydration
    const timer = setInterval(() => {
      const d = document.getElementById('calculatorDiv');
      if (d) { clearInterval(timer); attach(d); }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDiv);
  } else {
    waitForDiv();
  }
})();
`;

// ─── Persistent cache path (so files are cached between launches) ─────────────
// Mirrors what a real browser does — avoids re-downloading jquery-ui etc. each time.
function getSession() {
  return session.fromPartition('persist:ti84calc', { cache: true });
}

function createWindow() {
  const ses = getSession();

  // Block ad/tracking requests
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const blocked = BLOCKED_DOMAINS.some(d => details.url.toLowerCase().includes(d));
    callback({ cancel: blocked });
  });

  // Strip CSP so our injected CSS/JS isn't blocked
  ses.webRequest.onHeadersReceived((details, callback) => {
    const h = { ...details.responseHeaders };
    delete h['content-security-policy'];
    delete h['Content-Security-Policy'];
    delete h['x-frame-options'];
    delete h['X-Frame-Options'];
    callback({ responseHeaders: h });
  });

  const win = new BrowserWindow({
    width: 320,
    height: 750,        // KEPT as you requested
    minWidth: 260,
    minHeight: 580,
    resizable: true,
    title: 'TI-84 Calculator',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      session: ses,
    },
    autoHideMenuBar: true,
  });

  // ── Inject the hide-chrome CSS as early as possible ─────────────────────
  // did-start-navigation fires before any HTML is parsed — perfect to inject
  // a <style> block so the very first paint is already clean.
  win.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    win.webContents.insertCSS(HIDE_CHROME_CSS).catch(() => {});
  });

  // dom-ready: kill analytics globals and start the fit observer
  win.webContents.on('dom-ready', () => {
    win.webContents.executeJavaScript(CLEANUP_JS).catch(() => {});
    win.webContents.executeJavaScript(FIT_JS).catch(() => {});
  });

  win.setMenu(null);
  win.loadURL('https://ti84calc.com/ti84calc');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});