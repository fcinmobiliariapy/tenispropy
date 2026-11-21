import {
  Division,
  Match,
  PlayerPublic,
  Registration,
  SetScore,
  Tournament,
} from '../types/tennis';
import { formatScoreString } from './itfRules';
import { formatAsuncionDate } from './tournamentEngine';

export interface SideIdentity {
  entryId: string | null;
  displayName: string;
  playerIds: string[];
  canonicalNameKey: string;
  isPlaceholder: boolean;
}

export interface HistoricalMeetingItem {
  match: Match;
  tournamentName: string;
  divisionName: string;
  surface: string | null;
  dateSortKey: string;
  dateLabel: string;
  winnerSide: 'A' | 'B';
  winnerName: string;
  scoreFromSelectedPerspective: string;
  rawScoreLabel: string;
  orientation: 'direct' | 'swapped';
}

export interface RecentMatchDigest {
  matchId: string;
  result: 'W' | 'L';
  opponentName: string;
  score: string;
  roundName: string;
  tournamentName: string;
  dateLabel: string;
}

export interface SideDatabaseProfile {
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  titles: number;
  recentForm: RecentMatchDigest[];
}

export interface SurfaceBreakdownItem {
  surface: string;
  total: number;
  winsA: number;
  winsB: number;
}

export interface HeadToHeadSummary {
  sideA: SideIdentity;
  sideB: SideIdentity;
  hasBothSides: boolean;
  totalMeetings: number;
  winsA: number;
  winsB: number;
  setsWonA: number;
  setsWonB: number;
  gamesWonA: number;
  gamesWonB: number;
  lastWinnerSide: 'A' | 'B' | null;
  streakText: string | null;
  surfaceBreakdown: SurfaceBreakdownItem[];
  meetings: HistoricalMeetingItem[];
  formA: SideDatabaseProfile;
  formB: SideDatabaseProfile;
}

const COMPLETED_STATUSES = new Set(['finalizado', 'wo', 'retiro', 'descalificado']);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isPlaceholderParticipantName(name: string | null | undefined): boolean {
  const norm = normalizeText(name || '');
  return (
    !norm ||
    norm === 'por definir' ||
    norm === 'bye' ||
    norm === 'libre' ||
    norm === 'tbc' ||
    norm === 'a confirmar'
  );
}

function buildCanonicalNameKey(
  displayName: string,
  playerIds: string[],
  playerMap: Map<string, PlayerPublic>
): string {
  const resolvedNames = playerIds
    .map((pid) => playerMap.get(pid)?.fullName)
    .filter((n): n is string => Boolean(n && n.trim()))
    .map(normalizeText)
    .filter(Boolean);

  if (resolvedNames.length > 0) {
    return [...resolvedNames].sort().join('|');
  }

  const parts = displayName
    .split(/\s*[/+]\s*/)
    .map(normalizeText)
    .filter(Boolean);

  if (parts.length > 1) {
    return [...parts].sort().join('|');
  }

  return normalizeText(displayName);
}

export function extractSideIdentity(
  match: Match,
  side: 'A' | 'B',
  playerMap: Map<string, PlayerPublic>,
  registrationMap: Map<string, Registration>
): SideIdentity {
  const entryId = (side === 'A' ? match.entryAId : match.entryBId) || null;
  const displayName = (side === 'A' ? match.entryAName : match.entryBName) || '';
  const rawPlayerIds = side === 'A' ? match.playerIdsA : match.playerIdsB;
  const reg = entryId ? registrationMap.get(entryId) : undefined;
  const playerIds = Array.from(
    new Set([...(rawPlayerIds || []), ...(reg?.playerIds || [])].filter(Boolean))
  );
  const isPlaceholder = isPlaceholderParticipantName(displayName) && !entryId && playerIds.length === 0;

  return {
    entryId,
    displayName: displayName || 'Por definir',
    playerIds,
    canonicalNameKey: isPlaceholder
      ? ''
      : buildCanonicalNameKey(displayName, playerIds, playerMap),
    isPlaceholder,
  };
}

export function isSameSideIdentity(target: SideIdentity, candidate: SideIdentity): boolean {
  if (target.isPlaceholder || candidate.isPlaceholder) return false;

  if (target.entryId && candidate.entryId && target.entryId === candidate.entryId) {
    return true;
  }

  if (
    target.playerIds.length > 0 &&
    target.playerIds.length === candidate.playerIds.length
  ) {
    const aSorted = [...target.playerIds].sort();
    const bSorted = [...candidate.playerIds].sort();
    if (aSorted.every((id, idx) => id === bSorted[idx])) {
      return true;
    }
  }

  if (
    target.canonicalNameKey &&
    candidate.canonicalNameKey &&
    target.canonicalNameKey === candidate.canonicalNameKey
  ) {
    return true;
  }

  return false;
}

function flipSetScore(set: SetScore): SetScore {
  return {
    a: set.b,
    b: set.a,
    tbA: set.tbB ?? null,
    tbB: set.tbA ?? null,
    isMatchTiebreak: set.isMatchTiebreak,
  };
}

function getMatchSortKey(m: Match): string {
  const datePart = m.scheduledDate || m.updatedAt?.slice(0, 10) || m.createdAt?.slice(0, 10) || '0000-00-00';
  const timePart = m.scheduledTime || '00:00';
  return `${datePart}T${timePart}|${String(m.roundOrder).padStart(3, '0')}|${m.updatedAt || ''}`;
}

function resolveCourtSurface(
  match: Match,
  tournament: Tournament | undefined
): string | null {
  if (!tournament || !tournament.courts || tournament.courts.length === 0) return null;
  if (match.courtId) {
    const byId = tournament.courts.find((c) => c.id === match.courtId);
    if (byId) return byId.surface;
  }
  if (match.courtName) {
    const normCourt = normalizeText(match.courtName);
    const byName = tournament.courts.find((c) => normalizeText(c.name) === normCourt);
    if (byName) return byName.surface;
  }
  return null;
}

function computeSideProfile(
  target: SideIdentity,
  completedMatches: Match[],
  selectedMatchId: string,
  tournamentMap: Map<string, Tournament>,
  playerMap: Map<string, PlayerPublic>,
  registrationMap: Map<string, Registration>
): SideDatabaseProfile {
  if (target.isPlaceholder) {
    return { played: 0, wins: 0, losses: 0, winRate: 0, titles: 0, recentForm: [] };
  }

  const matchesForSide: Array<{
    sortKey: string;
    won: boolean;
    digest: RecentMatchDigest;
    isFinalWin: boolean;
  }> = [];

  for (const m of completedMatches) {
    if (m.id === selectedMatchId) continue;
    const candA = extractSideIdentity(m, 'A', playerMap, registrationMap);
    const candB = extractSideIdentity(m, 'B', playerMap, registrationMap);

    const isA = isSameSideIdentity(target, candA);
    const isB = !isA && isSameSideIdentity(target, candB);
    if (!isA && !isB) continue;

    const myEntryId = isA ? m.entryAId : m.entryBId;
    const won = Boolean(m.winnerEntryId && myEntryId && m.winnerEntryId === myEntryId);
    const oppName = isA ? m.entryBName : m.entryAName;
    const orientedSets = isA ? m.sets : m.sets.map(flipSetScore);
    const score = formatScoreString(orientedSets, m.status);
    const tournamentName = tournamentMap.get(m.tournamentId)?.name || 'Torneo PlayPy';
    const isFinalWin =
      won &&
      m.phase === 'eliminacion' &&
      !m.isThirdPlace &&
      (!m.nextMatchId || normalizeText(m.roundName) === 'final');

    matchesForSide.push({
      sortKey: getMatchSortKey(m),
      won,
      isFinalWin,
      digest: {
        matchId: m.id,
        result: won ? 'W' : 'L',
        opponentName: oppName,
        score,
        roundName: m.roundName,
        tournamentName,
        dateLabel: m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Fecha s/d',
      },
    });
  }

  matchesForSide.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const played = matchesForSide.length;
  const wins = matchesForSide.filter((x) => x.won).length;
  const losses = played - wins;
  const titles = matchesForSide.filter((x) => x.isFinalWin).length;

  return {
    played,
    wins,
    losses,
    winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
    titles,
    recentForm: matchesForSide.slice(0, 5).map((x) => x.digest),
  };
}

export function computeHeadToHeadSummary(params: {
  selectedMatch: Match;
  allMatches: Match[];
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  registrations: Registration[];
}): HeadToHeadSummary {
  const { selectedMatch, allMatches, tournaments, divisions, players, registrations } = params;

  const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));
  const divisionMap = new Map(divisions.map((d) => [d.id, d]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const registrationMap = new Map(registrations.map((r) => [r.id, r]));

  const sideA = extractSideIdentity(selectedMatch, 'A', playerMap, registrationMap);
  const sideB = extractSideIdentity(selectedMatch, 'B', playerMap, registrationMap);
  const hasBothSides = !sideA.isPlaceholder && !sideB.isPlaceholder;

  // Deduplicar por id por si llegan registros combinados
  const uniqueMatches = Array.from(new Map(allMatches.map((m) => [m.id, m])).values());

  const completedMatches = uniqueMatches.filter(
    (m) =>
      !m.isBye &&
      m.published !== false &&
      Boolean(m.winnerEntryId) &&
      COMPLETED_STATUSES.has(m.status)
  );

  const meetings: HistoricalMeetingItem[] = [];
  let winsA = 0;
  let winsB = 0;
  let setsWonA = 0;
  let setsWonB = 0;
  let gamesWonA = 0;
  let gamesWonB = 0;
  const surfaceMap = new Map<string, SurfaceBreakdownItem>();

  if (hasBothSides) {
    for (const candidate of completedMatches) {
      if (candidate.id === selectedMatch.id) continue;

      const candA = extractSideIdentity(candidate, 'A', playerMap, registrationMap);
      const candB = extractSideIdentity(candidate, 'B', playerMap, registrationMap);

      const isDirect =
        isSameSideIdentity(sideA, candA) && isSameSideIdentity(sideB, candB);
      const isSwapped =
        !isDirect && isSameSideIdentity(sideA, candB) && isSameSideIdentity(sideB, candA);

      if (!isDirect && !isSwapped) continue;

      const orientation: 'direct' | 'swapped' = isDirect ? 'direct' : 'swapped';
      const candWinnerIsCandA = Boolean(
        candidate.winnerEntryId && candidate.entryAId && candidate.winnerEntryId === candidate.entryAId
      );
      const winnerSide: 'A' | 'B' = isDirect
        ? candWinnerIsCandA
          ? 'A'
          : 'B'
        : candWinnerIsCandA
        ? 'B'
        : 'A';

      if (winnerSide === 'A') winsA++;
      else winsB++;

      const orientedSets = isDirect
        ? candidate.sets
        : candidate.sets.map(flipSetScore);

      const div = divisionMap.get(candidate.divisionId);
      const tour = tournamentMap.get(candidate.tournamentId);

      if (candidate.status === 'wo') {
        const setsToWin = div?.itfConfig?.setsToWin || 2;
        if (winnerSide === 'A') setsWonA += setsToWin;
        else setsWonB += setsToWin;
      } else if (orientedSets.length === 0) {
        const setsToWin = div?.itfConfig?.setsToWin || 2;
        if (winnerSide === 'A') setsWonA += setsToWin;
        else setsWonB += setsToWin;
      } else {
        let matchSetsA = 0;
        let matchSetsB = 0;
        for (const s of orientedSets) {
          if (s.isMatchTiebreak) {
            if (s.a > s.b) {
              matchSetsA++;
              gamesWonA += 1;
            } else {
              matchSetsB++;
              gamesWonB += 1;
            }
          } else {
            if (s.a > s.b) matchSetsA++;
            else if (s.b > s.a) matchSetsB++;
            gamesWonA += s.a;
            gamesWonB += s.b;
          }
        }
        setsWonA += matchSetsA;
        setsWonB += matchSetsB;
      }

      const surface = resolveCourtSurface(candidate, tour);
      if (surface) {
        const existingSurface = surfaceMap.get(surface) || {
          surface,
          total: 0,
          winsA: 0,
          winsB: 0,
        };
        existingSurface.total += 1;
        if (winnerSide === 'A') existingSurface.winsA += 1;
        else existingSurface.winsB += 1;
        surfaceMap.set(surface, existingSurface);
      }

      meetings.push({
        match: candidate,
        tournamentName: tour?.name || 'Torneo PlayPy',
        divisionName: div?.name || 'Categoría',
        surface,
        dateSortKey: getMatchSortKey(candidate),
        dateLabel: candidate.scheduledDate
          ? formatAsuncionDate(candidate.scheduledDate)
          : candidate.createdAt
          ? formatAsuncionDate(candidate.createdAt.slice(0, 10))
          : 'Sin fecha',
        winnerSide,
        winnerName: winnerSide === 'A' ? sideA.displayName : sideB.displayName,
        scoreFromSelectedPerspective: formatScoreString(orientedSets, candidate.status),
        rawScoreLabel: formatScoreString(candidate.sets, candidate.status),
        orientation,
      });
    }
  }

  meetings.sort((a, b) => b.dateSortKey.localeCompare(a.dateSortKey));

  let streakText: string | null = null;
  if (meetings.length > 0) {
    const latestWinner = meetings[0].winnerSide;
    let streakCount = 0;
    for (const m of meetings) {
      if (m.winnerSide === latestWinner) streakCount++;
      else break;
    }
    const streakHolderName = latestWinner === 'A' ? sideA.displayName : sideB.displayName;
    if (meetings.length === 1) {
      streakText = `Último cruce ganado por ${streakHolderName}`;
    } else if (streakCount >= 2) {
      streakText = `${streakHolderName} suma ${streakCount} victorias seguidas en el historial`;
    } else {
      streakText = `Último cruce ganado por ${streakHolderName}`;
    }
  }

  const formA = computeSideProfile(
    sideA,
    completedMatches,
    selectedMatch.id,
    tournamentMap,
    playerMap,
    registrationMap
  );
  const formB = computeSideProfile(
    sideB,
    completedMatches,
    selectedMatch.id,
    tournamentMap,
    playerMap,
    registrationMap
  );

  return {
    sideA,
    sideB,
    hasBothSides,
    totalMeetings: meetings.length,
    winsA,
    winsB,
    setsWonA,
    setsWonB,
    gamesWonA,
    gamesWonB,
    lastWinnerSide: meetings[0]?.winnerSide || null,
    streakText,
    surfaceBreakdown: Array.from(surfaceMap.values()).sort((a, b) => b.total - a.total),
    meetings,
    formA,
    formB,
  };
}
