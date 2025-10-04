const express = require('express');
const crypto = require('crypto');
const cookieStorage = require('../storage/cookieStorage');

const router = express.Router();

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
    
    // Store verification code in cookie
    cookieStorage.setVerificationCode(res, transactionId, {
      code,
      email,
      expiresAt,
      riskScore,
      attempts: 0
    });
    
    // In production, send actual email
    console.log(`📧 Email verification sent to ${email}`);
    console.log(`🔑 Verification code: ${code}`);
    console.log(`⏰ Expires at: ${new Date(expiresAt).toISOString()}`);
    
    res.json({
      success: true,
      message: 'Verification code sent to email',
      code: code, // For demo purposes
      expiresIn: 600 // 10 minutes in seconds
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Email verification failed',
      message: 'An error occurred while sending verification email'
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
    
    const verification = cookieStorage.getVerificationCode(req, transactionId);
    
    if (!verification) {
      return res.status(400).json({
        error: 'Invalid or expired verification code'
      });
    }
    
    // Check attempts
    if (verification.attempts >= 3) {
      cookieStorage.deleteVerificationCode(req, res, transactionId);
      return res.status(400).json({
        error: 'Too many failed attempts. Please request a new code.'
      });
    }
    
    // Verify code
    if (verification.code !== code) {
      verification.attempts++;
      cookieStorage.setVerificationCode(res, transactionId, verification);
      
      return res.status(400).json({
        error: 'Invalid verification code',
        attemptsRemaining: 3 - verification.attempts
      });
    }
    
    // Code is valid, delete it
    cookieStorage.deleteVerificationCode(req, res, transactionId);
    
    res.json({
      success: true,
      message: 'Email verified successfully',
      transactionId: transactionId
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Email verification failed',
      message: 'An error occurred while verifying code'
    });
  }
});

// GET /api/email-verification/status/:transactionId
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const verification = cookieStorage.getVerificationCode(req, transactionId);
    
    if (!verification) {
      return res.json({
        success: true,
        data: {
          status: 'not_found',
          message: 'No verification found for this transaction'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        status: 'pending',
        email: verification.email,
        expiresAt: verification.expiresAt,
        attempts: verification.attempts
      }
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: 'An error occurred while checking status'
    });
  }
});

module.exports = router;
