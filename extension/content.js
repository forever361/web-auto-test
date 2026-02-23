// Chrome扩展 - 内容脚本
// 负责：监听页面操作、生成选择器、收集步骤

let recording = false;
let stepCount = 0;
let paused = false;
let steps = [];

// 选择器生成器
const LocatorGenerator = {
  generate(element) {
    const selectors = [];
    
    if (element.id) {
      selectors.push({type: 'id', value: '#' + element.id, score: 100});
    }
    if (element.name) {
      selectors.push({type: 'name', value: '[name="' + element.name + '"]', score: 90});
    }
    if (element.getAttribute('data-testid')) {
      selectors.push({type: 'data-testid', value: '[data-testid="' + element.getAttribute('data-testid') + '"]', score: 85});
    }
    if (element.getAttribute('data-test')) {
      selectors.push({type: 'data-test', value: '[data-test="' + element.getAttribute('data-test') + '"]', score: 85});
    }
    if (element.getAttribute('data-cy')) {
      selectors.push({type: 'data-cy', value: '[data-cy="' + element.getAttribute('data-cy') + '"]', score: 85});
    }
    
    const tagName = element.tagName.toLowerCase();
    if (['a', 'button', 'span', 'div', 'label'].includes(tagName)) {
      const text = element.textContent.trim().substring(0, 50);
      if (text) {
        selectors.push({type: 'text', value: tagName + ':text("' + text + '")', score: 70});
        selectors.push({type: 'contains', value: tagName + ':has-text("' + text + '")', score: 65});
      }
    }
    
    if (element.placeholder) {
      selectors.push({type: 'placeholder', value: '[placeholder="' + element.placeholder + '"]', score: 60});
    }
    if (element.href) {
      selectors.push({type: 'href', value: 'a[href="' + element.href + '"]', score: 55});
    }
    if (element.type && element.type !== 'text') {
      selectors.push({type: 'type', value: 'input[type="' + element.type + '"]', score: 50});
    }
    
    const cssPath = this.getCssPath(element);
    if (cssPath) {
      selectors.push({type: 'css', value: cssPath, score: 30});
    }
    
    selectors.sort((a, b) => b.score - a.score);
    return selectors;
  },
  
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
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      selectors: selectors.map(function(s) { return s.value; })
    };
  }
};

function sendStep(action, data) {
  stepCount++;
  const step = {
    id: stepCount,
    action: action,
    url: window.location.href,
    title: document.title,
    timestamp: Date.now()
  };
  Object.assign(step, data);
  
  chrome.runtime.sendMessage({action: 'step', data: step}, function(response) {
    console.log('[Content] Step sent:', step.action);
  });
}

function setupListeners() {
  document.addEventListener('click', function(e) {
    if (!recording) return;
    
    const info = LocatorGenerator.getElementInfo(e.target);
    console.log('[Content] Click recorded:', info.selectors[0]);
    sendStep('click', {
      selector: info.selectors[0] || '',
      elementInfo: info
    });
  }, true);
  
  document.addEventListener('input', function(e) {
    if (!recording) return;
    if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.type === 'password') return;
    
    const info = LocatorGenerator.getElementInfo(e.target);
    sendStep('input', {
      selector: info.selectors[0] || '',
      value: e.target.value,
      elementInfo: info
    });
  }, true);
  
  document.addEventListener('change', function(e) {
    if (!recording) return;
    
    if (e.target.tagName === 'SELECT') {
      const info = LocatorGenerator.getElementInfo(e.target);
      sendStep('select', {
        selector: info.selectors[0] || '',
        value: e.target.value,
        elementInfo: info
      });
    }
    
    if (e.target.type === 'checkbox' || e.target.type === 'radio') {
      const info = LocatorGenerator.getElementInfo(e.target);
      sendStep('check', {
        selector: info.selectors[0] || '',
        checked: e.target.checked,
        elementInfo: info
      });
    }
  }, true);
  
  document.addEventListener('submit', function(e) {
    if (!recording) return;
    const info = LocatorGenerator.getElementInfo(e.target);
    sendStep('submit', { selector: info.selectors[0] || '', elementInfo: info });
  }, true);
  
  let lastUrl = window.location.href;
  
  const urlObserver = new MutationObserver(function() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (recording) {
        sendStep('navigate', { url: window.location.href, title: document.title });
      }
    }
  });
  
  if (document.body) {
    urlObserver.observe(document.body, {childList: true, subtree: true});
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      urlObserver.observe(document.body, {childList: true, subtree: true});
    });
  }
  
  window.addEventListener('popstate', function() {
    if (recording && window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      sendStep('navigate', { url: window.location.href, title: document.title });
    }
  });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('[Content] Received message:', message.action);
  
  if (message.action === 'startRecording') {
    recording = true;
    paused = false;
    stepCount = 0;
    steps = [];
    console.log('[Content] Recording started');
    updateFloatingUI(true, false);
    sendResponse({success: true, recording: true});
  }
  else if (message.action === 'stopRecording') {
    recording = false;
    paused = false;
    console.log('[Content] Recording stopped');
    updateFloatingUI(false, false);
    sendResponse({success: true, recording: false});
  }
  else if (message.action === 'recordingStatus') {
    recording = message.recording;
    paused = message.paused || false;
    updateFloatingUI(recording, paused);
    sendResponse({success: true});
  }
  else if (message.action === 'step') {
    if (message.data) {
      addStepToFloat(message.data);
    }
    sendResponse({success: true });
  }
  else if (message.action === 'pageLoaded') {
    if (recording) {
      sendStep('open', { url: message.url, title: document.title });
    }
    sendResponse({success: true});
  }
  
  return true;
});

function createFloatingPanel() {
  if (document.getElementById('web-recorder-float')) return;
  
  var panel = document.createElement('div');
  panel.id = 'web-recorder-float';
  
  var html = '';
  html += '<style>';
  html += '#web-recorder-float { position: fixed; top: 100px; right: 20px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #333; user-select: none; }';
  html += '#web-recorder-float .float-handle { position: absolute; top: 0; left: 0; right: 0; height: 36px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0; cursor: move; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; color: white; font-weight: 600; box-sizing: border-box; }';
  html += '#web-recorder-float .control-bar { display: flex; gap: 6px; padding: 10px; background: #2d2d2d; border-bottom: 1px solid #404040; }';
  html += '#web-recorder-float .control-bar button { flex: 1; padding: 6px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }';
  html += '#web-recorder-float .float-handle .title { font-size: 13px; }';
  html += '#web-recorder-float .float-handle .minimize-btn { cursor: pointer; opacity: 0.8; font-size: 16px; width: 20px; text-align: center; }';
  html += '#web-recorder-float .control-bar { display: flex; gap: 8px; padding: 12px; background: #2d2d2d; border-bottom: 1px solid #404040; }';
  html += '#web-recorder-float .control-bar button { flex: 1; padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; }';
  html += '#web-recorder-float .control-bar .btn-start { background: #10b981; color: white; }';
  html += '#web-recorder-float .control-bar .btn-start:hover { background: #059669; }';
  html += '#web-recorder-float .control-bar .btn-pause { background: #f59e0b; color: white; }';
  html += '#web-recorder-float .control-bar .btn-pause:hover { background: #d97706; }';
  html += '#web-recorder-float .control-bar .btn-pause.paused { background: #6366f1; }';
  html += '#web-recorder-float .control-bar .btn-stop { background: #ef4444; color: white; }';
  html += '#web-recorder-float .control-bar .btn-stop:hover { background: #dc2626; }';
  html += '#web-recorder-float .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #252525; border-bottom: 1px solid #404040; font-size: 12px; color: #aaa; }';
  html += '#web-recorder-float .status-bar .status-text { display: flex; align-items: center; gap: 6px; }';
  html += '#web-recorder-float .status-bar .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }';
  html += '#web-recorder-float .status-bar .status-dot.recording { background: #ef4444; animation: pulse 1s infinite; }';
  html += '#web-recorder-float .status-bar .status-dot.paused { background: #f59e0b; }';
  html += '#web-recorder-float .status-bar .coords { font-family: monospace; font-size: 11px; color: #888; }';
  html += '#web-recorder-float .float-body { background: #1e1e1e; border-radius: 0 0 8px 8px; width: 300px; height: 450px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }';
  html += '#web-recorder-float .status-bar { flex-shrink: 0; }';
  html += '#web-recorder-float .steps-container { flex: 1; overflow-y: auto; padding: 8px; background: #1a1a1a; min-height: 150px; }';
  html += '#web-recorder-float .control-bar { flex-shrink: 0; }';
  html += '#web-recorder-float .step-item { background: #2d2d2d; border-radius: 4px; padding: 8px; margin-bottom: 4px; border-left: 3px solid #667eea; }';
  html += '#web-recorder-float .step-item.action-click { border-left-color: #3b82f6; }';
  html += '#web-recorder-float .step-item.action-input { border-left-color: #10b981; }';
  html += '#web-recorder-float .step-item.action-navigate { border-left-color: #8b5cf6; }';
  html += '#web-recorder-float .step-item .step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }';
  html += '#web-recorder-float .step-item .step-action { background: #667eea; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 500; text-transform: uppercase; }';
  html += '#web-recorder-float .step-item .step-time { font-size: 9px; color: #888; }';
  html += '#web-recorder-float .step-item .step-selector { font-family: monospace; font-size: 10px; color: #10b981; word-break: break-all; background: #1e1e1e; padding: 3px 6px; border-radius: 3px; margin-bottom: 3px; }';
  html += '#web-recorder-float .step-item .step-value { font-size: 10px; color: #f59e0b; }';
  html += '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }';
  html += '#web-recorder-float .empty-state { text-align: center; padding: 40px 20px; color: #666; }';
  html += '#web-recorder-float .empty-state .icon { font-size: 40px; margin-bottom: 10px; }';
  html += '</style>';
  html += '<div class="float-handle"><span class="title">🎤 Web Recorder</span><span class="minimize-btn" id="floatMinimizeBtn">−</span></div>';
  html += '<div class="float-body" id="floatBody">';
  html += '<div class="status-bar">';
  html += '<div class="status-text"><span class="status-dot" id="statusDot"></span><span id="statusText">等待录制</span></div>';
  html += '<span class="coords" id="cursorCoords">x: 0, y: 0</span>';
  html += '</div>';
  html += '<div class="steps-container" id="stepsList"></div>';
  html += '<div class="control-bar">';
  html += '<button class="btn-start" id="floatStartBtn">▶ 开始</button>';
  html += '<button class="btn-pause" id="floatPauseBtn" style="display:none;">暂停</button>';
  html += '<button class="btn-stop" id="floatStopBtn" style="display:none;">⏹ 停止</button>';
  html += '</div>';
  html += '</div>';
  
  panel.innerHTML = html;
  document.body.appendChild(panel);
  
  var handle = panel.querySelector('.float-handle');
  var floatBody = document.getElementById('floatBody');
  var isDragging = false;
  var dragOffsetX, dragOffsetY;
  
  handle.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('minimize-btn')) return;
    isDragging = true;
    dragOffsetX = e.clientX - panel.offsetLeft;
    dragOffsetY = e.clientY - panel.offsetTop;
    handle.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', function(e) {
    var coordsEl = document.getElementById('cursorCoords');
    if (coordsEl) {
      coordsEl.textContent = 'x: ' + e.clientX + ', y: ' + e.clientY;
    }
    
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffsetX) + 'px';
    panel.style.top = (e.clientY - dragOffsetY) + 'px';
    panel.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', function() {
    isDragging = false;
    handle.style.cursor = 'move';
  });
  
  var minimizeBtn = document.getElementById('floatMinimizeBtn');
  minimizeBtn.addEventListener('click', function() {
    floatBody.classList.toggle('minimized');
    minimizeBtn.textContent = floatBody.classList.contains('minimized') ? '+' : '−';
  });
  
  var startBtn = document.getElementById('floatStartBtn');
  var pauseBtn = document.getElementById('floatPauseBtn');
  var stopBtn = document.getElementById('floatStopBtn');
  
  startBtn.addEventListener('click', function() {
    recording = true;
    paused = false;
    stepCount = 0;
    steps = [];
    updateFloatingUI(true, false);
    chrome.runtime.sendMessage({action: 'startRecording'}, function() {});
  });
  
  pauseBtn.addEventListener('click', function() {
    paused = !paused;
    updateFloatingUI(recording, paused);
    chrome.runtime.sendMessage({action: paused ? 'pauseRecording' : 'resumeRecording'}, function() {});
  });
  
  stopBtn.addEventListener('click', function() {
    recording = false;
    paused = false;
    updateFloatingUI(false, false);
    chrome.runtime.sendMessage({action: 'stopRecording'}, function() {});
  });
  
  console.log('[Content] Floating panel created');
}

function updateFloatingUI(isRecording, isPaused) {
  var startBtn = document.getElementById('floatStartBtn');
  var pauseBtn = document.getElementById('floatPauseBtn');
  var stopBtn = document.getElementById('floatStopBtn');
  var statusDot = document.getElementById('statusDot');
  var statusText = document.getElementById('statusText');
  
  if (!startBtn || !pauseBtn || !stopBtn || !statusDot || !statusText) return;
  
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

function addStepToFloat(step) {
  var container = document.getElementById('stepsList');
  console.log('[Content] addStepToFloat called, container:', container);
  if (!container) return;
  
  var item = document.createElement('div');
  item.className = 'step-item action-' + step.action;
  
  var time = new Date(step.timestamp || Date.now()).toLocaleTimeString();
  var selector = step.selector || '';
  var value = step.value || '';
  var elementInfo = '';
  if (step.elementInfo) {
    elementInfo = step.elementInfo.tag;
    if (step.elementInfo.id) elementInfo += '#' + step.elementInfo.id;
  }
  
  var itemHtml = '<div class="step-header"><span class="step-action">' + step.action + '</span><span class="step-time">' + time + '</span></div>';
  itemHtml += '<div class="step-selector">' + selector + '</div>';
  if (value) itemHtml += '<div class="step-value">值: ' + value + '</div>';
  if (elementInfo) itemHtml += '<div class="step-element-info" style="font-size:10px;color:#666;margin-top:4px;">' + elementInfo + '</div>';
  
  item.innerHTML = itemHtml;
  container.appendChild(item);
  
  console.log('[Content] Step added to float, total items:', container.children.length);
  
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

console.log('[Content] Script loaded');

function initFloatingPanel() {
  // 请求显示悬浮窗的权限
  chrome.runtime.sendMessage({action: 'requestPanel'}, function(response) {
    if (response && response.showPanel) {
      if (document.body) {
        createFloatingPanel();
      } else {
        document.addEventListener('DOMContentLoaded', function() {
          createFloatingPanel();
        });
      }
    }
  });
}

initFloatingPanel();
setupListeners();
