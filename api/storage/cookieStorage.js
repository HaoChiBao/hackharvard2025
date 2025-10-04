class CookieStorage {
  constructor() {
    this.cookieOptions = {
      httpOnly: false, // Allow client-side access for demo
      secure: false,   // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
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
    
    res.cookie(`merchant_${merchantId}`, JSON.stringify(merchantData), this.cookieOptions);
    return merchantData;
  }

  getMerchant(req, merchantId) {
    const cookieName = `merchant_${merchantId}`;
    const merchantCookie = req.cookies[cookieName];
    
    if (merchantCookie) {
      try {
        return JSON.parse(merchantCookie);
      } catch (error) {
        console.error('Error parsing merchant cookie:', error);
        return null;
      }
    }
    return null;
  }

  // API Key storage
  setApiKey(res, apiKey, merchantId) {
    res.cookie(`api_key_${apiKey}`, merchantId, this.cookieOptions);
    res.cookie('current_api_key', apiKey, this.cookieOptions);
    res.cookie('current_merchant_id', merchantId, this.cookieOptions);
  }

  getMerchantByApiKey(req, apiKey) {
    const merchantId = req.cookies[`api_key_${apiKey}`];
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
    
    res.cookie(`verification_${transactionId}`, JSON.stringify(codeData), {
      ...this.cookieOptions,
      maxAge: 10 * 60 * 1000 // 10 minutes for verification codes
    });
  }

  getVerificationCode(req, transactionId) {
    const cookieName = `verification_${transactionId}`;
    const codeCookie = req.cookies[cookieName];
    
    if (codeCookie) {
      try {
        const data = JSON.parse(codeCookie);
        // Check if expired
        if (Date.now() > data.expiresAt) {
          this.deleteVerificationCode(req, res, transactionId);
          return null;
        }
        return data;
      } catch (error) {
        console.error('Error parsing verification code cookie:', error);
        return null;
      }
    }
    return null;
  }

  deleteVerificationCode(req, res, transactionId) {
    res.clearCookie(`verification_${transactionId}`);
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
    
    res.cookie(`transaction_${transactionId}`, JSON.stringify(analysisData), this.cookieOptions);
  }

  getTransactionAnalysis(req, transactionId) {
    const cookieName = `transaction_${transactionId}`;
    const analysisCookie = req.cookies[cookieName];
    
    if (analysisCookie) {
      try {
        return JSON.parse(analysisCookie);
      } catch (error) {
        console.error('Error parsing transaction analysis cookie:', error);
        return null;
      }
    }
    return null;
  }

  // Get all stored data (for debugging)
  getAllData(req) {
    const data = {
      merchants: {},
      apiKeys: {},
      verificationCodes: {},
      transactions: {}
    };

    // Extract all cookies
    Object.keys(req.cookies).forEach(cookieName => {
      if (cookieName.startsWith('merchant_')) {
        const merchantId = cookieName.replace('merchant_', '');
        data.merchants[merchantId] = this.getMerchant(req, merchantId);
      } else if (cookieName.startsWith('api_key_')) {
        const apiKey = cookieName.replace('api_key_', '');
        data.apiKeys[apiKey] = req.cookies[cookieName];
      } else if (cookieName.startsWith('verification_')) {
        const transactionId = cookieName.replace('verification_', '');
        data.verificationCodes[transactionId] = this.getVerificationCode(req, transactionId);
      } else if (cookieName.startsWith('transaction_')) {
        const transactionId = cookieName.replace('transaction_', '');
        data.transactions[transactionId] = this.getTransactionAnalysis(req, transactionId);
      }
    });

    return data;
  }
}

module.exports = new CookieStorage();
