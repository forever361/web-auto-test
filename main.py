"""
Web自动化测试工具
基于 Playwright
"""
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from playwright.sync_api import sync_playwright
import base64

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return send_file('recorder.html')

@app.route('/api/extension', methods=['GET'])
def download_extension():
    """下载扩展"""
    return send_file('extension.zip', as_attachment=True, download_name='web-recorder-extension.zip')

@app.route('/api/open', methods=['POST'])
def open_url():
    """打开URL"""
    data = request.json
    url = data.get('url', 'https://example.com')
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            return jsonify({
                'code': 200,
                'data': {'title': page.title(), 'url': page.url}
            })
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

@app.route('/api/screenshot', methods=['POST'])
def screenshot():
    """截图"""
    data = request.json
    url = data.get('url', 'https://example.com')
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            screenshot_bytes = page.screenshot()
            screenshot_base64 = base64.b64encode(screenshot_bytes).decode()
            return jsonify({
                'code': 200,
                'data': {'screenshot': screenshot_base64}
            })
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

@app.route('/api/click', methods=['POST'])
def click():
    """点击元素"""
    data = request.json
    url = data.get('url', 'https://example.com')
    selector = data.get('selector')
    
    if not selector:
        return jsonify({'code': 400, 'message': '需要selector参数'})
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            page.click(selector)
            return jsonify({'code': 200, 'message': '点击成功'})
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

@app.route('/api/input', methods=['POST'])
def input_text():
    """输入文本"""
    data = request.json
    url = data.get('url', 'https://example.com')
    selector = data.get('selector')
    value = data.get('value', '')
    
    if not selector:
        return jsonify({'code': 400, 'message': '需要selector参数'})
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            page.fill(selector, value)
            return jsonify({'code': 200, 'message': '输入成功'})
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

@app.route('/api/elements', methods=['POST'])
def get_elements():
    """获取页面元素"""
    data = request.json
    url = data.get('url', 'https://example.com')
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            
            elements = []
            clickables = page.query_selector_all('a, button, input[type="submit"], [onclick]')
            for el in clickables[:20]:
                try:
                    tag = el.evaluate('el => el.tagName')
                    text = el.evaluate('el => el.textContent.trim().substring(0, 50)')
                    id_attr = el.evaluate('el => el.id')
                    name_attr = el.evaluate('el => el.name')
                    class_attr = el.evaluate('el => el.className')
                    
                    elements.append({
                        'tag': tag.lower(),
                        'text': text,
                        'id': id_attr or '',
                        'name': name_attr or '',
                        'class': class_attr or '',
                    })
                except:
                    pass
            
            return jsonify({
                'code': 200,
                'data': {'elements': elements, 'count': len(elements)}
            })
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

@app.route('/api/execute', methods=['POST'])
def execute_actions():
    """执行一系列操作"""
    data = request.json
    actions = data.get('actions', [])
    url = data.get('url', 'https://example.com')
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        
        results = []
        
        try:
            page.goto(url, wait_until='networkidle', timeout=30000)
            results.append({'action': 'open', 'success': True, 'title': page.title()})
            
            for action in actions:
                action_type = action.get('type')
                try:
                    if action_type == 'click':
                        page.click(action.get('selector'))
                        results.append({'action': 'click', 'success': True})
                    elif action_type == 'input':
                        page.fill(action.get('selector'), action.get('value', ''))
                        results.append({'action': 'input', 'success': True})
                    elif action_type == 'wait':
                        import time
                        time.sleep(float(action.get('value', 1)))
                        results.append({'action': 'wait', 'success': True})
                    elif action_type == 'screenshot':
                        screenshot_bytes = page.screenshot()
                        screenshot_base64 = base64.b64encode(screenshot_bytes).decode()
                        results.append({'action': 'screenshot', 'success': True, 'screenshot': screenshot_base64})
                except Exception as e:
                    results.append({'action': action_type, 'success': False, 'error': str(e)})
            
            return jsonify({'code': 200, 'data': {'results': results}})
        except Exception as e:
            return jsonify({'code': 500, 'message': str(e)})
        finally:
            page.close()
            browser.close()

if __name__ == '__main__':
    print("启动 Web 自动化测试服务...")
    print("访问 http://119.91.23.169:5001")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
