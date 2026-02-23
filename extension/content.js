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
    updateFloatingUI(recording);
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
  panel.innerHTML = `
    <style>
      #web-recorder-float {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
      }
      #web-recorder-float .recorder-btn {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        font-size: 20px;
      }
      #web-recorder-float .recorder-btn.start {
        background: #e94560;
        color: white;
      }
      #web-recorder-float .recorder-btn.recording {
        background: #e94560;
        color: white;
        animation: pulse 1.5s infinite;
      }
      #web-recorder-float .recorder-panel {
        position: absolute;
        top: 60px;
        right: 0;
        background: white;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        display: none;
        min-width: 150px;
      }
      #web-recorder-float .recorder-panel.show {
        display: block;
      }
      #web-recorder-float .recorder-panel button {
        width: 100%;
        padding: 10px 16px;
        margin: 4px 0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      #web-recorder-float .recorder-panel .btn-start {
        background: #2ecc71;
        color: white;
      }
      #web-recorder-float .recorder-panel .btn-stop {
        background: #e94560;
        color: white;
      }
      #web-recorder-float .recorder-panel .btn-stop:hover {
        background: #c0392b;
      }
      #web-recorder-float .recorder-panel .status-text {
        text-align: center;
        padding: 8px;
        color: #333;
        font-weight: 500;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
    </style>
    <button class="recorder-btn start" id="floatToggleBtn">🎤</button>
    <div class="recorder-panel" id="floatPanel">
      <div class="status-text" id="floatStatus">点击开始录制</div>
      <button class="btn-start" id="floatStartBtn">▶ 开始录制</button>
      <button class="btn-stop" id="floatStopBtn" style="display:none;">⏹ 停止录制</button>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // 绑定事件
  const toggleBtn = document.getElementById('floatToggleBtn');
  const floatPanel = document.getElementById('floatPanel');
  const startBtn = document.getElementById('floatStartBtn');
  const stopBtn = document.getElementById('floatStopBtn');
  const statusText = document.getElementById('floatStatus');
  
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    floatPanel.classList.toggle('show');
  });
  
  // 点击其他地方关闭面板
  document.addEventListener('click', (e) => {
    if (!floatPanel.contains(e.target)) {
      floatPanel.classList.remove('show');
    }
  });
  
  // 开始录制
  startBtn.addEventListener('click', () => {
    recording = true;
    stepCount = 0;
    updateFloatingUI(true);
    chrome.runtime.sendMessage({action: 'startRecording'}, () => {});
    panel.classList.remove('show');
  });
  
  // 停止录制
  stopBtn.addEventListener('click', () => {
    recording = false;
    updateFloatingUI(false);
    chrome.runtime.sendMessage({action: 'stopRecording'}, () => {});
    panel.classList.remove('show');
  });
  
  console.log('[Content] Floating panel created');
}

// 更新悬浮窗状态
function updateFloatingUI(isRecording) {
  const toggleBtn = document.getElementById('floatToggleBtn');
  const startBtn = document.getElementById('floatStartBtn');
  const stopBtn = document.getElementById('floatStopBtn');
  const statusText = document.getElementById('floatStatus');
  
  if (isRecording) {
    toggleBtn.classList.remove('start');
    toggleBtn.classList.add('recording');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    statusText.textContent = '🔴 录制中...';
  } else {
    toggleBtn.classList.remove('recording');
    toggleBtn.classList.add('start');
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    statusText.textContent = '点击开始录制';
  }
}

// 初始化
console.log('[Content] Script loaded');
createFloatingPanel();
setupListeners();
