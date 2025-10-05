const crypto = require('crypto');

class FraudDetector {
  constructor() {
    this.riskWeights = {
      location: 0.25,
      device: 0.20,
      behavior: 0.20,
      network: 0.15,
      timing: 0.10,
      biometrics: 0.10
    };
  }

  async analyzeTransaction(transactionData) {
    const {
      amount,
      currency = 'USD',
      customerId,
      deviceFingerprint,
      locationData,
      behaviorData,
      networkData,
      merchantId,
      forcedRiskScore, // Add this
      scenario // Add this
    } = transactionData;

    const analysis = {
      transactionId: this.generateTransactionId(),
      timestamp: new Date().toISOString(),
      merchantId,
      customerId,
      amount,
      currency,
      riskFactors: {},
      riskScore: 0,
      riskLevel: 'LOW',
      recommendations: [],
      flags: []
    };

    // If we have a forced risk score, use it for demo purposes
    if (forcedRiskScore !== undefined && forcedRiskScore !== null) {
      analysis.riskScore = forcedRiskScore;
      analysis.riskLevel = this.getRiskLevel(forcedRiskScore);
      
      // Add appropriate risk factors based on the scenario
      if (scenario === 'suspicious') {
        analysis.riskFactors = {
          location: { score: 0.3, reason: 'Suspicious location detected' },
          device: { score: 0.2, reason: 'Device appears normal' },
          behavior: { score: 0.4, reason: 'Suspicious behavior patterns' },
          network: { score: 0.1, reason: 'Network appears normal' },
          timing: { score: 0.2, reason: 'Unusual transaction timing' },
          amount: { score: 0.3, reason: 'Above average transaction amount' }
        };
      } else if (scenario === 'fraudulent') {
        analysis.riskFactors = {
          location: { score: 0.5, reason: 'High-risk location detected' },
          device: { score: 0.4, reason: 'Suspicious device characteristics' },
          behavior: { score: 0.6, reason: 'Automated behavior detected' },
          network: { score: 0.3, reason: 'Suspicious network patterns' },
          timing: { score: 0.4, reason: 'Highly unusual transaction timing' },
          amount: { score: 0.5, reason: 'Extremely high transaction amount' }
        };
      }
      
      analysis.recommendations = this.getRecommendations(forcedRiskScore, analysis.riskFactors);
      analysis.flags = this.getFlags(analysis.riskFactors);
      
      return analysis;
    }

    // Analyze each risk factor
    analysis.riskFactors.location = await this.analyzeLocation(locationData, customerId);
    analysis.riskFactors.device = await this.analyzeDevice(deviceFingerprint, customerId);
    analysis.riskFactors.behavior = await this.analyzeBehavior(behaviorData, customerId);
    analysis.riskFactors.network = await this.analyzeNetwork(networkData, customerId);
    analysis.riskFactors.timing = await this.analyzeTiming(transactionData);
    analysis.riskFactors.amount = await this.analyzeAmount(amount, customerId, merchantId);

    // Calculate overall risk score
    analysis.riskScore = this.calculateRiskScore(analysis.riskFactors);
    analysis.riskLevel = this.getRiskLevel(analysis.riskScore);
    analysis.recommendations = this.getRecommendations(analysis.riskScore, analysis.riskFactors);
    analysis.flags = this.getFlags(analysis.riskFactors);

    return analysis;
  }

  async analyzeLocation(locationData, customerId) {
    if (!locationData) return { score: 0.5, reason: 'No location data provided' };

    const { latitude, longitude, accuracy, timestamp } = locationData;
    
    // Get city and country information
    const locationInfo = await this.getLocationInfo(latitude, longitude);
    
    // Check if location is suspicious
    const isHighRiskCountry = this.isHighRiskCountry(latitude, longitude);
    const isVPN = await this.detectVPN(locationData);
    const isVelocityAnomaly = await this.checkVelocityAnomaly(locationData, customerId);
    
    let score = 0.1; // Base score for valid location
    
    if (isHighRiskCountry) {
      score += 0.4;
    }
    if (isVPN) {
      score += 0.3;
    }
    if (isVelocityAnomaly) {
      score += 0.2;
    }
    if (accuracy > 1000) {
      score += 0.1; // Low accuracy location
    }

    return {
      score: Math.min(score, 1.0),
      reason: this.getLocationReason(isHighRiskCountry, isVPN, isVelocityAnomaly),
      details: { 
        isHighRiskCountry, 
        isVPN, 
        isVelocityAnomaly, 
        accuracy,
        city: locationInfo.city,
        country: locationInfo.country,
        countryCode: locationInfo.countryCode
      }
    };
  }

  async analyzeDevice(deviceFingerprint, customerId) {
    if (!deviceFingerprint) return { score: 0.6, reason: 'No device data provided' };

    const {
      userAgent,
      screenResolution,
      timezone,
      language,
      platform,
      webglVendor,
      canvasFingerprint
    } = deviceFingerprint;

    let score = 0.1;
    const flags = [];

    // Check for headless browser indicators
    if (this.isHeadlessBrowser(userAgent, deviceFingerprint)) {
      score += 0.7; // Increased to 0.7 for HIGH risk
      flags.push('headless_browser');
    }

    // Check if device is known
    const isKnownDevice = await this.isKnownDevice(deviceFingerprint, customerId);
    if (!isKnownDevice) {
      score += 0.4; // Increased to 0.4
      flags.push('unknown_device');
    }

    // Check for suspicious configurations
    if (this.isSuspiciousConfiguration(deviceFingerprint)) {
      score += 0.3; // Increased to 0.3
      flags.push('suspicious_config');
    }

    return {
      score: Math.min(score, 1.0),
      reason: flags.length > 0 ? `Device flags: ${flags.join(', ')}` : 'Device appears normal',
      details: { isKnownDevice, flags, isHeadless: flags.includes('headless_browser') }
    };
  }

  async analyzeBehavior(behaviorData, customerId) {
    if (!behaviorData) return { score: 0.5, reason: 'No behavior data provided' };

    const {
      clicks,
      keystrokes,
      scrolls,
      mouseMovements,
      typingPatterns,
      clickPatterns,
      sessionDuration,
      actionsPerMinute
    } = behaviorData;

    let score = 0.1;
    const flags = [];

    // Check for automation patterns
    if (this.isAutomatedBehavior(behaviorData)) {
      score += 0.8; // Increased to 0.8 for HIGH risk
      flags.push('automated_behavior');
    }

    // Check typing patterns
    if (this.isSuspiciousTyping(typingPatterns)) {
      score += 0.5; // Increased to 0.5
      flags.push('suspicious_typing');
    }

    // Check action velocity - more aggressive thresholds
    if (actionsPerMinute > 50) { // Lowered from 100
      score += 0.4; // Increased to 0.4
      flags.push('too_fast');
    } else if (actionsPerMinute < 5) { // Increased from 2
      score += 0.3; // Increased to 0.3
      flags.push('too_slow');
    }

    // Check for human-like patterns
    if (!this.isHumanLikeBehavior(behaviorData)) {
      score += 0.5; // Increased to 0.5
      flags.push('non_human_behavior');
    }

    return {
      score: Math.min(score, 1.0),
      reason: flags.length > 0 ? `Behavior flags: ${flags.join(', ')}` : 'Behavior appears normal',
      details: { flags, actionsPerMinute, sessionDuration }
    };
  }

  async analyzeNetwork(networkData, customerId) {
    if (!networkData) return { score: 0.3, reason: 'No network data provided' };

    const { effectiveType, downlink, rtt, saveData } = networkData;
    
    let score = 0.1;
    const flags = [];

    // Check if network is known
    const isKnownNetwork = await this.isKnownNetwork(networkData, customerId);
    if (!isKnownNetwork) {
      score += 0.3;
      flags.push('unknown_network');
    }

    // Check for suspicious network characteristics
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      score += 0.1;
      flags.push('slow_connection');
    }

    // Check for mobile hotspot patterns
    if (this.isMobileHotspot(networkData)) {
      score += 0.2;
      flags.push('mobile_hotspot');
    }

    return {
      score: Math.min(score, 1.0),
      reason: flags.length > 0 ? `Network flags: ${flags.join(', ')}` : 'Network appears normal',
      details: { isKnownNetwork, flags, effectiveType }
    };
  }

  async analyzeTiming(transactionData) {
    const { timestamp, customerId, merchantId } = transactionData;
    const now = new Date(timestamp);
    const hour = now.getHours();
    
    let score = 0.1;
    const flags = [];

    // Check for unusual transaction times
    if (hour >= 2 && hour <= 5) {
      score += 0.2;
      flags.push('unusual_time');
    }

    // Check for rapid successive transactions
    const recentTransactions = await this.getRecentTransactions(customerId, 1); // Last hour
    if (recentTransactions.length > 5) {
      score += 0.3;
      flags.push('rapid_transactions');
    }

    return {
      score: Math.min(score, 1.0),
      reason: flags.length > 0 ? `Timing flags: ${flags.join(', ')}` : 'Timing appears normal',
      details: { hour, recentTransactionCount: recentTransactions.length, flags }
    };
  }

  async analyzeAmount(amount, customerId, merchantId) {
    let score = 0.1;
    const flags = [];

    // Get customer's spending history
    const spendingHistory = await this.getCustomerSpendingHistory(customerId);
    const avgAmount = spendingHistory.length > 0 
      ? spendingHistory.reduce((sum, t) => sum + t.amount, 0) / spendingHistory.length 
      : 0;

    // Check for unusually large amounts
    if (avgAmount > 0 && amount > avgAmount * 5) {
      score += 0.4;
      flags.push('unusually_large_amount');
    }

    // Check for round numbers (potential test transactions)
    if (amount % 100 === 0 && amount > 1000) {
      score += 0.1;
      flags.push('round_number');
    }

    // Check against merchant's typical amounts
    const merchantStats = await this.getMerchantStats(merchantId);
    if (merchantStats.avgAmount > 0 && amount > merchantStats.avgAmount * 3) {
      score += 0.2;
      flags.push('above_merchant_average');
    }

    return {
      score: Math.min(score, 1.0),
      reason: flags.length > 0 ? `Amount flags: ${flags.join(', ')}` : 'Amount appears normal',
      details: { 
        amount, 
        customerAvgAmount: avgAmount, 
        merchantAvgAmount: merchantStats.avgAmount,
        flags 
      }
    };
  }

  calculateRiskScore(riskFactors) {
    // More aggressive weighting for high-risk factors
    const weights = {
      location: 0.20,
      device: 0.30,    // Increased weight for device
      behavior: 0.30,  // Increased weight for behavior
      network: 0.10,
      timing: 0.05,
      amount: 0.05     // Reduced weight for amount
    };

    let totalScore = 0;
    let totalWeight = 0;

    Object.keys(weights).forEach(factor => {
      if (riskFactors[factor] && typeof riskFactors[factor].score === 'number') {
        totalScore += riskFactors[factor].score * weights[factor];
        totalWeight += weights[factor];
      }
    });

    // Boost score if multiple high-risk factors are present
    const highRiskFactors = Object.values(riskFactors).filter(factor => 
      factor && factor.score > 0.7
    ).length;
    
    if (highRiskFactors >= 2) {
      totalScore += 0.2; // Boost by 20% if multiple high-risk factors
    }

    return Math.min(totalWeight > 0 ? totalScore / totalWeight : 0.5, 1.0);
  }

  getRiskLevel(score) {
    if (score < 0.4) return 'LOW';
    if (score < 0.7) return 'MEDIUM';
    return 'HIGH';
  }

  getRecommendations(score, riskFactors) {
    const recommendations = [];

    if (score > 0.8) {
      recommendations.push('BLOCK_TRANSACTION');
      recommendations.push('REQUIRE_MANUAL_REVIEW');
    } else if (score > 0.6) {
      recommendations.push('REQUIRE_2FA');
      recommendations.push('SEND_SMS_VERIFICATION');
    } else if (score > 0.4) {
      recommendations.push('REQUIRE_EMAIL_VERIFICATION');
    }

    if (riskFactors.device?.score > 0.7) {
      recommendations.push('VERIFY_DEVICE');
    }

    if (riskFactors.location?.score > 0.7) {
      recommendations.push('VERIFY_LOCATION');
    }

    return recommendations;
  }

  getFlags(riskFactors) {
    const flags = [];
    Object.values(riskFactors).forEach(factor => {
      if (factor.details?.flags) {
        flags.push(...factor.details.flags);
      }
    });
    return [...new Set(flags)]; // Remove duplicates
  }

  // Helper methods
  isHighRiskCountry(lat, lng) {
    // Simplified - in production, use a proper geolocation database
    const highRiskCountries = [
      { lat: 35.8617, lng: 104.1954, radius: 1000 }, // China
      { lat: 55.7558, lng: 37.6176, radius: 1000 }, // Russia
      { lat: 20.5937, lng: 78.9629, radius: 1000 }  // India
    ];
    
    return highRiskCountries.some(country => 
      this.calculateDistance(lat, lng, country.lat, country.lng) < country.radius
    );
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async detectVPN(locationData) {
    // Simplified VPN detection - in production, use a VPN detection service
    return Math.random() < 0.1; // 10% chance of VPN
  }

  async checkVelocityAnomaly(locationData, customerId) {
    // Check if user moved too fast between transactions
    const lastLocation = await this.getLastKnownLocation(customerId);
    if (!lastLocation) return false;

    const distance = this.calculateDistance(
      locationData.latitude, locationData.longitude,
      lastLocation.latitude, lastLocation.longitude
    );

    const timeDiff = (new Date(locationData.timestamp) - new Date(lastLocation.timestamp)) / 1000 / 3600; // hours
    const velocity = distance / timeDiff; // km/h

    return velocity > 500; // Impossible velocity (>500 km/h)
  }

  isHeadlessBrowser(userAgent, fingerprint) {
    const headlessIndicators = [
      'HeadlessChrome',
      'PhantomJS',
      'Selenium',
      'Puppeteer'
    ];

    return headlessIndicators.some(indicator => 
      userAgent.includes(indicator)
    ) || fingerprint.webdriver === true;
  }

  isKnownDevice(fingerprint, customerId) {
    // In production, check against database
    // For demo: headless browsers and bots are always unknown
    if (fingerprint.userAgent.includes('HeadlessChrome') || 
        fingerprint.userAgent.includes('Bot') ||
        fingerprint.webdriver === true) {
      return false;
    }
    return Math.random() > 0.3; // 70% chance device is known
  }

  isSuspiciousConfiguration(fingerprint) {
    return fingerprint.plugins?.length === 0 || 
           fingerprint.languages?.length === 0 ||
           !fingerprint.screenResolution;
  }

  isAutomatedBehavior(behaviorData) {
    const { clicks, keystrokes, sessionDuration, mouseMovements, scrolls } = behaviorData;
    const actionsPerMinute = (clicks + keystrokes) / (sessionDuration / 60000);
    
    // More aggressive automated behavior detection
    return actionsPerMinute > 50 || // Too fast (lowered threshold)
           (clicks === 0 && keystrokes === 0) || // No interaction at all
           (clicks === 0 && mouseMovements === 0) || // No mouse activity
           (sessionDuration < 2000 && clicks === 0); // Very short session with no clicks
  }

  isSuspiciousTyping(typingPatterns) {
    if (!typingPatterns || typingPatterns.length < 5) return false;
    
    const intervals = typingPatterns.map(p => p.timeSinceLastKey);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avg, 2), 0) / intervals.length;
    
    return Math.sqrt(variance) / avg > 0.5; // High coefficient of variation
  }

  isHumanLikeBehavior(behaviorData) {
    const { clicks, keystrokes, scrolls, mouseMovements } = behaviorData;
    
    // Check for human-like patterns
    return clicks > 0 && 
           keystrokes > 0 && 
           scrolls > 0 && 
           mouseMovements > 0 &&
           clicks < 1000; // Not too many clicks
  }

  isKnownNetwork(networkData, customerId) {
    // In production, check against database
    return Math.random() > 0.4; // 60% chance network is known
  }

  isMobileHotspot(networkData) {
    // Simplified detection - in production, use more sophisticated methods
    return networkData.effectiveType === '4g' && networkData.downlink < 1;
  }

  async getRecentTransactions(customerId, hours = 1) {
    // In production, query database
    return []; // Mock data
  }

  async getCustomerSpendingHistory(customerId) {
    // In production, query database
    return []; // Mock data
  }

  async getMerchantStats(merchantId) {
    // In production, query database
    return { avgAmount: 0 }; // Mock data
  }

  async getLastKnownLocation(customerId) {
    // In production, query database
    return null; // Mock data
  }

  getLocationReason(isHighRiskCountry, isVPN, isVelocityAnomaly) {
    const reasons = [];
    if (isHighRiskCountry) reasons.push('high-risk country');
    if (isVPN) reasons.push('VPN detected');
    if (isVelocityAnomaly) reasons.push('impossible travel velocity');
    return reasons.length > 0 ? reasons.join(', ') : 'location appears normal';
  }

  generateTransactionId() {
    return 'txn_' + crypto.randomBytes(16).toString('hex');
  }

  async getLocationInfo(latitude, longitude) {
    // In production, you would use a real geocoding service like Google Maps API
    // For demo purposes, we'll simulate location data based on coordinates
    
    const mockLocations = [
      { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'United States', countryCode: 'US' },
      { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', country: 'United States', countryCode: 'US' },
      { lat: 51.5074, lng: -0.1278, city: 'London', country: 'United Kingdom', countryCode: 'GB' },
      { lat: 48.8566, lng: 2.3522, city: 'Paris', country: 'France', countryCode: 'FR' },
      { lat: 35.6762, lng: 139.6503, city: 'Tokyo', country: 'Japan', countryCode: 'JP' },
      { lat: 55.7558, lng: 37.6176, city: 'Moscow', country: 'Russia', countryCode: 'RU' },
      { lat: 39.9042, lng: 116.4074, city: 'Beijing', country: 'China', countryCode: 'CN' },
      { lat: 19.4326, lng: -99.1332, city: 'Mexico City', country: 'Mexico', countryCode: 'MX' },
      { lat: -33.8688, lng: 151.2093, city: 'Sydney', country: 'Australia', countryCode: 'AU' },
      { lat: 43.6532, lng: -79.3832, city: 'Toronto', country: 'Canada', countryCode: 'CA' }
    ];

    // Find the closest mock location
    let closestLocation = mockLocations[0];
    let minDistance = this.calculateDistance(latitude, longitude, closestLocation.lat, closestLocation.lng);

    for (const location of mockLocations) {
      const distance = this.calculateDistance(latitude, longitude, location.lat, location.lng);
      if (distance < minDistance) {
        minDistance = distance;
        closestLocation = location;
      }
    }

    // Add some randomness for demo purposes
    const randomVariations = [
      { city: 'San Francisco', country: 'United States', countryCode: 'US' },
      { city: 'Chicago', country: 'United States', countryCode: 'US' },
      { city: 'Miami', country: 'United States', countryCode: 'US' },
      { city: 'Berlin', country: 'Germany', countryCode: 'DE' },
      { city: 'Madrid', country: 'Spain', countryCode: 'ES' },
      { city: 'Rome', country: 'Italy', countryCode: 'IT' },
      { city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL' },
      { city: 'Stockholm', country: 'Sweden', countryCode: 'SE' }
    ];

    // 20% chance to return a random location for demo variety
    if (Math.random() < 0.2) {
      const randomLocation = randomVariations[Math.floor(Math.random() * randomVariations.length)];
      return randomLocation;
    }

    return {
      city: closestLocation.city,
      country: closestLocation.country,
      countryCode: closestLocation.countryCode
    };
  }
}

module.exports = FraudDetector;
