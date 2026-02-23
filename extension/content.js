// Chrome扩展 - 内容脚本
// 负责：监听页面操作、发送步骤到页面和background

let recording = false;
let stepCount = 0;
let paused = false;

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
  
  // 发送到 background
  chrome.runtime.sendMessage({action: 'step', data: step}, function(response) {});
  
  // 同时发送到页面，让页面原生悬浮窗显示
  window.postMessage({type: 'WEB_RECORDER_STEP', step: step}, '*');
}

function setupListeners() {
  document.addEventListener('click', function(e) {
    if (!recording) return;
    const info = LocatorGenerator.getElementInfo(e.target);
    sendStep('click', { selector: info.selectors[0] || '', elementInfo: info });
  }, true);
  
  document.addEventListener('input', function(e) {
    if (!recording) return;
    if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.type === 'password') return;
    const info = LocatorGenerator.getElementInfo(e.target);
    sendStep('input', { selector: info.selectors[0] || '', value: e.target.value, elementInfo: info });
  }, true);
  
  document.addEventListener('change', function(e) {
    if (!recording) return;
    if (e.target.tagName === 'SELECT') {
      const info = LocatorGenerator.getElementInfo(e.target);
      sendStep('select', { selector: info.selectors[0] || '', value: e.target.value, elementInfo: info });
    }
    if (e.target.type === 'checkbox' || e.target.type === 'radio') {
      const info = LocatorGenerator.getElementInfo(e.target);
      sendStep('check', { selector: info.selectors[0] || '', checked: e.target.checked, elementInfo: info });
    }
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
  }
}

// 创建简单的悬浮按钮
function createFloatBtn() {
  if (document.getElementById('recorder-float-btn')) return;
  
  var btn = document.createElement('button');
  btn.id = 'recorder-float-btn';
  btn.style.cssText = 'position:fixed;top:100px;right:20px;z-index:999999;padding:10px 20px;background:#10b981;color:white;border:none;border-radius:20px;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  btn.textContent = '🎤 开始录制';
  
  document.body.appendChild(btn);
  
  btn.addEventListener('click', function() {
    if (!recording) {
      recording = true;
      stepCount = 0;
      btn.style.background = '#ef4444';
      btn.textContent = '⏹ 停止录制';
      chrome.runtime.sendMessage({action: 'startRecording'}, function() {});
    } else {
      recording = false;
      btn.style.background = '#10b981';
      btn.textContent = '🎤 开始录制';
      chrome.runtime.sendMessage({action: 'stopRecording'}, function() {});
    }
  });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'startRecording') {
    recording = true;
    var btn = document.getElementById('recorder-float-btn');
    if (btn) {
      btn.style.background = '#ef4444';
      btn.textContent = '⏹ 停止录制';
    }
    sendResponse({success: true});
  }
  else if (message.action === 'stopRecording') {
    recording = false;
    var btn = document.getElementById('recorder-float-btn');
    if (btn) {
      btn.style.background = '#10b981';
      btn.textContent = '🎤 开始录制';
    }
    sendResponse({success: true});
  }
  return true;
});

console.log('[Content] Extension loaded');
createFloatBtn();
setupListeners();
