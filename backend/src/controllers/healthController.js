import mongoose from 'mongoose';

export function health(_req, res) {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, data: { status: ready ? 'ok' : 'degraded', database: ready ? 'connected' : 'disconnected', timestamp: new Date().toISOString() } });
}
