import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eraser,
  GitBranch,
  Link2,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  Division,
  Group,
  Match,
  PlayerPublic,
  Registration,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import {
  analyzeEliminationDiagnostics,
  buildMissingNextRoundMatchScaffold,
  computeKnockoutPodiumUpdate,
  computePlayerStatsFromMatches,
  computeQualifiedSeededEntries,
  dedupeMatches,
  EliminationMatchDiagnostic,
  reconcileKnockoutBracket,
  repairEliminationBracketWithMissingScaffolds,
} from '../../utils/tournamentEngine';
import { formatFirestoreError, saveEntity } from '../../services/firestoreService';

interface Props {
  tournament: Tournament;
  division: Division;
  divisions: Division[];
  onSelectDivision: (id: string) => void;
  divisionMatches: Match[];
  tournamentMatches: Match[];
  allMatches: Match[];
  allDivisions: Division[];
  allGroups: Group[];
  divisionRegistrations: Registration[];
  allRegistrations: Registration[];
  players: PlayerPublic[];
  userEmail: string;
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
  onOpenScoringTab?: () => void;
}

const NEW_MATCH_SENTINEL = '__CREATE_NEW_NEXT_MATCH__';

export const AdminEliminationDiagnosticPanel: React.FC<Props> = ({
  tournament,
  division,
  divisions,
  onSelectDivision,
  divisionMatches,
  tournamentMatches,
  allMatches,
  allDivisions,
  allGroups,
  divisionRegistrations,
  allRegistrations,
  players,
  userEmail,
  isSuperAdmin,
  permissions,
  onOpenScoringTab,
}) => {
  const canEdit = permissions ? Boolean(isSuperAdmin || permissions.canEdit) : true;
  const canCreate = permissions
    ? Boolean(isSuperAdmin || permissions.canCreate || permissions.canEdit)
    : true;

  const [viewMode, setViewMode] = useState<'problems' | 'all'>('problems');
  const [roundFilter, setRoundFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [repairing, setRepairing] = useState(false);
  const [repairingAll, setRepairingAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado del panel inline "Forzar paso a siguiente ronda"
  const [forcingMatchId, setForcingMatchId] = useState<string | null>(null);
  const [forceSide, setForceSide] = useState<'A' | 'B'>('A');
  const [forceTargetMatchId, setForceTargetMatchId] = useState<string>(NEW_MATCH_SENTINEL);
  const [forceTargetSlot, setForceTargetSlot] = useState<'A' | 'B'>('A');
  const [forceLinkStructure, setForceLinkStructure] = useState<boolean>(true);
  const [forceMarkSourceWinner, setForceMarkSourceWinner] = useState<boolean>(true);
  const [forceClearTargetResultIfChanged, setForceClearTargetResultIfChanged] =
    useState<boolean>(true);
  const [forceNote, setForceNote] = useState<string>('');
  const [savingForce, setSavingForce] = useState(false);
  const [clearingSlotKey, setClearingSlotKey] = useState<string | null>(null);

  const tournamentDivisions = useMemo(
    () =>
      divisions.length > 0
        ? divisions
        : allDivisions.filter((d) => d.tournamentId === tournament.id),
    [divisions, allDivisions, tournament.id]
  );

  // Diagnóstico por división para badges en el selector superior
  const reportByDivisionId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof analyzeEliminationDiagnostics>>();
    tournamentDivisions.forEach((d) => {
      const divMatches = tournamentMatches.filter((m) => m.divisionId === d.id);
      map.set(d.id, analyzeEliminationDiagnostics(d, divMatches));
    });
    return map;
  }, [tournamentDivisions, tournamentMatches]);

  const activeReport = useMemo(
    () =>
      reportByDivisionId.get(division.id) ||
      analyzeEliminationDiagnostics(division, divisionMatches),
    [reportByDivisionId, division, divisionMatches]
  );

  const totalTournamentIssues = useMemo(() => {
    let total = 0;
    let divisionsWithIssues = 0;
    reportByDivisionId.forEach((rep) => {
      if (rep.summary.totalIssues > 0) {
        total += rep.summary.totalIssues;
        divisionsWithIssues++;
      }
    });
    return { total, divisionsWithIssues };
  }, [reportByDivisionId]);

  const visibleDiagnostics = useMemo(() => {
    const base =
      viewMode === 'problems' ? activeReport.problemDiagnostics : activeReport.matchDiagnostics;
    const q = searchQuery.trim().toLowerCase();
    return base.filter((d) => {
      if (roundFilter !== 'ALL' && d.match.roundName !== roundFilter) return false;
      if (q) {
        const text = [
          d.match.roundName,
          d.match.entryAName,
          d.match.entryBName,
          d.match.winnerName || '',
          d.match.id,
          ...d.issues.map((i) => `${i.title} ${i.description}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [activeReport, viewMode, roundFilter, searchQuery]);

  const getFallbackEntriesForDivision = (targetDiv: Division, divMatches: Match[]) => {
    const sourceRegs =
      targetDiv.id === division.id ? divisionRegistrations : allRegistrations;
    const divRegs = sourceRegs.filter(
      (r) => r.divisionId === targetDiv.id && r.status === 'confirmada'
    );
    const divGroups = allGroups.filter((g) => g.divisionId === targetDiv.id);
    if (targetDiv.format === 'grupos_y_final' && divGroups.length > 0) {
      const qualifiers = computeQualifiedSeededEntries(divGroups, divMatches, divRegs, targetDiv);
      if (qualifiers.length > 0) return qualifiers;
    }
    return divRegs;
  };

  const syncPodiumAndPlayerStats = async (
    targetDiv: Division,
    updatedDivMatches: Match[],
    affectedMatches: Match[],
    now: string
  ) => {
    const podiumPatch = computeKnockoutPodiumUpdate(targetDiv, updatedDivMatches);
    let updatedDivisions = allDivisions;
    if (podiumPatch) {
      const updatedDiv: Division = {
        ...targetDiv,
        ...podiumPatch,
        updatedAt: now,
      };
      await saveEntity('divisions', updatedDiv);
      updatedDivisions = allDivisions.map((d) => (d.id === updatedDiv.id ? updatedDiv : d));
    }

    const playerIdsToRefresh = new Set<string>();
    affectedMatches.forEach((m) => {
      (m.playerIdsA || []).forEach((pid) => playerIdsToRefresh.add(pid));
      (m.playerIdsB || []).forEach((pid) => playerIdsToRefresh.add(pid));
    });

    if (playerIdsToRefresh.size > 0) {
      const updatedMap = new Map(updatedDivMatches.map((m) => [m.id, m]));
      const nextAllMatches = dedupeMatches([
        ...allMatches.map((m) => updatedMap.get(m.id) || m),
        ...updatedDivMatches.filter((m) => !allMatches.some((orig) => orig.id === m.id)),
      ]);
      for (const pid of playerIdsToRefresh) {
        const pDoc = players.find((p) => p.id === pid);
        if (!pDoc) continue;
        const stats = computePlayerStatsFromMatches(
          pid,
          nextAllMatches,
          updatedDivisions,
          allRegistrations
        );
        await saveEntity('players_public', { ...pDoc, stats, updatedAt: now });
      }
    }
  };

  const openForcePanelForDiagnostic = (diag: EliminationMatchDiagnostic) => {
    if (forcingMatchId === diag.match.id) {
      setForcingMatchId(null);
      return;
    }
    setErrorMsg(null);
    setFeedback(null);
    setForcingMatchId(diag.match.id);

    // Preseleccionar participante
    if (diag.winnerCandidate.side) {
      setForceSide(diag.winnerCandidate.side);
    } else if (diag.match.entryAId) {
      setForceSide('A');
    } else {
      setForceSide('B');
    }

    // Preseleccionar partido destino
    const preferredTarget = diag.currentNextMatch || diag.suggestedNextMatch;
    if (preferredTarget) {
      setForceTargetMatchId(preferredTarget.id);
      setForceTargetSlot(diag.currentNextSlot || diag.suggestedNextSlot);
    } else {
      setForceTargetMatchId(NEW_MATCH_SENTINEL);
      setForceTargetSlot(diag.suggestedNextSlot);
    }

    setForceLinkStructure(true);
    setForceMarkSourceWinner(!diag.match.winnerEntryId);
    setForceClearTargetResultIfChanged(true);
    setForceNote(
      diag.match.isBye
        ? 'Pase libre (BYE) forzado desde diagnóstico'
        : `Avance manual desde diagnóstico (${userEmail})`
    );
  };

  const handleAutoRepairDivision = async (targetDiv: Division, silent = false) => {
    if (!canEdit) return;
    setRepairing(true);
    setErrorMsg(null);
    if (!silent) setFeedback(null);
    try {
      const now = new Date().toISOString();
      const rawDivMatches =
        targetDiv.id === division.id
          ? divisionMatches
          : tournamentMatches.filter((m) => m.divisionId === targetDiv.id);
      const fallbackEntries = getFallbackEntriesForDivision(targetDiv, rawDivMatches);
      const result = repairEliminationBracketWithMissingScaffolds(
        rawDivMatches,
        targetDiv,
        fallbackEntries
      );

      if (result.allAffectedMatches.length === 0) {
        if (!silent) {
          setFeedback(
            `El cuadro de ${targetDiv.name} no requirió cambios estructurales adicionales.`
          );
        }
        return { created: 0, updated: 0, propagated: 0 };
      }

      for (const m of result.allAffectedMatches) {
        await saveEntity('matches', { ...m, updatedAt: now });
      }

      const affectedById = new Map(result.allAffectedMatches.map((m) => [m.id, m]));
      const mergedDivMatches = dedupeMatches([
        ...rawDivMatches.map((m) => affectedById.get(m.id) || m),
        ...result.createdMatches,
      ]);
      await syncPodiumAndPlayerStats(targetDiv, mergedDivMatches, result.allAffectedMatches, now);

      if (!silent) {
        setFeedback(
          `Reparación aplicada en ${targetDiv.name}: ${result.createdMatches.length} llaves faltantes creadas, ${result.reconcileResult.repairedLinks} enlaces reparados y ${result.reconcileResult.propagatedWinners} pases/ganadores avanzados.`
        );
      }
      return {
        created: result.createdMatches.length,
        updated: result.updatedMatches.length,
        propagated: result.reconcileResult.propagatedWinners,
      };
    } catch (err) {
      setErrorMsg(
        formatFirestoreError(err, 'No se pudo ejecutar la auto-reparación del cuadro eliminatorio.')
      );
      return null;
    } finally {
      setRepairing(false);
    }
  };

  const handleAutoRepairAllDivisions = async () => {
    if (!canEdit) return;
    setRepairingAll(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      let totalCreated = 0;
      let totalPropagated = 0;
      let touchedDivisions = 0;
      for (const div of tournamentDivisions) {
        const rep = reportByDivisionId.get(div.id);
        if (!rep || rep.summary.totalIssues === 0) continue;
        const res = await handleAutoRepairDivision(div, true);
        if (res && (res.created > 0 || res.updated > 0 || res.propagated > 0)) {
          totalCreated += res.created;
          totalPropagated += res.propagated;
          touchedDivisions++;
        }
      }
      setFeedback(
        touchedDivisions > 0
          ? `Se repararon ${touchedDivisions} categorías: ${totalCreated} llaves faltantes creadas y ${totalPropagated} pases/ganadores actualizados.`
          : 'Todas las categorías ya estaban sincronizadas.'
      );
    } finally {
      setRepairingAll(false);
    }
  };

  const handleConfirmForceAdvance = async (diag: EliminationMatchDiagnostic) => {
    if (!canEdit) return;
    const sourceMatch = diag.match;
    const chosenEntryId = forceSide === 'A' ? sourceMatch.entryAId : sourceMatch.entryBId;
    const chosenEntryName = forceSide === 'A' ? sourceMatch.entryAName : sourceMatch.entryBName;
    const chosenPlayerIds =
      forceSide === 'A' ? sourceMatch.playerIdsA || [] : sourceMatch.playerIdsB || [];

    if (!chosenEntryId) {
      setErrorMsg(`El Lado ${forceSide} no tiene un jugador/pareja asignado para avanzar.`);
      return;
    }
    if (forceTargetMatchId === NEW_MATCH_SENTINEL && !canCreate) {
      setErrorMsg('Tu perfil no tiene permisos de creación para generar una llave nueva.');
      return;
    }

    setSavingForce(true);
    setErrorMsg(null);
    setFeedback(null);

    try {
      const now = new Date().toISOString();
      const shouldBePublished =
        division.drawStatus === 'publicado' ||
        divisionMatches.some((m) => m.published) ||
        sourceMatch.published;

      let targetMatch: Match | undefined;
      let createdNewScaffold = false;

      if (forceTargetMatchId === NEW_MATCH_SENTINEL) {
        const targetRoundName =
          diag.expectedNextRoundName ||
          (sourceMatch.roundName.toLowerCase().includes('32')
            ? 'Octavos de Final'
            : 'Siguiente Ronda');
        const targetRoundOrder = diag.expectedNextRoundOrder;
        const targetPos = diag.expectedNextBracketPos;

        // Enlazar la nueva llave con su ronda subsiguiente si ya existe
        const grandNextRoundMatches = diag.higherRoundMatches.filter(
          (hm) => hm.roundOrder > targetRoundOrder
        );
        const minGrandOrder =
          grandNextRoundMatches.length > 0
            ? Math.min(...grandNextRoundMatches.map((hm) => hm.roundOrder))
            : null;
        const immediateGrandMatches =
          minGrandOrder !== null
            ? grandNextRoundMatches.filter((hm) => hm.roundOrder === minGrandOrder)
            : [];
        const grandPos = Math.ceil(targetPos / 2);
        const grandMatch =
          immediateGrandMatches.find((gm) => gm.bracketPosition === grandPos) ||
          immediateGrandMatches[grandPos - 1] ||
          null;
        const grandSlot: 'A' | 'B' | null = grandMatch
          ? targetPos % 2 === 1
            ? 'A'
            : 'B'
          : null;

        targetMatch = buildMissingNextRoundMatchScaffold({
          division,
          roundName: targetRoundName,
          roundOrder: targetRoundOrder,
          bracketPosition: targetPos,
          nextMatchId: grandMatch?.id || null,
          nextMatchSlot: grandSlot,
          published: shouldBePublished,
          now,
        });
        createdNewScaffold = true;
      } else {
        targetMatch = diag.higherRoundMatches.find((hm) => hm.id === forceTargetMatchId);
      }

      if (!targetMatch) {
        setErrorMsg('Seleccioná un partido destino válido o creá una nueva llave.');
        setSavingForce(false);
        return;
      }

      // 1. Actualizar partido origen
      const nextSourceMatch: Match = {
        ...sourceMatch,
        nextMatchId: forceLinkStructure ? targetMatch.id : sourceMatch.nextMatchId || null,
        nextMatchSlot: forceLinkStructure
          ? forceTargetSlot
          : sourceMatch.nextMatchSlot || null,
        published: shouldBePublished ? true : sourceMatch.published,
        updatedAt: now,
      };

      const shouldUpdateSourceWinner =
        forceMarkSourceWinner ||
        (sourceMatch.isBye && !sourceMatch.winnerEntryId) ||
        sourceMatch.winnerEntryId !== chosenEntryId;

      if (shouldUpdateSourceWinner && forceMarkSourceWinner) {
        nextSourceMatch.winnerEntryId = chosenEntryId;
        nextSourceMatch.winnerName = chosenEntryName;
        if (nextSourceMatch.status === 'programado' || nextSourceMatch.status === 'en_curso') {
          nextSourceMatch.status = 'finalizado';
        }
        nextSourceMatch.outcomeNote =
          forceNote.trim() || nextSourceMatch.outcomeNote || 'Avance forzado desde diagnóstico';
        nextSourceMatch.correctionHistory = [
          ...(sourceMatch.correctionHistory || []).slice(-29),
          {
            id: `corr_${Date.now()}`,
            at: now,
            byEmail: userEmail || 'staff',
            reason: forceNote.trim() || 'Paso forzado manualmente desde diagnóstico de cuadro',
            previousScore: sourceMatch.winnerName || 'Sin definir',
            newScore: `Avanza: ${chosenEntryName}`,
            previousWinnerId: sourceMatch.winnerEntryId || null,
            newWinnerId: chosenEntryId,
          },
        ];
      }

      // 2. Actualizar partido destino
      const prevTargetOccupantId =
        forceTargetSlot === 'A' ? targetMatch.entryAId : targetMatch.entryBId;
      const targetOccupantChanged = Boolean(
        prevTargetOccupantId && prevTargetOccupantId !== chosenEntryId
      );
      const shouldResetTargetResult =
        forceClearTargetResultIfChanged && targetOccupantChanged;

      const updatedTargetMatch: Match = {
        ...targetMatch,
        entryAId: forceTargetSlot === 'A' ? chosenEntryId : targetMatch.entryAId || null,
        entryAName: forceTargetSlot === 'A' ? chosenEntryName : targetMatch.entryAName,
        playerIdsA: forceTargetSlot === 'A' ? [...chosenPlayerIds] : targetMatch.playerIdsA || [],
        entryBId: forceTargetSlot === 'B' ? chosenEntryId : targetMatch.entryBId || null,
        entryBName: forceTargetSlot === 'B' ? chosenEntryName : targetMatch.entryBName,
        playerIdsB: forceTargetSlot === 'B' ? [...chosenPlayerIds] : targetMatch.playerIdsB || [],
        published: shouldBePublished ? true : targetMatch.published,
        updatedAt: now,
      };

      // Si antes era BYE pero ahora ambos lados tienen participantes reales, normalizar
      if (updatedTargetMatch.isBye && updatedTargetMatch.entryAId && updatedTargetMatch.entryBId) {
        updatedTargetMatch.isBye = false;
        if (updatedTargetMatch.outcomeNote === 'Pase libre (BYE)') {
          updatedTargetMatch.sets = [];
          updatedTargetMatch.winnerEntryId = null;
          updatedTargetMatch.winnerName = null;
          updatedTargetMatch.outcomeNote = null;
          updatedTargetMatch.status = 'programado';
        }
      }

      if (shouldResetTargetResult) {
        updatedTargetMatch.sets = [];
        updatedTargetMatch.winnerEntryId = null;
        updatedTargetMatch.winnerName = null;
        updatedTargetMatch.outcomeNote = null;
        updatedTargetMatch.status = 'programado';
      }

      await saveEntity('matches', nextSourceMatch);
      await saveEntity('matches', updatedTargetMatch);

      // 3. Reconciliar posibles efectos posteriores (sin perder el enlace manual recién fijado)
      const baseDivMatches = dedupeMatches([
        ...divisionMatches.map((m) =>
          m.id === nextSourceMatch.id
            ? nextSourceMatch
            : m.id === updatedTargetMatch.id
            ? updatedTargetMatch
            : m
        ),
        ...(createdNewScaffold ? [updatedTargetMatch] : []),
      ]);
      const fallbackEntries = getFallbackEntriesForDivision(division, baseDivMatches);
      const cascaded = reconcileKnockoutBracket(baseDivMatches, division, fallbackEntries);
      const extraUpdated: Match[] = [];
      for (const em of cascaded.updatedMatches) {
        if (em.id !== nextSourceMatch.id && em.id !== updatedTargetMatch.id) {
          const savedExtra = { ...em, updatedAt: now };
          await saveEntity('matches', savedExtra);
          extraUpdated.push(savedExtra);
        }
      }

      const finalSaved = [nextSourceMatch, updatedTargetMatch, ...extraUpdated];
      const finalById = new Map(finalSaved.map((m) => [m.id, m]));
      const finalDivMatches = dedupeMatches(
        baseDivMatches.map((m) => finalById.get(m.id) || m)
      );
      await syncPodiumAndPlayerStats(division, finalDivMatches, finalSaved, now);

      setForcingMatchId(null);
      setFeedback(
        `Paso forzado con éxito: "${chosenEntryName}" ahora ocupa Lado ${forceTargetSlot} de ${updatedTargetMatch.roundName} (#${updatedTargetMatch.bracketPosition || '?'})${createdNewScaffold ? ' (llave creada automáticamente)' : ''}.`
      );
    } catch (err) {
      setErrorMsg(
        formatFirestoreError(err, 'No se pudo forzar el pase a la siguiente ronda en Firestore.')
      );
    } finally {
      setSavingForce(false);
    }
  };

  const handleClearInconsistentSlot = async (
    diag: EliminationMatchDiagnostic,
    side: 'A' | 'B'
  ) => {
    if (!canEdit) return;
    const m = diag.match;
    const key = `${m.id}::${side}`;
    setClearingSlotKey(key);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const clearedName = side === 'A' ? m.entryAName : m.entryBName;
      const clearedWasWinner =
        Boolean(m.winnerEntryId) &&
        m.winnerEntryId === (side === 'A' ? m.entryAId : m.entryBId);

      const updated: Match = {
        ...m,
        entryAId: side === 'A' ? null : m.entryAId || null,
        entryAName: side === 'A' ? 'Por definir' : m.entryAName,
        playerIdsA: side === 'A' ? [] : m.playerIdsA || [],
        entryBId: side === 'B' ? null : m.entryBId || null,
        entryBName: side === 'B' ? 'Por definir' : m.entryBName,
        playerIdsB: side === 'B' ? [] : m.playerIdsB || [],
        isBye: false,
        sets: clearedWasWinner || m.sets.length > 0 ? [] : m.sets,
        winnerEntryId: null,
        winnerName: null,
        outcomeNote: null,
        status: 'programado',
        correctionHistory: [
          ...(m.correctionHistory || []).slice(-29),
          {
            id: `corr_${Date.now()}`,
            at: now,
            byEmail: userEmail || 'staff',
            reason: `Ranura inconsistente Lado ${side} (${clearedName}) limpiada desde diagnóstico`,
            previousScore: m.winnerName || `${m.entryAName} vs ${m.entryBName}`,
            newScore: `Lado ${side}: Por definir`,
            previousWinnerId: m.winnerEntryId || null,
            newWinnerId: null,
          },
        ],
        updatedAt: now,
      };

      await saveEntity('matches', updated);

      const nextDivMatches = dedupeMatches(
        divisionMatches.map((item) => (item.id === updated.id ? updated : item))
      );
      await syncPodiumAndPlayerStats(division, nextDivMatches, [updated], now);

      setFeedback(
        `Se limpió la ranura inconsistente Lado ${side} ("${clearedName}") en ${m.roundName} #${m.bracketPosition || '?'}. Ahora figura "Por definir".`
      );
    } catch (err) {
      setErrorMsg(
        formatFirestoreError(err, 'No se pudo limpiar la ranura inconsistente en Firestore.')
      );
    } finally {
      setClearingSlotKey(null);
    }
  };

  const handlePublishMatch = async (m: Match) => {
    if (!canEdit) return;
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      await saveEntity('matches', { ...m, published: true, updatedAt: now });
      setFeedback(`Partido "${m.entryAName} vs ${m.entryBName}" publicado en el cuadro.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo publicar el partido.'));
    }
  };

  const selectedTargetMatchObj = useMemo(() => {
    if (forceTargetMatchId === NEW_MATCH_SENTINEL) return null;
    const currentDiag = activeReport.matchDiagnostics.find((d) => d.match.id === forcingMatchId);
    return currentDiag?.higherRoundMatches.find((hm) => hm.id === forceTargetMatchId) || null;
  }, [forceTargetMatchId, activeReport.matchDiagnostics, forcingMatchId]);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#7C1FA2] inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Herramienta de Diagnóstico y Reparación de Cuadro
          </p>
          <h2 className="text-xl font-bold text-[#0A1633] mt-0.5">
            Diagnóstico de Fase Eliminatoria — {division.name}
          </h2>
          <p className="text-xs text-[#475569] mt-0.5">
            Detecta partidos huérfanos, llaves faltantes en rondas siguientes, BYEs o ganadores sin
            avanzar, colisiones de ranura y cruces inconsistentes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenScoringTab && (
            <button
              type="button"
              onClick={onOpenScoringTab}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-[#7C1FA2]" />
              Ir a Marcadores
            </button>
          )}

          {canEdit && activeReport.totalKoMatches > 0 && (
            <button
              type="button"
              disabled={repairing || repairingAll}
              onClick={() => handleAutoRepairDivision(division, false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-60 transition-colors"
            >
              <Wrench className={`w-3.5 h-3.5 ${repairing ? 'animate-spin' : ''}`} />
              {repairing
                ? 'Reparando cuadro...'
                : activeReport.summary.missingMatchesCount > 0
                ? 'Auto-reparar (crear llaves faltantes y avanzar)'
                : 'Auto-reparar cuadro y avanzar pendientes'}
            </button>
          )}

          {canEdit && totalTournamentIssues.divisionsWithIssues > 1 && (
            <button
              type="button"
              disabled={repairing || repairingAll}
              onClick={handleAutoRepairAllDivisions}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${repairingAll ? 'animate-spin' : ''}`} />
              {repairingAll
                ? 'Reparando todas...'
                : `Reparar todas las categorías (${totalTournamentIssues.total})`}
            </button>
          )}
        </div>
      </div>

      {/* Selector rápido por categoría con badge de incidencias */}
      {tournamentDivisions.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-2.5">
          <p className="text-xs font-semibold text-[#0A1633]">
            Categorías de {tournament.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {tournamentDivisions.map((d) => {
              const rep = reportByDivisionId.get(d.id);
              const isSelected = d.id === division.id;
              const issues = rep?.summary.totalIssues || 0;
              const hasKo = (rep?.totalKoMatches || 0) > 0;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onSelectDivision(d.id);
                    setForcingMatchId(null);
                    setRoundFilter('ALL');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                      : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0] hover:bg-purple-50'
                  }`}
                >
                  <span>{d.name}</span>
                  {!hasKo ? (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Sin cuadro
                    </span>
                  ) : issues > 0 ? (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        isSelected
                          ? 'bg-red-500 text-white'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}
                    >
                      {issues} {issues === 1 ? 'incidencia' : 'incidencias'}
                    </span>
                  ) : (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                        isSelected
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      OK
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback / Errores */}
      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs font-medium text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-[11px] font-medium text-[#475569]">Partidos en eliminación</p>
          <p className="text-2xl font-bold text-[#0A1633] mt-1">{activeReport.totalKoMatches}</p>
          <p className="text-[11px] text-[#475569] mt-0.5">
            {activeReport.rounds.length}{' '}
            {activeReport.rounds.length === 1 ? 'ronda detectada' : 'rondas detectadas'}
          </p>
        </div>

        <div
          className={`border rounded-2xl p-4 ${
            activeReport.summary.orphansCount > 0 || activeReport.summary.missingMatchesCount > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-[#E2E8F0]'
          }`}
        >
          <p className="text-[11px] font-medium text-[#475569]">
            Partidos huérfanos / sin llave destino
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${
              activeReport.summary.orphansCount > 0 ? 'text-red-800' : 'text-[#0A1633]'
            }`}
          >
            {activeReport.summary.orphansCount}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5">
            {activeReport.summary.missingMatchesCount > 0
              ? `Faltan ${activeReport.summary.missingMatchesCount} llaves en rondas siguientes`
              : 'Árbol estructural completo'}
          </p>
        </div>

        <div
          className={`border rounded-2xl p-4 ${
            activeReport.summary.inconsistentCount > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-[#E2E8F0]'
          }`}
        >
          <p className="text-[11px] font-medium text-[#475569]">Cruces inconsistentes</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              activeReport.summary.inconsistentCount > 0 ? 'text-amber-900' : 'text-[#0A1633]'
            }`}
          >
            {activeReport.summary.inconsistentCount}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5">
            {activeReport.summary.collisionsCount > 0
              ? `${activeReport.summary.collisionsCount} colisiones de ranura`
              : 'Validado contra cruces previos'}
          </p>
        </div>

        <div
          className={`border rounded-2xl p-4 ${
            activeReport.summary.unpropagatedCount > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-[#E2E8F0]'
          }`}
        >
          <p className="text-[11px] font-medium text-[#475569]">BYEs / ganadores sin avanzar</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              activeReport.summary.unpropagatedCount > 0 ? 'text-amber-900' : 'text-[#0A1633]'
            }`}
          >
            {activeReport.summary.unpropagatedCount}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5">
            Total incidencias: {activeReport.summary.totalIssues}
          </p>
        </div>
      </div>

      {/* Mapa por rondas (estructura esperada vs actual) */}
      {activeReport.rounds.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#0A1633] inline-flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-[#7C1FA2]" />
              Integridad estructural por ronda
            </h3>
            <span className="text-[11px] text-[#475569]">
              Clic en una ronda para filtrar la tabla
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {activeReport.rounds.map((r) => {
              const selected = roundFilter === r.roundName;
              return (
                <button
                  key={`${r.roundOrder}-${r.roundName}`}
                  type="button"
                  onClick={() => setRoundFilter(selected ? 'ALL' : r.roundName)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selected
                      ? 'border-[#7C1FA2] bg-purple-50'
                      : r.isMissingMatches || r.issueCount > 0
                      ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-50'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0A1633] truncate">
                      {r.roundName}
                    </span>
                    <span className="text-[10px] font-mono text-[#475569]">
                      Ord {r.roundOrder}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span
                      className={
                        r.isMissingMatches
                          ? 'font-bold text-red-700'
                          : 'font-medium text-[#475569]'
                      }
                    >
                      Llaves: {r.matchCount}/{r.expectedMatchCount}
                    </span>
                    <span
                      className={
                        r.issueCount > 0
                          ? 'font-semibold text-amber-800'
                          : 'font-semibold text-emerald-700'
                      }
                    >
                      {r.issueCount > 0 ? `${r.issueCount} con alerta` : 'Completa'}
                    </span>
                  </div>
                  {r.missingPositions.length > 0 && (
                    <p className="mt-1 text-[10px] font-semibold text-red-700">
                      Falta posición #{r.missingPositions.join(', #')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros y Tabla de Diagnóstico */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('problems')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                viewMode === 'problems'
                  ? 'bg-[#0A1633] text-white'
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
              }`}
            >
              Solo huérfanos e inconsistentes ({activeReport.problemDiagnostics.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                viewMode === 'all'
                  ? 'bg-[#0A1633] text-white'
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
              }`}
            >
              Todos los partidos ({activeReport.matchDiagnostics.length})
            </button>

            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              className="h-8 px-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
            >
              <option value="ALL">Todas las rondas</option>
              {activeReport.rounds.map((r) => (
                <option key={r.roundName} value={r.roundName}>
                  {r.roundName} ({r.matchCount})
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar jugador, ej. Pasmanter..."
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs focus:outline-none focus:border-[#7C1FA2]"
            />
          </div>
        </div>

        {activeReport.totalKoMatches === 0 ? (
          <div className="p-8 text-center text-sm text-[#475569]">
            Esta división no tiene partidos en fase eliminatoria cargados todavía.
          </div>
        ) : visibleDiagnostics.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-[#0A1633]">
              {viewMode === 'problems' && !searchQuery && roundFilter === 'ALL'
                ? 'No se detectaron partidos huérfanos ni cruces inconsistentes en esta categoría.'
                : 'No hay partidos que coincidan con el filtro seleccionado.'}
            </p>
            {viewMode === 'problems' && (
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className="text-xs font-semibold text-[#7C1FA2] hover:underline"
              >
                Ver todos los partidos eliminatorios ({activeReport.matchDiagnostics.length})
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                  <th className="py-2.5 px-3">Ronda / Pos</th>
                  <th className="py-2.5 px-3">Enfrentamiento y Estado</th>
                  <th className="py-2.5 px-3">Diagnóstico</th>
                  <th className="py-2.5 px-3">Destino siguiente ronda</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {visibleDiagnostics.map((diag) => {
                  const m = diag.match;
                  const isForceOpen = forcingMatchId === m.id;
                  const inconsistentSides = diag.slotChecks.filter((sc) => !sc.isConsistent);

                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        className={
                          diag.statusSeverity === 'critical'
                            ? 'bg-red-50/40 hover:bg-red-50/70'
                            : diag.statusSeverity === 'warning'
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-[#F8FAFC]'
                        }
                      >
                        {/* Ronda / Pos */}
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-bold text-[#0A1633]">{m.roundName}</div>
                          <div className="text-[11px] text-[#475569] mt-0.5">
                            Pos #{m.bracketPosition ?? '?'} · Ord {m.roundOrder}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.isBye ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                BYE
                              </span>
                            ) : m.winnerEntryId ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                {m.status === 'wo' ? 'W.O.' : 'Finalizado'}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                                Por disputar
                              </span>
                            )}
                            {!m.published && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                Borrador
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Enfrentamiento */}
                        <td className="py-3 px-3 align-top min-w-[200px]">
                          <div className="space-y-1">
                            <div
                              className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg border ${
                                m.winnerEntryId && m.winnerEntryId === m.entryAId
                                  ? 'bg-emerald-50 border-emerald-200 font-semibold text-[#0A1633]'
                                  : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                              }`}
                            >
                              <span className="truncate">
                                <span className="text-[10px] text-[#475569] mr-1">A:</span>
                                {m.entryAName}
                              </span>
                              {m.winnerEntryId && m.winnerEntryId === m.entryAId && (
                                <span className="text-[10px] font-bold text-emerald-700 shrink-0">
                                  Ganador
                                </span>
                              )}
                            </div>
                            <div
                              className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg border ${
                                m.winnerEntryId && m.winnerEntryId === m.entryBId
                                  ? 'bg-emerald-50 border-emerald-200 font-semibold text-[#0A1633]'
                                  : 'bg-white border-[#E2E8F0] text-[#0A1633]'
                              }`}
                            >
                              <span className="truncate">
                                <span className="text-[10px] text-[#475569] mr-1">B:</span>
                                {m.entryBName}
                              </span>
                              {m.winnerEntryId && m.winnerEntryId === m.entryBId && (
                                <span className="text-[10px] font-bold text-emerald-700 shrink-0">
                                  Ganador
                                </span>
                              )}
                            </div>
                          </div>
                          {m.sets.length > 0 && (
                            <p className="text-[11px] text-[#475569] mt-1 font-mono">
                              Sets: {m.sets.map((s) => `${s.a}-${s.b}`).join(' ')}
                            </p>
                          )}
                          <p className="text-[10px] text-[#94A3B8] mt-1 font-mono truncate max-w-[210px]">
                            ID: {m.id}
                          </p>
                        </td>

                        {/* Diagnóstico */}
                        <td className="py-3 px-3 align-top min-w-[240px]">
                          {diag.issues.length === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Cruce íntegro y consistente
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              {diag.issues.map((issue, iIdx) => (
                                <div
                                  key={`${m.id}-${issue.code}-${iIdx}`}
                                  className={`p-2 rounded-lg border text-[11px] ${
                                    issue.severity === 'critical'
                                      ? 'bg-red-50 border-red-200 text-red-950'
                                      : 'bg-amber-50 border-amber-200 text-amber-950'
                                  }`}
                                >
                                  <div className="flex items-center gap-1 font-bold">
                                    <ShieldAlert className="w-3 h-3 shrink-0" />
                                    <span>{issue.title}</span>
                                  </div>
                                  <p className="mt-0.5 leading-snug opacity-90">
                                    {issue.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Destino actual */}
                        <td className="py-3 px-3 align-top min-w-[180px]">
                          {diag.isFinal ? (
                            <span className="text-[11px] font-semibold text-[#7C1FA2]">
                              Final del torneo
                            </span>
                          ) : diag.isThirdPlace ? (
                            <span className="text-[11px] font-medium text-[#475569]">
                              Definición 3er puesto
                            </span>
                          ) : diag.currentNextMatch ? (
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A1633]">
                                <Link2 className="w-3 h-3 text-[#7C1FA2]" />
                                {diag.currentNextMatch.roundName} #
                                {diag.currentNextMatch.bracketPosition ?? '?'} · Lado{' '}
                                {diag.currentNextSlot}
                              </div>
                              <p className="text-[11px] text-[#475569]">
                                {diag.currentNextMatch.entryAName} vs{' '}
                                {diag.currentNextMatch.entryBName}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 text-[11px] font-semibold">
                                Sin enlace destino
                              </span>
                              {diag.suggestedNextMatch ? (
                                <p className="text-[11px] text-[#475569]">
                                  Sugerido: {diag.suggestedNextMatch.roundName} #
                                  {diag.suggestedNextMatch.bracketPosition ?? '?'} · Lado{' '}
                                  {diag.suggestedNextSlot}
                                </p>
                              ) : (
                                <p className="text-[11px] text-red-700 font-medium">
                                  Falta crear llave #{diag.expectedNextBracketPos} en{' '}
                                  {diag.expectedNextRoundName || 'siguiente ronda'}
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end gap-1.5">
                            {canEdit && diag.canForceAdvance && (
                              <button
                                type="button"
                                onClick={() => openForcePanelForDiagnostic(diag)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                                  isForceOpen
                                    ? 'bg-[#0A1633] text-white'
                                    : diag.statusSeverity === 'critical'
                                    ? 'bg-[#7C1FA2] text-white hover:bg-[#6B1A8B]'
                                    : 'border border-[#7C1FA2] text-[#7C1FA2] bg-white hover:bg-purple-50'
                                }`}
                              >
                                <ArrowRight className="w-3 h-3" />
                                {isForceOpen ? 'Cerrar panel' : 'Forzar paso a sig. ronda'}
                              </button>
                            )}

                            {canEdit &&
                              inconsistentSides.map((sc) => {
                                const busy = clearingSlotKey === `${m.id}::${sc.side}`;
                                return (
                                  <button
                                    key={`clear-${m.id}-${sc.side}`}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleClearInconsistentSlot(diag, sc.side)}
                                    title={`Limpiar ${sc.currentEntryName} de Lado ${sc.side} y dejar "Por definir"`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-400 bg-amber-50 text-amber-950 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-60"
                                  >
                                    <Eraser className="w-3 h-3" />
                                    {busy ? 'Limpiando...' : `Limpiar Lado ${sc.side}`}
                                  </button>
                                );
                              })}

                            {canEdit && !m.published && (
                              <button
                                type="button"
                                onClick={() => handlePublishMatch(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-[#0A1633] text-[11px] font-medium hover:bg-slate-50"
                              >
                                <Sparkles className="w-3 h-3 text-[#7C1FA2]" />
                                Publicar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Panel inline "Forzar paso a siguiente ronda" */}
                      {isForceOpen && (
                        <tr className="bg-purple-50/60">
                          <td colSpan={5} className="p-4 border-t border-purple-200">
                            <div className="bg-white border border-purple-200 rounded-xl p-4 space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0]">
                                <div>
                                  <h4 className="text-xs font-bold text-[#0A1633] inline-flex items-center gap-1.5">
                                    <ArrowRight className="w-3.5 h-3.5 text-[#7C1FA2]" />
                                    Forzar paso manual desde {m.roundName} (#{m.bracketPosition ?? '?'})
                                  </h4>
                                  <p className="text-[11px] text-[#475569] mt-0.5">
                                    Elegí qué jugador avanza, la llave de la siguiente ronda (o creá una
                                    nueva si falta) y en qué lado se ubica.
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* 1. Participante */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                                    1. Participante que avanza
                                  </label>
                                  <div className="space-y-1.5">
                                    <button
                                      type="button"
                                      disabled={!m.entryAId}
                                      onClick={() => setForceSide('A')}
                                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors disabled:opacity-40 ${
                                        forceSide === 'A'
                                          ? 'border-[#7C1FA2] bg-purple-50 font-semibold text-[#0A1633]'
                                          : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]'
                                      }`}
                                    >
                                      Lado A: {m.entryAName}
                                      {diag.winnerCandidate.side === 'A' ? ' (Ganador/BYE)' : ''}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!m.entryBId}
                                      onClick={() => setForceSide('B')}
                                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors disabled:opacity-40 ${
                                        forceSide === 'B'
                                          ? 'border-[#7C1FA2] bg-purple-50 font-semibold text-[#0A1633]'
                                          : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]'
                                      }`}
                                    >
                                      Lado B: {m.entryBName}
                                      {diag.winnerCandidate.side === 'B' ? ' (Ganador/BYE)' : ''}
                                    </button>
                                  </div>
                                </div>

                                {/* 2. Llave destino */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                                    2. Llave destino en ronda siguiente
                                  </label>
                                  <select
                                    value={forceTargetMatchId}
                                    onChange={(e) => setForceTargetMatchId(e.target.value)}
                                    className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                                  >
                                    {canCreate && (
                                      <option value={NEW_MATCH_SENTINEL}>
                                        + Crear nueva llave en{' '}
                                        {diag.expectedNextRoundName || 'siguiente ronda'} (Pos #
                                        {diag.expectedNextBracketPos})
                                      </option>
                                    )}
                                    {diag.higherRoundMatches.map((hm) => (
                                      <option key={hm.id} value={hm.id}>
                                        {hm.roundName} #{hm.bracketPosition ?? '?'}: {hm.entryAName} vs{' '}
                                        {hm.entryBName}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="text-[10px] text-[#475569] mt-1.5">
                                    {forceTargetMatchId === NEW_MATCH_SENTINEL ? (
                                      <span className="inline-flex items-center gap-1 text-[#7C1FA2] font-medium">
                                        <PlusCircle className="w-3 h-3" />
                                        Se creará una llave nueva y se enlazará con el resto del cuadro.
                                      </span>
                                    ) : selectedTargetMatchObj ? (
                                      `Actual: A="${selectedTargetMatchObj.entryAName}" | B="${selectedTargetMatchObj.entryBName}"`
                                    ) : null}
                                  </p>
                                </div>

                                {/* 3. Lado destino */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                                    3. Ranura destino en esa llave
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setForceTargetSlot('A')}
                                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                                        forceTargetSlot === 'A'
                                          ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                                          : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0]'
                                      }`}
                                    >
                                      Lado A
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setForceTargetSlot('B')}
                                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                                        forceTargetSlot === 'B'
                                          ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                                          : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0]'
                                      }`}
                                    >
                                      Lado B
                                    </button>
                                  </div>
                                  {selectedTargetMatchObj && (
                                    <p className="text-[10px] text-[#475569] mt-1.5">
                                      Ocupado hoy por:{' '}
                                      <strong>
                                        {forceTargetSlot === 'A'
                                          ? selectedTargetMatchObj.entryAName
                                          : selectedTargetMatchObj.entryBName}
                                      </strong>
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5 text-xs text-[#0A1633]">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={forceLinkStructure}
                                      onChange={(e) => setForceLinkStructure(e.target.checked)}
                                      className="rounded border-slate-300 text-[#7C1FA2]"
                                    />
                                    <span>Guardar enlace estructural (nextMatchId / nextMatchSlot)</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={forceMarkSourceWinner}
                                      onChange={(e) => setForceMarkSourceWinner(e.target.checked)}
                                      className="rounded border-slate-300 text-[#7C1FA2]"
                                    />
                                    <span>
                                      Confirmar al participante elegido como ganador del cruce origen
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={forceClearTargetResultIfChanged}
                                      onChange={(e) =>
                                        setForceClearTargetResultIfChanged(e.target.checked)
                                      }
                                      className="rounded border-slate-300 text-[#7C1FA2]"
                                    />
                                    <span>
                                      Limpiar resultado previo del partido destino si cambia de jugador
                                    </span>
                                  </label>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-[#0A1633] mb-1">
                                    Motivo / nota de auditoría (opcional)
                                  </label>
                                  <input
                                    type="text"
                                    value={forceNote}
                                    onChange={(e) => setForceNote(e.target.value)}
                                    placeholder="Ej. Corrección llave Pasmanter"
                                    className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                                <button
                                  type="button"
                                  onClick={() => setForcingMatchId(null)}
                                  className="px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:text-[#0A1633]"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={savingForce}
                                  onClick={() => handleConfirmForceAdvance(diag)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-60"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {savingForce ? 'Guardando...' : 'Confirmar y forzar paso'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
