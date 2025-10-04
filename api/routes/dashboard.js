const express = require('express');
const router = express.Router();

// Dashboard routes
router.get('/', (req, res) => {
  res.json({ 
    message: 'Fraud Detection Dashboard',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      fraud: '/api/fraud',
      merchants: '/api/merchants'
    }
  });
});

module.exports = router;
