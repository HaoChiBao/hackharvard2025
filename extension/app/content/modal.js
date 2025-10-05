/* content.js — modal with live data sourcing + caching
   Final behavior after analyzing:
   - Always hide "Analyzing Risk" list, always show "Top Risk Factors"
   - If score < RISK_REVIEW_THRESHOLD → show Done overlay, circle green, modal exitable
   - If score >= RISK_REVIEW_THRESHOLD → hide overlay, show Email Auth, circle red, modal NOT exitable, inputs focusable/editable
*/
window.addEventListener("load", async () => {
  // ===== URL gate: only run on pages whose URL contains "checkout" =====
  const href = String((location && location.href) || "");
  if (!href.toLowerCase().includes("checkout")) {
    return; // do nothing on non-checkout pages
  }

  // ----- Editable global threshold -----
  const RISK_REVIEW_THRESHOLD = 35; // <-- change this anytime (0..95)

  // Optional refresh listener
  chrome.runtime?.onMessage?.addListener?.(function (request) {
    if (request?.action === "refresh") {
      setTimeout(() => {
        try {
          typeof sendMessage === "function" && sendMessage("refresh");
        } catch {}
        console.log("refreshed content.js");
      }, 18000);
    }
  });

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const safeNum = (v, d = 0) => (Number.isFinite(v) ? v : d);

  // ---------- lightweight storage (chrome.storage.local → localStorage fallback) ----------
  async function storageGet(key) {
    try {
      if (chrome?.storage?.local) {
        const r = await chrome.storage.local.get([key]);
        return r[key];
      }
    } catch {}
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch {}
    return undefined;
  }
  async function storageSet(key, value) {
    try {
      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [key]: value });
        return;
      }
    } catch {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  // ---------- purchase history helpers ----------
  async function getPurchaseHistory() {
    try {
      if (chrome?.storage?.local) {
        const res = await chrome.storage.local.get(["purchaseHistory"]);
        if (res && Array.isArray(res.purchaseHistory))
          return res.purchaseHistory;
      }
    } catch {}
    try {
      const raw = localStorage.getItem("purchaseHistory");
      const val = raw ? JSON.parse(raw) : null;
      return Array.isArray(val) ? val : [];
    } catch {}
    return [];
  }

  // ---------- PRICE DETECTION ----------
  const TOTAL_KEYWORDS = [
    "total","order total","grand total","amount due","to pay","pay now","total due","order summary","final total","you pay",
  ];
  const NEGATIVE_HINTS = ["shipping","tax","fee","promo","discount","gift card"];
  const SUMMARY_CONTAINER_HINTS = ["summary","totals","checkout","order","cart","payment"];
  const CURRENCY_RX =
    /(?:USD|CAD|AUD|NZD|EUR|GBP|JPY|CHF|SEK|NOK|DKK|MXN|BRL|INR|CNY|HKD|KRW|SGD|ZAR|AED|SAR|QAR|TRY|PLN|CZK|HUF|ILS|RON|COP|ARS|CLP|PEN|TWD|THB|IDR|MYR|PHP|VND|\$|£|€|¥)\s?[\d\.,]+/i;
  const MONEY_FRAGMENT_RX =
    /([\$£€¥]|USD|CAD|AUD|NZD|EUR|GBP|JPY)\s*([\d\.,]+)/i;

  function normalizeNumber(str) {
    let s = (str || "").replace(/\s+/g, "");
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/,/g, "");
    } else if (s.includes(",") && !s.includes(".")) {
      const parts = s.split(",");
      s = parts[parts.length - 1].length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
    }
    const n = parseFloat(s.replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  }
  function extractPrice(text) {
    if (!text) return null;
    const m = text.match(MONEY_FRAGMENT_RX);
    if (!m) return null;
    const currency = m[1];
    const num = normalizeNumber(m[2]);
    if (num == null) return null;
    return { amount: num, currency, raw: m[0] };
  }
  function elementText(el) { return (el && el.textContent ? el.textContent : "").trim(); }
  function scoreElementForTotal(el) {
    const txtRaw = elementText(el);
    const txt = txtRaw.toLowerCase();
    if (!CURRENCY_RX.test(txt)) return { score: 0, price: null };
    try {
      if ((getComputedStyle(el).textDecorationLine || "").includes("line-through"))
        return { score: 0, price: null };
    } catch {}
    const matches = txt.match(new RegExp(CURRENCY_RX, "gi")) || [];
    let bestPrice = matches.length ? extractPrice(matches[matches.length - 1]) : extractPrice(txtRaw);
    if (!bestPrice) return { score: 0, price: null };
    let score = 0;
    for (const k of TOTAL_KEYWORDS) if (txt.includes(k)) score += 5;
    for (const n of NEGATIVE_HINTS) if (txt.includes(n)) score -= 2;
    let cur = el, hops = 0;
    while (cur && hops < 5) {
      const cls = (cur.className || "").toString().toLowerCase();
      const id  = (cur.id || "").toString().toLowerCase();
      if (SUMMARY_CONTAINER_HINTS.some((h) => cls.includes(h) || id.includes(h))) { score += 3; break; }
      cur = cur.parentElement; hops++;
    }
    if (bestPrice.amount > 0) score += Math.min(5, Math.floor(bestPrice.amount / 500));
    return { score, price: bestPrice };
  }
  function findCheckoutTotal() {
    const obviousSels = [
      '[data-testid*="total"]','[data-test*="total"]',".order-total",".grand-total",".total","#total",
      ".summary-total",".amount-due",".order-summary-total",'[aria-label*="total"]','[aria-label*="amount due"]',
    ];
    const obvious = []; obviousSels.forEach((sel) => obvious.push(...document.querySelectorAll(sel)));

    const nodes = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tn = el.tagName;
      if (tn === "SCRIPT" || tn === "STYLE" || tn === "NOSCRIPT" || tn === "TEMPLATE") continue;
      const txt = elementText(el);
      if (!txt || txt.length > 400) continue;
      if (CURRENCY_RX.test(txt)) nodes.push(el);
    }
    const candidates = [...new Set([...obvious, ...nodes])];
    let best = { score: 0, price: null, el: null };
    for (const el of candidates) {
      const s = scoreElementForTotal(el);
      if (s.score > best.score && s.price) best = { score: s.score, price: s.price, el };
    }
    if (!best.price) {
      const containerSel = SUMMARY_CONTAINER_HINTS.map((h) => `[class*="${h}"], [id*="${h}"]`).join(",");
      const containers = containerSel ? [...document.querySelectorAll(containerSel)] : [];
      let maxPrice = null;
      for (const c of containers) {
        const prices = (elementText(c).match(new RegExp(CURRENCY_RX, "gi")) || [])
          .map(extractPrice).filter(Boolean);
        for (const p of prices)
          if (!maxPrice || (p.amount || 0) > (maxPrice.amount || 0)) maxPrice = p;
      }
      if (maxPrice) best = { score: 1, price: maxPrice, el: null };
    }
    return best.price
      ? { amount: best.price.amount, currency: best.price.currency, rawText: best.price.raw, source: best.el ? "keyword+currency" : "container-fallback" }
      : null;
  }

  // ---------- LIVE BEHAVIOR SAMPLERS ----------
  const keyTimes = []; let lastKeyTime = 0;
  addEventListener("keydown", () => {
    const t = performance?.now?.() ?? Date.now();
    if (lastKeyTime) keyTimes.push(t - lastKeyTime);
    lastKeyTime = t;
  }, { passive: true, capture: true });
  addEventListener("blur", () => { lastKeyTime = 0; }, { passive: true });

  const pressureSamples = [];
  function pushPressureSample(v){ if (Number.isFinite(v)) { pressureSamples.push(v); if (pressureSamples.length > 500) pressureSamples.shift(); } }
  addEventListener("pointerdown", (e) => {
    if (typeof e.pressure === "number") {
      if (e.pointerType === "mouse" && !e.buttons) return;
      pushPressureSample(e.pressure);
    }
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    if (typeof e.pressure === "number") {
      if (e.pointerType === "mouse" && !e.buttons) return;
      pushPressureSample(e.pressure);
    }
  }, { passive: true });

  const scrollDeltas = []; let _sx = window.scrollX||0; let _sy = window.scrollY||0;
  addEventListener("wheel", (e) => {
    scrollDeltas.push({ t: Date.now(), dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
    if (scrollDeltas.length > 500) scrollDeltas.shift();
  }, { passive: true });
  addEventListener("scroll", () => {
    const nx = window.scrollX||0, ny = window.scrollY||0;
    const dx = Math.round(nx - _sx), dy = Math.round(ny - _sy);
    if (dx !== 0 || dy !== 0) {
      scrollDeltas.push({ t: Date.now(), dx, dy });
      if (scrollDeltas.length > 500) scrollDeltas.shift();
      _sx = nx; _sy = ny;
    }
  }, { passive: true });

  const mousePositions = []; const MP_MAX = 4000;
  let _lastMx = null, _lastMy = null, _lastMt = 0;
  function pushMouse(x, y) {
    const t = performance?.now?.() ?? Date.now();
    let v = 0;
    if (_lastMx != null && _lastMy != null && _lastMt) {
      const dt = (t - _lastMt) / 1000;
      if (dt > 0) v = Math.hypot(x - _lastMx, y - _lastMy) / dt;
    }
    _lastMx = x; _lastMy = y; _lastMt = t;
    mousePositions.push({ t: Math.round(t), x: Math.round(x), y: Math.round(y), v: Math.round(v) });
    if (mousePositions.length > MP_MAX) mousePositions.shift();
  }
  addEventListener("mousemove", (e) => { pushMouse(e.clientX, e.clientY); }, { passive: true });

  const rateCounters = { clicks: 0, inputs: 0, navStart: Date.now() };
  addEventListener("click", () => { rateCounters.clicks++; }, { passive: true });
  ["input","textarea","select"].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.addEventListener("input", () => { rateCounters.inputs++; }, { passive: true });
    });
  });

  // Summarizers (on-demand)
  function summarizeCadence(arr){
    if(!arr.length) return { n:0 };
    const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n, v=arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n;
    return { n, mean:+mean.toFixed(2), std:+Math.sqrt(v).toFixed(2) };
  }
  function summarizeArray(arr){
    if(!arr.length) return { n:0 };
    const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n, min=Math.min(...arr), max=Math.max(...arr);
    return { n, mean:+mean.toFixed(3), min:+min.toFixed(3), max:+max.toFixed(3) };
  }
  function summarizeScroll(arr){
    if(!arr.length) return { n:0 };
    const n=arr.length, totalY=arr.reduce((a,b)=>a+Math.abs(b.dy),0), totalX=arr.reduce((a,b)=>a+Math.abs(b.dx),0);
    return { n, totalY, totalX };
  }
  function summarizeMousePositions(arr){
    if(!arr.length) return { n:0 };
    const n = arr.length; let sumV = 0, maxV = 0;
    for (let i=0;i<n;i++){ const v = arr[i].v||0; sumV += v; if (v>maxV) maxV=v; }
    const avgV = sumV / n; const last = arr[n-1];
    return { n, lastX:last.x, lastY:last.y, lastV:last.v, avgV:+avgV.toFixed(2), maxV };
  }
  function summarizeRates(){
    const secs = Math.max(1, (Date.now()-rateCounters.navStart)/1000);
    return { clicksPerMin:+(rateCounters.clicks/(secs/60)).toFixed(2), inputsPerMin:+(rateCounters.inputs/(secs/60)).toFixed(2), timeOnPageSecs:Math.round(secs) };
  }

  // ---------- Live session snapshot ----------
  async function writeCurrentSnapshot() {
    const total = findCheckoutTotal();
    const snapshot = {
      meta: { id: "modal-live", startedAt: new Date().toISOString(), url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio||1 }, ua: navigator.userAgent },
      total: total ? { amount: total.amount, currency: total.currency, rawText: total.rawText, source: total.source } : null,
      mousePosition: summarizeMousePositions(mousePositions),
      cadence: summarizeCadence(keyTimes),
      pressure: summarizeArray(pressureSamples),
      scroll: summarizeScroll(scrollDeltas),
      rates: summarizeRates(),
      updatedAt: Date.now()
    };
    await storageSet("currentSession", snapshot);
    return snapshot;
  }

  // ---------- robust stats helpers ----------
  function median(arr){ if(!arr.length) return NaN; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
  function mad(arr, med){ if(!arr.length||!Number.isFinite(med)) return NaN; const dev=arr.map(v=>Math.abs(v-med)); return median(dev); }
  function winsorize(arr,p=0.05){ if(!arr.length) return []; const a=[...arr].sort((x,y)=>x-y); const loIdx=Math.floor(p*(a.length-1)); const hiIdx=Math.ceil((1-p)*(a.length-1)); const lo=a[loIdx]; const hi=a[hiIdx]; return a.map(v=>clamp(v,lo,hi)); }

  // ---------- UI behavior constants ----------
  const VISIBLE_COUNT = 2;
  const ROW_H = 54;
  const ROW_GAP = 12;
  const ENTER_MS = 140;
  const EXIT_MS = 220;
  const HOLD_MIN = 550;
  const HOLD_MAX = 550;

  // ---------- RISK WEIGHTS ----------
  const WEIGHTS = { credentialsHeadless: 20, useHistory: 20, biometrics: 30, otherChecks: 25 };
  const DISPLAY_MAX = 95;

  // ---------- metric helpers ----------
  const METRICS = {
    credentialsHeadless: () => {
      const ua = navigator.userAgent || "";
      const webdriver = navigator.webdriver === true;
      let hasWebGL = false;
      try { const c = document.createElement("canvas"); hasWebGL = !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch {}
      let risk = 0.12;
      if (webdriver) risk += 0.45;
      if (!hasWebGL) risk += 0.08;
      if (/Headless|bot|crawler|spider/i.test(ua)) risk += 0.28;
      return clamp(risk, 0, 1);
    },

    /* Pricing:
       – $ < 1000 → 0 points
       – $ >= 1000 → 20 + 30*(1 - e^(-(amount-1000)/1500))   (cap 50)
       – History add-on (0–5), capped at 50
    */
    pricingHistoryPoints: async () => {
      const total = findCheckoutTotal();
      if (!total || !Number.isFinite(total.amount)) return 0;

      console.log("[Modal] Detected checkout total:", total);

      const amt = total.amount;
      let points = 0;
      if (amt >= 1000) {
        const SCALE = 1500;
        const extraExp = 30 * (1 - Math.exp(-(amt - 1000) / SCALE));
        points = 20 + extraExp;
      } else {
        points = 0;
      }

      const purchases = await getPurchaseHistory();
      const hist = (Array.isArray(purchases) ? purchases : [])
        .map((p) => safeNum(p?.amount, NaN))
        .filter(Number.isFinite);

      if (hist.length >= 3 && amt >= 1000) {
        const w = winsorize(hist, 0.05);
        const med = median(w);
        const MAD = mad(w, med) || 0;
        const robustSigma = MAD * 1.4826 || 1;
        const diff = amt - med;
        if (diff > 0) {
          const z = diff / robustSigma;
          const nWeight = clamp(hist.length / 20, 0.15, 1.0);
          let histAdj = 0;
          if (z >= 4) histAdj = 5;
          else if (z >= 3) histAdj = 3;
          else if (z >= 2) histAdj = 2;
          else if (z >= 1) histAdj = 1;
          points += Math.round(histAdj * nWeight);
        }
      }

      await writeCurrentSnapshot();
      return Math.min(50, Math.round(points));
    },

    useHistory: () => {
      const r = summarizeRates();
      const clicks = safeNum(r.clicksPerMin, 0);
      const inputs = safeNum(r.inputsPerMin, 0);
      const secs = safeNum(r.timeOnPageSecs, 0);

      let risk = 0.16;
      if (secs < 5) risk += 0.5;
      if (clicks > 25) risk += 0.35;
      if (inputs > 18) risk += 0.35;
      if (secs < 20 && (clicks > 12 || inputs > 10)) risk += 0.25;
      return clamp(risk, 0, 1);
    },

    biometrics: () => {
      const cad = summarizeCadence(keyTimes);
      const mpos = summarizeMousePositions(mousePositions);
      const pres = summarizeArray(pressureSamples);

      let cadRisk = 0.1;
      if (Number.isFinite(cad.std)) {
        if (cad.std < 15) cadRisk = 0.4;
        else if (cad.std > 300) cadRisk = 0.36;
        else if (cad.std > 170) cadRisk = 0.22;
        else cadRisk = 0.12;
      }

      let mouseRisk = 0.1;
      if (Number.isFinite(mpos.avgV) && mpos.avgV < 30) mouseRisk += 0.08;
      if (Number.isFinite(mpos.maxV) && mpos.maxV > 8000) mouseRisk += 0.1;

      let pressRisk = 0.08;
      if (Number.isFinite(pres.mean) && pres.mean === 0) pressRisk += 0.06;

      return clamp(cadRisk * 0.5 + mouseRisk * 0.3 + pressRisk * 0.2, 0, 1);
    },

    otherChecks: () => {
      const scr = summarizeScroll(scrollDeltas);
      const totalY = Math.abs(safeNum(scr.totalY, 0));
      const n = safeNum(scr.n, 0);
      let risk = 0.08;
      if (n === 0 && totalY === 0) risk += 0.1;
      if (n > 0 && totalY < 200) risk += 0.06;
      const mpN = safeNum(summarizeMousePositions(mousePositions).n, 0);
      if (mpN > 300 && totalY < 100) risk += 0.06;
      return clamp(risk, 0, 1);
    },
  };

  // Labels shown in the UI
  const info_items = [
    "Credentials","Pricing History","Use History","Behavioural Biometrics","Other Checks",
  ];

  // Mapping visible rows → metric keys
  const INFO_TO_METRIC_KEYS = [
    "credentialsHeadless","pricingHistoryPoints","useHistory","biometrics","otherChecks",
  ];

  // ---------- UI build ----------
  const attachModal = async () => {
    const bg = document.createElement("bg-component");
    const modal = document.createElement("modal-component");

    const title = document.createElement("h2");
    const title_img = document.createElement("img");
    title_img.className = "title-img";
    title_img.src = await chrome.runtime.getURL("assets/images/verify-title.png");

    title.appendChild(title_img);

    const container = document.createElement("div");
    container.className = "container";

    const risk_score = document.createElement("div");
    risk_score.className = "risk-score";

    const score_value = document.createElement("span");
    score_value.className = "score-value";
    score_value.textContent = "0";

    const score_label = document.createElement("span");
    score_label.className = "score-label";
    score_label.textContent = "Transaction Risk Score";

    const analyze_risk = document.createElement("div");
    analyze_risk.className = "analyze-risk";

    const analyze_label = document.createElement("span");
    analyze_label.className = "analyze-label";
    analyze_label.textContent = "Analyzing Risk";

    const analyze_list = document.createElement("div");
    analyze_list.className = "analyze-list windowed";
    analyze_list.style.setProperty("--visible-count", String(VISIBLE_COUNT));
    analyze_list.style.setProperty("--row-h", `${ROW_H}px`);
    analyze_list.style.setProperty("--row-gap", `${ROW_GAP}px`);

    const itemNodes = [];
    const itemMap = new Map();

    const setItemRow = (node, row) => {
      node.style.setProperty("--y", `${row * (ROW_H + ROW_GAP)}px`);
      node.style.setProperty("--opacity", "1");
      node.style.removeProperty("--scale");
    };

    info_items.forEach((item) => {
      const item_div = document.createElement("div");
      item_div.className = "info-item";

      const label = document.createElement("span");
      label.className = "info-title";
      label.textContent = item;

      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.setAttribute("aria-hidden", "true");

      item_div.addEventListener("click", () => {
        if (analyze_list.classList.contains("locked")) return;
        item_div.classList.toggle("added");
      });

      item_div.appendChild(label);
      item_div.appendChild(dot);
      analyze_list.appendChild(item_div);

      itemNodes.push(item_div);
      itemMap.set(item, item_div);
    });

    window.setInfoItemStatus = (name, isAdded = true) => {
      const node = itemMap.get(name);
      if (!node) return false;
      node.classList.toggle("added", !!isAdded);
      return true;
    };

    // ===== Completion overlay =====
    const doneOverlay = document.createElement("div");
    doneOverlay.className = "done-overlay";

    const doneSurface = document.createElement("div");
    doneSurface.className = "done-surface";
    doneSurface.setAttribute("role", "dialog");
    doneSurface.setAttribute("aria-modal", "true");
    doneSurface.setAttribute("aria-label", "Analysis Complete");

    const doneCloseBtn = document.createElement("button");
    doneCloseBtn.className = "done-close-btn";
    doneCloseBtn.type = "button";
    doneCloseBtn.setAttribute("aria-label", "Close overlay");
    doneCloseBtn.textContent = "×";

    const doneContent = document.createElement("div");
    doneContent.className = "done-content";

    const doneTitle = document.createElement("img");
    doneTitle.className = "done-title";
    doneTitle.src = await chrome.runtime.getURL("assets/images/visa-logo.png");

    const doneSubtitle = document.createElement("p");
    doneSubtitle.className = "done-subtitle";
    doneSubtitle.textContent = "Identity Verified";

    const doneCheck = document.createElement("img");
    doneCheck.className = "done-check";
    doneCheck.src = await chrome.runtime.getURL("assets/images/checkmark.png");

    const doneDetails = document.createElement("p");
    doneDetails.className = "done-details";
    doneDetails.textContent = "how was this calculated?";

    doneDetails.addEventListener("click", () => {
      console.log("Details clicked");
      doneOverlay.classList.remove("show");
    });

    doneSubtitle.appendChild(doneCheck);
    doneContent.appendChild(doneTitle);
    doneContent.appendChild(doneSubtitle);
    doneContent.appendChild(doneDetails);

    doneSurface.appendChild(doneCloseBtn);
    doneSurface.appendChild(doneContent);
    doneOverlay.appendChild(doneSurface);

    // ===== Top Risk block =====
    const topItems = document.createElement("div");
    topItems.className = "top-items";

    const topLabel = document.createElement("span");
    topLabel.className = "top-label";
    topLabel.textContent = "Top Risk Factors";

    const topRiskList = document.createElement("div");
    topRiskList.className = "top-risk-list";

    ["Unusual Behavior", "Amount unusually high"].forEach(async (item) => {
      const item_div = document.createElement("div");
      item_div.className = "top-risk-item";
      const label = document.createElement("span");
      label.className = "top-risk-title";
      label.textContent = item;
      const warning_icon = document.createElement("img");
      warning_icon.className = "warning-icon";
      warning_icon.src = await chrome.runtime.getURL("assets/images/warning-icon.png");
      item_div.appendChild(warning_icon);
      item_div.appendChild(label);
      topRiskList.appendChild(item_div);
    });

    topItems.appendChild(topLabel);
    topItems.appendChild(topRiskList);

    // ===== Email Authentication (4-digit code) =====
    const email_authentication = document.createElement("div");
    email_authentication.className = "email-authentication";
    email_authentication.style.pointerEvents = "auto";

    // Keep your code-sending logic intact
    const verificationCode = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    console.log("Generated verification code:", verificationCode);

    const emailHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              <tr><td style="padding:40px 40px 20px 40px;text-align:center;">
                <h1 style="margin:0;color:#1a1a1a;font-size:28px;font-weight:600;">Verification Code</h1>
              </td></tr>
              <tr><td style="padding:0 40px 30px 40px;" align="center">
                <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:8px;padding:30px;display:inline-block;">
                  <p style="margin:0 0 10px 0;color:#fff;font-size:14px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Your verification code</p>
                  <p style="margin:0;color:#fff;font-size:42px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;">${verificationCode}</p>
                </div>
              </td></tr>
              <tr><td style="padding:0 40px 30px 40px;">
                <p style="margin:0;color:#6b7280;font-size:14px;line-height:20px;text-align:center;">This code will expire in 10 minutes. If you didn't request this code, please contact Visa support.</p>
              </td></tr>
              <tr><td style="padding:30px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
                <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">© 2025 Visa Verify. All rights reserved.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`;

    async function sendVerificationEmail() {
      try {
        const response = await chrome.runtime.sendMessage({
          action: "sendVerificationEmail",
          code: verificationCode,
          email: "nw55699@gmail.com",
          apiKey: "",
          html: emailHTML
        });
        console.log("Email sent:", response);
        if (!response.success) {
          console.error("Failed to send email:", response.error);
        }
      } catch (error) {
        console.error("Error sending email:", error);
        return;
      }
    }

    const email_label = document.createElement("span");
    email_label.className = "email-label";
    email_label.textContent = "Authentication Required";

    const email_subtitle = document.createElement("span");
    email_subtitle.className = "email-subtitle";
    email_subtitle.textContent = "Enter the 4-digit code we sent to your email.";

    const email_code = document.createElement("div");
    email_code.className = "email-code";
    email_code.setAttribute("role", "group");
    email_code.setAttribute("aria-label", "Enter 4 digit verification code");

    const CODE_LEN = 4;
    const cells = [];

    function focusCell(i) {
      const idx = Math.max(0, Math.min(CODE_LEN - 1, i));
      const el = cells[idx];
      el?.focus();
      el?.select?.();
    }
    function isDigitKey(e) {
      return (
        (e.key && /^\d$/.test(e.key)) ||
        e.code === "Numpad0" || e.code === "Numpad1" || e.code === "Numpad2" ||
        e.code === "Numpad3" || e.code === "Numpad4" || e.code === "Numpad5" ||
        e.code === "Numpad6" || e.code === "Numpad7" || e.code === "Numpad8" ||
        e.code === "Numpad9"
      );
    }
    function setDigitAndAdvance(idx, digit) {
      const el = cells[idx];
      if (!el) return;
      el.value = digit;
      if (idx < CODE_LEN - 1) focusCell(idx + 1);
      else el.blur?.();
    }

    // Build inputs
    for (let i = 0; i < CODE_LEN; i++) {
      const inp = document.createElement("input");
      inp.className = "code-cell";
      inp.type = "text";
      inp.inputMode = "numeric";
      inp.autocomplete = "one-time-code";
      inp.setAttribute("pattern", "\\d*");
      inp.setAttribute("maxlength", "1");
      inp.setAttribute("aria-label", `Digit ${i + 1}`);
      inp.setAttribute("data-index", String(i));
      inp.tabIndex = 0;
      inp.value = "";

      ["mousedown","mouseup","click","keydown","keyup","input","paste","beforeinput"]
        .forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation(), true));

      inp.addEventListener("beforeinput", (e) => {
        if (e.inputType && e.inputType.startsWith("delete")) return;
        if (e.data && !/^\d$/.test(e.data)) e.preventDefault();
      });

      inp.addEventListener("input", (e) => {
        const el = e.currentTarget;
        const idx = Number(el.getAttribute("data-index"));
        const m = (el.value || "").match(/\d/);
        el.value = m ? m[0] : "";
        if (el.value) {
          if (idx < CODE_LEN - 1) focusCell(idx + 1);
          else el.blur?.();
        }
        // do not auto-verify here; verify on Enter or button
      });

      inp.addEventListener("keydown", (e) => {
        const idx = Number(e.currentTarget.getAttribute("data-index"));

        if (e.key === "Enter") {
          e.preventDefault();
          verifyCurrentCode();
          return;
        }
        if (e.key === "Backspace") {
          if (e.currentTarget.value) {
            e.currentTarget.value = "";
          } else if (idx > 0) {
            const prev = cells[idx - 1];
            prev.value = "";
            focusCell(idx - 1);
          }
          e.preventDefault();
          return;
        }
        if (e.key === "Delete") { e.currentTarget.value = ""; e.preventDefault(); return; }
        if (e.key === "ArrowLeft") { focusCell(idx - 1); e.preventDefault(); return; }
        if (e.key === "ArrowRight"){ focusCell(idx + 1); e.preventDefault(); return; }

        if (isDigitKey(e)) {
          e.preventDefault();
          const digit = e.key.match(/\d/) ? e.key : String(e.code.replace("Numpad",""));
          if (/^\d$/.test(digit)) setDigitAndAdvance(idx, digit);
          return;
        }
      });

      inp.addEventListener("paste", (e) => {
        e.preventDefault();
        const idx = Number(e.currentTarget.getAttribute("data-index"));
        const text = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, CODE_LEN);
        if (!text) return;
        for (let i2 = 0; i2 < text.length && idx + i2 < CODE_LEN; i2++) {
          cells[idx + i2].value = text[i2];
        }
        focusCell(Math.min(idx + text.length, CODE_LEN - 1));
      });

      cells.push(inp);
      email_code.appendChild(inp);
    }

    const errorMsg = document.createElement("div");
    errorMsg.className = "code-error";
    errorMsg.setAttribute("role", "alert");
    errorMsg.setAttribute("aria-live", "polite");
    errorMsg.style.cssText =
      "margin-top:8px;color:#B91C1C;background:#FEE2E2;border:1px solid #FCA5A5;padding:8px 10px;border-radius:8px;display:none;font-size:13px;";

    const verifyBtn = document.createElement("button");
    verifyBtn.type = "button";
    verifyBtn.textContent = "Verify";
    verifyBtn.className = "verify-btn";
    verifyBtn.style.cssText =
      "margin-top:10px;padding:10px 14px;border-radius:10px;border:none;background:#1A1F71;color:#fff;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.08);";
    verifyBtn.addEventListener("click", () => verifyCurrentCode());

    const getEmailCode = () => cells.map((c) => c.value || "").join("");
    const setEmailCode = (code) => {
      const digits = String(code || "").replace(/\D/g, "").slice(0, CODE_LEN).padEnd(CODE_LEN, "");
      for (let i = 0; i < CODE_LEN; i++) cells[i].value = digits[i] || "";
      focusCell(digits.indexOf("") === -1 ? CODE_LEN - 1 : Math.max(0, digits.indexOf("")));
    };
    const clearEmailCode = () => { cells.forEach((c) => (c.value = "")); focusCell(0); };

    window.getEmailCode = getEmailCode;
    window.setEmailCode = setEmailCode;
    window.clearEmailCode = clearEmailCode;

    function showError(msg) {
      errorMsg.textContent = msg || "There was an error.";
      errorMsg.style.display = "block";
    }
    function hideError() {
      errorMsg.style.display = "none";
      errorMsg.textContent = "";
    }

    function showSuccessOverlay() {
      // success path: show overlay and allow exit
      setScoreColorGood();
      email_authentication.style.display = "none";
      doneOverlay.classList.add("show");
      setTimeout(() => {
        const t = doneOverlay.querySelector(".done-title");
        const s = doneOverlay.querySelector(".done-subtitle");
        t && t.classList.add("in");
        s && s.classList.add("in");
      }, 500);
      canClose = true;
      bg.style.cursor = "default";
      doneCloseBtn?.focus?.();
    }

    // Verification on Enter or button
    function verifyCurrentCode() {
      const code = getEmailCode();
      console.log("Verifying code:", code);

    //   if (code.length < CODE_LEN || code.includes("")) {
    //     showError("Please enter the 4-digit code.");
    //     return;
    //   }
      if (String(code) === String(verificationCode)) {
        hideError();
        showSuccessOverlay();
      } else {
        showError("That code is incorrect. Please try again.");
        clearEmailCode();
      }
    }

    email_authentication.appendChild(email_label);
    email_authentication.appendChild(email_subtitle);
    email_authentication.appendChild(email_code);
    email_authentication.appendChild(verifyBtn);
    email_authentication.appendChild(errorMsg);

    // ===== Assemble modal =====
    risk_score.appendChild(score_value);
    risk_score.appendChild(score_label);
    analyze_risk.appendChild(analyze_label);
    analyze_risk.appendChild(analyze_list);

    const showTopItems = (show) => { topItems.style.display = show ? "flex" : "none"; };

    // initial states
    showTopItems(false);
    email_authentication.style.display = "none";

    container.appendChild(risk_score);
    container.appendChild(analyze_risk);
    container.appendChild(topItems);
    container.appendChild(email_authentication);

    modal.appendChild(title);
    modal.appendChild(container);
    modal.appendChild(doneOverlay);
    bg.appendChild(modal);
    document.body.appendChild(bg);

    // ===== Close controls: gating by final score =====
    let canClose = false; // changed after analysis or successful verification

    const closeModal = () => {
      if (!canClose) return;
      bg.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKey);
      doneCloseBtn.removeEventListener("click", onCloseBtn);
      try { bg.remove(); } catch {}
    };

    const onBackdropClick = (e) => { if (canClose && e.target === bg) closeModal(); };
    const onCloseBtn = () => { if (canClose) closeModal(); };
    const onKey = (e) => {
      if (e.key === "Enter" && email_authentication.style.display !== "none") {
        verifyCurrentCode();
        return;
      }
      if (canClose && e.key === "Escape") closeModal();
    };

    bg.addEventListener("click", onBackdropClick);
    doneCloseBtn.addEventListener("click", onCloseBtn);
    document.addEventListener("keydown", onKey);

    // ===== score update =====
    let runningScore = 0;
    function setScoreImmediate(value) {
      runningScore = clamp(Math.round(value), 0, DISPLAY_MAX);
      score_value.textContent = String(runningScore);
    }
    function setScoreColorGood() {
      score_value.style.backgroundColor = "#D1FAE5";
      score_value.style.color = "#065F46";
      score_value.style.boxShadow = "0 4px 10px rgba(16,185,129,0.35)";
    }
    function setScoreColorBad() {
      score_value.style.backgroundColor = "#FEE2E2";
      score_value.style.color = "#7F1D1D";
      score_value.style.boxShadow = "0 4px 10px rgba(239,68,68,0.35)";
    }

    async function animateScoreTo(target, dur = 260) {
      const start = runningScore;
      const end = clamp(Math.round(target), 0, DISPLAY_MAX);
      if (end === start || dur <= 0) { setScoreImmediate(end); return; }
      const t0 = performance.now();
      return new Promise((resolve) => {
        const tick = (t) => {
          const p = clamp((t - t0) / dur, 0, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          const val = Math.round(start + (end - start) * ease);
          score_value.textContent = String(val);
          runningScore = val;
          if (p < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
    }

    async function evaluateMetricAndUpdateScore(metricKey) {
      if (metricKey === "pricingHistoryPoints") {
        let deltaPoints = 0;
        try { deltaPoints = Math.max(0, Math.round(await METRICS.pricingHistoryPoints())); }
        catch (e) { console.warn("Pricing metric error", e); deltaPoints = 0; }
        const next = runningScore + deltaPoints;
        await animateScoreTo(next, 320);
        return;
      }

      const fn = METRICS[metricKey];
      const w  = WEIGHTS[metricKey] ?? 0;
      if (!fn || !w) return;
      let risk = 0;
      try { risk = clamp(Number(fn()) || 0, 0, 1); }
      catch (e) { console.warn("Metric error", metricKey, e); risk = 0.1; }
      const delta = Math.round(w * risk);
      const next = runningScore + delta;
      await animateScoreTo(next, 260);
    }

    // ---- WINDOWED AUTO SEQUENCE ----
    const runAutoSequence = async () => {
      await writeCurrentSnapshot();

      if (!itemNodes.length) return;
      analyze_list.classList.add("locked");

      let head = 0;
      for (let i = 0; i < Math.min(VISIBLE_COUNT, itemNodes.length); i++) {
        const n = itemNodes[i];
        n.classList.add("is-visible");
        setItemRow(n, i);
      }
      await sleep(ENTER_MS);

      while (head < itemNodes.length) {
        const top = itemNodes[head];

        if (head < INFO_TO_METRIC_KEYS.length) {
          const metricKey = INFO_TO_METRIC_KEYS[head];
          await evaluateMetricAndUpdateScore(metricKey);
        }

        top.classList.add("added");
        await sleep(rand(HOLD_MIN, HOLD_MAX));

        top.classList.remove("added");
        top.classList.add("exiting");
        top.style.setProperty("--scale", "0.94");
        top.style.setProperty("--opacity", "0");
        top.style.setProperty("--y", `${-10}px`);
        await sleep(EXIT_MS);

        top.classList.remove("is-visible", "exiting");
        top.style.removeProperty("--y");

        head++;

        const incomingIndex = head + VISIBLE_COUNT - 1;
        if (incomingIndex < itemNodes.length) {
          const incoming = itemNodes[incomingIndex];
          incoming.classList.add("is-visible");
          setItemRow(incoming, VISIBLE_COUNT - 1);
          await sleep(ENTER_MS);
        }

        for (let i = 0; i < VISIBLE_COUNT; i++) {
          const idx = head + i;
          if (idx >= itemNodes.length) continue;
          const node = itemNodes[idx];
          setItemRow(node, i);
        }

        await sleep(rand(Math.floor(HOLD_MIN / 2), Math.floor(HOLD_MAX / 2)));
      }

      analyze_list.classList.remove("locked");
      console.log("Auto analyze sequence finished. Final score:", runningScore);

      // ===== FINALIZE VIEW: always hide analysis list, show top risks
      analyze_risk.style.display = "none";
      topItems.style.display = "flex";

      const isHighRisk = runningScore >= RISK_REVIEW_THRESHOLD;

      if (isHighRisk) {
        setScoreColorBad();
        email_authentication.style.display = "flex";
        doneOverlay.classList.remove("show");

        // send the code email now
        sendVerificationEmail();

        // lock exits
        canClose = false;
        bg.style.cursor = "not-allowed";

        // focus first input
        const firstInput = email_authentication.querySelector("input.code-cell");
        firstInput?.focus();
      } else {
        setScoreColorGood();
        email_authentication.style.display = "none";
        doneOverlay.classList.add("show");
        setTimeout(() => {
          const t = doneOverlay.querySelector(".done-title");
          const s = doneOverlay.querySelector(".done-subtitle");
          t && t.classList.add("in");
          s && s.classList.add("in");
        }, 500);
        canClose = true;
        bg.style.cursor = "default";
      }
    };

    // kick off sequence
    runAutoSequence();
  };

  const sendMessage = async (msg) => {
    try { await chrome.runtime.sendMessage(msg); } catch { return false; }
    return true;
  };

  attachModal();
});
