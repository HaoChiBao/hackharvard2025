const express = require('express');
const router = express.Router();

// Webhook management routes
router.get('/', (req, res) => {
  res.json({ message: 'Webhook management endpoint' });
});

module.exports = router;