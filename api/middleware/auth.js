const jwt = require('jsonwebtoken');
const { merchants, apiKeys } = require('../storage');
const cookieStorage = require('../storage/cookieStorage');

const authenticateMerchant = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
    }

    console.log('Authenticating API key:', apiKey.substring(0, 20) + '...');
    
    const merchant = cookieStorage.getMerchantByApiKey(req, apiKey);
    
    if (!merchant) {
      console.log('Authentication failed: Merchant not found for API key');
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    console.log('Authentication successful for merchant:', merchant.name);
    req.merchant = merchant;
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

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

module.exports = { authenticateMerchant };



