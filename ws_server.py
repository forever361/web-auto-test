"""
WebSocket服务器 - 转发扩展和前端之间的消息
"""
import asyncio
import threading
import websockets
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 存储连接的客户端
clients = set()
lock = threading.Lock()

async def ws_handler(websocket, path):
    """WebSocket处理器"""
    with lock:
        clients.add(websocket)
    print(f'客户端连接: {websocket.remote_address}, 当前连接数: {len(clients)}')
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                print(f'收到消息: {data}')
                
                msg_type = data.get('type')
                
                if msg_type == 'step':
                    step_data = data.get('data', {})
                    await broadcast({
                        'type': 'newStep',
                        'data': step_data
                    })
                    
            except json.JSONDecodeError:
                print('JSON解析错误')
                
    except websockets.exceptions.ConnectionClosed:
        print(f'客户端断开: {websocket.remote_address}')
    finally:
        with lock:
            clients.remove(websocket)

async def broadcast(message):
    """广播消息给所有客户端"""
    with lock:
        client_list = list(clients)
    
    if client_list:
        await asyncio.gather(
            *[ws.send(json.dumps(message)) for ws in client_list],
            return_exceptions=True
        )

async def start_ws():
    """启动WebSocket服务器"""
    print("启动WebSocket服务器: ws://119.91.23.169:5002")
    async with websockets.serve(ws_handler, "0.0.0.0", 5002):
        await asyncio.Future()

def run_ws():
    """在线程中运行asyncio"""
    asyncio.run(start_ws())

@app.route('/')
def index():
    return 'WebSocket Server for Recorder'

@app.route('/api/status', methods=['GET'])
def status():
    """获取连接状态"""
    with lock:
        count = len(clients)
    return jsonify({
        'code': 200,
        'data': {
            'connectedClients': count
        }
    })

if __name__ == '__main__':
    # 启动WebSocket服务器线程
    ws_thread = threading.Thread(target=run_ws, daemon=True)
    ws_thread.start()
    
    # 启动Flask服务器
    print("WebSocket服务器已启动: ws://119.91.23.169:5002")
    print("Flask服务器启动中: http://119.91.23.169:5002")
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
