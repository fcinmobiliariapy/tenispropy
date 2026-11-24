import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
} from 'lucide-react';
import {
  Division,
  FootballLineupPlayer,
  FootballMatchEvent,
  FootballMatchEventType,
  FootballMatchScore,
  FootballMatchSheet,
  FootballSubstitution,
  Group,
  Match,
  MatchStatus,
  PlayerPublic,
  Registration,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import {
  computeFootballGroupStandings,
  createEmptyFootballMatchSheet,
  formatFootballScoreString,
  resolveFootballMatchWinner,
} from '../../utils/footballEngine';
import {
  compareMatchesByRound,
  formatAsuncionDate,
  isRealFinalMatch,
  makeId,
} from '../../utils/tournamentEngine';
import { formatFirestoreError, saveEntity } from '../../services/firestoreService';
import { FootballMatchSheetModal } from './FootballMatchSheetModal';

interface AdminFootballMatchSheetSectionProps {
  tournament: Tournament;
  division: Division;
  divisions: Division[];
  onSelectDivision: (id: string) => void;
  divisionMatches: Match[];
  divisionGroups: Group[];
  divisionRegistrations: Registration[];
  players: PlayerPublic[];
  userEmail: string;
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
}

export const AdminFootballMatchSheetSection: React.FC<AdminFootballMatchSheetSectionProps> = ({
  tournament,
  division,
  divisions,
  onSelectDivision,
  divisionMatches,
  divisionGroups,
  divisionRegistrations,
  players,
  userEmail,
  isSuperAdmin,
  permissions,
}) => {
  const canEdit = Boolean(isSuperAdmin || !permissions || permissions.canEdit);

  const [phaseFilter, setPhaseFilter] = useState<'ALL' | 'grupos' | 'clasificatoria' | 'eliminacion'>('ALL');
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [printableMatch, setPrintableMatch] = useState<Match | null>(null);

  // Form state for active match
  const [status, setStatus] = useState<MatchStatus>('programado');
  const [woWinnerSide, setWoWinnerSide] = useState<'A' | 'B'>('A');
  const [goalsA, setGoalsA] = useState<number>(0);
  const [goalsB, setGoalsB] = useState<number>(0);
  const [halfTimeA, setHalfTimeA] = useState<string>('');
  const [halfTimeB, setHalfTimeB] = useState<string>('');
  const [extraTimeA, setExtraTimeA] = useState<string>('');
  const [extraTimeB, setExtraTimeB] = useState<string>('');
  const [penaltiesA, setPenaltiesA] = useState<string>('');
  const [penaltiesB, setPenaltiesB] = useState<string>('');
  const [decidedBy, setDecidedBy] = useState<FootballMatchScore['decidedBy']>('regular');

  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [courtId, setCourtId] = useState<string>('');

  const [sheet, setSheet] = useState<FootballMatchSheet>(createEmptyFootballMatchSheet());

  // Add event sub-form
  const [evTeamSide, setEvTeamSide] = useState<'A' | 'B'>('A');
  const [evMinute, setEvMinute] = useState<number>(15);
  const [evAddedMinute, setEvAddedMinute] = useState<string>('');
  const [evType, setEvType] = useState<FootballMatchEventType>('gol');
  const [evPlayerId, setEvPlayerId] = useState<string>('');
  const [evPlayerCustom, setEvPlayerCustom] = useState<string>('');
  const [evAssistId, setEvAssistId] = useState<string>('');

  // Add substitution sub-form
  const [subSide, setSubSide] = useState<'A' | 'B'>('A');
  const [subMinute, setSubMinute] = useState<number>(60);
  const [subOutId, setSubOutId] = useState<string>('');
  const [subInId, setSubInId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const orderedMatches = useMemo(
    () =>
      divisionMatches
        .filter((m) => !m.isBye && (phaseFilter === 'ALL' ? true : m.phase === phaseFilter))
        .sort(compareMatchesByRound),
    [divisionMatches, phaseFilter]
  );

  const activeMatch = useMemo(
    () => orderedMatches.find((m) => m.id === selectedMatchId) || orderedMatches[0] || null,
    [orderedMatches, selectedMatchId]
  );

  const getTeamRoster = (entryId?: string | null, playerIds?: string[]): PlayerPublic[] => {
    const reg = entryId ? divisionRegistrations.find((r) => r.id === entryId) : null;
    const setIds = new Set([...(playerIds || []), ...(reg?.playerIds || [])]);
    return players
      .filter((p) => (entryId && p.teamId === entryId) || setIds.has(p.id))
      .sort((a, b) => (a.jerseyNumber ?? 99) - (b.jerseyNumber ?? 99));
  };

  const rosterA = useMemo(
    () => (activeMatch ? getTeamRoster(activeMatch.entryAId, activeMatch.playerIdsA) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMatch?.id, players, divisionRegistrations]
  );
  const rosterB = useMemo(
    () => (activeMatch ? getTeamRoster(activeMatch.entryBId, activeMatch.playerIdsB) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMatch?.id, players, divisionRegistrations]
  );

  useEffect(() => {
    if (!activeMatch) return;
    setSelectedMatchId(activeMatch.id);
    setStatus(activeMatch.status);
    setWoWinnerSide(activeMatch.winnerEntryId === activeMatch.entryBId ? 'B' : 'A');
    const fs = activeMatch.footballScore;
    setGoalsA(fs?.goalsA ?? 0);
    setGoalsB(fs?.goalsB ?? 0);
    setHalfTimeA(fs?.halfTimeA != null ? String(fs.halfTimeA) : '');
    setHalfTimeB(fs?.halfTimeB != null ? String(fs.halfTimeB) : '');
    setExtraTimeA(fs?.extraTimeA != null ? String(fs.extraTimeA) : '');
    setExtraTimeB(fs?.extraTimeB != null ? String(fs.extraTimeB) : '');
    setPenaltiesA(fs?.penaltiesA != null ? String(fs.penaltiesA) : '');
    setPenaltiesB(fs?.penaltiesB != null ? String(fs.penaltiesB) : '');
    setDecidedBy(fs?.decidedBy || 'regular');
    setScheduledDate(activeMatch.scheduledDate || '');
    setScheduledTime(activeMatch.scheduledTime || '');
    setCourtId(activeMatch.courtId || '');
    setSheet(
      activeMatch.footballSheet
        ? {
            ...createEmptyFootballMatchSheet(),
            ...activeMatch.footballSheet,
            lineupA: activeMatch.footballSheet.lineupA || [],
            lineupB: activeMatch.footballSheet.lineupB || [],
            events: activeMatch.footballSheet.events || [],
            substitutions: activeMatch.footballSheet.substitutions || [],
          }
        : createEmptyFootballMatchSheet()
    );
    setFeedback(null);
    setErrorMsg(null);
  }, [activeMatch?.id]);

  const handleLoadRostersIntoLineups = () => {
    const buildLineup = (roster: PlayerPublic[]): FootballLineupPlayer[] => {
      const maxStarters = division.footballFormat === 'futbol_5_futsal' ? 5 : division.footballFormat === 'futbol_7' ? 7 : 11;
      return roster.slice(0, 22).map((p, idx) => ({
        playerId: p.id,
        fullName: p.fullName,
        jerseyNumber: p.jerseyNumber ?? null,
        position: p.position || 'Mediocampista',
        isStarter: idx < maxStarters,
        isCaptain: idx === 0,
      }));
    };
    const gkA = rosterA.find((p) => p.position === 'Arquero') || rosterA[0];
    const gkB = rosterB.find((p) => p.position === 'Arquero') || rosterB[0];
    setSheet((prev) => ({
      ...prev,
      lineupA: buildLineup(rosterA),
      lineupB: buildLineup(rosterB),
      goalkeeperAId: prev.goalkeeperAId || gkA?.id || null,
      goalkeeperAName: prev.goalkeeperAName || gkA?.fullName || null,
      goalkeeperBId: prev.goalkeeperBId || gkB?.id || null,
      goalkeeperBName: prev.goalkeeperBName || gkB?.fullName || null,
    }));
    setFeedback('Planteles y arqueros cargados en la planilla.');
  };

  const handleSyncGoalsFromEvents = (eventsList: FootballMatchEvent[] = sheet.events) => {
    let gA = 0;
    let gB = 0;
    eventsList.forEach((ev) => {
      if (ev.type === 'gol' || ev.type === 'penal') {
        if (ev.teamSide === 'A') gA += 1;
        else gB += 1;
      } else if (ev.type === 'en_contra') {
        if (ev.teamSide === 'A') gB += 1;
        else gA += 1;
      }
    });
    setGoalsA(gA);
    setGoalsB(gB);
  };

  const handleAddEvent = () => {
    const sideRoster = evTeamSide === 'A' ? rosterA : rosterB;
    const selectedPlayer = sideRoster.find((p) => p.id === evPlayerId);
    const playerName = selectedPlayer?.fullName || evPlayerCustom.trim();
    if (!playerName) {
      setErrorMsg('Seleccioná o escribí el nombre del jugador para registrar la incidencia.');
      return;
    }
    const assistPlayer = evAssistId ? sideRoster.find((p) => p.id === evAssistId) : null;
    const newEv: FootballMatchEvent = {
      id: makeId('fev'),
      teamSide: evTeamSide,
      minute: Math.max(1, Math.min(130, Number(evMinute) || 1)),
      addedMinute: evAddedMinute.trim() ? Math.max(1, Math.min(20, Number(evAddedMinute))) : null,
      type: evType,
      playerId: selectedPlayer?.id || null,
      playerName: playerName.slice(0, 120),
      assistPlayerId: assistPlayer?.id || null,
      assistPlayerName: assistPlayer?.fullName || null,
    };
    const nextEvents = [...sheet.events, newEv].slice(0, 60);
    setSheet((prev) => ({ ...prev, events: nextEvents }));
    if (evType === 'gol' || evType === 'penal' || evType === 'en_contra') {
      handleSyncGoalsFromEvents(nextEvents);
    }
    setEvPlayerCustom('');
    setEvAssistId('');
    setErrorMsg(null);
  };

  const handleAddSubstitution = () => {
    const sideRoster = subSide === 'A' ? rosterA : rosterB;
    const pOut = sideRoster.find((p) => p.id === subOutId);
    const pIn = sideRoster.find((p) => p.id === subInId);
    if (!pOut || !pIn || pOut.id === pIn.id) {
      setErrorMsg('Seleccioná jugador que sale y jugador que ingresa (distintos).');
      return;
    }
    const newSub: FootballSubstitution = {
      id: makeId('fsub'),
      teamSide: subSide,
      minute: Math.max(1, Math.min(130, Number(subMinute) || 60)),
      playerOutId: pOut.id,
      playerOutName: pOut.fullName,
      playerInId: pIn.id,
      playerInName: pIn.fullName,
    };
    setSheet((prev) => ({
      ...prev,
      substitutions: [...prev.substitutions, newSub].slice(0, 20),
    }));
    setErrorMsg(null);
  };

  const handleSaveMatchSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMatch) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);

    try {
      const now = new Date().toISOString();
      const courtObj = tournament.courts.find((c) => c.id === courtId);
      const isFinished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(status);

      const scorePayload: FootballMatchScore = {
        goalsA: Math.max(0, Math.round(Number(goalsA) || 0)),
        goalsB: Math.max(0, Math.round(Number(goalsB) || 0)),
        halfTimeA: halfTimeA.trim() !== '' ? Math.max(0, Number(halfTimeA)) : null,
        halfTimeB: halfTimeB.trim() !== '' ? Math.max(0, Number(halfTimeB)) : null,
        extraTimeA: extraTimeA.trim() !== '' ? Math.max(0, Number(extraTimeA)) : null,
        extraTimeB: extraTimeB.trim() !== '' ? Math.max(0, Number(extraTimeB)) : null,
        penaltiesA: penaltiesA.trim() !== '' ? Math.max(0, Number(penaltiesA)) : null,
        penaltiesB: penaltiesB.trim() !== '' ? Math.max(0, Number(penaltiesB)) : null,
        decidedBy: status === 'wo' ? 'wo' : decidedBy,
      };

      const resolved = isFinished
        ? resolveFootballMatchWinner({ ...activeMatch, status }, scorePayload, woWinnerSide)
        : {
            winnerEntryId: null,
            winnerName: null,
            outcomeNote: null,
            normalizedScore: scorePayload,
          };

      const gkA = rosterA.find((p) => p.id === sheet.goalkeeperAId);
      const gkB = rosterB.find((p) => p.id === sheet.goalkeeperBId);

      const finalSheet: FootballMatchSheet = {
        ...sheet,
        goalkeeperAName: gkA?.fullName || sheet.goalkeeperAName || null,
        goalkeeperBName: gkB?.fullName || sheet.goalkeeperBName || null,
        signedAt: sheet.signedByReferee ? sheet.signedAt || now : null,
      };

      const prevScoreLabel = formatFootballScoreString(activeMatch);
      const updatedMatch: Match = {
        ...activeMatch,
        status,
        scheduledDate: scheduledDate || null,
        scheduledTime: scheduledTime || null,
        courtId: courtObj?.id || null,
        courtName: courtObj?.name || null,
        footballScore:
          isFinished || status === 'en_curso' ? resolved.normalizedScore : activeMatch.footballScore || null,
        footballSheet: finalSheet,
        winnerEntryId: resolved.winnerEntryId,
        winnerName: resolved.winnerName,
        outcomeNote: resolved.outcomeNote,
        correctionHistory:
          activeMatch.winnerEntryId && activeMatch.winnerEntryId !== resolved.winnerEntryId
            ? [
                ...activeMatch.correctionHistory.slice(-29),
                {
                  id: makeId('corr'),
                  at: now,
                  byEmail: userEmail,
                  reason: 'Actualización de planilla FIFA',
                  previousScore: prevScoreLabel,
                  newScore: formatFootballScoreString({
                    ...activeMatch,
                    status,
                    footballScore: resolved.normalizedScore,
                  }),
                  previousWinnerId: activeMatch.winnerEntryId || null,
                  newWinnerId: resolved.winnerEntryId,
                },
              ]
            : activeMatch.correctionHistory,
        updatedAt: now,
      };

      await saveEntity('matches', updatedMatch);

      const updatedMatchesList = divisionMatches.map((m) =>
        m.id === updatedMatch.id ? updatedMatch : m
      );

      // Recalcular tabla de grupo si corresponde
      if (updatedMatch.phase === 'grupos') {
        for (const grp of divisionGroups) {
          if (
            grp.id === updatedMatch.groupId ||
            (updatedMatch.entryAId &&
              updatedMatch.entryBId &&
              grp.entryIds.includes(updatedMatch.entryAId) &&
              grp.entryIds.includes(updatedMatch.entryBId))
          ) {
            const standings = computeFootballGroupStandings(
              grp,
              updatedMatchesList,
              divisionRegistrations,
              division
            );
            await saveEntity('groups', { ...grp, standings, updatedAt: now });
          }
        }
      }

      // Propagar avance en Fase Final si hay ganador
      if (updatedMatch.phase === 'eliminacion' && resolved.winnerEntryId) {
        if (updatedMatch.nextMatchId && updatedMatch.nextMatchSlot) {
          const nextMatch = updatedMatchesList.find((m) => m.id === updatedMatch.nextMatchId);
          if (nextMatch) {
            const wReg = divisionRegistrations.find((r) => r.id === resolved.winnerEntryId);
            const wName = resolved.winnerName || wReg?.displayName || 'Por definir';
            const wPids = wReg?.playerIds.slice(0, 35) || [];
            await saveEntity('matches', {
              ...nextMatch,
              ...(updatedMatch.nextMatchSlot === 'A'
                ? { entryAId: resolved.winnerEntryId, entryAName: wName, playerIdsA: wPids }
                : { entryBId: resolved.winnerEntryId, entryBName: wName, playerIdsB: wPids }),
              updatedAt: now,
            });
          }
        }

        // Actualizar 3er puesto si es semifinal
        if (
          division.hasThirdPlaceMatch &&
          updatedMatch.roundName.toLowerCase().includes('semi') &&
          updatedMatch.entryAId &&
          updatedMatch.entryBId
        ) {
          const thirdMatch = updatedMatchesList.find(
            (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
          );
          if (thirdMatch) {
            const loserId =
              resolved.winnerEntryId === updatedMatch.entryAId
                ? updatedMatch.entryBId
                : updatedMatch.entryAId;
            const loserName =
              resolved.winnerEntryId === updatedMatch.entryAId
                ? updatedMatch.entryBName
                : updatedMatch.entryAName;
            const loserReg = divisionRegistrations.find((r) => r.id === loserId);
            const slot = (updatedMatch.bracketPosition || 1) % 2 === 1 ? 'A' : 'B';
            await saveEntity('matches', {
              ...thirdMatch,
              ...(slot === 'A'
                ? {
                    entryAId: loserId,
                    entryAName: loserName,
                    playerIdsA: loserReg?.playerIds.slice(0, 35) || [],
                  }
                : {
                    entryBId: loserId,
                    entryBName: loserName,
                    playerIdsB: loserReg?.playerIds.slice(0, 35) || [],
                  }),
              updatedAt: now,
            });
          }
        }

        // Podio de la categoría si es Final o 3er puesto
        if (isRealFinalMatch(updatedMatch, updatedMatchesList)) {
          const runnerName =
            resolved.winnerEntryId === updatedMatch.entryAId
              ? updatedMatch.entryBName
              : updatedMatch.entryAName;
          await saveEntity('divisions', {
            ...division,
            championEntryId: resolved.winnerEntryId,
            championName: resolved.winnerName,
            runnerUpName: runnerName,
            updatedAt: now,
          });
        } else if (updatedMatch.isThirdPlace || updatedMatch.roundName === 'Tercer Puesto') {
          await saveEntity('divisions', {
            ...division,
            thirdPlaceEntryId: resolved.winnerEntryId,
            thirdPlaceName: resolved.winnerName,
            updatedAt: now,
          });
        }
      }

      setFeedback(
        `Planilla guardada (${activeMatch.entryAName} ${scorePayload.goalsA}-${scorePayload.goalsB} ${activeMatch.entryBName}). Tablas actualizadas.`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar la planilla del partido.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Planilla de Juego y Marcadores FIFA · {division.name}
          </h2>
          <p className="text-xs text-[#475569]">
            Cargá goles, asistencias, tarjetas, sustituciones, arqueros y terna arbitral para actualizar posiciones, goleadores y valla menos vendida.
          </p>
        </div>
        <select
          value={division.id}
          onChange={(e) => onSelectDivision(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633]"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Lista de partidos de la categoría */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex flex-col max-h-[680px]">
          <div className="p-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
            <p className="text-xs font-bold text-[#0A1633]">
              Partidos ({orderedMatches.length})
            </p>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as typeof phaseFilter)}
              className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            >
              <option value="ALL">Todas las fases</option>
              <option value="grupos">Fase de Grupos</option>
              <option value="clasificatoria">Fase Clasificatoria</option>
              <option value="eliminacion">Fase Final</option>
            </select>
          </div>
          <div className="divide-y divide-[#E2E8F0] overflow-y-auto">
            {orderedMatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#475569]">
                No hay partidos generados en esta categoría todavía.
              </div>
            ) : (
              orderedMatches.map((m) => {
                const isSelected = activeMatch?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMatchId(m.id)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected ? 'bg-emerald-50/70 border-l-4 border-l-emerald-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#475569]">
                      <span className="truncate font-medium">{m.roundName}</span>
                      <span className="font-mono tabular-nums font-bold text-[#0A1633] shrink-0">
                        {formatFootballScoreString(m)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#0A1633] mt-1 truncate">
                      {m.entryAName} vs {m.entryBName}
                    </p>
                    <p className="text-[11px] text-[#475569] mt-0.5">
                      {m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Sin fecha'} ·{' '}
                      {m.footballSheet?.events?.length || 0} incidencias
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editor de Planilla de Juego */}
        <div className="lg:col-span-8">
          {!activeMatch ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              Seleccioná un partido para abrir su planilla oficial de juego.
            </div>
          ) : (
            <form
              onSubmit={handleSaveMatchSheet}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    {activeMatch.roundName}
                  </p>
                  <h3 className="text-base font-bold text-[#0A1633]">
                    {activeMatch.entryAName} vs {activeMatch.entryBName}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadRostersIntoLineups}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#0284C7]" />
                    Cargar planteles
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintableMatch(activeMatch)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    Planilla imprimible
                  </button>
                </div>
              </div>

              {/* Marcador y Programación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">Estado del partido</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MatchStatus)}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
                  >
                    <option value="programado">Programado</option>
                    <option value="en_curso">En juego (En vivo)</option>
                    <option value="finalizado">Finalizado</option>
                    <option value="wo">Walkover FIFA (3-0 W.O.)</option>
                    <option value="reprogramado">Reprogramado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">Fecha</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">Hora</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">Cancha / Estadio</label>
                  <select
                    value={courtId}
                    onChange={(e) => setCourtId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
                  >
                    <option value="">Por asignar</option>
                    {tournament.courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {status === 'wo' ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-amber-900">
                    Walkover FIFA (3 - 0): Seleccioná el equipo ganador:
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={woWinnerSide === 'A'}
                        onChange={() => setWoWinnerSide('A')}
                      />
                      {activeMatch.entryAName}
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={woWinnerSide === 'B'}
                        onChange={() => setWoWinnerSide('B')}
                      />
                      {activeMatch.entryBName}
                    </label>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0A1633]">Marcador Oficial</span>
                    <button
                      type="button"
                      onClick={() => handleSyncGoalsFromEvents()}
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      Sincronizar marcador desde goles cargados
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1 truncate">
                        Goles {activeMatch.entryAName}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={goalsA}
                        onChange={(e) => setGoalsA(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-base font-mono tabular-nums font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1 truncate">
                        Goles {activeMatch.entryBName}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={goalsB}
                        onChange={(e) => setGoalsB(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-base font-mono tabular-nums font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1">Instancia de definición</label>
                      <select
                        value={decidedBy}
                        onChange={(e) => setDecidedBy(e.target.value as FootballMatchScore['decidedBy'])}
                        className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                      >
                        <option value="regular">Tiempo reglamentario</option>
                        <option value="extra_time">Tiempo suplementario (Alargue)</option>
                        <option value="penalties">Definición por penales FIFA</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-[#E2E8F0]">
                    <div>
                      <label className="block text-[10px] text-[#475569]">PT Local</label>
                      <input
                        type="number"
                        min={0}
                        value={halfTimeA}
                        onChange={(e) => setHalfTimeA(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#475569]">PT Visit.</label>
                      <input
                        type="number"
                        min={0}
                        value={halfTimeB}
                        onChange={(e) => setHalfTimeB(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#475569]">Alargue A</label>
                      <input
                        type="number"
                        min={0}
                        value={extraTimeA}
                        onChange={(e) => setExtraTimeA(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#475569]">Alargue B</label>
                      <input
                        type="number"
                        min={0}
                        value={extraTimeB}
                        onChange={(e) => setExtraTimeB(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#475569]">Penales A</label>
                      <input
                        type="number"
                        min={0}
                        value={penaltiesA}
                        onChange={(e) => setPenaltiesA(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#475569]">Penales B</label>
                      <input
                        type="number"
                        min={0}
                        value={penaltiesB}
                        onChange={(e) => setPenaltiesB(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] bg-white text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Arqueros para Valla Menos Vendida & Terna Arbitral */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Arquero {activeMatch.entryAName} (Valla)
                  </label>
                  <select
                    value={sheet.goalkeeperAId || ''}
                    onChange={(e) => {
                      const p = rosterA.find((x) => x.id === e.target.value);
                      setSheet((prev) => ({
                        ...prev,
                        goalkeeperAId: p?.id || null,
                        goalkeeperAName: p?.fullName || null,
                      }));
                    }}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
                  >
                    <option value="">Automático / Equipo</option>
                    {rosterA.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber ?? '-'} {p.fullName} ({p.position || 'Jug'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Arquero {activeMatch.entryBName} (Valla)
                  </label>
                  <select
                    value={sheet.goalkeeperBId || ''}
                    onChange={(e) => {
                      const p = rosterB.find((x) => x.id === e.target.value);
                      setSheet((prev) => ({
                        ...prev,
                        goalkeeperBId: p?.id || null,
                        goalkeeperBName: p?.fullName || null,
                      }));
                    }}
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
                  >
                    <option value="">Automático / Equipo</option>
                    {rosterB.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber ?? '-'} {p.fullName} ({p.position || 'Jug'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">Árbitro Principal</label>
                  <input
                    value={sheet.referee || ''}
                    onChange={(e) => setSheet((prev) => ({ ...prev, referee: e.target.value || null }))}
                    placeholder="Nombre del árbitro"
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                  />
                </div>
              </div>

              {/* Incidencias: Goles y Tarjetas */}
              <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                <p className="text-xs font-bold text-[#0A1633] flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-700" />
                  Goles, Asistencias y Tarjetas ({sheet.events.length})
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#475569]">Equipo</label>
                    <select
                      value={evTeamSide}
                      onChange={(e) => {
                        setEvTeamSide(e.target.value as 'A' | 'B');
                        setEvPlayerId('');
                        setEvAssistId('');
                      }}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                    >
                      <option value="A">{activeMatch.entryAName}</option>
                      <option value="B">{activeMatch.entryBName}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#475569]">Min / +Ad</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={1}
                        max={130}
                        value={evMinute}
                        onChange={(e) => setEvMinute(Number(e.target.value))}
                        className="w-1/2 h-8 px-1.5 rounded border border-[#E2E8F0] text-xs font-mono"
                      />
                      <input
                        type="number"
                        min={1}
                        max={20}
                        placeholder="+0"
                        value={evAddedMinute}
                        onChange={(e) => setEvAddedMinute(e.target.value)}
                        className="w-1/2 h-8 px-1.5 rounded border border-[#E2E8F0] text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#475569]">Tipo</label>
                    <select
                      value={evType}
                      onChange={(e) => setEvType(e.target.value as FootballMatchEventType)}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                    >
                      <option value="gol">Gol</option>
                      <option value="penal">Gol de Penal</option>
                      <option value="en_contra">En contra</option>
                      <option value="amarilla">Amarilla</option>
                      <option value="doble_amarilla">2da Amarilla</option>
                      <option value="roja">Roja Directa</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#475569]">Jugador</label>
                    {(evTeamSide === 'A' ? rosterA : rosterB).length > 0 ? (
                      <select
                        value={evPlayerId}
                        onChange={(e) => setEvPlayerId(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                      >
                        <option value="">Seleccionar jugador...</option>
                        {(evTeamSide === 'A' ? rosterA : rosterB).map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.jerseyNumber ?? '-'} {p.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={evPlayerCustom}
                        onChange={(e) => setEvPlayerCustom(e.target.value)}
                        placeholder="Nombre jugador"
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs"
                      />
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddEvent}
                      className="w-full h-8 inline-flex items-center justify-center gap-1 rounded bg-[#0A1633] text-white text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar
                    </button>
                  </div>
                </div>

                {(evType === 'gol' || evType === 'penal') &&
                  (evTeamSide === 'A' ? rosterA : rosterB).length > 0 && (
                    <div className="max-w-xs">
                      <label className="block text-[10px] text-[#475569]">Asistencia (opcional)</label>
                      <select
                        value={evAssistId}
                        onChange={(e) => setEvAssistId(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                      >
                        <option value="">Sin asistencia</option>
                        {(evTeamSide === 'A' ? rosterA : rosterB).map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.jerseyNumber ?? '-'} {p.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                {sheet.events.length > 0 && (
                  <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-lg">
                    {[...sheet.events]
                      .sort((a, b) => a.minute - b.minute)
                      .map((ev) => (
                        <div key={ev.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 truncate">
                            <span className="font-mono font-bold mr-2">
                              {ev.minute}
                              {ev.addedMinute ? `+${ev.addedMinute}` : ''}&apos;
                            </span>
                            <span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-100 mr-2">
                              {ev.type.replace('_', ' ')}
                            </span>
                            <span className="font-semibold text-[#0A1633]">{ev.playerName}</span>
                            <span className="text-[#475569] ml-1">
                              ({ev.teamSide === 'A' ? activeMatch.entryAName : activeMatch.entryBName})
                            </span>
                            {ev.assistPlayerName && (
                              <span className="text-emerald-700 ml-1">· Asist: {ev.assistPlayerName}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = sheet.events.filter((x) => x.id !== ev.id);
                              setSheet((prev) => ({ ...prev, events: next }));
                            }}
                            className="p-1 text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Sustituciones */}
              <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                <p className="text-xs font-bold text-[#0A1633]">
                  Sustituciones ({sheet.substitutions.length} / máx. {division.fifaConfig?.maxSubstitutions ?? 5} por equipo)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#475569]">Equipo</label>
                    <select
                      value={subSide}
                      onChange={(e) => {
                        setSubSide(e.target.value as 'A' | 'B');
                        setSubOutId('');
                        setSubInId('');
                      }}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                    >
                      <option value="A">{activeMatch.entryAName}</option>
                      <option value="B">{activeMatch.entryBName}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#475569]">Minuto</label>
                    <input
                      type="number"
                      min={1}
                      max={130}
                      value={subMinute}
                      onChange={(e) => setSubMinute(Number(e.target.value))}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#475569]">Sale</label>
                    <select
                      value={subOutId}
                      onChange={(e) => setSubOutId(e.target.value)}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                    >
                      <option value="">Sale jugador...</option>
                      {(subSide === 'A' ? rosterA : rosterB).map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.jerseyNumber ?? '-'} {p.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#475569]">Entra</label>
                    <select
                      value={subInId}
                      onChange={(e) => setSubInId(e.target.value)}
                      className="w-full h-8 px-2 rounded border border-[#E2E8F0] text-xs bg-white"
                    >
                      <option value="">Entra...</option>
                      {(subSide === 'A' ? rosterA : rosterB).map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.jerseyNumber ?? '-'} {p.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddSubstitution}
                      className="w-full h-8 rounded bg-[#0284C7] text-white text-xs font-semibold"
                    >
                      + Cambio
                    </button>
                  </div>
                </div>
                {sheet.substitutions.length > 0 && (
                  <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-lg">
                    {sheet.substitutions.map((s) => (
                      <div key={s.id} className="px-3 py-1.5 flex items-center justify-between text-xs">
                        <span>
                          <strong className="font-mono mr-2">{s.minute}&apos;</strong>
                          <span className="text-emerald-700 font-semibold">↑ {s.playerInName}</span>
                          {' / '}
                          <span className="text-red-700">↓ {s.playerOutName}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSheet((prev) => ({
                              ...prev,
                              substitutions: prev.substitutions.filter((x) => x.id !== s.id),
                            }))
                          }
                          className="p-1 text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observaciones y firma */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Observaciones / Informe arbitral
                  </label>
                  <input
                    maxLength={400}
                    value={sheet.notes || ''}
                    onChange={(e) => setSheet((prev) => ({ ...prev, notes: e.target.value || null }))}
                    placeholder="Notas del encuentro..."
                    className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A1633] pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(sheet.signedByReferee)}
                    onChange={(e) =>
                      setSheet((prev) => ({ ...prev, signedByReferee: e.target.checked }))
                    }
                  />
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Planilla validada y cerrada por el árbitro
                </label>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 h-10 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando planilla...' : 'Guardar planilla y recalcular tablas'}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      <FootballMatchSheetModal
        open={Boolean(printableMatch)}
        onClose={() => setPrintableMatch(null)}
        match={printableMatch}
        tournament={tournament}
        division={division}
      />
    </div>
  );
};
