const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { merchants, apiKeys } = require('../storage');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  website: Joi.string().uri().required(),
  webhookUrl: Joi.string().uri().optional(),
  description: Joi.string().max(500).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});

// POST /api/merchants/register
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { name, email, website, webhookUrl, description } = value;

    // Check if merchant already exists
    if (merchants.has(email)) {
      return res.status(409).json({
        error: 'Merchant already exists'
      });
    }

    // Generate API key
    const apiKey = generateApiKey();
    const merchantId = generateMerchantId();

    // Create merchant
    const merchant = {
      id: merchantId,
      name,
      email,
      website,
      webhookUrl,
      description,
      apiKey,
      createdAt: new Date().toISOString(),
      isActive: true
    };

    merchants.set(email, merchant);
    apiKeys.set(apiKey, merchant);

    res.status(201).json({
      success: true,
      data: {
        merchantId: merchant.id,
        apiKey: merchant.apiKey,
        name: merchant.name,
        email: merchant.email,
        website: merchant.website
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed'
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

    // In production, verify password with database
    const merchant = merchants.get(email);
    if (!merchant) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          website: merchant.website
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed'
    });
  }
});

// GET /api/merchants/profile
router.get('/profile', authenticateMerchant, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.merchant.id,
      name: req.merchant.name,
      email: req.merchant.email,
      website: req.merchant.website,
      webhookUrl: req.merchant.webhookUrl,
      description: req.merchant.description,
      createdAt: req.merchant.createdAt,
      isActive: req.merchant.isActive
    }
  });
});

// Helper functions
function generateApiKey() {
  return 'sk_' + require('crypto').randomBytes(32).toString('hex');
}

function generateMerchantId() {
  return 'merchant_' + require('crypto').randomBytes(16).toString('hex');
}

// Middleware for API key authentication
function authenticateMerchant(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required'
    });
  }

  const merchant = apiKeys.get(apiKey);
  if (!merchant) {
    return res.status(401).json({
      error: 'Invalid API key'
    });
  }

  req.merchant = merchant;
  next();
}

module.exports = router;



