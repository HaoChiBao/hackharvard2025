# 🔧 Console Debug Steps - Raw Behavior Data Not Showing

## 🚨 **Problem**: Console is not showing raw behavior data

## ✅ **Fixes Applied:**

1. **Enhanced Content Script Debugging** - Added detailed console logging
2. **Fixed Manifest** - Removed problematic loadFonts.js, changed to document_start
3. **Added Test Function** - Interactive test button on debug page
4. **Improved Error Handling** - Better error catching and reporting

## 🧪 **Step-by-Step Debugging:**

### **Step 1: Load Extension**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `/Users/wj/Documents/hackharvard/hackharvard2025/extension`
5. **Check for errors** in the extension details

### **Step 2: Open Debug Page**
1. Open `file:///Users/wj/Documents/hackharvard/hackharvard2025/debug-extension.html`
2. Open Chrome DevTools (F12)
3. Go to Console tab
4. **Clear the console** (click the clear button)

### **Step 3: Check Initial Messages**
You should see these messages immediately when the page loads:

```
Debug page loaded at: [timestamp]
Fraud Tracker: content.js loaded on file:///Users/wj/Documents/hackharvard/hackharvard2025/debug-extension.html
Fraud Tracker: Chrome runtime available: true
Fraud Tracker: Document ready state: [state]
Fraud Tracker: MAIN - Starting behavior tracking...
Fraud Tracker: MAIN - Document ready state: [state]
Fraud Tracker: MAIN - Window loaded: [true/false]
Fraud Tracker: startBehaviorTracking() called
Fraud Tracker: Document object available: true
Fraud Tracker: Adding event listeners...
Fraud Tracker: Behavior tracking started successfully
Fraud Tracker: Event listeners added for clicks, keystrokes, mousemove, scroll
Fraud Tracker: Current behavior data: {clicks: 0, keystrokes: 0, ...}
Chrome extension APIs available
```

### **Step 4: Test Behavior Tracking**
1. **Click the "Test Behavior Tracking" button** on the debug page
2. **Click any button** on the page
3. **Type in any text field**
4. **Move your mouse around**
5. **Scroll up and down**

### **Step 5: Check for Behavior Messages**
You should see these messages when you interact:

```
Click detected! Total clicks: 1
Keystroke detected! Total keystrokes: 1
Updated global behavior data: {clicks: 1, keystrokes: 1, ...}
```

## 🔍 **Troubleshooting:**

### **If you see NO "Fraud Tracker:" messages:**
1. **Extension not loaded properly:**
   - Go to `chrome://extensions/`
   - Check if extension is enabled
   - Look for error messages
   - Try reloading the extension

2. **Content script not running:**
   - Check if extension has permission to access the page
   - Try on a different website (like google.com)
   - Check the extension's "Inspect views" for errors

### **If you see "Fraud Tracker:" messages but NO behavior detection:**
1. **Event listeners not working:**
   - Check if document is ready
   - Look for JavaScript errors
   - Try the test button on the debug page

2. **Message passing issues:**
   - Check for "Failed to send click data to background" messages
   - Look for background script errors

### **If you see behavior detection but NO data in popup:**
1. **Background script issues:**
   - Check for "Updated global behavior data" messages
   - Look for background script errors

2. **Popup communication issues:**
   - Check for "Requesting behavior data from background script" messages
   - Look for "Received behavior data from background" messages

## 🚀 **Quick Test:**

1. **Load extension** → Should see "Fraud Tracker: content.js loaded"
2. **Open debug page** → Should see all initialization messages
3. **Click "Test Behavior Tracking"** → Should show test results
4. **Click/type on page** → Should see "Click detected!" / "Keystroke detected!"
5. **Open popup** → Should see live data updating

## 📊 **Expected Console Output:**

```
Debug page loaded at: 2025-01-04T17:45:00.000Z
Fraud Tracker: content.js loaded on file:///Users/wj/Documents/hackharvard/hackharvard2025/debug-extension.html
Fraud Tracker: Chrome runtime available: true
Fraud Tracker: Document ready state: loading
Fraud Tracker: MAIN - Starting behavior tracking...
Fraud Tracker: MAIN - Document ready state: loading
Fraud Tracker: MAIN - Window loaded: false
Fraud Tracker: startBehaviorTracking() called
Fraud Tracker: Document object available: true
Fraud Tracker: Adding event listeners...
Fraud Tracker: Behavior tracking started successfully
Fraud Tracker: Event listeners added for clicks, keystrokes, mousemove, scroll
Fraud Tracker: Current behavior data: {clicks: 0, keystrokes: 0, mouseMovements: 0, scrolls: 0, sessionStart: 1704390300000, typingPatterns: [], clickPatterns: []}
Chrome extension APIs available
```

**Then when you interact:**
```
Click detected! Total clicks: 1
Keystroke detected! Total keystrokes: 1
Updated global behavior data: {clicks: 1, keystrokes: 1, mouseMovements: 0, scrolls: 0, sessionDuration: 5}
```

If you see all these messages, the behavior tracking is working! 🎉
