// B2B Fraud Detection API Test
const API_BASE = 'http://localhost:3001/api';

class FraudDetectionAPI {
  constructor(apiKey, merchantId) {
    this.apiKey = apiKey;
    this.merchantId = merchantId;
    this.baseURL = API_BASE;
  }

  async registerMerchant(merchantData) {
    console.log('🏪 Registering merchant...');
    const response = await fetch(`${this.baseURL}/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify(transactionData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }

  async getTransactionHistory() {
    console.log('📊 Getting transaction history...');
    const response = await fetch(`${this.baseURL}/fraud/analyses`, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  }
}

async function testB2BIntegration() {
  console.log('🚀 Starting B2B Fraud Detection API Test...\n');
  
  try {
    const fraudAPI = new FraudDetectionAPI();
    
    // Step 1: Register Merchant
    console.log('='.repeat(50));
    console.log('STEP 1: MERCHANT REGISTRATION');
    console.log('='.repeat(50));
    
    const merchantData = {
      name: 'E-commerce Store',
      email: 'merchant@store.com',
      website: 'https://store.com',
      webhookUrl: 'https://store.com/webhooks',
      description: 'Online retail store'
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
      customerId: 'customer@email.com',
      merchantId: fraudAPI.merchantId,
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
      }
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
      customerId: 'suspicious@email.com',
      merchantId: fraudAPI.merchantId,
      deviceFingerprint: {
        userAgent: 'Suspicious Bot',
        screenResolution: '800x600',
        timezone: 'UTC',
        language: 'en',
        platform: 'Bot'
      },
      behaviorData: {
        clicks: 1,
        keystrokes: 0,
        scrolls: 0,
        mouseMovements: 0,
        sessionDuration: 1000
      }
    };
    
    const highRiskResult = await fraudAPI.analyzeTransaction(highRiskTransactionData);
    console.log('✅ High-risk transaction analyzed!');
    console.log('📊 Risk Score:', (highRiskResult.data.riskScore * 100).toFixed(1) + '%');
    console.log('🚦 Risk Level:', highRiskResult.data.riskLevel);
    console.log('🏷️  Flags:', highRiskResult.data.flags.length > 0 ? highRiskResult.data.flags.join(', ') : 'None');
    
    // Step 4: Get Transaction History
    console.log('\n' + '='.repeat(50));
    console.log('STEP 4: TRANSACTION HISTORY');
    console.log('='.repeat(50));
    
    const historyResult = await fraudAPI.getTransactionHistory();
    console.log('✅ Transaction history retrieved!');
    console.log('📊 Total transactions:', historyResult.data.length);
    
    console.log('\n' + '🎉'.repeat(20));
    console.log('🎉 ALL B2B API TESTS PASSED! 🎉');
    console.log('🎉'.repeat(20));
    console.log('\n✅ Your API is ready for merchant integration!');
    console.log('📋 Share these credentials with merchants:');
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
  testB2BIntegration();
}

module.exports = { FraudDetectionAPI, testB2BIntegration };
