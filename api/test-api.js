const axios = require('axios');

const BASE_URL = 'http://localhost:3001'; // Changed from 3000 to 3001

async function testAPI() {
  console.log('🧪 Testing Visa Fraud Detection API...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);

    // Test 2: Register a merchant
    console.log('\n2. Registering test merchant...');
    const merchantData = {
      name: 'Test Store',
      email: 'test@example.com',
      website: 'https://teststore.com',
      webhookUrl: 'https://teststore.com/webhooks',
      description: 'Test merchant for API testing'
    };

    const registerResponse = await axios.post(`${BASE_URL}/api/merchants/register`, merchantData);
    console.log('✅ Merchant registered:', registerResponse.data);
    const apiKey = registerResponse.data.data.apiKey;

    // Test 3: Analyze a transaction
    console.log('\n3. Testing fraud analysis...');
    const transactionData = {
      amount: 99.99,
      currency: 'USD',
      customerId: 'cust_123',
      merchantId: registerResponse.data.data.merchantId,
      deviceFingerprint: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        screenResolution: '1920x1080',
        timezone: 'America/New_York',
        language: 'en-US',
        platform: 'MacIntel',
        webglVendor: 'Intel Inc.',
        webglRenderer: 'Intel Iris OpenGL Engine',
        canvasFingerprint: 'data:image/png;base64,test',
        webdriver: false
      },
      locationData: {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 100,
        timestamp: new Date().toISOString()
      },
      behaviorData: {
        clicks: 15,
        keystrokes: 50,
        scrolls: 8,
        mouseMovements: 200,
        sessionDuration: 300000, // 5 minutes
        actionsPerMinute: 20
      },
      networkData: {
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
        saveData: false
      }
    };

    const fraudResponse = await axios.post(`${BASE_URL}/api/fraud/analyze`, transactionData, {
      headers: { 'X-API-Key': apiKey }
    });
    console.log('✅ Fraud analysis completed:', fraudResponse.data);

    // Test 4: Test high-risk transaction
    console.log('\n4. Testing high-risk transaction...');
    const highRiskTransaction = {
      ...transactionData,
      amount: 10000, // Very high amount
      deviceFingerprint: {
        ...transactionData.deviceFingerprint,
        userAgent: 'HeadlessChrome/91.0.4472.124', // Headless browser
        webdriver: true
      },
      behaviorData: {
        clicks: 0, // No clicks - automated
        keystrokes: 0,
        scrolls: 0,
        mouseMovements: 0,
        sessionDuration: 5000, // Very short session
        actionsPerMinute: 0
      }
    };

    const highRiskResponse = await axios.post(`${BASE_URL}/api/fraud/analyze`, highRiskTransaction, {
      headers: { 'X-API-Key': apiKey }
    });
    console.log('✅ High-risk analysis completed:', highRiskResponse.data);

    console.log('\n🎉 All tests passed! API is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests
testAPI();