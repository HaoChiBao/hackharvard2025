/* content.js */
console.log('Tracker: _____content.js_____ loaded');

/* ---------- Public API (available even when checkout code is skipped) ---------- */
/* These prevent ReferenceErrors if other scripts call them on non-checkout pages */
window.getCurrentSession = window.getCurrentSession || (async function () {
  try {
    if (chrome?.storage?.local) {
      const r = await chrome.storage.local.get(['currentSession']);
      return r?.currentSession ?? null;
    }
  } catch {}
  try {
    const raw = localStorage.getItem('currentSession');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
});
window.addLocationHistoryEntry = window.addLocationHistoryEntry || (async () => {});
window.appendUniqueFullSession  = window.appendUniqueFullSession  || (async () => {});


/* ------------------------------- MAIN IIFE ---------------------------------- */
(async function () {
  const href = String(location.href || '');
  const isCheckout = href.toLowerCase().includes('checkout');
  console.log('Tracker: Current URL' + (isCheckout ? ' (checkout detected)' : '' ) + ':', href);

  /* ===================== STORAGE KEYS (shared) ===================== */
  const STORAGE_KEY = 'mouseSessions';
  const PURCHASE_FLAG_KEY = 'hasPurchasedOnThisDevice';
  const PURCHASE_HISTORY_KEY = 'purchaseHistory';          // [{t, amount, currency, url, deviceId, ip, locSummary}]
  const LOCATION_HISTORY_KEY = 'locationHistory';          // [{t, ip, locSummary}]
  const DEVICE_ID_KEY = 'deviceId';
  const LAST_FULL_SESSION_KEY = 'lastFullSession';         // most recent full sample payload
  const LAST_FULL_SESSIONS_KEY = 'lastFullSessions';       // ARRAY of unique full sessions by URL
  const CURRENT_SESSION_KEY = 'currentSession';            // live snapshot for the current page

  /* ===================== UTILS & STORAGE (shared) ===================== */
  function uuid() { return `${Date.now()}-${Math.random().toString(36).slice(2,10)}`; }
  function safeViewport(){ return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }; }

  async function storageGet(key) {
    try {
      if (chrome?.storage?.local) {
        const r = await chrome.storage.local.get([key]);
        return r[key];
      }
    } catch (e) { console.warn('Tracker: storageGet chrome.storage.local failed', e); }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch (e) {
      console.warn('Tracker: storageGet localStorage failed', e);
      return undefined;
    }
  }
  async function storageSet(key, value) {
    try {
      if (chrome?.storage?.local) { await chrome.storage.local.set({ [key]: value }); return; }
    } catch (e) { console.warn('Tracker: storageSet chrome.storage.local failed', e); }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('Tracker: storageSet localStorage failed', e); }
  }
  async function storagePushBounded(key, item, maxLen) {
    const arr = (await storageGet(key)) || [];
    arr.push(item);
    while (arr.length > maxLen) arr.shift();
    await storageSet(key, arr);
  }

  /* Always create a CURRENT_SESSION_KEY immediately on ANY page */
  (async function bootstrapCurrentSessionShell() {
    const existing = await storageGet(CURRENT_SESSION_KEY);
    const shell = {
      meta: {
        id: existing?.meta?.id || uuid(),
        startedAt: existing?.meta?.startedAt || new Date().toISOString(),
        url: href,
        viewport: safeViewport(),
        ua: navigator.userAgent
      },
      total: null,
      mousePosition: existing?.mousePosition || { n: 0, lastX: null, lastY: null, lastV: 0, avgV: 0, maxV: 0 },
      cadence: existing?.cadence || { n: 0 },
      pressure: existing?.pressure || { n: 0 },
      scroll: existing?.scroll || { n: 0 },
      rates: existing?.rates || { clicksPerMin: 0, inputsPerMin: 0, timeOnPageSecs: 0 },
      updatedAt: Date.now()
    };
    await storageSet(CURRENT_SESSION_KEY, shell);
  })();

  /* If NOT a checkout page, publish no-ops + shell and stop */
  if (!isCheckout) {
    console.log('Tracker: skipping – URL does not contain "checkout".');
    // Public no-ops already set at top; nothing else to do.
    return;
  }

  /* ===================== CONFIG (checkout-only) ===================== */
  const MOUSE_TRACKING_CFG = {
    sampleHz: 25,
    maxPoints: 2500,
    periodicSaveMs: 5000,
    startOnUrlRegex: /(checkout|cart|payment|billing|purchase)/i, // (unused now)
    checkoutFieldSelectors: [
      'input[name*="card"]',
      'input[name*="cc"]',
      'input[autocomplete="cc-number"]',
      'input[name*="cvv"]',
      'input[name*="cvc"]',
      'input[name*="expiry"]',
      'input[name*="exp"]',
      'input[name*="postal"]',
      'input[name*="zip"]',
      'input[name*="address"]'
    ],
    historyMaxLocations: 30,
    historyMaxPurchases: 50,
    sessionStoreMax: 50
  };

  /* ===================== PURCHASE / LOCATION HELPERS ===================== */
  async function getHasPurchasedFlag() {
    const v = await storageGet(PURCHASE_FLAG_KEY);
    return v === true || v === 'true' || v === 1 || v === '1';
  }
  async function setHasPurchasedFlagTrue() { await storageSet(PURCHASE_FLAG_KEY, true); }

  async function addLocationHistoryEntry(locSummary, ip) {
    await storagePushBounded(
      LOCATION_HISTORY_KEY,
      { t: Date.now(), ip: ip || null, locSummary: locSummary || '' },
      MOUSE_TRACKING_CFG.historyMaxLocations
    );
  }
  async function getPurchaseHistory() { return (await storageGet(PURCHASE_HISTORY_KEY)) || []; }
  async function appendPurchaseHistory(entry) {
    const bounded = (await getPurchaseHistory());
    bounded.push(entry);
    while (bounded.length > MOUSE_TRACKING_CFG.historyMaxPurchases) bounded.shift();
    await storageSet(PURCHASE_HISTORY_KEY, bounded);
  }
  function currencyAvg(history, currency) {
    const arr = history.filter(p => p.currency === currency).map(p => p.amount);
    if (!arr.length) return null;
    const sum = arr.reduce((a,b)=>a+b,0);
    return sum / arr.length;
  }

  /* expose real implementation for other scripts (overriding the no-op) */
  window.addLocationHistoryEntry = addLocationHistoryEntry;

  /* ===================== DEVICE / HEADLESS / GEO ===================== */
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  async function getOrCreateDeviceId() {
    let id = await storageGet(DEVICE_ID_KEY);
    if (!id) {
      const seed = [
        navigator.userAgent, navigator.platform, navigator.language,
        String(navigator.hardwareConcurrency || ''), String(navigator.deviceMemory || ''),
      ].join('|');
      id = `${uuid()}-${(seed.length + seed.split('').reduce((a,c)=>a+c.charCodeAt(0),0)).toString(36)}`;
      await storageSet(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function headlessSignals() {
    const reasons = [];
    if (navigator.webdriver) reasons.push('navigator.webdriver');
    try { if ((navigator.plugins || []).length === 0) reasons.push('no plugins'); } catch {}
    try {
      const c = document.createElement('canvas');
      const wgl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!wgl) reasons.push('no WebGL');
      else {
        const dbg = wgl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const renderer = wgl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
          if (String(renderer).toLowerCase().includes('swiftshader')) reasons.push('swiftshader renderer');
        }
      }
    } catch { reasons.push('webgl blocked'); }
    return { headlessLikely: reasons.length >= 2, reasons };
  }

  async function getDeviceLocation(timeoutMs = 12000) {
    if (!('geolocation' in navigator)) return { source: 'device', error: 'Geolocation API unavailable' };
    return new Promise((resolve) => {
      const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs };
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords || {};
          resolve({ source: 'device', lat: latitude, lon: longitude, accuracyMeters: typeof accuracy === 'number' ? accuracy : undefined });
        },
        (err) => resolve({ source: 'device', error: (err && err.message) || 'User denied or timed out' }),
        opts
      );
    });
  }
  async function getIpLocationViaBG() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'geoip' });
      if (resp && resp.ok) {
        const d = resp.data;
        return { source: 'ip', lat: d.lat, lon: d.lon, city: d.city, region: d.region, country: d.country, ip: d.ip, accuracyMeters: d.accuracyMeters };
      }
      return { source: 'ip', error: (resp && resp.error) || 'GeoIP failed' };
    } catch (e) { return { source: 'ip', error: (e && e.message) || 'GeoIP bridge failed' }; }
  }
  async function resolveBestLocation() {
    const device = await getDeviceLocation();
    if (!device.error) return device;
    return await getIpLocationViaBG();
  }
  function formatLocation(loc) {
    if (loc.error) return 'Unable to get location (' + loc.error + ').';
    const parts = [loc.city, loc.region, loc.country].filter(Boolean);
    const human = parts.join(', ');
    const hasCoords = typeof loc.lat === 'number' && typeof loc.lon === 'number';
    const coord = hasCoords ? '(' + loc.lat.toFixed(6) + ', ' + loc.lon.toFixed(6) + ')' : '';
    const acc = typeof loc.accuracyMeters === 'number' ? '±' + Math.round(loc.accuracyMeters) + ' m' : '';
    const by = loc.source === 'device' ? 'via device' : 'via IP';
    const ip = loc.ip ? ' • IP ' + loc.ip : '';
    return [human || 'Location', coord, acc, '• ' + by + ip].filter(Boolean).join(' ');
  }

  /* ===================== PRICE DETECTION ===================== */
  const TOTAL_KEYWORDS = ['total','order total','grand total','amount due','to pay','pay now','total due','order summary','final total','you pay'];
  const NEGATIVE_HINTS = ['shipping','tax','fee','promo','discount','gift card'];
  const SUMMARY_CONTAINER_HINTS = ['summary','totals','checkout','order','cart','payment'];
  const CURRENCY_RX = /(?:USD|CAD|AUD|NZD|EUR|GBP|JPY|CHF|SEK|NOK|DKK|MXN|BRL|INR|CNY|HKD|KRW|SGD|ZAR|AED|SAR|QAR|TRY|PLN|CZK|HUF|ILS|RON|COP|ARS|CLP|PEN|TWD|THB|IDR|MYR|PHP|VND|\$|£|€|¥)\s?[\d\.,]+/i;
  const MONEY_FRAGMENT_RX = /([\$£€¥]|USD|CAD|AUD|NZD|EUR|GBP|JPY)\s*([\d\.,]+)/i;

  function normalizeNumber(str) {
    let s = (str || '').replace(/\s+/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
    else if (s.includes(',') && !s.includes('.')) {
      const parts = s.split(','); s = parts[parts.length-1].length === 2 ? s.replace(',', '.') : s.replace(/,/g,'');
    }
    const n = parseFloat(s.replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  }
  function extractPrice(text) {
    if (!text) return null;
    const m = text.match(MONEY_FRAGMENT_RX);
    if (!m) return null;
    const currency = m[1]; const num = normalizeNumber(m[2]);
    if (num == null) return null;
    return { amount: num, currency, raw: m[0] };
  }
  function elementText(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function scoreElementForTotal(el) {
    const txtRaw = elementText(el); const txt = txtRaw.toLowerCase();
    if (!CURRENCY_RX.test(txt)) return { score: 0, price: null };
    try { if ((getComputedStyle(el).textDecorationLine || '').includes('line-through')) return { score: 0, price: null }; } catch {}
    const matches = txt.match(new RegExp(CURRENCY_RX, 'gi')) || [];
    let bestPrice = matches.length ? extractPrice(matches[matches.length-1]) : extractPrice(txtRaw);
    if (!bestPrice) return { score: 0, price: null };
    let score = 0;
    for (const k of TOTAL_KEYWORDS) if (txt.includes(k)) score += 5;
    for (const n of NEGATIVE_HINTS) if (txt.includes(n)) score -= 2;
    let cur = el, hops = 0;
    while (cur && hops < 5) {
      const cls = (cur.className || '').toString().toLowerCase();
      const id = (cur.id || '').toString().toLowerCase();
      if (SUMMARY_CONTAINER_HINTS.some(h => cls.includes(h) || id.includes(h))) { score += 3; break; }
      cur = cur.parentElement; hops++;
    }
    if (bestPrice.amount > 0) score += Math.min(5, Math.floor(bestPrice.amount / 500));
    return { score, price: bestPrice };
  }
  function findCheckoutTotal() {
    const obviousSels = [
      '[data-testid*="total"]','[data-test*="total"]','.order-total','.grand-total','.total','#total',
      '.summary-total','.amount-due','.order-summary-total','[aria-label*="total"]','[aria-label*="amount due"]'
    ];
    const obvious = []; obviousSels.forEach(sel => obvious.push(...document.querySelectorAll(sel)));

    const nodes = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode; const tn = el.tagName;
      if (tn === 'SCRIPT' || tn === 'STYLE' || tn === 'NOSCRIPT' || tn === 'TEMPLATE') continue;
      const txt = elementText(el); if (!txt || txt.length > 400) continue;
      if (CURRENCY_RX.test(txt)) nodes.push(el);
    }
    const candidates = [...new Set([...obvious, ...nodes])];
    let best = { score: 0, price: null, el: null };
    for (const el of candidates) {
      const s = scoreElementForTotal(el);
      if (s.score > best.score && s.price) best = { score: s.score, price: s.price, el };
    }
    if (!best.price) {
      const containerSel = SUMMARY_CONTAINER_HINTS.map(h => `[class*="${h}"], [id*="${h}"]`).join(',');
      const containers = containerSel ? [...document.querySelectorAll(containerSel)] : [];
      let maxPrice = null;
      for (const c of containers) {
        const prices = (elementText(c).match(new RegExp(CURRENCY_RX,'gi')) || []).map(extractPrice).filter(Boolean);
        for (const p of prices) if (!maxPrice || (p.amount||0) > (maxPrice.amount||0)) maxPrice = p;
      }
      if (maxPrice) best = { score: 1, price: maxPrice, el: null };
    }
    return best.price ? { amount: best.price.amount, currency: best.price.currency, rawText: best.price.raw, source: best.el ? 'keyword+currency' : 'container-fallback' } : null;
  }
  function formatTotal(totalObj) {
    if (!totalObj) return 'Total: not found';
    const amt = totalObj.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cur = totalObj.currency || '$';
    return `${cur}${amt} • ${totalObj.source}`;
  }

  /* ===================== PURCHASE CONFIRMATION HEURISTIC ===================== */
  const CONFIRMATION_URL_RX = /(thank[\s-]*you|order[\s-]*(confirmed|confirmation|complete|completed)|confirmation|success|receipt|payment[\s-]*received)/i;
  function pageLooksLikeOrderConfirmation() {
    try {
      if (CONFIRMATION_URL_RX.test(location.href)) return true;
      const txt = (document.body?.innerText || '').toLowerCase();
      const signals = ['thank you for your order','your order is confirmed','order number','payment received','order confirmation','thanks for your purchase','receipt'];
      let hits = 0; for (const s of signals) if (txt.includes(s)) hits++;
      return hits >= 2;
    } catch { return false; }
  }

  /* ===================== BIOMETRICS & RATES ===================== */
  let _uiNeedsUpdate = false;
  function scheduleBiometricsUpdate() {
    if (_uiNeedsUpdate) return;
    _uiNeedsUpdate = true;
    requestAnimationFrame(() => {
      _uiNeedsUpdate = false;
      try { window.__paymentTrackerUpdateBiometrics && window.__paymentTrackerUpdateBiometrics(); } catch {}
      writeCurrentSessionSnapshot(); // keep CURRENT_SESSION_KEY fresh after each micro-update
    });
  }

  const keyTimes = [];
  let lastKeyTime = 0;
  function onKeydownCadence() {
    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (lastKeyTime) keyTimes.push(t - lastKeyTime);
    lastKeyTime = t;
    scheduleBiometricsUpdate();
  }
  addEventListener('blur', () => { lastKeyTime = 0; }, { passive: true });

  const pressureSamples = [];
  let currentPressure = null;
  function pushPressureSample(value) {
    if (!Number.isFinite(value)) return;
    currentPressure = value;
    pressureSamples.push(value);
    if (pressureSamples.length > 500) pressureSamples.shift();
  }
  function onPointerDownPressure(e) {
    if (typeof e.pressure === 'number') {
      if (e.pointerType === 'mouse' && !e.buttons) return;
      pushPressureSample(e.pressure);
      scheduleBiometricsUpdate();
    }
  }
  function onPointerMovePressure(e) {
    if (typeof e.pressure === 'number') {
      if (e.pointerType === 'mouse' && !e.buttons) return;
      if (currentPressure == null || Math.abs(e.pressure - currentPressure) >= 0.005) {
        pushPressureSample(e.pressure);
        scheduleBiometricsUpdate();
      }
    }
  }
  function readTouchForces(touchList) {
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList[i];
      const f = typeof touch.force === 'number' ? touch.force
              : (typeof touch.webkitForce === 'number' ? touch.webkitForce : null);
      if (f != null && f >= 0) pushPressureSample(f);
    }
  }
  function onTouchStartForce(e){ try{ readTouchForces(e.changedTouches || e.touches || []); }catch{} scheduleBiometricsUpdate(); }
  function onTouchMoveForce(e){ try{ readTouchForces(e.changedTouches || e.touches || []); }catch{} scheduleBiometricsUpdate(); }

  const scrollDeltas = [];
  let _lastScrollX = window.scrollX || 0;
  let _lastScrollY = window.scrollY || 0;
  function onWheel(e) {
    scrollDeltas.push({ t: Date.now(), dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
    if (scrollDeltas.length > 500) scrollDeltas.shift();
    scheduleBiometricsUpdate();
  }
  function onScroll() {
    const nx = window.scrollX || 0;
    const ny = window.scrollY || 0;
    const dx = Math.round(nx - _lastScrollX);
    const dy = Math.round(ny - _lastScrollY);
    if (dx !== 0 || dy !== 0) {
      scrollDeltas.push({ t: Date.now(), dx, dy });
      if (scrollDeltas.length > 500) scrollDeltas.shift();
      _lastScrollX = nx; _lastScrollY = ny;
      scheduleBiometricsUpdate();
    }
  }

  const mousePositions = [];           // {t, x, y, v}
  const MOUSE_POS_MAX = 5000;
  const currentMouse = { x: null, y: null, v: 0, n: 0 };

  const rateCounters = { clicks: 0, inputs: 0, navStart: Date.now() };

  /* ===================== SESSION LIFECYCLE ===================== */
  let mouseSession = null;
  let periodicTimer = null;
  const initialSessionId = (await storageGet(CURRENT_SESSION_KEY))?.meta?.id || uuid();

  function computeMouseFeatures(points) {
    if (!points.length) return { n: 0 };
    let sumV=0, sumV2=0, idle=0, clicks=0;
    for (let i=0;i<points.length;i++){ const v = points[i].v||0; sumV+=v; sumV2+=v*v; if (v<10) idle++; if (points[i].click) clicks++; }
    const n=points.length, avgV=sumV/n, stdV=Math.sqrt(Math.max(0,(sumV2/n)-(avgV*avgV)));
    return { n, avgSpeed:+avgV.toFixed(2), stdSpeed:+stdV.toFixed(2), idleRatio:+(idle/n).toFixed(3), clicks };
  }
  function startMouseSession(meta = {}) {
    if (mouseSession) return;
    mouseSession = {
      id: initialSessionId,
      startedAt: new Date().toISOString(),
      url: location.href, viewport: safeViewport(),
      ua: navigator.userAgent, locSummary: null,
      points: new Array(MOUSE_TRACKING_CFG.maxPoints), head:0, size:0, lastSaveAt: nowMs(), lastSampleAt: 0, lastX: null, lastY: null,
      ...meta
    };
    periodicTimer = setInterval(() => flushMouseSession(false, 'periodic'), MOUSE_TRACKING_CFG.periodicSaveMs);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true });

    document.addEventListener('visibilitychange', onVisibility, { passive: true });
    window.addEventListener('pagehide', onPageHide, { passive: true });
    window.addEventListener('beforeunload', onBeforeUnload);

    window.addEventListener('keydown', onKeydownCadence, { passive: true, capture: true });

    window.addEventListener('pointerdown', onPointerDownPressure, { passive: true });
    window.addEventListener('pointermove', onPointerMovePressure, { passive: true });
    window.addEventListener('touchstart', onTouchStartForce, { passive: true });
    window.addEventListener('touchmove', onTouchMoveForce, { passive: true });

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    window.addEventListener('click', () => { rateCounters.clicks++; scheduleBiometricsUpdate(); }, { passive: true });
    MOUSE_TRACKING_CFG.checkoutFieldSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.addEventListener('input', () => { rateCounters.inputs++; scheduleBiometricsUpdate(); }, { passive: true });
      });
    });

    // also keep CURRENT_SESSION updated on its own cadence
    setInterval(writeCurrentSessionSnapshot, 2000);
  }
  async function stopMouseSession(reason='stopped') {
    if (!mouseSession) return;
    await flushMouseSession(true, reason);

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);

    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);

    window.removeEventListener('keydown', onKeydownCadence);

    window.removeEventListener('pointerdown', onPointerDownPressure);
    window.removeEventListener('pointermove', onPointerMovePressure);
    window.removeEventListener('touchstart', onTouchStartForce);
    window.removeEventListener('touchmove', onTouchMoveForce);

    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScroll);

    if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
    mouseSession = null;
  }

  function exportPoints(s) {
    const out = []; if (s.size === 0) return out;
    const start = (s.head - s.size + s.points.length) % s.points.length;
    for (let i=0;i<s.size;i++){ const idx = (start + i) % s.points.length; out.push(s.points[idx]); }
    return out;
  }
  function onMouseMove(e){
    if (!mouseSession) return;
    const t=(typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const minDelta = 1000 / MOUSE_TRACKING_CFG.sampleHz;
    if (t - mouseSession.lastSampleAt < minDelta) return;
    pushPoint(e.clientX, e.clientY, t, false);
  }
  function onMouseDown(e){ if (!mouseSession) return; pushPoint(e.clientX, e.clientY, (performance?.now?.() ?? Date.now()), true); }
  function onMouseUp(e){ if (!mouseSession) return; pushPoint(e.clientX, e.clientY, (performance?.now?.() ?? Date.now()), true); }
  function pushPoint(x,y,t,click=false) {
    if (!mouseSession) return;
    let v = 0;
    if (mouseSession.lastX!=null && mouseSession.lastY!=null && mouseSession.lastSampleAt) {
      const dt=(t-mouseSession.lastSampleAt)/1000;
      if (dt>0) v = Math.hypot(x-mouseSession.lastX, y-mouseSession.lastY)/dt;
    }
    const point = { t: Math.round(t), x: Math.round(x), y: Math.round(y), v: Math.round(v), click: !!click };
    mouseSession.points[mouseSession.head] = point;
    mouseSession.head = (mouseSession.head + 1) % mouseSession.points.length;
    mouseSession.size = Math.min(mouseSession.size + 1, mouseSession.points.length);
    mouseSession.lastX = x; mouseSession.lastY = y; mouseSession.lastSampleAt = t;

    currentMouse.x = Math.round(x);
    currentMouse.y = Math.round(y);
    currentMouse.v = Math.round(v);
    mousePositions.push({ t: Math.round(t), x: currentMouse.x, y: currentMouse.y, v: currentMouse.v });
    if (mousePositions.length > MOUSE_POS_MAX) mousePositions.shift();
    currentMouse.n = mousePositions.length;

    scheduleBiometricsUpdate();
  }

  function onVisibility(){ if (document.visibilityState === 'hidden') flushMouseSession(true, 'hidden'); }
  function onPageHide(){ flushMouseSession(true, 'pagehide'); }
  function onBeforeUnload(){
    try { navigator.sendBeacon && navigator.sendBeacon('about:blank'); } catch {}
    flushMouseSession(true,'unload');
  }

  function summarizeCadence(arr){
    if(!arr.length) return {n:0};
    const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n, v=arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n;
    return { n, mean:+mean.toFixed(2), std:+Math.sqrt(v).toFixed(2) };
  }
  function summarizeArray(arr){
    if(!arr.length) return {n:0};
    const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n, min=Math.min(...arr), max=Math.max(...arr);
    return { n, mean:+mean.toFixed(3), min:+min.toFixed(3), max:+max.toFixed(3) };
  }
  function summarizeScroll(arr){
    if(!arr.length) return {n:0};
    const n=arr.length, totalY=arr.reduce((a,b)=>a+Math.abs(b.dy),0), totalX=arr.reduce((a,b)=>a+Math.abs(b.dx),0);
    return { n, totalY, totalX };
  }
  function summarizeMousePositions(arr){
    if(!arr.length) return { n:0 };
    const n = arr.length;
    let sumV = 0, maxV = 0;
    for (let i=0;i<n;i++){ const v = arr[i].v||0; sumV += v; if (v>maxV) maxV=v; }
    const avgV = sumV / n;
    const last = arr[n-1];
    return { n, lastX: last.x, lastY: last.y, lastV: last.v, avgV: +avgV.toFixed(2), maxV };
  }
  function summarizeRates(){
    const secs = Math.max(1, (Date.now()-rateCounters.navStart)/1000);
    return { clicksPerMin:+(rateCounters.clicks/(secs/60)).toFixed(2), inputsPerMin:+(rateCounters.inputs/(secs/60)).toFixed(2), timeOnPageSecs:Math.round(secs) };
  }

  /* ===================== SESSIONS PERSISTENCE ===================== */
  async function appendSession(doc) {
    const sessions = (await storageGet(STORAGE_KEY)) || [];
    sessions.push({ ...doc, savedAt: Date.now() });
    while (sessions.length > MOUSE_TRACKING_CFG.sessionStoreMax) sessions.shift();
    await storageSet(STORAGE_KEY, sessions);
  }

  async function appendUniqueFullSession(full) {
    try {
      const url = full?.meta?.url || '';
      let arr = (await storageGet(LAST_FULL_SESSIONS_KEY));
      if (!Array.isArray(arr)) arr = [];
      const exists = arr.some(s => (s?.meta?.url || '') === url);
      if (!exists) {
        arr.push(full);
        await storageSet(LAST_FULL_SESSIONS_KEY, arr);
        console.log('Tracker: appended unique full session for URL:', url, 'array length:', arr.length);
      } else {
        console.log('Tracker: full session for URL already saved, skipping:', url);
      }
    } catch (e) { console.warn('Tracker: appendUniqueFullSession failed', e); }
  }
  // expose the real implementation globally
  window.appendUniqueFullSession = appendUniqueFullSession;

  async function flushMouseSession(final=false, reason='periodic') {
    if (!mouseSession) return;

    const checkoutTotal = findCheckoutTotal(); // {amount, currency, rawText, source} or null
    const points = exportPoints(mouseSession);
    const features = computeMouseFeatures(points);

    const sessionDoc = {
      id: mouseSession.id, startedAt: mouseSession.startedAt,
      endedAt: final ? new Date().toISOString() : undefined, reason,
      url: mouseSession.url, viewport: mouseSession.viewport, ua: mouseSession.ua, locSummary: mouseSession.locSummary,
      mouse: features,
      cadence: summarizeCadence(keyTimes),
      pressure: summarizeArray(pressureSamples),
      scroll: summarizeScroll(scrollDeltas),
      mousePosition: summarizeMousePositions(mousePositions),
      rates: summarizeRates(),
      total: checkoutTotal ? { amount: checkoutTotal.amount, currency: checkoutTotal.currency, rawText: checkoutTotal.rawText, source: checkoutTotal.source } : null
    };

    await appendSession(sessionDoc);

    const full = {
      meta: {
        id: mouseSession.id,
        startedAt: mouseSession.startedAt,
        endedAt: final ? new Date().toISOString() : undefined,
        url: mouseSession.url,
        viewport: mouseSession.viewport,
        ua: mouseSession.ua,
        reason
      },
      total: checkoutTotal ? { amount: checkoutTotal.amount, currency: checkoutTotal.currency, rawText: checkoutTotal.rawText, source: checkoutTotal.source } : null,
      samples: {
        keyIntervals: keyTimes.slice(),
        pressure: pressureSamples.slice(),
        scroll: scrollDeltas.slice(),
        mousePositions: mousePositions.slice()
      },
      summaries: sessionDoc
    };

    await storageSet(LAST_FULL_SESSION_KEY, full);
    await appendUniqueFullSession(full);
    await writeCurrentSessionSnapshot(); // keep the live snapshot aligned

    mouseSession.lastSaveAt = (performance?.now?.() ?? Date.now());
  }

  /* ===================== CURRENT SESSION WRITER ===================== */
  async function writeCurrentSessionSnapshot() {
    const mpos = summarizeMousePositions(mousePositions);
    const cad  = summarizeCadence(keyTimes);
    const pres = summarizeArray(pressureSamples);
    const scr  = summarizeScroll(scrollDeltas);
    const rates = summarizeRates();
    const total = findCheckoutTotal();

    const prev = await storageGet(CURRENT_SESSION_KEY);
    const snapshot = {
      meta: {
        id: mouseSession?.id || prev?.meta?.id || uuid(),
        startedAt: mouseSession?.startedAt || prev?.meta?.startedAt || new Date().toISOString(),
        url: location.href,
        viewport: safeViewport(),
        ua: navigator.userAgent
      },
      total: total ? { amount: total.amount, currency: total.currency, rawText: total.rawText, source: total.source } : null,
      mousePosition: mpos,
      cadence: cad,
      pressure: pres,
      scroll: scr,
      rates,
      updatedAt: Date.now()
    };
    await storageSet(CURRENT_SESSION_KEY, snapshot);
  }

  /* ===================== MESSAGING / UI ===================== */
  const sendMessage = async (msg) => { try { await chrome.runtime.sendMessage(msg); } catch { return false; } return true; };

  function makeRow(label, initial='…') {
    const row = document.createElement('div'); row.className='payment-popup-row';
    const l = document.createElement('div'); l.className='payment-popup-label'; l.textContent = label;
    const v = document.createElement('div'); v.className='payment-popup-value'; v.textContent = initial;
    row.appendChild(l); row.appendChild(v);
    return { row, valueEl: v };
  }

  window.addEventListener('load', async () => {
    chrome.runtime.onMessage.addListener(function(request){ if (request?.action==='refresh'){ setTimeout(()=>{ sendMessage('refresh'); console.log('refreshed content.js'); },18000);} });
    await sendMessage({ action: 'refresh' });

    const popup = document.createElement('payment-tracker-popup');
    const locRow = makeRow('Location','Detecting…');
    const totalRow = makeRow('Total','Scanning…'); totalRow.valueEl.classList.add('payment-popup-total');
    const purchasedRow = makeRow('Purchased','Checking…');
    const deviceRow = makeRow('Computer','Checking…');
    const wifiRow = makeRow('Wi-Fi Network','Checking…');
    const avgRow = makeRow('Hist. Avg','—');
    const headlessRow = makeRow('Headless','Checking…');

    const cadenceRow = makeRow('Typing Cadence','—');
    const pressureRow = makeRow('Touch Pressure','—');
    const scrollRow = makeRow('Scroll Pattern','—');
    const mouseRow = makeRow('Mouse Position','—');
    const rateRow = makeRow('Action Rate','—');

    popup.appendChild(locRow.row);
    popup.appendChild(totalRow.row);
    popup.appendChild(purchasedRow.row);
    popup.appendChild(deviceRow.row);
    popup.appendChild(wifiRow.row);
    popup.appendChild(avgRow.row);
    popup.appendChild(headlessRow.row);
    popup.appendChild(cadenceRow.row);
    popup.appendChild(pressureRow.row);
    popup.appendChild(scrollRow.row);
    popup.appendChild(mouseRow.row);
    popup.appendChild(rateRow.row);
    // document.body.appendChild(popup);

    const deviceId = await getOrCreateDeviceId();
    const headless = headlessSignals();
    headlessRow.valueEl.textContent = headless.headlessLikely ? `Likely • ${headless.reasons.join(', ')}` : 'No';

    startMouseSession({ trigger: 'immediate' });

    const loc = await resolveBestLocation();
    const summary = formatLocation(loc);
    locRow.valueEl.textContent = summary;
    if (mouseSession) mouseSession.locSummary = summary;
    await addLocationHistoryEntry(summary, loc.ip);

    function updateTotalsAndHistoryUI() {
      const total = findCheckoutTotal();
      totalRow.valueEl.textContent = total ? formatTotal(total) : 'Total: not found';

      (async () => {
        const history = await getPurchaseHistory();
        const hasPurchased = await getHasPurchasedFlag();
        purchasedRow.valueEl.textContent = hasPurchased ? 'Yes (this device)' : 'No';

        const sameComputer = history.some(p => p.deviceId === deviceId);
        deviceRow.valueEl.textContent = sameComputer ? 'Yes (seen before)' : 'No';

        const ip = loc.ip || null;
        const knownNetwork = !!(ip && history.some(p => p.ip && p.ip === ip));
        wifiRow.valueEl.textContent = ip ? (knownNetwork ? 'Yes (known IP)' : 'No (new IP)') : 'Unknown';

        if (total && total.currency) {
          const avg = currencyAvg(history, total.currency);
          avgRow.valueEl.textContent = avg != null ? `${total.currency}${avg.toFixed(2)}` : '—';
        } else {
          avgRow.valueEl.textContent = '—';
        }
      })();

      writeCurrentSessionSnapshot();
    }
    updateTotalsAndHistoryUI();

    window.__paymentTrackerUpdateBiometrics = function updateBiometricsUI() {
      const cad = summarizeCadence(keyTimes);
      cadenceRow.valueEl.textContent = cad.n
        ? `n=${cad.n}, mean=${cad.mean} ms, σ=${cad.std} ms`
        : 'No typing yet';

      const pres = summarizeArray(pressureSamples);
      pressureRow.valueEl.textContent = pres.n
        ? `current=${(currentPressure != null ? currentPressure.toFixed(3) : '—')}, n=${pres.n}, mean=${pres.mean}, min=${pres.min}, max=${pres.max}`
        : 'Not available / no pressure events';

      const scr = summarizeScroll(scrollDeltas);
      scrollRow.valueEl.textContent = scr.n
        ? `events=${scr.n}, |ΔY|=${scr.totalY}, |ΔX|=${scr.totalX}`
        : 'No scroll yet';

      const mpos = summarizeMousePositions(mousePositions);
      mouseRow.valueEl.textContent = mpos.n
        ? `x=${mpos.lastX}, y=${mpos.lastY}, v=${mpos.lastV}px/s • n=${mpos.n}, avgV=${mpos.avgV}px/s, maxV=${mpos.maxV}px/s`
        : 'No mouse movement yet';

      const rates = summarizeRates();
      rateRow.valueEl.textContent = `clicks/min=${rates.clicksPerMin}, inputs/min=${rates.inputsPerMin}, time=${rates.timeOnPageSecs}s`;
    };

    window.__paymentTrackerUpdateBiometrics();
    setInterval(updateTotalsAndHistoryUI, 4000);
    setInterval(() => { window.__paymentTrackerUpdateBiometrics(); }, 1500);

    async function maybeRecordPurchase() {
      const already = await getHasPurchasedFlag();
      if (!already && pageLooksLikeOrderConfirmation()) {
        await setHasPurchasedFlagTrue();
        purchasedRow.valueEl.textContent = 'Yes (this device)';
        const total = findCheckoutTotal();
        const entry = {
          t: Date.now(),
          amount: total?.amount || null,
          currency: total?.currency || null,
          url: location.href,
          deviceId,
          ip: loc.ip || null,
          locSummary: summary
        };
        await appendPurchaseHistory(entry);
        updateTotalsAndHistoryUI();
      }
    }
    setInterval(maybeRecordPurchase, 3000);
    setTimeout(maybeRecordPurchase, 1000);
  });

  /* ===================== Styles ===================== */
  (function injectStyles(){
    const id = 'payment-tracker-popup-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style'); style.id = id;
    style.textContent = `
payment-tracker-popup *{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-sizing:border-box;margin:0;padding:0}
payment-tracker-popup{position:fixed;top:10px;right:10px;width:420px;min-height:240px;background:#fff;z-index:10000;padding:16px 20px;border-radius:10px;box-shadow:0 4px 8px rgba(0,0,0,.1)}
.payment-popup-row{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.payment-popup-label{font-weight:600;color:#111;min-width:140px}
.payment-popup-value{color:#222;word-break:break-word}
.payment-popup-total{font-weight:700}
`;
    (document.head || document.documentElement || document.body).appendChild(style);
  })();

  /* ===================== Notes =====================
   - CURRENT_SESSION_KEY is created on every page immediately and updated frequently on checkout.
   - On checkout pages: live biometrics/rates/total are tracked; periodic/terminal flushes write LAST_FULL_SESSION and a unique snapshot per URL to LAST_FULL_SESSIONS.
   - Public APIs provided: window.getCurrentSession(), window.addLocationHistoryEntry(), window.appendUniqueFullSession().
   - No keystroke contents are stored; only timing intervals.
  =================================================== */
})();
