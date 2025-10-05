const express = require('express');
const localStorage = require('../storage/localStorage');

const router = express.Router();

// Dashboard routes
router.get('/', (req, res) => {
  try {
    // Get all transaction data
    const allTransactions = localStorage.getAllData();
    const transactions = Object.values(allTransactions.transactions || {});
    
    // Calculate statistics
    const totalTransactions = transactions.length;
    const highRiskTransactions = transactions.filter(t => t.riskLevel === 'HIGH').length;
    const mediumRiskTransactions = transactions.filter(t => t.riskLevel === 'MEDIUM').length;
    const lowRiskTransactions = transactions.filter(t => t.riskLevel === 'LOW').length;
    
    // Calculate average risk score
    const avgRiskScore = transactions.length > 0 
      ? transactions.reduce((sum, t) => sum + t.riskScore, 0) / transactions.length 
      : 0;
    
    // Get recent transactions (last 10)
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    
    // Get merchants
    const merchants = Object.values(allTransactions.merchants || {});
    
    // Calculate fraud flags
    const allFlags = transactions.flatMap(t => t.flags || []);
    const flagCounts = allFlags.reduce((acc, flag) => {
      acc[flag] = (acc[flag] || 0) + 1;
      return acc;
    }, {});
    
    const topFlags = Object.entries(flagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([flag, count]) => ({ flag, count }));
    
    const dashboard = {
      overview: {
        totalTransactions,
        highRiskTransactions,
        mediumRiskTransactions,
        lowRiskTransactions,
        avgRiskScore: Math.round(avgRiskScore * 100) / 100,
        fraudRate: totalTransactions > 0 ? Math.round((highRiskTransactions / totalTransactions) * 100) : 0
      },
      recentTransactions: recentTransactions.map(t => ({
        transactionId: t.transactionId,
        amount: t.amount,
        currency: t.currency,
        riskLevel: t.riskLevel,
        riskScore: Math.round(t.riskScore * 100),
        timestamp: t.timestamp,
        flags: t.flags || [],
        location: t.riskFactors?.location?.details ? {
          city: t.riskFactors.location.details.city,
          country: t.riskFactors.location.details.country,
          countryCode: t.riskFactors.location.details.countryCode
        } : null
      })),
      merchants: merchants.map(m => ({
        merchantId: m.merchantId,
        name: m.name,
        email: m.email,
        website: m.website,
        createdAt: m.createdAt
      })),
      topFlags,
      systemInfo: {
        version: "1.0.0",
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    };
    
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate dashboard',
      message: error.message
    });
  }
});

module.exports = router;
