const express = require('express');
const crypto = require('crypto');
const { merchants, apiKeys } = require('../storage');

const router = express.Router();

// Store verification codes (in production, use Redis or database)
const verificationCodes = new Map();

// POST /api/email-verification/send
router.post('/send', async (req, res) => {
  try {
    const { email, transactionId, riskScore } = req.body;
    
    if (!email || !transactionId) {
      return res.status(400).json({
        error: 'Email and transaction ID are required'
      });
    }
    
    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
    
    // Store verification code
    verificationCodes.set(transactionId, {
      code,
      email,
      expiresAt,
      riskScore,
      attempts: 0
    });
    
    // In production, send actual email
    console.log(`📧 Verification code for ${email}: ${code}`);
    console.log(`🔗 Verification link: http://localhost:3001/verify?code=${code}&transaction=${transactionId}`);
    
    // For demo purposes, we'll return the code
    res.json({
      success: true,
      message: 'Verification code sent to email',
      code: code, // Remove this in production
      expiresIn: 600 // 10 minutes
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Failed to send verification email'
    });
  }
});

// POST /api/email-verification/verify
router.post('/verify', async (req, res) => {
  try {
    const { code, transactionId } = req.body;
    
    if (!code || !transactionId) {
      return res.status(400).json({
        error: 'Code and transaction ID are required'
      });
    }
    
    const verification = verificationCodes.get(transactionId);
    
    if (!verification) {
      return res.status(404).json({
        error: 'Verification code not found or expired'
      });
    }
    
    // Check if expired
    if (Date.now() > verification.expiresAt) {
      verificationCodes.delete(transactionId);
      return res.status(400).json({
        error: 'Verification code expired'
      });
    }
    
    // Check attempts
    if (verification.attempts >= 3) {
      verificationCodes.delete(transactionId);
      return res.status(400).json({
        error: 'Too many failed attempts'
      });
    }
    
    // Verify code
    if (verification.code !== code) {
      verification.attempts++;
      return res.status(400).json({
        error: 'Invalid verification code',
        attemptsLeft: 3 - verification.attempts
      });
    }
    
    // Code is valid
    verificationCodes.delete(transactionId);
    
    res.json({
      success: true,
      message: 'Email verified successfully',
      transactionId: transactionId
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Failed to verify email'
    });
  }
});

// GET /api/email-verification/status/:transactionId
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const verification = verificationCodes.get(transactionId);
    
    if (!verification) {
      return res.json({
        verified: false,
        message: 'No verification required or code expired'
      });
    }
    
    res.json({
      verified: false,
      email: verification.email,
      expiresAt: verification.expiresAt,
      attempts: verification.attempts
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to check verification status'
    });
  }
});

module.exports = router;
