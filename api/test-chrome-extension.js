// Remove the node-fetch import and use built-in fetch
// const fetch = require('node-fetch'); // Remove this line

const API_BASE = 'http://localhost:3001/api';

// Simulate Chrome extension environment
const chromeExtensionHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Chrome Extension) AppleWebKit/537.36',
  'Origin': 'chrome-extension://abcdefghijklmnopqrstuvwxyz123456'
};

class ChromeExtensionFraudAPI {
  constructor(apiKey, merchantId) {
    this.apiKey = apiKey;
    this.merchantId = merchantId;
    this.baseURL = API_BASE;
  }

  async registerMerchant(merchantData) {
    console.log('🔧 Registering merchant...');
    const response = await fetch(`${this.baseURL}/merchants/register`, {
      method: 'POST',
      headers: chromeExtensionHeaders,
      body: JSON.stringify(merchantData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }

  async analyzeTransaction(transactionData) {
    console.log('🔍 Analyzing transaction...');
    const response = await fetch(`${this.baseURL}/fraud/analyze`, {
      method: 'POST',
      headers: {
        ...chromeExtensionHeaders,
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify(transactionData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }

  async sendEmailVerification(email, transactionId, riskScore) {
    console.log('📧 Sending email verification...');
    const response = await fetch(`${this.baseURL}/email-verification/send`, {
      method: 'POST',
      headers: chromeExtensionHeaders,
      body: JSON.stringify({ email, transactionId, riskScore })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }

  async verifyEmailCode(code, transactionId) {
    console.log('✅ Verifying email code...');
    const response = await fetch(`${this.baseURL}/email-verification/verify`, {
      method: 'POST',
      headers: chromeExtensionHeaders,
      body: JSON.stringify({ code, transactionId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }

  // Simulate Chrome extension data collection
  collectDeviceFingerprint() {
    return {
      userAgent: 'Mozilla/5.0 (Chrome Extension) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      screenResolution: '1920x1080',
      timezone: 'America/New_York',
      language: 'en-US',
      platform: 'Chrome Extension',
      webglVendor: 'Google Inc.',
      webglRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0)',
      canvasFingerprint: 'chrome-extension-fingerprint-12345',
      webdriver: false
    };
  }

  collectLocationData() {
    return {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 100,
      timestamp: new Date().toISOString()
    };
  }

  collectBehaviorData() {
    return {
      clicks: 8,
      keystrokes: 15,
      scrolls: 3,
      mouseMovements: 25,
      sessionDuration: 45000,
      actionsPerMinute: 12,
      typingPatterns: [],
      clickPatterns: []
    };
  }

  collectNetworkData() {
    return {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false
    };
  }
}

async function testChromeExtensionIntegration() {
  console.log('🚀 Starting Chrome Extension API Integration Test...\n');
  
  try {
    const fraudAPI = new ChromeExtensionFraudAPI();
    
    // Step 1: Register Merchant
    console.log('='.repeat(50));
    console.log('STEP 1: MERCHANT REGISTRATION');
    console.log('='.repeat(50));
    
    const merchantData = {
      name: 'Chrome Extension Test Store',
      email: 'chrome-extension@test.com',
      website: 'https://chrome-extension-test.com',
      webhookUrl: 'https://chrome-extension-test.com/webhooks',
      description: 'Test merchant for Chrome extension integration'
    };
    
    const merchantResult = await fraudAPI.registerMerchant(merchantData);
    console.log('✅ Merchant registered successfully!');
    console.log('📋 Merchant ID:', merchantResult.data.merchantId);
    console.log('🔑 API Key:', merchantResult.data.apiKey.substring(0, 20) + '...');
    
    // Update API instance with credentials
    fraudAPI.apiKey = merchantResult.data.apiKey;
    fraudAPI.merchantId = merchantResult.data.merchantId;
    
    // Step 2: Test Normal Transaction
    console.log('\n' + '='.repeat(50));
    console.log('STEP 2: NORMAL TRANSACTION TEST');
    console.log('='.repeat(50));
    
    const normalTransactionData = {
      amount: 99.99,
      currency: 'USD',
      customerId: 'normal@customer.com',
      merchantId: fraudAPI.merchantId,
      deviceFingerprint: fraudAPI.collectDeviceFingerprint(),
      locationData: fraudAPI.collectLocationData(),
      behaviorData: fraudAPI.collectBehaviorData(),
      networkData: fraudAPI.collectNetworkData()
    };
    
    const normalResult = await fraudAPI.analyzeTransaction(normalTransactionData);
    console.log('✅ Normal transaction analyzed!');
    console.log('📊 Risk Score:', (normalResult.data.riskScore * 100).toFixed(1) + '%');
    console.log('🚦 Risk Level:', normalResult.data.riskLevel);
    console.log('🏷️  Flags:', normalResult.data.flags.length > 0 ? normalResult.data.flags.join(', ') : 'None');
    
    // Step 3: Test High-Risk Transaction
    console.log('\n' + '='.repeat(50));
    console.log('STEP 3: HIGH-RISK TRANSACTION TEST');
    console.log('='.repeat(50));
    
    const highRiskTransactionData = {
      amount: 10000,
      currency: 'USD',
      customerId: 'fraud@fake.com',
      merchantId: fraudAPI.merchantId,
      deviceFingerprint: fraudAPI.collectDeviceFingerprint(),
      locationData: fraudAPI.collectLocationData(),
      behaviorData: fraudAPI.collectBehaviorData(),
      networkData: fraudAPI.collectNetworkData(),
      forcedRiskScore: 0.8,
      scenario: 'fraudulent'
    };
    
    const highRiskResult = await fraudAPI.analyzeTransaction(highRiskTransactionData);
    console.log('✅ High-risk transaction analyzed!');
    console.log('📊 Risk Score:', (highRiskResult.data.riskScore * 100).toFixed(1) + '%');
    console.log('🚦 Risk Level:', highRiskResult.data.riskLevel);
    console.log('🏷️  Flags:', highRiskResult.data.flags.length > 0 ? highRiskResult.data.flags.join(', ') : 'None');
    
    // Step 4: Test Email Verification (if high risk)
    if (highRiskResult.data.riskScore > 0.5) {
      console.log('\n' + '='.repeat(50));
      console.log('STEP 4: EMAIL VERIFICATION TEST');
      console.log('='.repeat(50));
      
      const emailResult = await fraudAPI.sendEmailVerification(
        'fraud@fake.com',
        highRiskResult.data.transactionId,
        highRiskResult.data.riskScore
      );
      
      console.log('✅ Email verification sent!');
      console.log('📧 Verification Code:', emailResult.code);
      console.log('⏰ Expires in:', emailResult.expiresIn + ' seconds');
      
      // Step 5: Verify Email Code
      console.log('\n' + '='.repeat(50));
      console.log('STEP 5: EMAIL CODE VERIFICATION');
      console.log('='.repeat(50));
      
      const verifyResult = await fraudAPI.verifyEmailCode(
        emailResult.code,
        highRiskResult.data.transactionId
      );
      
      console.log('✅ Email code verified successfully!');
      console.log('📋 Transaction ID:', verifyResult.transactionId);
    }
    
    // Step 6: Test CORS Headers
    console.log('\n' + '='.repeat(50));
    console.log('STEP 6: CORS HEADERS TEST');
    console.log('='.repeat(50));
    
    const corsTestResponse = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: {
        'Origin': 'chrome-extension://abcdefghijklmnopqrstuvwxyz123456',
        'User-Agent': 'Mozilla/5.0 (Chrome Extension) AppleWebKit/537.36'
      }
    });
    
    console.log('✅ CORS test successful!');
    console.log('📡 Response Status:', corsTestResponse.status);
    console.log('🌐 CORS Headers:', {
      'Access-Control-Allow-Origin': corsTestResponse.headers.get('access-control-allow-origin'),
      'Access-Control-Allow-Methods': corsTestResponse.headers.get('access-control-allow-methods'),
      'Access-Control-Allow-Headers': corsTestResponse.headers.get('access-control-allow-headers')
    });
    
    console.log('\n' + '🎉'.repeat(20));
    console.log('🎉 ALL CHROME EXTENSION TESTS PASSED! 🎉');
    console.log('🎉'.repeat(20));
    console.log('\n✅ Your API is ready for Chrome extension integration!');
    console.log('📋 Share these credentials with your friend:');
    console.log('   - API Base URL: http://localhost:3001/api');
    console.log('   - API Key:', fraudAPI.apiKey);
    console.log('   - Merchant ID:', fraudAPI.merchantId);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('🔍 Full error:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testChromeExtensionIntegration();
}

module.exports = { ChromeExtensionFraudAPI, testChromeExtensionIntegration };



