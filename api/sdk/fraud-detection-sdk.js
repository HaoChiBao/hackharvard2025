/**
 * Visa Fraud Detection SDK
 * Easy integration for vendor platforms
 * 
 * Usage:
 * const fraudSDK = new FraudDetectionSDK('your-api-key');
 * const result = await fraudSDK.analyzeTransaction(transactionData);
 */

class FraudDetectionSDK {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://api.visafraud.com';
    this.timeout = options.timeout || 10000;
    this.retries = options.retries || 3;
  }

  async analyzeTransaction(transactionData) {
    try {
      const response = await this.makeRequest('POST', '/api/fraud/analyze', transactionData);
      return response.data;
    } catch (error) {
      throw new Error(`Fraud analysis failed: ${error.message}`);
    }
  }

  async getRiskScore(transactionId) {
    try {
      const response = await this.makeRequest('GET', `/api/fraud/score/${transactionId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get risk score: ${error.message}`);
    }
  }

  async batchAnalyze(transactions) {
    try {
      const response = await this.makeRequest('POST', '/api/fraud/batch-analyze', { transactions });
      return response.data;
    } catch (error) {
      throw new Error(`Batch analysis failed: ${error.message}`);
    }
  }

  async makeRequest(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'VisaFraudSDK/1.0.0'
      },
      timeout: this.timeout
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    let lastError;
    for (let i = 0; i < this.retries; i++) {
      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        if (i < this.retries - 1) {
          await this.delay(1000 * Math.pow(2, i)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method to collect browser data
  static collectBrowserData() {
    return {
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      webglVendor: getWebGLVendor(),
      webglRenderer: getWebGLRenderer(),
      canvasFingerprint: getCanvasFingerprint(),
      webdriver: !!navigator.webdriver
    };
  }

  // Helper method to collect location data
  static async collectLocationData() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString()
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  // Helper method to collect behavior data
  static collectBehaviorData() {
    // This would be called after user interaction
    return {
      clicks: window.fraudDetectionClicks || 0,
      keystrokes: window.fraudDetectionKeystrokes || 0,
      scrolls: window.fraudDetectionScrolls || 0,
      mouseMovements: window.fraudDetectionMouseMovements || 0,
      sessionDuration: Date.now() - (window.fraudDetectionStartTime || Date.now()),
      actionsPerMinute: calculateActionsPerMinute()
    };
  }
}

// Helper functions
function getWebGLVendor() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'unknown';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
  } catch (e) {
    return 'unknown';
  }
}

function getWebGLRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'unknown';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  } catch (e) {
    return 'unknown';
  }
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Canvas fingerprint', 2, 2);
    return canvas.toDataURL();
  } catch (e) {
    return 'unknown';
  }
}

function calculateActionsPerMinute() {
  const sessionDuration = Date.now() - (window.fraudDetectionStartTime || Date.now());
  const totalActions = (window.fraudDetectionClicks || 0) + (window.fraudDetectionKeystrokes || 0);
  return totalActions / (sessionDuration / 60000);
}

// Browser integration script
if (typeof window !== 'undefined') {
  window.FraudDetectionSDK = FraudDetectionSDK;
  
  // Auto-initialize behavior tracking
  window.fraudDetectionStartTime = Date.now();
  window.fraudDetectionClicks = 0;
  window.fraudDetectionKeystrokes = 0;
  window.fraudDetectionScrolls = 0;
  window.fraudDetectionMouseMovements = 0;

  document.addEventListener('click', () => window.fraudDetectionClicks++);
  document.addEventListener('keydown', () => window.fraudDetectionKeystrokes++);
  window.addEventListener('scroll', () => window.fraudDetectionScrolls++);
  document.addEventListener('mousemove', () => window.fraudDetectionMouseMovements++);
}

// Node.js/CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FraudDetectionSDK;
}

// AMD export
if (typeof define === 'function' && define.amd) {
  define([], () => FraudDetectionSDK);
}
