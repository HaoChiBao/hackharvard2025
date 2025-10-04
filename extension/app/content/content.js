/* content.js */
console.log('Fraud Tracker: content.js loaded on', window.location.href);
console.log('Fraud Tracker: Chrome runtime available:', !!chrome.runtime);
console.log('Fraud Tracker: Document ready state:', document.readyState);

const API_BASE_URL = 'http://localhost:3001';

// Global behavior tracking data
let behaviorData = {
  clicks: 0,
  keystrokes: 0,
  mouseMovements: 0,
  scrolls: 0,
  sessionStart: Date.now(),
  typingPatterns: [],
  clickPatterns: []
};

/* ===================== HELPERS ===================== */
const sendMessage = async (msg) => {
  try { await chrome.runtime.sendMessage(msg); } catch { return false; }
  return true;
};

/* ===================== BEHAVIOR TRACKING ===================== */
function startBehaviorTracking() {
  console.log('Fraud Tracker: startBehaviorTracking() called');
  console.log('Fraud Tracker: Document object available:', !!document);
  console.log('Fraud Tracker: Adding event listeners...');
  
  // Track clicks
  document.addEventListener('click', (event) => {
    behaviorData.clicks++;
    console.log('Click detected! Total clicks:', behaviorData.clicks);
    behaviorData.clickPatterns.push({
      timestamp: Date.now(),
      x: event.clientX,
      y: event.clientY
    });
    
    // Keep only last 100 click patterns
    if (behaviorData.clickPatterns.length > 100) {
      behaviorData.clickPatterns = behaviorData.clickPatterns.slice(-100);
    }
    
    // Send updated data to background script
    chrome.runtime.sendMessage({
      action: 'updateBehaviorData',
      data: behaviorData
    }).catch(err => console.log('Failed to send click data to background:', err));
  });

  // Track keystrokes
  document.addEventListener('keydown', (event) => {
    behaviorData.keystrokes++;
    console.log('Keystroke detected! Total keystrokes:', behaviorData.keystrokes);
    behaviorData.typingPatterns.push({
      timestamp: Date.now(),
      key: event.key,
      timeSinceLastKey: behaviorData.typingPatterns.length > 0 ? 
        Date.now() - behaviorData.typingPatterns[behaviorData.typingPatterns.length - 1].timestamp : 0
    });
    
    // Keep only last 100 typing patterns
    if (behaviorData.typingPatterns.length > 100) {
      behaviorData.typingPatterns = behaviorData.typingPatterns.slice(-100);
    }
    
    // Send updated data to background script
    chrome.runtime.sendMessage({
      action: 'updateBehaviorData',
      data: behaviorData
    }).catch(err => console.log('Failed to send keystroke data to background:', err));
  });

  // Track mouse movements
  document.addEventListener('mousemove', () => {
    behaviorData.mouseMovements++;
    console.log('Mouse movement detected! Total movements:', behaviorData.mouseMovements);
    // Send updated data to background script (throttled)
    if (behaviorData.mouseMovements % 10 === 0) {
      chrome.runtime.sendMessage({
        action: 'updateBehaviorData',
        data: behaviorData
      }).catch(err => console.log('Failed to send mouse data to background:', err));
    }
  });

  // Track scrolls
  document.addEventListener('scroll', () => {
    behaviorData.scrolls++;
    console.log('Scroll detected! Total scrolls:', behaviorData.scrolls);
    // Send updated data to background script
    chrome.runtime.sendMessage({
      action: 'updateBehaviorData',
      data: behaviorData
    }).catch(err => console.log('Failed to send scroll data to background:', err));
  });

  console.log('Fraud Tracker: Behavior tracking started successfully');
  console.log('Fraud Tracker: Event listeners added for clicks, keystrokes, mousemove, scroll');
  console.log('Fraud Tracker: Current behavior data:', behaviorData);
}

function analyzeTypingPattern() {
  if (behaviorData.typingPatterns.length < 2) return 'Insufficient data';
  
  const patterns = behaviorData.typingPatterns;
  const intervals = patterns.slice(1).map((p, i) => p.timeSinceLastKey);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  if (avgInterval < 100) return 'Suspicious (too fast)';
  if (avgInterval > 2000) return 'Suspicious (too slow)';
  if (intervals.some(i => i === 0)) return 'Suspicious (simultaneous)';
  return 'Normal';
}

function analyzeMouseActivity() {
  const sessionDuration = (Date.now() - behaviorData.sessionStart) / 1000;
  const movementsPerSecond = behaviorData.mouseMovements / sessionDuration;
  
  if (movementsPerSecond < 0.1) return 'Suspicious (too low)';
  if (movementsPerSecond > 10) return 'Suspicious (too high)';
  return 'Normal';
}

function analyzePageInteraction() {
  const sessionDuration = (Date.now() - behaviorData.sessionStart) / 1000;
  const clicksPerSecond = behaviorData.clicks / sessionDuration;
  
  if (clicksPerSecond < 0.01) return 'Suspicious (too low)';
  if (clicksPerSecond > 2) return 'Suspicious (too high)';
  return 'Normal';
}

// Send behavior data to popup when requested
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'getBehaviorData') {
    const sessionDuration = Math.floor((Date.now() - behaviorData.sessionStart) / 1000);
    
    const response = {
      clicks: behaviorData.clicks,
      keystrokes: behaviorData.keystrokes,
      mouseMovements: behaviorData.mouseMovements,
      scrolls: behaviorData.scrolls,
      sessionDuration: sessionDuration,
      typingPattern: analyzeTypingPattern(),
      mouseActivity: analyzeMouseActivity(),
      pageInteraction: analyzePageInteraction()
    };
    
    console.log('Content script sending response:', response);
    sendResponse(response);
    return true; // Keep the message channel open for async response
  }
});

/* ===================== FRAUD DATA FETCHING ===================== */
async function fetchAllFraudData(apiKey) {
  const url = `${API_BASE_URL}/api/fraud/analyses`;
  const headers = { 
    'X-API-Key': apiKey, 
    'Content-Type': 'application/json' 
  };
  
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || 'request failed'}`);
  }
  return res.json();
}

async function fetchMerchantData(apiKey) {
  const url = `${API_BASE_URL}/api/merchants/data`;
  const headers = { 
    'X-API-Key': apiKey, 
    'Content-Type': 'application/json' 
  };
  
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || 'request failed'}`);
  }
  return res.json();
}

/* ===================== RENDER FRAUD DATA OVERLAY ===================== */
function renderFraudOverlay(apiKey, fraudData) {
  // Remove previous output if any
  const existing = document.getElementById('fraud-analysis-output');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'fraud-analysis-output';
  wrap.style.position = 'fixed';
  wrap.style.top = '10px';
  wrap.style.right = '10px';
  wrap.style.maxWidth = '400px';
  wrap.style.maxHeight = '70vh';
  wrap.style.overflow = 'auto';
  wrap.style.zIndex = '2147483647';
  wrap.style.backgroundColor = '#ffffff';
  wrap.style.border = '2px solid #007bff';
  wrap.style.borderRadius = '8px';
  wrap.style.padding = '15px';
  wrap.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  wrap.style.fontFamily = 'Arial, sans-serif';
  wrap.style.fontSize = '12px';

  if (!fraudData || !fraudData.transactions) {
    wrap.innerHTML = '<div style="color: #dc3545;">No fraud data available</div>';
    document.body.appendChild(wrap);
    return;
  }

  const transactions = Object.values(fraudData.transactions);
  const total = transactions.length;
  const highRisk = transactions.filter(t => t.riskLevel === 'HIGH' || t.riskLevel === 'CRITICAL').length;
  const mediumRisk = transactions.filter(t => t.riskLevel === 'MEDIUM').length;
  const lowRisk = transactions.filter(t => t.riskLevel === 'LOW').length;

  let html = `
    <div style="margin-bottom: 15px;">
      <h3 style="margin: 0 0 10px 0; color: #2c3e50;">🛡️ Fraud Tracker</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
        <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 4px;">
          <div style="font-size: 18px; font-weight: bold; color: #2c3e50;">${total}</div>
          <div style="font-size: 10px; color: #6c757d;">Total</div>
        </div>
        <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 4px;">
          <div style="font-size: 18px; font-weight: bold; color: #dc3545;">${highRisk}</div>
          <div style="font-size: 10px; color: #6c757d;">High Risk</div>
        </div>
        <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 4px;">
          <div style="font-size: 18px; font-weight: bold; color: #fd7e14;">${mediumRisk}</div>
          <div style="font-size: 10px; color: #6c757d;">Medium</div>
        </div>
        <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 4px;">
          <div style="font-size: 18px; font-weight: bold; color: #28a745;">${lowRisk}</div>
          <div style="font-size: 10px; color: #6c757d;">Low Risk</div>
        </div>
      </div>
    </div>
  `;

  if (transactions.length > 0) {
    // Show latest 3 transactions
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 3);

    html += '<div style="max-height: 200px; overflow-y: auto;">';
    recentTransactions.forEach(transaction => {
      const riskClass = transaction.riskLevel.toLowerCase();
      const riskScore = (transaction.riskScore * 100).toFixed(1);
      const riskColor = riskClass === 'high' || riskClass === 'critical' ? '#dc3545' : 
                       riskClass === 'medium' ? '#fd7e14' : '#28a745';
      
      html += `
        <div style="border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; margin-bottom: 8px; background: #f8f9fa;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: bold; color: #2c3e50;">${transaction.transactionId.slice(0, 12)}...</span>
            <span style="padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; background: ${riskColor}; color: white;">${transaction.riskLevel}</span>
          </div>
          <div style="color: #6c757d; font-size: 10px;">
            <div>$${transaction.amount} ${transaction.currency} • ${riskScore}% risk</div>
            <div>${new Date(transaction.timestamp).toLocaleString()}</div>
            ${transaction.flags && transaction.flags.length > 0 ? 
              `<div style="color: #dc3545;">⚠️ ${transaction.flags.slice(0, 2).join(', ')}</div>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}

/* ===================== MAIN ===================== */
// Start behavior tracking immediately when script loads
console.log('Fraud Tracker: MAIN - Starting behavior tracking...');
console.log('Fraud Tracker: MAIN - Document ready state:', document.readyState);
console.log('Fraud Tracker: MAIN - Window loaded:', document.readyState === 'complete');

try {
  startBehaviorTracking();
  console.log('Fraud Tracker: MAIN - startBehaviorTracking() completed successfully');
} catch (error) {
  console.error('Fraud Tracker: MAIN - Error starting behavior tracking:', error);
}

// Also start on window load as backup
window.addEventListener('load', () => {
  console.log('Window loaded, ensuring behavior tracking is active');
  startBehaviorTracking();
});

// Handle messages from popup/background
chrome.runtime?.onMessage?.addListener(function(request){
  console.log('Content script received message:', request);
  if (request?.action === 'refresh') {
    setTimeout(()=>{ sendMessage('refresh'); console.log('refreshed content.js'); }, 18000);
  }
});

// Send refresh message
sendMessage({ action: 'refresh' });

// Load fraud data if API key is available
(async () => {
  try {
    // Get API key from Chrome storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['fraudTrackerApiKey'], resolve);
    });

    const apiKey = result.fraudTrackerApiKey;
    if (!apiKey) {
      console.log('No API key found in storage');
      return;
    }

    // Fetch fraud data
    const fraudData = await fetchAllFraudData(apiKey);
    renderFraudOverlay(apiKey, fraudData.data);

  } catch (e) {
    console.error('Failed to load fraud data:', e);
  }
})();
