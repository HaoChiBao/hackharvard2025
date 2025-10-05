// Test script to demonstrate location-based fraud detection
const API_BASE = 'http://localhost:3001/api';

async function testLocationBasedFraudDetection() {
  console.log('🌍 Testing Location-Based Fraud Detection...\n');
  
  const apiKey = 'sk_c1ec10a178b985dbc90b995ca1420c9ab933d508ef231e7600017bf466490388';
  
  // Test 1: Normal US transaction
  console.log('📍 Test 1: Normal US Transaction');
  console.log('='.repeat(50));
  
  const normalTransaction = {
    amount: 99.99,
    currency: 'USD',
    customerId: 'customer@email.com',
    merchantId: 'merchant_123',
    deviceFingerprint: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      screenResolution: '1920x1080',
      timezone: 'America/New_York',
      language: 'en-US',
      platform: 'Web'
    },
    behaviorData: {
      clicks: 5,
      keystrokes: 12,
      scrolls: 2,
      mouseMovements: 15,
      sessionDuration: 30000
    },
    locationData: {
      latitude: 40.7128,  // New York
      longitude: -74.0060,
      accuracy: 100,
      timestamp: new Date().toISOString()
    }
  };
  
  try {
    const response1 = await fetch(`${API_BASE}/fraud/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(normalTransaction)
    });
    
    const result1 = await response1.json();
    console.log('✅ Normal transaction analyzed!');
    console.log('📊 Risk Score:', Math.round(result1.data.riskScore * 100) + '%');
    console.log('🚦 Risk Level:', result1.data.riskLevel);
    console.log('🌍 Location:', result1.data.riskFactors?.location?.details?.city + ', ' + result1.data.riskFactors?.location?.details?.country);
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 2: High-risk international transaction
  console.log('📍 Test 2: High-Risk International Transaction');
  console.log('='.repeat(50));
  
  const suspiciousTransaction = {
    amount: 5000,
    currency: 'USD',
    customerId: 'suspicious@email.com',
    merchantId: 'merchant_123',
    deviceFingerprint: {
      userAgent: 'HeadlessChrome/91.0.4472.124',
      screenResolution: '800x600',
      timezone: 'UTC',
      language: 'en',
      platform: 'Bot',
      webdriver: true
    },
    behaviorData: {
      clicks: 0,
      keystrokes: 0,
      scrolls: 0,
      mouseMovements: 0,
      sessionDuration: 1000
    },
    locationData: {
      latitude: 55.7558,  // Moscow, Russia (high-risk country)
      longitude: 37.6176,
      accuracy: 50,
      timestamp: new Date().toISOString()
    }
  };
  
  try {
    const response2 = await fetch(`${API_BASE}/fraud/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(suspiciousTransaction)
    });
    
    const result2 = await response2.json();
    console.log('✅ Suspicious transaction analyzed!');
    console.log('📊 Risk Score:', Math.round(result2.data.riskScore * 100) + '%');
    console.log('🚦 Risk Level:', result2.data.riskLevel);
    console.log('🌍 Location:', result2.data.riskFactors?.location?.details?.city + ', ' + result2.data.riskFactors?.location?.details?.country);
    console.log('🏷️  Flags:', result2.data.flags.join(', ') || 'None');
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 3: European transaction
  console.log('📍 Test 3: European Transaction');
  console.log('='.repeat(50));
  
  const europeanTransaction = {
    amount: 150.00,
    currency: 'EUR',
    customerId: 'european@email.com',
    merchantId: 'merchant_123',
    deviceFingerprint: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      screenResolution: '1440x900',
      timezone: 'Europe/London',
      language: 'en-GB',
      platform: 'Web'
    },
    behaviorData: {
      clicks: 8,
      keystrokes: 20,
      scrolls: 3,
      mouseMovements: 25,
      sessionDuration: 45000
    },
    locationData: {
      latitude: 51.5074,  // London, UK
      longitude: -0.1278,
      accuracy: 75,
      timestamp: new Date().toISOString()
    }
  };
  
  try {
    const response3 = await fetch(`${API_BASE}/fraud/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(europeanTransaction)
    });
    
    const result3 = await response3.json();
    console.log('✅ European transaction analyzed!');
    console.log('📊 Risk Score:', Math.round(result3.data.riskScore * 100) + '%');
    console.log('🚦 Risk Level:', result3.data.riskLevel);
    console.log('🌍 Location:', result3.data.riskFactors?.location?.details?.city + ', ' + result3.data.riskFactors?.location?.details?.country);
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('🎉 Location-based fraud detection test completed!');
  console.log('📊 Check the dashboard at: http://localhost:3001/demo/dashboard.html');
}

// Run the test
if (require.main === module) {
  testLocationBasedFraudDetection();
}

module.exports = { testLocationBasedFraudDetection };
