// Popup脚本
let recording = false;
let wsConnected = false;

const statusEl = document.getElementById('status');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');

// 更新状态显示
function updateStatus(status, isRecording) {
  recording = isRecording;
  
  if (status === 'recording') {
    statusEl.textContent = '🔴 录制中...';
    statusEl.className = 'status recording';
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else if (status === 'stopped') {
    statusEl.textContent = '⏹ 已停止';
    statusEl.className = 'status stopped';
    btnStart.disabled = false;
    btnStop.disabled = true;
  } else if (status === 'connected') {
    wsConnected = true;
    statusEl.textContent = recording ? '🔴 录制中 (已连接)' : '⏹ 已连接';
  } else if (status === 'disconnected') {
    wsConnected = false;
    statusEl.textContent = recording ? '🔴 录制中 (未连接)' : '⚠️ 未连接';
    statusEl.className = 'status disconnected';
  }
}

// 获取当前标签页
async function getCurrentTab() {
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  return tabs[0];
}

// 开始录制
btnStart.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab.id) return;
  
  // 发送开始录制消息（content script 已经通过 content_scripts 自动注入）
  chrome.runtime.sendMessage({
    action: 'startRecording',
    tabId: tab.id
  }, (response) => {
    if (response && response.success) {
      updateStatus('recording', true);
    }
  });
});

// 停止录制
btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    action: 'stopRecording'
  }, (response) => {
    if (response && response.success) {
      updateStatus('stopped', false);
    }
  });
});

// 初始化状态
chrome.runtime.sendMessage({action: 'getStatus'}, (status) => {
  if (status) {
    updateStatus(status.recording ? 'recording' : 'stopped', status.recording);
  }
});

// 监听状态变化
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'status') {
    updateStatus(message.status, message.recording);
  }
});
