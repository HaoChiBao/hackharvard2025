const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const cookieStorage = require('../storage/cookieStorage');

const router = express.Router();

// Validation schemas
const registrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  website: Joi.string().uri().required(),
  webhookUrl: Joi.string().uri().required(),
  description: Joi.string().max(500).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

// POST /api/merchants/register
router.post('/register', async (req, res) => {
  try {
    // Validate request
    const { error, value } = registrationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { name, email, website, webhookUrl, description } = value;

    // Check if merchant already exists
    const existingMerchant = Object.values(req.cookies)
      .find(cookie => {
        try {
          const data = JSON.parse(cookie);
          return data.email === email;
        } catch {
          return false;
        }
      });

    if (existingMerchant) {
      return res.status(409).json({
        error: 'Merchant already exists',
        message: 'A merchant with this email already exists'
      });
    }

    // Generate merchant ID and API key
    const merchantId = `merchant_${crypto.randomBytes(16).toString('hex')}`;
    const apiKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

    const merchant = {
      merchantId,
      name,
      email,
      website,
      webhookUrl,
      description: description || '',
      createdAt: new Date().toISOString()
    };

    // Store in cookies
    cookieStorage.setMerchant(res, merchantId, merchant);
    cookieStorage.setApiKey(res, apiKey, merchantId);

    res.json({
      success: true,
      data: {
        merchantId,
        apiKey,
        name,
        email,
        website
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// POST /api/merchants/login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { email, password } = value;

    // Find merchant by email
    const merchant = Object.values(req.cookies)
      .find(cookie => {
        try {
          const data = JSON.parse(cookie);
          return data.email === email;
        } catch {
          return false;
        }
      });

    if (!merchant) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // In a real app, you'd verify the password hash
    // For demo, we'll just check if password is at least 6 characters
    if (password.length < 6) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // Generate new API key
    const apiKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    cookieStorage.setApiKey(res, apiKey, merchant.id);

    res.json({
      success: true,
      data: {
        merchantId: merchant.id,
        apiKey,
        name: merchant.name,
        email: merchant.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// GET /api/merchants/profile
router.get('/profile', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide an API key'
      });
    }

    const merchant = cookieStorage.getMerchantByApiKey(req, apiKey);
    if (!merchant) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    res.json({
      success: true,
      data: merchant
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: 'An error occurred while retrieving profile'
    });
  }
});

// GET /api/merchants/data (for debugging)
router.get('/data', async (req, res) => {
  try {
    const data = cookieStorage.getAllData(req);
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Data retrieval error:', error);
    res.status(500).json({
      error: 'Data retrieval failed',
      message: 'An error occurred while retrieving data'
    });
  }
});

// POST /api/merchants/clear (for debugging)
router.post('/clear', async (req, res) => {
  try {
    cookieStorage.clearAllData(res);
    res.json({
      success: true,
      message: 'All data cleared'
    });
  } catch (error) {
    console.error('Clear data error:', error);
    res.status(500).json({
      error: 'Clear data failed',
      message: 'An error occurred while clearing data'
    });
  }
});

module.exports = router;



