// background.js
// NOTE: To use the cookies API, your manifest.json must include:
// "permissions": ["cookies"], and appropriate "host_permissions" (e.g., "https://*/*", "http://*/*")

chrome.runtime.onInstalled.addListener(() => {
  console.log('background.js loaded');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  const action = request && request.action;

  // Helper to reply back to the sender tab (fire-and-forget)
  const replyToSenderTab = (payload) => {
    if (typeof tabId === 'number') {
      try {
        chrome.tabs.sendMessage(tabId, payload);
      } catch (e) {
        console.warn('Failed to sendMessage to tab', tabId, e);
      }
    }
  };

  // --- Helpers for cookie retrieval ---
  const COOKIE_NAME_PATTERNS = [
    /^merchant_[A-Za-z0-9_-]+$/,   // Merchants
    /^apikey[A-Za-z0-9_-]+$/,      // API Keys
    /^current_api_key$/,           // Session
    /^current_merchantid$/,        // Session
    /^verification[A-Za-z0-9_-]+$/, // Verification
    /^transaction_[A-Za-z0-9_-]+$/, // Transactions
  ];

  function isCookieOfInterest(name) {
    return COOKIE_NAME_PATTERNS.some(rx => rx.test(name));
  }

  function maskValueIfApiKey(name, value) {
    if (!/^apikey/.test(name) && !/^sk_/.test(value || '')) return null;
    try {
      const v = String(value || '');
      if (v.startsWith('sk_')) {
        const body = v.slice(3);
        return 'sk_' + (body.length > 4 ? body.slice(0, 4) + '••••••••' : '••••');
      }
      // cookie name starts with apikey..., mask cookie name-like pattern inside value if it looks like a key
      return v.length > 10 ? v.slice(0, 6) + '••••••' : '••••';
    } catch {
      return '••••';
    }
  }

  async function getUrlForSender(senderInfo) {
    // Prefer explicit request.url, then sender.tab.url, otherwise active tab
    if (request && request.url) return request.url;
    if (senderInfo && senderInfo.tab && senderInfo.tab.url) return senderInfo.tab.url;

    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return active ? active.url : undefined;
  }

  switch (action) {
    case 'refresh': {
      replyToSenderTab({ action: 'refresh' });
      break;
    }

    case 'test': {
      console.log('test', request);
      replyToSenderTab({
        action: 'test',
        data: { test: 'this is a test from background.js' },
      });
      break;
    }

    case 'geoip': {
      // Fetch IP-based geolocation and respond via sendResponse
      (async () => {
        try {
          // Free but rate-limited provider; swap to your paid provider for production
          const r = await fetch('https://ipapi.co/json/');
          if (!r.ok) throw new Error('GeoIP HTTP ' + r.status);
          const j = await r.json();
          sendResponse({
            ok: true,
            data: {
              lat: j.latitude,
              lon: j.longitude,
              city: j.city,
              region: j.region,
              country: j.country_name || j.country,
              ip: j.ip,
              accuracyMeters: undefined, // provider typically doesn't supply this
            },
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: (e && e.message) || 'GeoIP failed',
          });
        }
      })();
      return true; // keep message channel open for async sendResponse
    }

    // === NEW: Return cookies visible for the current tab's URL, filtered to app patterns ===
    case 'getCookiesForTab': {
      (async () => {
        try {
          const url = await getUrlForSender(sender);
          if (!url) {
            sendResponse({ ok: false, error: 'No active tab URL available' });
            return;
          }

          chrome.cookies.getAll({ url }, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message || 'cookies.getAll failed' });
              return;
            }

            const rows = (cookies || [])
              .filter(c => isCookieOfInterest(c.name))
              .map(c => {
                // Values are not URL-decoded by the API; they are stored as-is.
                // UI can decodeURIComponent/JSON.parse when needed.
                const masked = maskValueIfApiKey(c.name, c.value);
                return {
                  name: c.name,
                  value: c.value,
                  valueMasked: masked, // optional convenience for UI
                  domain: c.domain,
                  path: c.path,
                  httpOnly: c.httpOnly,
                  secure: c.secure,
                  sameSite: c.sameSite,        // "no_restriction" | "lax" | "strict"
                  session: c.session,          // true if no explicit expiration
                  expirationDate: c.expirationDate || null, // unix seconds
                  storeId: c.storeId || null
                };
              });

            sendResponse({ ok: true, rows, context: { url } });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'Unhandled error in getCookiesForTab' });
        }
      })();
      return true; // async
    }

    // === OPTIONAL: Return ALL cookies for current URL (unfiltered) ===
    case 'getAllCookiesForTab': {
      (async () => {
        try {
          const url = await getUrlForSender(sender);
          if (!url) {
            sendResponse({ ok: false, error: 'No active tab URL available' });
            return;
          }
          chrome.cookies.getAll({ url }, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message || 'cookies.getAll failed' });
              return;
            }
            sendResponse({ ok: true, cookies, context: { url } });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'Unhandled error in getAllCookiesForTab' });
        }
      })();
      return true; // async
    }

    // === OPTIONAL: Query cookies by domain/name pattern (pass { domain, nameRegex }) ===
    case 'queryCookies': {
      (async () => {
        try {
          const { domain, nameRegex } = request || {};
          let filter = {};
          if (domain) filter.domain = domain;
          // cookies.getAll doesn't accept regex; we'll filter post-query.
          chrome.cookies.getAll(filter, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message || 'cookies.getAll failed' });
              return;
            }
            let rows = cookies || [];
            if (nameRegex) {
              try {
                const rx = new RegExp(nameRegex);
                rows = rows.filter(c => rx.test(c.name));
              } catch (e) {
                sendResponse({ ok: false, error: 'Invalid nameRegex: ' + e.message });
                return;
              }
            }
            sendResponse({ ok: true, cookies: rows });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'Unhandled error in queryCookies' });
        }
      })();
      return true; // async
    }

    default: {
      // no-op
      break;
    }
  }

  // For non-async cases we return undefined (i.e., not keeping the channel open)
});
