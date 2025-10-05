// background.js
// NOTE: To use the cookies API, your manifest.json must include:
// "permissions": ["cookies"], and appropriate "host_permissions" (e.g., "https://*/*", "http://*/*")

// Global state for persistent tracking
let globalBehaviorData = {
  clicks: 0,
  keystrokes: 0,
  mouseMovements: 0,
  scrolls: 0,
  sessionStart: Date.now(),
  typingPatterns: [],
  clickPatterns: [],
};

let trackingInterval = null;
let isTracking = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("background.js loaded");
  startPersistentTracking();
});

// Start persistent behavior tracking
function startPersistentTracking() {
  if (isTracking) return;

  isTracking = true;
  console.log("Starting persistent behavior tracking");

  // Update global state every second
  trackingInterval = setInterval(() => {
    // This will be updated by content scripts
    console.log("Background tracking active:", {
      clicks: globalBehaviorData.clicks,
      keystrokes: globalBehaviorData.keystrokes,
      sessionDuration: Math.floor(
        (Date.now() - globalBehaviorData.sessionStart) / 1000
      ),
    });
  }, 5000); // Log every 5 seconds for debugging
}

// Stop persistent tracking
function stopPersistentTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  isTracking = false;
  console.log("Stopped persistent behavior tracking");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  const action = request && request.action;

  // Helper to reply back to the sender tab (fire-and-forget)
  const replyToSenderTab = (payload) => {
    if (typeof tabId === "number") {
      try {
        chrome.tabs.sendMessage(tabId, payload);
      } catch (e) {
        console.warn("Failed to sendMessage to tab", tabId, e);
      }
    }
  };

  // --- Helpers for cookie retrieval ---
  const COOKIE_NAME_PATTERNS = [
    /^merchant_[A-Za-z0-9_-]+$/, // Merchants
    /^apikey[A-Za-z0-9_-]+$/, // API Keys
    /^current_api_key$/, // Session
    /^current_merchantid$/, // Session
    /^verification[A-Za-z0-9_-]+$/, // Verification
    /^transaction_[A-Za-z0-9_-]+$/, // Transactions
  ];

  function isCookieOfInterest(name) {
    return COOKIE_NAME_PATTERNS.some((rx) => rx.test(name));
  }

  function maskValueIfApiKey(name, value) {
    if (!/^apikey/.test(name) && !/^sk_/.test(value || "")) return null;
    try {
      const v = String(value || "");
      if (v.startsWith("sk_")) {
        const body = v.slice(3);
        return (
          "sk_" + (body.length > 4 ? body.slice(0, 4) + "••••••••" : "••••")
        );
      }
      // cookie name starts with apikey..., mask cookie name-like pattern inside value if it looks like a key
      return v.length > 10 ? v.slice(0, 6) + "••••••" : "••••";
    } catch {
      return "••••";
    }
  }

  async function getUrlForSender(senderInfo) {
    // Prefer explicit request.url, then sender.tab.url, otherwise active tab
    if (request && request.url) return request.url;
    if (senderInfo && senderInfo.tab && senderInfo.tab.url)
      return senderInfo.tab.url;

    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return active ? active.url : undefined;
  }

  switch (action) {
    case "refresh": {
      replyToSenderTab({ action: "refresh" });
      break;
    }

    // Handle behavior data updates from content scripts
    case "updateBehaviorData": {
      if (request.data) {
        globalBehaviorData = { ...globalBehaviorData, ...request.data };
        console.log("Background: Updated global behavior data:", {
          clicks: globalBehaviorData.clicks,
          keystrokes: globalBehaviorData.keystrokes,
          mouseMovements: globalBehaviorData.mouseMovements,
          scrolls: globalBehaviorData.scrolls,
          sessionDuration: Math.floor(
            (Date.now() - globalBehaviorData.sessionStart) / 1000
          ),
        });

        // Store in Chrome storage for persistence
        chrome.storage.local.set({
          globalBehaviorData: globalBehaviorData,
        });
      }
      break;
    }

    // Get current behavior data for popup
    case "getBehaviorData": {
      const sessionDuration = Math.floor(
        (Date.now() - globalBehaviorData.sessionStart) / 1000
      );

      // Simple analysis functions
      function analyzeTypingPattern() {
        if (globalBehaviorData.typingPatterns.length < 2)
          return "Insufficient data";

        const patterns = globalBehaviorData.typingPatterns;
        const intervals = patterns.slice(1).map((p, i) => p.timeSinceLastKey);
        const avgInterval =
          intervals.reduce((a, b) => a + b, 0) / intervals.length;

        if (avgInterval < 100) return "Suspicious (too fast)";
        if (avgInterval > 2000) return "Suspicious (too slow)";
        if (intervals.some((i) => i === 0)) return "Suspicious (simultaneous)";
        return "Normal";
      }

      function analyzeMouseActivity() {
        const sessionDuration =
          (Date.now() - globalBehaviorData.sessionStart) / 1000;
        const movementsPerSecond =
          globalBehaviorData.mouseMovements / sessionDuration;

        if (movementsPerSecond < 0.1) return "Suspicious (too low)";
        if (movementsPerSecond > 10) return "Suspicious (too high)";
        return "Normal";
      }

      function analyzePageInteraction() {
        const sessionDuration =
          (Date.now() - globalBehaviorData.sessionStart) / 1000;
        const clicksPerSecond = globalBehaviorData.clicks / sessionDuration;

        if (clicksPerSecond < 0.01) return "Suspicious (too low)";
        if (clicksPerSecond > 2) return "Suspicious (too high)";
        return "Normal";
      }

      const response = {
        clicks: globalBehaviorData.clicks,
        keystrokes: globalBehaviorData.keystrokes,
        mouseMovements: globalBehaviorData.mouseMovements,
        scrolls: globalBehaviorData.scrolls,
        sessionDuration: sessionDuration,
        typingPattern: analyzeTypingPattern(),
        mouseActivity: analyzeMouseActivity(),
        pageInteraction: analyzePageInteraction(),
      };

      console.log("Background: Sending behavior data to popup:", response);
      sendResponse(response);
      return true; // Keep message channel open
    }

    // Add this new case to your existing switch statement in chrome.runtime.onMessage.addListener

    case "sendVerificationEmail": {
      (async () => {
        try {
          const { code, email, apiKey } = request;

          if (!code || !email || !apiKey) {
            sendResponse({ success: false, error: "Missing required fields" });
            return;
          }

          const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #1a1a1a; font-size: 28px; font-weight: 600;">Verification Code</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 40px 30px 40px;" align="center">
                      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 30px; display: inline-block;">
                        <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;">Your verification code</p>
                        <p style="margin: 0; color: #ffffff; font-size: 42px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                          ${code}
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 40px 30px 40px;">
                      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px; text-align: center;">
                        This code will expire in 10 minutes. If you didn't request this code, please contact Visa support.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                        © 2025 Visa Verify. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "onboarding@resend.dev",
              to: [email],
              subject: "Verification Code from Visa Verify",
              html: emailHTML,
            }),
          });

          const data = await response.json();
          console.log("Background: Email API response:", data);

          if (response.ok) {
            sendResponse({ success: true, data });
          } else {
            sendResponse({
              success: false,
              error: data.message || "Failed to send email",
            });
          }
        } catch (error) {
          console.error("Background: Error sending email:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep message channel open for async response
    }

    case "test": {
      console.log("test", request);
      replyToSenderTab({
        action: "test",
        data: { test: "this is a test from background.js" },
      });
      break;
    }

    case "geoip": {
      // Fetch IP-based geolocation and respond via sendResponse
      (async () => {
        try {
          // Free but rate-limited provider; swap to your paid provider for production
          const r = await fetch("https://ipapi.co/json/");
          if (!r.ok) throw new Error("GeoIP HTTP " + r.status);
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
            error: (e && e.message) || "GeoIP failed",
          });
        }
      })();
      return true; // keep message channel open for async sendResponse
    }

    // === NEW: Return cookies visible for the current tab's URL, filtered to app patterns ===
    case "getCookiesForTab": {
      (async () => {
        try {
          const url = await getUrlForSender(sender);
          if (!url) {
            sendResponse({ ok: false, error: "No active tab URL available" });
            return;
          }

          chrome.cookies.getAll({ url }, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                ok: false,
                error:
                  chrome.runtime.lastError.message || "cookies.getAll failed",
              });
              return;
            }

            const rows = (cookies || [])
              .filter((c) => isCookieOfInterest(c.name))
              .map((c) => {
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
                  sameSite: c.sameSite, // "no_restriction" | "lax" | "strict"
                  session: c.session, // true if no explicit expiration
                  expirationDate: c.expirationDate || null, // unix seconds
                  storeId: c.storeId || null,
                };
              });

            sendResponse({ ok: true, rows, context: { url } });
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e?.message || "Unhandled error in getCookiesForTab",
          });
        }
      })();
      return true; // async
    }

    // === OPTIONAL: Return ALL cookies for current URL (unfiltered) ===
    case "getAllCookiesForTab": {
      (async () => {
        try {
          const url = await getUrlForSender(sender);
          if (!url) {
            sendResponse({ ok: false, error: "No active tab URL available" });
            return;
          }
          chrome.cookies.getAll({ url }, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                ok: false,
                error:
                  chrome.runtime.lastError.message || "cookies.getAll failed",
              });
              return;
            }
            sendResponse({ ok: true, cookies, context: { url } });
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e?.message || "Unhandled error in getAllCookiesForTab",
          });
        }
      })();
      return true; // async
    }

    // === OPTIONAL: Query cookies by domain/name pattern (pass { domain, nameRegex }) ===
    case "queryCookies": {
      (async () => {
        try {
          const { domain, nameRegex } = request || {};
          let filter = {};
          if (domain) filter.domain = domain;
          // cookies.getAll doesn't accept regex; we'll filter post-query.
          chrome.cookies.getAll(filter, (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                ok: false,
                error:
                  chrome.runtime.lastError.message || "cookies.getAll failed",
              });
              return;
            }
            let rows = cookies || [];
            if (nameRegex) {
              try {
                const rx = new RegExp(nameRegex);
                rows = rows.filter((c) => rx.test(c.name));
              } catch (e) {
                sendResponse({
                  ok: false,
                  error: "Invalid nameRegex: " + e.message,
                });
                return;
              }
            }
            sendResponse({ ok: true, cookies: rows });
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e?.message || "Unhandled error in queryCookies",
          });
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
