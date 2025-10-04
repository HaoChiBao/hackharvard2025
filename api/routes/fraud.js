const express = require('express');
const Joi = require('joi');
const FraudDetector = require('../services/fraudDetector');
const { authenticateMerchant } = require('../middleware/auth');
const localStorage = require('../storage/localStorage');

const router = express.Router();
const fraudDetector = new FraudDetector();

// Validation schemas
const transactionSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).default('USD'),
  customerId: Joi.string().required(),
  merchantId: Joi.string().required(),
  deviceFingerprint: Joi.object({
    userAgent: Joi.string().required(),
    screenResolution: Joi.string().required(),
    timezone: Joi.string().required(),
    language: Joi.string().required(),
    platform: Joi.string().required(),
    webglVendor: Joi.string(),
    webglRenderer: Joi.string(),
    canvasFingerprint: Joi.string(),
    webdriver: Joi.boolean()
  }).required(),
  locationData: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    accuracy: Joi.number().positive(),
    timestamp: Joi.date().iso()
  }),
  behaviorData: Joi.object({
    clicks: Joi.number().min(0).default(0),
    keystrokes: Joi.number().min(0).default(0),
    scrolls: Joi.number().min(0).default(0),
    mouseMovements: Joi.number().min(0).default(0),
    typingPatterns: Joi.array().items(Joi.object({
      timestamp: Joi.date().iso(),
      key: Joi.string(),
      timeSinceLastKey: Joi.number()
    })).default([]),
    clickPatterns: Joi.array().items(Joi.object({
      timestamp: Joi.date().iso(),
      x: Joi.number(),
      y: Joi.number(),
      target: Joi.string()
    })).default([]),
    sessionDuration: Joi.number().min(0).default(0),
    actionsPerMinute: Joi.number().min(0).default(0)
  }),
  networkData: Joi.object({
    effectiveType: Joi.string().valid('slow-2g', '2g', '3g', '4g'),
    downlink: Joi.number().min(0),
    rtt: Joi.number().min(0),
    saveData: Joi.boolean()
  }),
  // Demo fields for testing scenarios
  forcedRiskScore: Joi.number().min(0).max(1),
  scenario: Joi.string().valid('normal', 'suspicious', 'fraudulent')
});

// POST /api/fraud/analyze
router.post('/analyze', authenticateMerchant, async (req, res) => {
  try {
    // Validate request
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    // Add timestamp if not provided
    if (!value.timestamp) {
      value.timestamp = new Date().toISOString();
    }

    // Analyze transaction
    const analysis = await fraudDetector.analyzeTransaction(value);

    // Store analysis (in production, save to database)
    await storeAnalysis(analysis);

    // Send webhook if configured
    if (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'CRITICAL') {
      await sendWebhook(req.merchant.webhookUrl, analysis);
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Fraud analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Unable to analyze transaction'
    });
  }
});

// GET /api/fraud/score/:transactionId
router.get('/score/:transactionId', authenticateMerchant, async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // In production, fetch from database
    const analysis = await getAnalysis(transactionId);
    
    if (!analysis) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: {
        transactionId: analysis.transactionId,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        recommendations: analysis.recommendations,
        flags: analysis.flags
      }
    });

  } catch (error) {
    console.error('Get score error:', error);
    res.status(500).json({
      error: 'Failed to retrieve score'
    });
  }
});

// GET /api/fraud/analysis/:transactionId - Get full analysis data
router.get('/analysis/:transactionId', authenticateMerchant, async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const analysis = await getAnalysis(transactionId);
    
    if (!analysis) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'No analysis found for this transaction ID'
      });
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Analysis retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve analysis'
    });
  }
});

// GET /api/fraud/analyses - Get all fraud analyses
router.get('/analyses', authenticateMerchant, async (req, res) => {
  try {
    const allData = localStorage.getAllData();
    
    res.json({
      success: true,
      data: {
        transactions: allData.transactions,
        count: Object.keys(allData.transactions).length
      }
    });

  } catch (error) {
    console.error('Analyses retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve analyses'
    });
  }
});

// POST /api/fraud/batch-analyze
router.post('/batch-analyze', authenticateMerchant, async (req, res) => {
  try {
    const { transactions } = req.body;
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        error: 'Transactions array is required'
      });
    }

    if (transactions.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 transactions per batch'
      });
    }

    const results = [];
    
    for (const transaction of transactions) {
      const { error, value } = transactionSchema.validate(transaction);
      if (error) {
        results.push({
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
        continue;
      }

      const analysis = await fraudDetector.analyzeTransaction(value);
      await storeAnalysis(analysis);
      results.push(analysis);
    }

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({
      error: 'Batch analysis failed'
    });
  }
});

// Helper functions - now using LocalStorage
async function storeAnalysis(analysis) {
  // Store analysis in local storage
  localStorage.setTransactionAnalysis(null, analysis.transactionId, analysis);
  console.log('Storing analysis:', analysis.transactionId);
}

async function getAnalysis(transactionId) {
  // Retrieve analysis from local storage
  return localStorage.getTransactionAnalysis(null, transactionId);
}

async function sendWebhook(webhookUrl, analysis) {
  if (!webhookUrl) return;
  
  try {
    const axios = require('axios');
    await axios.post(webhookUrl, {
      event: 'fraud.analysis.completed',
      data: analysis
    }, {
      timeout: 5000
    });
  } catch (error) {
    console.error('Webhook failed:', error.message);
  }
}

module.exports = router;
