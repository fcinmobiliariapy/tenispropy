import {
  Division,
  Group,
  Match,
  PlayerPublic,
  PlayerStats,
  Registration,
  StandingRow,
  TiebreakerCriterion,
  Tournament,
} from '../types/tennis';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateMatchesForGroupBuckets(
  buckets: Array<{ id?: string; name: string; entries: Registration[] }>,
  division: Division
): { groups: Group[]; matches: Match[] } {
  const now = new Date().toISOString();
  const groups: Group[] = [];
  const matches: Match[] = [];

  buckets.forEach((bucket) => {
    if (bucket.entries.length === 0) return;
    const groupId = bucket.id || makeId(`grp_${division.id.slice(0, 8)}`);
    const groupName = bucket.name;
    const standings: StandingRow[] = bucket.entries.map((entry) => ({
      entryId: entry.id,
      displayName: entry.displayName,
      club: entry.club,
      seed: entry.seed ?? null,
      played: 0,
      won: 0,
      lost: 0,
      setsWon: 0,
      setsLost: 0,
      setsDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      points: 0,
      woLosses: 0,
      qualified: false,
    }));

    groups.push({
      id: groupId,
      tournamentId: division.tournamentId,
      divisionId: division.id,
      name: groupName,
      entryIds: bucket.entries.map((b) => b.id),
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
        modality: division.modality,
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
        const a = list[i];
        const b = list[n - 1 - i];
        if (a.id !== '__BYE__' && b.id !== '__BYE__') {
          matches.push({
            id: makeId('mat'),
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
            entryAId: a.id,
            entryAName: a.displayName,
            playerIdsA: a.playerIds,
            entryBId: b.id,
            entryBName: b.displayName,
            playerIdsB: b.playerIds,
            isBye: false,
            scheduledDate: null,
            scheduledTime: null,
            courtId: null,
            courtName: null,
            status: 'programado',
            sets: [],
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

export function generateGroupsDrawPreview(
  confirmedEntries: Registration[],
  division: Division
): { groups: Group[]; matches: Match[] } {
  const groupCount =
    division.format === 'todos_contra_todos' ? 1 : Math.max(1, division.drawConfig.groupCount);

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

  // Distribución serpenteante (snake seeding)
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
        ? 'Tabla Única'
        : `Grupo ${letters[gIdx] || gIdx + 1}`,
    entries,
  }));

  return generateMatchesForGroupBuckets(namedBuckets, division);
}

function compareByCriterion(
  a: StandingRow,
  b: StandingRow,
  criterion: TiebreakerCriterion,
  relevantMatches: Match[]
): number {
  switch (criterion) {
    case 'points':
      return b.points - a.points;
    case 'head_to_head': {
      const h2h = relevantMatches.find(
        (m) =>
          m.winnerEntryId &&
          ((m.entryAId === a.entryId && m.entryBId === b.entryId) ||
            (m.entryAId === b.entryId && m.entryBId === a.entryId))
      );
      if (!h2h) return 0;
      return h2h.winnerEntryId === a.entryId ? -1 : 1;
    }
    case 'sets_pct': {
      const pctA = a.setsWon + a.setsLost === 0 ? 0 : a.setsWon / (a.setsWon + a.setsLost);
      const pctB = b.setsWon + b.setsLost === 0 ? 0 : b.setsWon / (b.setsWon + b.setsLost);
      return pctB - pctA;
    }
    case 'sets_diff':
      return b.setsDiff - a.setsDiff;
    case 'games_pct': {
      const pctA = a.gamesWon + a.gamesLost === 0 ? 0 : a.gamesWon / (a.gamesWon + a.gamesLost);
      const pctB = b.gamesWon + b.gamesLost === 0 ? 0 : b.gamesWon / (b.gamesWon + b.gamesLost);
      return pctB - pctA;
    }
    case 'games_diff':
      return b.gamesDiff - a.gamesDiff;
    case 'draw':
    default:
      return (a.seed ?? 999) - (b.seed ?? 999) || a.displayName.localeCompare(b.displayName);
  }
}

export function computeGroupStandings(
  group: Group,
  groupMatches: Match[],
  registrations: Registration[],
  division: Division
): StandingRow[] {
  const regMap = new Map(registrations.map((r) => [r.id, r]));
  const rowsMap = new Map<string, StandingRow>();

  group.entryIds.forEach((entryId) => {
    const reg = regMap.get(entryId);
    const existingRow = group.standings.find((s) => s.entryId === entryId);
    rowsMap.set(entryId, {
      entryId,
      displayName: reg?.displayName || existingRow?.displayName || 'Participante',
      club: reg?.club || existingRow?.club,
      seed: reg?.seed ?? existingRow?.seed ?? null,
      played: 0,
      won: 0,
      lost: 0,
      setsWon: 0,
      setsLost: 0,
      setsDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      points: 0,
      woLosses: 0,
      qualified: false,
    });
  });

  const completedMatches = groupMatches.filter(
    (m) =>
      m.groupId === group.id &&
      m.winnerEntryId &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
  );

  for (const m of completedMatches) {
    if (!m.entryAId || !m.entryBId) continue;
    const rowA = rowsMap.get(m.entryAId);
    const rowB = rowsMap.get(m.entryBId);
    if (!rowA || !rowB) continue;

    rowA.played++;
    rowB.played++;

    const aWon = m.winnerEntryId === m.entryAId;

    if (m.status === 'wo') {
      if (aWon) {
        rowA.won++;
        rowA.points += division.drawConfig.pointsWoWin;
        rowB.lost++;
        rowB.woLosses++;
        rowB.points += division.drawConfig.pointsWoLoss;
        rowA.setsWon += division.itfConfig.setsToWin;
        rowB.setsLost += division.itfConfig.setsToWin;
      } else {
        rowB.won++;
        rowB.points += division.drawConfig.pointsWoWin;
        rowA.lost++;
        rowA.woLosses++;
        rowA.points += division.drawConfig.pointsWoLoss;
        rowB.setsWon += division.itfConfig.setsToWin;
        rowA.setsLost += division.itfConfig.setsToWin;
      }
      continue;
    }

    // Partido disputado (finalizado, retiro o descalificado)
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const s of m.sets) {
      if (s.isMatchTiebreak) {
        if (s.a > s.b) {
          setsA++;
          gamesA += 1;
        } else {
          setsB++;
          gamesB += 1;
        }
      } else {
        if (s.a > s.b) setsA++;
        else if (s.b > s.a) setsB++;
        gamesA += s.a;
        gamesB += s.b;
      }
    }

    if (m.status === 'retiro' || m.status === 'descalificado' || (m.status === 'finalizado' && m.sets.length === 0)) {
      if (aWon && setsA < division.itfConfig.setsToWin) setsA = division.itfConfig.setsToWin;
      if (!aWon && setsB < division.itfConfig.setsToWin) setsB = division.itfConfig.setsToWin;
    }

    rowA.setsWon += setsA;
    rowA.setsLost += setsB;
    rowB.setsWon += setsB;
    rowB.setsLost += setsA;

    rowA.gamesWon += gamesA;
    rowA.gamesLost += gamesB;
    rowB.gamesWon += gamesB;
    rowB.gamesLost += gamesA;

    if (aWon) {
      rowA.won++;
      rowA.points += division.drawConfig.pointsWin;
      rowB.lost++;
      rowB.points += division.drawConfig.pointsLoss;
    } else {
      rowB.won++;
      rowB.points += division.drawConfig.pointsWin;
      rowA.lost++;
      rowA.points += division.drawConfig.pointsLoss;
    }
  }

  const rows = Array.from(rowsMap.values()).map((r) => ({
    ...r,
    setsDiff: r.setsWon - r.setsLost,
    gamesDiff: r.gamesWon - r.gamesLost,
  }));

  const criteria = division.drawConfig.tiebreakers;

  // Ordenamiento con resolución de empate múltiple
  rows.sort((a, b) => {
    for (const c of criteria) {
      if (c === 'head_to_head') {
        // Verificar cuántos comparten los mismos puntos para distinguir empate de 2 vs múltiple (3+)
        const samePointsCount = rows.filter((r) => r.points === a.points).length;
        if (samePointsCount === 2 && a.points === b.points) {
          const cmp = compareByCriterion(a, b, 'head_to_head', completedMatches);
          if (cmp !== 0) return cmp;
        } else if (samePointsCount >= 3 && a.points === b.points) {
          // En empate múltiple, calcular sub-tabla entre empatados
          const tiedIds = new Set(rows.filter((r) => r.points === a.points).map((r) => r.entryId));
          const subMatches = completedMatches.filter(
            (m) => m.entryAId && m.entryBId && tiedIds.has(m.entryAId) && tiedIds.has(m.entryBId)
          );
          const winsA = subMatches.filter((m) => m.winnerEntryId === a.entryId).length;
          const winsB = subMatches.filter((m) => m.winnerEntryId === b.entryId).length;
          if (winsA !== winsB) return winsB - winsA;
        }
        continue;
      }
      const cmp = compareByCriterion(a, b, c, completedMatches);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  const qCount =
    division.format === 'todos_contra_todos' ? 1 : division.drawConfig.qualifiersPerGroup;
  return rows.map((r, idx) => ({
    ...r,
    qualified: idx < qCount,
  }));
}

function getBracketRoundName(totalSlots: number, roundIndex: number): string {
  const matchesInRound = totalSlots / Math.pow(2, roundIndex + 1);
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semifinales';
  if (matchesInRound === 4) return 'Cuartos de Final';
  if (matchesInRound === 8) return 'Octavos de Final';
  return `Ronda de ${matchesInRound * 2}`;
}

export function generateKnockoutBracketFromSlotPairs(
  slotPairs: Array<[Registration | null, Registration | null]>,
  division: Division,
  startingRoundOrder = 10
): Match[] {
  if (slotPairs.length === 0) return [];
  const now = new Date().toISOString();
  let bracketSize = 2;
  while (bracketSize < slotPairs.length * 2) bracketSize *= 2;

  const paddedPairs: Array<[Registration | null, Registration | null]> = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    paddedPairs.push(slotPairs[i] || [null, null]);
  }

  const numRounds = Math.log2(bracketSize);
  const roundsMatches: Match[][] = [];

  for (let r = 0; r < numRounds; r++) {
    const count = bracketSize / Math.pow(2, r + 1);
    const roundName = getBracketRoundName(bracketSize, r);
    const roundList: Match[] = [];
    for (let pos = 0; pos < count; pos++) {
      roundList.push({
        id: makeId('ko'),
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
    const [a, b] = paddedPairs[idx];
    m.entryAId = a?.id || null;
    m.entryAName = a ? a.displayName : 'BYE';
    m.playerIdsA = a?.playerIds || [];
    m.entryBId = b?.id || null;
    m.entryBName = b ? b.displayName : 'BYE';
    m.playerIdsB = b?.playerIds || [];

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
            nextMatch.playerIdsA = winner.playerIds;
          } else {
            nextMatch.entryBId = winner.id;
            nextMatch.entryBName = winner.displayName;
            nextMatch.playerIdsB = winner.playerIds;
          }
        }
      }
    }
  });

  const result = roundsMatches.flat();

  if (division.hasThirdPlaceMatch && numRounds >= 2) {
    result.push({
      id: makeId('ko3'),
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

export function generateKnockoutBracket(
  entries: Registration[],
  division: Division,
  startingRoundOrder = 10
): Match[] {
  if (entries.length < 2) return [];
  let bracketSize = 2;
  while (bracketSize < entries.length) bracketSize *= 2;

  const seeded = entries
    .filter((e) => e.seed != null)
    .sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const unseeded = shuffleArray(entries.filter((e) => e.seed == null));
  const ordered = [...seeded, ...unseeded];

  const slots: (Registration | null)[] = Array(bracketSize).fill(null);
  const seedPositions = (size: number): number[] => {
    let rounds = [1, 2];
    while (rounds.length < size) {
      const nextSum = rounds.length * 2 + 1;
      const expanded: number[] = [];
      for (const s of rounds) {
        expanded.push(s, nextSum - s);
      }
      rounds = expanded;
    }
    return rounds;
  };
  const orderOrder = seedPositions(bracketSize);
  orderOrder.forEach((seedRank, slotIdx) => {
    const entry = ordered[seedRank - 1];
    if (entry) slots[slotIdx] = entry;
  });

  const slotPairs: Array<[Registration | null, Registration | null]> = [];
  for (let i = 0; i < bracketSize; i += 2) {
    slotPairs.push([slots[i], slots[i + 1]]);
  }
  return generateKnockoutBracketFromSlotPairs(slotPairs, division, startingRoundOrder);
}

export function findAffectedDownstreamMatches(
  match: Match,
  allMatches: Match[],
  newWinnerId: string | null
): Match[] {
  if (!match.nextMatchId || !match.winnerEntryId || match.winnerEntryId === newWinnerId) {
    return [];
  }
  const affected: Match[] = [];
  let cursorId: string | null | undefined = match.nextMatchId;
  const visited = new Set<string>();
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const next = allMatches.find((m) => m.id === cursorId);
    if (!next) break;
    if (
      next.scheduledDate ||
      next.sets.length > 0 ||
      next.winnerEntryId ||
      next.status !== 'programado'
    ) {
      affected.push(next);
    }
    // Si este partido era una Semifinal cuyo siguiente cruce es la Final, revisar el partido de 3er puesto
    if (!next.nextMatchId && !next.isThirdPlace) {
      const thirdPlaceMatch = allMatches.find(
        (m) => m.divisionId === match.divisionId && m.isThirdPlace
      );
      if (
        thirdPlaceMatch &&
        (thirdPlaceMatch.scheduledDate ||
          thirdPlaceMatch.sets.length > 0 ||
          thirdPlaceMatch.winnerEntryId ||
          thirdPlaceMatch.status !== 'programado')
      ) {
        affected.push(thirdPlaceMatch);
      }
    }
    cursorId = next.nextMatchId;
  }
  return affected;
}

export interface ScheduleConflict {
  type: 'court_overlap' | 'player_overlap' | 'rest_violation';
  message: string;
  conflictingMatch: Match;
}

function toMinutes(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return Math.floor(dt.getTime() / 60000);
}

export function detectScheduleConflicts(
  candidate: {
    matchId: string;
    tournamentId: string;
    date: string;
    time: string;
    courtId: string;
    playerIds: string[];
  },
  allMatches: Match[],
  tournamentsMap: Map<string, Tournament>,
  estimatedMatchMinutes = 90
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  if (!candidate.date || !candidate.time) return conflicts;

  const targetStart = toMinutes(candidate.date, candidate.time);
  const targetTournament = tournamentsMap.get(candidate.tournamentId);
  const minRest = targetTournament?.minRestMinutes ?? 60;

  for (const other of allMatches) {
    if (other.id === candidate.matchId || other.isBye) continue;
    if (!other.scheduledDate || !other.scheduledTime) continue;

    const otherStart = toMinutes(other.scheduledDate, other.scheduledTime);
    const diff = Math.abs(targetStart - otherStart);

    // 1. Reserva simultánea de la misma cancha en el mismo torneo/sede
    if (
      candidate.courtId &&
      other.courtId === candidate.courtId &&
      other.tournamentId === candidate.tournamentId &&
      diff < estimatedMatchMinutes
    ) {
      conflicts.push({
        type: 'court_overlap',
        message: `Cancha ocupada por "${other.entryAName} vs ${other.entryBName}" (${other.scheduledTime} hs).`,
        conflictingMatch: other,
      });
    }

    // 2. Cruce de horario o violación de descanso de un mismo jugador (incluso en otro torneo o modalidad)
    const otherPlayers = [...other.playerIdsA, ...other.playerIdsB];
    const sharedPlayer = candidate.playerIds.some((pid) => otherPlayers.includes(pid));
    if (sharedPlayer) {
      if (diff < estimatedMatchMinutes) {
        conflicts.push({
          type: 'player_overlap',
          message: `Cruce horario de jugador con "${other.entryAName} vs ${other.entryBName}" (${other.scheduledDate} ${other.scheduledTime} hs).`,
          conflictingMatch: other,
        });
      } else if (diff < estimatedMatchMinutes + minRest) {
        conflicts.push({
          type: 'rest_violation',
          message: `Descanso insuficiente (< ${minRest} min) respecto a "${other.entryAName} vs ${other.entryBName}" (${other.scheduledTime} hs).`,
          conflictingMatch: other,
        });
      }
    }
  }

  return conflicts;
}

export function autoProposeSchedule(
  matchesToSchedule: Match[],
  allExistingMatches: Match[],
  tournament: Tournament,
  tournamentsMap: Map<string, Tournament>,
  startDate: string,
  timeSlots = ['08:30', '10:15', '12:00', '14:30', '16:15', '18:00', '19:45']
): Array<{ matchId: string; date: string; time: string; courtId: string; courtName: string }> {
  const proposals: Array<{
    matchId: string;
    date: string;
    time: string;
    courtId: string;
    courtName: string;
  }> = [];

  const simulatedMatches = allExistingMatches.map((m) => ({ ...m }));
  const courts = tournament.courts;
  if (courts.length === 0) return proposals;

  const baseDate = new Date(`${startDate}T12:00:00Z`);

  for (const match of matchesToSchedule) {
    if (match.isBye) continue;
    let assigned = false;
    const playerIds = [...match.playerIdsA, ...match.playerIdsB];

    for (let dayOffset = 0; dayOffset < 14 && !assigned; dayOffset++) {
      const dt = new Date(baseDate.getTime() + dayOffset * 86400000);
      const dateStr = dt.toISOString().slice(0, 10);

      for (const slot of timeSlots) {
        if (assigned) break;
        for (const court of courts) {
          const conflicts = detectScheduleConflicts(
            {
              matchId: match.id,
              tournamentId: tournament.id,
              date: dateStr,
              time: slot,
              courtId: court.id,
              playerIds,
            },
            simulatedMatches,
            tournamentsMap
          );
          if (conflicts.length === 0) {
            proposals.push({
              matchId: match.id,
              date: dateStr,
              time: slot,
              courtId: court.id,
              courtName: court.name,
            });
            const target = simulatedMatches.find((m) => m.id === match.id);
            if (target) {
              target.scheduledDate = dateStr;
              target.scheduledTime = slot;
              target.courtId = court.id;
              target.courtName = court.name;
            }
            assigned = true;
            break;
          }
        }
      }
    }
  }

  return proposals;
}

export function computePlayerStatsFromMatches(
  playerId: string,
  allMatches: Match[],
  divisions: Division[],
  registrations: Registration[]
): PlayerStats {
  const playerEntryIds = new Set(
    registrations.filter((r) => r.playerIds.includes(playerId)).map((r) => r.id)
  );

  const playerMatches = allMatches
    .filter(
      (m) =>
        !m.isBye &&
        m.winnerEntryId &&
        ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status) &&
        (m.playerIdsA.includes(playerId) || m.playerIdsB.includes(playerId))
    )
    .sort((a, b) => (a.scheduledDate || a.updatedAt).localeCompare(b.scheduledDate || b.updatedAt));

  let wins = 0;
  let losses = 0;
  let setsWon = 0;
  let setsLost = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  let currentStreak = 0;

  for (const m of playerMatches) {
    const isSideA = m.playerIdsA.includes(playerId);
    const didWin =
      (isSideA && m.winnerEntryId === m.entryAId) ||
      (!isSideA && m.winnerEntryId === m.entryBId);

    if (didWin) {
      wins++;
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
    } else {
      losses++;
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
    }

    if (m.sets.length === 0 && m.status === 'finalizado') {
      const div = divisions.find((d) => d.id === m.divisionId);
      const stw = div?.itfConfig.setsToWin ?? 2;
      if (didWin) setsWon += stw;
      else setsLost += stw;
    } else {
      for (const s of m.sets) {
        const myVal = isSideA ? s.a : s.b;
        const oppVal = isSideA ? s.b : s.a;
        if (s.isMatchTiebreak) {
          if (myVal > oppVal) {
            setsWon++;
            gamesWon += 1;
          } else {
            setsLost++;
            gamesLost += 1;
          }
        } else {
          if (myVal > oppVal) setsWon++;
          else if (oppVal > myVal) setsLost++;
          gamesWon += myVal;
          gamesLost += oppVal;
        }
      }
    }
  }

  const titles = divisions.filter(
    (d) => d.championEntryId && playerEntryIds.has(d.championEntryId)
  ).length;

  return {
    matchesPlayed: wins + losses,
    wins,
    losses,
    setsWon,
    setsLost,
    gamesWon,
    gamesLost,
    titles,
    currentStreak,
  };
}

export function formatAsuncionDate(dateStr?: string | null): string {
  if (!dateStr) return 'Por programar';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return new Intl.DateTimeFormat('es-PY', {
    timeZone: 'America/Asuncion',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(dt);
}

export function compareMatchesByRound(a: Match, b: Match): number {
  const phaseA = a.phase === 'grupos' ? 0 : 1;
  const phaseB = b.phase === 'grupos' ? 0 : 1;
  if (phaseA !== phaseB) return phaseA - phaseB;
  if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
  if (Boolean(a.isThirdPlace) !== Boolean(b.isThirdPlace)) {
    return a.isThirdPlace ? -1 : 1;
  }
  if (a.roundName !== b.roundName) {
    return a.roundName.localeCompare(b.roundName, 'es');
  }
  const posA = a.bracketPosition ?? 9999;
  const posB = b.bracketPosition ?? 9999;
  if (posA !== posB) return posA - posB;
  const dA = `${a.scheduledDate || '9999-99-99'} ${a.scheduledTime || '99:99'}`;
  const dB = `${b.scheduledDate || '9999-99-99'} ${b.scheduledTime || '99:99'}`;
  return dA.localeCompare(dB);
}

export interface DuplicateMatchGroup {
  signature: string;
  divisionId: string;
  tournamentId: string;
  keptMatch: Match;
  duplicateMatches: Match[];
}

export interface DuplicateMatchAnalysis {
  groups: DuplicateMatchGroup[];
  duplicateMatches: Match[];
  dedupedMatches: Match[];
}

function getCanonicalMatchSignature(match: Match): string {
  if (match.phase === 'grupos') {
    if (match.entryAId && match.entryBId) {
      const pair = [match.entryAId, match.entryBId].sort().join('|');
      return `${match.divisionId}::grupos::${pair}`;
    }
    const namePair = [match.entryAName.trim().toLowerCase(), match.entryBName.trim().toLowerCase()]
      .sort()
      .join('|');
    return `${match.divisionId}::grupos_name::${match.roundName}::${namePair}`;
  }

  if (match.isThirdPlace || match.roundName === 'Tercer Puesto') {
    return `${match.divisionId}::eliminacion::third_place`;
  }

  if (match.bracketPosition != null) {
    return `${match.divisionId}::eliminacion::r${match.roundOrder}::pos${match.bracketPosition}`;
  }

  const pair = [
    match.entryAId || match.entryAName.trim().toLowerCase(),
    match.entryBId || match.entryBName.trim().toLowerCase(),
  ]
    .sort()
    .join('|');
  return `${match.divisionId}::eliminacion::${match.roundName}::${pair}`;
}

function scoreMatchPriority(match: Match, incomingRefCounts: Map<string, number>): number {
  let score = 0;
  if (match.winnerEntryId) score += 10000;
  if (match.sets.length > 0) score += 5000;
  if (match.status !== 'programado') score += 2000;
  if ((incomingRefCounts.get(match.id) || 0) > 0) score += 1000;
  if (match.entryAId && match.entryBId) score += 500;
  if (match.scheduledDate) score += 200;
  if (match.courtId) score += 100;
  if (match.matchdayId) score += 50;
  if (match.published) score += 25;
  return score;
}

export function analyzeDuplicateMatches(matches: Match[]): DuplicateMatchAnalysis {
  const incomingRefCounts = new Map<string, number>();
  for (const m of matches) {
    if (m.nextMatchId) {
      incomingRefCounts.set(m.nextMatchId, (incomingRefCounts.get(m.nextMatchId) || 0) + 1);
    }
  }

  const buckets = new Map<string, Match[]>();
  for (const m of matches) {
    const sig = getCanonicalMatchSignature(m);
    const list = buckets.get(sig);
    if (list) list.push(m);
    else buckets.set(sig, [m]);
  }

  const groups: DuplicateMatchGroup[] = [];
  const duplicateMatches: Match[] = [];
  const duplicateIdSet = new Set<string>();

  for (const [signature, groupMatches] of buckets.entries()) {
    if (groupMatches.length <= 1) continue;
    const sorted = [...groupMatches].sort((a, b) => {
      const diff = scoreMatchPriority(b, incomingRefCounts) - scoreMatchPriority(a, incomingRefCounts);
      if (diff !== 0) return diff;
      return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
    });
    const keptMatch = sorted[0];
    const dupes = sorted.slice(1);
    groups.push({
      signature,
      divisionId: keptMatch.divisionId,
      tournamentId: keptMatch.tournamentId,
      keptMatch,
      duplicateMatches: dupes,
    });
    for (const d of dupes) {
      duplicateMatches.push(d);
      duplicateIdSet.add(d.id);
    }
  }

  const dedupedMatches = matches.filter((m) => !duplicateIdSet.has(m.id));
  return { groups, duplicateMatches, dedupedMatches };
}

export function dedupeMatches(matches: Match[]): Match[] {
  return analyzeDuplicateMatches(matches).dedupedMatches;
}

