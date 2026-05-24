(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/scribe-token');
    const data = await res.json();
    console.log('token response:', data);
    const token = data.token;
    if (!token) {
      console.error('No token received');
      process.exit(1);
    }

    const WebSocket = require('ws');
    const url = `wss://realtime.elevenlabs.io/v1/scribe?token=${token}`;
    console.log('Connecting to', url);
    const ws = new WebSocket(url);

    ws.on('open', () => console.log('WS open'));
    ws.on('message', (m) => console.log('WS msg:', m.toString()));
    ws.on('close', (code, reason) => console.log('WS close', code, reason && reason.toString()));
    ws.on('error', (e) => console.error('WS err', e));
  } catch (err) {
    console.error('Test error', err);
    process.exit(1);
  }
})();
