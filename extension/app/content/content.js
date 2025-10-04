/* content.js */
console.log('Tracker: _____content.js_____ loaded');

/* ===================== HELPERS ===================== */
const sendMessage = async (msg) => {
  try { await chrome.runtime.sendMessage(msg); } catch { return false; }
  return true;
};

/* ===================== COOKIE READ ===================== */
function readDocumentCookies() {
  const raw = document.cookie || '';
  if (!raw) return [];
  return raw.split(';').map(s => s.trim()).filter(Boolean).map(kv => {
    const i = kv.indexOf('=');
    const name = i >= 0 ? kv.slice(0, i) : kv;
    const valueRaw = i >= 0 ? kv.slice(i + 1) : '';
    let value = valueRaw;
    try { value = decodeURIComponent(valueRaw); } catch {}
    let parsed = null;
    try { parsed = JSON.parse(value); } catch {}
    return { name, value, parsed };
  });
}

function findCurrentApiKey(cookies) {
  // Priority 1: explicit session cookie
  const sess = cookies.find(c => c.name === 'current_api_key' && c.value);
  if (sess) return sess.value;

  // Priority 2: apikey{key} cookie name encodes the key; value usually maps to merchantId
  const apiCookie = cookies.find(c => /^apikey[A-Za-z0-9_-]+$/.test(c.name));
  if (apiCookie) return apiCookie.name.replace(/^apikey/, '');

  return null;
}

function findTransactionIds(cookies) {
  // transaction_{txn} → collect txn ids
  return cookies
    .filter(c => /^transaction_[A-Za-z0-9_-]+$/.test(c.name))
    .map(c => c.name.replace(/^transaction_/, ''));
}

/* ===================== FETCH ANALYSES ===================== */
async function fetchAnalysis(apiKey, transactionId) {
  const url = `http://localhost:3001/api/fraud/analyses/${encodeURIComponent(transactionId)}`;
  const headers = { 'x-api-key': apiKey, 'accept': 'application/json' };
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${transactionId}: ${text || 'request failed'}`);
  }
  return res.json();
}

/* ===================== RENDER (PLAIN, TOP-RIGHT) ===================== */
function renderPlain(apiKey, results) {
  // Remove previous output if any
  const existing = document.getElementById('fraud-analysis-output');
  if (existing) existing.remove();

  // Minimal container (no visuals beyond required positioning)
  const wrap = document.createElement('div');
  wrap.id = 'fraud-analysis-output';
  wrap.style.position = 'fixed';
  wrap.style.top = '10px';
  wrap.style.right = '10px';
  wrap.style.maxWidth = '600px';
  wrap.style.maxHeight = '70vh';
  wrap.style.overflow = 'auto';
  wrap.style.zIndex = '2147483647';
  // No decorative styles; just ensure text is readable and contained.

  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.textContent = JSON.stringify(
    { apiKey: apiKey || '(not found)', results },
    null,
    2
  );

  wrap.appendChild(pre);
  document.body.appendChild(wrap);
}

/* ===================== MAIN ===================== */
window.addEventListener('load', async () => {
  chrome.runtime?.onMessage?.addListener(function(request){
    if (request?.action === 'refresh') {
      setTimeout(()=>{ sendMessage('refresh'); console.log('refreshed content.js'); }, 18000);
    }
  });
  await sendMessage({ action: 'refresh' });

  try {
    const cookies = readDocumentCookies();
    const apiKey = findCurrentApiKey(cookies);
    const txnIds = findTransactionIds(cookies);

    if (!apiKey) {
      renderPlain(null, { error: 'No API key found in cookies (current_api_key or apikey{key})' });
      return;
    }
    if (!txnIds.length) {
      renderPlain(apiKey, { warning: 'No transaction_{txn} cookies found; nothing to fetch' });
      return;
    }

    // Fetch analyses sequentially (change to Promise.all if you prefer parallel)
    const results = [];
    for (const txnId of txnIds) {
      try {
        const data = await fetchAnalysis(apiKey, txnId);
        results.push({ transactionId: txnId, ok: true, data });
      } catch (e) {
        results.push({ transactionId: txnId, ok: false, error: e?.message || String(e) });
      }
    }

    renderPlain(apiKey, results);
  } catch (e) {
    renderPlain(null, { error: e?.message || String(e) });
  }
});
