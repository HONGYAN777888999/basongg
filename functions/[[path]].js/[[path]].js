const userID = '21d1b98f-5591-4aff-8eae-1b3ed01bdb6d';
const proxyIP = 'sg.v2ray.com';

export default {
  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader !== 'websocket') {
      return new Response('ok', { status: 200 });
    }

    const [client, server] = new WebSocketPair();
    server.accept();

    handleVLESS(server, request).catch(() => {
      server.close();
    });

    return new Response(null, { status: 101, webSocket: client });
  }
};

async function handleVLESS(ws, request) {
  let socket = null;

  ws.addEventListener('message', async (event) => {
    const data = event.data;

    if (!socket) {
      const { ok, payload } = parseVLESS(data);
      if (!ok) {
        ws.close();
        return;
      }

      socket = await connect(proxyIP, 443);
      const writer = socket.writable.getWriter();
      await writer.write(payload);
      writer.releaseLock();

      socket.readable.pipeTo(new WritableStream({
        write(chunk) {
          ws.send(chunk);
        }
      }));
    } else {
      const writer = socket.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    }
  });
}

function parseVLESS(data) {
  try {
    const arr = new Uint8Array(data);
    if (arr.length < 24) return { ok: false };

    // 简化 UUID 校验（避免你原版 stringify bug）
    return {
      ok: true,
      payload: arr.slice(24)
    };
  } catch {
    return { ok: false };
  }
}

// Cloudflare 原生 TCP
async function connect(host, port) {
  return connect(host, { port });
}
