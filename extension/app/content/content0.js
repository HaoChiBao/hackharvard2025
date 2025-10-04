/* content.js */
console.log('Tracker: _____content.js_____ loaded');

/* ===================== CONFIG & KEYS ===================== */
const MOUSE_TRACKING_CFG = {
  sampleHz: 25,
  maxPoints: 2500,
  periodicSaveMs: 5000,
  startOnUrlRegex: /(checkout|cart|payment|billing|purchase)/i,
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
  historyMaxPurchases: 50
};

// Storage keys
const STORAGE_KEY = 'mouseSessions';
const PURCHASE_FLAG_KEY = 'hasPurchasedOnThisDevice';
const PURCHASE_HISTORY_KEY = 'purchaseHistory';          // [{t, amount, currency, url, deviceId, ip, locSummary}]
const LOCATION_HISTORY_KEY = 'locationHistory';          // [{t, ip, locSummary}]
const DEVICE_ID_KEY = 'deviceId';
const BIOMETRICS_BASELINE_KEY = 'biometricsBaseline';    // reserved for future use

/* ===================== UTILS & STORAGE ===================== */
function uuid() { return `${Date.now()}-${Math.random().toString(36).slice(2,10)}`; }
function nowMs() { return performance?.now?.() ?? Date.now(); }

async function storageGet(key) {
  if (chrome?.storage?.local) {
    const r = await chrome.storage.local.get([key]);
    return r[key];
  }
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}
async function storageSet(key, value) {
  if (chrome?.storage?.local) { await chrome.storage.local.set({ [key]: value }); return; }
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
async function storagePushBounded(key, item, maxLen) {
  const arr = (await storageGet(key)) || [];
  arr.push(item);
  while (arr.length > maxLen) arr.shift();
  await storageSet(key, arr);
}

/* ===================== DEVICE / HEADLESS ===================== */
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

/* ===================== LOCATION HELPERS ===================== */
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

/* ===================== PURCHASE FLAG & HISTORY ===================== */
async function getHasPurchasedFlag() {
  const v = await storageGet(PURCHASE_FLAG_KEY);
  return v === true || v === 'true' || v === 1 || v === '1';
}
async function setHasPurchasedFlagTrue() { await storageSet(PURCHASE_FLAG_KEY, true); }

async function addLocationHistoryEntry(locSummary, ip) {
  await storagePushBounded(LOCATION_HISTORY_KEY, { t: Date.now(), ip: ip || null, locSummary: locSummary || '' }, MOUSE_TRACKING_CFG.historyMaxLocations);
}
async function getLocationHistory() { return (await storageGet(LOCATION_HISTORY_KEY)) || []; }

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
// Keystroke cadence (no key values stored)
const keyTimes = [];
let lastKeyTime = 0;
function onKeydownCadence() {
  const t = nowMs();
  if (lastKeyTime) keyTimes.push(t - lastKeyTime);
  lastKeyTime = t;
}
// Pointer pressure
const pressureSamples = [];
function onPointerDownPressure(e) { if (typeof e.pressure === 'number') pressureSamples.push(e.pressure); }
// Scroll patterns
const scrollDeltas = [];
function onWheel(e) { scrollDeltas.push({ t: Date.now(), dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) }); if (scrollDeltas.length > 500) scrollDeltas.shift(); }
// Rates
const rateCounters = { clicks: 0, inputs: 0, navStart: Date.now() };

/* ===================== MOUSE SESSION ===================== */
let mouseSession = null;
let periodicTimer = null;

function computeMouseFeatures(points) {
  if (!points.length) return { n: 0 };
  let sumV=0, sumV2=0, idle=0, clicks=0;
  for (let i=0;i<points.length;i++){ const v = points[i].v||0; sumV+=v; sumV2+=v*v; if (v<10) idle++; if (points[i].click) clicks++; }
  const n=points.length, avgV=sumV/n, stdV=Math.sqrt(Math.max(0,(sumV2/n)-(avgV*avgV)));
  return { n, avgSpeed:+avgV.toFixed(2), stdSpeed:+stdV.toFixed(2), idleRatio:+(idle/n).toFixed(3), clicks };
}
function shouldAutoStart() {
  if (MOUSE_TRACKING_CFG.startOnUrlRegex.test(location.href)) return true;
  return MOUSE_TRACKING_CFG.checkoutFieldSelectors.some(sel => document.querySelector(sel));
}
function safeViewport(){ return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }; }

function startMouseSession(meta = {}) {
  if (mouseSession) return;
  mouseSession = {
    id: uuid(), startedAt: new Date().toISOString(), url: location.href, viewport: safeViewport(),
    ua: navigator.userAgent, locSummary: null,
    points: new Array(MOUSE_TRACKING_CFG.maxPoints), head:0, size:0, lastSaveAt: nowMs(), lastSampleAt: 0, lastX: null, lastY: null,
    ...meta
  };
  periodicTimer = setInterval(flushMouseSession, MOUSE_TRACKING_CFG.periodicSaveMs);

  addEventListener('mousemove', onMouseMove, { passive: true });
  addEventListener('mousedown', onMouseDown, { passive: true });
  addEventListener('mouseup', onMouseUp, { passive: true });
  addEventListener('visibilitychange', onVisibility, { passive: true });
  addEventListener('beforeunload', onBeforeUnload);
  addEventListener('keydown', onKeydownCadence, { passive: true });
  addEventListener('pointerdown', onPointerDownPressure, { passive: true });
  addEventListener('wheel', onWheel, { passive: true });
  addEventListener('click', () => rateCounters.clicks++, { passive: true });
  MOUSE_TRACKING_CFG.checkoutFieldSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.addEventListener('input', () => rateCounters.inputs++, { passive: true });
    });
  });
}
async function stopMouseSession(reason='stopped') {
  if (!mouseSession) return;
  await flushMouseSession(true, reason);
  removeEventListener('mousemove', onMouseMove);
  removeEventListener('mousedown', onMouseDown);
  removeEventListener('mouseup', onMouseUp);
  removeEventListener('visibilitychange', onVisibility);
  removeEventListener('beforeunload', onBeforeUnload);
  removeEventListener('keydown', onKeydownCadence);
  removeEventListener('pointerdown', onPointerDownPressure);
  removeEventListener('wheel', onWheel);
  if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
  mouseSession = null;
}
async function flushMouseSession(final=false, reason='periodic') {
  if (!mouseSession) return;
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
    rates: summarizeRates()
  };
  await appendSession(sessionDoc);
  mouseSession.lastSaveAt = nowMs();
}
function exportPoints(s) {
  const out = []; if (s.size === 0) return out;
  const start = (s.head - s.size + s.points.length) % s.points.length;
  for (let i=0;i<s.size;i++){ const idx = (start + i) % s.points.length; out.push(s.points[idx]); }
  return out;
}
function pushPoint(x,y,t,click=false) {
  if (!mouseSession) return;
  let v=0;
  if (mouseSession.lastX!=null && mouseSession.lastY!=null && mouseSession.lastSampleAt) {
    const dt=(t-mouseSession.lastSampleAt)/1000; if (dt>0) v = Math.hypot(x-mouseSession.lastX, y-mouseSession.lastY)/dt;
  }
  const point = { t: Math.round(t), x: Math.round(x), y: Math.round(y), v: Math.round(v), click: !!click };
  mouseSession.points[mouseSession.head] = point;
  mouseSession.head = (mouseSession.head + 1) % mouseSession.points.length;
  mouseSession.size = Math.min(mouseSession.size + 1, mouseSession.points.length);
  mouseSession.lastX = x; mouseSession.lastY = y; mouseSession.lastSampleAt = t;
}
function onMouseMove(e){ if (!mouseSession) return; const t=nowMs(); const minDelta = 1000 / MOUSE_TRACKING_CFG.sampleHz; if (t - mouseSession.lastSampleAt < minDelta) return; pushPoint(e.clientX, e.clientY, t, false); }
function onMouseDown(e){ if (!mouseSession) return; pushPoint(e.clientX, e.clientY, nowMs(), true); }
function onMouseUp(e){ if (!mouseSession) return; pushPoint(e.clientX, e.clientY, nowMs(), true); }
function onVisibility(){ if (document.visibilityState === 'hidden') flushMouseSession(false, 'hidden'); }
function onBeforeUnload(){ try { navigator.sendBeacon && navigator.sendBeacon('about:blank'); } catch {} flushMouseSession(true,'unload'); }

function summarizeCadence(arr){ if(!arr.length) return {n:0}; const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n, v=arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n; return { n, mean:+mean.toFixed(2), std:+Math.sqrt(v).toFixed(2) }; }
function summarizeArray(arr){ if(!arr.length) return {n:0}; const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n; return { n, mean:+mean.toFixed(3) }; }
function summarizeScroll(arr){ if(!arr.length) return {n:0}; const n=arr.length, totalY=arr.reduce((a,b)=>a+Math.abs(b.dy),0), totalX=arr.reduce((a,b)=>a+Math.abs(b.dx),0); return { n, totalY, totalX }; }
function summarizeRates(){ const secs = Math.max(1, (Date.now()-rateCounters.navStart)/1000); return { clicksPerMin:+(rateCounters.clicks/(secs/60)).toFixed(2), inputsPerMin:+(rateCounters.inputs/(secs/60)).toFixed(2), timeOnPageSecs:Math.round(secs) }; }

/* ===================== MESSAGING ===================== */
const sendMessage = async (msg) => { try { await chrome.runtime.sendMessage(msg); } catch { return false; } return true; };

/* ===================== UI ===================== */
function makeRow(label, initial='…') {
  const row = document.createElement('div'); row.className='payment-popup-row';
  const l = document.createElement('div'); l.className='payment-popup-label'; l.textContent = label;
  const v = document.createElement('div'); v.className='payment-popup-value'; v.textContent = initial;
  row.appendChild(l); row.appendChild(v);
  return { row, valueEl: v };
}

/* ===================== MAIN ===================== */
window.addEventListener('load', async () => {
  chrome.runtime.onMessage.addListener(function(request){ if (request?.action==='refresh'){ setTimeout(()=>{ sendMessage('refresh'); console.log('refreshed content.js'); },18000);} });

  await sendMessage({ action: 'refresh' });

  // Create popup skeleton
  const popup = document.createElement('payment-tracker-popup');
  const locRow = makeRow('Location','Detecting…');
  const totalRow = makeRow('Total','Scanning…'); totalRow.valueEl.classList.add('payment-popup-total');
  const purchasedRow = makeRow('Purchased','Checking…');
  const deviceRow = makeRow('Computer','Checking…');
  const wifiRow = makeRow('Wi-Fi Network','Checking…');
  const avgRow = makeRow('Hist. Avg','—');
  // Removed Amount Risk per request
  const headlessRow = makeRow('Headless','Checking…');

  // Behavioural Biometrics (new visible metrics)
  const cadenceRow = makeRow('Typing Cadence','—');            // mean/std of inter-key intervals
  const pressureRow = makeRow('Touch Pressure','—');           // mean pressure (if supported)
  const scrollRow = makeRow('Scroll Pattern','—');             // total scroll amounts
  const rateRow = makeRow('Action Rate','—');                  // clicks/min, inputs/min

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
  popup.appendChild(rateRow.row);
  document.body.appendChild(popup);

  // Device ID & headless
  const deviceId = await getOrCreateDeviceId();
  const headless = headlessSignals();
  headlessRow.valueEl.textContent = headless.headlessLikely ? `Likely • ${headless.reasons.join(', ')}` : 'No';

  // Start tracking when appropriate
  if (shouldAutoStart()) startMouseSession({ trigger:'auto' });
  addEventListener('mousedown', () => { if (!mouseSession && shouldAutoStart()) startMouseSession({ trigger:'mousedown-auto' }); }, { once:true, passive:true });

  // Resolve location & show + store in history
  const loc = await resolveBestLocation();
  const summary = formatLocation(loc);
  locRow.valueEl.textContent = summary;
  if (mouseSession) mouseSession.locSummary = summary;
  await addLocationHistoryEntry(summary, loc.ip);

  // Compute total & historical comparisons
  function updateTotalsAndHistoryUI() {
    const total = findCheckoutTotal();
    totalRow.valueEl.textContent = total ? formatTotal(total) : 'Total: not found';

    (async () => {
      const history = await getPurchaseHistory();
      const hasPurchased = await getHasPurchasedFlag();
      purchasedRow.valueEl.textContent = hasPurchased ? 'Yes (this device)' : 'No';

      // Computer history: did this same deviceId appear in history?
      const sameComputer = history.some(p => p.deviceId === deviceId);
      deviceRow.valueEl.textContent = sameComputer ? 'Yes (seen before)' : 'No';

      // Wi-Fi / network: has this IP been used before in any purchase?
      const ip = loc.ip || null;
      const knownNetwork = !!(ip && history.some(p => p.ip && p.ip === ip));
      wifiRow.valueEl.textContent = ip ? (knownNetwork ? 'Yes (known IP)' : 'No (new IP)') : 'Unknown';

      // Historical average (only if currency matches)
      if (total && total.currency) {
        const avg = currencyAvg(history, total.currency);
        avgRow.valueEl.textContent = avg != null ? `${total.currency}${avg.toFixed(2)}` : '—';
      } else {
        avgRow.valueEl.textContent = '—';
      }
    })();
  }
  updateTotalsAndHistoryUI();

  // Render behavioural biometrics to UI
  function updateBiometricsUI() {
    const cad = summarizeCadence(keyTimes);
    cadenceRow.valueEl.textContent = cad.n
      ? `n=${cad.n}, mean=${cad.mean} ms, σ=${cad.std} ms`
      : 'No typing yet';

    const pres = summarizeArray(pressureSamples);
    pressureRow.valueEl.textContent = pres.n
      ? `n=${pres.n}, mean=${pres.mean}`
      : 'Not available / no pointer pressure';

    const scr = summarizeScroll(scrollDeltas);
    scrollRow.valueEl.textContent = scr.n
      ? `events=${scr.n}, |ΔY|=${scr.totalY}, |ΔX|=${scr.totalX}`
      : 'No scroll yet';

    const rates = summarizeRates();
    rateRow.valueEl.textContent =
      `clicks/min=${rates.clicksPerMin}, inputs/min=${rates.inputsPerMin}, time=${rates.timeOnPageSecs}s`;
  }
  updateBiometricsUI();

  // Observe DOM for dynamic changes
  try {
    const observer = new MutationObserver(debounce(updateTotalsAndHistoryUI, 400));
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  } catch {}

  // Periodic refreshes
  setInterval(updateTotalsAndHistoryUI, 4000);
  setInterval(updateBiometricsUI, 1500);

  // If page looks like confirmation: set purchase flag and store purchase record
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

/* ===================== HELPERS: debounce & popup styles ===================== */
function debounce(fn, wait){ let t=null; return function(){ clearTimeout(t); t=setTimeout(fn, wait); }; }

/* Optional styles (simple; custom element, no shadow DOM) */
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

/* ===================== NOTES =====================
- Wi-Fi SSID cannot be read from web content for security reasons. We treat the public IP from GeoIP as a proxy for "network".
- No keystroke contents are stored; only timing intervals (cadence).
- No form values or screenshots are collected; only behavioral/telemetry metrics and totals visible on the page.
- Behavioural biometrics now visible in the popup: typing cadence, pointer pressure, scroll pattern, and action rates.
================================================== */
