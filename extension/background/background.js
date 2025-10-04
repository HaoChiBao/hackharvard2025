// background.js

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
          console.log(j)
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
      // Return true to keep the message channel open for the async sendResponse
      return true;
    }

    default: {
      // no-op
      break;
    }
  }

  // For non-async cases we return undefined (i.e., not keeping the channel open)
});
