import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Edit3,
  Filter,
  History,
  Medal,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  CorrectionRecord,
  Division,
  Group,
  Match,
  MatchStatus,
  PlayerPublic,
  Registration,
  SetScore,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import { formatScoreString, validateAndDetermineWinner } from '../../utils/itfRules';
import {
  analyzeDuplicateMatches,
  compareMatchesByRound,
  computeGroupStandings,
  computeKnockoutPodiumUpdate,
  computePlayerStatsFromMatches,
  computeQualifiedSeededEntries,
  dedupeMatches,
  findAffectedDownstreamMatches,
  findUnpropagatedKnockoutMatches,
  generateKnockoutBracket,
  getKnockoutStageRank,
  isRealFinalMatch,
  makeId,
  reconcileKnockoutBracket,
  resolveNextKnockoutMatch,
} from '../../utils/tournamentEngine';
import {
  deleteMatchesBatch,
  formatFirestoreError,
  publishNotificationAndBroadcast,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';
import { buildMatchWhatsAppMessage } from '../../utils/whatsappShare';
import { WhatsAppShareButton } from '../WhatsAppShareButton';

interface Props {
  tournament: Tournament;
  division: Division;
  divisions?: Division[];
  onSelectDivision?: (id: string) => void;
  divisionMatches: Match[];
  tournamentMatches?: Match[];
  allMatches: Match[];
  allDivisions: Division[];
  divisionGroups: Group[];
  allGroups?: Group[];
  divisionRegistrations: Registration[];
  allRegistrations: Registration[];
  players: PlayerPublic[];
  userEmail: string;
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
  canOpenUsersTab?: boolean;
  onOpenUsersTab?: () => void;
}

export const AdminScoringAndRolesSection: React.FC<Props> = ({
  tournament,
  division,
  divisions,
  onSelectDivision,
  divisionMatches,
  tournamentMatches,
  allMatches,
  allDivisions,
  divisionGroups,
  allGroups,
  divisionRegistrations,
  allRegistrations,
  players,
  userEmail,
  isSuperAdmin,
  permissions,
  canOpenUsersTab,
  onOpenUsersTab,
}) => {
  const canEdit = permissions ? permissions.canEdit : true;
  const canDelete = permissions ? (permissions.canDelete || isSuperAdmin) : isSuperAdmin;
  const canGenerateFinalBracket = permissions
    ? (permissions.manageDraws || permissions.manageTournaments || permissions.manageScoring) &&
      (permissions.canCreate || permissions.canEdit)
    : canEdit;

  // Filtros estrictos por Categoría / División, Fase, Ronda/Grupo, Estado y Jugador
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | 'grupos' | 'eliminacion'>('ALL');
  const [roundFilter, setRoundFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'finished'>('ALL');
  const [playerSearch, setPlayerSearch] = useState<string>('');

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [status, setStatus] = useState<MatchStatus>('finalizado');
  const [sets, setSets] = useState<SetScore[]>([
    { a: 6, b: 4 },
    { a: 6, b: 3 },
  ]);
  const [incidentWinnerSide, setIncidentWinnerSide] = useState<'A' | 'B' | null>(null);
  const [includeSetScores, setIncludeSetScores] = useState<boolean>(
    !division.itfConfig.optionalSetScores
  );
  const [outcomeNote, setOutcomeNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // Modal de confirmación si corrección afecta cruces ya programados o disputados
  const [pendingAffectedMatches, setPendingAffectedMatches] = useState<Match[] | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeleteMatchId, setConfirmDeleteMatchId] = useState<string | null>(null);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [generatingFinalBracket, setGeneratingFinalBracket] = useState(false);
  const [refreshingBrackets, setRefreshingBrackets] = useState(false);
  const [editingKoSlotMatchId, setEditingKoSlotMatchId] = useState<string | null>(null);
  const [manualSlotEntryAId, setManualSlotEntryAId] = useState<string>('');
  const [manualSlotEntryBId, setManualSlotEntryBId] = useState<string>('');
  const [savingKoSlot, setSavingKoSlot] = useState(false);

  const tournamentDivisions = useMemo(() => {
    if (divisions && divisions.length > 0) return divisions;
    return allDivisions.filter((d) => d.tournamentId === tournament.id);
  }, [divisions, allDivisions, tournament.id]);

  const categoriesList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    tournamentDivisions.forEach((d) => {
      if (d.category && !seen.has(d.category)) {
        seen.add(d.category);
        list.push(d.category);
      }
    });
    return list;
  }, [tournamentDivisions]);

  const filteredDivisionChips = useMemo(() => {
    if (selectedCategoryFilter === 'ALL') return tournamentDivisions;
    const matchesCat = tournamentDivisions.filter((d) => d.category === selectedCategoryFilter);
    return matchesCat.length > 0 ? matchesCat : tournamentDivisions;
  }, [tournamentDivisions, selectedCategoryFilter]);

  const divisionMatchCounts = useMemo(() => {
    const source = tournamentMatches || allMatches.filter((m) => m.tournamentId === tournament.id);
    const map = new Map<string, { total: number; pending: number; unpropagated: number }>();
    tournamentDivisions.forEach((d) => {
      const divAll = dedupeMatches(source.filter((m) => m.divisionId === d.id));
      const playable = divAll.filter((m) => !m.isBye && m.entryAId && m.entryBId);
      const pending = playable.filter((m) => !m.winnerEntryId).length;
      const unpropagated = findUnpropagatedKnockoutMatches(divAll, d).length;
      map.set(d.id, { total: playable.length, pending, unpropagated });
    });
    return map;
  }, [tournamentMatches, allMatches, tournament.id, tournamentDivisions]);

  // Partidos estrictamente de la división activa, deduplicados para no mezclar ni duplicar cruces
  const rawDivisionMatches = useMemo(
    () => divisionMatches.filter((m) => m.divisionId === division.id),
    [divisionMatches, division.id]
  );

  const duplicateAnalysis = useMemo(
    () => analyzeDuplicateMatches(rawDivisionMatches),
    [rawDivisionMatches]
  );

  const duplicateIdSet = useMemo(
    () => new Set(duplicateAnalysis.duplicateMatches.map((m) => m.id)),
    [duplicateAnalysis]
  );

  const dedupedDivisionMatches = useMemo(
    () => [...duplicateAnalysis.dedupedMatches].sort(compareMatchesByRound),
    [duplicateAnalysis]
  );

  const allPlayableMatches = useMemo(
    () =>
      dedupedDivisionMatches
        .filter((m) => !m.isBye && m.entryAId && m.entryBId)
        .sort(compareMatchesByRound),
    [dedupedDivisionMatches]
  );

  const hasGroupsPhase = useMemo(
    () => allPlayableMatches.some((m) => m.phase === 'grupos') || divisionGroups.length > 0,
    [allPlayableMatches, divisionGroups.length]
  );

  const hasEliminationPhase = useMemo(
    () => dedupedDivisionMatches.some((m) => m.phase === 'eliminacion'),
    [dedupedDivisionMatches]
  );

  const roundFilterOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    if (phaseFilter === 'ALL' || phaseFilter === 'grupos') {
      const sortedGroups = [...divisionGroups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      sortedGroups.forEach((g) => {
        opts.push({ value: `group:${g.id}`, label: g.name });
      });
    }
    if (phaseFilter === 'ALL' || phaseFilter === 'eliminacion') {
      const seenRounds = new Set<string>();
      allPlayableMatches
        .filter((m) => m.phase === 'eliminacion')
        .sort(compareMatchesByRound)
        .forEach((m) => {
          if (!seenRounds.has(m.roundName)) {
            seenRounds.add(m.roundName);
            opts.push({ value: `round:${m.roundName}`, label: m.roundName });
          }
        });
    }
    return opts;
  }, [divisionGroups, allPlayableMatches, phaseFilter]);

  const playableMatches = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return allPlayableMatches.filter((m) => {
      if (phaseFilter !== 'ALL' && m.phase !== phaseFilter) return false;
      if (roundFilter !== 'ALL') {
        if (roundFilter.startsWith('group:')) {
          const gid = roundFilter.slice('group:'.length);
          const targetGroup = divisionGroups.find((g) => g.id === gid);
          const matchesGroupId = m.groupId === gid;
          const matchesByEntries = Boolean(
            targetGroup &&
              m.phase === 'grupos' &&
              m.entryAId &&
              m.entryBId &&
              targetGroup.entryIds.includes(m.entryAId) &&
              targetGroup.entryIds.includes(m.entryBId)
          );
          if (!matchesGroupId && !matchesByEntries) return false;
        } else if (roundFilter.startsWith('round:')) {
          const rName = roundFilter.slice('round:'.length);
          if (m.roundName !== rName) return false;
        }
      }
      if (statusFilter === 'pending' && Boolean(m.winnerEntryId)) return false;
      if (statusFilter === 'finished' && !m.winnerEntryId) return false;
      if (
        q &&
        !m.entryAName.toLowerCase().includes(q) &&
        !m.entryBName.toLowerCase().includes(q) &&
        !m.roundName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allPlayableMatches, phaseFilter, roundFilter, statusFilter, playerSearch, divisionGroups]);

  const activeMatch =
    playableMatches.find((m) => m.id === selectedMatchId) || playableMatches[0] || null;

  const syncEditorFromMatch = (m: Match | null) => {
    if (!m) return;
    setPendingAffectedMatches(null);
    const nextStatus =
      m.status === 'programado' || m.status === 'reprogramado' ? 'finalizado' : m.status;
    setStatus(nextStatus);
    const hasExistingSets = m.sets.length > 0;
    const defaultIncludeSets = m.winnerEntryId
      ? hasExistingSets
      : !division.itfConfig.optionalSetScores;
    setIncludeSetScores(defaultIncludeSets);
    setSets(
      hasExistingSets
        ? m.sets
        : division.itfConfig.directTiebreakMatch
        ? [{ a: 10, b: 3, isMatchTiebreak: true }]
        : [
            { a: 6, b: 4 },
            { a: 6, b: 4 },
          ]
    );
    setIncidentWinnerSide(
      m.winnerEntryId ? (m.winnerEntryId === m.entryAId ? 'A' : 'B') : null
    );
    setOutcomeNote(m.outcomeNote || '');
    setCorrectionReason('');
  };

  // Al cambiar de categoría/división, limpiar subfiltros y cargar el primer partido pendiente (o el primero)
  useEffect(() => {
    if (selectedCategoryFilter !== 'ALL' && division.category !== selectedCategoryFilter) {
      setSelectedCategoryFilter('ALL');
    }
    setPhaseFilter('ALL');
    setRoundFilter('ALL');
    setStatusFilter('ALL');
    setPlayerSearch('');
    setErrorMsg(null);
    setFeedback(null);
    setPendingAffectedMatches(null);
    setConfirmDeleteMatchId(null);
    setEditingKoSlotMatchId(null);
    const firstPending = allPlayableMatches.find((m) => !m.winnerEntryId) || allPlayableMatches[0];
    setSelectedMatchId(firstPending?.id || '');
    if (firstPending) {
      syncEditorFromMatch(firstPending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division.id]);

  // Mantener sincronizado el editor cada vez que cambia el partido activo (p. ej. al filtrar o en carga inicial)
  useEffect(() => {
    if (activeMatch) {
      syncEditorFromMatch(activeMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch?.id]);

  const loadMatchIntoEditor = (m: Match) => {
    setSelectedMatchId(m.id);
    setErrorMsg(null);
    setFeedback(null);
    syncEditorFromMatch(m);
  };

  const effectiveSets = status === 'finalizado' && !includeSetScores ? [] : sets;
  const optionalSetsAllowedForMatch = !includeSetScores || Boolean(division.itfConfig.optionalSetScores);

  const liveValidation = useMemo(() => {
    if (!activeMatch) return null;
    return validateAndDetermineWinner(
      effectiveSets,
      status,
      incidentWinnerSide,
      division.itfConfig,
      activeMatch.entryAId,
      activeMatch.entryAName,
      activeMatch.entryBId,
      activeMatch.entryBName,
      optionalSetsAllowedForMatch
    );
  }, [
    activeMatch,
    effectiveSets,
    status,
    incidentWinnerSide,
    division.itfConfig,
    optionalSetsAllowedForMatch,
  ]);

  // Cálculos en vivo para la vista integrada de Grupos, Cruces y Cuadro Eliminatorio
  const liveGroupsWithDetails = useMemo(() => {
    return [...divisionGroups]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((grp) => {
        const liveStandings = computeGroupStandings(
          grp,
          dedupedDivisionMatches,
          divisionRegistrations,
          division
        );
        const grpMatches = dedupedDivisionMatches
          .filter(
            (m) =>
              m.phase === 'grupos' &&
              (m.groupId === grp.id ||
                (m.entryAId &&
                  m.entryBId &&
                  grp.entryIds.includes(m.entryAId) &&
                  grp.entryIds.includes(m.entryBId)))
          )
          .sort(compareMatchesByRound);
        return { group: grp, standings: liveStandings, matches: grpMatches };
      });
  }, [divisionGroups, dedupedDivisionMatches, divisionRegistrations, division]);

  const liveQualifiers = useMemo(() => {
    return computeQualifiedSeededEntries(
      divisionGroups,
      dedupedDivisionMatches,
      divisionRegistrations,
      division
    );
  }, [divisionGroups, dedupedDivisionMatches, divisionRegistrations, division]);

  const knockoutRounds = useMemo(() => {
    const ko = dedupedDivisionMatches.filter(
      (m) => m.phase === 'eliminacion' && !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
    );
    const grouped = new Map<string, { roundOrder: number; roundName: string; matches: Match[] }>();
    ko.forEach((m) => {
      const key = m.roundName.trim().toLowerCase() || `r${m.roundOrder}`;
      if (!grouped.has(key)) {
        grouped.set(key, { roundOrder: m.roundOrder, roundName: m.roundName, matches: [] });
      } else {
        const entry = grouped.get(key)!;
        if (m.roundOrder < entry.roundOrder) entry.roundOrder = m.roundOrder;
      }
      grouped.get(key)!.matches.push(m);
    });
    return Array.from(grouped.values())
      .sort((a, b) => {
        const rankDiff = getKnockoutStageRank(a.roundName) - getKnockoutStageRank(b.roundName);
        if (rankDiff !== 0) return rankDiff;
        return a.roundOrder - b.roundOrder;
      })
      .map((val) => ({
        roundName: val.roundName,
        matches: val.matches.sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0)),
      }));
  }, [dedupedDivisionMatches]);

  const thirdPlaceMatch = useMemo(
    () =>
      dedupedDivisionMatches.find(
        (m) => m.phase === 'eliminacion' && (m.isThirdPlace || m.roundName === 'Tercer Puesto')
      ) || null,
    [dedupedDivisionMatches]
  );

  const projectedFinalMatches = useMemo(() => {
    if (
      division.format !== 'grupos_y_final' ||
      knockoutRounds.length > 0 ||
      liveQualifiers.length < 2
    ) {
      return [];
    }
    return generateKnockoutBracket(liveQualifiers, division, 10).filter(
      (m) => m.roundOrder === 10 && !m.isThirdPlace
    );
  }, [division, knockoutRounds.length, liveQualifiers]);

  const handleGenerateAndPublishFinalBracket = async () => {
    if (!canGenerateFinalBracket || generatingFinalBracket || liveQualifiers.length < 2) return;
    setGeneratingFinalBracket(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const existingKoMatches = rawDivisionMatches.filter((m) => m.phase === 'eliminacion');
      let koMatches = generateKnockoutBracket(liveQualifiers, division, 10);

      if (canDelete && existingKoMatches.length > 0) {
        await deleteMatchesBatch(existingKoMatches.map((m) => m.id));
      } else if (existingKoMatches.length > 0) {
        const usedIds = new Set<string>();
        const idRemap = new Map<string, string>();
        const unplayedPool = existingKoMatches.filter(
          (m) => !m.winnerEntryId && m.sets.length === 0
        );
        for (const km of koMatches) {
          const candidate = unplayedPool.find(
            (em) =>
              !usedIds.has(em.id) &&
              em.roundOrder === km.roundOrder &&
              em.bracketPosition === km.bracketPosition &&
              Boolean(em.isThirdPlace) === Boolean(km.isThirdPlace)
          );
          if (candidate) {
            usedIds.add(candidate.id);
            idRemap.set(km.id, candidate.id);
          }
        }
        if (idRemap.size > 0) {
          koMatches = koMatches.map((km) => {
            const targetId = idRemap.get(km.id) || km.id;
            const prevDoc = existingKoMatches.find((em) => em.id === targetId);
            return {
              ...km,
              id: targetId,
              nextMatchId: km.nextMatchId ? idRemap.get(km.nextMatchId) || km.nextMatchId : null,
              createdAt: prevDoc?.createdAt || km.createdAt,
            };
          });
        }
      }

      for (const m of koMatches) {
        await saveEntity('matches', {
          ...m,
          published: true,
          updatedAt: now,
        });
      }
      if (division.drawStatus !== 'publicado') {
        await saveEntity('divisions', {
          ...division,
          drawStatus: 'publicado',
          updatedAt: now,
        });
      }
      setFeedback(
        `Cuadro Final de ${division.name} generado y publicado con ${liveQualifiers.length} clasificados.`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo generar el cuadro final desde grupos.'));
    } finally {
      setGeneratingFinalBracket(false);
    }
  };

  const divisionCategoryEntries = useMemo(() => {
    const base = divisionRegistrations.filter(
      (r) => r.divisionId === division.id && r.status !== 'retirada'
    );
    const qualIds = new Set(liveQualifiers.map((q) => q.id));
    return [...base].sort((a, b) => {
      const qa = qualIds.has(a.id) ? 0 : 1;
      const qb = qualIds.has(b.id) ? 0 : 1;
      if (qa !== qb) return qa - qb;
      if ((a.seed ?? 999) !== (b.seed ?? 999)) return (a.seed ?? 999) - (b.seed ?? 999);
      return a.displayName.localeCompare(b.displayName, 'es');
    });
  }, [divisionRegistrations, division.id, liveQualifiers]);

  const confirmedDivisionEntries = useMemo(
    () => divisionCategoryEntries.filter((r) => r.status === 'confirmada'),
    [divisionCategoryEntries]
  );

  const pendingKoSlotMatches = useMemo(
    () =>
      dedupedDivisionMatches.filter(
        (m) => m.phase === 'eliminacion' && !m.isBye && (!m.entryAId || !m.entryBId)
      ),
    [dedupedDivisionMatches]
  );

  const unpropagatedMatches = useMemo(
    () => findUnpropagatedKnockoutMatches(dedupedDivisionMatches, division),
    [dedupedDivisionMatches, division]
  );

  const tournamentUnpropagatedSummary = useMemo(() => {
    const affectedDivisions: Array<{ division: Division; count: number }> = [];
    let total = 0;
    for (const d of tournamentDivisions) {
      const counts = divisionMatchCounts.get(d.id);
      if (counts && counts.unpropagated > 0) {
        total += counts.unpropagated;
        affectedDivisions.push({ division: d, count: counts.unpropagated });
      }
    }
    return { total, affectedDivisions };
  }, [tournamentDivisions, divisionMatchCounts]);

  const reconcileSingleDivisionInDb = async (
    targetDiv: Division,
    targetRawMatches: Match[],
    targetGroups: Group[],
    targetRegistrations: Registration[],
    now: string
  ) => {
    const targetDeduped = dedupeMatches(targetRawMatches);

    // 1. Re-sincronizar tablas de grupo si existen
    for (const grp of targetGroups) {
      const recalculated = computeGroupStandings(
        grp,
        targetDeduped,
        targetRegistrations,
        targetDiv
      );
      const prevSig = JSON.stringify(
        grp.standings.map((s) => `${s.entryId}:${s.points}:${s.won}:${s.gamesDiff}`)
      );
      const nextSig = JSON.stringify(
        recalculated.map((s) => `${s.entryId}:${s.points}:${s.won}:${s.gamesDiff}`)
      );
      if (prevSig !== nextSig) {
        await saveEntity('groups', {
          ...grp,
          standings: recalculated,
          published: true,
          updatedAt: now,
        });
      }
    }

    // 2. Reconciliar cuadro eliminatorio completo (links, colisiones, ganadores pendientes, BYEs)
    const qualifiers =
      targetDiv.format === 'grupos_y_final' && targetGroups.length > 0
        ? computeQualifiedSeededEntries(targetGroups, targetDeduped, targetRegistrations, targetDiv)
        : [];
    const confirmedInTarget = targetRegistrations.filter((r) => r.status === 'confirmada');
    const fallbackPool = qualifiers.length > 0 ? qualifiers : confirmedInTarget;

    const res = reconcileKnockoutBracket(targetDeduped, targetDiv, fallbackPool);
    for (const m of res.updatedMatches) {
      await saveEntity('matches', { ...m, updatedAt: now });
    }

    // 3. Limpiar llaves vacías heredadas en Ronda 1 si corresponde
    let removedEmptyCount = 0;
    const koOnly = targetDeduped.filter((m) => m.phase === 'eliminacion' && !m.isThirdPlace);
    if (canDelete && res.emptyMatchIds.length > 0 && koOnly.length > 0) {
      const minRo = Math.min(...koOnly.map((m) => m.roundOrder));
      const emptyR1Ids = targetDeduped
        .filter(
          (m) =>
            res.emptyMatchIds.includes(m.id) &&
            m.roundOrder === minRo &&
            !m.winnerEntryId &&
            m.sets.length === 0
        )
        .map((m) => m.id);
      if (emptyR1Ids.length > 0) {
        await deleteMatchesBatch(emptyR1Ids);
        removedEmptyCount = emptyR1Ids.length;
      }
    }

    // 4. Sincronizar podio (Campeón / Vicecampeón / 3er Puesto) si la Final o 3er Puesto ya tienen ganador
    const updatedMap = new Map(res.updatedMatches.map((m) => [m.id, m]));
    const afterMatches = targetDeduped.map((m) => updatedMap.get(m.id) || m);
    const podiumPatch = computeKnockoutPodiumUpdate(targetDiv, afterMatches);
    if (podiumPatch) {
      await saveEntity('divisions', {
        ...targetDiv,
        ...podiumPatch,
        updatedAt: now,
      });
    }

    return {
      res,
      removedEmptyCount,
      podiumUpdated: Boolean(podiumPatch),
    };
  };

  const handleRefreshKnockoutBrackets = async () => {
    if (!canEdit || refreshingBrackets) return;
    setRefreshingBrackets(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const { res, removedEmptyCount, podiumUpdated } = await reconcileSingleDivisionInDb(
        division,
        rawDivisionMatches,
        divisionGroups,
        divisionRegistrations,
        now
      );

      if (res.updatedMatches.length > 0 || removedEmptyCount > 0 || podiumUpdated) {
        const details: string[] = [];
        if (res.propagatedWinners > 0) details.push(`${res.propagatedWinners} avances de ronda`);
        if (res.repairedLinks > 0) details.push(`${res.repairedLinks} enlaces reparados`);
        if (res.filledSlots > 0) details.push(`${res.filledSlots} cupos completados`);
        if (removedEmptyCount > 0) details.push(`${removedEmptyCount} llaves vacías depuradas`);
        if (podiumUpdated) details.push('podio actualizado');
        setFeedback(
          `Cruces de ${division.name} actualizados (${res.updatedMatches.length} llaves sincronizadas${
            details.length > 0 ? `: ${details.join(', ')}` : ''
          }).${
            res.pendingSlotMatches.length > 0
              ? ` Quedan ${res.pendingSlotMatches.length} llaves esperando partido previo.`
              : ''
          }`
        );
      } else if (res.pendingSlotMatches.length > 0) {
        setFeedback(
          `Todos los resultados disponibles de ${division.name} ya pasaron de ronda. Quedan ${res.pendingSlotMatches.length} llaves esperando que finalice su cruce previo.`
        );
      } else {
        setFeedback(`Todos los cruces de ${division.name} están 100% actualizados y completos.`);
      }
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudieron actualizar los cruces del cuadro.'));
    } finally {
      setRefreshingBrackets(false);
    }
  };

  const handleRefreshAllTournamentBrackets = async () => {
    if (!canEdit || refreshingBrackets) return;
    setRefreshingBrackets(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const sourceMatches =
        tournamentMatches || allMatches.filter((m) => m.tournamentId === tournament.id);
      const sourceGroups = allGroups || divisionGroups;

      let totalMatchesUpdated = 0;
      let totalPropagated = 0;
      let totalRepaired = 0;
      let totalEmptyRemoved = 0;
      const updatedDivNames: string[] = [];

      for (const div of tournamentDivisions) {
        const divMatches = sourceMatches.filter((m) => m.divisionId === div.id);
        const divGroups = sourceGroups.filter((g) => g.divisionId === div.id);
        const divRegs = allRegistrations.filter((r) => r.divisionId === div.id);
        const { res, removedEmptyCount, podiumUpdated } = await reconcileSingleDivisionInDb(
          div,
          divMatches,
          divGroups,
          divRegs,
          now
        );
        if (res.updatedMatches.length > 0 || removedEmptyCount > 0 || podiumUpdated) {
          updatedDivNames.push(div.name);
        }
        totalMatchesUpdated += res.updatedMatches.length;
        totalPropagated += res.propagatedWinners;
        totalRepaired += res.repairedLinks;
        totalEmptyRemoved += removedEmptyCount;
      }

      if (updatedDivNames.length > 0) {
        setFeedback(
          `Actualización total completada (${updatedDivNames.join(', ')}): ${totalMatchesUpdated} llaves guardadas, ${totalPropagated} avances de ronda y ${totalRepaired} enlaces reparados${
            totalEmptyRemoved > 0 ? `, ${totalEmptyRemoved} llaves vacías depuradas` : ''
          }.`
        );
      } else {
        setFeedback(
          'Todas las categorías del torneo ya tienen todos sus resultados propagados y cruces al día.'
        );
      }
    } catch (err) {
      setErrorMsg(
        formatFirestoreError(err, 'No se pudieron actualizar todos los cruces del torneo.')
      );
    } finally {
      setRefreshingBrackets(false);
    }
  };

  const openKoSlotEditor = (m: Match) => {
    setEditingKoSlotMatchId(m.id);
    setManualSlotEntryAId(m.entryAId || '');
    setManualSlotEntryBId(m.entryBId || '');
    setErrorMsg(null);
    setFeedback(null);
  };

  const handleSaveManualKoSlot = async (targetMatch: Match) => {
    if (!canEdit || savingKoSlot) return;
    setErrorMsg(null);
    setFeedback(null);

    if (!manualSlotEntryAId && !manualSlotEntryBId) {
      setErrorMsg('Ninguna llave puede quedar vacía. Elegí al menos un participante de la categoría.');
      return;
    }
    if (manualSlotEntryAId && manualSlotEntryBId && manualSlotEntryAId === manualSlotEntryBId) {
      setErrorMsg('Los participantes de ambos lados de la llave deben ser distintos.');
      return;
    }

    const entryA = manualSlotEntryAId
      ? divisionCategoryEntries.find((e) => e.id === manualSlotEntryAId) || null
      : null;
    const entryB = manualSlotEntryBId
      ? divisionCategoryEntries.find((e) => e.id === manualSlotEntryBId) || null
      : null;

    setSavingKoSlot(true);
    try {
      const now = new Date().toISOString();
      const singleSideBye = Boolean((entryA && !entryB) || (!entryA && entryB));
      const byeWinner = entryA || entryB;
      const entrantsChanged =
        (entryA?.id || null) !== targetMatch.entryAId ||
        (entryB?.id || null) !== targetMatch.entryBId;

      const updatedMatch: Match = {
        ...targetMatch,
        entryAId: entryA?.id || null,
        entryAName: entryA ? entryA.displayName : 'BYE',
        playerIdsA: entryA ? entryA.playerIds : [],
        entryBId: entryB?.id || null,
        entryBName: entryB ? entryB.displayName : 'BYE',
        playerIdsB: entryB ? entryB.playerIds : [],
        isBye: singleSideBye,
        status: singleSideBye
          ? 'finalizado'
          : entrantsChanged
          ? 'programado'
          : targetMatch.status,
        sets: singleSideBye || entrantsChanged ? [] : targetMatch.sets,
        winnerEntryId: singleSideBye && byeWinner ? byeWinner.id : entrantsChanged ? null : targetMatch.winnerEntryId,
        winnerName: singleSideBye && byeWinner ? byeWinner.displayName : entrantsChanged ? null : targetMatch.winnerName,
        outcomeNote: singleSideBye ? 'Pase libre (BYE)' : entrantsChanged ? null : targetMatch.outcomeNote,
        published: true,
        updatedAt: now,
      };

      await saveEntity('matches', updatedMatch);

      // Re-sincronizar inmediatamente rondas siguientes si esta llave quedó con BYE o actualizó participantes
      const nextList = dedupedDivisionMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
      const fallbackPool =
        division.format === 'grupos_y_final' && liveQualifiers.length > 0
          ? liveQualifiers
          : confirmedDivisionEntries;
      const cascaded = reconcileKnockoutBracket(nextList, division, fallbackPool);
      for (const cm of cascaded.updatedMatches) {
        if (cm.id !== updatedMatch.id) {
          await saveEntity('matches', { ...cm, updatedAt: now });
        }
      }

      setEditingKoSlotMatchId(null);
      setFeedback(
        `Llave de ${targetMatch.roundName} actualizada: ${updatedMatch.entryAName} vs ${updatedMatch.entryBName}.`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar el cruce manual.'));
    } finally {
      setSavingKoSlot(false);
    }
  };

  const applyScoreAndCascade = async (confirmedCascade: boolean) => {
    if (!activeMatch || !liveValidation || savingScore) return;
    setErrorMsg(null);
    setFeedback(null);

    if (!liveValidation.valid) {
      setErrorMsg(liveValidation.error || 'Marcador inválido según reglas ITF.');
      return;
    }

    const isCorrection = Boolean(activeMatch.winnerEntryId);
    if (isCorrection && !correctionReason.trim()) {
      setErrorMsg('Indicá el motivo de la corrección para conservar el historial.');
      return;
    }

    // Verificar si cambia ganador y afecta cruces siguientes
    const affected = findAffectedDownstreamMatches(
      activeMatch,
      dedupedDivisionMatches,
      liveValidation.winnerEntryId
    );
    if (affected.length > 0 && !confirmedCascade) {
      setPendingAffectedMatches(affected);
      return;
    }

    setSavingScore(true);
    try {
      const now = new Date().toISOString();
      const setsToSave = status === 'wo' ? [] : effectiveSets;
      const newCorrectionHistory: CorrectionRecord[] = [...activeMatch.correctionHistory];
      if (isCorrection) {
        newCorrectionHistory.push({
          id: makeId('corr'),
          at: now,
          byEmail: userEmail,
          reason: correctionReason.trim(),
          previousScore: formatScoreString(activeMatch.sets, activeMatch.status),
          newScore: formatScoreString(setsToSave, status),
          previousWinnerId: activeMatch.winnerEntryId || null,
          newWinnerId: liveValidation.winnerEntryId,
        });
      }

      const resolvedNext =
        activeMatch.phase === 'eliminacion'
          ? resolveNextKnockoutMatch(activeMatch, dedupedDivisionMatches)
          : null;

      const updatedMatch: Match = {
        ...activeMatch,
        nextMatchId: resolvedNext ? resolvedNext.nextMatch.id : activeMatch.nextMatchId,
        nextMatchSlot: resolvedNext ? resolvedNext.slot : activeMatch.nextMatchSlot,
        status,
        sets: setsToSave,
        winnerEntryId: liveValidation.winnerEntryId,
        winnerName: liveValidation.winnerName,
        outcomeNote: outcomeNote.trim() || null,
        correctionHistory: newCorrectionHistory,
        published: true,
        updatedAt: now,
      };

      await saveEntity('matches', updatedMatch);

      // Actualizar listas locales deduplicadas para cálculos en cascada
      const nextDivMatches = dedupeMatches(
        dedupedDivisionMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m))
      );
      const nextAllMatches = dedupeMatches(
        allMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m))
      );

      // 1. Recalcular tabla de posiciones si pertenece a fase de grupos
      if (updatedMatch.phase === 'grupos') {
        const grp =
          divisionGroups.find((g) => g.id === updatedMatch.groupId) ||
          divisionGroups.find(
            (g) =>
              updatedMatch.entryAId &&
              updatedMatch.entryBId &&
              g.entryIds.includes(updatedMatch.entryAId) &&
              g.entryIds.includes(updatedMatch.entryBId)
          );
        if (grp) {
          const recalculated = computeGroupStandings(
            grp,
            nextDivMatches,
            divisionRegistrations,
            division
          );
          await saveEntity('groups', {
            ...grp,
            standings: recalculated,
            published: true,
            updatedAt: now,
          });
        }
      }

      let clearedFinal = false;
      let clearedThirdPlace = false;

      // 2. Avanzar ganador en cuadro de eliminación directa (y limpiar cascada completa si hubo corrección)
      if (updatedMatch.phase === 'eliminacion' && resolvedNext) {
        const nextMatch =
          nextDivMatches.find((m) => m.id === resolvedNext.nextMatch.id) || resolvedNext.nextMatch;
        const targetSlot = resolvedNext.slot;
        const winnerIsA = liveValidation.winnerEntryId === updatedMatch.entryAId;
        const winnerPlayerIds = winnerIsA ? updatedMatch.playerIdsA : updatedMatch.playerIdsB;

        const patchedNext: Match = {
          ...nextMatch,
          entryAId: targetSlot === 'A' ? liveValidation.winnerEntryId : nextMatch.entryAId,
          entryAName:
            targetSlot === 'A'
              ? liveValidation.winnerName || 'Por definir'
              : nextMatch.entryAName,
          playerIdsA: targetSlot === 'A' ? winnerPlayerIds : nextMatch.playerIdsA,
          entryBId: targetSlot === 'B' ? liveValidation.winnerEntryId : nextMatch.entryBId,
          entryBName:
            targetSlot === 'B'
              ? liveValidation.winnerName || 'Por definir'
              : nextMatch.entryBName,
          playerIdsB: targetSlot === 'B' ? winnerPlayerIds : nextMatch.playerIdsB,
          sets: affected.length > 0 ? [] : nextMatch.sets,
          winnerEntryId: affected.length > 0 ? null : nextMatch.winnerEntryId,
          winnerName: affected.length > 0 ? null : nextMatch.winnerName,
          outcomeNote: affected.length > 0 ? null : nextMatch.outcomeNote,
          status: affected.length > 0 ? 'programado' : nextMatch.status,
          published: true,
          updatedAt: now,
        };
        await saveEntity('matches', patchedNext);

        const nextIsFinal = isRealFinalMatch(patchedNext, nextDivMatches);
        if (affected.length > 0 && nextIsFinal) {
          clearedFinal = true;
        }

        // Si el siguiente partido es la Final, enviar perdedor de la Semifinal al partido de Tercer Puesto
        if (nextIsFinal) {
          const thirdPlaceMatch = nextDivMatches.find(
            (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
          );
          if (thirdPlaceMatch) {
            const loserEntryId = winnerIsA
              ? updatedMatch.entryBId || null
              : updatedMatch.entryAId || null;
            const loserName = winnerIsA ? updatedMatch.entryBName : updatedMatch.entryAName;
            const loserPlayerIds = winnerIsA ? updatedMatch.playerIdsB : updatedMatch.playerIdsA;
            const patchedThird: Match = {
              ...thirdPlaceMatch,
              entryAId: targetSlot === 'A' ? loserEntryId : thirdPlaceMatch.entryAId,
              entryAName: targetSlot === 'A' ? loserName : thirdPlaceMatch.entryAName,
              playerIdsA: targetSlot === 'A' ? loserPlayerIds : thirdPlaceMatch.playerIdsA,
              entryBId: targetSlot === 'B' ? loserEntryId : thirdPlaceMatch.entryBId,
              entryBName: targetSlot === 'B' ? loserName : thirdPlaceMatch.entryBName,
              playerIdsB: targetSlot === 'B' ? loserPlayerIds : thirdPlaceMatch.playerIdsB,
              sets: affected.length > 0 ? [] : thirdPlaceMatch.sets,
              winnerEntryId: affected.length > 0 ? null : thirdPlaceMatch.winnerEntryId,
              winnerName: affected.length > 0 ? null : thirdPlaceMatch.winnerName,
              outcomeNote: affected.length > 0 ? null : thirdPlaceMatch.outcomeNote,
              status: affected.length > 0 ? 'programado' : thirdPlaceMatch.status,
              published: true,
              updatedAt: now,
            };
            await saveEntity('matches', patchedThird);
            if (affected.length > 0) clearedThirdPlace = true;
          }
        }

        // Si hubo corrección y nextMatch alimenta rondas aún posteriores (p. ej. Cuartos -> Semi -> Final),
        // limpiar recursivamente los cruces subsiguientes para que no queden ganadores viejos.
        if (affected.length > 0) {
          let parentMatch: Match = patchedNext;
          const visited = new Set<string>([patchedNext.id]);
          while (true) {
            const nextStep = resolveNextKnockoutMatch(parentMatch, nextDivMatches);
            if (!nextStep || visited.has(nextStep.nextMatch.id)) break;
            const downstream = nextStep.nextMatch;
            const slot = nextStep.slot;
            visited.add(downstream.id);

            const clearedDownstream: Match = {
              ...downstream,
              entryAId: slot === 'A' ? null : downstream.entryAId,
              entryAName: slot === 'A' ? 'Por definir' : downstream.entryAName,
              playerIdsA: slot === 'A' ? [] : downstream.playerIdsA,
              entryBId: slot === 'B' ? null : downstream.entryBId,
              entryBName: slot === 'B' ? 'Por definir' : downstream.entryBName,
              playerIdsB: slot === 'B' ? [] : downstream.playerIdsB,
              sets: [],
              winnerEntryId: null,
              winnerName: null,
              outcomeNote: null,
              status: 'programado',
              published: true,
              updatedAt: now,
            };
            await saveEntity('matches', clearedDownstream);

            const downstreamIsFinal = isRealFinalMatch(downstream, nextDivMatches);
            if (downstreamIsFinal) {
              clearedFinal = true;
              const tp = nextDivMatches.find(
                (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
              );
              if (tp) {
                const clearedTp: Match = {
                  ...tp,
                  entryAId: slot === 'A' ? null : tp.entryAId,
                  entryAName: slot === 'A' ? 'Por definir' : tp.entryAName,
                  playerIdsA: slot === 'A' ? [] : tp.playerIdsA,
                  entryBId: slot === 'B' ? null : tp.entryBId,
                  entryBName: slot === 'B' ? 'Por definir' : tp.entryBName,
                  playerIdsB: slot === 'B' ? [] : tp.playerIdsB,
                  sets: [],
                  winnerEntryId: null,
                  winnerName: null,
                  outcomeNote: null,
                  status: 'programado',
                  published: true,
                  updatedAt: now,
                };
                await saveEntity('matches', clearedTp);
                clearedThirdPlace = true;
              }
            }

            parentMatch = clearedDownstream;
          }
        }
      }

      // 2b. Reconciliar el resto del cuadro eliminatorio para que ningún ganador previo o BYE quede sin pasar de ronda
      if (updatedMatch.phase === 'eliminacion') {
        const fallbackPool =
          division.format === 'grupos_y_final' && liveQualifiers.length > 0
            ? liveQualifiers
            : confirmedDivisionEntries;
        const cascadedReconcile = reconcileKnockoutBracket(nextDivMatches, division, fallbackPool);
        for (const extraMatch of cascadedReconcile.updatedMatches) {
          if (extraMatch.id !== updatedMatch.id) {
            await saveEntity('matches', { ...extraMatch, updatedAt: now });
          }
        }
      }

      // 3. Actualizar o limpiar podio de la división según Final / 3er Puesto
      let updatedDivisions = allDivisions;
      const isUpdatedThirdPlace =
        updatedMatch.phase === 'eliminacion' &&
        (Boolean(updatedMatch.isThirdPlace) || updatedMatch.roundName === 'Tercer Puesto');
      const isUpdatedFinal =
        updatedMatch.phase === 'eliminacion' && isRealFinalMatch(updatedMatch, nextDivMatches);

      if (isUpdatedThirdPlace && liveValidation.winnerEntryId) {
        const updatedDiv: Division = {
          ...division,
          thirdPlaceEntryId: liveValidation.winnerEntryId,
          thirdPlaceName: liveValidation.winnerName,
          updatedAt: now,
        };
        await saveEntity('divisions', updatedDiv);
        updatedDivisions = allDivisions.map((d) => (d.id === updatedDiv.id ? updatedDiv : d));
      } else if (isUpdatedFinal && liveValidation.winnerEntryId) {
        const runnerUpName =
          liveValidation.winnerEntryId === updatedMatch.entryAId
            ? updatedMatch.entryBName
            : updatedMatch.entryAName;
        const updatedDiv: Division = {
          ...division,
          championEntryId: liveValidation.winnerEntryId,
          championName: liveValidation.winnerName,
          runnerUpName,
          updatedAt: now,
        };
        await saveEntity('divisions', updatedDiv);
        updatedDivisions = allDivisions.map((d) => (d.id === updatedDiv.id ? updatedDiv : d));
      } else if (clearedFinal || clearedThirdPlace) {
        const updatedDiv: Division = {
          ...division,
          championEntryId: clearedFinal ? null : division.championEntryId,
          championName: clearedFinal ? null : division.championName,
          runnerUpName: clearedFinal ? null : division.runnerUpName,
          thirdPlaceEntryId: clearedThirdPlace ? null : division.thirdPlaceEntryId,
          thirdPlaceName: clearedThirdPlace ? null : division.thirdPlaceName,
          updatedAt: now,
        };
        await saveEntity('divisions', updatedDiv);
        updatedDivisions = allDivisions.map((d) => (d.id === updatedDiv.id ? updatedDiv : d));
      }

      // 4. Recalcular estadísticas de los jugadores involucrados
      const involvedPlayerIds = Array.from(
        new Set([...updatedMatch.playerIdsA, ...updatedMatch.playerIdsB])
      );
      for (const pid of involvedPlayerIds) {
        const pDoc = players.find((p) => p.id === pid);
        if (pDoc) {
          const nextStats = computePlayerStatsFromMatches(
            pid,
            nextAllMatches,
            updatedDivisions,
            allRegistrations
          );
          await saveEntity('players_public', { ...pDoc, stats: nextStats, updatedAt: now });
        }
      }

      await publishNotificationAndBroadcast(
        {
          id: makeId('notif'),
          tournamentId: tournament.id,
          divisionId: division.id,
          matchId: updatedMatch.id,
          title: `Resultado confirmado · ${division.name}`,
          body: `${updatedMatch.entryAName} vs ${updatedMatch.entryBName}: ${formatScoreString(setsToSave, status)}. Ganador: ${liveValidation.winnerName}.`,
          targetPlayerIds: involvedPlayerIds,
          createdAt: now,
        },
        'match:score_updated'
      );

      setSelectedMatchId(updatedMatch.id);
      setPendingAffectedMatches(null);
      setCorrectionReason('');
      setFeedback(
        `Marcador confirmado (${formatScoreString(setsToSave, status)}). Ganador: ${liveValidation.winnerName}. Tabla y cuadro actualizados.`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar el resultado en Firestore.'));
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#7C1FA2] font-medium">
            {division.itfConfig.edition} ·{' '}
            {division.itfConfig.setsToWin === 2
              ? 'Mejor de 3 sets'
              : division.itfConfig.setsToWin === 1
              ? 'Set único'
              : 'Mejor de 5 sets'}
            {division.itfConfig.setTiebreakPoints === 10 ? ' · Tie-break a 10 pts' : ''}
            {division.itfConfig.tiebreakExactTarget ? ' · El que llegue primero' : ''}
            {division.itfConfig.directTiebreakMatch ? ' · Partido directo TB 10' : ''}
            {division.itfConfig.matchTiebreakThirdSet ? ' · Match Tie-Break 10 pts' : ''}
            {division.itfConfig.decisivePointNoAd ? ' · Sin ventaja (No-Ad)' : ''}
          </p>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Carga y Corrección de Marcadores — {division.name}
          </h2>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshingBrackets}
              onClick={handleRefreshKnockoutBrackets}
              title="Actualizar y avanzar todos los resultados pendientes en esta categoría"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold disabled:opacity-60 transition-colors ${
                unpropagatedMatches.length > 0
                  ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700'
                  : 'border-[#7C1FA2] bg-white text-[#7C1FA2] hover:bg-purple-50'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingBrackets ? 'animate-spin' : ''}`} />
              {refreshingBrackets
                ? 'Actualizando...'
                : unpropagatedMatches.length > 0
                ? `Actualizar cruces (${unpropagatedMatches.length} sin avanzar)`
                : 'Actualizar cruces'}
            </button>

            {tournamentDivisions.length > 1 && (
              <button
                type="button"
                disabled={refreshingBrackets}
                onClick={handleRefreshAllTournamentBrackets}
                title="Sincronizar y avanzar ganadores en TODAS las categorías del torneo"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 transition-colors ${
                  tournamentUnpropagatedSummary.total > 0
                    ? 'bg-[#0A1633] text-white hover:bg-[#7C1FA2]'
                    : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#0A1633] hover:bg-slate-100'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingBrackets ? 'animate-spin' : ''}`} />
                {tournamentUnpropagatedSummary.total > 0
                  ? `Actualizar todas las categorías (${tournamentUnpropagatedSummary.total})`
                  : 'Actualizar todas las categorías'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selector / Filtro estricto por Categoría y División para no mezclar partidos */}
      {tournamentDivisions.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0A1633]">
              <Filter className="w-3.5 h-3.5 text-[#7C1FA2]" />
              Filtrar por Categoría / División (sin mezclar cuadros)
            </div>
            {categoriesList.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedCategoryFilter === 'ALL'
                      ? 'bg-[#0A1633] text-white'
                      : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  Todas ({tournamentDivisions.length})
                </button>
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter(cat);
                      const firstInCat = tournamentDivisions.find((d) => d.category === cat);
                      if (firstInCat && firstInCat.id !== division.id && onSelectDivision) {
                        onSelectDivision(firstInCat.id);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      selectedCategoryFilter === cat
                        ? 'bg-[#0A1633] text-white'
                        : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                    }`}
                  >
                    Cat. {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {filteredDivisionChips.map((d) => {
              const active = d.id === division.id;
              const counts = divisionMatchCounts.get(d.id) || {
                total: 0,
                pending: 0,
                unpropagated: 0,
              };
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDivision?.(d.id)}
                  disabled={!onSelectDivision}
                  className={`px-3 py-2 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                      : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0] hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs font-semibold">{d.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md font-mono tabular-nums text-[10px] font-semibold ${
                      active
                        ? 'bg-white/20 text-white'
                        : counts.pending > 0
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {counts.pending > 0 ? `${counts.pending} pend.` : `${counts.total}/${counts.total}`}
                  </span>
                  {counts.unpropagated > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-red-600 text-white font-mono tabular-nums text-[10px] font-bold">
                      {counts.unpropagated} sin avanzar
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(unpropagatedMatches.length > 0 || tournamentUnpropagatedSummary.total > 0) && canEdit && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold">
                {unpropagatedMatches.length > 0
                  ? `Hay ${unpropagatedMatches.length} ${
                      unpropagatedMatches.length === 1
                        ? 'resultado finalizado en ' + division.name + ' que aún no pasó de ronda'
                        : 'resultados finalizados en ' + division.name + ' que aún no pasaron de ronda'
                    }`
                  : `Hay ${tournamentUnpropagatedSummary.total} resultados pendientes de avanzar de ronda en otras categorías (${tournamentUnpropagatedSummary.affectedDivisions
                      .map((x) => `${x.division.name}: ${x.count}`)
                      .join(', ')})`}
              </p>
              {unpropagatedMatches.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-amber-900">
                  {unpropagatedMatches.slice(0, 4).map((info) => (
                    <li key={info.match.id}>
                      • {info.match.roundName}: <strong>{info.winnerName}</strong> →{' '}
                      {info.targetRoundName || 'Siguiente ronda'}
                    </li>
                  ))}
                  {unpropagatedMatches.length > 4 && (
                    <li>• …y {unpropagatedMatches.length - 4} más</li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={refreshingBrackets}
            onClick={
              tournamentUnpropagatedSummary.total > unpropagatedMatches.length
                ? handleRefreshAllTournamentBrackets
                : handleRefreshKnockoutBrackets
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 disabled:opacity-60 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingBrackets ? 'animate-spin' : ''}`} />
            {refreshingBrackets
              ? 'Sincronizando...'
              : 'Actualizar y pasar todos de ronda ahora'}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#7C1FA2]">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista de partidos de la categoría seleccionada */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0A1633]">
                Partidos · {division.name} ({playableMatches.length}/{allPlayableMatches.length})
              </h3>
              {duplicateAnalysis.duplicateMatches.length > 0 && canDelete && (
                <button
                  type="button"
                  disabled={cleaningDuplicates}
                  onClick={async () => {
                    setCleaningDuplicates(true);
                    setErrorMsg(null);
                    try {
                      const ids = duplicateAnalysis.duplicateMatches.map((m) => m.id);
                      await deleteMatchesBatch(ids);
                      setFeedback(`Se eliminaron ${ids.length} partidos duplicados.`);
                    } catch (err) {
                      setErrorMsg(
                        err instanceof Error
                          ? err.message
                          : 'No se pudieron eliminar duplicados.'
                      );
                    } finally {
                      setCleaningDuplicates(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-700 text-white text-[11px] font-semibold hover:bg-red-800 disabled:opacity-60"
                >
                  <Trash2 className="w-3 h-3" />
                  {cleaningDuplicates
                    ? 'Limpiando...'
                    : `Borrar ${duplicateAnalysis.duplicateMatches.length} duplicados`}
                </button>
              )}
            </div>

            {/* Sub-filtros dentro de la categoría: Fase, Grupo/Ronda, Estado y Jugador */}
            <div className="space-y-2">
              {(hasGroupsPhase || hasEliminationPhase) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'Todas las fases' },
                      ...(hasGroupsPhase ? [{ id: 'grupos', label: 'Grupos' }] : []),
                      ...(hasEliminationPhase
                        ? [{ id: 'eliminacion', label: 'Eliminación' }]
                        : []),
                    ] as Array<{ id: 'ALL' | 'grupos' | 'eliminacion'; label: string }>
                  ).map((ph) => (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() => {
                        setPhaseFilter(ph.id);
                        setRoundFilter('ALL');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        phaseFilter === ph.id
                          ? 'bg-[#0A1633] text-white'
                          : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                      }`}
                    >
                      {ph.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                >
                  <option value="ALL">Todos los grupos / rondas</option>
                  {roundFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'ALL' | 'pending' | 'finished')
                  }
                  className="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                >
                  <option value="ALL">Todos los estados</option>
                  <option value="pending">Solo pendientes</option>
                  <option value="finished">Solo finalizados</option>
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#475569] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Buscar jugador o pareja en esta categoría..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0] max-h-[520px] overflow-y-auto">
            {playableMatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#475569]">
                No hay partidos con jugadores asignados que coincidan con el filtro en{' '}
                <strong>{division.name}</strong>.
              </div>
            ) : (
              playableMatches.map((m) => {
                const selected = activeMatch?.id === m.id;
                const isDup = duplicateIdSet.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`p-3.5 transition-colors ${
                      selected ? 'bg-purple-50/60 border-l-4 border-l-[#7C1FA2]' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => loadMatchIntoEditor(m)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-[#475569]">
                          <span className="inline-flex items-center gap-1.5 truncate">
                            <span className="font-medium">{m.roundName}</span>
                            {isDup && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                                Duplicado
                              </span>
                            )}
                          </span>
                          <span
                            className={`font-mono tabular-nums font-semibold shrink-0 ${
                              m.winnerEntryId ? 'text-[#15803D]' : 'text-[#C2410C]'
                            }`}
                          >
                            {m.sets.length > 0 || m.status === 'wo' || m.winnerEntryId
                              ? formatScoreString(m.sets, m.status)
                              : 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[#0A1633] mt-1">
                          <span className={m.winnerEntryId === m.entryAId ? 'text-[#15803D]' : ''}>
                            {m.entryAName}
                          </span>{' '}
                          <span className="text-xs font-normal text-[#475569]">vs</span>{' '}
                          <span className={m.winnerEntryId === m.entryBId ? 'text-[#15803D]' : ''}>
                            {m.entryBName}
                          </span>
                        </p>
                        {m.winnerName && (
                          <p className="text-[11px] text-[#15803D] font-medium mt-0.5">
                            Ganador: {m.winnerName}
                          </p>
                        )}
                      </button>

                      {canDelete && (
                        <div className="shrink-0">
                          {confirmDeleteMatchId === m.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMatchId(null)}
                                className="px-2 py-1 rounded border border-[#E2E8F0] bg-white text-[10px]"
                              >
                                No
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeEntity('matches', m.id);
                                  setConfirmDeleteMatchId(null);
                                  setFeedback(`Partido eliminado (${m.entryAName} vs ${m.entryBName}).`);
                                }}
                                className="px-2 py-1 rounded bg-red-700 text-white text-[10px] font-semibold"
                              >
                                Borrar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMatchId(m.id)}
                              title="Eliminar partido"
                              className="p-1.5 rounded-lg text-[#475569] hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Editor de Marcador ITF */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
          {!activeMatch ? (
            <p className="text-sm text-[#475569]">
              Seleccioná un partido de <strong>{division.name}</strong> para cargar o corregir su marcador.
            </p>
          ) : (
            <>
              <div className="pb-4 border-b border-[#E2E8F0] flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[#7C1FA2] font-semibold">
                    {division.name} · {activeMatch.roundName}
                  </p>
                  <h3 className="text-base font-bold text-[#0A1633] mt-0.5">
                    {activeMatch.entryAName} vs {activeMatch.entryBName}
                  </h3>
                </div>
                <WhatsAppShareButton
                  message={buildMatchWhatsAppMessage({
                    match: {
                      ...activeMatch,
                      status,
                      sets: status === 'wo' ? [] : effectiveSets,
                      winnerEntryId: liveValidation?.winnerEntryId || activeMatch.winnerEntryId,
                      winnerName: liveValidation?.winnerName || activeMatch.winnerName,
                      outcomeNote: outcomeNote.trim() || activeMatch.outcomeNote,
                    },
                    tournament,
                    division,
                  })}
                  label="Compartir por WhatsApp"
                  showCopy
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Modo de marcador oficial
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'finalizado', label: 'Normal / Por sets' },
                        { id: 'wo', label: 'W.O. (Walk Over)' },
                        { id: 'retiro', label: 'Retiro (RET)' },
                        { id: 'descalificado', label: 'Descalif. (DQ)' },
                      ] as Array<{ id: MatchStatus; label: string }>
                    ).map((opt) => {
                      const active = status === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStatus(opt.id)}
                          className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors text-center ${
                            active
                              ? opt.id === 'wo'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                              : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0] hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {status === 'wo' && (
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-amber-950">
                          Marcador oficial: W.O. (Walk Over)
                        </p>
                        <p className="text-[11px] text-amber-900 mt-0.5">
                          Seleccioná quién gana el partido por ausencia o incomparecencia del rival.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-mono text-xs font-bold shrink-0">
                        W.O.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIncidentWinnerSide('A')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          incidentWinnerSide === 'A'
                            ? 'bg-white border-amber-600 ring-2 ring-amber-500/30'
                            : 'bg-white/80 border-amber-200 hover:bg-white'
                        }`}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          Gana por W.O.
                        </p>
                        <p className="text-xs font-bold text-[#0A1633] mt-0.5 truncate">
                          {activeMatch.entryAName}
                        </p>
                        <p className="text-[11px] text-[#475569] truncate mt-0.5">
                          Rival ausente: {activeMatch.entryBName}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIncidentWinnerSide('B')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          incidentWinnerSide === 'B'
                            ? 'bg-white border-amber-600 ring-2 ring-amber-500/30'
                            : 'bg-white/80 border-amber-200 hover:bg-white'
                        }`}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          Gana por W.O.
                        </p>
                        <p className="text-xs font-bold text-[#0A1633] mt-0.5 truncate">
                          {activeMatch.entryBName}
                        </p>
                        <p className="text-[11px] text-[#475569] truncate mt-0.5">
                          Rival ausente: {activeMatch.entryAName}
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {(status === 'retiro' ||
                  status === 'descalificado' ||
                  (status === 'finalizado' && !includeSetScores)) && (
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">
                      Ganador oficial *
                    </label>
                    <select
                      value={incidentWinnerSide || ''}
                      onChange={(e) => setIncidentWinnerSide((e.target.value as 'A' | 'B') || null)}
                      className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
                    >
                      <option value="">Seleccionar ganador...</option>
                      <option value="A">{activeMatch.entryAName}</option>
                      <option value="B">{activeMatch.entryBName}</option>
                    </select>
                  </div>
                )}
              </div>

              {status === 'finalizado' && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0A1633] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSetScores}
                      onChange={(e) => setIncludeSetScores(e.target.checked)}
                    />
                    Cargar puntaje detallado por sets (opcional)
                  </label>
                  <span className="text-[11px] text-[#475569]">
                    {includeSetScores
                      ? 'Validación ITF por games y tie-break activa'
                      : 'Se registrará únicamente el ganador oficial'}
                  </span>
                </div>
              )}

              {status !== 'wo' && (status !== 'finalizado' || includeSetScores) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0A1633]">Marcador por set</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSets([...sets, { a: 6, b: 4 }])}
                        className="px-2.5 py-1 rounded border border-[#E2E8F0] text-xs hover:bg-slate-50"
                      >
                        + Set
                      </button>
                      {(division.itfConfig.matchTiebreakThirdSet ||
                        division.itfConfig.directTiebreakMatch ||
                        division.itfConfig.setTiebreakPoints === 10) && (
                        <button
                          type="button"
                          onClick={() => setSets([...sets, { a: 10, b: 3, isMatchTiebreak: true }])}
                          className="px-2.5 py-1 rounded border border-[#E2E8F0] text-xs hover:bg-slate-50"
                        >
                          + Tie-Break (10)
                        </button>
                      )}
                    </div>
                  </div>

                  {sets.map((s, idx) => {
                    const gps = division.itfConfig.gamesPerSet;
                    const showSetTiebreak =
                      !s.isMatchTiebreak &&
                      ((s.a === gps + 1 && s.b === gps) || (s.b === gps + 1 && s.a === gps));
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center gap-3"
                      >
                        <span className="text-xs font-medium text-[#475569] w-24">
                          {s.isMatchTiebreak ? 'Tie-Break (10)' : `Set ${idx + 1}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={s.a}
                            onChange={(e) => {
                              const next = [...sets];
                              next[idx] = { ...s, a: Number(e.target.value) };
                              setSets(next);
                            }}
                            className="w-16 h-9 px-2 rounded-lg border border-[#E2E8F0] bg-white text-center font-mono tabular-nums text-sm"
                          />
                          <span className="text-xs text-[#475569]">-</span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={s.b}
                            onChange={(e) => {
                              const next = [...sets];
                              next[idx] = { ...s, b: Number(e.target.value) };
                              setSets(next);
                            }}
                            className="w-16 h-9 px-2 rounded-lg border border-[#E2E8F0] bg-white text-center font-mono tabular-nums text-sm"
                          />
                        </div>

                        {showSetTiebreak && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[#475569]">
                              TB ({division.itfConfig.setTiebreakPoints ?? 7}
                              {division.itfConfig.tiebreakExactTarget ? ' exacto' : ''}):
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={30}
                              placeholder="A"
                              value={s.tbA ?? ''}
                              onChange={(e) => {
                                const next = [...sets];
                                next[idx] = {
                                  ...s,
                                  tbA: e.target.value === '' ? null : Number(e.target.value),
                                };
                                setSets(next);
                              }}
                              className="w-12 h-8 px-1 rounded border border-[#E2E8F0] bg-white text-center font-mono text-xs"
                            />
                            <input
                              type="number"
                              min={0}
                              max={30}
                              placeholder="B"
                              value={s.tbB ?? ''}
                              onChange={(e) => {
                                const next = [...sets];
                                next[idx] = {
                                  ...s,
                                  tbB: e.target.value === '' ? null : Number(e.target.value),
                                };
                                setSets(next);
                              }}
                              className="w-12 h-8 px-1 rounded border border-[#E2E8F0] bg-white text-center font-mono text-xs"
                            />
                          </div>
                        )}

                        {sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSets(sets.filter((_, i) => i !== idx))}
                            className="ml-auto text-xs text-red-700 hover:underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Validación automática ITF */}
              {liveValidation && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    liveValidation.valid
                      ? 'bg-emerald-50 border-emerald-200 text-[#7C1FA2]'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {liveValidation.valid ? (
                    <span className="font-medium">
                      Validación ITF correcta · Ganador automático: {liveValidation.winnerName}
                    </span>
                  ) : (
                    <span>{liveValidation.error}</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="Observación (opcional)"
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
                />
                {activeMatch.winnerEntryId && (
                  <input
                    placeholder="Motivo de la corrección *"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50/40 text-xs"
                  />
                )}
              </div>

              {/* Advertencia de cruces afectados antes de confirmar */}
              {pendingAffectedMatches && pendingAffectedMatches.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-900">
                        Atención: esta corrección cambia un cruce ya programado o disputado
                      </p>
                      <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
                        {pendingAffectedMatches.map((am) => (
                          <li key={am.id}>
                            • {am.roundName}: {am.entryAName} vs {am.entryBName} ({am.status})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingAffectedMatches(null)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingScore}
                      onClick={() => applyScoreAndCascade(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium disabled:opacity-60"
                    >
                      Confirmar y actualizar cuadro
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3">
                {!canEdit && (
                  <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    Modo lectura — no tenés permiso de modificación para confirmar resultados.
                  </span>
                )}
                <button
                  type="button"
                  disabled={!canEdit || savingScore}
                  onClick={() => applyScoreAndCascade(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {savingScore ? 'Guardando...' : 'Confirmar resultado oficial'}
                </button>
              </div>

              {/* Historial de correcciones */}
              {activeMatch.correctionHistory.length > 0 && (
                <div className="pt-4 border-t border-[#E2E8F0]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0A1633] mb-2">
                    <History className="w-4 h-4 text-[#475569]" />
                    Historial de correcciones ({activeMatch.correctionHistory.length})
                  </div>
                  <div className="space-y-1.5 text-xs text-[#475569]">
                    {activeMatch.correctionHistory.map((c) => (
                      <div key={c.id} className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                        <span className="font-mono">{c.previousScore}</span> →{' '}
                        <span className="font-mono font-semibold text-[#0A1633]">{c.newScore}</span> ·{' '}
                        {c.reason} ({c.byEmail})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reflejo en Tiempo Real: Grupos, Cruces y Cuadro Eliminatorio de la Categoría */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C1FA2]">
              Reflejo inmediato en vivo · {division.name}
            </p>
            <h3 className="text-base font-bold text-[#0A1633]">
              Cuadro, Tabla de Posiciones y Cruces
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(knockoutRounds.length > 0 || thirdPlaceMatch || divisionGroups.length > 0) && canEdit && (
              <button
                type="button"
                disabled={refreshingBrackets}
                onClick={handleRefreshKnockoutBrackets}
                title="Sincronizar ganadores pendientes, reparar enlaces de cuadro y completar vacíos"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold disabled:opacity-60 transition-colors ${
                  unpropagatedMatches.length > 0
                    ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700'
                    : 'border-[#7C1FA2] bg-white text-[#7C1FA2] hover:bg-purple-50'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingBrackets ? 'animate-spin' : ''}`} />
                {refreshingBrackets
                  ? 'Actualizando...'
                  : unpropagatedMatches.length > 0
                  ? `Actualizar cruces (${unpropagatedMatches.length} sin avanzar)`
                  : pendingKoSlotMatches.length > 0
                  ? `Actualizar cruces (${pendingKoSlotMatches.length} pend.)`
                  : 'Actualizar cruces'}
              </button>
            )}

            {division.format === 'grupos_y_final' &&
              knockoutRounds.length === 0 &&
              liveQualifiers.length >= 2 &&
              canGenerateFinalBracket && (
                <button
                  type="button"
                  disabled={generatingFinalBracket}
                  onClick={handleGenerateAndPublishFinalBracket}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-[#7C1FA2] disabled:opacity-60 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generatingFinalBracket
                    ? 'Generando cuadro...'
                    : `Generar cuadro final (${liveQualifiers.length} clasificados)`}
                </button>
              )}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Podio si la final / 3er puesto ya tiene ganador */}
          {(division.championName || division.runnerUpName || division.thirdPlaceName) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {division.championName && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-amber-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      1° Campeón · Oro
                    </p>
                    <p className="text-sm font-bold text-[#0A1633] truncate">
                      {division.championName}
                    </p>
                  </div>
                </div>
              )}
              {division.runnerUpName && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <Medal className="w-5 h-5 text-slate-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      2° Vicecampeón · Plata
                    </p>
                    <p className="text-sm font-bold text-[#0A1633] truncate">
                      {division.runnerUpName}
                    </p>
                  </div>
                </div>
              )}
              {division.thirdPlaceName && (
                <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-3">
                  <Award className="w-5 h-5 text-orange-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                      3° Tercer Puesto · Bronce
                    </p>
                    <p className="text-sm font-bold text-[#0A1633] truncate">
                      {division.thirdPlaceName}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Grupos y Cruces de Zona */}
          {liveGroupsWithDetails.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
                Fase de Grupos y Cruces ({liveGroupsWithDetails.length})
              </h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {liveGroupsWithDetails.map(({ group, standings, matches: grpMatches }) => (
                  <div
                    key={group.id}
                    className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-[#F8FAFC]/50"
                  >
                    <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0A1633]">{group.name}</span>
                      <span className="text-[11px] text-[#475569]">
                        {division.format === 'todos_contra_todos'
                          ? 'Todos contra todos'
                          : `Clasifican ${division.drawConfig.qualifiersPerGroup}`}
                      </span>
                    </div>

                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[11px] text-[#475569] bg-[#F8FAFC]">
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Participante</th>
                            <th className="py-2 px-2 text-right">PJ</th>
                            <th className="py-2 px-2 text-right">G-P</th>
                            <th className="py-2 px-2 text-right">Sets</th>
                            <th className="py-2 px-2 text-right">DG</th>
                            <th className="py-2 px-3 text-right">PTS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {standings.map((row, idx) => (
                            <tr key={row.entryId} className={row.qualified ? 'bg-emerald-50/40' : ''}>
                              <td className="py-2 px-3 font-mono tabular-nums text-[#475569]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-medium text-[#0A1633]">
                                <span>{row.displayName}</span>
                                {row.qualified && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-[#15803D]">
                                    Clasifica
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {row.played}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {row.won}-{row.lost}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {row.setsWon}/{row.setsLost}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {row.gamesDiff >= 0 ? `+${row.gamesDiff}` : row.gamesDiff}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-[#7C1FA2]">
                                {row.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {grpMatches.length > 0 && (
                      <div className="p-3 border-t border-[#E2E8F0] space-y-1.5">
                        <p className="text-[11px] font-semibold text-[#475569]">
                          Cruces de {group.name}
                        </p>
                        <div className="space-y-1.5">
                          {grpMatches.map((m) => (
                            <div
                              key={m.id}
                              className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                                activeMatch?.id === m.id
                                  ? 'bg-purple-50 border-[#7C1FA2]'
                                  : 'bg-white border-[#E2E8F0]'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-[10px] text-[#475569]">{m.roundName}</p>
                                <p className="font-medium text-[#0A1633] truncate">
                                  <span
                                    className={
                                      m.winnerEntryId === m.entryAId
                                        ? 'font-bold text-[#15803D]'
                                        : ''
                                    }
                                  >
                                    {m.entryAName}
                                  </span>{' '}
                                  <span className="text-[#475569] font-normal">vs</span>{' '}
                                  <span
                                    className={
                                      m.winnerEntryId === m.entryBId
                                        ? 'font-bold text-[#15803D]'
                                        : ''
                                    }
                                  >
                                    {m.entryBName}
                                  </span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`font-mono tabular-nums font-semibold ${
                                    m.winnerEntryId ? 'text-[#7C1FA2]' : 'text-[#475569]'
                                  }`}
                                >
                                  {m.sets.length > 0 || m.status === 'wo' || m.winnerEntryId
                                    ? formatScoreString(m.sets, m.status)
                                    : 'Pendiente'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => loadMatchIntoEditor(m)}
                                  title="Editar este cruce"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-[10px] font-medium text-[#0A1633]"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Cargar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cuadro Eliminatorio Oficial (o proyección desde grupos) */}
          {knockoutRounds.length > 0 || thirdPlaceMatch ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
                  Cuadro de Eliminación Directa y Cruces Finales
                </h4>
                {pendingKoSlotMatches.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    {pendingKoSlotMatches.length}{' '}
                    {pendingKoSlotMatches.length === 1 ? 'llave pendiente' : 'llaves pendientes'} — usá “Actualizar cruces” o “Asignar” en cada tarjeta
                  </span>
                )}
              </div>

              {editingKoSlotMatchId && (() => {
                const targetKo = dedupedDivisionMatches.find((m) => m.id === editingKoSlotMatchId);
                if (!targetKo) return null;
                return (
                  <div className="p-4 rounded-xl bg-purple-50/60 border border-[#7C1FA2]/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-[#0A1633]">
                          Cargar / Completar llave manualmente · {targetKo.roundName}
                          {targetKo.bracketPosition ? ` (Llave #${targetKo.bracketPosition})` : ''}
                        </p>
                        <p className="text-[11px] text-[#475569]">
                          Solo se muestran jugadores/parejas inscriptos en {division.name} (Cat. {division.category}). Ninguna llave puede quedar vacía.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingKoSlotMatchId(null)}
                        className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#475569]"
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                          Lado A (Participante)
                        </label>
                        <select
                          value={manualSlotEntryAId}
                          onChange={(e) => setManualSlotEntryAId(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                        >
                          <option value="">BYE / Pase libre (solo si Lado B tiene jugador)</option>
                          {divisionCategoryEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.displayName} {entry.seed ? `[Seed ${entry.seed}]` : ''} ({entry.status})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                          Lado B (Participante)
                        </label>
                        <select
                          value={manualSlotEntryBId}
                          onChange={(e) => setManualSlotEntryBId(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                        >
                          <option value="">BYE / Pase libre (solo si Lado A tiene jugador)</option>
                          {divisionCategoryEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.displayName} {entry.seed ? `[Seed ${entry.seed}]` : ''} ({entry.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingKoSlotMatchId(null)}
                        className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0A1633]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingKoSlot}
                        onClick={() => handleSaveManualKoSlot(targetKo)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-60"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {savingKoSlot ? 'Guardando...' : 'Guardar cruce manual'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="overflow-x-auto pb-2">
                <div className="flex items-stretch gap-4 min-w-max">
                  {knockoutRounds.map((round) => (
                    <div
                      key={round.roundName}
                      className="w-[260px] shrink-0 flex flex-col gap-2.5"
                    >
                      <div className="pb-1.5 border-b border-[#E2E8F0] flex items-center justify-between">
                        <span className="text-xs font-bold text-[#7C1FA2]">{round.roundName}</span>
                        <span className="text-[11px] font-mono text-[#475569]">
                          {round.matches.length}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col justify-around gap-2.5">
                        {round.matches.map((m) => {
                          const canLoad = !m.isBye && Boolean(m.entryAId && m.entryBId);
                          const isPendingSlot = !m.isBye && (!m.entryAId || !m.entryBId);
                          const canAssignSlot = canEdit && !m.winnerEntryId && m.sets.length === 0;
                          const isSelected = activeMatch?.id === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                isSelected
                                  ? 'bg-purple-50/70 border-[#7C1FA2]'
                                  : isPendingSlot
                                  ? 'bg-amber-50/40 border-amber-300'
                                  : m.winnerEntryId
                                  ? 'bg-white border-emerald-200'
                                  : 'bg-[#F8FAFC] border-[#E2E8F0]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-[#475569]">
                                  {m.isBye
                                    ? 'BYE'
                                    : m.winnerEntryId
                                    ? formatScoreString(m.sets, m.status)
                                    : isPendingSlot
                                    ? 'Llave pendiente'
                                    : 'Por disputar'}
                                </span>
                                <div className="flex items-center gap-2">
                                  {(isPendingSlot || canAssignSlot) && (
                                    <button
                                      type="button"
                                      onClick={() => openKoSlotEditor(m)}
                                      className="text-[10px] font-semibold text-[#0284C7] hover:underline"
                                    >
                                      {isPendingSlot ? 'Asignar' : 'Editar cruce'}
                                    </button>
                                  )}
                                  {canLoad && (
                                    <button
                                      type="button"
                                      onClick={() => loadMatchIntoEditor(m)}
                                      className="text-[10px] font-semibold text-[#7C1FA2] hover:underline"
                                    >
                                      {m.winnerEntryId ? 'Corregir' : 'Cargar'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div
                                className={`px-2 py-1 rounded border flex items-center justify-between gap-2 ${
                                  m.winnerEntryId && m.winnerEntryId === m.entryAId
                                    ? 'bg-emerald-50 border-emerald-200 font-bold text-[#0A1633]'
                                    : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                                }`}
                              >
                                <span className="truncate">{m.entryAName}</span>
                                {m.winnerEntryId && m.winnerEntryId === m.entryAId && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                                )}
                              </div>
                              <div
                                className={`px-2 py-1 rounded border flex items-center justify-between gap-2 ${
                                  m.winnerEntryId && m.winnerEntryId === m.entryBId
                                    ? 'bg-emerald-50 border-emerald-200 font-bold text-[#0A1633]'
                                    : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                                }`}
                              >
                                <span className="truncate">{m.entryBName}</span>
                                {m.winnerEntryId && m.winnerEntryId === m.entryBId && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {thirdPlaceMatch && (
                    <div className="w-[260px] shrink-0 flex flex-col gap-2.5">
                      <div className="pb-1.5 border-b border-orange-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#9A3412]">Tercer Puesto</span>
                        <span className="text-[11px] font-mono text-[#9A3412]">Bronce</span>
                      </div>
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          activeMatch?.id === thirdPlaceMatch.id
                            ? 'bg-purple-50/70 border-[#7C1FA2]'
                            : 'bg-orange-50/40 border-orange-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[#9A3412] font-medium">
                            {thirdPlaceMatch.winnerEntryId
                              ? formatScoreString(thirdPlaceMatch.sets, thirdPlaceMatch.status)
                              : !thirdPlaceMatch.entryAId || !thirdPlaceMatch.entryBId
                              ? 'Llave pendiente'
                              : 'Por disputar'}
                          </span>
                          <div className="flex items-center gap-2">
                            {canEdit && !thirdPlaceMatch.winnerEntryId && thirdPlaceMatch.sets.length === 0 && (
                              <button
                                type="button"
                                onClick={() => openKoSlotEditor(thirdPlaceMatch)}
                                className="text-[10px] font-semibold text-[#0284C7] hover:underline"
                              >
                                {!thirdPlaceMatch.entryAId || !thirdPlaceMatch.entryBId ? 'Asignar' : 'Editar cruce'}
                              </button>
                            )}
                            {thirdPlaceMatch.entryAId && thirdPlaceMatch.entryBId && (
                              <button
                                type="button"
                                onClick={() => loadMatchIntoEditor(thirdPlaceMatch)}
                                className="text-[10px] font-semibold text-[#7C1FA2] hover:underline"
                              >
                                {thirdPlaceMatch.winnerEntryId ? 'Corregir' : 'Cargar'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          className={`px-2 py-1 rounded border flex items-center justify-between gap-2 ${
                            thirdPlaceMatch.winnerEntryId === thirdPlaceMatch.entryAId
                              ? 'bg-emerald-50 border-emerald-200 font-bold text-[#0A1633]'
                              : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                          }`}
                        >
                          <span className="truncate">{thirdPlaceMatch.entryAName}</span>
                        </div>
                        <div
                          className={`px-2 py-1 rounded border flex items-center justify-between gap-2 ${
                            thirdPlaceMatch.winnerEntryId === thirdPlaceMatch.entryBId
                              ? 'bg-emerald-50 border-emerald-200 font-bold text-[#0A1633]'
                              : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                          }`}
                        >
                          <span className="truncate">{thirdPlaceMatch.entryBName}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            division.format === 'grupos_y_final' &&
            projectedFinalMatches.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-[#E2E8F0]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0A1633]">
                      Proyección en vivo de cruces de Fase Final (según tabla actual)
                    </h4>
                    <p className="text-[11px] text-[#475569]">
                      Se actualiza con cada resultado cargado en grupos. Usá “Generar cuadro final” cuando quieras publicar los cruces oficiales.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {projectedFinalMatches.map((pm) => (
                    <div
                      key={pm.id}
                      className={`p-3 rounded-xl border border-dashed text-xs space-y-1.5 ${
                        pm.isBye
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-[#7C1FA2]/40 bg-purple-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7C1FA2]">
                          {pm.roundName}
                        </p>
                        <span className="text-[10px] font-medium text-[#475569]">
                          {pm.isBye ? 'Pase directo' : 'Proyectado'}
                        </span>
                      </div>
                      <p className="font-semibold text-[#0A1633] truncate">{pm.entryAName}</p>
                      <p className="text-[10px] text-[#475569]">vs</p>
                      <p className="font-semibold text-[#0A1633] truncate">{pm.entryBName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Acceso directo a la consola completa de Usuarios y Permisos */}
      {canOpenUsersTab && onOpenUsersTab && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#7C1FA2]" />
            <div>
              <h3 className="text-sm font-semibold text-[#0A1633]">
                Roles, Permisos ABM y Competencias de Usuarios
              </h3>
              <p className="text-xs text-[#475569]">
                Administrá altas, bajas, modificaciones, acceso a funciones/parámetros y asignación
                de torneos desde la pestaña dedicada.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenUsersTab}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-[#7C1FA2] transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            Ir a Usuarios y permisos
          </button>
        </div>
      )}
    </div>
  );
};
