import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  History,
  MapPin,
  Trophy,
  X,
} from 'lucide-react';
import {
  Division,
  Match,
  PlayerPublic,
  Registration,
  Tournament,
} from '../types/tennis';
import { fetchPublishedMatchesFromFirestore } from '../services/firestoreService';
import { computeHeadToHeadSummary } from '../utils/headToHead';
import { formatScoreString } from '../utils/itfRules';
import { formatAsuncionDate } from '../utils/tournamentEngine';
import { buildHeadToHeadWhatsAppMessage } from '../utils/whatsappShare';
import { WhatsAppShareButton } from './WhatsAppShareButton';

interface HeadToHeadModalProps {
  match: Match | null;
  allMatches: Match[];
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  registrations: Registration[];
  onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  programado: { label: 'Programado', tone: 'text-[#475569]' },
  en_curso: { label: 'En cancha', tone: 'text-[#C2410C] font-semibold' },
  finalizado: { label: 'Finalizado', tone: 'text-[#15803D] font-semibold' },
  wo: { label: 'Walkover (W.O.)', tone: 'text-amber-800 font-semibold' },
  retiro: { label: 'Retiro (RET)', tone: 'text-amber-800 font-semibold' },
  descalificado: { label: 'Descalificado (DQ)', tone: 'text-red-700 font-semibold' },
  reprogramado: { label: 'Reprogramado', tone: 'text-[#C2410C] font-semibold' },
};

const SideAvatarGroup: React.FC<{
  sidePlayers: PlayerPublic[];
  fallbackName: string;
  accentTone: 'blue' | 'violet';
}> = ({ sidePlayers, fallbackName, accentTone }) => {
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});

  const bgTone =
    accentTone === 'blue'
      ? 'bg-[#0284C7] text-white'
      : 'bg-[#7C1FA2] text-white';

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0]?.slice(0, 2) || 'PY').toUpperCase();
  };

  if (sidePlayers.length === 0) {
    return (
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold tracking-tight shrink-0 ${bgTone}`}
      >
        {getInitials(fallbackName)}
      </div>
    );
  }

  if (sidePlayers.length === 1) {
    const p = sidePlayers[0];
    if (p.photoUrl && !failedIds[p.id]) {
      return (
        <img
          src={p.photoUrl}
          alt={p.fullName}
          referrerPolicy="no-referrer"
          onError={() => setFailedIds((prev) => ({ ...prev, [p.id]: true }))}
          className="w-12 h-12 rounded-xl object-cover border border-[#E2E8F0] bg-slate-100 shrink-0"
        />
      );
    }
    return (
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold tracking-tight shrink-0 ${bgTone}`}
      >
        {getInitials(p.fullName || fallbackName)}
      </div>
    );
  }

  return (
    <div className="flex items-center -space-x-2.5 shrink-0">
      {sidePlayers.slice(0, 2).map((p) =>
        p.photoUrl && !failedIds[p.id] ? (
          <img
            key={p.id}
            src={p.photoUrl}
            alt={p.fullName}
            referrerPolicy="no-referrer"
            onError={() => setFailedIds((prev) => ({ ...prev, [p.id]: true }))}
            className="w-10 h-10 rounded-xl object-cover border-2 border-white bg-slate-100"
          />
        ) : (
          <div
            key={p.id}
            className={`w-10 h-10 rounded-xl border-2 border-white flex items-center justify-center text-xs font-bold tracking-tight ${bgTone}`}
          >
            {getInitials(p.fullName)}
          </div>
        )
      )}
    </div>
  );
};

export const HeadToHeadModal: React.FC<HeadToHeadModalProps> = ({
  match,
  allMatches,
  tournaments,
  divisions,
  players,
  registrations,
  onClose,
}) => {
  const [remoteMatches, setRemoteMatches] = useState<Match[]>([]);
  const [syncingDb, setSyncingDb] = useState(false);

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!match) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [match, onClose]);

  // Consultar registros actualizados de partidos en Firestore al abrir un partido
  useEffect(() => {
    if (!match) return;
    let active = true;
    setSyncingDb(true);
    fetchPublishedMatchesFromFirestore()
      .then((fetched) => {
        if (!active) return;
        if (fetched.length > 0) {
          setRemoteMatches(fetched);
        }
      })
      .finally(() => {
        if (active) setSyncingDb(false);
      });
    return () => {
      active = false;
    };
  }, [match?.id]);

  const mergedMatches = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of allMatches) map.set(m.id, m);
    for (const m of remoteMatches) map.set(m.id, m);
    return Array.from(map.values());
  }, [allMatches, remoteMatches]);

  const summary = useMemo(() => {
    if (!match) return null;
    return computeHeadToHeadSummary({
      selectedMatch: match,
      allMatches: mergedMatches,
      tournaments,
      divisions,
      players,
      registrations,
    });
  }, [match, mergedMatches, tournaments, divisions, players, registrations]);

  if (!match || !summary) return null;

  const currentTournament = tournaments.find((t) => t.id === match.tournamentId);
  const currentDivision = divisions.find((d) => d.id === match.divisionId);
  const regA = match.entryAId ? registrations.find((r) => r.id === match.entryAId) : undefined;
  const regB = match.entryBId ? registrations.find((r) => r.id === match.entryBId) : undefined;

  const playersA = summary.sideA.playerIds
    .map((pid) => players.find((p) => p.id === pid))
    .filter((p): p is PlayerPublic => Boolean(p));
  const playersB = summary.sideB.playerIds
    .map((pid) => players.find((p) => p.id === pid))
    .filter((p): p is PlayerPublic => Boolean(p));

  const clubA = regA?.club || playersA[0]?.club || '';
  const clubB = regB?.club || playersB[0]?.club || '';

  const hasCurrentOutcome = Boolean(
    match.winnerEntryId &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(match.status)
  );
  const currentScoreText = formatScoreString(match.sets, match.status);
  const statusMeta = STATUS_LABELS[match.status] || {
    label: match.status,
    tone: 'text-[#475569]',
  };

  const totalWins = summary.winsA + summary.winsB;
  const pctA = totalWins > 0 ? Math.round((summary.winsA / totalWins) * 100) : 50;
  const pctB = totalWins > 0 ? 100 - pctA : 50;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="h2h-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-3xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3 bg-[#F8FAFC]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7C1FA2]">
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>Cara a Cara · Head-to-Head</span>
              {syncingDb && (
                <span className="text-[11px] font-normal text-[#475569]">
                  · Verificando registros
                </span>
              )}
            </div>
            <h2
              id="h2h-modal-title"
              className="text-base sm:text-lg font-bold text-[#0A1633] mt-0.5 truncate"
            >
              {match.entryAName} vs {match.entryBName}
            </h2>
            <p className="text-xs text-[#475569] mt-0.5 truncate">
              {currentTournament?.name || 'PlayPy'}
              {currentDivision ? ` · ${currentDivision.name}` : ''}
              {` · ${match.roundName}`}
              {match.scheduledDate ? ` · ${formatAsuncionDate(match.scheduledDate)}` : ''}
              {match.scheduledTime ? ` ${match.scheduledTime} hs` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Cara a Cara"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0A1633] hover:bg-slate-200/70 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Marcador / Resumen del partido seleccionado */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#475569]">
                <span className={statusMeta.tone}>{statusMeta.label}</span>
                {match.courtName && <span>· {match.courtName}</span>}
              </div>
              {hasCurrentOutcome ? (
                <span className="font-mono tabular-nums font-bold text-[#0A1633]">
                  Marcador del partido: {currentScoreText}
                </span>
              ) : (
                <span className="font-mono tabular-nums text-[#475569]">
                  {match.scheduledDate
                    ? `${formatAsuncionDate(match.scheduledDate)}${match.scheduledTime ? ` · ${match.scheduledTime} hs` : ''}`
                    : 'Horario por confirmar'}
                </span>
              )}
            </div>

            {/* Panel central Cara a Cara */}
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
                {/* Lado A */}
                <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                  <SideAvatarGroup
                    sidePlayers={playersA}
                    fallbackName={summary.sideA.displayName}
                    accentTone="blue"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {regA?.seed && (
                        <span className="font-mono tabular-nums text-[11px] font-semibold text-[#0284C7] shrink-0">
                          [{regA.seed}]
                        </span>
                      )}
                      <p className="text-sm sm:text-base font-bold text-[#0A1633] truncate">
                        {summary.sideA.displayName}
                      </p>
                    </div>
                    <p className="text-xs text-[#475569] truncate">
                      {clubA || (playersA[0]?.habitualCategory ? `Cat. ${playersA[0].habitualCategory}` : 'Participante A')}
                    </p>
                    {hasCurrentOutcome && match.winnerEntryId === match.entryAId && (
                      <p className="text-[11px] font-semibold text-[#15803D] mt-0.5">
                        Ganador de este partido
                      </p>
                    )}
                  </div>
                </div>

                {/* Marcador histórico H2H */}
                <div className="sm:col-span-2 flex flex-col items-center justify-center py-2 sm:py-0 border-y sm:border-y-0 border-[#E2E8F0]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#475569]">
                    Historial H2H
                  </span>
                  <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                    <span
                      className={`text-2xl sm:text-3xl font-extrabold ${
                        summary.winsA > summary.winsB ? 'text-[#0284C7]' : 'text-[#0A1633]'
                      }`}
                    >
                      {summary.winsA}
                    </span>
                    <span className="text-base font-semibold text-[#94A3B8]">—</span>
                    <span
                      className={`text-2xl sm:text-3xl font-extrabold ${
                        summary.winsB > summary.winsA ? 'text-[#7C1FA2]' : 'text-[#0A1633]'
                      }`}
                    >
                      {summary.winsB}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#475569] mt-0.5 text-center">
                    {summary.totalMeetings === 0
                      ? 'Sin cruces previos'
                      : summary.totalMeetings === 1
                      ? '1 cruce previo'
                      : `${summary.totalMeetings} cruces previos`}
                  </span>
                </div>

                {/* Lado B */}
                <div className="sm:col-span-5 flex items-center sm:flex-row-reverse sm:text-right gap-3 min-w-0">
                  <SideAvatarGroup
                    sidePlayers={playersB}
                    fallbackName={summary.sideB.displayName}
                    accentTone="violet"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center sm:justify-end gap-1.5 min-w-0">
                      {regB?.seed && (
                        <span className="font-mono tabular-nums text-[11px] font-semibold text-[#7C1FA2] shrink-0">
                          [{regB.seed}]
                        </span>
                      )}
                      <p className="text-sm sm:text-base font-bold text-[#0A1633] truncate">
                        {summary.sideB.displayName}
                      </p>
                    </div>
                    <p className="text-xs text-[#475569] truncate">
                      {clubB || (playersB[0]?.habitualCategory ? `Cat. ${playersB[0].habitualCategory}` : 'Participante B')}
                    </p>
                    {hasCurrentOutcome && match.winnerEntryId === match.entryBId && (
                      <p className="text-[11px] font-semibold text-[#15803D] mt-0.5">
                        Ganador de este partido
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Barra comparativa proporcional */}
              <div className="mt-4">
                <div className="h-2 w-full rounded-full overflow-hidden bg-[#E2E8F0] flex">
                  {summary.totalMeetings > 0 ? (
                    <>
                      <div
                        className="h-full bg-[#0284C7] transition-all duration-300"
                        style={{ width: `${pctA}%` }}
                      />
                      <div
                        className="h-full bg-[#7C1FA2] transition-all duration-300"
                        style={{ width: `${pctB}%` }}
                      />
                    </>
                  ) : (
                    <>
                      <div className="h-full w-1/2 bg-[#CBD5E1]" />
                      <div className="h-full w-1/2 bg-[#E2E8F0]" />
                    </>
                  )}
                </div>
                {summary.streakText && (
                  <p className="text-xs text-[#475569] text-center mt-2">
                    {summary.streakText}
                  </p>
                )}
              </div>
            </div>

            {/* Matriz estadística de cruces previos */}
            {summary.totalMeetings > 0 && (
              <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] grid grid-cols-3 divide-x divide-[#E2E8F0] text-center">
                <div className="p-3">
                  <p className="text-[11px] text-[#475569]">Partidos ganados</p>
                  <p className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-[#0A1633]">
                    <span className="text-[#0284C7]">{summary.winsA}</span>
                    <span className="text-[#94A3B8] mx-1.5">-</span>
                    <span className="text-[#7C1FA2]">{summary.winsB}</span>
                  </p>
                </div>
                <div className="p-3">
                  <p className="text-[11px] text-[#475569]">Sets en cruces</p>
                  <p className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-[#0A1633]">
                    <span className="text-[#0284C7]">{summary.setsWonA}</span>
                    <span className="text-[#94A3B8] mx-1.5">-</span>
                    <span className="text-[#7C1FA2]">{summary.setsWonB}</span>
                  </p>
                </div>
                <div className="p-3">
                  <p className="text-[11px] text-[#475569]">Games en cruces</p>
                  <p className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-[#0A1633]">
                    <span className="text-[#0284C7]">{summary.gamesWonA}</span>
                    <span className="text-[#94A3B8] mx-1.5">-</span>
                    <span className="text-[#7C1FA2]">{summary.gamesWonB}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desglose por superficie si hay datos */}
          {summary.surfaceBreakdown.length > 0 && (
            <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#0A1633]">Balance por superficie</span>
              <div className="flex flex-wrap items-center gap-4 text-[#475569]">
                {summary.surfaceBreakdown.map((item) => (
                  <span key={item.surface}>
                    {item.surface}:{' '}
                    <strong className="font-mono tabular-nums text-[#0A1633]">
                      {item.winsA}-{item.winsB}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Historial detallado de enfrentamientos previos */}
          <section aria-labelledby="h2h-history-heading">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h3
                id="h2h-history-heading"
                className="text-sm font-bold text-[#0A1633] flex items-center gap-2"
              >
                <History className="w-4 h-4 text-[#7C1FA2]" />
                <span>Historial de enfrentamientos previos</span>
              </h3>
              {summary.totalMeetings > 0 && (
                <span className="text-xs font-mono tabular-nums text-[#475569]">
                  {summary.totalMeetings}{' '}
                  {summary.totalMeetings === 1 ? 'registro' : 'registros'}
                </span>
              )}
            </div>

            {!summary.hasBothSides ? (
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                <p className="text-sm font-semibold text-[#0A1633]">
                  Rival aún por definir en el cuadro
                </p>
                <p className="text-xs text-[#475569] mt-1">
                  Cuando se completen los dos participantes de este cruce, PlayPy buscará automáticamente sus enfrentamientos previos en la base de datos.
                </p>
              </div>
            ) : summary.meetings.length === 0 ? (
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                <p className="text-sm font-semibold text-[#0A1633]">
                  Sin enfrentamientos previos registrados
                </p>
                <p className="text-xs text-[#475569] mt-1 max-w-lg mx-auto">
                  No existen partidos anteriores finalizados entre{' '}
                  <strong className="text-[#0A1633]">{summary.sideA.displayName}</strong> y{' '}
                  <strong className="text-[#0A1633]">{summary.sideB.displayName}</strong> en la base de datos.
                  {!hasCurrentOutcome && ' Este partido marcará su primer cruce oficial.'}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0] overflow-hidden">
                {summary.meetings.map((item) => {
                  const wonByA = item.winnerSide === 'A';
                  return (
                    <div
                      key={item.match.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#475569]">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#0A1633] font-medium">
                            <Calendar className="w-3 h-3 text-[#7C1FA2]" />
                            {item.dateLabel}
                          </span>
                          <span>· {item.tournamentName}</span>
                          <span>· {item.divisionName}</span>
                          <span>· {item.match.roundName}</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Trophy
                            className={`w-3.5 h-3.5 shrink-0 ${
                              wonByA ? 'text-[#0284C7]' : 'text-[#7C1FA2]'
                            }`}
                          />
                          <p className="text-[#0A1633] truncate">
                            Ganó <strong className="font-bold">{item.winnerName}</strong>
                            {item.match.status === 'wo' && ' (por W.O.)'}
                            {item.match.status === 'retiro' && ' (por retiro)'}
                            {item.match.status === 'descalificado' && ' (por descalificación)'}
                          </p>
                        </div>

                        {(item.surface || item.match.courtName) && (
                          <p className="text-[11px] text-[#475569] inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>
                              {[item.match.courtName, item.surface].filter(Boolean).join(' · ')}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="sm:text-right shrink-0">
                        <p className="font-mono tabular-nums text-sm font-bold text-[#7C1FA2]">
                          {item.scoreFromSelectedPerspective}
                        </p>
                        <p className="text-[11px] text-[#475569]">
                          Marcador visto desde {summary.sideA.displayName.split('/')[0].trim()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Forma reciente en la base de datos para ambos participantes */}
          {summary.hasBothSides && (
            <section aria-labelledby="h2h-form-heading">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3
                  id="h2h-form-heading"
                  className="text-sm font-bold text-[#0A1633]"
                >
                  Rendimiento reciente en torneos PlayPy
                </h3>
                <span className="text-[11px] text-[#475569]">Últimos 5 partidos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    name: summary.sideA.displayName,
                    profile: summary.formA,
                    colorText: 'text-[#0284C7]',
                  },
                  {
                    name: summary.sideB.displayName,
                    profile: summary.formB,
                    colorText: 'text-[#7C1FA2]',
                  },
                ].map((side) => (
                  <div
                    key={side.name}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-bold truncate ${side.colorText}`}>
                        {side.name}
                      </p>
                      <span className="text-xs font-mono tabular-nums font-semibold text-[#0A1633] shrink-0">
                        {side.profile.wins}G - {side.profile.losses}P
                        {side.profile.played > 0 ? ` (${side.profile.winRate}%)` : ''}
                      </span>
                    </div>

                    {side.profile.recentForm.length === 0 ? (
                      <p className="text-xs text-[#475569]">
                        Sin partidos finalizados previos registrados.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          {side.profile.recentForm.map((f) => (
                            <span
                              key={f.matchId}
                              title={`${f.result === 'W' ? 'Victoria' : 'Derrota'} vs ${f.opponentName} (${f.score})`}
                              className={`w-6 h-6 rounded-md font-mono tabular-nums text-[11px] font-bold flex items-center justify-center ${
                                f.result === 'W'
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : 'bg-[#FEE2E2] text-[#B91C1C]'
                              }`}
                            >
                              {f.result === 'W' ? 'G' : 'P'}
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-[#475569] truncate">
                          Último: {side.profile.recentForm[0].result === 'W' ? 'Ganó' : 'Cayó'} vs{' '}
                          {side.profile.recentForm[0].opponentName} (
                          <span className="font-mono tabular-nums">
                            {side.profile.recentForm[0].score}
                          </span>
                          )
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Pie */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#475569]">
            Base de datos de torneos PlayPy
          </p>
          <div className="flex items-center gap-2">
            <WhatsAppShareButton
              showCopy
              label="Compartir Cara a Cara"
              message={buildHeadToHeadWhatsAppMessage({
                match,
                winsA: summary.winsA,
                winsB: summary.winsB,
                totalMeetings: summary.totalMeetings,
                tournamentName: currentTournament?.name,
                divisionName: currentDivision?.name,
              })}
            />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[38px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-100 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
