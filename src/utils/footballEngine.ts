import {
  Division,
  FifaCompetitionConfig,
  FootballFormat,
  FootballMatchScore,
  FootballMatchSheet,
  FootballPlayerStats,
  Group,
  Match,
  PlayerPublic,
  Registration,
  StandingRow,
} from '../types/tennis';
import { makeId, shuffleArray } from './tournamentEngine';

export const FIFA_EDITION_LABEL = 'Reglas FIFA 2026';

export function createDefaultFifaConfig(
  format: FootballFormat = 'futbol_11'
): FifaCompetitionConfig {
  const halfMinutes = format === 'futbol_11' ? 45 : format === 'futbol_7' ? 30 : 20;
  const maxSubstitutions = format === 'futbol_11' ? 5 : 12;
  return {
    edition: FIFA_EDITION_LABEL,
    halfMinutes,
    allowExtraTime: format === 'futbol_11',
    extraTimeHalfMinutes: format === 'futbol_11' ? 15 : 5,
    penaltyShootoutInKnockout: true,
    maxSubstitutions,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    qualifyingPhaseEnabled: true,
    qualifyingStageLabel: 'Fase Clasificatoria (Play-In / Repechaje)',
    allowBestThirds: true,
    yellowCardSuspensionLimit: 3,
    minMatchesForBestGoalkeeper: 1,
  };
}

export function createEmptyFootballPlayerStats(): FootballPlayerStats {
  return {
    matchesPlayed: 0,
    minutesPlayed: 0,
    goals: 0,
    penaltyGoals: 0,
    ownGoals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    goalsConceded: 0,
    cleanSheets: 0,
  };
}

export function createEmptyFootballMatchSheet(): FootballMatchSheet {
  return {
    referee: null,
    assistantRef1: null,
    assistantRef2: null,
    fourthOfficial: null,
    attendance: null,
    notes: null,
    lineupA: [],
    lineupB: [],
    goalkeeperAId: null,
    goalkeeperAName: null,
    goalkeeperBId: null,
    goalkeeperBName: null,
    events: [],
    substitutions: [],
    signedByReferee: false,
    signedAt: null,
  };
}

export function isFootballTournament(tournament?: { sport?: string } | null): boolean {
  return tournament?.sport === 'football';
}

export function isFootballDivision(division?: { sport?: string } | null): boolean {
  return division?.sport === 'football';
}

export function formatFootballScoreString(match: Match): string {
  if (match.isBye) return 'BYE';
  if (match.status === 'wo') {
    const fs = match.footballScore;
    if (fs) return `${fs.goalsA} - ${fs.goalsB} W.O.`;
    return '3 - 0 W.O.';
  }
  const fs = match.footballScore;
  if (!fs) {
    if (match.status === 'programado' || match.status === 'reprogramado') return 'vs';
    return '0 - 0';
  }
  const base = `${fs.goalsA} - ${fs.goalsB}`;
  if (fs.decidedBy === 'penalties' && fs.penaltiesA != null && fs.penaltiesB != null) {
    return `${base} (${fs.penaltiesA}-${fs.penaltiesB} P)`;
  }
  if (fs.decidedBy === 'extra_time') {
    return `${base} (ET)`;
  }
  return base;
}

export function resolveFootballMatchWinner(
  match: Pick<
    Match,
    'phase' | 'entryAId' | 'entryAName' | 'entryBId' | 'entryBName' | 'status'
  >,
  score: FootballMatchScore,
  woWinnerSide?: 'A' | 'B' | null
): {
  winnerEntryId: string | null;
  winnerName: string | null;
  outcomeNote: string | null;
  normalizedScore: FootballMatchScore;
} {
  if (match.status === 'wo') {
    const side = woWinnerSide || (score.goalsB > score.goalsA ? 'B' : 'A');
    const winnerId = side === 'A' ? match.entryAId || null : match.entryBId || null;
    const winnerName = side === 'A' ? match.entryAName : match.entryBName;
    return {
      winnerEntryId: winnerId,
      winnerName: winnerId ? winnerName : null,
      outcomeNote: `Walkover FIFA (3 - 0) a favor de ${winnerName}`,
      normalizedScore: {
        goalsA: side === 'A' ? 3 : 0,
        goalsB: side === 'B' ? 3 : 0,
        halfTimeA: null,
        halfTimeB: null,
        extraTimeA: null,
        extraTimeB: null,
        penaltiesA: null,
        penaltiesB: null,
        decidedBy: 'wo',
      },
    };
  }

  const goalsA = Math.max(0, Math.round(Number(score.goalsA) || 0));
  const goalsB = Math.max(0, Math.round(Number(score.goalsB) || 0));

  if (goalsA > goalsB) {
    const isEt = score.decidedBy === 'extra_time';
    return {
      winnerEntryId: match.entryAId || null,
      winnerName: match.entryAName,
      outcomeNote: isEt
        ? `Victoria en tiempo suplementario (${goalsA}-${goalsB})`
        : null,
      normalizedScore: {
        ...score,
        goalsA,
        goalsB,
        decidedBy: isEt ? 'extra_time' : 'regular',
      },
    };
  }

  if (goalsB > goalsA) {
    const isEt = score.decidedBy === 'extra_time';
    return {
      winnerEntryId: match.entryBId || null,
      winnerName: match.entryBName,
      outcomeNote: isEt
        ? `Victoria en tiempo suplementario (${goalsA}-${goalsB})`
        : null,
      normalizedScore: {
        ...score,
        goalsA,
        goalsB,
        decidedBy: isEt ? 'extra_time' : 'regular',
      },
    };
  }

  // Empate en goles
  const isKnockoutOrQualifying =
    match.phase === 'eliminacion' || match.phase === 'clasificatoria';
  if (
    isKnockoutOrQualifying &&
    score.penaltiesA != null &&
    score.penaltiesB != null &&
    score.penaltiesA !== score.penaltiesB
  ) {
    const penA = Math.max(0, Math.round(Number(score.penaltiesA) || 0));
    const penB = Math.max(0, Math.round(Number(score.penaltiesB) || 0));
    const aWon = penA > penB;
    return {
      winnerEntryId: aWon ? match.entryAId || null : match.entryBId || null,
      winnerName: aWon ? match.entryAName : match.entryBName,
      outcomeNote: `Definido por penales FIFA (${penA} - ${penB})`,
      normalizedScore: {
        ...score,
        goalsA,
        goalsB,
        penaltiesA: penA,
        penaltiesB: penB,
        decidedBy: 'penalties',
      },
    };
  }

  // Empate reglamentario en fase de grupos
  return {
    winnerEntryId: null,
    winnerName: 'Empate',
    outcomeNote: 'Empate reglamentario',
    normalizedScore: {
      ...score,
      goalsA,
      goalsB,
      decidedBy: 'regular',
    },
  };
}

function getTeamCardCountsFromMatch(m: Match, side: 'A' | 'B'): {
  yellow: number;
  red: number;
  fairPlayDelta: number;
} {
  const events = m.footballSheet?.events || [];
  let yellow = 0;
  let red = 0;
  let fairPlayDelta = 0;

  for (const ev of events) {
    if (ev.teamSide !== side) continue;
    if (ev.type === 'amarilla') {
      yellow += 1;
      fairPlayDelta -= 1;
    } else if (ev.type === 'doble_amarilla') {
      yellow += 1;
      red += 1;
      fairPlayDelta -= 3;
    } else if (ev.type === 'roja') {
      red += 1;
      fairPlayDelta -= 4;
    }
  }
  return { yellow, red, fairPlayDelta };
}

/**
 * Tabla de Posiciones FIFA oficial:
 * Puntos (3/1/0) -> Diferencia de Gol (DG) -> Goles a Favor (GF) ->
 * Sub-tabla de enfrentamiento directo (PTS -> DG -> GF entre empatados) ->
 * Fair Play FIFA (-1 amarilla, -3 doble amarilla, -4 roja directa) -> Seed / Orden alfabético.
 */
export function computeFootballGroupStandings(
  group: Group,
  allMatches: Match[],
  registrations: Registration[],
  division: Division
): StandingRow[] {
  const fifa = division.fifaConfig || createDefaultFifaConfig(division.footballFormat);
  const regMap = new Map(registrations.map((r) => [r.id, r]));
  const rowsMap = new Map<string, StandingRow>();

  group.entryIds.forEach((entryId) => {
    const reg = regMap.get(entryId);
    const existingRow = group.standings.find((s) => s.entryId === entryId);
    rowsMap.set(entryId, {
      entryId,
      displayName: reg?.displayName || existingRow?.displayName || 'Equipo',
      club: reg?.club || existingRow?.club || '',
      seed: reg?.seed ?? existingRow?.seed ?? null,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      setsWon: 0,
      setsLost: 0,
      setsDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayPoints: 0,
      points: 0,
      woLosses: 0,
      qualified: false,
    });
  });

  const groupEntryIds = new Set(group.entryIds);
  const completedMatches = allMatches.filter(
    (m) =>
      (m.groupId === group.id ||
        (m.phase === 'grupos' &&
          Boolean(m.entryAId) &&
          Boolean(m.entryBId) &&
          groupEntryIds.has(m.entryAId!) &&
          groupEntryIds.has(m.entryBId!))) &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status) &&
      (Boolean(m.footballScore) || m.status === 'wo')
  );

  for (const m of completedMatches) {
    if (!m.entryAId || !m.entryBId) continue;
    const rowA = rowsMap.get(m.entryAId);
    const rowB = rowsMap.get(m.entryBId);
    if (!rowA || !rowB) continue;

    rowA.played++;
    rowB.played++;

    let gA = m.footballScore?.goalsA ?? 0;
    let gB = m.footballScore?.goalsB ?? 0;

    if (m.status === 'wo') {
      const aWon = m.winnerEntryId === m.entryAId || gA > gB;
      gA = aWon ? 3 : 0;
      gB = aWon ? 0 : 3;
      if (aWon) rowB.woLosses++;
      else rowA.woLosses++;
    }

    rowA.goalsFor = (rowA.goalsFor || 0) + gA;
    rowA.goalsAgainst = (rowA.goalsAgainst || 0) + gB;
    rowB.goalsFor = (rowB.goalsFor || 0) + gB;
    rowB.goalsAgainst = (rowB.goalsAgainst || 0) + gA;

    rowA.gamesWon = rowA.goalsFor;
    rowA.gamesLost = rowA.goalsAgainst;
    rowB.gamesWon = rowB.goalsFor;
    rowB.gamesLost = rowB.goalsAgainst;

    if (gA > gB) {
      rowA.won++;
      rowA.points += fifa.pointsWin;
      rowB.lost++;
      rowB.points += fifa.pointsLoss;
    } else if (gB > gA) {
      rowB.won++;
      rowB.points += fifa.pointsWin;
      rowA.lost++;
      rowA.points += fifa.pointsLoss;
    } else {
      rowA.drawn = (rowA.drawn || 0) + 1;
      rowB.drawn = (rowB.drawn || 0) + 1;
      rowA.points += fifa.pointsDraw;
      rowB.points += fifa.pointsDraw;
    }

    const cardsA = getTeamCardCountsFromMatch(m, 'A');
    const cardsB = getTeamCardCountsFromMatch(m, 'B');
    rowA.yellowCards = (rowA.yellowCards || 0) + cardsA.yellow;
    rowA.redCards = (rowA.redCards || 0) + cardsA.red;
    rowA.fairPlayPoints = (rowA.fairPlayPoints || 0) + cardsA.fairPlayDelta;
    rowB.yellowCards = (rowB.yellowCards || 0) + cardsB.yellow;
    rowB.redCards = (rowB.redCards || 0) + cardsB.red;
    rowB.fairPlayPoints = (rowB.fairPlayPoints || 0) + cardsB.fairPlayDelta;
  }

  const rows = Array.from(rowsMap.values()).map((r) => {
    const gf = r.goalsFor || 0;
    const gc = r.goalsAgainst || 0;
    return {
      ...r,
      goalDiff: gf - gc,
      gamesDiff: gf - gc,
    };
  });

  // Calcular sub-tabla Head-to-Head por grupo de puntos empatados
  const h2hStatsByPoints = new Map<
    number,
    Map<string, { pts: number; gf: number; gc: number; dg: number }>
  >();

  const pointGroups = new Map<number, string[]>();
  rows.forEach((r) => {
    const list = pointGroups.get(r.points) || [];
    list.push(r.entryId);
    pointGroups.set(r.points, list);
  });

  pointGroups.forEach((tiedIds, ptsValue) => {
    if (tiedIds.length < 2) return;
    const tiedSet = new Set(tiedIds);
    const subMap = new Map<string, { pts: number; gf: number; gc: number; dg: number }>();
    tiedIds.forEach((id) => subMap.set(id, { pts: 0, gf: 0, gc: 0, dg: 0 }));

    completedMatches.forEach((m) => {
      if (!m.entryAId || !m.entryBId) return;
      if (!tiedSet.has(m.entryAId) || !tiedSet.has(m.entryBId)) return;
      const gA = m.status === 'wo' ? (m.winnerEntryId === m.entryAId ? 3 : 0) : m.footballScore?.goalsA ?? 0;
      const gB = m.status === 'wo' ? (m.winnerEntryId === m.entryBId ? 3 : 0) : m.footballScore?.goalsB ?? 0;
      const sA = subMap.get(m.entryAId)!;
      const sB = subMap.get(m.entryBId)!;
      sA.gf += gA;
      sA.gc += gB;
      sB.gf += gB;
      sB.gc += gA;
      if (gA > gB) sA.pts += fifa.pointsWin;
      else if (gB > gA) sB.pts += fifa.pointsWin;
      else {
        sA.pts += fifa.pointsDraw;
        sB.pts += fifa.pointsDraw;
      }
    });

    subMap.forEach((val) => {
      val.dg = val.gf - val.gc;
    });
    h2hStatsByPoints.set(ptsValue, subMap);
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const dgA = a.goalDiff ?? 0;
    const dgB = b.goalDiff ?? 0;
    if (dgB !== dgA) return dgB - dgA;

    const gfA = a.goalsFor ?? 0;
    const gfB = b.goalsFor ?? 0;
    if (gfB !== gfA) return gfB - gfA;

    const subMap = h2hStatsByPoints.get(a.points);
    if (subMap) {
      const hA = subMap.get(a.entryId);
      const hB = subMap.get(b.entryId);
      if (hA && hB) {
        if (hB.pts !== hA.pts) return hB.pts - hA.pts;
        if (hB.dg !== hA.dg) return hB.dg - hA.dg;
        if (hB.gf !== hA.gf) return hB.gf - hA.gf;
      }
    }

    const fpA = a.fairPlayPoints ?? 0;
    const fpB = b.fairPlayPoints ?? 0;
    if (fpB !== fpA) return fpB - fpA;

    return (a.seed ?? 999) - (b.seed ?? 999) || a.displayName.localeCompare(b.displayName, 'es');
  });

  const qCount =
    division.format === 'todos_contra_todos' ? 1 : Math.max(1, division.drawConfig.qualifiersPerGroup || 2);

  return rows.map((r, idx) => ({
    ...r,
    qualified: idx < qCount,
  }));
}

export function generateFootballMatchesForGroupBuckets(
  buckets: Array<{ id?: string; name: string; entries: Registration[] }>,
  division: Division
): { groups: Group[]; matches: Match[] } {
  const now = new Date().toISOString();
  const groups: Group[] = [];
  const matches: Match[] = [];

  buckets.forEach((bucket) => {
    if (bucket.entries.length === 0) return;
    const groupId = bucket.id || makeId(`fgrp_${division.id.slice(0, 8)}`);
    const groupName = bucket.name;
    const standings: StandingRow[] = bucket.entries.map((entry) => ({
      entryId: entry.id,
      displayName: entry.displayName,
      club: entry.club || entry.displayName,
      seed: entry.seed ?? null,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      setsWon: 0,
      setsLost: 0,
      setsDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayPoints: 0,
      points: 0,
      woLosses: 0,
      qualified: false,
    }));

    groups.push({
      id: groupId,
      tournamentId: division.tournamentId,
      divisionId: division.id,
      name: groupName,
      entryIds: bucket.entries.map((e) => e.id),
      standings,
      published: false,
      updatedAt: now,
    });

    const list = [...bucket.entries];
    if (list.length % 2 === 1) {
      list.push({
        id: '__BYE__',
        tournamentId: division.tournamentId,
        divisionId: division.id,
        modality: 'Equipo',
        playerIds: [],
        displayName: 'Libre',
        status: 'confirmada',
        registeredAt: now,
        updatedAt: now,
      });
    }
    const n = list.length;
    const rounds = n - 1;
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < n / 2; i++) {
        const home = r % 2 === 0 ? list[i] : list[n - 1 - i];
        const away = r % 2 === 0 ? list[n - 1 - i] : list[i];
        if (home.id !== '__BYE__' && away.id !== '__BYE__') {
          matches.push({
            id: makeId('fmat'),
            tournamentId: division.tournamentId,
            divisionId: division.id,
            matchdayId: null,
            phase: 'grupos',
            roundName: `${groupName} · Fecha ${r + 1}`,
            roundOrder: r + 1,
            bracketPosition: null,
            nextMatchId: null,
            nextMatchSlot: null,
            groupId,
            entryAId: home.id,
            entryAName: home.displayName,
            playerIdsA: home.playerIds.slice(0, 35),
            entryBId: away.id,
            entryBName: away.displayName,
            playerIdsB: away.playerIds.slice(0, 35),
            isBye: false,
            scheduledDate: null,
            scheduledTime: null,
            courtId: null,
            courtName: null,
            status: 'programado',
            sets: [],
            footballScore: null,
            footballSheet: createEmptyFootballMatchSheet(),
            winnerEntryId: null,
            winnerName: null,
            outcomeNote: null,
            correctionHistory: [],
            rescheduleHistory: [],
            published: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      const fixed = list[0];
      const rest = list.slice(1);
      const last = rest.pop()!;
      list.splice(0, list.length, fixed, last, ...rest);
    }
  });

  return { groups, matches };
}

export function generateFootballGroupsDrawPreview(
  confirmedEntries: Registration[],
  division: Division
): { groups: Group[]; matches: Match[] } {
  const groupCount =
    division.format === 'todos_contra_todos' ? 1 : Math.max(1, division.drawConfig.groupCount || 2);

  const seeded = division.drawConfig.seedingEnabled
    ? confirmedEntries.filter((e) => e.seed != null).sort((a, b) => (a.seed || 99) - (b.seed || 99))
    : [];
  const unseeded = shuffleArray(
    division.drawConfig.seedingEnabled
      ? confirmedEntries.filter((e) => e.seed == null)
      : confirmedEntries
  );

  const ordered = [...seeded, ...unseeded];
  const buckets: Registration[][] = Array.from({ length: groupCount }, () => []);

  ordered.forEach((entry, idx) => {
    const round = Math.floor(idx / groupCount);
    const posInRound = idx % groupCount;
    const bucketIdx = round % 2 === 0 ? posInRound : groupCount - 1 - posInRound;
    buckets[bucketIdx].push(entry);
  });

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const namedBuckets = buckets.map((entries, gIdx) => ({
    name:
      division.format === 'todos_contra_todos'
        ? 'Tabla Única (Liga)'
        : `Grupo ${letters[gIdx] || gIdx + 1}`,
    entries,
  }));

  return generateFootballMatchesForGroupBuckets(namedBuckets, division);
}

/**
 * Genera llaves de Fase Clasificatoria (Play-In / Repechaje) entre equipos ubicados
 * en zona clasificatoria según tabla de grupos (ej: 2° vs 3° cruzados o repechaje).
 */
export function generateFootballQualifyingMatches(
  pairs: Array<[Registration, Registration]>,
  division: Division,
  startingRoundOrder = 8
): Match[] {
  const now = new Date().toISOString();
  const stageLabel = division.fifaConfig?.qualifyingStageLabel || 'Fase Clasificatoria';
  return pairs.map(([a, b], idx) => ({
    id: makeId('fcla'),
    tournamentId: division.tournamentId,
    divisionId: division.id,
    matchdayId: null,
    phase: 'clasificatoria',
    roundName: `${stageLabel} · Llave ${idx + 1}`.slice(0, 140),
    roundOrder: startingRoundOrder,
    bracketPosition: idx + 1,
    nextMatchId: null,
    nextMatchSlot: null,
    groupId: null,
    entryAId: a.id,
    entryAName: a.displayName,
    playerIdsA: a.playerIds.slice(0, 35),
    entryBId: b.id,
    entryBName: b.displayName,
    playerIdsB: b.playerIds.slice(0, 35),
    isBye: false,
    scheduledDate: null,
    scheduledTime: null,
    courtId: null,
    courtName: null,
    status: 'programado',
    sets: [],
    footballScore: null,
    footballSheet: createEmptyFootballMatchSheet(),
    winnerEntryId: null,
    winnerName: null,
    outcomeNote: null,
    correctionHistory: [],
    rescheduleHistory: [],
    published: false,
    createdAt: now,
    updatedAt: now,
  }));
}

export function suggestFootballQualifyingPairs(
  groups: Group[],
  matches: Match[],
  registrations: Registration[],
  division: Division
): Array<[Registration, Registration]> {
  if (groups.length === 0) return [];
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const regMap = new Map(registrations.map((r) => [r.id, r]));
  const standingsByGroup = sortedGroups.map((g) =>
    computeFootballGroupStandings(g, matches, registrations, division)
  );

  const pairs: Array<[Registration, Registration]> = [];
  if (sortedGroups.length >= 2) {
    // Cruce clásico: 2° Grupo i vs 3° Grupo j (cruzado) o 2° vs 2°
    for (let i = 0; i < sortedGroups.length; i += 2) {
      const g1 = standingsByGroup[i];
      const g2 = standingsByGroup[i + 1];
      if (!g1 || !g2) continue;
      const g1Second = g1[1] ? regMap.get(g1[1].entryId) : undefined;
      const g1Third = g1[2] ? regMap.get(g1[2].entryId) : undefined;
      const g2Second = g2[1] ? regMap.get(g2[1].entryId) : undefined;
      const g2Third = g2[2] ? regMap.get(g2[2].entryId) : undefined;

      if (g1Second && g2Third && g2Second && g1Third) {
        pairs.push([g1Second, g2Third]);
        pairs.push([g2Second, g1Third]);
      } else if (g1Second && g2Second) {
        pairs.push([g1Second, g2Second]);
      }
    }
  } else if (sortedGroups.length === 1) {
    const rows = standingsByGroup[0];
    const r2 = rows[1] ? regMap.get(rows[1].entryId) : undefined;
    const r3 = rows[2] ? regMap.get(rows[2].entryId) : undefined;
    const r4 = rows[3] ? regMap.get(rows[3].entryId) : undefined;
    const r5 = rows[4] ? regMap.get(rows[4].entryId) : undefined;
    if (r2 && r5 && r3 && r4) {
      pairs.push([r2, r5]);
      pairs.push([r3, r4]);
    } else if (r2 && r3) {
      pairs.push([r2, r3]);
    }
  }

  return pairs;
}

export function computeFootballQualifiedSeededEntries(
  groups: Group[],
  matches: Match[],
  registrations: Registration[],
  division: Division
): Registration[] {
  const regMap = new Map(registrations.map((r) => [r.id, r]));
  const qualifyingMatches = matches.filter((m) => m.phase === 'clasificatoria');
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  if (sortedGroups.length === 0) {
    return registrations.filter((r) => r.status === 'confirmada');
  }

  const standingsByGroup = sortedGroups.map((g) =>
    computeFootballGroupStandings(g, matches, registrations, division)
  );

  // Si existen llaves de Fase Clasificatoria finalizadas, tomar 1° de cada grupo + ganadores de Fase Clasificatoria
  const finishedQualifiers = qualifyingMatches.filter(
    (m) => m.winnerEntryId && ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
  );

  if (qualifyingMatches.length > 0 && finishedQualifiers.length > 0) {
    const ordered: Registration[] = [];
    const seen = new Set<string>();
    standingsByGroup.forEach((rows) => {
      const first = rows[0] ? regMap.get(rows[0].entryId) : undefined;
      if (first && !seen.has(first.id)) {
        seen.add(first.id);
        ordered.push({ ...first, seed: ordered.length + 1 });
      }
    });
    finishedQualifiers.forEach((qm) => {
      const w = qm.winnerEntryId ? regMap.get(qm.winnerEntryId) : undefined;
      if (w && !seen.has(w.id)) {
        seen.add(w.id);
        ordered.push({ ...w, seed: ordered.length + 1 });
      }
    });
    if (ordered.length >= 2) return ordered;
  }

  const qPerGroup = Math.max(1, division.drawConfig.qualifiersPerGroup || 2);
  const ordered: Registration[] = [];
  const seen = new Set<string>();
  const groupCount = sortedGroups.length;

  for (let rank = 0; rank < qPerGroup; rank++) {
    const shift = rank % 2 === 1 ? Math.ceil(groupCount / 2) : 0;
    for (let i = 0; i < groupCount; i++) {
      const gIdx = (i + shift) % groupCount;
      const row = standingsByGroup[gIdx]?.[rank];
      if (!row) continue;
      const reg = regMap.get(row.entryId);
      if (reg && !seen.has(reg.id)) {
        seen.add(reg.id);
        ordered.push({ ...reg, seed: ordered.length + 1 });
      }
    }
  }

  return ordered;
}

function getKnockoutRoundLabel(totalSlots: number, roundIndex: number): string {
  const matchesInRound = totalSlots / Math.pow(2, roundIndex + 1);
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semifinales';
  if (matchesInRound === 4) return 'Cuartos de Final';
  if (matchesInRound === 8) return 'Octavos de Final';
  return `Ronda de ${matchesInRound * 2}`;
}

export function generateFootballKnockoutBracket(
  entries: Registration[],
  division: Division,
  startingRoundOrder = 20
): Match[] {
  if (entries.length < 2) return [];
  const now = new Date().toISOString();
  let size = 2;
  while (size < entries.length) size *= 2;

  const seeded = [...entries].sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const seedOrder = (n: number): number[] => {
    let order = [1, 2];
    while (order.length < n) {
      const nextSize = order.length * 2 + 1;
      const next: number[] = [];
      for (const s of order) {
        next.push(s, nextSize - s);
      }
      order = next;
    }
    return order;
  };

  const positions = seedOrder(size);
  const firstRoundPairs: Array<[Registration | null, Registration | null]> = [];
  for (let i = 0; i < positions.length; i += 2) {
    const a = seeded[positions[i] - 1] || null;
    const b = seeded[positions[i + 1] - 1] || null;
    firstRoundPairs.push([a, b]);
  }

  const numRounds = Math.log2(size);
  const roundsMatches: Match[][] = [];

  for (let r = 0; r < numRounds; r++) {
    const count = size / Math.pow(2, r + 1);
    const roundName = getKnockoutRoundLabel(size, r);
    const roundList: Match[] = [];
    for (let pos = 0; pos < count; pos++) {
      roundList.push({
        id: makeId('fko'),
        tournamentId: division.tournamentId,
        divisionId: division.id,
        matchdayId: null,
        phase: 'eliminacion',
        roundName,
        roundOrder: startingRoundOrder + r,
        bracketPosition: pos + 1,
        nextMatchId: null,
        nextMatchSlot: null,
        groupId: null,
        entryAId: null,
        entryAName: 'Por definir',
        playerIdsA: [],
        entryBId: null,
        entryBName: 'Por definir',
        playerIdsB: [],
        isBye: false,
        scheduledDate: null,
        scheduledTime: null,
        courtId: null,
        courtName: null,
        status: 'programado',
        sets: [],
        footballScore: null,
        footballSheet: createEmptyFootballMatchSheet(),
        winnerEntryId: null,
        winnerName: null,
        outcomeNote: null,
        correctionHistory: [],
        rescheduleHistory: [],
        published: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    roundsMatches.push(roundList);
  }

  for (let r = 0; r < numRounds - 1; r++) {
    roundsMatches[r].forEach((m, idx) => {
      const nextIdx = Math.floor(idx / 2);
      m.nextMatchId = roundsMatches[r + 1][nextIdx].id;
      m.nextMatchSlot = idx % 2 === 0 ? 'A' : 'B';
    });
  }

  roundsMatches[0].forEach((m, idx) => {
    const [a, b] = firstRoundPairs[idx] || [null, null];
    m.entryAId = a?.id || null;
    m.entryAName = a ? a.displayName : b ? 'BYE' : 'Por definir';
    m.playerIdsA = a?.playerIds.slice(0, 35) || [];
    m.entryBId = b?.id || null;
    m.entryBName = b ? b.displayName : a ? 'BYE' : 'Por definir';
    m.playerIdsB = b?.playerIds.slice(0, 35) || [];

    if ((a && !b) || (!a && b)) {
      const winner = a || b!;
      m.isBye = true;
      m.status = 'finalizado';
      m.winnerEntryId = winner.id;
      m.winnerName = winner.displayName;
      m.outcomeNote = 'Pase libre (BYE)';
      if (m.nextMatchId && m.nextMatchSlot) {
        const nextMatch = roundsMatches[1]?.find((nm) => nm.id === m.nextMatchId);
        if (nextMatch) {
          if (m.nextMatchSlot === 'A') {
            nextMatch.entryAId = winner.id;
            nextMatch.entryAName = winner.displayName;
            nextMatch.playerIdsA = winner.playerIds.slice(0, 35);
          } else {
            nextMatch.entryBId = winner.id;
            nextMatch.entryBName = winner.displayName;
            nextMatch.playerIdsB = winner.playerIds.slice(0, 35);
          }
        }
      }
    }
  });

  const result = roundsMatches.flat();
  if (division.hasThirdPlaceMatch && numRounds >= 2) {
    result.push({
      id: makeId('fko3'),
      tournamentId: division.tournamentId,
      divisionId: division.id,
      matchdayId: null,
      phase: 'eliminacion',
      roundName: 'Tercer Puesto',
      roundOrder: startingRoundOrder + numRounds - 1,
      bracketPosition: 2,
      nextMatchId: null,
      nextMatchSlot: null,
      isThirdPlace: true,
      groupId: null,
      entryAId: null,
      entryAName: 'Por definir',
      playerIdsA: [],
      entryBId: null,
      entryBName: 'Por definir',
      playerIdsB: [],
      isBye: false,
      scheduledDate: null,
      scheduledTime: null,
      courtId: null,
      courtName: null,
      status: 'programado',
      sets: [],
      footballScore: null,
      footballSheet: createEmptyFootballMatchSheet(),
      winnerEntryId: null,
      winnerName: null,
      outcomeNote: null,
      correctionHistory: [],
      rescheduleHistory: [],
      published: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return result;
}

export interface TopScorerRow {
  playerId: string;
  playerName: string;
  teamId?: string | null;
  teamName: string;
  divisionId?: string;
  category?: string;
  jerseyNumber?: number | null;
  position?: string;
  photoUrl?: string | null;
  goals: number;
  penaltyGoals: number;
  assists: number;
  matchesPlayed: number;
  goalsPerMatch: number;
}

/**
 * Tabla de Goleadores FIFA:
 * Suma 'gol' y 'penal' (excluyendo 'en_contra' según reglamento oficial FIFA).
 */
export function computeFootballTopScorers(params: {
  matches: Match[];
  players: PlayerPublic[];
  registrations: Registration[];
  divisions: Division[];
  divisionId?: string | 'ALL';
}): TopScorerRow[] {
  const { matches, players, registrations, divisions, divisionId = 'ALL' } = params;
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const regMap = new Map(registrations.map((r) => [r.id, r]));
  const divMap = new Map(divisions.map((d) => [d.id, d]));

  const relevantMatches = matches.filter(
    (m) =>
      (divisionId === 'ALL' || m.divisionId === divisionId) &&
      !m.isBye &&
      ['en_curso', 'finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
  );

  const statsMap = new Map<string, TopScorerRow>();
  const playedMatchIdsByPlayer = new Map<string, Set<string>>();

  const ensureRow = (
    keyId: string,
    fallbackName: string,
    teamId: string | null | undefined,
    teamName: string,
    divId: string
  ): TopScorerRow => {
    const existing = statsMap.get(keyId);
    if (existing) return existing;
    const p = playerMap.get(keyId);
    const div = divMap.get(divId);
    const reg = teamId ? regMap.get(teamId) : undefined;
    const row: TopScorerRow = {
      playerId: keyId,
      playerName: p?.fullName || fallbackName,
      teamId: teamId || p?.teamId || null,
      teamName: reg?.displayName || p?.club || teamName,
      divisionId: divId,
      category: div?.category || p?.habitualCategory,
      jerseyNumber: p?.jerseyNumber ?? null,
      position: p?.position,
      photoUrl: p?.photoUrl || null,
      goals: 0,
      penaltyGoals: 0,
      assists: 0,
      matchesPlayed: 0,
      goalsPerMatch: 0,
    };
    statsMap.set(keyId, row);
    return row;
  };

  for (const m of relevantMatches) {
    const sheet = m.footballSheet;
    if (!sheet) continue;

    // Contabilizar partidos jugados desde alineación y cambios
    const registerAppearance = (pid: string, name: string, side: 'A' | 'B') => {
      if (!pid) return;
      const teamId = side === 'A' ? m.entryAId : m.entryBId;
      const teamName = side === 'A' ? m.entryAName : m.entryBName;
      ensureRow(pid, name, teamId, teamName, m.divisionId);
      const set = playedMatchIdsByPlayer.get(pid) || new Set<string>();
      set.add(m.id);
      playedMatchIdsByPlayer.set(pid, set);
    };

    sheet.lineupA.forEach((lp) => {
      if (lp.isStarter) registerAppearance(lp.playerId, lp.fullName, 'A');
    });
    sheet.lineupB.forEach((lp) => {
      if (lp.isStarter) registerAppearance(lp.playerId, lp.fullName, 'B');
    });
    sheet.substitutions.forEach((sub) => {
      if (sub.playerInId) registerAppearance(sub.playerInId, sub.playerInName, sub.teamSide);
    });

    for (const ev of sheet.events) {
      const teamId = ev.teamSide === 'A' ? m.entryAId : m.entryBId;
      const teamName = ev.teamSide === 'A' ? m.entryAName : m.entryBName;

      if (ev.type === 'gol' || ev.type === 'penal') {
        const key = ev.playerId || `name:${teamId || ev.teamSide}:${ev.playerName.toLowerCase()}`;
        const row = ensureRow(key, ev.playerName, teamId, teamName, m.divisionId);
        row.goals += 1;
        if (ev.type === 'penal') row.penaltyGoals += 1;
        if (ev.playerId) {
          const set = playedMatchIdsByPlayer.get(ev.playerId) || new Set<string>();
          set.add(m.id);
          playedMatchIdsByPlayer.set(ev.playerId, set);
        }
      }

      if ((ev.type === 'gol' || ev.type === 'penal') && (ev.assistPlayerId || ev.assistPlayerName)) {
        const aKey =
          ev.assistPlayerId ||
          `name:${teamId || ev.teamSide}:${(ev.assistPlayerName || '').toLowerCase()}`;
        const aRow = ensureRow(
          aKey,
          ev.assistPlayerName || 'Asistencia',
          teamId,
          teamName,
          m.divisionId
        );
        aRow.assists += 1;
      }
    }
  }

  return Array.from(statsMap.values())
    .map((row) => {
      const pj = playedMatchIdsByPlayer.get(row.playerId)?.size || (row.goals > 0 ? 1 : 0);
      return {
        ...row,
        matchesPlayed: pj,
        goalsPerMatch: pj > 0 ? Number((row.goals / pj).toFixed(2)) : 0,
      };
    })
    .filter((r) => r.goals > 0 || r.assists > 0)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        a.penaltyGoals - b.penaltyGoals ||
        b.assists - a.assists ||
        b.goalsPerMatch - a.goalsPerMatch ||
        a.playerName.localeCompare(b.playerName, 'es')
    );
}

export interface BestGoalkeeperRow {
  goalkeeperKey: string;
  playerId?: string | null;
  goalkeeperName: string;
  teamId: string;
  teamName: string;
  divisionId: string;
  category?: string;
  photoUrl?: string | null;
  matchesPlayed: number;
  goalsConceded: number;
  cleanSheets: number;
  wins: number;
  goalsAgainstAvg: number;
  eligible: boolean;
}

/**
 * Valla Menos Vendida (Arquero / Defensa menos vencida):
 * Calcula goles recibidos (GC), vallas invictas y promedio GC/PJ por arquero (o valla de equipo).
 */
export function computeFootballBestGoalkeepers(params: {
  matches: Match[];
  players: PlayerPublic[];
  registrations: Registration[];
  divisions: Division[];
  divisionId?: string | 'ALL';
}): BestGoalkeeperRow[] {
  const { matches, players, registrations, divisions, divisionId = 'ALL' } = params;
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const divMap = new Map(divisions.map((d) => [d.id, d]));

  // Buscar arquero principal de cada equipo en caso de que la planilla no seleccione uno explícito
  const teamDefaultGk = new Map<string, PlayerPublic>();
  players.forEach((p) => {
    if (p.teamId && p.position === 'Arquero' && !teamDefaultGk.has(p.teamId)) {
      teamDefaultGk.set(p.teamId, p);
    }
  });

  const completedMatches = matches.filter(
    (m) =>
      (divisionId === 'ALL' || m.divisionId === divisionId) &&
      !m.isBye &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status) &&
      (Boolean(m.footballScore) || m.status === 'wo')
  );

  const gkMap = new Map<string, BestGoalkeeperRow>();

  const recordSide = (
    m: Match,
    side: 'A' | 'B',
    goalsAgainst: number,
    won: boolean
  ) => {
    const teamId = side === 'A' ? m.entryAId : m.entryBId;
    const teamName = side === 'A' ? m.entryAName : m.entryBName;
    if (!teamId) return;

    const sheet = m.footballSheet;
    const explicitGkId = side === 'A' ? sheet?.goalkeeperAId : sheet?.goalkeeperBId;
    const explicitGkName = side === 'A' ? sheet?.goalkeeperAName : sheet?.goalkeeperBName;
    const lineup = side === 'A' ? sheet?.lineupA || [] : sheet?.lineupB || [];
    const lineupGk = lineup.find((lp) => lp.position === 'Arquero' && lp.isStarter) || lineup.find((lp) => lp.position === 'Arquero');
    const reg = registrations.find((r) => r.id === teamId);
    const defaultGk =
      teamDefaultGk.get(teamId) ||
      reg?.playerIds.map((pid) => playerMap.get(pid)).find((p) => p?.position === 'Arquero');

    const gkPlayerId = explicitGkId || lineupGk?.playerId || defaultGk?.id || null;
    const gkPlayerObj = gkPlayerId ? playerMap.get(gkPlayerId) : undefined;
    const gkName =
      explicitGkName ||
      lineupGk?.fullName ||
      gkPlayerObj?.fullName ||
      `Valla de ${teamName}`;

    const key = gkPlayerId ? `${m.divisionId}::gk::${gkPlayerId}` : `${m.divisionId}::team::${teamId}`;
    const div = divMap.get(m.divisionId);
    const existing = gkMap.get(key) || {
      goalkeeperKey: key,
      playerId: gkPlayerId,
      goalkeeperName: gkName,
      teamId,
      teamName: reg?.displayName || teamName,
      divisionId: m.divisionId,
      category: div?.category,
      photoUrl: gkPlayerObj?.photoUrl || null,
      matchesPlayed: 0,
      goalsConceded: 0,
      cleanSheets: 0,
      wins: 0,
      goalsAgainstAvg: 0,
      eligible: true,
    };

    existing.matchesPlayed += 1;
    existing.goalsConceded += Math.max(0, goalsAgainst);
    if (goalsAgainst === 0) existing.cleanSheets += 1;
    if (won) existing.wins += 1;
    gkMap.set(key, existing);
  };

  for (const m of completedMatches) {
    const gA = m.status === 'wo' ? (m.winnerEntryId === m.entryAId ? 3 : 0) : m.footballScore?.goalsA ?? 0;
    const gB = m.status === 'wo' ? (m.winnerEntryId === m.entryBId ? 3 : 0) : m.footballScore?.goalsB ?? 0;
    recordSide(m, 'A', gB, gA > gB);
    recordSide(m, 'B', gA, gB > gA);
  }

  return Array.from(gkMap.values())
    .map((row) => {
      const div = divMap.get(row.divisionId);
      const minPj = div?.fifaConfig?.minMatchesForBestGoalkeeper ?? 1;
      const avg = row.matchesPlayed > 0 ? Number((row.goalsConceded / row.matchesPlayed).toFixed(2)) : 0;
      return {
        ...row,
        goalsAgainstAvg: avg,
        eligible: row.matchesPlayed >= minPj,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (
        a.goalsAgainstAvg - b.goalsAgainstAvg ||
        a.goalsConceded - b.goalsConceded ||
        b.cleanSheets - a.cleanSheets ||
        b.matchesPlayed - a.matchesPlayed ||
        a.goalkeeperName.localeCompare(b.goalkeeperName, 'es')
      );
    });
}

export interface DisciplinaryRow {
  playerId: string;
  playerName: string;
  teamName: string;
  divisionId: string;
  yellowCards: number;
  doubleYellows: number;
  redCards: number;
  suspendedRisk: boolean;
}

export function computeFootballDisciplinaryTable(params: {
  matches: Match[];
  players: PlayerPublic[];
  divisions: Division[];
  divisionId?: string | 'ALL';
}): DisciplinaryRow[] {
  const { matches, players, divisions, divisionId = 'ALL' } = params;
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const divMap = new Map(divisions.map((d) => [d.id, d]));
  const map = new Map<string, DisciplinaryRow>();

  matches
    .filter((m) => (divisionId === 'ALL' || m.divisionId === divisionId) && !m.isBye)
    .forEach((m) => {
      const sheet = m.footballSheet;
      if (!sheet) return;
      sheet.events.forEach((ev) => {
        if (ev.type !== 'amarilla' && ev.type !== 'doble_amarilla' && ev.type !== 'roja') return;
        const teamName = ev.teamSide === 'A' ? m.entryAName : m.entryBName;
        const key = ev.playerId || `disc:${teamName}:${ev.playerName.toLowerCase()}`;
        const p = ev.playerId ? playerMap.get(ev.playerId) : undefined;
        const row = map.get(key) || {
          playerId: key,
          playerName: p?.fullName || ev.playerName,
          teamName: p?.club || teamName,
          divisionId: m.divisionId,
          yellowCards: 0,
          doubleYellows: 0,
          redCards: 0,
          suspendedRisk: false,
        };
        if (ev.type === 'amarilla') row.yellowCards += 1;
        if (ev.type === 'doble_amarilla') row.doubleYellows += 1;
        if (ev.type === 'roja') row.redCards += 1;
        const limit = divMap.get(m.divisionId)?.fifaConfig?.yellowCardSuspensionLimit ?? 3;
        row.suspendedRisk = row.redCards > 0 || row.doubleYellows > 0 || row.yellowCards >= limit;
        map.set(key, row);
      });
    });

  return Array.from(map.values()).sort(
    (a, b) =>
      b.redCards - a.redCards ||
      b.doubleYellows - a.doubleYellows ||
      b.yellowCards - a.yellowCards ||
      a.playerName.localeCompare(b.playerName, 'es')
  );
}
