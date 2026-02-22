// Chrome扩展 - 后台脚本
// 负责：HTTP推送步骤到服务器、状态管理

let recording = false;
let currentTabId = null;
const API_URL = 'http://119.91.23.169:5001';

// 发送步骤到服务器 (HTTP API)
function sendStep(step) {
  const data = {
    action: 'step',
    data: {
      ...step,
      timestamp: Date.now()
    }
  };
  
  fetch(API_URL + '/api/push-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(result => {
    console.log('[Background] Step sent:', result);
  })
  .catch(err => {
    console.error('[Background] Failed to send step:', err);
  });
}

// 发送录制状态
function sendRecordingStatus(status) {
  fetch(API_URL + '/api/recording-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(status)
  }).catch(err => console.error('[Background] Status send failed:', err));
}

// 广播状态给popup
function broadcastStatus(status) {
  chrome.runtime.sendMessage({action: 'status', status, recording}).catch(() => {});
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.action);
  
  if (message.action === 'startRecording') {
    recording = true;
    currentTabId = message.tabId;
    
    sendRecordingStatus({ recording: true, paused: false });
    
    // 通知content script开始录制
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {action: 'startRecording'}, (response) => {
        console.log('[Background] Content script response:', response);
        sendResponse({success: true, recording: true});
      });
    } else {
      sendResponse({success: false, error: 'No tab id'});
    }
    
    broadcastStatus('recording');
    return true; // 异步响应
  }
  
  else if (message.action === 'stopRecording') {
    recording = false;
    
    sendRecordingStatus({ recording: false, paused: false });
    
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {action: 'stopRecording'}, (response) => {
        console.log('[Background] Stop response:', response);
      });
    }
    
    broadcastStatus('stopped');
    sendResponse({success: true, recording: false});
    return true;
  }
  
  else if (message.action === 'getStatus') {
    sendResponse({
      recording,
      wsConnected: true  // HTTP模式总是连接
    });
    return true;
  }
  
  else if (message.action === 'step') {
    sendStep(message.data);
    sendResponse({success: true});
    return true;
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && recording && tabId === currentTabId) {
    chrome.tabs.sendMessage(tabId, {action: 'pageLoaded', url: tab.url}).catch(() => {});
  }
});

console.log('[Background] Extension loaded (HTTP mode)');
