// Chrome扩展 - 内容脚本
// 负责：监听页面操作、生成选择器、收集步骤

let recording = false;
let stepCount = 0;

// 选择器生成器
const LocatorGenerator = {
  // 生成唯一选择器
  generate(element) {
    const selectors = [];
    
    // 1. ID选择器
    if (element.id) {
      selectors.push({type: 'id', value: '#' + element.id, score: 100});
    }
    
    // 2. name属性
    if (element.name) {
      selectors.push({type: 'name', value: `[name="${element.name}"]`, score: 90});
    }
    
    // 3. data-testid
    if (element.getAttribute('data-testid')) {
      selectors.push({type: 'data-testid', value: `[data-testid="${element.getAttribute('data-testid')}"]`, score: 85});
    }
    
    // 4. data-test
    if (element.getAttribute('data-test')) {
      selectors.push({type: 'data-test', value: `[data-test="${element.getAttribute('data-test')}"]`, score: 85});
    }
    
    // 5. data-cy
    if (element.getAttribute('data-cy')) {
      selectors.push({type: 'data-cy', value: `[data-cy="${element.getAttribute('data-cy')}"]`, score: 85});
    }
    
    // 6. text选择器 (用于a, button, span等)
    const tagName = element.tagName.toLowerCase();
    if (['a', 'button', 'span', 'div', 'label'].includes(tagName)) {
      const text = element.textContent.trim().substring(0, 50);
      if (text) {
        selectors.push({type: 'text', value: `${tagName}:text("${text}")`, score: 70});
        selectors.push({type: 'contains', value: `${tagName}:has-text("${text}")`, score: 65});
      }
    }
    
    // 7. placeholder
    if (element.placeholder) {
      selectors.push({type: 'placeholder', value: `[placeholder="${element.placeholder}"]`, score: 60});
    }
    
    // 8. href (用于a标签)
    if (element.href) {
      selectors.push({type: 'href', value: `a[href="${element.href}"]`, score: 55});
    }
    
    // 9. type (用于input)
    if (element.type && element.type !== 'text') {
      selectors.push({type: 'type', value: `input[type="${element.type}"]`, score: 50});
    }
    
    // 10. CSS路径
    const cssPath = this.getCssPath(element);
    if (cssPath) {
      selectors.push({type: 'css', value: cssPath, score: 30});
    }
    
    // 排序返回最佳选择器
    selectors.sort((a, b) => b.score - a.score);
    return selectors;
  },
  
  // 获取CSS路径
  getCssPath(element) {
    if (element.id) return '#' + element.id;
    
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      } else {
        let sib = current, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.tagName === current.tagName) nth++;
        }
        if (nth > 1) selector += ':nth-of-type('+nth+')';
      }
      path.unshift(selector);
      current = current.parentNode;
    }
    return path.join(' > ');
  },
  
  // 获取元素信息
  getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const selectors = this.generate(element);
    
    return {
      tag: element.tagName.toLowerCase(),
      text: element.textContent.trim().substring(0, 100),
      id: element.id || '',
      name: element.name || '',
      class: element.className || '',
      placeholder: element.placeholder || '',
      href: element.href || '',
      value: element.value || '',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      selectors: selectors.map(s => s.value)
    };
  }
};

// 发送步骤到background
function sendStep(action, data) {
  stepCount++;
  const step = {
    id: stepCount,
    action,
    ...data,
    url: window.location.href,
    title: document.title,
    timestamp: Date.now()
  };
  
  chrome.runtime.sendMessage({action: 'step', data: step}, (response) => {
    console.log('[Content] Step sent:', step.action, response);
  });
}

// 事件监听器
function setupListeners() {
  // 点击事件
  document.addEventListener('click', (e) => {
    if (!recording) return;
    
    const info = LocatorGenerator.getElementInfo(e.target);
    console.log('[Content] Click recorded:', info.selectors[0]);
    sendStep('click', {
      selector: info.selectors[0] || '',
      elementInfo: info
    });
  }, true);
  
  // 输入事件
  document.addEventListener('input', (e) => {
    if (!recording) return;
    if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.type === 'password') return;
    
    const info = LocatorGenerator.getElementInfo(e.target);
    console.log('[Content] Input recorded:', info.selectors[0], e.target.value);
    sendStep('input', {
      selector: info.selectors[0] || '',
      value: e.target.value,
      elementInfo: info
    });
  }, true);
  
  // 选择事件
  document.addEventListener('change', (e) => {
    if (!recording) return;
    
    if (e.target.tagName === 'SELECT') {
      const info = LocatorGenerator.getElementInfo(e.target);
      console.log('[Content] Select recorded:', info.selectors[0], e.target.value);
      sendStep('select', {
        selector: info.selectors[0] || '',
        value: e.target.value,
        elementInfo: info
      });
    }
    
    // 复选框/单选框
    if (e.target.type === 'checkbox' || e.target.type === 'radio') {
      const info = LocatorGenerator.getElementInfo(e.target);
      console.log('[Content] Check recorded:', info.selectors[0], e.target.checked);
      sendStep('check', {
        selector: info.selectors[0] || '',
        checked: e.target.checked,
        elementInfo: info
      });
    }
  }, true);
  
  // 表单提交
  document.addEventListener('submit', (e) => {
    if (!recording) return;
    
    const info = LocatorGenerator.getElementInfo(e.target);
    console.log('[Content] Submit recorded');
    sendStep('submit', {
      selector: info.selectors[0] || '',
      elementInfo: info
    });
  }, true);
  
  // 页面导航监听
  let lastUrl = window.location.href;
  
  // MutationObserver监听URL变化（SPA）
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (recording) {
        console.log('[Content] Navigation recorded:', lastUrl);
        sendStep('navigate', {
          url: window.location.href,
          title: document.title
        });
      }
    }
  });
  
  if (document.body) {
    urlObserver.observe(document.body, {childList: true, subtree: true});
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      urlObserver.observe(document.body, {childList: true, subtree: true});
    });
  }
  
  // popstate监听（浏览器前进后退）
  window.addEventListener('popstate', () => {
    if (recording && window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[Content] Popstate recorded:', lastUrl);
      sendStep('navigate', {
        url: window.location.href,
        title: document.title
      });
    }
  });
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.action);
  
  if (message.action === 'startRecording') {
    recording = true;
    stepCount = 0;
    console.log('[Content] Recording started');
    updateFloatingUI(true);
    sendResponse({success: true, recording: true});
  }
  
  else if (message.action === 'stopRecording') {
    recording = false;
    console.log('[Content] Recording stopped');
    updateFloatingUI(false);
    sendResponse({success: true, recording: false});
  }
  
  else if (message.action === 'recordingStatus') {
    // 接收全局录制状态更新
    recording = message.recording;
    updateFloatingUI(recording, paused);
    sendResponse({success: true});
  }
  
  else if (message.action === 'step') {
    // 添加步骤到悬浮窗显示
    if (message.data) {
      addStepToFloat(message.data);
    }
    sendResponse({success: true});
  }
  
  else if (message.action === 'pageLoaded') {
    if (recording) {
      console.log('[Content] Page loaded:', message.url);
      sendStep('open', {
        url: message.url,
        title: document.title
      });
    }
    sendResponse({success: true});
  }
  
  return true;
});

// 创建悬浮窗
function createFloatingPanel() {
  // 如果已存在则不创建
  if (document.getElementById('web-recorder-float')) return;
  
  const panel = document.createElement('div');
  panel.id = 'web-recorder-float';
  panel.innerHTML = \`
    <style>
      #web-recorder-float {
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #333;
        user-select: none;
      }
      #web-recorder-float .float-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 32px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px 8px 0 0;
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        color: white;
        font-weight: 600;
      }
      #web-recorder-float .float-handle .title {
        font-size: 13px;
      }
      #web-recorder-float .float-handle .minimize-btn {
        cursor: pointer;
        opacity: 0.8;
        font-size: 16px;
        width: 20px;
        text-align: center;
      }
      #web-recorder-float .float-handle .minimize-btn:hover {
        opacity: 1;
      }
      #web-recorder-float .float-body {
        background: #1e1e1e;
        border-radius: 0 0 8px 8px;
        width: 320px;
        max-height: 400px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }
      #web-recorder-float .float-body.minimized {
        display: none;
      }
      #web-recorder-float .control-bar {
        display: flex;
        gap: 8px;
        padding: 12px;
        background: #2d2d2d;
        border-bottom: 1px solid #404040;
      }
      #web-recorder-float .control-bar button {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      #web-recorder-float .control-bar .btn-start { background: #10b981; color: white; }
      #web-recorder-float .control-bar .btn-start:hover { background: #059669; }
      #web-recorder-float .control-bar .btn-pause { background: #f59e0b; color: white; }
      #web-recorder-float .control-bar .btn-pause:hover { background: #d97706; }
      #web-recorder-float .control-bar .btn-pause.paused { background: #6366f1; }
      #web-recorder-float .control-bar .btn-stop { background: #ef4444; color: white; }
      #web-recorder-float .control-bar .btn-stop:hover { background: #dc2626; }
      #web-recorder-float .status-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #252525;
        border-bottom: 1px solid #404040;
        font-size: 12px;
        color: #aaa;
      }
      #web-recorder-float .status-bar .status-text {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #web-recorder-float .status-bar .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #666;
      }
      #web-recorder-float .status-bar .status-dot.recording {
        background: #ef4444;
        animation: pulse 1s infinite;
      }
      #web-recorder-float .status-bar .status-dot.paused { background: #f59e0b; }
      #web-recorder-float .status-bar .coords {
        font-family: monospace;
        font-size: 11px;
        color: #888;
      }
      #web-recorder-float .steps-container {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        background: #1a1a1a;
      }
      #web-recorder-float .step-item {
        background: #2d2d2d;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 6px;
        border-left: 3px solid #667eea;
      }
      #web-recorder-float .step-item.action-click { border-left-color: #3b82f6; }
      #web-recorder-float .step-item.action-input { border-left-color: #10b981; }
      #web-recorder-float .step-item.action-navigate { border-left-color: #8b5cf6; }
      #web-recorder-float .step-item .step-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      #web-recorder-float .step-item .step-action {
        background: #667eea;
        color: white;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
      }
      #web-recorder-float .step-item .step-time {
        font-size: 10px;
        color: #888;
      }
      #web-recorder-float .step-item .step-selector {
        font-family: monospace;
        font-size: 11px;
        color: #10b981;
        word-break: break-all;
        background: #1e1e1e;
        padding: 4px 8px;
        border-radius: 4px;
        margin-bottom: 4px;
      }
      #web-recorder-float .step-item .step-value {
        font-size: 11px;
        color: #f59e0b;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      #web-recorder-float .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #666;
      }
      #web-recorder-float .empty-state .icon {
        font-size: 40px;
        margin-bottom: 10px;
      }
    </style>
    <div class="float-handle">
      <span class="title">🎤 Web Recorder</span>
      <span class="minimize-btn" id="floatMinimizeBtn">−</span>
    </div>
    <div class="float-body" id="floatBody">
      <div class="control-bar">
        <button class="btn-start" id="floatStartBtn">▶ 开始</button>
        <button class="btn-pause" id="floatPauseBtn" style="display:none;">⏸ 暂停</button>
        <button class="btn-stop" id="floatStopBtn" style="display:none;">⏹ 停止</button>
      </div>
      <div class="status-bar">
        <div class="status-text">
          <span class="status-dot" id="statusDot"></span>
          <span id="statusText">等待录制</span>
        </div>
        <span class="coords" id="cursorCoords">x: 0, y: 0</span>
      </div>
      <div class="steps-container" id="stepsList">
        <div class="empty-state">
          <div class="icon">🎬</div>
          <div>点击"开始"按钮开始录制</div>
        </div>
      </div>
    </div>
  \`;
  
  document.body.appendChild(panel);
  
  // 拖动功能
  const handle = panel.querySelector('.float-handle');
  const floatBody = document.getElementById('floatBody');
  let isDragging = false;
  let dragOffsetX, dragOffsetY;
  
  handle.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('minimize-btn')) return;
    isDragging = true;
    dragOffsetX = e.clientX - panel.offsetLeft;
    dragOffsetY = e.clientY - panel.offsetTop;
    handle.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    const coordsEl = document.getElementById('cursorCoords');
    if (coordsEl) {
      coordsEl.textContent = \`x: \${e.clientX}, y: \${e.clientY}\`;
    }
    
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffsetX) + 'px';
    panel.style.top = (e.clientY - dragOffsetY) + 'px';
    panel.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
    handle.style.cursor = 'move';
  });
  
  // 最小化/展开
  const minimizeBtn = document.getElementById('floatMinimizeBtn');
  minimizeBtn.addEventListener('click', () => {
    floatBody.classList.toggle('minimized');
    minimizeBtn.textContent = floatBody.classList.contains('minimized') ? '+' : '−';
  });
  
  // 绑定按钮事件
  const startBtn = document.getElementById('floatStartBtn');
  const pauseBtn = document.getElementById('floatPauseBtn');
  const stopBtn = document.getElementById('floatStopBtn');
  
  startBtn.addEventListener('click', () => {
    recording = true;
    paused = false;
    stepCount = 0;
    steps = [];
    updateFloatingUI(true, false);
    chrome.runtime.sendMessage({action: 'startRecording'}, () => {});
  });
  
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    updateFloatingUI(recording, paused);
    chrome.runtime.sendMessage({
      action: paused ? 'pauseRecording' : 'resumeRecording'
    }, () => {});
  });
  
  stopBtn.addEventListener('click', () => {
    recording = false;
    paused = false;
    updateFloatingUI(false, false);
    chrome.runtime.sendMessage({action: 'stopRecording'}, () => {});
  });
  
  console.log('[Content] Floating panel created');
}

// 录制步骤存储
let steps = [];
let paused = false;

// 更新悬浮窗UI
function updateFloatingUI(isRecording, isPaused) {
  const startBtn = document.getElementById('floatStartBtn');
  const pauseBtn = document.getElementById('floatPauseBtn');
  const stopBtn = document.getElementById('floatStopBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  if (isRecording) {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    stopBtn.style.display = 'flex';
    
    if (isPaused) {
      statusDot.className = 'status-dot paused';
      statusText.textContent = '已暂停';
      pauseBtn.textContent = '▶ 继续';
    } else {
      statusDot.className = 'status-dot recording';
      statusText.textContent = '录制中';
      pauseBtn.textContent = '⏸ 暂停';
    }
  } else {
    startBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    statusDot.className = 'status-dot';
    statusText.textContent = '等待录制';
  }
}

// 添加步骤到悬浮窗
function addStepToFloat(step) {
  const container = document.getElementById('stepsList');
  if (!container) return;
  
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();
  
  const item = document.createElement('div');
  item.className = \`step-item action-\${step.action}\`;
  
  const time = new Date(step.timestamp || Date.now()).toLocaleTimeString();
  const selector = step.selector || '';
  const value = step.value || '';
  const elementInfo = step.elementInfo ? 
    \`\${step.elementInfo.tag}\${step.elementInfo.id ? '#' + step.elementInfo.id : ''}\` : '';
  
  item.innerHTML = \`
    <div class="step-header">
      <span class="step-action">\${step.action}</span>
      <span class="step-time">\${time}</span>
    </div>
    <div class="step-selector">\${selector}</div>
    \${value ? \`<div class="step-value">值: \${value}</div>\` : ''}
    \${elementInfo ? \`<div class="step-element-info" style="font-size:10px;color:#666;margin-top:4px;">\${elementInfo}</div>\` : ''}
  \`;
  
  container.insertBefore(item, container.firstChild);
  
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// 初始化
console.log('[Content] Script loaded');

// 延迟创建悬浮窗，等待 DOM 准备好
function initFloatingPanel() {
  if (document.body) {
    createFloatingPanel();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createFloatingPanel();
    });
  }
}

initFloatingPanel();
setupListeners();
