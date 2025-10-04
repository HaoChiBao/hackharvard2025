class LocalStorage {
  constructor() {
    // In-memory storage objects
    this.merchants = new Map();
    this.apiKeys = new Map();
    this.verificationCodes = new Map();
    this.transactions = new Map();
  }

  // Merchant storage
  setMerchant(res, merchantId, merchant) {
    const merchantData = {
      id: merchantId,
      name: merchant.name,
      email: merchant.email,
      website: merchant.website,
      webhookUrl: merchant.webhookUrl,
      description: merchant.description,
      createdAt: merchant.createdAt
    };
    
    this.merchants.set(merchantId, merchantData);
    return merchantData;
  }

  getMerchant(req, merchantId) {
    return this.merchants.get(merchantId) || null;
  }

  // API Key storage
  setApiKey(res, apiKey, merchantId) {
    this.apiKeys.set(apiKey, merchantId);
  }

  getMerchantByApiKey(req, apiKey) {
    const merchantId = this.apiKeys.get(apiKey);
    if (merchantId) {
      return this.getMerchant(req, merchantId);
    }
    return null;
  }

  // Verification code storage
  setVerificationCode(res, transactionId, verificationData) {
    const codeData = {
      code: verificationData.code,
      email: verificationData.email,
      expiresAt: verificationData.expiresAt,
      riskScore: verificationData.riskScore,
      attempts: verificationData.attempts || 0
    };
    
    this.verificationCodes.set(transactionId, codeData);
  }

  getVerificationCode(req, transactionId) {
    const data = this.verificationCodes.get(transactionId);
    
    if (data) {
      // Check if expired
      if (Date.now() > data.expiresAt) {
        this.deleteVerificationCode(req, res, transactionId);
        return null;
      }
      return data;
    }
    return null;
  }

  deleteVerificationCode(req, res, transactionId) {
    this.verificationCodes.delete(transactionId);
  }

  // Transaction analysis storage
  setTransactionAnalysis(res, transactionId, analysis) {
    const analysisData = {
      transactionId: analysis.transactionId,
      timestamp: analysis.timestamp,
      merchantId: analysis.merchantId,
      customerId: analysis.customerId,
      amount: analysis.amount,
      currency: analysis.currency,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      riskFactors: analysis.riskFactors,
      recommendations: analysis.recommendations,
      flags: analysis.flags
    };
    
    this.transactions.set(transactionId, analysisData);
  }

  getTransactionAnalysis(req, transactionId) {
    return this.transactions.get(transactionId) || null;
  }

  // Get all stored data (for debugging and API access)
  getAllData(req) {
    const data = {
      merchants: {},
      apiKeys: {},
      verificationCodes: {},
      transactions: {}
    };

    // Convert Maps to objects for JSON serialization
    for (const [merchantId, merchant] of this.merchants) {
      data.merchants[merchantId] = merchant;
    }

    for (const [apiKey, merchantId] of this.apiKeys) {
      data.apiKeys[apiKey] = merchantId;
    }

    for (const [transactionId, verification] of this.verificationCodes) {
      data.verificationCodes[transactionId] = verification;
    }

    for (const [transactionId, transaction] of this.transactions) {
      data.transactions[transactionId] = transaction;
    }

    return data;
  }

  // Clear all data (for debugging)
  clearAllData(res) {
    this.merchants.clear();
    this.apiKeys.clear();
    this.verificationCodes.clear();
    this.transactions.clear();
  }

  // Get merchants by email (for login functionality)
  getMerchantByEmail(email) {
    for (const merchant of this.merchants.values()) {
      if (merchant.email === email) {
        return merchant;
      }
    }
    return null;
  }
}

module.exports = new LocalStorage();
