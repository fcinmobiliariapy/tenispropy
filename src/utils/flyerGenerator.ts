import QRCode from 'qrcode';
import { Division, Match, Matchday, Tournament } from '../types/tennis';
import { formatScoreString } from './itfRules';
import {
  compareMatchesByRound,
  dedupeMatches,
  formatAsuncionDate,
  getKnockoutStageRank,
  isRealFinalMatch,
  resolveNextKnockoutMatch,
} from './tournamentEngine';
import { buildTournamentDirectUrl } from './tournamentLinks';

export type FlyerGroupBy = 'categoria' | 'jornada' | 'fecha' | 'ronda';
export type FlyerFormat = 'story' | 'post' | 'landscape' | 'a4_portrait' | 'a4_landscape';
export type FlyerTheme = 'playpy' | 'night' | 'clean';
export type FlyerStatusFilter = 'all' | 'scheduled' | 'finished';
export type FlyerLayoutStyle = 'organigrama' | 'lista';

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
  fitSinglePage?: boolean;
  layoutStyle?: FlyerLayoutStyle;
  divisions?: Division[];
  matchdays?: Matchday[];
  rawMatches?: Match[];
  divisionFilterId?: string;
  statusFilter?: FlyerStatusFilter;
  customSubtitle?: string;
  logoUrl?: string;
}

export interface FlyerRenderResult {
  pages: string[];
  columnsUsed: number;
  densityLabel: string;
  isSingleSheet: boolean;
  orientation: 'portrait' | 'landscape';
}

const GROUP_BY_TITLES: Record<FlyerGroupBy, string> = {
  categoria: 'Cruces por Categoría / División',
  jornada: 'Cruces por Jornada',
  fecha: 'Programación por Fecha',
  ronda: 'Cruces por Ronda',
};

export const FORMAT_DIMENSIONS: Record<
  FlyerFormat,
  { width: number; height: number; perPage: number; orientation: 'portrait' | 'landscape' }
> = {
  a4_landscape: { width: 1754, height: 1240, perPage: 24, orientation: 'landscape' },
  a4_portrait: { width: 1240, height: 1754, perPage: 22, orientation: 'portrait' },
  landscape: { width: 1600, height: 900, perPage: 16, orientation: 'landscape' },
  story: { width: 1080, height: 1920, perPage: 16, orientation: 'portrait' },
  post: { width: 1080, height: 1350, perPage: 12, orientation: 'portrait' },
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
  if (maxWidth <= 6) return '';
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

interface FlyerPalette {
  bgTop: string;
  bgBottom: string;
  headerBg: string;
  headerText: string;
  headerMuted: string;
  accentA: string;
  accentB: string;
  cardBg: string;
  cardBorder: string;
  cardDivider: string;
  cardText: string;
  cardMuted: string;
  sectionBg: string;
  sectionText: string;
  lineMuted: string;
  lineActive: string;
  footerBg: string;
  footerText: string;
}

function getFlyerPalette(theme: FlyerTheme): FlyerPalette {
  if (theme === 'clean') {
    return {
      bgTop: '#FFFFFF',
      bgBottom: '#F1F5F9',
      headerBg: '#0A1633',
      headerText: '#FFFFFF',
      headerMuted: '#CBD5E1',
      accentA: '#7C1FA2',
      accentB: '#0284C7',
      cardBg: '#FFFFFF',
      cardBorder: '#CBD5E1',
      cardDivider: '#E2E8F0',
      cardText: '#0A1633',
      cardMuted: '#475569',
      sectionBg: '#EDE9FE',
      sectionText: '#5B21B6',
      lineMuted: '#94A3B8',
      lineActive: '#7C1FA2',
      footerBg: '#0A1633',
      footerText: '#FFFFFF',
    };
  }
  if (theme === 'night') {
    return {
      bgTop: '#070E20',
      bgBottom: '#170B2B',
      headerBg: '#0F172A',
      headerText: '#FFFFFF',
      headerMuted: '#94A3B8',
      accentA: '#C026D3',
      accentB: '#38BDF8',
      cardBg: 'rgba(15, 23, 42, 0.94)',
      cardBorder: 'rgba(56, 189, 248, 0.34)',
      cardDivider: 'rgba(148, 163, 184, 0.2)',
      cardText: '#F8FAFC',
      cardMuted: '#94A3B8',
      sectionBg: 'rgba(124, 31, 162, 0.36)',
      sectionText: '#E9D5FF',
      lineMuted: 'rgba(148, 163, 184, 0.45)',
      lineActive: '#38BDF8',
      footerBg: '#070E20',
      footerText: '#E2E8F0',
    };
  }
  return {
    bgTop: '#0A1633',
    bgBottom: '#2B104A',
    headerBg: '#0E1C3F',
    headerText: '#FFFFFF',
    headerMuted: '#CBD5E1',
    accentA: '#9333EA',
    accentB: '#0284C7',
    cardBg: '#FFFFFF',
    cardBorder: '#CBD5E1',
    cardDivider: '#E2E8F0',
    cardText: '#0A1633',
    cardMuted: '#475569',
    sectionBg: 'rgba(56, 189, 248, 0.16)',
    sectionText: '#7DD3FC',
    lineMuted: 'rgba(203, 213, 225, 0.42)',
    lineActive: '#38BDF8',
    footerBg: '#09122B',
    footerText: '#F8FAFC',
  };
}

function drawHeaderAndFooter(params: {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  padX: number;
  headerY: number;
  headerH: number;
  footerH: number;
  tournament: Tournament;
  subtitleLine: string;
  includeQr: boolean;
  qrImage: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  palette: FlyerPalette;
  pageLabel: string;
}) {
  const {
    ctx,
    canvasW,
    canvasH,
    padX,
    headerY,
    headerH,
    footerH,
    tournament,
    subtitleLine,
    includeQr,
    qrImage,
    logoImg,
    palette,
    pageLabel,
  } = params;

  const contentWidth = canvasW - padX * 2;

  const bgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const barGrad = ctx.createLinearGradient(0, 0, canvasW, 0);
  barGrad.addColorStop(0, '#7C1FA2');
  barGrad.addColorStop(0.55, '#0284C7');
  barGrad.addColorStop(1, '#38BDF8');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, canvasW, 8);

  ctx.fillStyle = palette.headerBg;
  drawRoundedRect(ctx, padX, headerY, contentWidth, headerH, 20);
  ctx.fill();

  let textStartX = padX + 22;
  if (logoImg) {
    const logoSize = Math.min(82, headerH - 28);
    const logoY = headerY + (headerH - logoSize) / 2;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, padX + 18, logoY, logoSize, logoSize, 14);
    ctx.fill();
    ctx.drawImage(logoImg, padX + 23, logoY + 5, logoSize - 10, logoSize - 10);
    textStartX = padX + 18 + logoSize + 18;
  }

  let textRightLimit = padX + contentWidth - 22;
  if (includeQr && qrImage) {
    const qrBoxSize = Math.min(104, headerH - 20);
    const qrX = padX + contentWidth - qrBoxSize - 16;
    const qrY = headerY + (headerH - qrBoxSize) / 2;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, qrX, qrY, qrBoxSize, qrBoxSize, 12);
    ctx.fill();
    ctx.drawImage(qrImage, qrX + 6, qrY + 6, qrBoxSize - 12, qrBoxSize - 12);
    textRightLimit = qrX - 18;
  }

  const headerTextMaxW = Math.max(180, textRightLimit - textStartX);

  ctx.fillStyle = '#38BDF8';
  ctx.font = '700 16px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(truncateText(ctx, subtitleLine, headerTextMaxW), textStartX, headerY + 32);

  ctx.fillStyle = palette.headerText;
  ctx.font = '800 30px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(
    truncateText(ctx, tournament.name, headerTextMaxW),
    textStartX,
    headerY + 68
  );

  ctx.fillStyle = palette.headerMuted;
  ctx.font = '500 16px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(
    truncateText(
      ctx,
      `${tournament.venue} · ${tournament.city} · ${tournament.startDate} al ${tournament.endDate}`,
      headerTextMaxW
    ),
    textStartX,
    headerY + 96
  );

  if (headerH >= 134) {
    ctx.fillStyle = '#E879F9';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(truncateText(ctx, pageLabel, headerTextMaxW), textStartX, headerY + 120);
  }

  const footerY = canvasH - footerH;
  ctx.fillStyle = palette.footerBg;
  ctx.fillRect(0, footerY, canvasW, footerH);

  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(0, footerY, canvasW, 2);

  ctx.fillStyle = palette.footerText;
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(
    truncateText(
      ctx,
      `PlayPy · Acceso en vivo: ${tournament.name}${includeQr ? ' · Escaneá el QR arriba a la derecha' : ''}`,
      contentWidth - 220
    ),
    padX,
    footerY + 26
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(pageLabel, padX + contentWidth, footerY + 26);
  ctx.textAlign = 'left';
}

/* ============================================================================
 * MODO ORGANIGRAMA (Árbol jerárquico con llaves y líneas ortogonales conectadas)
 * ============================================================================ */

interface OrganigramRoundColumn {
  roundName: string;
  roundOrder: number;
  matches: Match[];
}

interface DivisionOrganigramData {
  division: Division;
  koRounds: OrganigramRoundColumn[];
  koMatchesAll: Match[];
  thirdPlaceMatch: Match | null;
  groupBranches: Array<{ title: string; matches: Match[] }>;
}

interface PlacedOrgNode {
  match: Match;
  x: number;
  y: number;
  w: number;
  h: number;
  centerY: number;
  dimmed: boolean;
  isThirdPlace?: boolean;
}

interface OrgConnector {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  midX: number;
  active: boolean;
}

function matchesStatusFilter(m: Match, statusFilter: FlyerStatusFilter): boolean {
  if (statusFilter === 'all') return true;
  const finished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
  return statusFilter === 'finished' ? finished : !finished;
}

function buildDivisionOrganigramData(params: {
  tournament: Tournament;
  divisions: Division[];
  matchdays: Matchday[];
  matches: Match[];
  divisionFilterId: string;
  statusFilter: FlyerStatusFilter;
  groupBy: FlyerGroupBy;
}): DivisionOrganigramData[] {
  const { tournament, divisions, matchdays, matches, divisionFilterId, statusFilter, groupBy } =
    params;

  const mdMap = new Map(matchdays.map((md) => [md.id, md]));
  const targetDivs = divisions
    .filter((d) => d.tournamentId === tournament.id)
    .filter((d) => (divisionFilterId === 'ALL' ? true : d.id === divisionFilterId));

  const publishedAll = dedupeMatches(
    matches.filter((m) => m.tournamentId === tournament.id && m.published)
  );

  const result: DivisionOrganigramData[] = [];

  for (const div of targetDivs) {
    const divMatches = publishedAll.filter((m) => m.divisionId === div.id);
    if (divMatches.length === 0) continue;

    // En organigrama eliminatorio conservamos los BYEs para que las ramas no queden partidas
    const koAll = divMatches
      .filter((m) => m.phase === 'eliminacion')
      .sort(compareMatchesByRound);

    const nonThirdKo = koAll.filter(
      (m) => !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
    );
    const thirdPlaceMatch =
      koAll.find((m) => m.isThirdPlace || m.roundName === 'Tercer Puesto') || null;

    const roundMap = new Map<string, Match[]>();
    for (const m of nonThirdKo) {
      const key = m.roundName.trim().toLowerCase() || `r${m.roundOrder}`;
      const list = roundMap.get(key);
      if (list) list.push(m);
      else roundMap.set(key, [m]);
    }

    const koRounds: OrganigramRoundColumn[] = Array.from(roundMap.values())
      .sort((a, b) => {
        const rankDiff = getKnockoutStageRank(a[0].roundName) - getKnockoutStageRank(b[0].roundName);
        if (rankDiff !== 0) return rankDiff;
        return a[0].roundOrder - b[0].roundOrder;
      })
      .map((list) => {
        const sorted = [...list].sort(
          (a, b) =>
            (a.bracketPosition ?? 9999) - (b.bracketPosition ?? 9999) ||
            (a.createdAt || '').localeCompare(b.createdAt || '') ||
            a.id.localeCompare(b.id)
        );
        return {
          roundName: sorted[0].roundName,
          roundOrder: sorted[0].roundOrder,
          matches: sorted,
        };
      });

    // Partidos de grupos (si existen)
    const groupMatches = divMatches
      .filter((m) => m.phase === 'grupos' && !m.isBye && Boolean(m.entryAId || m.entryBId))
      .filter((m) => matchesStatusFilter(m, statusFilter))
      .sort(compareMatchesAscendingByDate);

    const branchMap = new Map<string, Match[]>();
    for (const gm of groupMatches) {
      const md = gm.matchdayId ? mdMap.get(gm.matchdayId) : undefined;
      const bTitle =
        groupBy === 'jornada'
          ? md?.name || 'Sin jornada'
          : groupBy === 'fecha'
          ? gm.scheduledDate
            ? formatAsuncionDate(gm.scheduledDate)
            : 'Sin fecha'
          : gm.roundName || 'Grupo';
      const arr = branchMap.get(bTitle);
      if (arr) arr.push(gm);
      else branchMap.set(bTitle, [gm]);
    }
    const groupBranches = Array.from(branchMap.entries()).map(([title, list]) => ({
      title,
      matches: list,
    }));

    // Si hay filtro por estado y ningún partido coincide en la división, omitir
    const anyKoMatchesFilter = nonThirdKo.some((m) => matchesStatusFilter(m, statusFilter));
    if (statusFilter !== 'all' && !anyKoMatchesFilter && groupBranches.length === 0) {
      continue;
    }

    if (koRounds.length > 0 || groupBranches.length > 0) {
      result.push({
        division: div,
        koRounds,
        koMatchesAll: nonThirdKo,
        thirdPlaceMatch,
        groupBranches,
      });
    }
  }

  return result;
}

interface DivisionOrganigramGeometry {
  divData: DivisionOrganigramData;
  topY: number;
  totalHeight: number;
  bannerH: number;
  roundHeaderY: number;
  roundHeaderH: number;
  roundColBoxes: Array<{ title: string; x: number; w: number; count: number }>;
  nodes: PlacedOrgNode[];
  connectors: OrgConnector[];
  championBox: {
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    runnerUpName?: string | null;
  } | null;
  groupOrgNodes: Array<{
    branchTitle: string;
    branchX: number;
    branchY: number;
    branchW: number;
    branchH: number;
    cards: PlacedOrgNode[];
    connectors: OrgConnector[];
  }>;
  groupRootBox: { x: number; y: number; w: number; h: number; label: string } | null;
}

function layoutDivisionOrganigram(params: {
  divData: DivisionOrganigramData;
  startX: number;
  startY: number;
  contentW: number;
  nodeH: number;
  nodeGapY: number;
  colGap: number;
  statusFilter: FlyerStatusFilter;
}): DivisionOrganigramGeometry {
  const { divData, startX, startY, contentW, nodeH, nodeGapY, colGap, statusFilter } = params;
  const bannerH = 38;
  const roundHeaderH = 28;
  let cursorY = startY + bannerH + 10;

  const nodes: PlacedOrgNode[] = [];
  const connectors: OrgConnector[] = [];
  const roundColBoxes: Array<{ title: string; x: number; w: number; count: number }> = [];
  let championBox: DivisionOrganigramGeometry['championBox'] = null;
  let roundHeaderY = cursorY;

  // 1. Organigrama de Grupos / Jornadas (cuando no hay cuadro eliminatorio o como bloque previo)
  const groupOrgNodes: DivisionOrganigramGeometry['groupOrgNodes'] = [];
  let groupRootBox: DivisionOrganigramGeometry['groupRootBox'] = null;

  if (divData.groupBranches.length > 0 && divData.koRounds.length === 0) {
    // Organigrama puro de grupos: Nodo raíz (Categoría) -> Ramas (Grupos/Fechas/Jornadas) -> Partidos
    const rootW = Math.min(230, Math.round(contentW * 0.18));
    const branchW = Math.min(210, Math.round(contentW * 0.17));
    const leafColGap = 28;
    const matchAreaX = startX + rootW + leafColGap + branchW + leafColGap;
    const matchAreaW = Math.max(240, contentW - (matchAreaX - startX));
    const maxMatchesPerBranchRow = matchAreaW >= 540 ? 2 : 1;
    const leafGapX = 12;
    const leafW =
      maxMatchesPerBranchRow === 2
        ? (matchAreaW - leafGapX) / 2
        : matchAreaW;
    const leafH = Math.max(46, nodeH - 4);
    const leafGapY = Math.max(6, nodeGapY - 1);

    const branchStartY = cursorY;
    let branchY = branchStartY;

    for (const br of divData.groupBranches) {
      const rows = Math.ceil(br.matches.length / maxMatchesPerBranchRow);
      const branchBlockH = Math.max(leafH, rows * leafH + (rows - 1) * leafGapY);
      const brBoxH = Math.min(44, branchBlockH);
      const brBoxY = branchY + (branchBlockH - brBoxH) / 2;
      const brX = startX + rootW + leafColGap;

      const cards: PlacedOrgNode[] = [];
      const brConnectors: OrgConnector[] = [];

      for (let i = 0; i < br.matches.length; i++) {
        const r = Math.floor(i / maxMatchesPerBranchRow);
        const c = i % maxMatchesPerBranchRow;
        const cx = matchAreaX + c * (leafW + leafGapX);
        const cy = branchY + r * (leafH + leafGapY);
        const cCenterY = cy + leafH / 2;
        cards.push({
          match: br.matches[i],
          x: cx,
          y: cy,
          w: leafW,
          h: leafH,
          centerY: cCenterY,
          dimmed: false,
        });
        if (c === 0) {
          brConnectors.push({
            fromX: brX + branchW,
            fromY: brBoxY + brBoxH / 2,
            toX: cx,
            toY: cCenterY,
            midX: brX + branchW + leafColGap * 0.5,
            active: true,
          });
        }
      }

      groupOrgNodes.push({
        branchTitle: br.title,
        branchX: brX,
        branchY: brBoxY,
        branchW,
        branchH: brBoxH,
        cards,
        connectors: brConnectors,
      });

      branchY += branchBlockH + 14;
    }

    const totalBranchesH = Math.max(48, branchY - 14 - branchStartY);
    const rootH = Math.min(62, totalBranchesH);
    const rootY = branchStartY + (totalBranchesH - rootH) / 2;
    groupRootBox = {
      x: startX,
      y: rootY,
      w: rootW,
      h: rootH,
      label: divData.division.name,
    };

    for (const brNode of groupOrgNodes) {
      connectors.push({
        fromX: startX + rootW,
        fromY: rootY + rootH / 2,
        toX: brNode.branchX,
        toY: brNode.branchY + brNode.branchH / 2,
        midX: startX + rootW + leafColGap * 0.5,
        active: true,
      });
    }

    cursorY = branchY;
  } else if (divData.groupBranches.length > 0 && divData.koRounds.length > 0) {
    // Si tiene grupos + eliminación, mostramos resumen compacto de grupos en fila superior antes del árbol KO
    const groupCols = Math.min(4, Math.max(2, Math.floor(contentW / 240)));
    const gGap = 10;
    const gColW = (contentW - gGap * (groupCols - 1)) / groupCols;
    const allGroupMatches = divData.groupBranches.flatMap((b) => b.matches);
    const gH = 44;
    for (let i = 0; i < allGroupMatches.length; i++) {
      const r = Math.floor(i / groupCols);
      const c = i % groupCols;
      const gx = startX + c * (gColW + gGap);
      const gy = cursorY + r * (gH + 6);
      nodes.push({
        match: allGroupMatches[i],
        x: gx,
        y: gy,
        w: gColW,
        h: gH,
        centerY: gy + gH / 2,
        dimmed: false,
      });
    }
    const gRows = Math.ceil(allGroupMatches.length / groupCols);
    if (gRows > 0) {
      cursorY += gRows * gH + (gRows - 1) * 6 + 14;
    }
  }

  // 2. Organigrama de Fase Eliminatoria (izquierda -> derecha con líneas ortogonales)
  if (divData.koRounds.length > 0) {
    roundHeaderY = cursorY;
    cursorY += roundHeaderH + 8;

    const finalRoundCol = divData.koRounds[divData.koRounds.length - 1];
    const finalMatch =
      finalRoundCol.matches.find((m) => isRealFinalMatch(m, divData.koMatchesAll)) ||
      (finalRoundCol.matches.length === 1 ? finalRoundCol.matches[0] : null);
    const hasChampionLeaf = Boolean(finalMatch?.winnerEntryId && finalMatch?.winnerName);

    const totalCols = divData.koRounds.length + (hasChampionLeaf ? 1 : 0);
    const champW = hasChampionLeaf ? Math.min(200, Math.round(contentW * 0.16)) : 0;
    const roundsTotalW = hasChampionLeaf ? contentW - champW - colGap : contentW;
    const colW = (roundsTotalW - colGap * (divData.koRounds.length - 1)) / divData.koRounds.length;

    const placedByMatchId = new Map<string, PlacedOrgNode>();
    const placedByRound: PlacedOrgNode[][] = [];

    for (let rIdx = 0; rIdx < divData.koRounds.length; rIdx++) {
      const round = divData.koRounds[rIdx];
      const colX = startX + rIdx * (colW + colGap);
      roundColBoxes.push({
        title: round.roundName,
        x: colX,
        w: colW,
        count: round.matches.length,
      });

      const colNodes: PlacedOrgNode[] = [];
      let minTopY = cursorY;

      for (let mIdx = 0; mIdx < round.matches.length; mIdx++) {
        const m = round.matches[mIdx];
        let idealCenterY = cursorY + mIdx * (nodeH + nodeGapY) + nodeH / 2;

        if (rIdx > 0) {
          const prevRound = divData.koRounds[rIdx - 1];
          const prevNodes = placedByRound[rIdx - 1] || [];
          const feeders: PlacedOrgNode[] = [];

          for (const prevN of prevNodes) {
            const resolved = resolveNextKnockoutMatch(prevN.match, divData.koMatchesAll);
            if (resolved && resolved.nextMatch.id === m.id) {
              feeders.push(prevN);
            }
          }

          if (feeders.length >= 2) {
            idealCenterY =
              (feeders[0].centerY + feeders[feeders.length - 1].centerY) / 2;
          } else if (feeders.length === 1) {
            idealCenterY = feeders[0].centerY;
          } else {
            // Respaldo estructural si algún enlace faltara
            const fA = prevRound.matches[mIdx * 2];
            const fB = prevRound.matches[mIdx * 2 + 1];
            const nA = fA ? placedByMatchId.get(fA.id) : undefined;
            const nB = fB ? placedByMatchId.get(fB.id) : undefined;
            if (nA && nB) {
              idealCenterY = (nA.centerY + nB.centerY) / 2;
            } else if (nA) {
              idealCenterY = nA.centerY;
            }
          }
        }

        const topY = Math.max(minTopY, Math.round(idealCenterY - nodeH / 2));
        const node: PlacedOrgNode = {
          match: m,
          x: colX,
          y: topY,
          w: colW,
          h: nodeH,
          centerY: topY + nodeH / 2,
          dimmed: !matchesStatusFilter(m, statusFilter),
        };
        colNodes.push(node);
        nodes.push(node);
        placedByMatchId.set(m.id, node);
        minTopY = topY + nodeH + Math.max(4, Math.round(nodeGapY * 0.75));
      }

      placedByRound.push(colNodes);
    }

    // Conectores ortogonales entre cada ronda r y r + 1
    for (let rIdx = 0; rIdx < divData.koRounds.length - 1; rIdx++) {
      const colNodes = placedByRound[rIdx];
      for (const fNode of colNodes) {
        const resolved = resolveNextKnockoutMatch(fNode.match, divData.koMatchesAll);
        if (!resolved) continue;
        const targetNode = placedByMatchId.get(resolved.nextMatch.id);
        if (!targetNode) continue;

        connectors.push({
          fromX: fNode.x + fNode.w,
          fromY: fNode.centerY,
          toX: targetNode.x,
          toY: targetNode.centerY,
          midX: fNode.x + fNode.w + colGap * 0.5,
          active: Boolean(fNode.match.winnerEntryId),
        });
      }
    }

    // Nodo final de Campeón si la Final ya tiene ganador
    if (hasChampionLeaf && finalMatch) {
      const finalNode = placedByMatchId.get(finalMatch.id);
      if (finalNode) {
        const champX = startX + divData.koRounds.length * (colW + colGap);
        const champH = Math.max(54, nodeH);
        const champY = Math.round(finalNode.centerY - champH / 2);
        const champName =
          finalMatch.winnerEntryId === finalMatch.entryAId
            ? finalMatch.entryAName
            : finalMatch.winnerEntryId === finalMatch.entryBId
            ? finalMatch.entryBName
            : finalMatch.winnerName || 'Campeón';
        const runnerUpName =
          finalMatch.winnerEntryId === finalMatch.entryAId
            ? finalMatch.entryBName
            : finalMatch.entryAName;

        roundColBoxes.push({
          title: 'Campeón',
          x: champX,
          w: champW,
          count: 1,
        });
        championBox = {
          x: champX,
          y: champY,
          w: champW,
          h: champH,
          name: champName,
          runnerUpName,
        };
        connectors.push({
          fromX: finalNode.x + finalNode.w,
          fromY: finalNode.centerY,
          toX: champX,
          toY: champY + champH / 2,
          midX: finalNode.x + finalNode.w + colGap * 0.5,
          active: true,
        });
      }
    }

    // Partido por el 3er Puesto debajo de la Final si existe
    if (divData.thirdPlaceMatch && finalMatch) {
      const finalNode = placedByMatchId.get(finalMatch.id);
      const tpX = finalNode ? finalNode.x : startX + (totalCols - 1) * (colW + colGap);
      const tpBaseY = finalNode ? finalNode.y + finalNode.h + 24 : cursorY;
      const tpNode: PlacedOrgNode = {
        match: divData.thirdPlaceMatch,
        x: tpX,
        y: tpBaseY,
        w: colW,
        h: nodeH,
        centerY: tpBaseY + nodeH / 2,
        dimmed: !matchesStatusFilter(divData.thirdPlaceMatch, statusFilter),
        isThirdPlace: true,
      };
      nodes.push(tpNode);
    }

    const maxNodeBottom = Math.max(
      cursorY,
      ...nodes.map((n) => n.y + n.h),
      championBox ? championBox.y + championBox.h : 0
    );
    cursorY = maxNodeBottom;
  }

  return {
    divData,
    topY: startY,
    totalHeight: Math.max(bannerH + 40, cursorY - startY),
    bannerH,
    roundHeaderY,
    roundHeaderH,
    roundColBoxes,
    nodes,
    connectors,
    championBox,
    groupOrgNodes,
    groupRootBox,
  };
}

function drawOrganigramMatchBox(
  ctx: CanvasRenderingContext2D,
  node: PlacedOrgNode,
  palette: FlyerPalette,
  groupBy: FlyerGroupBy
) {
  const { match: m, x, y, w, h, dimmed, isThirdPlace } = node;

  ctx.save();
  if (dimmed) {
    ctx.globalAlpha = 0.42;
  }

  ctx.fillStyle = palette.cardBg;
  ctx.strokeStyle = m.winnerEntryId ? palette.accentA : palette.cardBorder;
  ctx.lineWidth = m.winnerEntryId ? 1.8 : 1.3;
  drawRoundedRect(ctx, x, y, w, h, Math.min(10, Math.round(h * 0.16)));
  ctx.fill();
  ctx.stroke();

  // Micro banda de metadatos arriba (Fecha · Hora · Cancha o BYE / 3er Puesto)
  const showMeta = h >= 44;
  const metaH = showMeta ? Math.max(15, Math.round(h * 0.28)) : 0;
  const rowZoneH = (h - metaH) / 2;

  if (showMeta) {
    const datePart = m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : '';
    const timePart = m.scheduledTime ? `${m.scheduledTime}h` : '';
    const courtPart = m.courtName || '';
    const metaParts: string[] = [];
    if (isThirdPlace) metaParts.push('3er Puesto');
    if (m.isBye) {
      metaParts.push('Pase libre (BYE)');
    } else {
      if (datePart || timePart) {
        metaParts.push([datePart, timePart].filter(Boolean).join(' '));
      } else if (groupBy === 'ronda') {
        metaParts.push(`Llave #${m.bracketPosition ?? '?'}`);
      } else {
        metaParts.push('Por programar');
      }
      if (courtPart) metaParts.push(courtPart);
    }

    const metaFontPx = Math.max(9.5, Math.min(12, Math.round(metaH * 0.62)));
    ctx.fillStyle = m.isBye ? palette.accentA : palette.accentB;
    ctx.font = `700 ${metaFontPx}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(
      truncateText(ctx, metaParts.join(' · '), w - 16),
      x + 8,
      y + Math.round(metaH * 0.76)
    );

    // Divisor bajo meta
    ctx.strokeStyle = palette.cardDivider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + metaH);
    ctx.lineTo(x + w - 1, y + metaH);
    ctx.stroke();
  }

  // Línea divisoria entre Jugador A y Jugador B
  const midRowY = y + metaH + rowZoneH;
  ctx.strokeStyle = palette.cardDivider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 1, midRowY);
  ctx.lineTo(x + w - 1, midRowY);
  ctx.stroke();

  const winA = Boolean(m.winnerEntryId && m.winnerEntryId === m.entryAId);
  const winB = Boolean(m.winnerEntryId && m.winnerEntryId === m.entryBId);

  // Preparar scores por fila (sets como en planilla oficial de cuadro)
  const hasSets = m.sets && m.sets.length > 0;
  const setColW = hasSets ? Math.min(Math.round(w * 0.34), m.sets.length * 19 + 8) : 50;
  const nameMaxW = Math.max(40, w - 16 - setColW);
  const nameFontPx = Math.max(10.5, Math.min(14.5, Math.round(rowZoneH * 0.56)));
  const scoreFontPx = Math.max(10, Math.min(13.5, Math.round(rowZoneH * 0.52)));

  // Indicador de ganador lateral en fila ganadora
  if (winA) {
    ctx.fillStyle = palette.accentA;
    ctx.fillRect(x + 1, y + metaH + 2, 3.5, Math.max(6, rowZoneH - 4));
  } else if (winB) {
    ctx.fillStyle = palette.accentA;
    ctx.fillRect(x + 1, midRowY + 2, 3.5, Math.max(6, rowZoneH - 4));
  }

  // Texto Fila A
  const textAY = y + metaH + rowZoneH * 0.68;
  ctx.fillStyle = winA || !winB ? palette.cardText : palette.cardMuted;
  ctx.font = `${winA ? '800' : '600'} ${nameFontPx}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winA ? '★ ' : ''}${m.entryAName}`, nameMaxW),
    x + 9,
    textAY
  );

  // Texto Fila B
  const textBY = midRowY + rowZoneH * 0.68;
  ctx.fillStyle = winB ? palette.cardText : palette.cardMuted;
  ctx.font = `${winB ? '800' : '600'} ${nameFontPx}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winB ? '★ ' : ''}${m.entryBName}`, nameMaxW),
    x + 9,
    textBY
  );

  // Marcador / Estado a la derecha de cada fila
  ctx.textAlign = 'right';
  if (hasSets) {
    const scoreStrA = m.sets.map((s) => `${s.a}`).join('  ');
    const scoreStrB = m.sets.map((s) => `${s.b}`).join('  ');
    ctx.font = `${winA ? '800' : '600'} ${scoreFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = winA ? palette.accentA : palette.cardMuted;
    ctx.fillText(truncateText(ctx, scoreStrA, setColW), x + w - 7, textAY);

    ctx.font = `${winB ? '800' : '600'} ${scoreFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = winB ? palette.accentA : palette.cardMuted;
    ctx.fillText(truncateText(ctx, scoreStrB, setColW), x + w - 7, textBY);
  } else if (m.isBye) {
    ctx.font = `700 ${Math.max(9.5, scoreFontPx - 1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = palette.accentA;
    ctx.fillText('BYE', x + w - 7, winA ? textAY : textBY);
  } else if (m.status !== 'programado') {
    const shortTag =
      m.status === 'wo'
        ? 'W.O.'
        : m.status === 'retiro'
        ? 'RET.'
        : m.status === 'descalificado'
        ? 'DQ'
        : m.status === 'en_curso'
        ? 'VIVO'
        : 'FIN.';
    ctx.font = `700 ${Math.max(9.5, scoreFontPx - 1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = m.winnerEntryId ? palette.accentA : palette.accentB;
    ctx.fillText(shortTag, x + w - 7, winB ? textBY : textAY);
  }
  ctx.textAlign = 'left';

  ctx.restore();
}

function drawConnectorLines(
  ctx: CanvasRenderingContext2D,
  connectors: OrgConnector[],
  palette: FlyerPalette
) {
  for (const conn of connectors) {
    ctx.strokeStyle = conn.active ? palette.lineActive : palette.lineMuted;
    ctx.lineWidth = conn.active ? 2.2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(conn.fromX, conn.fromY);
    ctx.lineTo(conn.midX, conn.fromY);
    ctx.lineTo(conn.midX, conn.toY);
    ctx.lineTo(conn.toX, conn.toY);
    ctx.stroke();
  }
}

function renderOrganigramSheet(params: {
  tournament: Tournament;
  organigrams: DivisionOrganigramData[];
  format: FlyerFormat;
  theme: FlyerTheme;
  includeQr: boolean;
  fitSinglePage: boolean;
  groupBy: FlyerGroupBy;
  statusFilter: FlyerStatusFilter;
  customSubtitle?: string;
  qrImage: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
}): FlyerRenderResult {
  const {
    tournament,
    organigrams,
    format,
    theme,
    includeQr,
    fitSinglePage,
    groupBy,
    statusFilter,
    customSubtitle,
    qrImage,
    logoImg,
  } = params;

  const dims = FORMAT_DIMENSIONS[format];
  const palette = getFlyerPalette(theme);

  const maxKoCols = Math.max(
    1,
    ...organigrams.map((d) => {
      const hasChamp = d.koRounds.some((r) =>
        r.matches.some((m) => isRealFinalMatch(m, d.koMatchesAll) && Boolean(m.winnerEntryId))
      );
      return d.koRounds.length + (hasChamp ? 1 : 0);
    })
  );

  const headerY = 22;
  const headerH = dims.orientation === 'landscape' ? 118 : 134;
  const footerH = 42;
  const padX = 32;
  const colGap = maxKoCols >= 5 ? 20 : 28;

  // Asegurar ancho suficiente por columna para leer nombres + scores cómodamente
  const minColW = maxKoCols >= 5 ? 195 : 220;
  const minRequiredWidth =
    organigrams.some((d) => d.koRounds.length > 0)
      ? padX * 2 + maxKoCols * minColW + Math.max(0, maxKoCols - 1) * colGap
      : dims.width;

  const measureWithCanvasSize = (
    canvasW: number,
    nodeH: number,
    nodeGapY: number
  ): {
    geometries: DivisionOrganigramGeometry[];
    totalContentHeight: number;
  } => {
    const contentW = canvasW - padX * 2;
    const bodyStartY = headerY + headerH + 16;
    let y = bodyStartY;
    const geometries: DivisionOrganigramGeometry[] = [];

    for (let i = 0; i < organigrams.length; i++) {
      if (i > 0) y += 22;
      const geo = layoutDivisionOrganigram({
        divData: organigrams[i],
        startX: padX,
        startY: y,
        contentW,
        nodeH,
        nodeGapY,
        colGap,
        statusFilter,
      });
      geometries.push(geo);
      y += geo.totalHeight;
    }

    return {
      geometries,
      totalContentHeight: y + 18 + footerH,
    };
  };

  // Probar densidades de nodos (nodeH, nodeGapY) en tamaño base, y escalar proporcionalmente si hace falta para 1 sola hoja
  const densityOptions: Array<{ nodeH: number; nodeGapY: number; label: string }> = [
    { nodeH: 64, nodeGapY: 12, label: 'Organigrama amplio' },
    { nodeH: 54, nodeGapY: 8, label: 'Organigrama equilibrado' },
    { nodeH: 46, nodeGapY: 6, label: 'Organigrama compacto' },
  ];

  let chosenCanvasW = Math.max(dims.width, minRequiredWidth);
  let chosenCanvasH = Math.round((chosenCanvasW * dims.height) / dims.width);
  let chosenDensity = densityOptions[0];
  let chosenGeometries: DivisionOrganigramGeometry[] = [];

  // Re-evaluar con proporción exacta del formato elegido
  const widthScaleNeeded = chosenCanvasW / dims.width;
  let foundFit = false;

  for (const dOpt of densityOptions) {
    const trialW = Math.round(dims.width * Math.max(1, widthScaleNeeded));
    const trialH = Math.round(dims.height * Math.max(1, widthScaleNeeded));
    const measured = measureWithCanvasSize(trialW, dOpt.nodeH, dOpt.nodeGapY);
    if (measured.totalContentHeight <= trialH) {
      chosenCanvasW = trialW;
      chosenCanvasH = trialH;
      chosenDensity = dOpt;
      chosenGeometries = measured.geometries;
      foundFit = true;
      break;
    }
  }

  if (!foundFit) {
    const compact = densityOptions[densityOptions.length - 1];
    chosenDensity = compact;
    const measuredBase = measureWithCanvasSize(chosenCanvasW, compact.nodeH, compact.nodeGapY);
    if (fitSinglePage) {
      const heightRatio = measuredBase.totalContentHeight / chosenCanvasH;
      const scaleUp = Math.max(1, heightRatio);
      // Si es más alto que la hoja, ampliamos proporcionalmente ancho y alto para mantener relación de aspecto limpia en impresión 1 hoja
      if (scaleUp > 1) {
        const finalScale = Math.min(2.4, scaleUp);
        chosenCanvasW = Math.round(chosenCanvasW * finalScale);
        chosenCanvasH = Math.max(
          Math.round(chosenCanvasH * finalScale),
          measuredBase.totalContentHeight
        );
      }
      chosenGeometries = measureWithCanvasSize(
        chosenCanvasW,
        compact.nodeH,
        compact.nodeGapY
      ).geometries;
    } else {
      chosenGeometries = measuredBase.geometries;
      chosenCanvasH = Math.max(chosenCanvasH, measuredBase.totalContentHeight);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = chosenCanvasW;
  canvas.height = chosenCanvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      pages: [],
      columnsUsed: maxKoCols,
      densityLabel: chosenDensity.label,
      isSingleSheet: true,
      orientation: dims.orientation,
    };
  }

  drawHeaderAndFooter({
    ctx,
    canvasW: chosenCanvasW,
    canvasH: chosenCanvasH,
    padX,
    headerY,
    headerH,
    footerH,
    tournament,
    subtitleLine: `PLAYPY · ${(customSubtitle || 'Organigrama Oficial de Cruces').toUpperCase()}`,
    includeQr,
    qrImage,
    logoImg,
    palette,
    pageLabel: `Organigrama · ${maxKoCols} ${maxKoCols === 1 ? 'nivel' : 'niveles'} · Hoja única (1/1)`,
  });

  if (chosenGeometries.length === 0) {
    ctx.fillStyle = palette.headerText;
    ctx.font = '600 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      'No hay cruces publicados para armar el organigrama con el filtro elegido.',
      padX,
      headerY + headerH + 64
    );
  }

  for (const geo of chosenGeometries) {
    const contentW = chosenCanvasW - padX * 2;
    const totalMatchesInDiv =
      geo.divData.koMatchesAll.length +
      (geo.divData.thirdPlaceMatch ? 1 : 0) +
      geo.divData.groupBranches.reduce((s, b) => s + b.matches.length, 0);

    // Banner de categoría
    ctx.fillStyle = palette.sectionBg;
    drawRoundedRect(ctx, padX, geo.topY, contentW, geo.bannerH, 10);
    ctx.fill();

    ctx.fillStyle = palette.sectionText;
    ctx.font = '800 18px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      truncateText(
        ctx,
        `${geo.divData.division.name} · ${geo.divData.division.modality} ${geo.divData.division.gender}`,
        contentW - 180
      ),
      padX + 14,
      geo.topY + 25
    );

    ctx.textAlign = 'right';
    ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `${totalMatchesInDiv} ${totalMatchesInDiv === 1 ? 'cruce' : 'cruces'}`,
      padX + contentW - 14,
      geo.topY + 25
    );
    ctx.textAlign = 'left';

    // Encabezados de cada ronda (niveles del organigrama)
    for (const colBox of geo.roundColBoxes) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      if (theme === 'clean') ctx.fillStyle = '#E2E8F0';
      drawRoundedRect(ctx, colBox.x, geo.roundHeaderY, colBox.w, geo.roundHeaderH, 8);
      ctx.fill();

      ctx.fillStyle = theme === 'clean' ? '#0A1633' : '#F8FAFC';
      ctx.font = '700 13px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(
        truncateText(ctx, colBox.title, colBox.w - 42),
        colBox.x + 10,
        geo.roundHeaderY + 19
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = theme === 'clean' ? '#475569' : '#94A3B8';
      ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`${colBox.count}`, colBox.x + colBox.w - 10, geo.roundHeaderY + 19);
      ctx.textAlign = 'left';
    }

    // Dibujar conectores ortogonales detrás de las tarjetas
    drawConnectorLines(ctx, geo.connectors, palette);

    // Organigrama de Grupos / Jornadas si la división no tiene llaves eliminatorias todavía
    if (geo.groupRootBox) {
      const rb = geo.groupRootBox;
      ctx.fillStyle = palette.accentA;
      drawRoundedRect(ctx, rb.x, rb.y, rb.w, rb.h, 12);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 15px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(
        truncateText(ctx, rb.label, rb.w - 20),
        rb.x + 12,
        rb.y + rb.h / 2 + 5
      );
    }

    for (const brNode of geo.groupOrgNodes) {
      drawConnectorLines(ctx, brNode.connectors, palette);
      ctx.fillStyle = palette.accentB;
      drawRoundedRect(
        ctx,
        brNode.branchX,
        brNode.branchY,
        brNode.branchW,
        brNode.branchH,
        10
      );
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 13px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(
        truncateText(ctx, brNode.branchTitle, brNode.branchW - 18),
        brNode.branchX + 10,
        brNode.branchY + brNode.branchH / 2 + 5
      );

      for (const card of brNode.cards) {
        drawOrganigramMatchBox(ctx, card, palette, groupBy);
      }
    }

    // Tarjetas de cada cruce del árbol
    for (const node of geo.nodes) {
      drawOrganigramMatchBox(ctx, node, palette, groupBy);
    }

    // Nodo final de Campeón conectado a la derecha de la Final
    if (geo.championBox) {
      const cb = geo.championBox;
      const champGrad = ctx.createLinearGradient(cb.x, cb.y, cb.x + cb.w, cb.y + cb.h);
      champGrad.addColorStop(0, '#7C1FA2');
      champGrad.addColorStop(1, '#0284C7');
      ctx.fillStyle = champGrad;
      drawRoundedRect(ctx, cb.x, cb.y, cb.w, cb.h, 12);
      ctx.fill();

      ctx.fillStyle = '#FDE047';
      ctx.font = '700 11px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText('CAMPEÓN OFICIAL', cb.x + 12, cb.y + 18);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 15px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(truncateText(ctx, `★ ${cb.name}`, cb.w - 22), cb.x + 12, cb.y + 39);

      if (cb.runnerUpName && cb.h >= 54) {
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '500 10.5px system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.fillText(
          truncateText(ctx, `2°: ${cb.runnerUpName}`, cb.w - 22),
          cb.x + 12,
          cb.y + cb.h - 7
        );
      }
    }
  }

  return {
    pages: [canvas.toDataURL('image/png')],
    columnsUsed: maxKoCols,
    densityLabel: `${chosenDensity.label} (${maxKoCols} ${maxKoCols === 1 ? 'nivel' : 'niveles'})`,
    isSingleSheet: true,
    orientation: dims.orientation,
  };
}

/* ============================================================================
 * MODO LISTA EN GRILLA (Tarjetas ordenadas por fecha/categoría/jornada/ronda)
 * ============================================================================ */

interface PlacedSectionHeader {
  kind: 'header';
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  count: number;
}

interface PlacedMatchCard {
  kind: 'card';
  x: number;
  y: number;
  w: number;
  h: number;
  item: FlyerMatchItem;
}

type PlacedElement = PlacedSectionHeader | PlacedMatchCard;

interface DensityPreset {
  label: string;
  cols: number;
  cardH: number;
  sectionH: number;
  rowGap: number;
  colGap: number;
  sectionGap: number;
  metaFont: number;
  nameFont: number;
  scoreFont: number;
  sectionFont: number;
}

interface SinglePageLayoutPlan {
  canvasW: number;
  canvasH: number;
  padX: number;
  headerY: number;
  headerH: number;
  footerH: number;
  preset: DensityPreset;
  elements: PlacedElement[];
}

function buildSectionGridElements(
  sections: FlyerGroupSection[],
  startX: number,
  startY: number,
  contentWidth: number,
  preset: DensityPreset
): { elements: PlacedElement[]; usedHeight: number } {
  const { cols, cardH, sectionH, rowGap, colGap, sectionGap } = preset;
  const colW = (contentWidth - colGap * (cols - 1)) / cols;
  const elements: PlacedElement[] = [];

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const avgItemsPerSec = sections.length > 0 ? totalItems / sections.length : 0;
  const useColumnMasonry = cols >= 2 && sections.length >= 2 && avgItemsPerSec < cols * 1.65;

  if (useColumnMasonry) {
    const colHeights = new Array<number>(cols).fill(startY);
    for (const sec of sections) {
      let targetCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[targetCol]) targetCol = c;
      }
      const x = startX + targetCol * (colW + colGap);
      let y = colHeights[targetCol];
      if (y > startY) y += sectionGap;

      elements.push({
        kind: 'header',
        x,
        y,
        w: colW,
        h: sectionH,
        title: sec.title,
        count: sec.items.length,
      });
      y += sectionH + Math.max(6, Math.round(rowGap * 0.8));

      for (const item of sec.items) {
        elements.push({
          kind: 'card',
          x,
          y,
          w: colW,
          h: cardH,
          item,
        });
        y += cardH + rowGap;
      }
      colHeights[targetCol] = y - rowGap;
    }
    const maxColY = Math.max(...colHeights, startY);
    return { elements, usedHeight: Math.max(0, maxColY - startY) };
  }

  let cursorY = startY;
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    if (sIdx > 0) cursorY += sectionGap;

    elements.push({
      kind: 'header',
      x: startX,
      y: cursorY,
      w: contentWidth,
      h: sectionH,
      title: sec.title,
      count: sec.items.length,
    });
    cursorY += sectionH + Math.max(6, Math.round(rowGap * 0.85));

    const effColW = colW;
    const gridCols = cols;
    const rowsInSec = Math.ceil(sec.items.length / gridCols);

    for (let i = 0; i < sec.items.length; i++) {
      const r = Math.floor(i / gridCols);
      const c = i % gridCols;
      const x = startX + c * (effColW + colGap);
      const y = cursorY + r * (cardH + rowGap);
      elements.push({
        kind: 'card',
        x,
        y,
        w: effColW,
        h: cardH,
        item: sec.items[i],
      });
    }
    if (rowsInSec > 0) {
      cursorY += rowsInSec * cardH + (rowsInSec - 1) * rowGap;
    }
  }

  return { elements, usedHeight: Math.max(0, cursorY - startY) };
}

function computeSingleSheetLayoutPlan(
  sections: FlyerGroupSection[],
  format: FlyerFormat,
  includeQr: boolean
): SinglePageLayoutPlan {
  const dims = FORMAT_DIMENSIONS[format];
  const isWide = dims.orientation === 'landscape';
  const totalMatches = sections.reduce((sum, s) => sum + s.items.length, 0);

  const headerY = 24;
  const headerH = isWide ? 128 : 148;
  const footerH = 44;
  const bodyGapTop = 18;
  const bodyGapBottom = 16;
  const padX = isWide ? 40 : 36;

  const candidatePresets: DensityPreset[] = isWide
    ? [
        {
          label: '1 columna amplia',
          cols: 1,
          cardH: 96,
          sectionH: 40,
          rowGap: 10,
          colGap: 20,
          sectionGap: 16,
          metaFont: 16,
          nameFont: 22,
          scoreFont: 20,
          sectionFont: 20,
        },
        {
          label: '2 columnas equilibradas',
          cols: 2,
          cardH: 88,
          sectionH: 38,
          rowGap: 10,
          colGap: 20,
          sectionGap: 14,
          metaFont: 14,
          nameFont: 20,
          scoreFont: 18,
          sectionFont: 19,
        },
        {
          label: '2 columnas compactas',
          cols: 2,
          cardH: 72,
          sectionH: 34,
          rowGap: 8,
          colGap: 18,
          sectionGap: 12,
          metaFont: 13,
          nameFont: 17,
          scoreFont: 16,
          sectionFont: 17,
        },
        {
          label: '3 columnas compactas',
          cols: 3,
          cardH: 68,
          sectionH: 32,
          rowGap: 7,
          colGap: 14,
          sectionGap: 11,
          metaFont: 12,
          nameFont: 15,
          scoreFont: 15,
          sectionFont: 16,
        },
        {
          label: '3 columnas alta densidad',
          cols: 3,
          cardH: 56,
          sectionH: 28,
          rowGap: 6,
          colGap: 12,
          sectionGap: 9,
          metaFont: 11,
          nameFont: 14,
          scoreFont: 13,
          sectionFont: 14,
        },
        {
          label: '4 columnas ultra compactas',
          cols: 4,
          cardH: 52,
          sectionH: 26,
          rowGap: 5,
          colGap: 10,
          sectionGap: 8,
          metaFont: 10.5,
          nameFont: 13,
          scoreFont: 12.5,
          sectionFont: 13.5,
        },
      ]
    : [
        {
          label: '1 columna amplia',
          cols: 1,
          cardH: 96,
          sectionH: 40,
          rowGap: 10,
          colGap: 18,
          sectionGap: 16,
          metaFont: 16,
          nameFont: 22,
          scoreFont: 20,
          sectionFont: 20,
        },
        {
          label: '2 columnas equilibradas',
          cols: 2,
          cardH: 82,
          sectionH: 36,
          rowGap: 9,
          colGap: 16,
          sectionGap: 13,
          metaFont: 13.5,
          nameFont: 18,
          scoreFont: 17,
          sectionFont: 18,
        },
        {
          label: '2 columnas compactas',
          cols: 2,
          cardH: 66,
          sectionH: 32,
          rowGap: 7,
          colGap: 14,
          sectionGap: 11,
          metaFont: 12,
          nameFont: 15.5,
          scoreFont: 14.5,
          sectionFont: 16,
        },
        {
          label: '2 columnas alta densidad',
          cols: 2,
          cardH: 54,
          sectionH: 28,
          rowGap: 6,
          colGap: 12,
          sectionGap: 9,
          metaFont: 11,
          nameFont: 14,
          scoreFont: 13,
          sectionFont: 14.5,
        },
        {
          label: '3 columnas alta densidad',
          cols: 3,
          cardH: 52,
          sectionH: 26,
          rowGap: 5,
          colGap: 10,
          sectionGap: 8,
          metaFont: 10.5,
          nameFont: 13,
          scoreFont: 12,
          sectionFont: 13.5,
        },
      ];

  const filteredPresets = candidatePresets.filter((p) => {
    if (p.cols === 1 && totalMatches > (isWide ? 6 : 10)) return false;
    if (p.cols === 4 && totalMatches < 20) return false;
    return true;
  });
  const pool = filteredPresets.length > 0 ? filteredPresets : candidatePresets;

  const baseBodyTop = headerY + headerH + bodyGapTop;
  const baseAvailableBodyH = dims.height - footerH - bodyGapBottom - baseBodyTop;
  const baseContentW = dims.width - padX * 2;

  for (const preset of pool) {
    const layout = buildSectionGridElements(sections, padX, baseBodyTop, baseContentW, preset);
    if (layout.usedHeight <= baseAvailableBodyH) {
      return {
        canvasW: dims.width,
        canvasH: dims.height,
        padX,
        headerY,
        headerH,
        footerH,
        preset,
        elements: layout.elements,
      };
    }
  }

  const densest = pool[pool.length - 1];
  let scale = 1.08;
  for (let attempt = 0; attempt < 14; attempt++) {
    const scaledW = Math.round(dims.width * scale);
    const scaledH = Math.round(dims.height * scale);
    const scaledContentW = scaledW - padX * 2;
    const availH = scaledH - footerH - bodyGapBottom - baseBodyTop;
    const layout = buildSectionGridElements(sections, padX, baseBodyTop, scaledContentW, densest);
    if (layout.usedHeight <= availH || attempt === 13) {
      return {
        canvasW: scaledW,
        canvasH: Math.max(scaledH, baseBodyTop + layout.usedHeight + bodyGapBottom + footerH),
        padX,
        headerY,
        headerH: includeQr ? headerH : 128,
        footerH,
        preset: densest,
        elements: layout.elements,
      };
    }
    scale += 0.12;
  }

  const fallbackLayout = buildSectionGridElements(
    sections,
    padX,
    baseBodyTop,
    baseContentW,
    densest
  );
  return {
    canvasW: dims.width,
    canvasH: Math.max(dims.height, baseBodyTop + fallbackLayout.usedHeight + bodyGapBottom + footerH),
    padX,
    headerY,
    headerH,
    footerH,
    preset: densest,
    elements: fallbackLayout.elements,
  };
}

function drawSectionHeaderBox(
  ctx: CanvasRenderingContext2D,
  el: PlacedSectionHeader,
  palette: FlyerPalette,
  sectionFont: number
) {
  ctx.fillStyle = palette.sectionBg;
  drawRoundedRect(ctx, el.x, el.y, el.w, el.h, 10);
  ctx.fill();

  const textY = el.y + el.h / 2 + sectionFont * 0.35;
  ctx.fillStyle = palette.sectionText;
  ctx.font = `700 ${sectionFont}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(truncateText(ctx, el.title, el.w - 110), el.x + 14, textY);

  ctx.textAlign = 'right';
  ctx.font = `600 ${Math.max(11, sectionFont - 3)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(
    `${el.count} ${el.count === 1 ? 'cruce' : 'cruces'}`,
    el.x + el.w - 14,
    textY
  );
  ctx.textAlign = 'left';
}

function drawMatchCardAdaptive(
  ctx: CanvasRenderingContext2D,
  item: FlyerMatchItem,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: FlyerPalette,
  groupBy: FlyerGroupBy,
  preset: DensityPreset
) {
  ctx.fillStyle = palette.cardBg;
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, Math.min(14, Math.round(h * 0.2)));
  ctx.fill();
  ctx.stroke();

  const stripeGrad = ctx.createLinearGradient(x, y, x, y + h);
  stripeGrad.addColorStop(0, palette.accentA);
  stripeGrad.addColorStop(1, palette.accentB);
  ctx.fillStyle = stripeGrad;
  drawRoundedRect(ctx, x + 5, y + 8, 4, Math.max(12, h - 16), 2);
  ctx.fill();

  const innerX = x + 16;
  const innerRight = x + w - 12;
  const scoreColW = Math.min(142, Math.max(88, Math.round(w * 0.27)));
  const nameMaxW = Math.max(80, w - 16 - scoreColW - 16);

  const metaParts: string[] = [];
  metaParts.push(
    item.timeLabel ? `${item.dateLabel} · ${item.timeLabel}` : item.dateLabel
  );
  if (item.match.courtName) metaParts.push(item.match.courtName);
  if (groupBy !== 'categoria') metaParts.push(item.divisionName);
  if (groupBy !== 'ronda') metaParts.push(item.match.roundName);

  const metaY = y + Math.round(h * 0.27);
  const nameAY = y + Math.round(h * 0.59);
  const nameBY = y + Math.round(h * 0.88);

  ctx.fillStyle = palette.accentB;
  ctx.font = `700 ${preset.metaFont}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(truncateText(ctx, metaParts.join(' · '), w - 28), innerX, metaY);

  const winA = item.match.winnerEntryId && item.match.winnerEntryId === item.match.entryAId;
  const winB = item.match.winnerEntryId && item.match.winnerEntryId === item.match.entryBId;

  ctx.fillStyle = winA || !winB ? palette.cardText : palette.cardMuted;
  ctx.font = `${winA ? '800' : '600'} ${preset.nameFont}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winA ? '★ ' : ''}${item.match.entryAName}`, nameMaxW),
    innerX,
    nameAY
  );

  ctx.fillStyle = winB ? palette.cardText : palette.cardMuted;
  ctx.font = `${winB ? '800' : '600'} ${preset.nameFont}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    truncateText(ctx, `${winB ? '★ ' : ''}${item.match.entryBName}`, nameMaxW),
    innerX,
    nameBY
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = item.isFinished ? palette.accentA : palette.accentB;
  ctx.font = `800 ${preset.scoreFont}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const scoreY =
    item.matchdayName && groupBy !== 'jornada' && h >= 64
      ? y + Math.round(h * 0.62)
      : y + Math.round(h * 0.72);
  ctx.fillText(truncateText(ctx, item.scoreLabel, scoreColW), innerRight, scoreY);

  if (item.matchdayName && groupBy !== 'jornada' && h >= 64) {
    ctx.fillStyle = palette.cardMuted;
    ctx.font = `500 ${Math.max(10, preset.metaFont - 1)}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(truncateText(ctx, item.matchdayName, scoreColW), innerRight, y + Math.round(h * 0.88));
  }
  ctx.textAlign = 'left';
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

export async function renderTournamentFlyerDetailed(
  options: FlyerRenderOptions
): Promise<FlyerRenderResult> {
  const {
    tournament,
    sections,
    groupBy,
    format,
    theme,
    includeQr,
    fitSinglePage = true,
    layoutStyle = 'organigrama',
    divisions = [],
    matchdays = [],
    rawMatches = [],
    divisionFilterId = 'ALL',
    statusFilter = 'all',
    customSubtitle,
    logoUrl,
  } = options;

  const dims = FORMAT_DIMENSIONS[format];

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

  if (layoutStyle === 'organigrama' && rawMatches.length > 0 && divisions.length > 0) {
    const organigrams = buildDivisionOrganigramData({
      tournament,
      divisions,
      matchdays,
      matches: rawMatches,
      divisionFilterId,
      statusFilter,
      groupBy,
    });

    return renderOrganigramSheet({
      tournament,
      organigrams,
      format,
      theme,
      includeQr,
      fitSinglePage,
      groupBy,
      statusFilter,
      customSubtitle,
      qrImage,
      logoImg,
    });
  }

  const palette = getFlyerPalette(theme);

  if (fitSinglePage) {
    const safeSections: FlyerGroupSection[] =
      sections.length > 0
        ? sections
        : [
            {
              key: 'empty',
              title: 'Sin cruces disponibles para los filtros elegidos',
              sortDateKey: '9999-99-99',
              sortOrder: 0,
              items: [],
            },
          ];

    const plan = computeSingleSheetLayoutPlan(safeSections, format, includeQr);
    const canvas = document.createElement('canvas');
    canvas.width = plan.canvasW;
    canvas.height = plan.canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        pages: [],
        columnsUsed: plan.preset.cols,
        densityLabel: plan.preset.label,
        isSingleSheet: true,
        orientation: dims.orientation,
      };
    }

    drawHeaderAndFooter({
      ctx,
      canvasW: plan.canvasW,
      canvasH: plan.canvasH,
      padX: plan.padX,
      headerY: plan.headerY,
      headerH: plan.headerH,
      footerH: plan.footerH,
      tournament,
      subtitleLine: `PLAYPY · ${(customSubtitle || GROUP_BY_TITLES[groupBy]).toUpperCase()}`,
      includeQr,
      qrImage,
      logoImg,
      palette,
      pageLabel: 'Orden ascendente · Hoja única (1/1)',
    });

    for (const el of plan.elements) {
      if (el.kind === 'header') {
        drawSectionHeaderBox(ctx, el, palette, plan.preset.sectionFont);
      } else {
        drawMatchCardAdaptive(
          ctx,
          el.item,
          el.x,
          el.y,
          el.w,
          el.h,
          palette,
          groupBy,
          plan.preset
        );
      }
    }

    return {
      pages: [canvas.toDataURL('image/png')],
      columnsUsed: plan.preset.cols,
      densityLabel: plan.preset.label,
      isSingleSheet: true,
      orientation: dims.orientation,
    };
  }

  const pages = paginateSections(sections, dims.perPage);
  const results: string[] = [];
  const multiPreset: DensityPreset = {
    label: 'Estándar multipágina',
    cols: dims.orientation === 'landscape' ? 2 : 1,
    cardH: 96,
    sectionH: 40,
    rowGap: 10,
    colGap: 20,
    sectionGap: 12,
    metaFont: 15,
    nameFont: 21,
    scoreFont: 19,
    sectionFont: 20,
  };

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const rows = pages[pIdx];
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const padX = dims.orientation === 'landscape' ? 40 : 36;
    const contentWidth = dims.width - padX * 2;
    const headerY = 24;
    const headerH = dims.orientation === 'landscape' ? 128 : 148;
    const footerH = 44;

    drawHeaderAndFooter({
      ctx,
      canvasW: dims.width,
      canvasH: dims.height,
      padX,
      headerY,
      headerH,
      footerH,
      tournament,
      subtitleLine: `PLAYPY · ${(customSubtitle || GROUP_BY_TITLES[groupBy]).toUpperCase()}`,
      includeQr,
      qrImage,
      logoImg,
      palette,
      pageLabel: `Orden ascendente · Hoja ${pIdx + 1}/${pages.length}`,
    });

    const bodyTop = headerY + headerH + 18;
    const bodyBottom = dims.height - footerH - 16;

    if (multiPreset.cols === 2) {
      const colW = (contentWidth - multiPreset.colGap) / 2;
      let colIdx = 0;
      let rowTopY = bodyTop;
      for (const row of rows) {
        if (row.type === 'header') {
          if (colIdx === 1) {
            colIdx = 0;
            rowTopY += multiPreset.cardH + multiPreset.rowGap;
          }
          if (rowTopY + multiPreset.sectionH > bodyBottom) break;
          drawSectionHeaderBox(
            ctx,
            {
              kind: 'header',
              x: padX,
              y: rowTopY,
              w: contentWidth,
              h: multiPreset.sectionH,
              title: row.title,
              count: row.count,
            },
            palette,
            multiPreset.sectionFont
          );
          rowTopY += multiPreset.sectionH + 8;
        } else {
          if (rowTopY + multiPreset.cardH > bodyBottom) break;
          const x = padX + colIdx * (colW + multiPreset.colGap);
          drawMatchCardAdaptive(
            ctx,
            row.item,
            x,
            rowTopY,
            colW,
            multiPreset.cardH,
            palette,
            groupBy,
            multiPreset
          );
          if (colIdx === 0) {
            colIdx = 1;
          } else {
            colIdx = 0;
            rowTopY += multiPreset.cardH + multiPreset.rowGap;
          }
        }
      }
    } else {
      let cursorY = bodyTop;
      for (const row of rows) {
        if (row.type === 'header') {
          if (cursorY + multiPreset.sectionH > bodyBottom) break;
          drawSectionHeaderBox(
            ctx,
            {
              kind: 'header',
              x: padX,
              y: cursorY,
              w: contentWidth,
              h: multiPreset.sectionH,
              title: row.title,
              count: row.count,
            },
            palette,
            multiPreset.sectionFont
          );
          cursorY += multiPreset.sectionH + 8;
        } else {
          if (cursorY + multiPreset.cardH > bodyBottom) break;
          drawMatchCardAdaptive(
            ctx,
            row.item,
            padX,
            cursorY,
            contentWidth,
            multiPreset.cardH,
            palette,
            groupBy,
            multiPreset
          );
          cursorY += multiPreset.cardH + multiPreset.rowGap;
        }
      }
    }

    results.push(canvas.toDataURL('image/png'));
  }

  return {
    pages: results,
    columnsUsed: multiPreset.cols,
    densityLabel: multiPreset.label,
    isSingleSheet: results.length <= 1,
    orientation: dims.orientation,
  };
}

export async function renderTournamentFlyerPages(
  options: FlyerRenderOptions
): Promise<string[]> {
  const res = await renderTournamentFlyerDetailed(options);
  return res.pages;
}
