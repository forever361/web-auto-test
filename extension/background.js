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
  
  // 发送到服务器
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
  
  // 只发送到悬浮窗所在的标签页
  chrome.storage.local.get(['panelTabId'], function(result) {
    if (result.panelTabId) {
      chrome.tabs.sendMessage(result.panelTabId, {action: 'step', data: step}).catch(() => {});
    }
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

// 广播状态给popup和content script
function broadcastStatus(status) {
  chrome.runtime.sendMessage({action: 'status', status, recording}).catch(() => {});
  
  // 只发送到悬浮窗所在的标签页
  chrome.storage.local.get(['panelTabId'], function(result) {
    if (result.panelTabId) {
      chrome.tabs.sendMessage(result.panelTabId, {
        action: 'recordingStatus',
        recording: recording
      }).catch(() => {});
    }
  });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.action);
  
  // 处理悬浮窗显示请求 - 只在第一个标签页显示
  if (message.action === 'requestPanel') {
    chrome.storage.local.get(['panelTabId'], function(result) {
      const existingTabId = result.panelTabId;
      
      // 如果没有记录或者记录的标签页已关闭，则当前标签页显示
      if (!existingTabId) {
        chrome.storage.local.set({panelTabId: sender.tab.id}, function() {
          sendResponse({showPanel: true});
        });
      } else {
        // 检查标签页是否还存在
        chrome.tabs.get(existingTabId, function(tab) {
          if (chrome.runtime.lastError || !tab) {
            // 标签页已关闭，重新设置
            chrome.storage.local.set({panelTabId: sender.tab.id}, function() {
              sendResponse({showPanel: true});
            });
          } else {
            sendResponse({showPanel: false});
          }
        });
      }
    });
    return true;
  }
  
  if (message.action === 'startRecording') {
    recording = true;
    currentTabId = message.tabId;
    
    sendRecordingStatus({ recording: true, paused: false });
    
    // 通知所有标签页开始录制
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {action: 'startRecording'}, (response) => {
          console.log('[Background] Notified tab to start recording:', tab.id);
        });
      });
    });
    
    broadcastStatus('recording');
    sendResponse({success: true, recording: true});
    return true;
  }
  
  else if (message.action === 'stopRecording') {
    recording = false;
    
    sendRecordingStatus({ recording: false, paused: false });
    
    // 通知所有标签页停止录制
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {action: 'stopRecording'}, (response) => {
          console.log('[Background] Notified tab to stop recording:', tab.id);
        });
      });
    });
    
    broadcastStatus('stopped');
    sendResponse({success: true, recording: false});
    return true;
  }
  
  else if (message.action === 'pauseRecording') {
    sendRecordingStatus({ recording: true, paused: true });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {action: 'recordingStatus', recording: true, paused: true}).catch(() => {});
      });
    });
    broadcastStatus('paused');
    sendResponse({success: true});
    return true;
  }
  
  else if (message.action === 'resumeRecording') {
    sendRecordingStatus({ recording: true, paused: false });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {action: 'recordingStatus', recording: true, paused: false}).catch(() => {});
      });
    });
    broadcastStatus('recording');
    sendResponse({success: true});
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
  if (changeInfo.status === 'complete') {
    // 如果正在录制，通知新页面开始录制
    if (recording) {
      chrome.tabs.sendMessage(tabId, {action: 'startRecording'}, (response) => {
        console.log('[Background] Notified new tab to start recording:', tabId);
      });
    }
  }
});

// 监听标签页激活
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (recording) {
    currentTabId = activeInfo.tabId;
    chrome.tabs.sendMessage(activeInfo.tabId, {action: 'startRecording'}, (response) => {
      console.log('[Background] Notified activated tab to start recording:', activeInfo.tabId);
    });
  }
});

console.log('[Background] Extension loaded (HTTP mode)');
