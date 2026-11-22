import QRCode from 'qrcode';
import { Division, Match, Matchday, Tournament } from '../types/tennis';
import { formatScoreString } from './itfRules';
import { dedupeMatches, formatAsuncionDate } from './tournamentEngine';
import { buildTournamentDirectUrl } from './tournamentLinks';

export type FlyerGroupBy = 'categoria' | 'jornada' | 'fecha' | 'ronda';
export type FlyerFormat = 'story' | 'post' | 'landscape';
export type FlyerTheme = 'playpy' | 'night' | 'clean';
export type FlyerStatusFilter = 'all' | 'scheduled' | 'finished';

export interface FlyerMatchItem {
  match: Match;
  divisionName: string;
  matchdayName: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  scoreLabel: string;
  isFinished: boolean;
}

export interface FlyerGroupSection {
  key: string;
  title: string;
  subtitle?: string;
  sortDateKey: string;
  sortOrder: number;
  items: FlyerMatchItem[];
}

export interface FlyerRenderOptions {
  tournament: Tournament;
  sections: FlyerGroupSection[];
  groupBy: FlyerGroupBy;
  format: FlyerFormat;
  theme: FlyerTheme;
  includeQr: boolean;
  customSubtitle?: string;
  logoUrl?: string;
}

const GROUP_BY_TITLES: Record<FlyerGroupBy, string> = {
  categoria: 'Cruces por Categoría / División',
  jornada: 'Cruces por Jornada',
  fecha: 'Programación por Fecha',
  ronda: 'Cruces por Ronda',
};

const FORMAT_DIMENSIONS: Record<FlyerFormat, { width: number; height: number; perPage: number }> = {
  story: { width: 1080, height: 1920, perPage: 8 },
  post: { width: 1080, height: 1350, perPage: 6 },
  landscape: { width: 1600, height: 900, perPage: 6 },
};

function compareMatchesAscendingByDate(a: Match, b: Match): number {
  const hasDateA = Boolean(a.scheduledDate && a.scheduledDate.trim());
  const hasDateB = Boolean(b.scheduledDate && b.scheduledDate.trim());

  if (hasDateA && !hasDateB) return -1;
  if (!hasDateA && hasDateB) return 1;

  if (hasDateA && hasDateB) {
    const keyA = `${a.scheduledDate} ${a.scheduledTime || '99:99'}`;
    const keyB = `${b.scheduledDate} ${b.scheduledTime || '99:99'}`;
    const cmp = keyA.localeCompare(keyB);
    if (cmp !== 0) return cmp;
  }

  if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
  return (a.bracketPosition || 0) - (b.bracketPosition || 0);
}

export function buildFlyerSections(params: {
  tournament: Tournament;
  divisions: Division[];
  matchdays: Matchday[];
  matches: Match[];
  groupBy: FlyerGroupBy;
  divisionFilterId: string;
  statusFilter: FlyerStatusFilter;
}): FlyerGroupSection[] {
  const {
    tournament,
    divisions,
    matchdays,
    matches,
    groupBy,
    divisionFilterId,
    statusFilter,
  } = params;

  const divMap = new Map(divisions.map((d) => [d.id, d]));
  const mdMap = new Map(matchdays.map((md) => [md.id, md]));

  const filtered = dedupeMatches(
    matches.filter(
      (m) =>
        m.tournamentId === tournament.id &&
        m.published &&
        !m.isBye &&
        Boolean(m.entryAId || m.entryBId)
    )
  )
    .filter((m) => (divisionFilterId === 'ALL' ? true : m.divisionId === divisionFilterId))
    .filter((m) => {
      const finished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
      if (statusFilter === 'scheduled') return !finished;
      if (statusFilter === 'finished') return finished;
      return true;
    })
    .sort(compareMatchesAscendingByDate);

  const grouped = new Map<string, FlyerGroupSection>();

  for (const m of filtered) {
    const div = divMap.get(m.divisionId);
    const md = m.matchdayId ? mdMap.get(m.matchdayId) : undefined;
    const isFinished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
    const dateKey = m.scheduledDate?.trim() || '9999-99-99';
    const dateLabel = m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Sin fecha';
    const timeLabel = m.scheduledTime ? `${m.scheduledTime}h` : '';
    const scoreLabel = isFinished
      ? formatScoreString(m.sets, m.status)
      : m.status === 'en_curso'
      ? 'EN CANCHA'
      : m.status === 'reprogramado'
      ? 'REPROG.'
      : 'PROG.';

    const item: FlyerMatchItem = {
      match: m,
      divisionName: div?.name || 'División',
      matchdayName: md?.name || '',
      dateKey,
      dateLabel,
      timeLabel,
      scoreLabel,
      isFinished,
    };

    let sectionKey = '';
    let sectionTitle = '';
    let sectionSubtitle: string | undefined;
    let sortDateKey = dateKey;
    let sortOrder = m.roundOrder;

    if (groupBy === 'categoria') {
      sectionKey = m.divisionId;
      sectionTitle = div?.name || 'Categoría';
      sectionSubtitle = div ? `${div.modality} · ${div.gender}` : undefined;
      sortOrder = 0;
    } else if (groupBy === 'jornada') {
      if (md) {
        sectionKey = md.id;
        sectionTitle = md.name;
        sectionSubtitle = md.date ? formatAsuncionDate(md.date) : div?.name;
        sortDateKey = md.date?.trim() || dateKey;
        sortOrder = md.order;
      } else {
        sectionKey = 'sin_jornada';
        sectionTitle = 'Sin jornada asignada';
        sortDateKey = '9999-99-99';
        sortOrder = 9999;
      }
    } else if (groupBy === 'fecha') {
      sectionKey = dateKey;
      sectionTitle = m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Sin fecha programada';
      sectionSubtitle = m.scheduledDate ? m.scheduledDate : 'Pendiente de programación';
      sortOrder = m.scheduledDate ? 0 : 9999;
    } else {
      sectionKey = `${m.roundOrder}_${m.roundName}`;
      sectionTitle = m.roundName;
      sortOrder = m.roundOrder;
    }

    const existing = grouped.get(sectionKey);
    if (!existing) {
      grouped.set(sectionKey, {
        key: sectionKey,
        title: sectionTitle,
        subtitle: sectionSubtitle,
        sortDateKey,
        sortOrder,
        items: [item],
      });
    } else {
      existing.items.push(item);
      if (dateKey < existing.sortDateKey) {
        existing.sortDateKey = dateKey;
      }
    }
  }

  // Asegurar orden ascendente por fecha dentro de cada sección y entre secciones si existe fecha
  const sections = Array.from(grouped.values()).map((sec) => ({
    ...sec,
    items: [...sec.items].sort((a, b) => compareMatchesAscendingByDate(a.match, b.match)),
  }));

  sections.sort((a, b) => {
    const hasA = a.sortDateKey !== '9999-99-99';
    const hasB = b.sortDateKey !== '9999-99-99';
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (hasA && hasB) {
      const dCmp = a.sortDateKey.localeCompare(b.sortDateKey);
      if (dCmp !== 0) return dCmp;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title);
  });

  return sections;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function loadImageOptional(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type FlatRow =
  | { type: 'header'; title: string; subtitle?: string; count: number }
  | { type: 'match'; item: FlyerMatchItem };

function paginateSections(sections: FlyerGroupSection[], maxMatchesPerPage: number): FlatRow[][] {
  const pages: FlatRow[][] = [];
  let current: FlatRow[] = [];
  let matchCountOnPage = 0;

  for (const sec of sections) {
    if (current.length > 0 && matchCountOnPage >= maxMatchesPerPage) {
      pages.push(current);
      current = [];
      matchCountOnPage = 0;
    }
    current.push({
      type: 'header',
      title: sec.title,
      subtitle: sec.subtitle,
      count: sec.items.length,
    });

    for (const item of sec.items) {
      if (matchCountOnPage >= maxMatchesPerPage) {
        pages.push(current);
        current = [
          {
            type: 'header',
            title: `${sec.title} (cont.)`,
            subtitle: sec.subtitle,
            count: sec.items.length,
          },
        ];
        matchCountOnPage = 0;
      }
      current.push({ type: 'match', item });
      matchCountOnPage++;
    }
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages.length > 0 ? pages : [[{ type: 'header', title: 'Sin cruces disponibles', count: 0 }]];
}

export async function renderTournamentFlyerPages(
  options: FlyerRenderOptions
): Promise<string[]> {
  const { tournament, sections, groupBy, format, theme, includeQr, customSubtitle, logoUrl } =
    options;
  const dims = FORMAT_DIMENSIONS[format];
  const pages = paginateSections(sections, dims.perPage);

  let qrImage: HTMLImageElement | null = null;
  if (includeQr) {
    try {
      const directUrl = buildTournamentDirectUrl(tournament.id);
      const qrDataUrl = await QRCode.toDataURL(directUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#0A1633', light: '#FFFFFF' },
      });
      qrImage = await loadImageOptional(qrDataUrl);
    } catch {
      qrImage = null;
    }
  }

  const logoImg = await loadImageOptional(logoUrl);

  const palette =
    theme === 'clean'
      ? {
          bgTop: '#FFFFFF',
          bgBottom: '#F1F5F9',
          headerBg: '#0A1633',
          headerText: '#FFFFFF',
          headerMuted: '#CBD5E1',
          accentA: '#7C1FA2',
          accentB: '#0284C7',
          cardBg: '#FFFFFF',
          cardBorder: '#CBD5E1',
          cardText: '#0A1633',
          cardMuted: '#475569',
          sectionBg: '#EDE9FE',
          sectionText: '#5B21B6',
          footerBg: '#0A1633',
          footerText: '#FFFFFF',
        }
      : theme === 'night'
      ? {
          bgTop: '#070E20',
          bgBottom: '#170B2B',
          headerBg: '#0F172A',
          headerText: '#FFFFFF',
          headerMuted: '#94A3B8',
          accentA: '#C026D3',
          accentB: '#38BDF8',
          cardBg: 'rgba(15, 23, 42, 0.9)',
          cardBorder: 'rgba(56, 189, 248, 0.28)',
          cardText: '#F8FAFC',
          cardMuted: '#94A3B8',
          sectionBg: 'rgba(124, 31, 162, 0.3)',
          sectionText: '#E9D5FF',
          footerBg: '#070E20',
          footerText: '#E2E8F0',
        }
      : {
          bgTop: '#0A1633',
          bgBottom: '#2B104A',
          headerBg: '#0E1C3F',
          headerText: '#FFFFFF',
          headerMuted: '#CBD5E1',
          accentA: '#9333EA',
          accentB: '#0284C7',
          cardBg: '#FFFFFF',
          cardBorder: '#E2E8F0',
          cardText: '#0A1633',
          cardMuted: '#475569',
          sectionBg: 'rgba(56, 189, 248, 0.16)',
          sectionText: '#7DD3FC',
          footerBg: '#09122B',
          footerText: '#F8FAFC',
        };

  const results: string[] = [];

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const rows = pages[pIdx];
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // Fondo degradado
    const bgGrad = ctx.createLinearGradient(0, 0, dims.width, dims.height);
    bgGrad.addColorStop(0, palette.bgTop);
    bgGrad.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, dims.width, dims.height);

    // Franja superior decorativa PlayPy
    const barGrad = ctx.createLinearGradient(0, 0, dims.width, 0);
    barGrad.addColorStop(0, '#7C1FA2');
    barGrad.addColorStop(0.55, '#0284C7');
    barGrad.addColorStop(1, '#38BDF8');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, dims.width, 12);

    const padX = format === 'landscape' ? 56 : 52;
    const contentWidth = dims.width - padX * 2;
    const headerHeight = format === 'landscape' ? 168 : 230;

    // Cabecera
    ctx.fillStyle = palette.headerBg;
    drawRoundedRect(ctx, padX, 34, contentWidth, headerHeight, 26);
    ctx.fill();

    // Logo PlayPy opcional
    let textStartX = padX + 34;
    if (logoImg) {
      const logoSize = format === 'landscape' ? 92 : 112;
      const logoY = 34 + (headerHeight - logoSize) / 2;
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, padX + 28, logoY, logoSize, logoSize, 20);
      ctx.fill();
      ctx.drawImage(logoImg, padX + 34, logoY + 6, logoSize - 12, logoSize - 12);
      textStartX = padX + 28 + logoSize + 24;
    }

    const headerTextMaxW = padX + contentWidth - textStartX - 32;

    ctx.fillStyle = '#38BDF8';
    ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      `PLAYPY · ${(customSubtitle || GROUP_BY_TITLES[groupBy]).toUpperCase()}`,
      textStartX,
      format === 'landscape' ? 80 : 94
    );

    ctx.fillStyle = palette.headerText;
    ctx.font = `800 ${format === 'landscape' ? 38 : 42}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(
      truncateText(ctx, tournament.name, headerTextMaxW),
      textStartX,
      format === 'landscape' ? 130 : 150
    );

    ctx.fillStyle = palette.headerMuted;
    ctx.font = '500 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      truncateText(
        ctx,
        `${tournament.venue} · ${tournament.city} · ${tournament.startDate} al ${tournament.endDate}`,
        headerTextMaxW
      ),
      textStartX,
      format === 'landscape' ? 170 : 196
    );

    if (format !== 'landscape') {
      ctx.fillStyle = '#E879F9';
      ctx.font = '600 20px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(
        `Orden ascendente por fecha · Hoja ${pIdx + 1}/${pages.length}`,
        textStartX,
        234
      );
    }

    // Cuerpo de cruces
    const footerHeight = includeQr ? (format === 'landscape' ? 124 : 156) : 84;
    const bodyTop = 34 + headerHeight + 24;
    const bodyBottom = dims.height - footerHeight - 24;
    let cursorY = bodyTop;

    const isLandscapeGrid = format === 'landscape';
    const matchCardHeight = isLandscapeGrid ? 114 : 118;
    const sectionHeaderHeight = 46;

    if (isLandscapeGrid) {
      // Layout 2 columnas en cartelera 16:9
      const colGap = 24;
      const colWidth = (contentWidth - colGap) / 2;
      let colIdx = 0;
      let rowTopY = cursorY;

      for (const row of rows) {
        if (row.type === 'header') {
          if (colIdx === 1) {
            colIdx = 0;
            rowTopY += matchCardHeight + 14;
          }
          if (rowTopY + sectionHeaderHeight > bodyBottom) break;
          ctx.fillStyle = palette.sectionBg;
          drawRoundedRect(ctx, padX, rowTopY, contentWidth, sectionHeaderHeight, 12);
          ctx.fill();

          ctx.fillStyle = palette.sectionText;
          ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillText(truncateText(ctx, row.title, contentWidth - 200), padX + 18, rowTopY + 30);

          ctx.textAlign = 'right';
          ctx.font = '600 18px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillText(`${row.count} cruces`, padX + contentWidth - 18, rowTopY + 30);
          ctx.textAlign = 'left';

          rowTopY += sectionHeaderHeight + 12;
        } else {
          if (rowTopY + matchCardHeight > bodyBottom) break;
          const x = padX + colIdx * (colWidth + colGap);
          drawMatchCard(ctx, row.item, x, rowTopY, colWidth, matchCardHeight, palette, groupBy);
          if (colIdx === 0) {
            colIdx = 1;
          } else {
            colIdx = 0;
            rowTopY += matchCardHeight + 14;
          }
        }
      }
    } else {
      for (const row of rows) {
        if (row.type === 'header') {
          if (cursorY + sectionHeaderHeight > bodyBottom) break;
          ctx.fillStyle = palette.sectionBg;
          drawRoundedRect(ctx, padX, cursorY, contentWidth, sectionHeaderHeight, 14);
          ctx.fill();

          ctx.fillStyle = palette.sectionText;
          ctx.font = '700 24px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillText(truncateText(ctx, row.title, contentWidth - 180), padX + 20, cursorY + 31);

          ctx.textAlign = 'right';
          ctx.font = '600 19px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillText(
            `${row.count} ${row.count === 1 ? 'cruce' : 'cruces'}`,
            padX + contentWidth - 20,
            cursorY + 31
          );
          ctx.textAlign = 'left';

          cursorY += sectionHeaderHeight + 12;
        } else {
          if (cursorY + matchCardHeight > bodyBottom) break;
          drawMatchCard(
            ctx,
            row.item,
            padX,
            cursorY,
            contentWidth,
            matchCardHeight,
            palette,
            groupBy
          );
          cursorY += matchCardHeight + 14;
        }
      }
    }

    // Pie con QR de acceso directo
    const footerY = dims.height - footerHeight;
    ctx.fillStyle = palette.footerBg;
    ctx.fillRect(0, footerY, dims.width, footerHeight);

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(0, footerY, dims.width, 3);

    const qrSize = includeQr && qrImage ? footerHeight - 30 : 0;
    if (includeQr && qrImage) {
      const qrX = dims.width - padX - qrSize;
      const qrY = footerY + 15;
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 12);
      ctx.fill();
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    }

    const footerMaxW = contentWidth - (qrSize ? qrSize + 36 : 0);
    ctx.fillStyle = palette.footerText;
    ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      truncateText(
        ctx,
        `PlayPy · Acceso en vivo: ${tournament.name}`,
        footerMaxW
      ),
      padX,
      footerY + (includeQr ? 56 : 48)
    );

    if (includeQr) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 18px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(
        truncateText(
          ctx,
          `Escaneá el QR para ver horarios, tabla y resultados · Pág. ${pIdx + 1}/${pages.length}`,
          footerMaxW
        ),
        padX,
        footerY + 92
      );
    }

    results.push(canvas.toDataURL('image/png'));
  }

  return results;
}

function drawMatchCard(
  ctx: CanvasRenderingContext2D,
  item: FlyerMatchItem,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: {
    cardBg: string;
    cardBorder: string;
    cardText: string;
    cardMuted: string;
    accentA: string;
    accentB: string;
  },
  groupBy: FlyerGroupBy
) {
  ctx.fillStyle = palette.cardBg;
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();

  // Banda lateral izquierda sutil de acento
  const stripeGrad = ctx.createLinearGradient(x, y, x, y + h);
  stripeGrad.addColorStop(0, palette.accentA);
  stripeGrad.addColorStop(1, palette.accentB);
  ctx.fillStyle = stripeGrad;
  drawRoundedRect(ctx, x + 8, y + 14, 6, h - 28, 3);
  ctx.fill();

  const innerX = x + 28;
  const innerRight = x + w - 22;
  const scoreColW = 190;
  const nameMaxW = w - 28 - scoreColW - 26;

  // Línea superior de metadatos: Fecha/hora · Cancha · Ronda / Categoría
  const metaParts: string[] = [];
  metaParts.push(
    item.timeLabel ? `${item.dateLabel} · ${item.timeLabel}` : item.dateLabel
  );
  if (item.match.courtName) metaParts.push(item.match.courtName);
  if (groupBy !== 'categoria') metaParts.push(item.divisionName);
  if (groupBy !== 'ronda') metaParts.push(item.match.roundName);

  ctx.fillStyle = palette.accentB;
  ctx.font = '700 18px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(truncateText(ctx, metaParts.join(' · '), nameMaxW + 40), innerX, y + 32);

  // Jugador / Pareja A
  const winA = item.match.winnerEntryId && item.match.winnerEntryId === item.match.entryAId;
  const winB = item.match.winnerEntryId && item.match.winnerEntryId === item.match.entryBId;

  ctx.fillStyle = palette.cardText;
  ctx.font = `${winA ? '800' : '600'} 25px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winA ? '★ ' : ''}${item.match.entryAName}`, nameMaxW),
    innerX,
    y + 66
  );

  // Jugador / Pareja B
  ctx.fillStyle = winB ? palette.cardText : palette.cardMuted;
  ctx.font = `${winB ? '800' : '600'} 25px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winB ? '★ ' : ''}${item.match.entryBName}`, nameMaxW),
    innerX,
    y + 98
  );

  // Estado / Marcador a la derecha
  ctx.textAlign = 'right';
  ctx.fillStyle = item.isFinished ? palette.accentA : palette.accentB;
  ctx.font = '800 22px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(truncateText(ctx, item.scoreLabel, scoreColW), innerRight, y + 72);

  if (item.matchdayName && groupBy !== 'jornada') {
    ctx.fillStyle = palette.cardMuted;
    ctx.font = '500 16px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(truncateText(ctx, item.matchdayName, scoreColW), innerRight, y + 98);
  }
  ctx.textAlign = 'left';
}
