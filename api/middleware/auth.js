const jwt = require('jsonwebtoken');
const { merchants, apiKeys } = require('../storage');

function authenticateMerchant(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  console.log('Auth attempt - API Key:', apiKey);
  console.log('Available API keys:', Array.from(apiKeys.keys()));

  // Try API key first
  if (apiKey) {
    const merchant = getMerchantByApiKey(apiKey);
    console.log('Merchant found by API key:', merchant ? 'YES' : 'NO');
    if (merchant) {
      req.merchant = merchant;
      return next();
    }
  }

  // Try JWT token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const merchant = getMerchantById(decoded.merchantId);
      
      if (merchant) {
        req.merchant = merchant;
        return next();
      }
    } catch (error) {
      console.log('JWT verification failed:', error.message);
    }
  }

  console.log('Authentication failed - no valid credentials found');
  return res.status(401).json({
    error: 'Authentication required',
    message: 'Please provide a valid API key or JWT token'
  });
}

function getMerchantByApiKey(apiKey) {
  const merchant = apiKeys.get(apiKey);
  console.log('Looking up API key:', apiKey, 'Found:', !!merchant);
  return merchant || null;
}

function getMerchantById(merchantId) {
  // Find merchant by ID in the merchants map
  for (let merchant of merchants.values()) {
    if (merchant.id === merchantId) {
      return merchant;
    }
  }
  return null;
}

module.exports = {
  authenticateMerchant
};



