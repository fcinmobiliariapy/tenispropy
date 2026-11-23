import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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
        const modelConfig =
          modelName === 'gemini-4-hydrogen'
            ? { ...generateConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : generateConfig;
        response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents: promptText,
            config: modelConfig,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error(`Timeout en modelo ${modelName}`), { status: 504 })), 12000)
          ),
        ]);
        break;
      } catch (modelErr: unknown) {
        lastErr = modelErr;
        const errStatus = (modelErr as { status?: number })?.status;
        if (errStatus !== 503 && errStatus !== 429 && errStatus !== 504) {
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

interface TrophyDesignSpec {
  headline: string;
  plaqueTitle: string;
  engravingLine1: string;
  engravingLine2: string;
  motifNote: string;
  bgStart: string;
  bgEnd: string;
  metalLight: string;
  metalMid: string;
  metalDark: string;
  accentColor: string;
  ribbonColor: string;
  emblemPattern: 'stars' | 'laurel' | 'court_arcs' | 'prism_grid';
}

const TROPHY_FINISH_PALETTES: Record<
  string,
  { metalLight: string; metalMid: string; metalDark: string; accentColor: string; label: string }
> = {
  gold: {
    metalLight: '#FEF3C7',
    metalMid: '#F59E0B',
    metalDark: '#92400E',
    accentColor: '#FBBF24',
    label: 'ORO CAMPEÓN',
  },
  silver: {
    metalLight: '#F8FAFC',
    metalMid: '#CBD5E1',
    metalDark: '#475569',
    accentColor: '#38BDF8',
    label: 'PLATA OFICIAL',
  },
  bronze: {
    metalLight: '#FFEDD5',
    metalMid: '#EA580C',
    metalDark: '#7C2D12',
    accentColor: '#FB923C',
    label: 'BRONCE PODIO',
  },
  playpy_crystal: {
    metalLight: '#E0F2FE',
    metalMid: '#0095FF',
    metalDark: '#7C1FA2',
    accentColor: '#38BDF8',
    label: 'CRISTAL PLAYPY',
  },
};

function buildTrophyShowcaseSvg(params: {
  spec: TrophyDesignSpec;
  cupStyle: 'classic_chalice' | 'modern_crystal' | 'laurel_shield' | 'tennis_crown';
  finish: 'gold' | 'silver' | 'bronze' | 'playpy_crystal';
  tournamentName: string;
  divisionName: string;
  placeLabel: string;
  venue: string;
  city: string;
  recipientName?: string;
}): string {
  const {
    spec,
    cupStyle,
    finish,
    tournamentName,
    divisionName,
    placeLabel,
    venue,
    city,
    recipientName,
  } = params;

  const fallbackPalette = TROPHY_FINISH_PALETTES[finish] || TROPHY_FINISH_PALETTES.gold;
  const bgStart = safeHex(spec.bgStart, '#0A1633');
  const bgEnd = safeHex(spec.bgEnd, '#151E45');
  const metalLight = safeHex(spec.metalLight, fallbackPalette.metalLight);
  const metalMid = safeHex(spec.metalMid, fallbackPalette.metalMid);
  const metalDark = safeHex(spec.metalDark, fallbackPalette.metalDark);
  const accentColor = safeHex(spec.accentColor, fallbackPalette.accentColor);
  const ribbonColor = safeHex(spec.ribbonColor, '#7C1FA2');

  const headline = (spec.headline || `${placeLabel} · ${divisionName}`).slice(0, 38);
  const plaqueTitle = (spec.plaqueTitle || placeLabel).toUpperCase().slice(0, 26);
  const eng1 = (recipientName?.trim() || spec.engravingLine1 || divisionName).slice(0, 30);
  const eng2 = (spec.engravingLine2 || tournamentName).slice(0, 34);
  const locText = [venue, city].filter(Boolean).join(' · ') || 'Circuito PlayPy';

  const bgPatternLayer =
    spec.emblemPattern === 'court_arcs'
      ? `
        <g opacity="0.18" fill="none" stroke="${accentColor}" stroke-width="2.5">
          <rect x="90" y="90" width="820" height="920" rx="44" stroke="#FFFFFF" stroke-opacity="0.22" />
          <circle cx="500" cy="440" r="290" />
          <circle cx="500" cy="440" r="215" stroke="${ribbonColor}" stroke-width="3" />
          <path d="M120 740 C300 620 700 620 880 740" stroke-dasharray="10 8" />
        </g>`
      : spec.emblemPattern === 'prism_grid'
      ? `
        <g opacity="0.16" fill="none" stroke="${accentColor}" stroke-width="2">
          <polygon points="500,130 820,440 500,750 180,440" />
          <polygon points="500,190 760,440 500,690 240,440" stroke="${ribbonColor}" />
          <line x1="500" y1="100" x2="500" y2="780" stroke="#FFFFFF" stroke-opacity="0.25" />
        </g>`
      : `
        <g opacity="0.22" fill="none">
          <circle cx="500" cy="440" r="300" stroke="${metalMid}" stroke-width="2" stroke-dasharray="6 10" />
          <circle cx="500" cy="440" r="245" stroke="${accentColor}" stroke-width="2.5" />
          <circle cx="220" cy="240" r="4" fill="${metalLight}" />
          <circle cx="780" cy="240" r="4" fill="${metalLight}" />
          <circle cx="190" cy="540" r="3" fill="${accentColor}" />
          <circle cx="810" cy="540" r="3" fill="${accentColor}" />
        </g>`;

  let silhouetteMarkup = '';
  if (cupStyle === 'modern_crystal') {
    silhouetteMarkup = `
      <!-- Trofeo Cristal Moderno -->
      <g transform="translate(500, 445)">
        <!-- Destello posterior -->
        <polygon points="0,-275 135,-80 95,125 -95,125 -135,-80" fill="url(#metalBody)" opacity="0.96" stroke="${metalLight}" stroke-width="3" />
        <polygon points="0,-275 135,-80 0,20" fill="${metalLight}" opacity="0.45" />
        <polygon points="0,-275 -135,-80 0,20" fill="${metalDark}" opacity="0.28" />
        <polygon points="0,20 135,-80 95,125 0,125" fill="${ribbonColor}" opacity="0.35" />
        <polygon points="0,20 -135,-80 -95,125 0,125" fill="${accentColor}" opacity="0.25" />
        <!-- Esfera de tenis suspendida en cristal -->
        <circle cx="0" cy="-95" r="48" fill="#D9F99D" stroke="#FFFFFF" stroke-width="3" />
        <path d="M-36 -125 C-12 -102 -12 -88 -36 -65 M36 -125 C12 -102 12 -88 36 -65" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
        <!-- Cuello metálico -->
        <rect x="-52" y="125" width="104" height="22" rx="6" fill="url(#metalTrim)" />
      </g>`;
  } else if (cupStyle === 'laurel_shield') {
    silhouetteMarkup = `
      <!-- Trofeo Escudo con Laureles -->
      <g transform="translate(500, 445)">
        <!-- Corona de laureles izquierda y derecha -->
        <path d="M-155 110 C-235 45 -245 -105 -150 -195 C-180 -105 -170 25 -105 95 Z" fill="url(#metalTrim)" opacity="0.92" />
        <path d="M155 110 C235 45 245 -105 150 -195 C180 -105 170 25 105 95 Z" fill="url(#metalTrim)" opacity="0.92" />
        <!-- Escudo central -->
        <path d="M-135 -205 L135 -205 L135 -35 C135 65 0 135 0 135 C0 135 -135 65 -135 -35 Z" fill="url(#metalBody)" stroke="${metalLight}" stroke-width="5" />
        <path d="M-105 -175 L105 -175 L105 -42 C105 38 0 98 0 98 C0 98 -105 38 -105 -42 Z" fill="${bgStart}" fill-opacity="0.72" stroke="${accentColor}" stroke-width="2.5" />
        <!-- Raquetas cruzadas + PlayPy -->
        <ellipse cx="-24" cy="-78" rx="34" ry="44" transform="rotate(-25 -24 -78)" fill="none" stroke="${metalLight}" stroke-width="6" />
        <line x1="-2" y1="-36" x2="48" y2="28" stroke="${metalLight}" stroke-width="7" stroke-linecap="round" />
        <ellipse cx="24" cy="-78" rx="34" ry="44" transform="rotate(25 24 -78)" fill="none" stroke="${metalLight}" stroke-width="6" />
        <line x1="2" y1="-36" x2="-48" y2="28" stroke="${metalLight}" stroke-width="7" stroke-linecap="round" />
        <circle cx="0" cy="-72" r="22" fill="#D9F99D" stroke="#FFFFFF" stroke-width="2.5" />
      </g>`;
  } else if (cupStyle === 'tennis_crown') {
    silhouetteMarkup = `
      <!-- Trofeo Corona del Circuito -->
      <g transform="translate(500, 445)">
        <!-- Corona superior -->
        <path d="M-165 -20 L-190 -175 L-85 -95 L0 -230 L85 -95 L190 -175 L165 -20 Z" fill="url(#metalBody)" stroke="${metalLight}" stroke-width="4" stroke-linejoin="round" />
        <circle cx="-190" cy="-185" r="14" fill="${metalLight}" />
        <circle cx="0" cy="-242" r="18" fill="#D9F99D" stroke="#FFFFFF" stroke-width="3" />
        <circle cx="190" cy="-185" r="14" fill="${metalLight}" />
        <!-- Banda de corona con emblema -->
        <rect x="-165" y="-22" width="330" height="44" rx="12" fill="url(#metalTrim)" stroke="${metalLight}" stroke-width="2.5" />
        <circle cx="0" cy="0" r="14" fill="${ribbonColor}" stroke="${metalLight}" stroke-width="2" />
        <!-- Columna estriada -->
        <path d="M-85 22 L85 22 L62 135 L-62 135 Z" fill="url(#metalBody)" stroke="${metalLight}" stroke-width="2.5" />
        <line x1="-32" y1="30" x2="-24" y2="128" stroke="${metalDark}" stroke-width="4" opacity="0.45" />
        <line x1="0" y1="30" x2="0" y2="128" stroke="${metalLight}" stroke-width="4" opacity="0.55" />
        <line x1="32" y1="30" x2="24" y2="128" stroke="${metalDark}" stroke-width="4" opacity="0.45" />
      </g>`;
  } else {
    silhouetteMarkup = `
      <!-- Copa Clásica de Campeonato -->
      <g transform="translate(500, 445)">
        <!-- Asas laterales -->
        <path d="M-135 -180 C-230 -180 -235 -35 -120 -10" fill="none" stroke="url(#metalTrim)" stroke-width="18" stroke-linecap="round" />
        <path d="M135 -180 C230 -180 235 -35 120 -10" fill="none" stroke="url(#metalTrim)" stroke-width="18" stroke-linecap="round" />
        <!-- Cáliz principal -->
        <path d="M-150 -220 L150 -220 C145 -65 82 22 0 42 C-82 22 -145 -65 -150 -220 Z" fill="url(#metalBody)" stroke="${metalLight}" stroke-width="4" />
        <ellipse cx="0" cy="-220" rx="150" ry="22" fill="${metalDark}" stroke="${metalLight}" stroke-width="3" />
        <!-- Reflejo vertical del cáliz -->
        <path d="M-92 -192 C-82 -82 -44 -20 -18 14" fill="none" stroke="${metalLight}" stroke-width="12" stroke-linecap="round" opacity="0.48" />
        <!-- Emblema pelota en el centro de la copa -->
        <circle cx="0" cy="-102" r="36" fill="${bgStart}" fill-opacity="0.28" stroke="${metalLight}" stroke-width="2.5" />
        <circle cx="0" cy="-102" r="24" fill="#D9F99D" stroke="#FFFFFF" stroke-width="2" />
        <path d="M-18 -116 C-6 -105 -6 -99 -18 -88 M18 -116 C6 -105 6 -99 18 -88" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
        <!-- Tallo y nudo -->
        <rect x="-24" y="38" width="48" height="72" rx="10" fill="url(#metalBody)" />
        <ellipse cx="0" cy="76" rx="44" ry="15" fill="url(#metalTrim)" stroke="${metalLight}" stroke-width="2" />
        <path d="M-76 110 L76 110 L96 142 L-96 142 Z" fill="url(#metalTrim)" />
      </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1100" width="1000" height="1100">
  <defs>
    <linearGradient id="trophyBg" x1="0" y1="0" x2="1000" y2="1100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="55%" stop-color="${bgEnd}" />
      <stop offset="100%" stop-color="#050B1C" />
    </linearGradient>
    <radialGradient id="trophyGlow" cx="50%" cy="40%" r="46%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.42" />
      <stop offset="55%" stop-color="${ribbonColor}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${bgStart}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="metalBody" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${metalLight}" />
      <stop offset="48%" stop-color="${metalMid}" />
      <stop offset="100%" stop-color="${metalDark}" />
    </linearGradient>
    <linearGradient id="metalTrim" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${metalDark}" />
      <stop offset="50%" stop-color="${metalLight}" />
      <stop offset="100%" stop-color="${metalDark}" />
    </linearGradient>
    <linearGradient id="playpyBadge" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7C1FA2" />
      <stop offset="100%" stop-color="#0095FF" />
    </linearGradient>
  </defs>

  <rect width="1000" height="1100" fill="url(#trophyBg)" />
  <rect width="1000" height="1100" fill="url(#trophyGlow)" />
  ${bgPatternLayer}

  <!-- Cabecera del Premio -->
  <g transform="translate(500, 72)">
    <rect x="-190" y="0" width="380" height="44" rx="22" fill="url(#playpyBadge)" fill-opacity="0.28" stroke="${accentColor}" stroke-opacity="0.65" stroke-width="1.5" />
    <text x="0" y="29" text-anchor="middle" fill="#FFFFFF" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="2">${escapeXml(plaqueTitle)}</text>
    <text x="0" y="92" text-anchor="middle" fill="#FFFFFF" font-family="Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif" font-size="38" font-weight="700">${escapeXml(headline)}</text>
  </g>

  ${silhouetteMarkup}

  <!-- Pedestal y Placa Grabada -->
  <g transform="translate(500, 595)">
    <path d="M-158 0 L158 0 L190 36 L-190 36 Z" fill="#1E293B" stroke="${metalMid}" stroke-width="2" />
    <rect x="-195" y="36" width="390" height="132" rx="14" fill="#0F172A" stroke="${metalDark}" stroke-width="3" />
    <!-- Placa metálica grabada -->
    <rect x="-162" y="54" width="324" height="96" rx="10" fill="url(#metalBody)" stroke="${metalLight}" stroke-width="2" />
    <text x="0" y="92" text-anchor="middle" fill="#0A1633" font-family="Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif" font-size="24" font-weight="800">${escapeXml(eng1)}</text>
    <text x="0" y="124" text-anchor="middle" fill="#1E293B" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="16" font-weight="700">${escapeXml(eng2)}</text>
  </g>

  <!-- Cinta y Sello PlayPy inferior -->
  <g transform="translate(500, 845)">
    <rect x="-320" y="0" width="640" height="140" rx="26" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1.5" />
    <text x="0" y="48" text-anchor="middle" fill="${metalLight}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="22" font-weight="700">${escapeXml(divisionName.slice(0, 36))}</text>
    <text x="0" y="84" text-anchor="middle" fill="#CBD5E1" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="18" font-weight="600">${escapeXml(tournamentName.slice(0, 44))}</text>
    <text x="0" y="114" text-anchor="middle" fill="#94A3B8" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="15">${escapeXml(locText.slice(0, 52))} · PlayPy Oficial</text>
  </g>
</svg>`;
}

// Endpoint IA para generar imágenes de trofeos personalizables por categoría
app.post('/api/ai/generate-trophy', async (req, res) => {
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
      divisionName,
      category,
      place,
      title,
      recipientName,
      cupStyle,
      finish,
      engravingText,
      customPrompt,
    } = req.body as {
      tournamentName?: string;
      venue?: string;
      city?: string;
      divisionName?: string;
      category?: string;
      place?: 'campeon' | 'vicecampeon' | 'tercer_puesto' | 'especial';
      title?: string;
      recipientName?: string;
      cupStyle?: 'classic_chalice' | 'modern_crystal' | 'laurel_shield' | 'tennis_crown';
      finish?: 'gold' | 'silver' | 'bronze' | 'playpy_crystal';
      engravingText?: string;
      customPrompt?: string;
    };

    if (!tournamentName || !divisionName) {
      res.status(400).json({
        error: 'Indicá el torneo y la categoría o división para generar la imagen del trofeo.',
      });
      return;
    }

    const safeCupStyle =
      cupStyle && ['classic_chalice', 'modern_crystal', 'laurel_shield', 'tennis_crown'].includes(cupStyle)
        ? cupStyle
        : 'classic_chalice';
    const safeFinish =
      finish && ['gold', 'silver', 'bronze', 'playpy_crystal'].includes(finish)
        ? finish
        : place === 'vicecampeon'
        ? 'silver'
        : place === 'tercer_puesto'
        ? 'bronze'
        : 'gold';

    const placeMap: Record<string, string> = {
      campeon: 'Campeón 1° Puesto',
      vicecampeon: 'Vicecampeón 2° Puesto',
      tercer_puesto: 'Tercer Puesto 3°',
      especial: 'Distinción Especial',
    };
    const placeLabel = placeMap[place || 'campeon'] || 'Campeón 1° Puesto';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = `Sos diseñador de trofeos y premiaciones deportivas de prestigio para PlayPy ("Tu App de Torneos y Competencias").
Diseñá la dirección artística y el grabado personalizado de la placa para el siguiente trofeo oficial de tenis:
- Torneo: ${tournamentName}
- Sede / Ciudad: ${venue || 'Sede oficial'}, ${city || 'Paraguay'}
- Categoría / División: ${divisionName} (${category || divisionName})
- Puesto / Premio: ${placeLabel}
- Título sugerido: ${title || `${placeLabel} ${divisionName}`}
- Estilo de copa elegido: ${safeCupStyle}
- Acabado elegido: ${safeFinish}
- Texto de grabado sugerido: ${engravingText || divisionName}
${recipientName ? `- Ganador ya coronado (grabar en placa): ${recipientName}` : '- Ganador aún por definir en cancha (grabar categoría y puesto)'}
${customPrompt ? `- Indicaciones personalizadas del organizador: ${customPrompt}` : ''}

Asegurate que los colores metalLight, metalMid, metalDark y bgStart/bgEnd combinen con elegancia deportiva PlayPy (#0A1633 navy, #7C1FA2 violeta, #0095FF azul eléctrico) y alto contraste para la placa grabada.`;

    const generateConfig = {
      systemInstruction:
        'Devolvé únicamente JSON válido según el esquema. Copy elegante de premiación deportiva en español.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: {
            type: Type.STRING,
            description: 'Título elegante para la parte superior de la tarjeta del trofeo (máximo 5 palabras).',
          },
          plaqueTitle: {
            type: Type.STRING,
            description: 'Etiqueta corta superior en mayúsculas (ej. CAMPEÓN 2026, FINALISTA).',
          },
          engravingLine1: {
            type: Type.STRING,
            description: 'Línea principal grabada en la placa del pedestal (nombre del ganador o división).',
          },
          engravingLine2: {
            type: Type.STRING,
            description: 'Segunda línea grabada en la placa (nombre del torneo y año).',
          },
          motifNote: {
            type: Type.STRING,
            description: 'Breve descripción de 1 oración del concepto estético del trofeo.',
          },
          bgStart: { type: Type.STRING },
          bgEnd: { type: Type.STRING },
          metalLight: { type: Type.STRING },
          metalMid: { type: Type.STRING },
          metalDark: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          ribbonColor: { type: Type.STRING },
          emblemPattern: {
            type: Type.STRING,
            enum: ['stars', 'laurel', 'court_arcs', 'prism_grid'],
          },
        },
        required: [
          'headline',
          'plaqueTitle',
          'engravingLine1',
          'engravingLine2',
          'motifNote',
          'bgStart',
          'bgEnd',
          'metalLight',
          'metalMid',
          'metalDark',
          'accentColor',
          'ribbonColor',
          'emblemPattern',
        ],
      },
    };

    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastErr: unknown = null;

    for (const modelName of candidateModels) {
      try {
        const modelConfig =
          modelName === 'gemini-4-hydrogen'
            ? { ...generateConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : generateConfig;
        response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents: promptText,
            config: modelConfig,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error(`Timeout en modelo ${modelName}`), { status: 504 })), 12000)
          ),
        ]);
        break;
      } catch (modelErr: unknown) {
        lastErr = modelErr;
        const errStatus = (modelErr as { status?: number })?.status;
        if (errStatus !== 503 && errStatus !== 429 && errStatus !== 504) {
          throw modelErr;
        }
      }
    }

    if (!response) {
      throw lastErr || new Error('El servicio de Gemini no respondió.');
    }

    const rawJson = (response.text || '').trim();
    if (!rawJson) {
      res.status(502).json({ error: 'Gemini no devolvió diseño para generar el trofeo.' });
      return;
    }

    const spec = JSON.parse(rawJson) as TrophyDesignSpec;
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const trophySvg = buildTrophyShowcaseSvg({
      spec,
      cupStyle: safeCupStyle,
      finish: safeFinish,
      tournamentName,
      divisionName,
      placeLabel,
      venue: venue || '',
      city: city || '',
      recipientName,
    });

    const slug = (divisionName || 'trofeo')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 24) || 'trofeo';
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const filename = `ai_trophy_${slug}_${uid}.svg`;

    fs.writeFileSync(path.join(UPLOADS_DIR, filename), trophySvg, 'utf8');

    res.json({
      imageUrl: `/uploads/${filename}`,
      title: spec.headline || title || `${placeLabel} · ${divisionName}`,
      engravingText: `${spec.engravingLine1} · ${spec.engravingLine2}`,
      motifNote: spec.motifNote,
    });
  } catch (err: unknown) {
    console.error('Error al generar trofeo con IA:', err);
    const anyErr = err as { status?: number; message?: string };
    const status = typeof anyErr?.status === 'number' && anyErr.status >= 400 ? anyErr.status : 500;
    let message =
      anyErr?.message ||
      'No se pudo generar el trofeo con Gemini. Verificá tu clave API en Settings > Secrets.';
    try {
      const parsed = JSON.parse(message) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // keep raw
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

// Soporte opcional para Cloudflare R2 (10 GB gratis y $0 egress) vía URL firmada S3v4
function getR2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (process.env.R2_BUCKET_NAME || '').trim();
  const publicUrl = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const configured = Boolean(accountId && accessKeyId && secretAccessKey && bucketName && publicUrl);
  return { configured, accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function createR2PresignedPutUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  expiresSeconds?: number;
}): string {
  const { accountId, accessKeyId, secretAccessKey, bucketName, key, expiresSeconds = 300 } = params;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodeURIComponent(bucketName)}/${key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')}`;

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  });
  queryParams.sort();
  const canonicalQueryString = queryParams.toString().replace(/\+/g, '%20');
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const hashedRequest = crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashedRequest].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

app.get('/api/uploads/storage-info', (_req, res) => {
  const r2 = getR2Config();
  res.json({
    r2Configured: r2.configured,
    maxUploadBytes: 8 * 1024 * 1024,
  });
});

app.post('/api/uploads/presign-r2', (req, res) => {
  const r2 = getR2Config();
  if (!r2.configured) {
    res.status(503).json({
      error: 'Cloudflare R2 no está configurado en las variables de entorno del servidor.',
    });
    return;
  }

  const body = req.body as { folder?: string; filename?: string; contentType?: string };
  const allowedFolders = new Set(['photos', 'avatars', 'banners']);
  const folder = body.folder && allowedFolders.has(body.folder) ? body.folder : 'photos';

  const mime = String(body.contentType || 'image/webp').toLowerCase();
  const extMap: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  const ext = extMap[mime];
  if (!ext) {
    res.status(400).json({ error: 'Tipo de contenido no permitido. Usá WebP, JPG o PNG.' });
    return;
  }

  const baseSlug = String(body.filename || 'imagen')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32) || 'imagen';
  const uid = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const key = `playpy/${folder}/${baseSlug}_${uid}.${ext}`;

  const uploadUrl = createR2PresignedPutUrl({
    accountId: r2.accountId,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
    bucketName: r2.bucketName,
    key,
  });

  res.json({
    uploadUrl,
    publicUrl: `${r2.publicUrl}/${key}`,
    key,
  });
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
