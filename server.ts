import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
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

// Servir imágenes subidas y banners IA con cache
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    etag: true,
  })
);
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'Imagen no encontrada.' });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'PlayPy',
    timezone: 'America/Asuncion',
    timestamp: new Date().toISOString(),
  });
});

// Utilidades para compositor de banners SVG horizontales (16:9) y verticales (3:4)
function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHex(val: string | undefined, fallback: string): string {
  const cleaned = String(val || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned : fallback;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w.slice(0, maxChars);
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

interface BannerDesignSpec {
  headline: string;
  subheadline: string;
  badge: string;
  ctaLabel: string;
  bgStart: string;
  bgEnd: string;
  accentViolet: string;
  accentBlue: string;
  motif: 'court_lines' | 'dynamic_arc' | 'geometric_grid' | 'spotlight_radial';
}

function buildHorizontalBannerSvg(params: {
  spec: BannerDesignSpec;
  sponsorName: string;
  tournamentName: string;
  venue: string;
  city: string;
}): string {
  const { spec, sponsorName, tournamentName, venue, city } = params;
  const bgStart = safeHex(spec.bgStart, '#0A1633');
  const bgEnd = safeHex(spec.bgEnd, '#16244D');
  const accentViolet = safeHex(spec.accentViolet, '#7C1FA2');
  const accentBlue = safeHex(spec.accentBlue, '#0095FF');

  const headlineLines = wrapLines(spec.headline, 26, 2);
  const subLines = wrapLines(spec.subheadline, 46, 2);
  const locationLine = [venue, city].filter(Boolean).join(' · ') || 'Circuito Oficial';

  const motifLayer =
    spec.motif === 'court_lines'
      ? `
        <g opacity="0.22" stroke="#FFFFFF" stroke-width="3" fill="none">
          <rect x="920" y="130" width="580" height="640" rx="18" />
          <line x1="1210" y1="130" x2="1210" y2="770" />
          <line x1="920" y1="450" x2="1500" y2="450" stroke="${accentBlue}" stroke-width="4" stroke-dasharray="14 10" />
          <rect x="1010" y="210" width="400" height="480" rx="8" />
        </g>`
      : spec.motif === 'geometric_grid'
      ? `
        <g opacity="0.18" stroke="${accentBlue}" stroke-width="2" fill="none">
          <path d="M980 80 L1560 80 M980 220 L1560 220 M980 360 L1560 360 M980 500 L1560 500 M980 640 L1560 640 M980 780 L1560 780" />
          <path d="M1040 40 L1040 860 M1180 40 L1180 860 M1320 40 L1320 860 M1460 40 L1460 860" />
        </g>`
      : `
        <g opacity="0.26" fill="none">
          <circle cx="1290" cy="450" r="290" stroke="${accentBlue}" stroke-width="3" />
          <circle cx="1290" cy="450" r="210" stroke="${accentViolet}" stroke-width="4" />
          <path d="M980 700 C1120 560 1320 530 1560 340" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
        </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="bgH" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="60%" stop-color="${bgEnd}" />
      <stop offset="100%" stop-color="#071028" />
    </linearGradient>
    <linearGradient id="brandGradH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accentViolet}" />
      <stop offset="100%" stop-color="${accentBlue}" />
    </linearGradient>
    <radialGradient id="glowH" cx="78%" cy="48%" r="48%">
      <stop offset="0%" stop-color="${accentBlue}" stop-opacity="0.34" />
      <stop offset="55%" stop-color="${accentViolet}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${bgStart}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bgH)" />
  <rect width="1600" height="900" fill="url(#glowH)" />
  ${motifLayer}

  <!-- Emblema PlayPy decorativo a la derecha -->
  <g transform="translate(1080, 210)">
    <rect x="0" y="0" width="420" height="480" rx="44" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2" />
    <path d="M126 112 C126 92 148 80 165 91 L322 192 C338 202 338 226 322 236 L165 337 C148 348 126 336 126 316 Z" fill="url(#brandGradH)" />
    <circle cx="246" cy="162" r="16" fill="#FFFFFF" />
    <path d="M160 186 C194 174 228 179 262 201 C236 212 212 226 188 252 L162 284 C174 252 186 228 204 212 C186 201 172 195 160 186 Z" fill="#FFFFFF" />
    <text x="210" y="405" text-anchor="middle" fill="#FFFFFF" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="24" font-weight="700" letter-spacing="2">PLAYPY OFICIAL</text>
    <text x="210" y="438" text-anchor="middle" fill="#CBD5E1" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="17">${escapeXml(locationLine.slice(0, 34))}</text>
  </g>

  <!-- Bloque izquierdo editorial -->
  <g transform="translate(96, 108)">
    <rect x="0" y="0" width="420" height="44" rx="22" fill="url(#brandGradH)" fill-opacity="0.22" stroke="${accentBlue}" stroke-opacity="0.6" stroke-width="1.5" />
    <text x="24" y="29" fill="#E0F2FE" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">${escapeXml(spec.badge.toUpperCase().slice(0, 34))}</text>

    <text x="0" y="110" fill="${accentBlue}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="26" font-weight="700" letter-spacing="1">${escapeXml(sponsorName.toUpperCase().slice(0, 34))}</text>

    <text x="0" y="190" fill="#FFFFFF" font-family="Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif" font-size="68" font-weight="700">
      ${headlineLines.map((ln, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 78}">${escapeXml(ln)}</tspan>`).join('')}
    </text>

    <text x="0" y="${headlineLines.length > 1 ? 336 : 268}" fill="#CBD5E1" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="28" font-weight="400">
      ${subLines.map((ln, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 40}">${escapeXml(ln)}</tspan>`).join('')}
    </text>

    <g transform="translate(0, 488)">
      <rect x="0" y="0" width="330" height="68" rx="16" fill="url(#brandGradH)" />
      <text x="165" y="42" text-anchor="middle" fill="#FFFFFF" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="22" font-weight="700">${escapeXml(spec.ctaLabel.slice(0, 24))}</text>
    </g>

    <text x="0" y="636" fill="#94A3B8" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="21" font-weight="600">
      Torneo: ${escapeXml(tournamentName.slice(0, 48))}
    </text>
  </g>
</svg>`;
}

function buildVerticalBannerSvg(params: {
  spec: BannerDesignSpec;
  sponsorName: string;
  tournamentName: string;
  venue: string;
  city: string;
}): string {
  const { spec, sponsorName, tournamentName, venue, city } = params;
  const bgStart = safeHex(spec.bgStart, '#0A1633');
  const bgEnd = safeHex(spec.bgEnd, '#16244D');
  const accentViolet = safeHex(spec.accentViolet, '#7C1FA2');
  const accentBlue = safeHex(spec.accentBlue, '#0095FF');

  const headlineLines = wrapLines(spec.headline, 17, 3);
  const subLines = wrapLines(spec.subheadline, 30, 3);
  const locationLine = [venue, city].filter(Boolean).join(' · ') || 'Circuito Oficial';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200">
  <defs>
    <linearGradient id="bgV" x1="0" y1="0" x2="900" y2="1200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="55%" stop-color="${bgEnd}" />
      <stop offset="100%" stop-color="#071028" />
    </linearGradient>
    <linearGradient id="brandGradV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accentViolet}" />
      <stop offset="100%" stop-color="${accentBlue}" />
    </linearGradient>
    <radialGradient id="glowV" cx="50%" cy="28%" r="55%">
      <stop offset="0%" stop-color="${accentViolet}" stop-opacity="0.34" />
      <stop offset="55%" stop-color="${accentBlue}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${bgStart}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="900" height="1200" fill="url(#bgV)" />
  <rect width="900" height="1200" fill="url(#glowV)" />

  <!-- Motivo geométrico vertical -->
  <g opacity="0.20" stroke="#FFFFFF" stroke-width="2.5" fill="none">
    <rect x="76" y="76" width="748" height="1048" rx="36" stroke-opacity="0.35" />
    <circle cx="450" cy="300" r="220" stroke="${accentBlue}" stroke-width="3" />
    <circle cx="450" cy="300" r="160" stroke="${accentViolet}" stroke-width="3" />
  </g>

  <!-- Cabecera vertical con icono PlayPy -->
  <g transform="translate(110, 122)">
    <rect x="0" y="0" width="380" height="46" rx="23" fill="url(#brandGradV)" fill-opacity="0.24" stroke="${accentBlue}" stroke-opacity="0.65" stroke-width="1.5" />
    <text x="24" y="30" fill="#E0F2FE" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="1.4">${escapeXml(spec.badge.toUpperCase().slice(0, 28))}</text>
  </g>

  <g transform="translate(320, 212)">
    <path d="M58 26 C58 8 78 -3 94 7 L232 97 C247 107 247 129 232 139 L94 229 C78 239 58 228 58 210 Z" fill="url(#brandGradV)" />
    <circle cx="164" cy="70" r="14" fill="#FFFFFF" />
    <path d="M88 92 C118 82 148 86 178 106 C154 116 134 128 112 150 L90 178 C100 150 110 128 126 114 C110 104 98 98 88 92 Z" fill="#FFFFFF" />
  </g>

  <!-- Contenido central -->
  <g transform="translate(110, 520)">
    <text x="0" y="0" fill="${accentBlue}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="28" font-weight="700" letter-spacing="1.2">${escapeXml(sponsorName.toUpperCase().slice(0, 28))}</text>

    <text x="0" y="76" fill="#FFFFFF" font-family="Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif" font-size="64" font-weight="700">
      ${headlineLines.map((ln, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 74}">${escapeXml(ln)}</tspan>`).join('')}
    </text>

    <text x="0" y="${76 + headlineLines.length * 74 + 22}" fill="#CBD5E1" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="28" font-weight="400">
      ${subLines.map((ln, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 38}">${escapeXml(ln)}</tspan>`).join('')}
    </text>
  </g>

  <!-- Pie vertical con CTA + datos del torneo -->
  <g transform="translate(110, 920)">
    <rect x="0" y="0" width="680" height="74" rx="18" fill="url(#brandGradV)" />
    <text x="340" y="46" text-anchor="middle" fill="#FFFFFF" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="24" font-weight="700">${escapeXml(spec.ctaLabel.slice(0, 30))}</text>

    <text x="0" y="130" fill="#E2E8F0" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="22" font-weight="700">${escapeXml(tournamentName.slice(0, 42))}</text>
    <text x="0" y="164" fill="#94A3B8" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="19">${escapeXml(locationLine.slice(0, 48))} · PlayPy</text>
  </g>
</svg>`;
}

// Endpoint IA para generar banners publicitarios duales (Horizontal 16:9 + Vertical 3:4) por torneo
app.post('/api/ai/generate-banner', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({
        error:
          'No se encontró una clave de Gemini configurada en el servidor (Settings > Secrets → GEMINI_API_KEY).',
      });
      return;
    }

    const {
      tournamentName,
      venue,
      city,
      sponsorName,
      title,
      subtitle,
      placement,
      stylePreset,
      customPrompt,
    } = req.body as {
      tournamentName?: string;
      venue?: string;
      city?: string;
      sponsorName?: string;
      title?: string;
      subtitle?: string;
      placement?: string;
      stylePreset?: string;
      customPrompt?: string;
    };

    if (!tournamentName || !sponsorName) {
      res.status(400).json({
        error: 'Indicá al menos el torneo activo y el nombre del sponsor para generar los banners.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = `Sos director de arte deportivo para PlayPy ("Tu App de Torneos y Competencias").
Diseñá el concepto visual y copy publicitario bilingüe/español neutro-rioplatense para un banner publicitario que se adaptará automáticamente a formato HORIZONTAL (16:9) y VERTICAL (3:4) para el siguiente torneo:
- Torneo: ${tournamentName}
- Sede y ciudad: ${venue || 'Sede oficial'}, ${city || 'Paraguay'}
- Auspiciante / Sponsor: ${sponsorName}
- Título base ingresado: ${title || sponsorName}
- Subtítulo base ingresado: ${subtitle || 'Auspiciante oficial del certamen'}
- Ubicación prevista: ${placement || 'banner_principal'}
- Estilo solicitado: ${stylePreset || 'PlayPy Oficial'}
${customPrompt ? `- Indicaciones adicionales del organizador: ${customPrompt}` : ''}

Colores de referencia PlayPy: Navy #0A1633, Violeta #7C1FA2, Azul Eléctrico #0095FF. Podés adaptar la paleta según el estilo solicitado manteniendo alto contraste para texto blanco.`;

    const generateConfig = {
      systemInstruction:
        'Devolvé únicamente JSON válido según el esquema. Textos breves, publicitarios y de alto impacto visual en español.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: {
            type: Type.STRING,
            description: 'Titular corto y potente de 3 a 6 palabras para el banner.',
          },
          subheadline: {
            type: Type.STRING,
            description: 'Bajada comercial clara de 6 a 14 palabras.',
          },
          badge: {
            type: Type.STRING,
            description: 'Etiqueta corta superior de 2 a 4 palabras (ej. SPONSOR OFICIAL 2026).',
          },
          ctaLabel: {
            type: Type.STRING,
            description: 'Llamado a la acción corto de 2 a 4 palabras (ej. Conocé más, Ver beneficios).',
          },
          bgStart: {
            type: Type.STRING,
            description: 'Color hex oscuro principal de fondo (ej. #0A1633).',
          },
          bgEnd: {
            type: Type.STRING,
            description: 'Color hex secundario oscuro de fondo (ej. #1E1B4B).',
          },
          accentViolet: {
            type: Type.STRING,
            description: 'Color hex acento primario vibrante (ej. #7C1FA2).',
          },
          accentBlue: {
            type: Type.STRING,
            description: 'Color hex acento secundario vibrante (ej. #0095FF).',
          },
          motif: {
            type: Type.STRING,
            enum: ['court_lines', 'dynamic_arc', 'geometric_grid', 'spotlight_radial'],
            description: 'Motivo gráfico de fondo.',
          },
        },
        required: [
          'headline',
          'subheadline',
          'badge',
          'ctaLabel',
          'bgStart',
          'bgEnd',
          'accentViolet',
          'accentBlue',
          'motif',
        ],
      },
    };

    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastErr: unknown = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: generateConfig,
        });
        break;
      } catch (modelErr: unknown) {
        lastErr = modelErr;
        const errStatus = (modelErr as { status?: number })?.status;
        if (errStatus !== 503 && errStatus !== 429) {
          throw modelErr;
        }
      }
    }

    if (!response) {
      throw lastErr || new Error('El servicio de Gemini no respondió.');
    }

    const rawJson = (response.text || '').trim();
    if (!rawJson) {
      res.status(502).json({ error: 'Gemini no devolvió contenido para generar el banner.' });
      return;
    }

    const spec = JSON.parse(rawJson) as BannerDesignSpec;
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const horizontalSvg = buildHorizontalBannerSvg({
      spec,
      sponsorName,
      tournamentName,
      venue: venue || '',
      city: city || '',
    });
    const verticalSvg = buildVerticalBannerSvg({
      spec,
      sponsorName,
      tournamentName,
      venue: venue || '',
      city: city || '',
    });

    const slug = (sponsorName || 'sponsor')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 24) || 'sponsor';
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const hFilename = `ai_banner_${slug}_${uid}_horizontal.svg`;
    const vFilename = `ai_banner_${slug}_${uid}_vertical.svg`;

    fs.writeFileSync(path.join(UPLOADS_DIR, hFilename), horizontalSvg, 'utf8');
    fs.writeFileSync(path.join(UPLOADS_DIR, vFilename), verticalSvg, 'utf8');

    res.json({
      horizontalUrl: `/uploads/${hFilename}`,
      verticalUrl: `/uploads/${vFilename}`,
      headline: spec.headline,
      subheadline: spec.subheadline,
      badge: spec.badge,
      ctaLabel: spec.ctaLabel,
      motif: spec.motif,
    });
  } catch (err: unknown) {
    console.error('Error al generar banner con IA:', err);
    const anyErr = err as { status?: number; message?: string };
    const status = typeof anyErr?.status === 'number' && anyErr.status >= 400 ? anyErr.status : 500;
    let message =
      anyErr?.message ||
      'No se pudo generar el banner publicitario con Gemini. Verificá tu clave API en Settings > Secrets.';
    try {
      const parsed = JSON.parse(message) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // keep raw message
    }
    res.status(status).json({ error: message });
  }
});

// Endpoint de carga de fotos optimizadas (JPG, PNG, WebP -> miniaturas y versión web)
app.post('/api/uploads', (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

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
      const cleaned = String(dataUrl).trim();
      const match = /^data:(image\/(jpeg|jpg|png|webp));base64,([\s\S]+)$/.exec(cleaned);
      if (!match) return null;
      const mime = match[1];
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const base64Body = match[3].replace(/\s+/g, '');
      const buffer = Buffer.from(base64Body, 'base64');
      if (buffer.length === 0) return null;
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
      .slice(0, 32) || 'foto';
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
    console.log(`PlayPy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
