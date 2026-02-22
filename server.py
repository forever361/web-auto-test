"""
Web自动化测试工具 - 整合版
同时提供 HTTP API 和 WebSocket 服务 (端口5001)
"""
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from playwright.sync_api import sync_playwright
import base64

app = Flask(__name__)
app.config['SECRET_KEY'] = 'web-recorder-secret'
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# 存储连接的客户端
connected_clients = set()

@app.route('/')
def index():
    return send_file('recorder.html')

@app.route('/api/extension', methods=['GET'])
def download_extension():
    return send_file('extension.zip', as_attachment=True, download_name='web-recorder-extension.zip')

# WebSocket 事件
@socketio.on('connect')
def handle_connect():
    print('客户端连接:', request.sid)
    connected_clients.add(request.sid)
    emit('status', {'connected': True, 'clients': len(connected_clients)})

@socketio.on('disconnect')
def handle_disconnect():
    print('客户端断开:', request.sid)
    connected_clients.discard(request.sid)

@socketio.on('step')
def handle_step(data):
    """接收步骤并广播给所有客户端"""
    print('收到步骤:', data.get('action'))
    # 广播给所有客户端
    emit('newStep', data, broadcast=True)

@socketio.on('startRecording')
def handle_start(data):
    print('开始录制:', request.sid)
    emit('recordingStatus', {'recording': True, 'paused': False}, broadcast=True)

@socketio.on('stopRecording')
def handle_stop(data):
    print('停止录制:', request.sid)
    emit('recordingStatus', {'recording': False, 'paused': False}, broadcast=True)

@socketio.on('ping')
def handle_ping():
    emit('pong')

# API 路由
@app.route('/api/open', methods=['POST'])
def open_url():
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

# 接收扩展推送的步骤
@app.route('/api/push-step', methods=['POST'])
def push_step():
    """接收扩展推送的步骤"""
    data = request.json
    step_data = data.get('data', {})
    print('收到步骤:', step_data.get('action'))
    
    # 广播给所有Socket.IO客户端
    socketio.emit('newStep', step_data)
    
    return jsonify({'code': 200, 'message': 'ok'})

# 接收录制状态
@app.route('/api/recording-status', methods=['POST'])
def recording_status():
    """接收录制状态"""
    data = request.json
    print('录制状态:', data)
    
    # 广播给所有Socket.IO客户端
    socketio.emit('recordingStatus', data)
    
    return jsonify({'code': 200, 'message': 'ok'})

if __name__ == '__main__':
    print("启动 Web 自动化测试服务...")
    print("访问 http://119.91.23.169:5001")
    print("WebSocket: ws://119.91.23.169:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=False, allow_unsafe_werkzeug=True)
