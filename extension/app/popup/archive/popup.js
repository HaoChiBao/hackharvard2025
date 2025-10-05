const API_BASE_URL = 'http://localhost:3001';

class FraudDetectionSystem {
    constructor() {
        this.apiKey = null;
        this.fraudData = null;
        this.currentTransaction = null;
        this.behaviorData = {
            clicks: 0,
            keystrokes: 0,
            mouseMovements: 0,
            scrolls: 0,
            sessionStart: Date.now(),
            typingPatterns: [],
            clickPatterns: []
        };
        this.monitoringInterval = null;
        this.fraudAnalysisInterval = null;
        this.isTracking = false;
        this.liveDisplayTimer = null;
        this.liveDisplayCountdown = 3;
        this.init();
    }

    init() {
        this.loadApiKey();
        this.loadTrackingState();
        this.setupEventListeners();
        this.startBehaviorTracking();
        this.updateStatus('Initializing fraud detection system...');
    }

    setupEventListeners() {
        document.getElementById('saveApiKey').addEventListener('click', () => this.saveApiKey());
        document.getElementById('testConnection').addEventListener('click', () => this.testConnection());
        document.getElementById('refreshData').addEventListener('click', () => this.analyzeCurrentTransaction());
        document.getElementById('testDataUpdate').addEventListener('click', () => this.testDataUpdate());
        
        // Auto-save API key when typing
        document.getElementById('apiKey').addEventListener('input', (e) => {
            if (e.target.value.startsWith('sk_')) {
                this.apiKey = e.target.value;
            }
        });
    }

    startBehaviorTracking() {
        // Start local behavior tracking as backup
        this.startLocalBehaviorTracking();
        
        // Mark as tracking and save state
        this.isTracking = true;
        this.saveTrackingState();
        
        // Start live display timer
        this.startLiveDisplayTimer();
        
        // Get behavior data from background script every second
        this.monitoringInterval = setInterval(() => {
            this.getBehaviorDataFromBackground();
        }, 1000);
        
        // Perform fraud analysis every 5 seconds
        this.fraudAnalysisInterval = setInterval(() => {
            this.performLiveFraudAnalysis();
        }, 5000);
    }

    startLiveDisplayTimer() {
        console.log('Starting live display timer...');
        this.liveDisplayCountdown = 3;
        this.updateLiveTimer();
        
        this.liveDisplayTimer = setInterval(() => {
            this.liveDisplayCountdown--;
            this.updateLiveTimer();
            
            if (this.liveDisplayCountdown <= 0) {
                this.liveDisplayCountdown = 3; // Reset to 3 seconds
                console.log('Live display timer reset to 3 seconds');
            }
        }, 1000);
    }

    updateLiveTimer() {
        const timerElement = document.getElementById('liveTimer');
        if (timerElement) {
            timerElement.textContent = `${this.liveDisplayCountdown}s`;
            
            // Change color based on countdown
            if (this.liveDisplayCountdown <= 1) {
                timerElement.style.color = '#dc3545'; // Red
            } else if (this.liveDisplayCountdown <= 2) {
                timerElement.style.color = '#fd7e14'; // Orange
            } else {
                timerElement.style.color = '#28a745'; // Green
            }
        }
    }

    startLocalBehaviorTracking() {
        // Track clicks in popup
        document.addEventListener('click', () => {
            this.behaviorData.clicks++;
        });

        // Track keystrokes in popup
        document.addEventListener('keydown', () => {
            this.behaviorData.keystrokes++;
        });

        // Update local metrics every second
        setInterval(() => {
            this.updateBehaviorMetricsFromLocalData();
        }, 1000);
    }

    async getBehaviorDataFromBackground() {
        try {
            console.log('Popup: Requesting behavior data from background script');

            // Send message to background script to get behavior data
            chrome.runtime.sendMessage({ action: 'getBehaviorData' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Popup: Background script not available:', chrome.runtime.lastError.message);
                    // Fallback to local tracking if background script isn't available
                    this.updateBehaviorMetricsFromLocalData();
                    return;
                }
                
                if (response) {
                    console.log('Popup: Received behavior data from background:', response);
                    this.updateBehaviorMetricsFromData(response);
                } else {
                    console.log('Popup: No response from background script');
                    this.updateBehaviorMetricsFromLocalData();
                }
            });
        } catch (error) {
            console.error('Popup: Failed to get behavior data from background script:', error);
            this.updateBehaviorMetricsFromLocalData();
        }
    }

    updateBehaviorMetricsFromLocalData() {
        // Fallback: show basic info when content script isn't available
        const sessionDuration = Math.floor((Date.now() - this.behaviorData.sessionStart) / 1000);
        const actionsPerMinute = Math.floor((this.behaviorData.clicks + this.behaviorData.keystrokes) / (sessionDuration / 60)) || 0;
        
        document.getElementById('sessionDuration').textContent = `${sessionDuration}s`;
        
        // Simple analysis based on local data
        if (this.behaviorData.keystrokes < 2) {
            document.getElementById('typingPattern').textContent = 'Insufficient data';
        } else if (actionsPerMinute > 50) {
            document.getElementById('typingPattern').textContent = 'High activity';
        } else {
            document.getElementById('typingPattern').textContent = 'Normal';
        }
        
        if (this.behaviorData.clicks === 0) {
            document.getElementById('mouseActivity').textContent = 'No clicks detected';
        } else if (this.behaviorData.clicks > 20) {
            document.getElementById('mouseActivity').textContent = 'High click activity';
        } else {
            document.getElementById('mouseActivity').textContent = 'Normal';
        }
        
        if (actionsPerMinute < 1) {
            document.getElementById('pageInteraction').textContent = 'Low interaction';
        } else if (actionsPerMinute > 30) {
            document.getElementById('pageInteraction').textContent = 'High interaction';
        } else {
            document.getElementById('pageInteraction').textContent = 'Normal';
        }
    }

    loadApiKey() {
        chrome.storage.local.get(['fraudTrackerApiKey'], (result) => {
            if (result.fraudTrackerApiKey) {
                this.apiKey = result.fraudTrackerApiKey;
                document.getElementById('apiKey').value = this.apiKey;
                this.startMonitoring();
            }
        });
    }

    loadTrackingState() {
        chrome.storage.local.get(['isTracking', 'sessionStart'], (result) => {
            if (result.isTracking) {
                this.isTracking = result.isTracking;
                if (result.sessionStart) {
                    this.behaviorData.sessionStart = result.sessionStart;
                }
            }
        });
    }

    saveTrackingState() {
        chrome.storage.local.set({
            isTracking: this.isTracking,
            sessionStart: this.behaviorData.sessionStart
        });
    }

    saveApiKey() {
        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey.startsWith('sk_')) {
            this.updateStatus('Invalid API key format', 'error');
            return;
        }
        
        this.apiKey = apiKey;
        chrome.storage.local.set({ fraudTrackerApiKey: apiKey }, () => {
            this.updateStatus('Fraud detection system activated', 'connected');
            this.startMonitoring();
        });
    }

    async testConnection() {
        if (!this.apiKey) {
            this.updateStatus('Please enter an API key first', 'error');
            return;
        }

        try {
            this.updateStatus('Testing connection...');
            const response = await fetch(`${API_BASE_URL}/health`);
            if (response.ok) {
                this.updateStatus('System connected', 'connected');
                document.getElementById('fraudDetection').style.display = 'block';
                this.startMonitoring();
            } else {
                this.updateStatus('API server not responding', 'error');
            }
        } catch (error) {
            this.updateStatus('Connection failed - is the API running?', 'error');
        }
    }

    startMonitoring() {
        if (!this.apiKey) return;
        
        // Start continuous monitoring
        this.updateStatus('Monitoring user behavior...', 'connected');
        document.getElementById('fraudDetection').style.display = 'block';
        
        // Analyze current transaction and start monitoring
        this.analyzeCurrentTransaction();
        
        // Set up continuous monitoring every 5 seconds
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        this.monitoringInterval = setInterval(() => {
            this.analyzeCurrentTransaction();
        }, 5000);
    }

    async analyzeCurrentTransaction() {
        if (!this.apiKey) {
            this.updateStatus('Please configure API key first', 'error');
            return;
        }

        try {
            // Get current fraud data
            const response = await fetch(`${API_BASE_URL}/api/fraud/analyses`, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.fraudData = data.data;
            
            // Get the most recent transaction for analysis
            const transactions = Object.values(this.fraudData.transactions);
            if (transactions.length > 0) {
                this.currentTransaction = transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                this.performPassiveFraudAnalysis(this.currentTransaction);
            } else {
                this.showNoTransactions();
            }
            
            this.displayRecentTransactions(transactions);
            
        } catch (error) {
            console.error('Failed to analyze transaction:', error);
        }
    }

    updateBehaviorMetricsFromData(data) {
        console.log('Popup: Updating behavior metrics with data:', data);
        
        // Check if elements exist
        const sessionElement = document.getElementById('sessionDuration');
        const typingElement = document.getElementById('typingPattern');
        const mouseElement = document.getElementById('mouseActivity');
        const pageElement = document.getElementById('pageInteraction');
        const clicksElement = document.getElementById('clicks');
        const keystrokesElement = document.getElementById('keystrokes');
        const mouseMovementsElement = document.getElementById('mouseMovements');
        const scrollsElement = document.getElementById('scrolls');
        
        console.log('Popup: Elements found:', {
            sessionDuration: !!sessionElement,
            typingPattern: !!typingElement,
            mouseActivity: !!mouseElement,
            pageInteraction: !!pageElement,
            clicks: !!clicksElement,
            keystrokes: !!keystrokesElement,
            mouseMovements: !!mouseMovementsElement,
            scrolls: !!scrollsElement
        });
        
        // Update behavior metrics display with data from content script
        if (sessionElement) sessionElement.textContent = `${data.sessionDuration}s`;
        if (typingElement) typingElement.textContent = data.typingPattern;
        if (mouseElement) mouseElement.textContent = data.mouseActivity;
        if (pageElement) pageElement.textContent = data.pageInteraction;
        
        // Update the raw data display for debugging
        if (clicksElement) clicksElement.textContent = data.clicks || 0;
        if (keystrokesElement) keystrokesElement.textContent = data.keystrokes || 0;
        if (mouseMovementsElement) mouseMovementsElement.textContent = data.mouseMovements || 0;
        if (scrollsElement) scrollsElement.textContent = data.scrolls || 0;
        
        // Store current behavior data for fraud analysis
        this.currentBehaviorData = data;
        
        console.log('Popup: Behavior metrics updated successfully');
    }

    async performLiveFraudAnalysis() {
        if (!this.apiKey || !this.currentBehaviorData) {
            console.log('No API key or behavior data available for fraud analysis');
            return;
        }

        try {
            console.log('Performing live fraud analysis...');
            
            // Create a transaction-like object for fraud analysis
            const transactionData = {
                amount: 100.00, // Default amount for analysis
                currency: 'USD',
                customerId: 'live_monitor_user',
                merchantId: 'live_monitor',
                deviceFingerprint: {
                    userAgent: navigator.userAgent,
                    screenResolution: `${screen.width}x${screen.height}`,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    language: navigator.language,
                    platform: navigator.platform,
                    webdriver: navigator.webdriver || false
                },
                behaviorData: {
                    clicks: this.currentBehaviorData.clicks,
                    keystrokes: this.currentBehaviorData.keystrokes,
                    mouseMovements: this.currentBehaviorData.mouseMovements,
                    scrolls: this.currentBehaviorData.scrolls,
                    sessionDuration: this.currentBehaviorData.sessionDuration,
                    actionsPerMinute: Math.floor((this.currentBehaviorData.clicks + this.currentBehaviorData.keystrokes) / (this.currentBehaviorData.sessionDuration / 60)) || 0
                }
            };

            const response = await fetch(`${API_BASE_URL}/api/fraud/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                body: JSON.stringify(transactionData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Fraud analysis result:', result);
                if (result.success && result.data) {
                    this.updateFraudDisplay(result.data);
                } else {
                    console.error('Invalid API response:', result);
                    this.updateStatus('Invalid API response', 'error');
                }
            } else {
                console.error('Fraud analysis failed:', response.status, await response.text());
                this.updateStatus('Fraud analysis failed', 'error');
            }
        } catch (error) {
            console.error('Error performing fraud analysis:', error);
            this.updateStatus('Error in fraud analysis', 'error');
        }
    }

    updateFraudDisplay(analysis) {
        // Update risk meter
        const riskScore = Math.round(analysis.riskScore * 100);
        document.getElementById('riskPercentage').textContent = `${riskScore}%`;
        document.getElementById('riskFill').style.width = `${riskScore}%`;
        
        // Update risk label
        const riskLabel = document.getElementById('riskLabel');
        if (analysis.riskLevel === 'LOW') {
            riskLabel.textContent = 'Low risk - User appears legitimate';
            riskLabel.style.color = '#28a745';
        } else if (analysis.riskLevel === 'MEDIUM') {
            riskLabel.textContent = 'Medium risk - Some suspicious activity';
            riskLabel.style.color = '#fd7e14';
        } else if (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'CRITICAL') {
            riskLabel.textContent = 'High risk - Suspicious behavior detected';
            riskLabel.style.color = '#dc3545';
        }

        // Update fraud status
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        if (analysis.riskLevel === 'LOW') {
            statusIcon.textContent = '🟢';
            statusText.textContent = 'User appears legitimate';
        } else if (analysis.riskLevel === 'MEDIUM') {
            statusIcon.textContent = '🟡';
            statusText.textContent = 'Some suspicious activity detected';
        } else {
            statusIcon.textContent = '🔴';
            statusText.textContent = 'High risk behavior detected';
        }

        // Update authenticity checks
        this.updateAuthenticityChecks(analysis);
        
        // Update status
        this.updateStatus(`Live analysis: ${analysis.riskLevel} risk (${riskScore}%)`, 'connected');
    }

    updateAuthenticityChecks(analysis) {
        const checksContainer = document.getElementById('authenticityChecks');
        let checksHtml = '';

        // Device fingerprint check
        if (analysis.riskFactors && analysis.riskFactors.device) {
            const deviceScore = Math.round(analysis.riskFactors.device.score * 100);
            checksHtml += `
                <div class="check-item">
                    <span class="check-label">Device Fingerprint:</span>
                    <span class="check-value ${deviceScore > 70 ? 'good' : 'suspicious'}">${deviceScore}%</span>
                </div>
            `;
        }

        // Location check
        if (analysis.riskFactors && analysis.riskFactors.location) {
            const locationScore = Math.round(analysis.riskFactors.location.score * 100);
            checksHtml += `
                <div class="check-item">
                    <span class="check-label">Location:</span>
                    <span class="check-value ${locationScore > 70 ? 'good' : 'suspicious'}">${locationScore}%</span>
                </div>
            `;
        }

        // Behavior check
        if (analysis.riskFactors && analysis.riskFactors.behavior) {
            const behaviorScore = Math.round(analysis.riskFactors.behavior.score * 100);
            checksHtml += `
                <div class="check-item">
                    <span class="check-label">Behavior Pattern:</span>
                    <span class="check-value ${behaviorScore > 70 ? 'good' : 'suspicious'}">${behaviorScore}%</span>
                </div>
            `;
        }

        // Network check
        if (analysis.riskFactors && analysis.riskFactors.network) {
            const networkScore = Math.round(analysis.riskFactors.network.score * 100);
            checksHtml += `
                <div class="check-item">
                    <span class="check-label">Network:</span>
                    <span class="check-value ${networkScore > 70 ? 'good' : 'suspicious'}">${networkScore}%</span>
                </div>
            `;
        }

        // Timing check
        if (analysis.riskFactors && analysis.riskFactors.timing) {
            const timingScore = Math.round(analysis.riskFactors.timing.score * 100);
            checksHtml += `
                <div class="check-item">
                    <span class="check-label">Timing:</span>
                    <span class="check-value ${timingScore > 70 ? 'good' : 'suspicious'}">${timingScore}%</span>
                </div>
            `;
        }

        checksContainer.innerHTML = checksHtml;
    }

    calculateBehaviorScore() {
        if (!this.currentBehaviorData) return 50;
        
        let score = 50; // Base score
        
        // Adjust based on typing pattern
        if (this.currentBehaviorData.typingPattern === 'Normal') score += 20;
        else if (this.currentBehaviorData.typingPattern.includes('Suspicious')) score -= 30;
        
        // Adjust based on mouse activity
        if (this.currentBehaviorData.mouseActivity === 'Normal') score += 15;
        else if (this.currentBehaviorData.mouseActivity.includes('Suspicious')) score -= 20;
        
        // Adjust based on page interaction
        if (this.currentBehaviorData.pageInteraction === 'Normal') score += 15;
        else if (this.currentBehaviorData.pageInteraction.includes('Suspicious')) score -= 20;
        
        return Math.max(0, Math.min(100, score));
    }

    testDataUpdate() {
        console.log('Popup: Testing data update...');
        
        // Test with sample data
        const testData = {
            clicks: 5,
            keystrokes: 20,
            mouseMovements: 50,
            scrolls: 3,
            sessionDuration: 30,
            typingPattern: 'Normal',
            mouseActivity: 'Normal',
            pageInteraction: 'Normal'
        };
        
        console.log('Popup: Testing with sample data:', testData);
        this.updateBehaviorMetricsFromData(testData);
        
        // Also test getting data from background
        this.getBehaviorDataFromBackground();
    }

    // Cleanup method to stop all timers
    cleanup() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.fraudAnalysisInterval) {
            clearInterval(this.fraudAnalysisInterval);
            this.fraudAnalysisInterval = null;
        }
        if (this.liveDisplayTimer) {
            clearInterval(this.liveDisplayTimer);
            this.liveDisplayTimer = null;
        }
        console.log('Popup: Cleaned up all timers');
    }




    performPassiveFraudAnalysis(transaction) {
        const riskScore = Math.round(transaction.riskScore * 100);
        const riskLevel = transaction.riskLevel;
        
        // Update risk meter
        this.updateRiskMeter(riskScore, riskLevel);
        
        // Perform authenticity checks
        const authenticityChecks = this.performAuthenticityChecks(transaction);
        this.displayAuthenticityChecks(authenticityChecks);
        
        // Show fraud status (no approval/deny buttons)
        this.updateFraudStatus(riskScore, authenticityChecks);
    }

    updateRiskMeter(riskScore, riskLevel) {
        document.getElementById('riskPercentage').textContent = `${riskScore}%`;
        document.getElementById('riskFill').style.width = `${riskScore}%`;
        
        let riskLabel = 'LOW RISK';
        if (riskScore >= 70) riskLabel = 'HIGH RISK';
        else if (riskScore >= 40) riskLabel = 'MEDIUM RISK';
        
        document.getElementById('riskLabel').textContent = riskLabel;
    }

    updateFraudStatus(riskScore, authenticityChecks) {
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        const failedChecks = authenticityChecks.filter(check => check.status === 'fail').length;
        const warningChecks = authenticityChecks.filter(check => check.status === 'warning').length;
        
        if (riskScore >= 70 || failedChecks > 0) {
            statusIcon.textContent = '🔴';
            statusText.textContent = 'High fraud risk detected';
        } else if (riskScore >= 40 || warningChecks >= 3) {
            statusIcon.textContent = '🟡';
            statusText.textContent = 'Medium fraud risk - monitoring';
        } else {
            statusIcon.textContent = '🟢';
            statusText.textContent = 'User appears legitimate';
        }
    }

    performAuthenticityChecks(transaction) {
        const checks = [];
        
        // Device authenticity check
        const deviceCheck = this.checkDeviceAuthenticity(transaction);
        checks.push(deviceCheck);
        
        // Behavior authenticity check
        const behaviorCheck = this.checkBehaviorAuthenticity(transaction);
        checks.push(behaviorCheck);
        
        // Location authenticity check
        const locationCheck = this.checkLocationAuthenticity(transaction);
        checks.push(locationCheck);
        
        // Network authenticity check
        const networkCheck = this.checkNetworkAuthenticity(transaction);
        checks.push(networkCheck);
        
        // Timing authenticity check
        const timingCheck = this.checkTimingAuthenticity(transaction);
        checks.push(timingCheck);
        
        return checks;
    }

    checkDeviceAuthenticity(transaction) {
        const device = transaction.riskFactors.device;
        const isHeadless = device.details.isHeadless;
        const isKnownDevice = device.details.isKnownDevice;
        const hasDeviceFlags = device.details.flags.length > 0;
        
        let status = 'pass';
        let reason = 'Device appears legitimate';
        
        if (isHeadless) {
            status = 'fail';
            reason = 'Headless browser detected';
        } else if (!isKnownDevice && hasDeviceFlags) {
            status = 'warning';
            reason = 'Unknown device with suspicious characteristics';
        } else if (!isKnownDevice) {
            status = 'warning';
            reason = 'Unknown device';
        }
        
        return { name: 'Device Authenticity', status, reason };
    }

    checkBehaviorAuthenticity(transaction) {
        const behavior = transaction.riskFactors.behavior;
        const hasBehaviorFlags = behavior.details.flags.length > 0;
        const actionsPerMinute = behavior.details.actionsPerMinute;
        const sessionDuration = behavior.details.sessionDuration;
        
        let status = 'pass';
        let reason = 'Human-like behavior detected';
        
        if (hasBehaviorFlags) {
            status = 'fail';
            reason = 'Automated behavior detected';
        } else if (actionsPerMinute === 0 && sessionDuration < 10000) {
            status = 'warning';
            reason = 'Suspiciously low activity';
        } else if (actionsPerMinute > 100) {
            status = 'warning';
            reason = 'Unusually high activity';
        }
        
        return { name: 'Behavior Authenticity', status, reason };
    }

    checkLocationAuthenticity(transaction) {
        const location = transaction.riskFactors.location;
        const isHighRiskCountry = location.details.isHighRiskCountry;
        const isVPN = location.details.isVPN;
        const isVelocityAnomaly = location.details.isVelocityAnomaly;
        
        let status = 'pass';
        let reason = 'Location appears legitimate';
        
        if (isHighRiskCountry) {
            status = 'fail';
            reason = 'High-risk country detected';
        } else if (isVPN) {
            status = 'warning';
            reason = 'VPN usage detected';
        } else if (isVelocityAnomaly) {
            status = 'warning';
            reason = 'Unusual location pattern';
        }
        
        return { name: 'Location Authenticity', status, reason };
    }

    checkNetworkAuthenticity(transaction) {
        const network = transaction.riskFactors.network;
        const isKnownNetwork = network.details.isKnownNetwork;
        const hasNetworkFlags = network.details.flags.length > 0;
        
        let status = 'pass';
        let reason = 'Network appears legitimate';
        
        if (hasNetworkFlags) {
            status = 'warning';
            reason = 'Suspicious network characteristics';
        } else if (!isKnownNetwork) {
            status = 'warning';
            reason = 'Unknown network';
        }
        
        return { name: 'Network Authenticity', status, reason };
    }

    checkTimingAuthenticity(transaction) {
        const timing = transaction.riskFactors.timing;
        const hour = timing.details.hour;
        const hasTimingFlags = timing.details.flags.length > 0;
        
        let status = 'pass';
        let reason = 'Normal transaction timing';
        
        if (hasTimingFlags) {
            status = 'warning';
            reason = 'Unusual transaction timing';
        } else if (hour < 6 || hour > 22) {
            status = 'warning';
            reason = 'Transaction outside normal hours';
        }
        
        return { name: 'Timing Authenticity', status, reason };
    }

    displayAuthenticityChecks(checks) {
        const container = document.getElementById('authenticityChecks');
        container.innerHTML = '';
        
        checks.forEach(check => {
            const checkElement = document.createElement('div');
            checkElement.className = 'check-item';
            checkElement.innerHTML = `
                <span class="check-name">${check.name}</span>
                <span class="check-status ${check.status}">${check.reason}</span>
            `;
            container.appendChild(checkElement);
        });
    }

    displayRecentTransactions(transactions) {
        const container = document.getElementById('transactionsList');
        container.innerHTML = '';

        if (transactions.length === 0) {
            container.innerHTML = '<div class="transaction-item">No recent transactions</div>';
            return;
        }

        // Show last 5 transactions
        const recentTransactions = transactions
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);

        recentTransactions.forEach(transaction => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            
            const riskClass = transaction.riskLevel.toLowerCase();
            const riskScore = Math.round(transaction.riskScore * 100);
            
            item.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-amount">$${transaction.amount} ${transaction.currency}</div>
                    <div class="transaction-time">${new Date(transaction.timestamp).toLocaleString()}</div>
                </div>
                <div class="transaction-risk ${riskClass}">${riskScore}%</div>
            `;
            
            container.appendChild(item);
        });
    }

    showNoTransactions() {
        document.getElementById('riskPercentage').textContent = '0%';
        document.getElementById('riskFill').style.width = '0%';
        document.getElementById('riskLabel').textContent = 'No transactions to analyze';
        document.getElementById('authenticityChecks').innerHTML = '<div class="check-item"><span class="check-name">No data available</span><span class="check-status warning">No transactions found</span></div>';
        document.getElementById('statusIcon').textContent = '⏳';
        document.getElementById('statusText').textContent = 'Waiting for transaction data...';
    }

    updateStatus(message, type = '') {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }
}

// Initialize the fraud detection system when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new FraudDetectionSystem();
});