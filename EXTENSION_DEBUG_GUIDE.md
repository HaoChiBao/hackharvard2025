# 🔧 Extension Debug Guide

## 🚨 **Issue: Behavior Detection Not Working**

The extension wasn't detecting mouse clicks, typing speed, etc. Here's what I fixed and how to test it.

## ✅ **Fixes Applied:**

### **1. Enhanced Content Script Debugging**
- Added console logging for all behavior tracking events
- Content script now starts immediately when loaded (not just on window load)
- Added error handling for message passing

### **2. Improved Background Script**
- Added detailed logging for behavior data updates
- Better error handling and data aggregation

### **3. Fixed Manifest Permissions**
- Added "tabs" permission for better tab access
- Ensured content scripts run on all URLs

### **4. Created Debug Test Page**
- `debug-extension.html` - Interactive test page with clear instructions

## 🧪 **How to Test:**

### **Step 1: Load Extension**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `/Users/wj/Documents/hackharvard/hackharvard2025/extension`

### **Step 2: Open Debug Page**
1. Open `file:///Users/wj/Documents/hackharvard/hackharvard2025/debug-extension.html`
2. Open Chrome DevTools (F12)
3. Go to Console tab

### **Step 3: Check Console Messages**
You should see these messages in the console:

```
Fraud Tracker: content.js loaded on file:///Users/wj/Documents/hackharvard/hackharvard2025/debug-extension.html
Starting behavior tracking...
Behavior tracking started
```

### **Step 4: Test Behavior Tracking**
1. **Click buttons** → Look for: `Click detected! Total clicks: 1`
2. **Type in text fields** → Look for: `Keystroke detected! Total keystrokes: 1`
3. **Move mouse around** → Look for mouse movement tracking
4. **Scroll up/down** → Look for scroll tracking

### **Step 5: Test Extension Popup**
1. Open the extension popup
2. Enter API key: `sk_ee57621661afbed530ab5e50070ea97cef7104a30f70eeac11736ac6d380b290`
3. Click "Activate System"
4. Watch for:
   - Session duration counting up
   - Raw behavior data updating
   - Console messages: "Requesting behavior data from background script"
   - Console messages: "Received behavior data from background: {...}"

## 🔍 **Debugging Steps:**

### **If No Console Messages:**
1. **Check if extension is loaded:**
   - Go to `chrome://extensions/`
   - Make sure extension is enabled
   - Check for any error messages

2. **Check if content script is running:**
   - Look for "Fraud Tracker: content.js loaded" message
   - If missing, reload the extension

3. **Check permissions:**
   - Make sure extension has access to the page
   - Try on a different website (like google.com)

### **If Behavior Not Detected:**
1. **Check console for errors:**
   - Look for "Failed to send click data to background" messages
   - Check for any JavaScript errors

2. **Test on different page:**
   - Try the debug page: `debug-extension.html`
   - Try a regular website like google.com

3. **Check background script:**
   - Look for "Updated global behavior data" messages
   - Check if background script is receiving data

### **If Popup Shows No Data:**
1. **Check API key:**
   - Make sure you're using the correct API key
   - Test API key with: `curl -X GET http://localhost:3001/api/merchants/data -H "X-API-Key: YOUR_KEY"`

2. **Check API server:**
   - Make sure API server is running (`npm start` in `/api` folder)
   - Test with: `curl http://localhost:3001/health`

3. **Check console messages:**
   - Look for "Requesting behavior data from background script"
   - Look for "Received behavior data from background"

## 📊 **Expected Behavior:**

### **Console Messages:**
```
Fraud Tracker: content.js loaded on [URL]
Starting behavior tracking...
Behavior tracking started
Click detected! Total clicks: 1
Keystroke detected! Total keystrokes: 1
Updated global behavior data: {clicks: 1, keystrokes: 1, ...}
Requesting behavior data from background script
Received behavior data from background: {...}
```

### **Extension Popup:**
- Session duration counting up every second
- Raw behavior data (clicks, keystrokes, etc.) updating
- Fraud analysis running every 5 seconds
- Risk score and authenticity checks updating

## 🚀 **Quick Test:**

1. **Load extension** → Should see "Fraud Tracker: content.js loaded"
2. **Open debug page** → Should see behavior tracking messages
3. **Click/type on page** → Should see "Click detected!" / "Keystroke detected!"
4. **Open popup** → Should see live data updating

If all steps work, the extension is properly detecting behavior! 🎉
