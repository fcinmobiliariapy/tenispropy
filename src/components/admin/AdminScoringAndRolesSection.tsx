import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Shield, Trash2, Trophy } from 'lucide-react';
import {
  CorrectionRecord,
  Division,
  Group,
  Match,
  MatchStatus,
  PlayerPublic,
  Registration,
  SetScore,
  StaffRole,
  Tournament,
  UserRole,
} from '../../types/tennis';
import { formatScoreString, validateAndDetermineWinner } from '../../utils/itfRules';
import {
  analyzeDuplicateMatches,
  compareMatchesByRound,
  computeGroupStandings,
  computePlayerStatsFromMatches,
  findAffectedDownstreamMatches,
  makeId,
} from '../../utils/tournamentEngine';
import {
  deleteMatchesBatch,
  publishNotificationAndBroadcast,
  removeEntity,
  saveEntity,
  saveStaffRole,
} from '../../services/firestoreService';
import { buildMatchWhatsAppMessage } from '../../utils/whatsappShare';
import { WhatsAppShareButton } from '../WhatsAppShareButton';

interface Props {
  tournament: Tournament;
  division: Division;
  divisionMatches: Match[];
  allMatches: Match[];
  allDivisions: Division[];
  divisionGroups: Group[];
  divisionRegistrations: Registration[];
  allRegistrations: Registration[];
  players: PlayerPublic[];
  userEmail: string;
  isSuperAdmin: boolean;
  staffRoles: StaffRole[];
  onRefreshStaffRoles: () => void;
}

export const AdminScoringAndRolesSection: React.FC<Props> = ({
  tournament,
  division,
  divisionMatches,
  allMatches,
  allDivisions,
  divisionGroups,
  divisionRegistrations,
  allRegistrations,
  players,
  userEmail,
  isSuperAdmin,
  staffRoles,
  onRefreshStaffRoles,
}) => {
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

  // Gestión de roles (Superadmin)
  const [roleUid, setRoleUid] = useState('');
  const [roleEmail, setRoleEmail] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleType, setRoleType] = useState<UserRole>('operador');
  const [roleTournaments, setRoleTournaments] = useState<string>(tournament.id);

  const duplicateAnalysis = useMemo(
    () => analyzeDuplicateMatches(divisionMatches),
    [divisionMatches]
  );

  const duplicateIdSet = useMemo(
    () => new Set(duplicateAnalysis.duplicateMatches.map((m) => m.id)),
    [duplicateAnalysis]
  );

  const playableMatches = useMemo(
    () =>
      divisionMatches
        .filter((m) => !m.isBye && m.entryAId && m.entryBId)
        .sort(compareMatchesByRound),
    [divisionMatches]
  );

  const activeMatch =
    playableMatches.find((m) => m.id === selectedMatchId) || playableMatches[0] || null;

  const loadMatchIntoEditor = (m: Match) => {
    setSelectedMatchId(m.id);
    setErrorMsg(null);
    setFeedback(null);
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

  const applyScoreAndCascade = async (confirmedCascade: boolean) => {
    if (!activeMatch || !liveValidation) return;
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
      divisionMatches,
      liveValidation.winnerEntryId
    );
    if (affected.length > 0 && !confirmedCascade) {
      setPendingAffectedMatches(affected);
      return;
    }

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

    const updatedMatch: Match = {
      ...activeMatch,
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

    // Actualizar lista local para cálculos en cascada
    const nextDivMatches = divisionMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
    const nextAllMatches = allMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));

    // 1. Recalcular tabla de posiciones si pertenece a un grupo
    if (updatedMatch.groupId) {
      const grp = divisionGroups.find((g) => g.id === updatedMatch.groupId);
      if (grp) {
        const recalculated = computeGroupStandings(
          grp,
          nextDivMatches,
          divisionRegistrations,
          division
        );
        await saveEntity('groups', { ...grp, standings: recalculated, updatedAt: now });
      }
    }

    // 2. Avanzar ganador en cuadro de eliminación directa (y perdedor al 3er Puesto si aplica)
    if (updatedMatch.phase === 'eliminacion' && updatedMatch.nextMatchId && updatedMatch.nextMatchSlot) {
      const nextMatch = nextDivMatches.find((m) => m.id === updatedMatch.nextMatchId);
      if (nextMatch) {
        const winnerIsA = liveValidation.winnerEntryId === updatedMatch.entryAId;
        const winnerPlayerIds = winnerIsA ? updatedMatch.playerIdsA : updatedMatch.playerIdsB;

        const patchedNext: Match = {
          ...nextMatch,
          entryAId: updatedMatch.nextMatchSlot === 'A' ? liveValidation.winnerEntryId : nextMatch.entryAId,
          entryAName: updatedMatch.nextMatchSlot === 'A' ? liveValidation.winnerName || 'Por definir' : nextMatch.entryAName,
          playerIdsA: updatedMatch.nextMatchSlot === 'A' ? winnerPlayerIds : nextMatch.playerIdsA,
          entryBId: updatedMatch.nextMatchSlot === 'B' ? liveValidation.winnerEntryId : nextMatch.entryBId,
          entryBName: updatedMatch.nextMatchSlot === 'B' ? liveValidation.winnerName || 'Por definir' : nextMatch.entryBName,
          playerIdsB: updatedMatch.nextMatchSlot === 'B' ? winnerPlayerIds : nextMatch.playerIdsB,
          sets: affected.length > 0 ? [] : nextMatch.sets,
          winnerEntryId: affected.length > 0 ? null : nextMatch.winnerEntryId,
          winnerName: affected.length > 0 ? null : nextMatch.winnerName,
          status: affected.length > 0 ? 'programado' : nextMatch.status,
          updatedAt: now,
        };
        await saveEntity('matches', patchedNext);

        // Si el siguiente partido es la Final, enviar perdedor de la Semifinal al partido de Tercer Puesto
        if (!nextMatch.nextMatchId && !nextMatch.isThirdPlace) {
          const thirdPlaceMatch = nextDivMatches.find(
            (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
          );
          if (thirdPlaceMatch) {
            const loserEntryId = winnerIsA ? updatedMatch.entryBId || null : updatedMatch.entryAId || null;
            const loserName = winnerIsA ? updatedMatch.entryBName : updatedMatch.entryAName;
            const loserPlayerIds = winnerIsA ? updatedMatch.playerIdsB : updatedMatch.playerIdsA;
            const patchedThird: Match = {
              ...thirdPlaceMatch,
              entryAId: updatedMatch.nextMatchSlot === 'A' ? loserEntryId : thirdPlaceMatch.entryAId,
              entryAName: updatedMatch.nextMatchSlot === 'A' ? loserName : thirdPlaceMatch.entryAName,
              playerIdsA: updatedMatch.nextMatchSlot === 'A' ? loserPlayerIds : thirdPlaceMatch.playerIdsA,
              entryBId: updatedMatch.nextMatchSlot === 'B' ? loserEntryId : thirdPlaceMatch.entryBId,
              entryBName: updatedMatch.nextMatchSlot === 'B' ? loserName : thirdPlaceMatch.entryBName,
              playerIdsB: updatedMatch.nextMatchSlot === 'B' ? loserPlayerIds : thirdPlaceMatch.playerIdsB,
              sets: affected.length > 0 ? [] : thirdPlaceMatch.sets,
              winnerEntryId: affected.length > 0 ? null : thirdPlaceMatch.winnerEntryId,
              winnerName: affected.length > 0 ? null : thirdPlaceMatch.winnerName,
              status: affected.length > 0 ? 'programado' : thirdPlaceMatch.status,
              updatedAt: now,
            };
            await saveEntity('matches', patchedThird);
          }
        }
      }
    }

    // 3. Si es la Final o el partido de Tercer Puesto, actualizar el podio de la división
    let updatedDivisions = allDivisions;
    if (
      updatedMatch.phase === 'eliminacion' &&
      !updatedMatch.nextMatchId &&
      liveValidation.winnerEntryId
    ) {
      if (updatedMatch.isThirdPlace || updatedMatch.roundName === 'Tercer Puesto') {
        const updatedDiv: Division = {
          ...division,
          thirdPlaceEntryId: liveValidation.winnerEntryId,
          thirdPlaceName: liveValidation.winnerName,
          updatedAt: now,
        };
        await saveEntity('divisions', updatedDiv);
        updatedDivisions = allDivisions.map((d) => (d.id === updatedDiv.id ? updatedDiv : d));
      } else {
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
      }
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

    setPendingAffectedMatches(null);
    setCorrectionReason('');
    setFeedback(`Marcador confirmado (${formatScoreString(setsToSave, status)}). Ganador: ${liveValidation.winnerName}.`);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleUid.trim() || !roleEmail.trim()) return;
    const now = new Date().toISOString();
    const staff: StaffRole = {
      uid: roleUid.trim(),
      email: roleEmail.trim(),
      displayName: roleName.trim() || roleEmail.trim(),
      role: roleType,
      assignedTournamentIds: roleTournaments
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };
    await saveStaffRole(staff);
    setRoleUid('');
    setRoleEmail('');
    setRoleName('');
    onRefreshStaffRoles();
    setFeedback(`Rol ${staff.role} asignado a ${staff.email}.`);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-[#7C1FA2] font-medium">
          {division.itfConfig.edition} · {division.itfConfig.setsToWin === 2 ? 'Mejor de 3 sets' : division.itfConfig.setsToWin === 1 ? 'Set único' : 'Mejor de 5 sets'}
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
        {/* Lista de partidos de la división */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#0A1633]">
              Partidos ({playableMatches.length})
            </h3>
            {duplicateAnalysis.duplicateMatches.length > 0 && isSuperAdmin && (
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
                    setErrorMsg(err instanceof Error ? err.message : 'No se pudieron eliminar duplicados.');
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
          <div className="divide-y divide-[#E2E8F0] max-h-[520px] overflow-y-auto">
            {playableMatches.map((m) => {
              const selected = activeMatch?.id === m.id;
              const isDup = duplicateIdSet.has(m.id);
              return (
                <div
                  key={m.id}
                  className={`p-4 transition-colors ${
                    selected ? 'bg-emerald-50/50' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => loadMatchIntoEditor(m)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[#475569]">
                        <span className="inline-flex items-center gap-1.5">
                          {m.roundName}
                          {isDup && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                              Duplicado
                            </span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums font-medium text-[#7C1FA2]">
                          {m.sets.length > 0 || m.status === 'wo'
                            ? formatScoreString(m.sets, m.status)
                            : 'Pendiente'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#0A1633] mt-1">
                        {m.entryAName} vs {m.entryBName}
                      </p>
                    </button>

                    {isSuperAdmin && (
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
            })}
          </div>
        </div>

        {/* Editor de Marcador ITF */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
          {!activeMatch ? (
            <p className="text-sm text-[#475569]">Seleccioná un partido para cargar el resultado.</p>
          ) : (
            <>
              <div className="pb-4 border-b border-[#E2E8F0] flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[#475569]">{activeMatch.roundName}</p>
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
                    <label className="block text-xs font-medium text-[#475569] mb-1">Ganador oficial *</label>
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
                              next[idx] = { ...s, tbA: e.target.value === '' ? null : Number(e.target.value) };
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
                              next[idx] = { ...s, tbB: e.target.value === '' ? null : Number(e.target.value) };
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
                      onClick={() => setPendingAffectedMatches(null)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => applyScoreAndCascade(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium"
                    >
                      Confirmar y actualizar cuadro
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => applyScoreAndCascade(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar resultado oficial
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

      {/* Gestión de Roles y Operadores (Superadministrador) */}
      {isSuperAdmin && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#7C1FA2]" />
            <div>
              <h3 className="text-sm font-semibold text-[#0A1633]">
                Equipo de Administración y Operadores (Superadmin)
              </h3>
              <p className="text-xs text-[#475569]">
                Asigná perfiles de superadministrador, organizador u operador de resultados por torneo.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveRole} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              required
              placeholder="UID Firebase *"
              value={roleUid}
              onChange={(e) => setRoleUid(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs font-mono"
            />
            <input
              required
              type="email"
              placeholder="Correo *"
              value={roleEmail}
              onChange={(e) => setRoleEmail(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
            <input
              placeholder="Nombre completo"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
            <select
              value={roleType}
              onChange={(e) => setRoleType(e.target.value as UserRole)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            >
              <option value="operador">Operador de resultados</option>
              <option value="organizador">Organizador</option>
              <option value="superadmin">Superadministrador</option>
            </select>
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium"
            >
              Asignar rol
            </button>
          </form>

          {staffRoles.length > 0 && (
            <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl text-xs">
              {staffRoles.map((sr) => (
                <div key={sr.uid} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-[#0A1633]">{sr.displayName}</span> ·{' '}
                    <span className="text-[#475569]">{sr.email}</span>
                  </div>
                  <span className="font-medium text-[#7C1FA2] capitalize">{sr.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
