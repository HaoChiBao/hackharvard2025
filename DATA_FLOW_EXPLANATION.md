# 📊 Data Flow Explanation - Where Data Comes From

## 🔄 **Complete Data Flow:**

```
User Interaction → Content Script → Background Script → Popup → API → Fraud Analysis
```

### **1. Raw Behavior Data (Content Script)**
- **Source**: Content script tracks user interactions on web pages
- **Data**: Clicks, keystrokes, mouse movements, scrolls, typing patterns
- **Location**: `extension/app/content/content.js`
- **Console Messages**: 
  - "Click detected! Total clicks: X"
  - "Keystroke detected! Total keystrokes: X"
  - "Mouse movement detected! Total movements: X"
  - "Scroll detected! Total scrolls: X"

### **2. Data Aggregation (Background Script)**
- **Source**: Aggregates data from all content scripts across all tabs
- **Data**: Global behavior data, session duration, analysis
- **Location**: `extension/background/background.js`
- **Console Messages**: "Updated global behavior data: {...}"

### **3. Live Display (Popup)**
- **Source**: Gets data from background script every second
- **Data**: Real-time behavior metrics, raw data display
- **Location**: `extension/app/popup/popup.js`
- **Console Messages**: "Received behavior data from background: {...}"

### **4. Fraud Analysis (API)**
- **Source**: Sends behavior data to fraud detection API every 5 seconds
- **Data**: Risk score, risk level, authenticity checks, fraud flags
- **Location**: `extension/app/popup/popup.js` → `http://localhost:3001/api/fraud/analyze`
- **Console Messages**: "Performing live fraud analysis...", "Fraud analysis result: {...}"

## 🧪 **Testing Each Component:**

### **Test 1: Raw Behavior Data (Content Script)**
1. Open debug page: `debug-extension.html`
2. Open Chrome DevTools → Console
3. Interact with page (click, type, move mouse, scroll)
4. **Look for**: "Click detected!", "Keystroke detected!", "Mouse movement detected!", "Scroll detected!"

### **Test 2: Data Aggregation (Background Script)**
1. After interacting with page
2. **Look for**: "Updated global behavior data: {clicks: X, keystrokes: X, ...}"

### **Test 3: Live Display (Popup)**
1. Open extension popup
2. Enter API key: `sk_ee57621661afbed530ab5e50070ea97cef7104a30f70eeac11736ac6d380b290`
3. Click "Activate System"
4. **Look for**: "Received behavior data from background: {...}"
5. **Check**: Raw data should update in popup (clicks, keystrokes, etc.)

### **Test 4: Fraud Analysis (API)**
1. With popup open and system activated
2. **Look for**: "Performing live fraud analysis..."
3. **Look for**: "Fraud analysis result: {...}"
4. **Check**: Risk score, authenticity checks should update every 5 seconds

## 🔍 **Debugging Steps:**

### **If Raw Behavior Data Not Showing:**
- Check content script is loaded: "Fraud Tracker: content.js loaded"
- Check event listeners: "Fraud Tracker: Behavior tracking started successfully"
- Interact with page and look for detection messages

### **If Data Not Aggregating:**
- Check background script: "Updated global behavior data: {...}"
- Check message passing errors: "Failed to send click data to background"

### **If Popup Not Updating:**
- Check popup communication: "Received behavior data from background: {...}"
- Check API key is correct
- Check API server is running

### **If API Analysis Not Working:**
- Check API calls: "Performing live fraud analysis..."
- Check API response: "Fraud analysis result: {...}"
- Check API server: `curl http://localhost:3001/health`

## 📊 **Expected Console Output:**

```
# Content Script (Raw Behavior)
Fraud Tracker: content.js loaded on [URL]
Fraud Tracker: Behavior tracking started successfully
Click detected! Total clicks: 1
Keystroke detected! Total keystrokes: 1
Mouse movement detected! Total movements: 10
Scroll detected! Total scrolls: 1

# Background Script (Data Aggregation)
Updated global behavior data: {clicks: 1, keystrokes: 1, mouseMovements: 10, scrolls: 1, ...}

# Popup (Live Display)
Received behavior data from background: {clicks: 1, keystrokes: 1, ...}

# API (Fraud Analysis)
Performing live fraud analysis...
Fraud analysis result: {success: true, data: {riskScore: 0.31, riskLevel: "MEDIUM", ...}}
```

## 🎯 **Answer to Your Question:**

- **Raw behavior data** (clicks, keystrokes, mouse movements, scrolls) comes from the **content script**
- **Fraud analysis** (risk scores, authenticity checks) comes from the **API**
- The content script tracks your behavior, sends it to the API, and the API analyzes it for fraud

The mouse movement and scroll tracking should now work with the added console logging! 🚀
