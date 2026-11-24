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

  const groupEntryIds = new Set(group.entryIds);
  const completedMatches = groupMatches.filter(
    (m) =>
      (m.groupId === group.id ||
        (m.phase === 'grupos' &&
          Boolean(m.entryAId) &&
          Boolean(m.entryBId) &&
          groupEntryIds.has(m.entryAId!) &&
          groupEntryIds.has(m.entryBId!))) &&
      Boolean(m.winnerEntryId) &&
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

export function getKnockoutStageRank(roundName: string): number {
  const lower = (roundName || '').trim().toLowerCase();
  if (lower.includes('64') || lower.includes('32avos')) return -1;
  if (lower.includes('32') || lower.includes('16avos') || lower.includes('dieciseisavo')) return 0;
  if (lower.includes('octavo')) return 1;
  if (lower.includes('cuarto')) return 2;
  if (lower.includes('semifinal')) return 3;
  if (lower.includes('tercer') || lower.includes('3er')) return 4;
  if (lower === 'final') return 5;
  return 0;
}

function isKnownKnockoutStage(roundName: string): boolean {
  const lower = (roundName || '').trim().toLowerCase();
  return (
    lower.includes('64') ||
    lower.includes('32') ||
    lower.includes('16avos') ||
    lower.includes('32avos') ||
    lower.includes('dieciseisavo') ||
    lower.includes('octavo') ||
    lower.includes('cuarto') ||
    lower.includes('semifinal') ||
    lower.includes('tercer') ||
    lower.includes('3er') ||
    lower === 'final'
  );
}

export function isRealFinalMatch(match: Match, koMatches: Match[]): boolean {
  if (match.phase !== 'eliminacion' || match.isThirdPlace || match.roundName === 'Tercer Puesto') {
    return false;
  }
  const lower = (match.roundName || '').trim().toLowerCase();
  if (lower === 'final') return true;
  if (/cuartos|semifinal|octavos|16avos|32avos|dieciseisavos|ronda de/i.test(lower)) return false;
  if (match.nextMatchId) return false;
  const nonThird = koMatches.filter(
    (m) => m.phase === 'eliminacion' && !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
  );
  if (nonThird.length === 0) return false;
  const maxRound = Math.max(...nonThird.map((m) => m.roundOrder));
  const lastRoundMatches = nonThird.filter((m) => m.roundOrder === maxRound);
  return match.roundOrder === maxRound && lastRoundMatches.length === 1;
}

function resolveStructuralNextKnockoutMatch(
  match: Match,
  koMatches: Match[]
): { nextMatch: Match; slot: 'A' | 'B' } | null {
  if (isRealFinalMatch(match, koMatches)) return null;

  const higherOrders = Array.from(
    new Set(koMatches.filter((m) => m.roundOrder > match.roundOrder).map((m) => m.roundOrder))
  ).sort((a, b) => a - b);

  let nextRoundMatches: Match[] = [];
  if (higherOrders.length > 0) {
    const nextRoundOrder = higherOrders[0];
    nextRoundMatches = koMatches
      .filter((m) => m.roundOrder === nextRoundOrder)
      .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
  } else if (isKnownKnockoutStage(match.roundName)) {
    const myRank = getKnockoutStageRank(match.roundName);
    const higherRanks = Array.from(
      new Set(
        koMatches
          .filter((m) => isKnownKnockoutStage(m.roundName) && getKnockoutStageRank(m.roundName) > myRank)
          .map((m) => getKnockoutStageRank(m.roundName))
      )
    ).sort((a, b) => a - b);
    if (higherRanks.length > 0) {
      const targetRank = higherRanks[0];
      nextRoundMatches = koMatches
        .filter((m) => getKnockoutStageRank(m.roundName) === targetRank)
        .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
    }
  }

  if (nextRoundMatches.length === 0) return null;

  const currentRoundMatches = koMatches
    .filter(
      (m) =>
        m.roundOrder === match.roundOrder &&
        m.roundName.trim().toLowerCase() === match.roundName.trim().toLowerCase()
    )
    .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
  const sameOrderMatches =
    currentRoundMatches.length > 0
      ? currentRoundMatches
      : koMatches
          .filter((m) => m.roundOrder === match.roundOrder)
          .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));

  const fallbackPos = Math.max(1, sameOrderMatches.findIndex((m) => m.id === match.id) + 1);
  const pos = match.bracketPosition && match.bracketPosition >= 1 ? match.bracketPosition : fallbackPos;
  const targetBracketPos = Math.ceil(pos / 2);

  const structuralNext =
    nextRoundMatches.find((m) => m.bracketPosition === targetBracketPos) ||
    nextRoundMatches[targetBracketPos - 1];
  if (!structuralNext || structuralNext.id === match.id) return null;

  const slot: 'A' | 'B' = pos % 2 === 1 ? 'A' : 'B';
  return { nextMatch: structuralNext, slot };
}

export function resolveNextKnockoutMatch(
  match: Match,
  divisionMatches: Match[]
): { nextMatch: Match; slot: 'A' | 'B' } | null {
  if (match.phase !== 'eliminacion' || match.isThirdPlace || match.roundName === 'Tercer Puesto') {
    return null;
  }
  const koMatches = divisionMatches.filter(
    (m) => m.phase === 'eliminacion' && !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
  );
  if (match.nextMatchId) {
    const direct = koMatches.find((m) => m.id === match.nextMatchId);
    if (
      direct &&
      direct.id !== match.id &&
      (direct.roundOrder > match.roundOrder ||
        (isKnownKnockoutStage(match.roundName) &&
          isKnownKnockoutStage(direct.roundName) &&
          getKnockoutStageRank(direct.roundName) > getKnockoutStageRank(match.roundName)))
    ) {
      const slot: 'A' | 'B' =
        match.nextMatchSlot === 'A' || match.nextMatchSlot === 'B'
          ? match.nextMatchSlot
          : (match.bracketPosition || 1) % 2 === 1
          ? 'A'
          : 'B';
      // Evitar colisiones donde 2 llaves del mismo cuadro apuntan al mismo slot destino
      const collides = koMatches.some((other) => {
        if (other.id === match.id || other.nextMatchId !== direct.id) return false;
        const otherSlot: 'A' | 'B' =
          other.nextMatchSlot === 'A' || other.nextMatchSlot === 'B'
            ? other.nextMatchSlot
            : (other.bracketPosition || 1) % 2 === 1
            ? 'A'
            : 'B';
        return otherSlot === slot;
      });
      if (!collides) {
        return { nextMatch: direct, slot };
      }
    }
  }
  return resolveStructuralNextKnockoutMatch(match, koMatches);
}

export function computeQualifiedSeededEntries(
  groups: Group[],
  matches: Match[],
  registrations: Registration[],
  division: Division
): Registration[] {
  if (division.format !== 'grupos_y_final' || groups.length === 0) return [];
  const qPerGroup = Math.max(1, division.drawConfig.qualifiersPerGroup || 2);
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const groupCount = sortedGroups.length;
  const standingsByGroup = sortedGroups.map((grp) =>
    computeGroupStandings(grp, matches, registrations, division)
  );
  const regMap = new Map(registrations.map((r) => [r.id, r]));

  const orderedEntries: Registration[] = [];
  for (let rank = 0; rank < qPerGroup; rank++) {
    // Rotar/alternar el orden de grupos en puestos impares para evitar cruces tempranos del mismo grupo
    const shift = rank % 2 === 1 ? Math.ceil(groupCount / 2) : 0;
    for (let i = 0; i < groupCount; i++) {
      const gIdx = (i + shift) % groupCount;
      const row = standingsByGroup[gIdx]?.[rank];
      if (!row) continue;
      const reg = regMap.get(row.entryId);
      if (reg) {
        orderedEntries.push({
          ...reg,
          seed: orderedEntries.length + 1,
        });
      }
    }
  }
  return orderedEntries;
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
  const cleanedPairs = slotPairs.filter(([a, b]) => Boolean(a || b));
  if (cleanedPairs.length === 0) return [];

  const allEntries: Registration[] = [];
  cleanedPairs.forEach(([a, b]) => {
    if (a) allEntries.push(a);
    if (b) allEntries.push(b);
  });

  const now = new Date().toISOString();
  let bracketSize = 2;
  while (bracketSize < cleanedPairs.length * 2) bracketSize *= 2;
  // Si hay menos participantes únicos que la mitad del cuadro elegido, reducimos el tamaño para evitar llaves vacías
  while (bracketSize > 2 && allEntries.length < bracketSize / 2) {
    bracketSize /= 2;
  }

  const targetPairsCount = bracketSize / 2;
  const paddedPairs: Array<[Registration | null, Registration | null]> = [];

  if (cleanedPairs.length > targetPairsCount) {
    // Reempaquetar entradas cuando el tamaño de cuadro fue ajustado
    for (let i = 0; i < targetPairsCount; i++) {
      paddedPairs.push([allEntries[i] || null, allEntries[i + targetPairsCount] || null]);
    }
  } else {
    for (let i = 0; i < targetPairsCount; i++) {
      paddedPairs.push(cleanedPairs[i] ? [cleanedPairs[i][0], cleanedPairs[i][1]] : [null, null]);
    }
    // Nunca dejar una llave completamente vacía ([null, null]): balancear tomando un jugador de una llave llena
    for (let i = 0; i < paddedPairs.length; i++) {
      if (!paddedPairs[i][0] && !paddedPairs[i][1]) {
        const donorIdx = [...paddedPairs]
          .reverse()
          .findIndex(([a, b]) => Boolean(a && b));
        if (donorIdx !== -1) {
          const realDonorIdx = paddedPairs.length - 1 - donorIdx;
          const moved = paddedPairs[realDonorIdx][1];
          paddedPairs[realDonorIdx] = [paddedPairs[realDonorIdx][0], null];
          paddedPairs[i] = [moved, null];
        }
      }
    }
  }

  const finalPairs = paddedPairs.filter(([a, b]) => Boolean(a || b));
  if (finalPairs.length === 0) return [];

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
    const [a, b] = paddedPairs[idx] || [null, null];
    m.entryAId = a?.id || null;
    m.entryAName = a ? a.displayName : b ? 'BYE' : 'Por definir';
    m.playerIdsA = a?.playerIds || [];
    m.entryBId = b?.id || null;
    m.entryBName = b ? b.displayName : a ? 'BYE' : 'Por definir';
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

export interface KnockoutReconcileResult {
  updatedMatches: Match[];
  pendingSlotMatches: Match[];
  emptyMatchIds: string[];
  repairedLinks: number;
  filledSlots: number;
  propagatedWinners: number;
}

export interface UnpropagatedMatchInfo {
  match: Match;
  winnerId: string;
  winnerName: string;
  targetMatchId: string | null;
  targetRoundName: string | null;
  reason: 'missing_in_next_round' | 'wrong_slot_or_name' | 'unpublished_next_round' | 'missing_winner_id';
}

function recoverCompletedMatchWinner(
  m: Match,
  division: Division
): { winnerId: string; winnerName: string; changed: boolean } | null {
  if (m.isBye) {
    if (m.winnerEntryId) {
      const isA = m.winnerEntryId === m.entryAId;
      const expectedName = isA ? m.entryAName : m.entryBName;
      return {
        winnerId: m.winnerEntryId,
        winnerName: expectedName || m.winnerName || 'BYE',
        changed: false,
      };
    }
    return null;
  }

  // Caso 1: ya tiene winnerEntryId válido
  if (m.winnerEntryId) {
    if (m.winnerEntryId === m.entryAId) {
      const changed = m.winnerName !== m.entryAName;
      if (changed) m.winnerName = m.entryAName;
      return { winnerId: m.entryAId, winnerName: m.entryAName, changed };
    }
    if (m.winnerEntryId === m.entryBId) {
      const changed = m.winnerName !== m.entryBName;
      if (changed) m.winnerName = m.entryBName;
      return { winnerId: m.entryBId, winnerName: m.entryBName, changed };
    }
  }

  // Caso 2: partido marcado como finalizado/retiro/dq/wo o con sets cargados pero sin winnerEntryId
  const isFinishedStatus = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
  if (!isFinishedStatus && m.sets.length === 0) return null;

  // 2a. Intentar por winnerName coincidente
  if (m.winnerName) {
    const wn = m.winnerName.trim().toLowerCase();
    if (m.entryAId && m.entryAName.trim().toLowerCase() === wn) {
      m.winnerEntryId = m.entryAId;
      m.winnerName = m.entryAName;
      return { winnerId: m.entryAId, winnerName: m.entryAName, changed: true };
    }
    if (m.entryBId && m.entryBName.trim().toLowerCase() === wn) {
      m.winnerEntryId = m.entryBId;
      m.winnerName = m.entryBName;
      return { winnerId: m.entryBId, winnerName: m.entryBName, changed: true };
    }
  }

  // 2b. Intentar calcular ganador desde sets cuando está finalizado normalmente
  if (m.status === 'finalizado' && m.sets.length > 0 && m.entryAId && m.entryBId) {
    let setsA = 0;
    let setsB = 0;
    for (const s of m.sets) {
      if (s.a > s.b) setsA++;
      else if (s.b > s.a) setsB++;
    }
    const setsToWin = division.itfConfig?.setsToWin ?? 2;
    if (setsA !== setsB && (setsA >= setsToWin || setsB >= setsToWin || m.sets.length >= 1)) {
      const aWon = setsA > setsB;
      m.winnerEntryId = aWon ? m.entryAId : m.entryBId;
      m.winnerName = aWon ? m.entryAName : m.entryBName;
      return { winnerId: m.winnerEntryId, winnerName: m.winnerName, changed: true };
    }
  }

  return null;
}

export function reconcileKnockoutBracket(
  divisionMatches: Match[],
  division: Division,
  fallbackEntries: Registration[]
): KnockoutReconcileResult {
  const now = new Date().toISOString();
  const koMatches: Match[] = divisionMatches
    .filter((m) => m.phase === 'eliminacion')
    .sort(compareMatchesByRound)
    .map((m) => ({
      ...m,
      playerIdsA: [...(m.playerIdsA || [])],
      playerIdsB: [...(m.playerIdsB || [])],
      sets: [...(m.sets || [])],
      correctionHistory: [...(m.correctionHistory || [])],
      rescheduleHistory: [...(m.rescheduleHistory || [])],
    }));

  const nonThirdKo = koMatches.filter(
    (m) => !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
  );
  if (nonThirdKo.length === 0) {
    return {
      updatedMatches: [],
      pendingSlotMatches: [],
      emptyMatchIds: [],
      repairedLinks: 0,
      filledSlots: 0,
      propagatedWinners: 0,
    };
  }

  const changedIds = new Set<string>();
  const regMap = new Map(fallbackEntries.map((r) => [r.id, r]));
  const shouldBePublished =
    divisionMatches.some((m) => m.published) || division.drawStatus === 'publicado';

  let repairedLinks = 0;
  let filledSlots = 0;
  let propagatedWinners = 0;

  const markChanged = (m: Match) => {
    m.updatedAt = now;
    if (shouldBePublished) m.published = true;
    changedIds.add(m.id);
  };

  if (shouldBePublished) {
    for (const m of koMatches) {
      if (!m.published) {
        m.published = true;
        changedIds.add(m.id);
      }
    }
  }

  // 0. Normalizar roundOrder inconsistentes entre partidos de una misma ronda y posiciones duplicadas/faltantes
  const roundsByName = new Map<string, Match[]>();
  for (const m of nonThirdKo) {
    const key = m.roundName.trim().toLowerCase() || `r${m.roundOrder}`;
    const list = roundsByName.get(key);
    if (list) list.push(m);
    else roundsByName.set(key, [m]);
  }

  for (const group of roundsByName.values()) {
    const distinctOrders = new Set(group.map((m) => m.roundOrder));
    if (distinctOrders.size > 1) {
      const targetOrder = Math.min(...group.map((m) => m.roundOrder));
      for (const m of group) {
        if (m.roundOrder !== targetOrder) {
          m.roundOrder = targetOrder;
          markChanged(m);
          repairedLinks++;
        }
      }
    }
  }

  const sortedRoundGroups = Array.from(roundsByName.values()).sort((a, b) => {
    const nameA = a[0].roundName;
    const nameB = b[0].roundName;
    if (isKnownKnockoutStage(nameA) && isKnownKnockoutStage(nameB)) {
      const rankDiff = getKnockoutStageRank(nameA) - getKnockoutStageRank(nameB);
      if (rankDiff !== 0) return rankDiff;
    }
    return a[0].roundOrder - b[0].roundOrder;
  });

  // Asegurar que cada etapa tenga roundOrder estrictamente creciente respecto a la anterior
  for (let i = 1; i < sortedRoundGroups.length; i++) {
    const prevOrder = sortedRoundGroups[i - 1][0].roundOrder;
    const currGroup = sortedRoundGroups[i];
    if (currGroup[0].roundOrder <= prevOrder) {
      const fixedOrder = prevOrder + 1;
      for (const m of currGroup) {
        m.roundOrder = fixedOrder;
        markChanged(m);
        repairedLinks++;
      }
    }
  }

  // Garantizar bracketPosition único 1..N en cada ronda si falta o hay duplicados
  for (const group of sortedRoundGroups) {
    group.sort(
      (a, b) =>
        (a.bracketPosition ?? 9999) - (b.bracketPosition ?? 9999) ||
        (a.createdAt || '').localeCompare(b.createdAt || '') ||
        a.id.localeCompare(b.id)
    );
    const seenPos = new Set<number>();
    const needsRenumber = group.some((m) => {
      if (!m.bracketPosition || m.bracketPosition < 1 || seenPos.has(m.bracketPosition)) return true;
      seenPos.add(m.bracketPosition);
      return false;
    });
    if (needsRenumber) {
      group.forEach((m, idx) => {
        const expectedPos = idx + 1;
        if (m.bracketPosition !== expectedPos) {
          m.bracketPosition = expectedPos;
          markChanged(m);
          repairedLinks++;
        }
      });
    }
  }

  // 1. Reparar enlaces nextMatchId / nextMatchSlot evitando colisiones de ranura en el cuadro
  const claimedTargetSlots = new Set<string>();
  const finalRoundOrder =
    sortedRoundGroups.length > 0 ? sortedRoundGroups[sortedRoundGroups.length - 1][0].roundOrder : 99;

  for (let rIdx = 0; rIdx < sortedRoundGroups.length; rIdx++) {
    const group = sortedRoundGroups[rIdx];
    const nextGroup = sortedRoundGroups[rIdx + 1] || null;
    for (const m of group) {
      if (!nextGroup || isRealFinalMatch(m, nonThirdKo)) {
        if (m.roundOrder === finalRoundOrder && (m.nextMatchId || m.nextMatchSlot)) {
          m.nextMatchId = null;
          m.nextMatchSlot = null;
          markChanged(m);
          repairedLinks++;
        }
        continue;
      }

      const directTarget = m.nextMatchId
        ? nextGroup.find((nm) => nm.id === m.nextMatchId)
        : undefined;
      const directSlot: 'A' | 'B' =
        m.nextMatchSlot === 'A' || m.nextMatchSlot === 'B'
          ? m.nextMatchSlot
          : (m.bracketPosition || 1) % 2 === 1
          ? 'A'
          : 'B';
      const directKey = directTarget ? `${directTarget.id}::${directSlot}` : '';

      if (directTarget && !claimedTargetSlots.has(directKey)) {
        claimedTargetSlots.add(directKey);
        if (m.nextMatchSlot !== directSlot) {
          m.nextMatchSlot = directSlot;
          markChanged(m);
          repairedLinks++;
        }
        continue;
      }

      // Reparar mediante mapeo estructural determinístico
      const pos = m.bracketPosition || group.indexOf(m) + 1;
      const targetBracketPos = Math.ceil(pos / 2);
      const structuralTarget =
        nextGroup.find((nm) => nm.bracketPosition === targetBracketPos) ||
        nextGroup[targetBracketPos - 1];
      if (!structuralTarget) continue;

      const structuralSlot: 'A' | 'B' = pos % 2 === 1 ? 'A' : 'B';
      claimedTargetSlots.add(`${structuralTarget.id}::${structuralSlot}`);
      if (m.nextMatchId !== structuralTarget.id || m.nextMatchSlot !== structuralSlot) {
        m.nextMatchId = structuralTarget.id;
        m.nextMatchSlot = structuralSlot;
        markChanged(m);
        repairedLinks++;
      }
    }
  }

  // 2. Completar espacios vacíos en Ronda 1 con clasificados/inscriptos disponibles y resolver BYEs reales
  const minRoundOrder = Math.min(...nonThirdKo.map((m) => m.roundOrder));
  const round1Matches = nonThirdKo
    .filter((m) => m.roundOrder === minRoundOrder)
    .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));

  const assignedInR1 = new Set<string>();
  round1Matches.forEach((m) => {
    if (m.entryAId) assignedInR1.add(m.entryAId);
    if (m.entryBId) assignedInR1.add(m.entryBId);
  });

  const unassignedQueue = fallbackEntries.filter((e) => !assignedInR1.has(e.id));

  // Primer paso: asegurarse de que ninguna llave completamente vacía quede sin participante
  for (const m of round1Matches) {
    if (m.winnerEntryId || m.sets.length > 0) continue;
    if (!m.entryAId && !m.entryBId && unassignedQueue.length > 0) {
      const nextEntry = unassignedQueue.shift()!;
      m.entryAId = nextEntry.id;
      m.entryAName = nextEntry.displayName;
      m.playerIdsA = nextEntry.playerIds;
      markChanged(m);
      filledSlots++;
    }
  }

  // Segundo paso: completar huecos de lado B / lado A si quedaron cupos sin asignar en Ronda 1
  for (const m of round1Matches) {
    if ((m.winnerEntryId && !m.isBye) || m.sets.length > 0) continue;
    if (!m.entryAId && unassignedQueue.length > 0) {
      const nextEntry = unassignedQueue.shift()!;
      m.entryAId = nextEntry.id;
      m.entryAName = nextEntry.displayName;
      m.playerIdsA = nextEntry.playerIds;
      markChanged(m);
      filledSlots++;
    }
    if (!m.entryBId && unassignedQueue.length > 0) {
      const nextEntry = unassignedQueue.shift()!;
      m.entryBId = nextEntry.id;
      m.entryBName = nextEntry.displayName;
      m.playerIdsB = nextEntry.playerIds;
      markChanged(m);
      filledSlots++;
    }
  }

  // Tercer paso: normalizar Ronda 1 (BYEs reales vs partidos con ambos participantes)
  for (const m of round1Matches) {
    if (m.sets.length > 0) continue;
    if (m.entryAId && m.entryBId && m.isBye) {
      m.isBye = false;
      m.status = 'programado';
      m.winnerEntryId = null;
      m.winnerName = null;
      m.outcomeNote = null;
      markChanged(m);
    } else if ((m.entryAId && !m.entryBId) || (!m.entryAId && m.entryBId)) {
      const winnerIsA = Boolean(m.entryAId);
      const soleId = winnerIsA ? m.entryAId! : m.entryBId!;
      const soleName = winnerIsA ? m.entryAName : m.entryBName;
      const missingSideName = winnerIsA ? m.entryBName : m.entryAName;
      if (!m.isBye || !m.winnerEntryId || missingSideName !== 'BYE') {
        if (winnerIsA) {
          m.entryBName = 'BYE';
          m.playerIdsB = [];
        } else {
          m.entryAName = 'BYE';
          m.playerIdsA = [];
        }
        m.isBye = true;
        m.status = 'finalizado';
        m.winnerEntryId = soleId;
        m.winnerName = soleName;
        m.outcomeNote = m.outcomeNote || 'Pase libre (BYE)';
        markChanged(m);
        propagatedWinners++;
      }
    }
  }

  // 3. Recuperar ganadores faltantes en partidos ya finalizados y propagar ronda por ronda
  const sortedRoundOrders = Array.from(new Set(nonThirdKo.map((m) => m.roundOrder))).sort(
    (a, b) => a - b
  );
  const thirdPlaceMatch =
    koMatches.find((m) => m.isThirdPlace || m.roundName === 'Tercer Puesto') || null;

  for (const rOrder of sortedRoundOrders) {
    const roundMatches = nonThirdKo
      .filter((m) => m.roundOrder === rOrder)
      .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));

    for (const m of roundMatches) {
      const recovered = recoverCompletedMatchWinner(m, division);
      if (recovered?.changed) {
        markChanged(m);
        propagatedWinners++;
      }
      if (!m.winnerEntryId) continue;

      const winnerIsA = m.winnerEntryId === m.entryAId;
      const winnerId = m.winnerEntryId;
      const winnerName =
        (winnerIsA ? m.entryAName : m.entryBName) || m.winnerName || 'Ganador';
      let winnerPids = winnerIsA ? m.playerIdsA : m.playerIdsB;
      if (winnerPids.length === 0 && regMap.has(winnerId)) {
        winnerPids = regMap.get(winnerId)!.playerIds;
      }

      const resolved = resolveNextKnockoutMatch(m, nonThirdKo);
      if (!resolved) continue;

      const nextMatch = nonThirdKo.find((x) => x.id === resolved.nextMatch.id);
      if (!nextMatch) continue;

      const slot = resolved.slot;
      const currentTargetId = slot === 'A' ? nextMatch.entryAId : nextMatch.entryBId;
      const currentTargetName = slot === 'A' ? nextMatch.entryAName : nextMatch.entryBName;

      if (currentTargetId !== winnerId || currentTargetName !== winnerName || nextMatch.isBye) {
        const participantChanged = Boolean(currentTargetId && currentTargetId !== winnerId);
        if (slot === 'A') {
          nextMatch.entryAId = winnerId;
          nextMatch.entryAName = winnerName;
          nextMatch.playerIdsA = [...winnerPids];
        } else {
          nextMatch.entryBId = winnerId;
          nextMatch.entryBName = winnerName;
          nextMatch.playerIdsB = [...winnerPids];
        }
        if (nextMatch.isBye && nextMatch.entryAId && nextMatch.entryBId) {
          nextMatch.isBye = false;
          if (!participantChanged && nextMatch.outcomeNote === 'Pase libre (BYE)') {
            nextMatch.sets = [];
            nextMatch.winnerEntryId = null;
            nextMatch.winnerName = null;
            nextMatch.outcomeNote = null;
            nextMatch.status = 'programado';
          }
        }
        if (participantChanged) {
          nextMatch.sets = [];
          nextMatch.winnerEntryId = null;
          nextMatch.winnerName = null;
          nextMatch.outcomeNote = null;
          nextMatch.status = 'programado';
        }
        markChanged(nextMatch);
        propagatedWinners++;
      }

      // Propagar perdedor de semifinales al partido por el 3er Puesto
      if (thirdPlaceMatch && isRealFinalMatch(nextMatch, nonThirdKo) && !m.isBye) {
        const loserId = winnerIsA ? m.entryBId : m.entryAId;
        const loserName = winnerIsA ? m.entryBName : m.entryAName;
        let loserPids = winnerIsA ? m.playerIdsB : m.playerIdsA;
        if (loserId && loserPids.length === 0 && regMap.has(loserId)) {
          loserPids = regMap.get(loserId)!.playerIds;
        }
        if (loserId) {
          const curTpId = slot === 'A' ? thirdPlaceMatch.entryAId : thirdPlaceMatch.entryBId;
          const curTpName =
            slot === 'A' ? thirdPlaceMatch.entryAName : thirdPlaceMatch.entryBName;
          if (curTpId !== loserId || curTpName !== loserName) {
            const tpChanged = Boolean(curTpId && curTpId !== loserId);
            if (slot === 'A') {
              thirdPlaceMatch.entryAId = loserId;
              thirdPlaceMatch.entryAName = loserName;
              thirdPlaceMatch.playerIdsA = [...loserPids];
            } else {
              thirdPlaceMatch.entryBId = loserId;
              thirdPlaceMatch.entryBName = loserName;
              thirdPlaceMatch.playerIdsB = [...loserPids];
            }
            if (tpChanged) {
              thirdPlaceMatch.sets = [];
              thirdPlaceMatch.winnerEntryId = null;
              thirdPlaceMatch.winnerName = null;
              thirdPlaceMatch.outcomeNote = null;
              thirdPlaceMatch.status = 'programado';
            }
            markChanged(thirdPlaceMatch);
            propagatedWinners++;
          }
        }
      }
    }
  }

  // Sincronizar orden de ronda del partido de Tercer Puesto con la Final
  if (thirdPlaceMatch) {
    const realFinal = nonThirdKo.find((m) => isRealFinalMatch(m, nonThirdKo));
    if (realFinal && thirdPlaceMatch.roundOrder !== realFinal.roundOrder) {
      thirdPlaceMatch.roundOrder = realFinal.roundOrder;
      markChanged(thirdPlaceMatch);
      repairedLinks++;
    }
    const recoveredTp = recoverCompletedMatchWinner(thirdPlaceMatch, division);
    if (recoveredTp?.changed) {
      markChanged(thirdPlaceMatch);
      propagatedWinners++;
    }
  }

  const emptyMatchIds = koMatches
    .filter((m) => !m.entryAId && !m.entryBId)
    .map((m) => m.id);

  const pendingSlotMatches = koMatches.filter(
    (m) => !m.isBye && (!m.entryAId || !m.entryBId)
  );

  return {
    updatedMatches: koMatches.filter((m) => changedIds.has(m.id)),
    pendingSlotMatches,
    emptyMatchIds,
    repairedLinks,
    filledSlots,
    propagatedWinners,
  };
}

export function findUnpropagatedKnockoutMatches(
  divisionMatches: Match[],
  division: Division
): UnpropagatedMatchInfo[] {
  const deduped = dedupeMatches(
    divisionMatches.filter((m) => m.divisionId === division.id && m.phase === 'eliminacion')
  );
  if (deduped.length === 0) return [];

  const nonThirdKo = deduped.filter((m) => !m.isThirdPlace && m.roundName !== 'Tercer Puesto');
  const shouldBePublished =
    divisionMatches.some((m) => m.published) || division.drawStatus === 'publicado';
  const result: UnpropagatedMatchInfo[] = [];

  for (const m of nonThirdKo) {
    if (isRealFinalMatch(m, nonThirdKo)) continue;
    const isFinished =
      Boolean(m.winnerEntryId) ||
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status) ||
      m.sets.length > 0;
    if (!isFinished) continue;

    // Clonar para recuperar ganador si faltara
    const clone: Match = { ...m, sets: [...m.sets] };
    const hadWinnerId = Boolean(m.winnerEntryId);
    const recovered = recoverCompletedMatchWinner(clone, division);
    if (!recovered) {
      if (!m.isBye && (m.entryAId || m.entryBId)) {
        result.push({
          match: m,
          winnerId: '',
          winnerName: m.winnerName || 'Sin ganador definido',
          targetMatchId: m.nextMatchId || null,
          targetRoundName: null,
          reason: 'missing_winner_id',
        });
      }
      continue;
    }

    const nextResolved = resolveNextKnockoutMatch(m, nonThirdKo);
    if (!nextResolved) continue;

    const target = nextResolved.nextMatch;
    const slot = nextResolved.slot;
    const targetEntryId = slot === 'A' ? target.entryAId : target.entryBId;
    const targetEntryName = slot === 'A' ? target.entryAName : target.entryBName;

    if (!hadWinnerId) {
      result.push({
        match: m,
        winnerId: recovered.winnerId,
        winnerName: recovered.winnerName,
        targetMatchId: target.id,
        targetRoundName: target.roundName,
        reason: 'missing_winner_id',
      });
    } else if (!targetEntryId) {
      result.push({
        match: m,
        winnerId: recovered.winnerId,
        winnerName: recovered.winnerName,
        targetMatchId: target.id,
        targetRoundName: target.roundName,
        reason: 'missing_in_next_round',
      });
    } else if (targetEntryId !== recovered.winnerId || targetEntryName !== recovered.winnerName) {
      result.push({
        match: m,
        winnerId: recovered.winnerId,
        winnerName: recovered.winnerName,
        targetMatchId: target.id,
        targetRoundName: target.roundName,
        reason: 'wrong_slot_or_name',
      });
    } else if (shouldBePublished && !target.published) {
      result.push({
        match: m,
        winnerId: recovered.winnerId,
        winnerName: recovered.winnerName,
        targetMatchId: target.id,
        targetRoundName: target.roundName,
        reason: 'unpublished_next_round',
      });
    }
  }

  return result;
}

export function computeKnockoutPodiumUpdate(
  division: Division,
  divisionMatches: Match[]
): Partial<Division> | null {
  const deduped = dedupeMatches(
    divisionMatches.filter((m) => m.divisionId === division.id && m.phase === 'eliminacion')
  );
  if (deduped.length === 0) return null;

  const finalMatch = deduped.find((m) => isRealFinalMatch(m, deduped));
  const thirdMatch = deduped.find((m) => m.isThirdPlace || m.roundName === 'Tercer Puesto');

  let nextChampId = division.championEntryId ?? null;
  let nextChampName = division.championName ?? null;
  let nextRunnerUpName = division.runnerUpName ?? null;
  let nextThirdId = division.thirdPlaceEntryId ?? null;
  let nextThirdName = division.thirdPlaceName ?? null;

  if (finalMatch && finalMatch.winnerEntryId) {
    const winnerIsA = finalMatch.winnerEntryId === finalMatch.entryAId;
    nextChampId = finalMatch.winnerEntryId;
    nextChampName = winnerIsA ? finalMatch.entryAName : finalMatch.entryBName;
    nextRunnerUpName = winnerIsA ? finalMatch.entryBName : finalMatch.entryAName;
  }

  if (thirdMatch && thirdMatch.winnerEntryId) {
    const winnerIsA = thirdMatch.winnerEntryId === thirdMatch.entryAId;
    nextThirdId = thirdMatch.winnerEntryId;
    nextThirdName = winnerIsA ? thirdMatch.entryAName : thirdMatch.entryBName;
  }

  if (
    nextChampId !== (division.championEntryId ?? null) ||
    nextChampName !== (division.championName ?? null) ||
    nextRunnerUpName !== (division.runnerUpName ?? null) ||
    nextThirdId !== (division.thirdPlaceEntryId ?? null) ||
    nextThirdName !== (division.thirdPlaceName ?? null)
  ) {
    return {
      championEntryId: nextChampId,
      championName: nextChampName,
      runnerUpName: nextRunnerUpName,
      thirdPlaceEntryId: nextThirdId,
      thirdPlaceName: nextThirdName,
    };
  }
  return null;
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
  if (!match.winnerEntryId || match.winnerEntryId === newWinnerId) {
    return [];
  }
  const divisionMatches = allMatches.filter((m) => m.divisionId === match.divisionId);
  const affected: Match[] = [];
  let cursorMatch: Match | undefined = match;
  const visited = new Set<string>([match.id]);

  while (cursorMatch) {
    const resolved = resolveNextKnockoutMatch(cursorMatch, divisionMatches);
    if (!resolved || visited.has(resolved.nextMatch.id)) break;
    const next = resolved.nextMatch;
    visited.add(next.id);

    if (
      next.scheduledDate ||
      next.sets.length > 0 ||
      next.winnerEntryId ||
      next.status !== 'programado'
    ) {
      affected.push(next);
    }
    // Si este cruce era Semifinal hacia la Final, revisar el partido de 3er puesto
    if (isRealFinalMatch(next, divisionMatches)) {
      const thirdPlaceMatch = divisionMatches.find(
        (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
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
    cursorMatch = next;
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
  const phaseA = a.phase === 'grupos' ? 0 : a.phase === 'clasificatoria' ? 1 : 2;
  const phaseB = b.phase === 'grupos' ? 0 : b.phase === 'clasificatoria' ? 1 : 2;
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

  if (match.entryAId && match.entryBId) {
    const pair = [match.entryAId, match.entryBId].sort().join('|');
    return `${match.divisionId}::eliminacion::${match.roundName}::${pair}`;
  }
  return `${match.divisionId}::eliminacion::id::${match.id}`;
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

export function getExpectedNextRoundName(
  currentRoundName: string,
  currentRoundMatchCount: number
): string {
  const lower = (currentRoundName || '').trim().toLowerCase();
  if (lower.includes('64')) return 'Ronda de 32';
  if (lower.includes('32') || lower.includes('16avos') || lower.includes('dieciseisavo')) {
    return 'Octavos de Final';
  }
  if (lower.includes('octavo')) return 'Cuartos de Final';
  if (lower.includes('cuarto')) return 'Semifinales';
  if (lower.includes('semifinal')) return 'Final';
  const nextCount = Math.max(1, Math.ceil(currentRoundMatchCount / 2));
  if (nextCount === 1) return 'Final';
  if (nextCount === 2) return 'Semifinales';
  if (nextCount === 4) return 'Cuartos de Final';
  if (nextCount === 8) return 'Octavos de Final';
  return `Ronda de ${nextCount * 2}`;
}

export type EliminationIssueCode =
  | 'orphan_no_next_match'
  | 'dangling_next_match_id'
  | 'missing_next_round_match'
  | 'slot_collision'
  | 'bye_not_advanced'
  | 'unpropagated_winner'
  | 'missing_winner_id'
  | 'inconsistent_entrant'
  | 'round_order_mismatch'
  | 'unpublished_match'
  | 'empty_round1_match';

export interface EliminationIssueDetail {
  code: EliminationIssueCode;
  severity: 'critical' | 'warning';
  title: string;
  description: string;
}

export interface EliminationFeederCheck {
  side: 'A' | 'B';
  currentEntryId: string | null;
  currentEntryName: string;
  expectedFeederMatch: Match | null;
  isConsistent: boolean;
  reason: string | null;
}

export interface EliminationMatchDiagnostic {
  match: Match;
  isFinal: boolean;
  isThirdPlace: boolean;
  issues: EliminationIssueDetail[];
  statusSeverity: 'critical' | 'warning' | 'ok';
  isOrphan: boolean;
  isInconsistent: boolean;
  canForceAdvance: boolean;
  winnerCandidate: {
    entryId: string | null;
    name: string | null;
    playerIds: string[];
    side: 'A' | 'B' | null;
  };
  currentNextMatch: Match | null;
  currentNextSlot: 'A' | 'B' | null;
  suggestedNextMatch: Match | null;
  suggestedNextSlot: 'A' | 'B';
  expectedNextRoundName: string | null;
  expectedNextRoundOrder: number;
  expectedNextBracketPos: number;
  nextRoundMatches: Match[];
  higherRoundMatches: Match[];
  feeders: Match[];
  slotChecks: EliminationFeederCheck[];
  collidingMatches: Match[];
}

export interface EliminationRoundSummary {
  roundOrder: number;
  roundName: string;
  matchCount: number;
  expectedMatchCount: number;
  finishedCount: number;
  pendingCount: number;
  issueCount: number;
  isMissingMatches: boolean;
  missingPositions: number[];
}

export interface EliminationDiagnosticsReport {
  divisionId: string;
  divisionName: string;
  totalKoMatches: number;
  rounds: EliminationRoundSummary[];
  matchDiagnostics: EliminationMatchDiagnostic[];
  problemDiagnostics: EliminationMatchDiagnostic[];
  summary: {
    totalIssues: number;
    orphansCount: number;
    inconsistentCount: number;
    unpropagatedCount: number;
    missingMatchesCount: number;
    collisionsCount: number;
    criticalCount: number;
    warningCount: number;
  };
}

function resolveCandidateWinner(
  m: Match,
  division: Division
): {
  entryId: string | null;
  name: string | null;
  playerIds: string[];
  side: 'A' | 'B' | null;
} {
  if (m.winnerEntryId) {
    if (m.winnerEntryId === m.entryAId) {
      return {
        entryId: m.entryAId,
        name: m.entryAName,
        playerIds: m.playerIdsA || [],
        side: 'A',
      };
    }
    if (m.winnerEntryId === m.entryBId) {
      return {
        entryId: m.entryBId,
        name: m.entryBName,
        playerIds: m.playerIdsB || [],
        side: 'B',
      };
    }
    return {
      entryId: m.winnerEntryId,
      name: m.winnerName || 'Ganador',
      playerIds: [],
      side: null,
    };
  }

  if (m.isBye) {
    if (m.entryAId && !m.entryBId) {
      return {
        entryId: m.entryAId,
        name: m.entryAName,
        playerIds: m.playerIdsA || [],
        side: 'A',
      };
    }
    if (m.entryBId && !m.entryAId) {
      return {
        entryId: m.entryBId,
        name: m.entryBName,
        playerIds: m.playerIdsB || [],
        side: 'B',
      };
    }
  }

  const clone: Match = {
    ...m,
    sets: [...(m.sets || [])],
    playerIdsA: [...(m.playerIdsA || [])],
    playerIdsB: [...(m.playerIdsB || [])],
  };
  const recovered = recoverCompletedMatchWinner(clone, division);
  if (recovered) {
    const side: 'A' | 'B' | null =
      recovered.winnerId === m.entryAId ? 'A' : recovered.winnerId === m.entryBId ? 'B' : null;
    return {
      entryId: recovered.winnerId,
      name: recovered.winnerName,
      playerIds: side === 'A' ? m.playerIdsA || [] : side === 'B' ? m.playerIdsB || [] : [],
      side,
    };
  }

  return { entryId: null, name: null, playerIds: [], side: null };
}

function getEffectiveTargetSlot(m: Match, fallbackPos: number): 'A' | 'B' {
  if (m.nextMatchSlot === 'A' || m.nextMatchSlot === 'B') return m.nextMatchSlot;
  const pos = m.bracketPosition && m.bracketPosition >= 1 ? m.bracketPosition : fallbackPos;
  return pos % 2 === 1 ? 'A' : 'B';
}

export function analyzeEliminationDiagnostics(
  division: Division,
  divisionMatches: Match[]
): EliminationDiagnosticsReport {
  const dedupedKo = dedupeMatches(
    divisionMatches.filter((m) => m.divisionId === division.id && m.phase === 'eliminacion')
  );

  const nonThirdKo = dedupedKo
    .filter((m) => !m.isThirdPlace && m.roundName !== 'Tercer Puesto')
    .sort(compareMatchesByRound);

  const thirdPlaceMatch =
    dedupedKo.find((m) => m.isThirdPlace || m.roundName === 'Tercer Puesto') || null;

  if (dedupedKo.length === 0) {
    return {
      divisionId: division.id,
      divisionName: division.name,
      totalKoMatches: 0,
      rounds: [],
      matchDiagnostics: [],
      problemDiagnostics: [],
      summary: {
        totalIssues: 0,
        orphansCount: 0,
        inconsistentCount: 0,
        unpropagatedCount: 0,
        missingMatchesCount: 0,
        collisionsCount: 0,
        criticalCount: 0,
        warningCount: 0,
      },
    };
  }

  const roundsMap = new Map<string, Match[]>();
  for (const m of nonThirdKo) {
    const key = m.roundName.trim().toLowerCase() || `r${m.roundOrder}`;
    const list = roundsMap.get(key);
    if (list) list.push(m);
    else roundsMap.set(key, [m]);
  }

  const sortedRoundGroups = Array.from(roundsMap.values()).sort((a, b) => {
    const nameA = a[0].roundName;
    const nameB = b[0].roundName;
    if (isKnownKnockoutStage(nameA) && isKnownKnockoutStage(nameB)) {
      const rankDiff = getKnockoutStageRank(nameA) - getKnockoutStageRank(nameB);
      if (rankDiff !== 0) return rankDiff;
    }
    return a[0].roundOrder - b[0].roundOrder;
  });

  sortedRoundGroups.forEach((group) => {
    group.sort(
      (a, b) =>
        (a.bracketPosition ?? 9999) - (b.bracketPosition ?? 9999) ||
        (a.createdAt || '').localeCompare(b.createdAt || '') ||
        a.id.localeCompare(b.id)
    );
  });

  const koById = new Map<string, Match>(nonThirdKo.map((m) => [m.id, m]));
  const roundIndexByMatchId = new Map<string, number>();
  const posIndexByMatchId = new Map<string, number>();
  sortedRoundGroups.forEach((group, rIdx) => {
    group.forEach((m, idx) => {
      roundIndexByMatchId.set(m.id, rIdx);
      posIndexByMatchId.set(
        m.id,
        m.bracketPosition && m.bracketPosition >= 1 ? m.bracketPosition : idx + 1
      );
    });
  });

  // Calcular tamaños esperados por ronda
  const expectedCountByRound: number[] = sortedRoundGroups.map((g) => g.length);
  if (sortedRoundGroups.length > 0) {
    let firstSize = 1;
    while (firstSize < sortedRoundGroups[0].length) firstSize *= 2;
    if (sortedRoundGroups.length > 1) {
      const impliedFromSecond = expectedCountByRound[1] * 2;
      firstSize = Math.max(firstSize, impliedFromSecond);
    }
    const maxPosFirst = Math.max(
      0,
      ...sortedRoundGroups[0].map((m) => m.bracketPosition || 0)
    );
    expectedCountByRound[0] = Math.max(sortedRoundGroups[0].length, maxPosFirst, firstSize > 1 ? sortedRoundGroups[0].length : 1);
    for (let i = 1; i < sortedRoundGroups.length; i++) {
      const expectedFromPrev = Math.max(1, Math.ceil(expectedCountByRound[i - 1] / 2));
      const maxPosCurr = Math.max(
        0,
        ...sortedRoundGroups[i].map((m) => m.bracketPosition || 0)
      );
      expectedCountByRound[i] = Math.max(expectedFromPrev, maxPosCurr, sortedRoundGroups[i].length);
    }
  }

  // Feeders por targetId::slot e incoming por targetId
  const feedersBySlotKey = new Map<string, Match[]>();
  const feedersByTargetId = new Map<string, Match[]>();

  for (const m of nonThirdKo) {
    if (!m.nextMatchId || !koById.has(m.nextMatchId)) continue;
    const target = koById.get(m.nextMatchId)!;
    const mRoundIdx = roundIndexByMatchId.get(m.id) ?? 0;
    const tRoundIdx = roundIndexByMatchId.get(target.id) ?? 0;
    if (tRoundIdx <= mRoundIdx) continue;

    const slot = getEffectiveTargetSlot(m, posIndexByMatchId.get(m.id) || 1);
    const key = `${target.id}::${slot}`;
    const slotList = feedersBySlotKey.get(key) || [];
    slotList.push(m);
    feedersBySlotKey.set(key, slotList);

    const incList = feedersByTargetId.get(target.id) || [];
    incList.push(m);
    feedersByTargetId.set(target.id, incList);
  }

  // Mapa de partidos aún pendientes por entryId para detectar inconsistencias entre rondas
  const pendingMatchesByEntryId = new Map<string, Match[]>();
  for (const m of nonThirdKo) {
    if (m.winnerEntryId || m.isBye) continue;
    if (m.entryAId) {
      const list = pendingMatchesByEntryId.get(m.entryAId) || [];
      list.push(m);
      pendingMatchesByEntryId.set(m.entryAId, list);
    }
    if (m.entryBId) {
      const list = pendingMatchesByEntryId.get(m.entryBId) || [];
      list.push(m);
      pendingMatchesByEntryId.set(m.entryBId, list);
    }
  }

  const shouldBePublished =
    division.drawStatus === 'publicado' || dedupedKo.some((m) => m.published);

  const roundIssueCounts = new Array<number>(sortedRoundGroups.length).fill(0);
  const matchDiagnostics: EliminationMatchDiagnostic[] = [];

  for (let rIdx = 0; rIdx < sortedRoundGroups.length; rIdx++) {
    const group = sortedRoundGroups[rIdx];
    const nextGroup = sortedRoundGroups[rIdx + 1] || [];
    const prevGroup = rIdx > 0 ? sortedRoundGroups[rIdx - 1] : [];
    const higherRoundMatches = sortedRoundGroups.slice(rIdx + 1).flat();
    const expectedNextName =
      rIdx < sortedRoundGroups.length - 1
        ? nextGroup[0].roundName
        : group.length > 1
        ? getExpectedNextRoundName(group[0].roundName, group.length)
        : null;
    const expectedNextOrder =
      rIdx < sortedRoundGroups.length - 1
        ? nextGroup[0].roundOrder
        : group[0].roundOrder + 1;

    // Detectar roundOrder inconsistente o bracketPosition duplicados dentro del grupo
    const distinctOrders = new Set(group.map((m) => m.roundOrder));
    const posCounts = new Map<number, number>();
    group.forEach((m) => {
      if (m.bracketPosition != null) {
        posCounts.set(m.bracketPosition, (posCounts.get(m.bracketPosition) || 0) + 1);
      }
    });

    for (let idx = 0; idx < group.length; idx++) {
      const m = group[idx];
      const issues: EliminationIssueDetail[] = [];
      const isFinal = isRealFinalMatch(m, nonThirdKo);
      const pos = m.bracketPosition && m.bracketPosition >= 1 ? m.bracketPosition : idx + 1;
      const expectedNextPos = Math.ceil(pos / 2);
      const defaultSlot: 'A' | 'B' = pos % 2 === 1 ? 'A' : 'B';

      const winnerCandidate = resolveCandidateWinner(m, division);

      const structuralNext =
        !isFinal && nextGroup.length > 0
          ? nextGroup.find((nm) => nm.bracketPosition === expectedNextPos) ||
            nextGroup[expectedNextPos - 1] ||
            null
          : null;

      let currentNextMatch: Match | null = null;
      let currentNextSlot: 'A' | 'B' | null = null;
      let collidingMatches: Match[] = [];

      if (!isFinal) {
        if (m.nextMatchId) {
          const direct = koById.get(m.nextMatchId) || null;
          if (!direct) {
            issues.push({
              code: 'dangling_next_match_id',
              severity: 'critical',
              title: 'Enlace siguiente roto',
              description: `El campo nextMatchId ("${m.nextMatchId}") apunta a un partido inexistente o eliminado.`,
            });
          } else {
            const directRoundIdx = roundIndexByMatchId.get(direct.id) ?? -1;
            if (direct.id === m.id || directRoundIdx <= rIdx) {
              issues.push({
                code: 'dangling_next_match_id',
                severity: 'critical',
                title: 'Enlace hacia ronda inválida',
                description: `Apunta a "${direct.roundName}" en lugar de una ronda posterior.`,
              });
            } else {
              currentNextMatch = direct;
              currentNextSlot = getEffectiveTargetSlot(m, pos);
              const key = `${direct.id}::${currentNextSlot}`;
              const allInSlot = feedersBySlotKey.get(key) || [];
              collidingMatches = allInSlot.filter((x) => x.id !== m.id);
              if (collidingMatches.length > 0) {
                issues.push({
                  code: 'slot_collision',
                  severity: 'critical',
                  title: 'Colisión de cruce en siguiente ronda',
                  description: `Comparte la ranura Lado ${currentNextSlot} de "${direct.roundName} #${direct.bracketPosition || '?'}" con otro partido (${collidingMatches
                    .map((c) => `${c.entryAName} vs ${c.entryBName}`)
                    .join(', ')}).`,
                });
              }
            }
          }
        } else {
          issues.push({
            code: 'orphan_no_next_match',
            severity: 'critical',
            title: 'Partido huérfano sin cruce destino',
            description: structuralNext
              ? `No tiene nextMatchId configurado (debería avanzar a ${structuralNext.roundName} Pos #${structuralNext.bracketPosition || expectedNextPos} · Lado ${defaultSlot}).`
              : `No tiene nextMatchId y falta su llave destino en ${expectedNextName || 'la siguiente ronda'}.`,
          });
        }

        if (!currentNextMatch && !structuralNext && group.length > 1) {
          issues.push({
            code: 'missing_next_round_match',
            severity: 'critical',
            title: `Falta llave en ${expectedNextName || 'siguiente ronda'}`,
            description: `No existe la llave #${expectedNextPos} en ${expectedNextName || 'la siguiente ronda'} para recibir al ganador de este partido.`,
          });
        }
      }

      // Verificar si el partido terminó/es BYE pero no tiene ganador o su ganador no avanzó
      const hasFinishedStatus = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
      const hasResultIntent = m.isBye || hasFinishedStatus || (m.sets && m.sets.length > 0);

      if (!isFinal && hasResultIntent && !winnerCandidate.entryId && (m.entryAId || m.entryBId)) {
        issues.push({
          code: 'missing_winner_id',
          severity: 'critical',
          title: 'Finalizado sin ganador asignado',
          description:
            'El partido figura finalizado o con sets cargados, pero no tiene winnerEntryId definido para avanzar de ronda.',
        });
      }

      if (!isFinal && winnerCandidate.entryId) {
        const checkTarget = currentNextMatch || structuralNext;
        const checkSlot = currentNextSlot || defaultSlot;

        if (!checkTarget) {
          issues.push({
            code: m.isBye ? 'bye_not_advanced' : 'unpropagated_winner',
            severity: 'critical',
            title: m.isBye ? 'BYE huérfano sin avanzar' : 'Ganador sin avanzar de ronda',
            description: `${winnerCandidate.name || 'Ganador'} debe pasar a ${expectedNextName || 'la siguiente ronda'}, pero no hay llave destino asignada.`,
          });
        } else {
          const targetId = checkSlot === 'A' ? checkTarget.entryAId : checkTarget.entryBId;
          const targetName = checkSlot === 'A' ? checkTarget.entryAName : checkTarget.entryBName;
          const matchesTarget =
            targetId === winnerCandidate.entryId &&
            (!winnerCandidate.name || targetName === winnerCandidate.name);

          // También detectar si el ganador no está en ninguna ranura de la ronda siguiente cuando checkTarget es null o incorrecto
          const alsoFoundInOtherSlot =
            (checkSlot === 'A' ? checkTarget.entryBId : checkTarget.entryAId) ===
            winnerCandidate.entryId;

          if (!currentNextMatch) {
            issues.push({
              code: m.isBye ? 'bye_not_advanced' : 'unpropagated_winner',
              severity: 'critical',
              title: m.isBye ? 'BYE sin enlace a siguiente ronda' : 'Ganador sin enlace destino',
              description: `${winnerCandidate.name || 'Ganador'} ganó este cruce pero el partido no apunta a "${checkTarget.roundName} #${checkTarget.bracketPosition || expectedNextPos}".`,
            });
          } else if (!matchesTarget) {
            issues.push({
              code: m.isBye ? 'bye_not_advanced' : 'unpropagated_winner',
              severity: 'critical',
              title: m.isBye ? 'Ganador por BYE no figura en siguiente ronda' : 'Ganador no reflejado en siguiente ronda',
              description: alsoFoundInOtherSlot
                ? `${winnerCandidate.name || 'Ganador'} figura en el lado opuesto al configurado (nextMatchSlot=${checkSlot}) en ${checkTarget.roundName} #${checkTarget.bracketPosition || '?'}.`
                : `${winnerCandidate.name || 'Ganador'} no figura en Lado ${checkSlot} de ${checkTarget.roundName} #${checkTarget.bracketPosition || '?'} (actualmente dice "${targetName}").`,
            });
          }
        }
      }

      // Verificar consistencia de jugadores en rondas >= 2 contra sus cruces previos
      const explicitFeeders = feedersByTargetId.get(m.id) || [];
      const expectedFeederPosA = pos * 2 - 1;
      const expectedFeederPosB = pos * 2;
      const feederForA =
        (feedersBySlotKey.get(`${m.id}::A`) || [])[0] ||
        prevGroup.find((pm) => pm.bracketPosition === expectedFeederPosA) ||
        prevGroup[expectedFeederPosA - 1] ||
        null;
      const feederForB =
        (feedersBySlotKey.get(`${m.id}::B`) || [])[0] ||
        prevGroup.find((pm) => pm.bracketPosition === expectedFeederPosB) ||
        prevGroup[expectedFeederPosB - 1] ||
        null;

      const slotChecks: EliminationFeederCheck[] = [];
      if (rIdx > 0) {
        const pairs: Array<{
          side: 'A' | 'B';
          entryId: string | null;
          entryName: string;
          feeder: Match | null;
        }> = [
          {
            side: 'A',
            entryId: m.entryAId || null,
            entryName: m.entryAName,
            feeder: feederForA,
          },
          {
            side: 'B',
            entryId: m.entryBId || null,
            entryName: m.entryBName,
            feeder: feederForB,
          },
        ];

        for (const p of pairs) {
          if (!p.entryId) {
            slotChecks.push({
              side: p.side,
              currentEntryId: null,
              currentEntryName: p.entryName,
              expectedFeederMatch: p.feeder,
              isConsistent: true,
              reason: null,
            });
            continue;
          }

          let checkConsistent = true;
          let checkReason: string | null = null;

          // Verificar primero si el jugador tiene un partido pendiente en una ronda anterior
          const earlierPending = (pendingMatchesByEntryId.get(p.entryId) || []).find(
            (pm) => (roundIndexByMatchId.get(pm.id) ?? 999) < rIdx
          );

          if (p.feeder) {
            const feederWinner = resolveCandidateWinner(p.feeder, division);
            const belongsToFeeder =
              p.feeder.entryAId === p.entryId || p.feeder.entryBId === p.entryId;

            if (!feederWinner.entryId) {
              checkConsistent = false;
              checkReason = `Lado ${p.side} (${p.entryName}) ya figura en ${m.roundName}, pero su cruce previo (${p.feeder.entryAName} vs ${p.feeder.entryBName}) sigue pendiente.`;
            } else if (feederWinner.entryId !== p.entryId) {
              checkConsistent = false;
              checkReason = `Lado ${p.side} tiene a ${p.entryName}, pero el ganador del cruce previo fue ${feederWinner.name || feederWinner.entryId}.`;
            } else if (!belongsToFeeder) {
              checkConsistent = false;
              checkReason = `Lado ${p.side} (${p.entryName}) no coincide con los participantes del cruce previo esperado.`;
            }
          } else if (earlierPending) {
            checkConsistent = false;
            checkReason = `Lado ${p.side} (${p.entryName}) figura aquí mientras su partido en ${earlierPending.roundName} (${earlierPending.entryAName} vs ${earlierPending.entryBName}) sigue sin resolverse.`;
          }

          if (!checkConsistent && checkReason) {
            issues.push({
              code: 'inconsistent_entrant',
              severity: 'critical',
              title: `Cruce inconsistente en Lado ${p.side}`,
              description: checkReason,
            });
          }

          slotChecks.push({
            side: p.side,
            currentEntryId: p.entryId,
            currentEntryName: p.entryName,
            expectedFeederMatch: p.feeder,
            isConsistent: checkConsistent,
            reason: checkReason,
          });
        }
      }

      if (rIdx === 0 && !m.entryAId && !m.entryBId) {
        issues.push({
          code: 'empty_round1_match',
          severity: 'warning',
          title: 'Llave de primera ronda vacía',
          description: 'No tiene jugador en Lado A ni en Lado B.',
        });
      }

      if (distinctOrders.size > 1 || (m.bracketPosition != null && (posCounts.get(m.bracketPosition) || 0) > 1)) {
        issues.push({
          code: 'round_order_mismatch',
          severity: 'warning',
          title: 'Posición o roundOrder desalineado',
          description:
            distinctOrders.size > 1
              ? `Hay partidos de "${m.roundName}" con distintos roundOrder.`
              : `Posición #${m.bracketPosition} duplicada dentro de "${m.roundName}".`,
        });
      }

      if (shouldBePublished && !m.published) {
        issues.push({
          code: 'unpublished_match',
          severity: 'warning',
          title: 'Partido no publicado en el portal',
          description: 'El cuadro figura publicado pero este partido sigue con published=false.',
        });
      }

      const hasCritical = issues.some((i) => i.severity === 'critical');
      const hasWarning = issues.some((i) => i.severity === 'warning');
      const statusSeverity: 'critical' | 'warning' | 'ok' = hasCritical
        ? 'critical'
        : hasWarning
        ? 'warning'
        : 'ok';

      if (issues.length > 0) {
        roundIssueCounts[rIdx]++;
      }

      const isOrphan = issues.some((i) =>
        ['orphan_no_next_match', 'dangling_next_match_id', 'missing_next_round_match'].includes(
          i.code
        )
      );
      const isInconsistent = issues.some((i) =>
        [
          'inconsistent_entrant',
          'slot_collision',
          'bye_not_advanced',
          'unpropagated_winner',
          'missing_winner_id',
        ].includes(i.code)
      );

      matchDiagnostics.push({
        match: m,
        isFinal,
        isThirdPlace: false,
        issues,
        statusSeverity,
        isOrphan,
        isInconsistent,
        canForceAdvance: !isFinal && Boolean(m.entryAId || m.entryBId),
        winnerCandidate,
        currentNextMatch,
        currentNextSlot,
        suggestedNextMatch: structuralNext,
        suggestedNextSlot: defaultSlot,
        expectedNextRoundName: expectedNextName,
        expectedNextRoundOrder: expectedNextOrder,
        expectedNextBracketPos: expectedNextPos,
        nextRoundMatches: nextGroup,
        higherRoundMatches,
        feeders: explicitFeeders,
        slotChecks,
        collidingMatches,
      });
    }
  }

  if (thirdPlaceMatch) {
    const tpIssues: EliminationIssueDetail[] = [];
    const tpHasIntent =
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(thirdPlaceMatch.status) ||
      thirdPlaceMatch.sets.length > 0;
    const tpWinner = resolveCandidateWinner(thirdPlaceMatch, division);
    if (tpHasIntent && !tpWinner.entryId && (thirdPlaceMatch.entryAId || thirdPlaceMatch.entryBId)) {
      tpIssues.push({
        code: 'missing_winner_id',
        severity: 'critical',
        title: '3er Puesto sin ganador asignado',
        description: 'El partido por el 3er Puesto tiene estado finalizado/sets pero falta winnerEntryId.',
      });
    }
    if (shouldBePublished && !thirdPlaceMatch.published) {
      tpIssues.push({
        code: 'unpublished_match',
        severity: 'warning',
        title: '3er Puesto no publicado',
        description: 'El partido por el 3er Puesto aún tiene published=false.',
      });
    }
    const statusSeverity: 'critical' | 'warning' | 'ok' = tpIssues.some(
      (i) => i.severity === 'critical'
    )
      ? 'critical'
      : tpIssues.length > 0
      ? 'warning'
      : 'ok';

    matchDiagnostics.push({
      match: thirdPlaceMatch,
      isFinal: false,
      isThirdPlace: true,
      issues: tpIssues,
      statusSeverity,
      isOrphan: false,
      isInconsistent: tpIssues.some((i) => i.code === 'missing_winner_id'),
      canForceAdvance: false,
      winnerCandidate: tpWinner,
      currentNextMatch: null,
      currentNextSlot: null,
      suggestedNextMatch: null,
      suggestedNextSlot: 'A',
      expectedNextRoundName: null,
      expectedNextRoundOrder: thirdPlaceMatch.roundOrder,
      expectedNextBracketPos: 2,
      nextRoundMatches: [],
      higherRoundMatches: [],
      feeders: [],
      slotChecks: [],
      collidingMatches: [],
    });
  }

  const rounds: EliminationRoundSummary[] = sortedRoundGroups.map((group, rIdx) => {
    const expectedCount = expectedCountByRound[rIdx] || group.length;
    const existingPos = new Set(
      group.map((m, idx) =>
        m.bracketPosition && m.bracketPosition >= 1 ? m.bracketPosition : idx + 1
      )
    );
    const missingPositions: number[] = [];
    for (let p = 1; p <= expectedCount; p++) {
      if (!existingPos.has(p)) missingPositions.push(p);
    }
    const finishedCount = group.filter(
      (m) => Boolean(m.winnerEntryId) || m.isBye
    ).length;
    return {
      roundOrder: group[0].roundOrder,
      roundName: group[0].roundName,
      matchCount: group.length,
      expectedMatchCount: expectedCount,
      finishedCount,
      pendingCount: group.length - finishedCount,
      issueCount: roundIssueCounts[rIdx] || 0,
      isMissingMatches: group.length < expectedCount || missingPositions.length > 0,
      missingPositions,
    };
  });

  const problemDiagnostics = matchDiagnostics.filter((d) => d.issues.length > 0);
  const allIssues = problemDiagnostics.flatMap((d) => d.issues);

  return {
    divisionId: division.id,
    divisionName: division.name,
    totalKoMatches: dedupedKo.length,
    rounds,
    matchDiagnostics,
    problemDiagnostics,
    summary: {
      totalIssues: allIssues.length,
      orphansCount: problemDiagnostics.filter((d) => d.isOrphan).length,
      inconsistentCount: problemDiagnostics.filter((d) => d.isInconsistent).length,
      unpropagatedCount: allIssues.filter((i) =>
        ['bye_not_advanced', 'unpropagated_winner', 'missing_winner_id'].includes(i.code)
      ).length,
      missingMatchesCount: rounds.reduce(
        (acc, r) => acc + Math.max(r.expectedMatchCount - r.matchCount, r.missingPositions.length),
        0
      ),
      collisionsCount: allIssues.filter((i) => i.code === 'slot_collision').length,
      criticalCount: allIssues.filter((i) => i.severity === 'critical').length,
      warningCount: allIssues.filter((i) => i.severity === 'warning').length,
    },
  };
}

export function buildMissingNextRoundMatchScaffold(params: {
  division: Division;
  roundName: string;
  roundOrder: number;
  bracketPosition: number;
  nextMatchId?: string | null;
  nextMatchSlot?: 'A' | 'B' | null;
  published: boolean;
  now?: string;
}): Match {
  const ts = params.now || new Date().toISOString();
  return {
    id: makeId('ko'),
    tournamentId: params.division.tournamentId,
    divisionId: params.division.id,
    matchdayId: null,
    phase: 'eliminacion',
    roundName: params.roundName,
    roundOrder: params.roundOrder,
    bracketPosition: params.bracketPosition,
    nextMatchId: params.nextMatchId || null,
    nextMatchSlot: params.nextMatchSlot || null,
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
    published: params.published,
    createdAt: ts,
    updatedAt: ts,
  };
}

export interface BracketAutoRepairResult {
  createdMatches: Match[];
  updatedMatches: Match[];
  allAffectedMatches: Match[];
  reconcileResult: KnockoutReconcileResult;
}

export function repairEliminationBracketWithMissingScaffolds(
  divisionMatches: Match[],
  division: Division,
  fallbackEntries: Registration[]
): BracketAutoRepairResult {
  const now = new Date().toISOString();
  const nonKo = divisionMatches.filter(
    (m) => m.divisionId === division.id && m.phase !== 'eliminacion'
  );
  const koMatches = dedupeMatches(
    divisionMatches.filter((m) => m.divisionId === division.id && m.phase === 'eliminacion')
  );
  const shouldBePublished =
    division.drawStatus === 'publicado' || koMatches.some((m) => m.published);

  const nonThirdKo = koMatches
    .filter((m) => !m.isThirdPlace && m.roundName !== 'Tercer Puesto')
    .sort(compareMatchesByRound);
  const thirdPlaceMatches = koMatches.filter(
    (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
  );

  if (nonThirdKo.length === 0) {
    const emptyReconcile = reconcileKnockoutBracket(divisionMatches, division, fallbackEntries);
    return {
      createdMatches: [],
      updatedMatches: emptyReconcile.updatedMatches,
      allAffectedMatches: emptyReconcile.updatedMatches,
      reconcileResult: emptyReconcile,
    };
  }

  const roundsMap = new Map<string, Match[]>();
  for (const m of nonThirdKo) {
    const key = m.roundName.trim().toLowerCase() || `r${m.roundOrder}`;
    const list = roundsMap.get(key);
    if (list) list.push(m);
    else roundsMap.set(key, [m]);
  }

  const sortedRoundGroups = Array.from(roundsMap.values()).sort((a, b) => {
    const nameA = a[0].roundName;
    const nameB = b[0].roundName;
    if (isKnownKnockoutStage(nameA) && isKnownKnockoutStage(nameB)) {
      const rankDiff = getKnockoutStageRank(nameA) - getKnockoutStageRank(nameB);
      if (rankDiff !== 0) return rankDiff;
    }
    return a[0].roundOrder - b[0].roundOrder;
  });

  const createdMatches: Match[] = [];
  const workingGroups: Match[][] = sortedRoundGroups.map((g) => [...g]);

  // Recorrer de ronda temprana hacia la Final asegurando llaves suficientes en la ronda siguiente
  let rIdx = 0;
  while (rIdx < workingGroups.length) {
    const currGroup = workingGroups[rIdx];
    const currStage = currGroup[0];
    const isSingleFinal = currGroup.length === 1 && isRealFinalMatch(currStage, workingGroups.flat());
    if (isSingleFinal) break;

    const maxCurrPos = Math.max(
      currGroup.length,
      ...currGroup.map((m) => m.bracketPosition || 0)
    );
    const expectedNextCount = Math.max(1, Math.ceil(maxCurrPos / 2));

    let nextGroup = workingGroups[rIdx + 1];
    const nextRoundName =
      nextGroup?.[0]?.roundName || getExpectedNextRoundName(currStage.roundName, maxCurrPos);
    const nextRoundOrder =
      nextGroup?.[0]?.roundOrder || currStage.roundOrder + 1;

    if (!nextGroup) {
      nextGroup = [];
      workingGroups.push(nextGroup);
    }

    // Detectar qué posiciones 1..expectedNextCount ya están cubiertas (por bracketPosition o por enlace entrante)
    const occupiedNextPositions = new Set<number>();
    const nextGroupById = new Map(nextGroup.map((nm) => [nm.id, nm]));
    const inferredPosByNextId = new Map<string, number>();

    currGroup.forEach((cm, idx) => {
      if (cm.nextMatchId && nextGroupById.has(cm.nextMatchId)) {
        const cmPos = cm.bracketPosition && cm.bracketPosition >= 1 ? cm.bracketPosition : idx + 1;
        inferredPosByNextId.set(cm.nextMatchId, Math.ceil(cmPos / 2));
      }
    });

    nextGroup.forEach((nm, idx) => {
      const p =
        nm.bracketPosition && nm.bracketPosition >= 1
          ? nm.bracketPosition
          : inferredPosByNextId.get(nm.id) || idx + 1;
      occupiedNextPositions.add(p);
    });

    for (let pos = 1; pos <= expectedNextCount; pos++) {
      if (occupiedNextPositions.has(pos)) continue;
      const scaffold = buildMissingNextRoundMatchScaffold({
        division,
        roundName: nextRoundName,
        roundOrder: nextRoundOrder,
        bracketPosition: pos,
        published: shouldBePublished,
        now,
      });
      createdMatches.push(scaffold);
      nextGroup.push(scaffold);
      occupiedNextPositions.add(pos);
    }

    nextGroup.sort(
      (a, b) =>
        (a.bracketPosition ?? 9999) - (b.bracketPosition ?? 9999) ||
        (a.createdAt || '').localeCompare(b.createdAt || '') ||
        a.id.localeCompare(b.id)
    );

    rIdx++;
  }

  const combinedInput = [
    ...nonKo,
    ...workingGroups.flat(),
    ...thirdPlaceMatches,
  ];
  const reconcileResult = reconcileKnockoutBracket(combinedInput, division, fallbackEntries);

  const createdIdSet = new Set(createdMatches.map((m) => m.id));
  const reconciledById = new Map(reconcileResult.updatedMatches.map((m) => [m.id, m]));

  // Si reconcileKnockoutBracket modificó alguno de los partidos recién creados, usar la versión reconciliada
  const finalCreated = createdMatches.map((cm) => reconciledById.get(cm.id) || cm);
  const finalUpdated = reconcileResult.updatedMatches.filter((m) => !createdIdSet.has(m.id));
  const allAffectedMatches = [...finalCreated, ...finalUpdated];

  return {
    createdMatches: finalCreated,
    updatedMatches: finalUpdated,
    allAffectedMatches,
    reconcileResult,
  };
}


