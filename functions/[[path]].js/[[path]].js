export default {
  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader !== 'websocket') {
      return new Response('Cloudflare WS OK', { status: 200 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    server.addEventListener('message', (event) => {
      // 关键：只是回传数据（保证链路通）
      server.send(event.data);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
};
