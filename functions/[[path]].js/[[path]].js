// 1. 你的专属配置
const userID = '21d1b98f-5591-4aff-8eae-1b3ed01bdb6d'; // 必须与 Clash 中的 UUID 一致
const proxyIP = 'sg.v2ray.com'; // 出口中转 IP，使用这个通常比 visa.com 更稳

export default {
    async fetch(request, env, ctx) {
        try {
            const upgradeHeader = request.headers.get('Upgrade');
            // 如果不是 WebSocket 请求，返回一个伪装网页
            if (!upgradeHeader || upgradeHeader !== 'websocket') {
                const url = new URL(request.url);
                return new Response(`<html>
                <body style="font-family: sans-serif; background: #f4f4f9; display: flex; justify-content: center; align-items: center; height: 100vh;">
                    <div style="background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h1>Project Status: <span style="color: #2ecc71;">Running</span></h1>
                        <p>Location: Singapore (SG) High-Speed Node</p>
                        <p>Time: ${new Date().toISOString()}</p>
                    </div>
                </body>
                </html>`, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
            return await vlessOverWSHandler(request);
        } catch (err) {
            return new Response(err.toString(), { status: 500 });
        }
    }
};

async function vlessOverWSHandler(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();

    let remoteSocketWapper = { value: null };

    request.body.pipeTo(new WritableStream({
        async write(chunk) {
            if (remoteSocketWapper.value) {
                const writer = remoteSocketWapper.value.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }

            const { hasError, message, rawClientData } = processVlessHeader(chunk, userID);
            if (hasError) {
                server.close(1003, message);
                return;
            }

            try {
                // 连接到远端地址
                const tcpSocket = connect(proxyIP, 443);
                remoteSocketWapper.value = tcpSocket;
                const writer = tcpSocket.writable.getWriter();
                await writer.write(rawClientData);
                writer.releaseLock();

                tcpSocket.readable.pipeTo(new WritableStream({
                    async write(chunk) {
                        server.send(chunk);
                    }
                }));
            } catch (e) {
                server.close(1001, 'Proxy Connection Failed');
            }
        }
    }));

    return new Response(null, { status: 101, webSocket: client });
}

function processVlessHeader(vlessBuffer, userID) {
    if (vlessBuffer.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const uuid = new Uint8Array(vlessBuffer.slice(1, 17));
    if (stringify(uuid) !== userID) return { hasError: true, message: 'Auth failed' };
    
    const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
    return {
        hasError: false,
        rawClientData: vlessBuffer.slice(24 + optLength)
    };
}

function stringify(arr) {
    const hex = [];
    arr.forEach(i => hex.push(i.toString(16).padStart(2, '0')));
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join('')
    ].join('-');
}

// 这里的 connect 函数是 Cloudflare Workers 提供的原生 TCP 支持
function connect(address, port) {
    const tcpSocket = globalThis.connect(address, {
        port: port,
        allowHalfOpen: false,
        secureTransport: 'on'
    });
    return tcpSocket;
}
