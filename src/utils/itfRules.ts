import { ItfScoringConfig, MatchStatus, SetScore } from '../types/tennis';

export const ITF_EDITION_LABEL = 'ITF Rules of Tennis 2026';

export interface ItfReferenceSection {
  id: string;
  code: string;
  title: string;
  summary: string;
  details: string[];
}

export const ITF_REFERENCE_GUIDE: ItfReferenceSection[] = [
  {
    id: 'scoring-game',
    code: 'Sección I · Juegos',
    title: 'Puntuación estándar y Punto Decisivo (Sin Ventaja)',
    summary: 'Modalidades de definición en 40-40 según el reglamento de la división.',
    details: [
      'Sistema Tradicional (Con Ventaja): en 40 iguales se requiere diferencia de dos puntos consecutivos (Ventaja / Juego).',
      'Sistema Sin Ventaja (No-Ad): en 40 iguales se disputa un único punto decisivo; el restador elige el lado de recepción en Singles, y la pareja restadora decide en Dobles.',
    ],
  },
  {
    id: 'scoring-set',
    code: 'Sección II · Sets y Tie-Break',
    title: 'Formato de Set con Tie-Break y Set Corto',
    summary: 'Reglas para sets de 6 games, Fast4 (4 games) y Pro-Set (8 games).',
    details: [
      'Set de Tie-Break (estándar 6 games): gana quien alcanza 6 games con al menos 2 de ventaja. Con 6-6 se juega tie-break a 7 puntos (diferencia mínima de 2).',
      'Set de Ventaja (sin tie-break): el set continúa hasta lograr 2 games de ventaja (ej. 8-6, 10-8).',
      'Set Corto (4 games): con 3-3 o 4-4 según configuración se disputa tie-break decisivo.',
    ],
  },
  {
    id: 'match-tiebreak',
    code: 'Sección III · Set Decisivo y Tie-Break a 10',
    title: 'Tie-Break a 10 puntos y Match Tie-Break',
    summary: 'Sistema alternativo a 10 puntos (ej. 10-3, 10-1) para tie-break de set, set decisivo o partido directo.',
    details: [
      'Cada división puede configurar tie-break de set a 7 o a 10 puntos, y optar por diferencia mínima de 2 o "el que llegue primero" (ej. 10-9).',
      'Cuando está habilitado en al mejor de 3 sets y el marcador queda 1-1 en sets, el tercer parcial se define mediante un Match Tie-Break a 10 puntos (o directo si el formato es partido único a 10).',
      'En estadísticas y diferencia de sets, el Match Tie-Break cuenta como 1 set ganado y 1 game para el ganador.',
    ],
  },
  {
    id: 'exceptions',
    code: 'Sección IV · Incidencias',
    title: 'Walkover (WO), Retiro (RET) y Descalificación (DQ)',
    summary: 'Registro oficial de incidencias y conservación de marcadores parciales.',
    details: [
      'Walkover (WO): ausencia o incomparecencia previa al inicio. No registra games disputados; otorga victoria directa al presente.',
      'Retiro (RET): abandono por lesión o fuerza mayor con el partido iniciado. Se conserva el marcador exacto hasta el momento del retiro.',
      'Descalificación (DQ): pérdida del partido por infracción reglamentaria; se conserva el marcador parcial disputado.',
    ],
  },
];

export interface ScoreValidationResult {
  valid: boolean;
  error?: string;
  winnerSide: 'A' | 'B' | null;
  winnerEntryId: string | null;
  winnerName: string | null;
  setsWonA: number;
  setsWonB: number;
}

export function formatSetScore(set: SetScore): string {
  if (set.isMatchTiebreak) {
    return `[${set.a}-${set.b}]`;
  }
  const base = `${set.a}-${set.b}`;
  if (
    set.tbA !== undefined &&
    set.tbA !== null &&
    set.tbB !== undefined &&
    set.tbB !== null
  ) {
    const hiTb = Math.max(set.tbA, set.tbB);
    const loTb = Math.min(set.tbA, set.tbB);
    if (hiTb >= 10 && (hiTb - loTb > 2 || loTb === 9)) {
      const winnerFirst = set.a >= set.b ? `${set.tbA}-${set.tbB}` : `${set.tbB}-${set.tbA}`;
      return `${base}(${winnerFirst})`;
    }
    const loserTb = set.a > set.b ? set.tbB : set.tbA;
    return `${base}(${loserTb})`;
  }
  return base;
}

function isValidTiebreakPoints(
  a: number,
  b: number,
  target: number,
  firstToTarget: boolean
): boolean {
  if (a < 0 || b < 0 || a === b) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (firstToTarget) {
    return hi === target || (hi > target && hi - lo === 2);
  }
  return (hi === target && hi - lo >= 2) || (hi > target && hi - lo === 2);
}

export function formatScoreString(sets: SetScore[], status: MatchStatus): string {
  const scoreTxt = sets.map(formatSetScore).join(' ');
  if (status === 'wo') return scoreTxt ? `WO (${scoreTxt})` : 'WO';
  if (status === 'retiro') return scoreTxt ? `${scoreTxt} RET` : 'RET';
  if (status === 'descalificado') return scoreTxt ? `${scoreTxt} DQ` : 'DQ';
  if (status === 'finalizado' && !scoreTxt) return 'Finalizado (sin sets)';
  return scoreTxt || '—';
}

export function validateAndDetermineWinner(
  sets: SetScore[],
  status: MatchStatus,
  incidentWinnerSide: 'A' | 'B' | null,
  config: ItfScoringConfig,
  entryAId: string | null | undefined,
  entryAName: string,
  entryBId: string | null | undefined,
  entryBName: string,
  allowOptionalSetsOverride = false
): ScoreValidationResult {
  if (status === 'wo' || status === 'retiro' || status === 'descalificado') {
    if (!incidentWinnerSide) {
      return {
        valid: false,
        error: 'Seleccioná el participante ganador por WO, retiro o descalificación.',
        winnerSide: null,
        winnerEntryId: null,
        winnerName: null,
        setsWonA: 0,
        setsWonB: 0,
      };
    }
    if (status === 'wo' && sets.length > 0) {
      return {
        valid: false,
        error: 'Un Walkover (WO) no debe registrar sets disputados.',
        winnerSide: null,
        winnerEntryId: null,
        winnerName: null,
        setsWonA: 0,
        setsWonB: 0,
      };
    }
    const winnerEntryId = incidentWinnerSide === 'A' ? entryAId || null : entryBId || null;
    const winnerName = incidentWinnerSide === 'A' ? entryAName : entryBName;
    return {
      valid: true,
      winnerSide: incidentWinnerSide,
      winnerEntryId,
      winnerName,
      setsWonA: sets.filter((s) => s.a > s.b).length,
      setsWonB: sets.filter((s) => s.b > s.a).length,
    };
  }

  if (status !== 'finalizado') {
    return {
      valid: true,
      winnerSide: null,
      winnerEntryId: null,
      winnerName: null,
      setsWonA: 0,
      setsWonB: 0,
    };
  }

  const optionalSetsAllowed = Boolean(config.optionalSetScores || allowOptionalSetsOverride);

  if (sets.length === 0) {
    if (optionalSetsAllowed) {
      if (!incidentWinnerSide) {
        return {
          valid: false,
          error: 'Seleccioná el ganador oficial o cargá los puntajes por set.',
          winnerSide: null,
          winnerEntryId: null,
          winnerName: null,
          setsWonA: 0,
          setsWonB: 0,
        };
      }
      return {
        valid: true,
        winnerSide: incidentWinnerSide,
        winnerEntryId: incidentWinnerSide === 'A' ? entryAId || null : entryBId || null,
        winnerName: incidentWinnerSide === 'A' ? entryAName : entryBName,
        setsWonA: incidentWinnerSide === 'A' ? config.setsToWin : 0,
        setsWonB: incidentWinnerSide === 'B' ? config.setsToWin : 0,
      };
    }

    return {
      valid: false,
      error: 'Ingresá al menos un set o activá la opción de resultado sin puntaje por sets.',
      winnerSide: null,
      winnerEntryId: null,
      winnerName: null,
      setsWonA: 0,
      setsWonB: 0,
    };
  }

  const maxSets = config.setsToWin * 2 - 1;
  if (sets.length > maxSets) {
    return {
      valid: false,
      error: `Este formato admite un máximo de ${maxSets} sets.`,
      winnerSide: null,
      winnerEntryId: null,
      winnerName: null,
      setsWonA: 0,
      setsWonB: 0,
    };
  }

  let setsWonA = 0;
  let setsWonB = 0;
  const targetGames = config.gamesPerSet;
  const setTbTarget = config.setTiebreakPoints ?? 7;
  const firstToTarget = Boolean(config.tiebreakExactTarget);

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (setsWonA === config.setsToWin || setsWonB === config.setsToWin) {
      return {
        valid: false,
        error: `El partido ya había terminado en el set ${i}. Eliminá los sets sobrantes.`,
        winnerSide: null,
        winnerEntryId: null,
        winnerName: null,
        setsWonA,
        setsWonB,
      };
    }

    const isDecidingSet =
      config.setsToWin > 1 &&
      setsWonA === config.setsToWin - 1 &&
      setsWonB === config.setsToWin - 1;

    if (s.isMatchTiebreak) {
      const canUseMatchTb =
        Boolean(config.directTiebreakMatch) ||
        (config.matchTiebreakThirdSet && isDecidingSet) ||
        (config.setsToWin === 1 && sets.length === 1 && (config.matchTiebreakThirdSet || setTbTarget === 10));
      if (!canUseMatchTb) {
        return {
          valid: false,
          error: `El Match Tie-Break solo aplica en el set decisivo o si el formato admite Tie-Break directo (${config.edition}).`,
          winnerSide: null,
          winnerEntryId: null,
          winnerName: null,
          setsWonA,
          setsWonB,
        };
      }
      const minPts = config.directTiebreakMatch && setTbTarget === 10 ? 10 : config.matchTiebreakPoints;
      if (!isValidTiebreakPoints(s.a, s.b, minPts, firstToTarget)) {
        return {
          valid: false,
          error: firstToTarget
            ? `Tie-Break inválido en parcial ${i + 1}: gana el primero en llegar a ${minPts} puntos (ej. ${minPts}-3, ${minPts}-1, ${minPts}-${minPts - 1}).`
            : `Tie-Break inválido en parcial ${i + 1}: debe llegar al menos a ${minPts} puntos con diferencia de 2 (ej. ${minPts}-3, ${minPts}-1).`,
          winnerSide: null,
          winnerEntryId: null,
          winnerName: null,
          setsWonA,
          setsWonB,
        };
      }
      if (s.a > s.b) setsWonA++;
      else setsWonB++;
      continue;
    }

    const hi = Math.max(s.a, s.b);
    const lo = Math.min(s.a, s.b);

    if (s.a < 0 || s.b < 0 || s.a === s.b) {
      return {
        valid: false,
        error: `Set ${i + 1}: un set completado no puede finalizar empatado.`,
        winnerSide: null,
        winnerEntryId: null,
        winnerName: null,
        setsWonA,
        setsWonB,
      };
    }

    if (config.useTiebreak) {
      const tbScore = targetGames + 1; // e.g., 7 for 6-game set, 5 for Fast4
      const validNormal = hi === targetGames && lo <= targetGames - 2;
      const validExtra = hi === tbScore && (lo === targetGames - 1 || lo === targetGames);
      if (!validNormal && !validExtra) {
        return {
          valid: false,
          error: `Set ${i + 1} (${s.a}-${s.b}) no coincide con set a ${targetGames} games con tie-break.`,
          winnerSide: null,
          winnerEntryId: null,
          winnerName: null,
          setsWonA,
          setsWonB,
        };
      }
      // Si terminó en tiebreak (ej. 7-6 o 5-4 en Fast4 con tb en 4-4)
      if (hi === tbScore && lo === targetGames) {
        if (
          s.tbA !== undefined &&
          s.tbA !== null &&
          s.tbB !== undefined &&
          s.tbB !== null
        ) {
          if (!isValidTiebreakPoints(s.tbA, s.tbB, setTbTarget, firstToTarget)) {
            return {
              valid: false,
              error: firstToTarget
                ? `Puntos del tie-break inválidos en set ${i + 1}: gana quien llegue a ${setTbTarget} puntos (ej. ${setTbTarget}-3, ${setTbTarget}-1).`
                : `Puntos del tie-break inválidos en set ${i + 1}: se requiere llegar a ${setTbTarget} puntos con diferencia de 2 (ej. ${setTbTarget}-3, ${setTbTarget}-1).`,
              winnerSide: null,
              winnerEntryId: null,
              winnerName: null,
              setsWonA,
              setsWonB,
            };
          }
          const setWinnerA = s.a > s.b;
          const tbWinnerA = s.tbA > s.tbB;
          if (setWinnerA !== tbWinnerA) {
            return {
              valid: false,
              error: `El ganador del tie-break en el set ${i + 1} debe coincidir con el ganador del set.`,
              winnerSide: null,
              winnerEntryId: null,
              winnerName: null,
              setsWonA,
              setsWonB,
            };
          }
        }
      }
    } else {
      // Set de ventaja (sin tie-break): al menos targetGames y diferencia de 2 (o >= targetGames+1 con diff 2)
      const validAdv =
        (hi === targetGames && hi - lo >= 2) || (hi > targetGames && hi - lo === 2);
      if (!validAdv) {
        return {
          valid: false,
          error: `Set ${i + 1} sin tie-break debe finalizar con al menos ${targetGames} games y diferencia de 2.`,
          winnerSide: null,
          winnerEntryId: null,
          winnerName: null,
          setsWonA,
          setsWonB,
        };
      }
    }

    if (s.a > s.b) setsWonA++;
    else setsWonB++;
  }

  const isDirectSingleTb =
    Boolean(config.directTiebreakMatch) && sets.length === 1 && Boolean(sets[0]?.isMatchTiebreak);

  if (!isDirectSingleTb && setsWonA < config.setsToWin && setsWonB < config.setsToWin) {
    return {
      valid: false,
      error: `Faltan sets: el formato requiere ganar ${config.setsToWin} ${config.setsToWin === 1 ? 'set' : 'sets'}.`,
      winnerSide: null,
      winnerEntryId: null,
      winnerName: null,
      setsWonA,
      setsWonB,
    };
  }

  const winnerSide: 'A' | 'B' = setsWonA > setsWonB ? 'A' : 'B';
  return {
    valid: true,
    winnerSide,
    winnerEntryId: winnerSide === 'A' ? entryAId || null : entryBId || null,
    winnerName: winnerSide === 'A' ? entryAName : entryBName,
    setsWonA,
    setsWonB,
  };
}
