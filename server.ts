import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '15mb' }));

// Servir imágenes subidas optimizadas (miniaturas + full) con cache agresiva
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    etag: true,
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    timezone: 'America/Asuncion',
    timestamp: new Date().toISOString(),
  });
});

// Endpoint de carga de fotos optimizadas (JPG, PNG, WebP -> miniaturas y versión web)
app.post('/api/uploads', (req, res) => {
  try {
    const { thumbDataUrl, fullDataUrl, baseName } = req.body as {
      thumbDataUrl?: string;
      fullDataUrl?: string;
      baseName?: string;
    };

    if (!thumbDataUrl || !fullDataUrl) {
      res.status(400).json({ error: 'Se requieren miniatura e imagen optimizada.' });
      return;
    }

    const decodeDataUrl = (dataUrl: string): { ext: string; buffer: Buffer } | null => {
      const match = /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) return null;
      const mime = match[1];
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const buffer = Buffer.from(match[3], 'base64');
      return { ext, buffer };
    };

    const thumbParsed = decodeDataUrl(thumbDataUrl);
    const fullParsed = decodeDataUrl(fullDataUrl);

    if (!thumbParsed || !fullParsed) {
      res.status(400).json({ error: 'Formato inválido. Solo se admiten JPG, PNG y WebP.' });
      return;
    }

    if (fullParsed.buffer.length > 8 * 1024 * 1024) {
      res.status(413).json({ error: 'La imagen excede el tamaño máximo permitido (8 MB).' });
      return;
    }

    const safeSlug = (baseName || 'foto')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 32);
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const thumbFilename = `${safeSlug}_${uniqueId}_thumb.${thumbParsed.ext}`;
    const fullFilename = `${safeSlug}_${uniqueId}_full.${fullParsed.ext}`;

    fs.writeFileSync(path.join(UPLOADS_DIR, thumbFilename), thumbParsed.buffer);
    fs.writeFileSync(path.join(UPLOADS_DIR, fullFilename), fullParsed.buffer);

    res.json({
      thumbUrl: `/uploads/${thumbFilename}`,
      fullUrl: `/uploads/${fullFilename}`,
    });
  } catch (err) {
    console.error('Error al guardar imagen:', err);
    res.status(500).json({ error: 'Error interno al procesar la imagen.' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const parsedUrl = new URL(
      request.url || '/',
      `http://${request.headers.host || 'localhost'}`
    );
    if (parsedUrl.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch {
    socket.destroy();
  }
});

interface BroadcastPayload {
  type: 'match:upcoming' | 'match:score_updated' | 'match:rescheduled' | 'draw:published' | 'gallery:published';
  title: string;
  body: string;
  tournamentId: string;
  divisionId?: string;
  matchId?: string;
  targetPlayerIds?: string[];
  timestamp: string;
}

function broadcastEvent(payload: BroadcastPayload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'connection:ready',
      timezone: 'America/Asuncion',
      timestamp: new Date().toISOString(),
    })
  );
});

app.post('/api/realtime/broadcast', (req, res) => {
  const body = req.body as Partial<BroadcastPayload>;
  if (!body.type || !body.title || !body.body || !body.tournamentId) {
    res.status(400).json({ error: 'Faltan campos obligatorios para la notificación.' });
    return;
  }

  const payload: BroadcastPayload = {
    type: body.type,
    title: String(body.title).slice(0, 120),
    body: String(body.body).slice(0, 320),
    tournamentId: String(body.tournamentId),
    divisionId: body.divisionId ? String(body.divisionId) : undefined,
    matchId: body.matchId ? String(body.matchId) : undefined,
    targetPlayerIds: Array.isArray(body.targetPlayerIds) ? body.targetPlayerIds.map(String) : [],
    timestamp: new Date().toISOString(),
  };

  broadcastEvent(payload);
  res.json({ sent: true, clients: wss.clients.size });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server },
        allowedHosts: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TenisCupy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
