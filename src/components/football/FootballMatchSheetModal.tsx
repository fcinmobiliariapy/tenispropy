import React from 'react';
import { Award, Calendar, MapPin, Printer, Shield, UserCheck, Users, X } from 'lucide-react';
import { Division, Match, Tournament } from '../../types/tennis';
import { formatFootballScoreString } from '../../utils/footballEngine';
import { formatAsuncionDate } from '../../utils/tournamentEngine';

interface FootballMatchSheetModalProps {
  open: boolean;
  onClose: () => void;
  match: Match | null;
  tournament?: Tournament;
  division?: Division;
}

const EVENT_LABELS: Record<string, { label: string; badgeClass: string }> = {
  gol: { label: 'Gol', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  penal: { label: 'Gol (P)', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  en_contra: { label: 'En contra', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  amarilla: { label: 'T. Amarilla', badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  doble_amarilla: { label: '2da Amarilla (Exp.)', badgeClass: 'bg-orange-50 text-orange-800 border-orange-300' },
  roja: { label: 'T. Roja', badgeClass: 'bg-red-50 text-red-800 border-red-300' },
};

export const FootballMatchSheetModal: React.FC<FootballMatchSheetModalProps> = ({
  open,
  onClose,
  match,
  tournament,
  division,
}) => {
  if (!open || !match) return null;

  const sheet = match.footballSheet;
  const fs = match.footballScore;
  const sortedEvents = [...(sheet?.events || [])].sort(
    (a, b) => a.minute - b.minute || (a.addedMinute || 0) - (b.addedMinute || 0)
  );
  const sortedSubs = [...(sheet?.substitutions || [])].sort((a, b) => a.minute - b.minute);

  const startersA = (sheet?.lineupA || []).filter((p) => p.isStarter);
  const subsA = (sheet?.lineupA || []).filter((p) => !p.isStarter);
  const startersB = (sheet?.lineupB || []).filter((p) => p.isStarter);
  const subsB = (sheet?.lineupB || []).filter((p) => !p.isStarter);

  const phaseLabel =
    match.phase === 'grupos'
      ? 'Fase de Grupos'
      : match.phase === 'clasificatoria'
      ? 'Fase Clasificatoria'
      : 'Fase Final';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="w-full max-w-4xl bg-white rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col print:max-h-none print:shadow-none print:border-0">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0A1633] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-400">
              Planilla Oficial de Juego · Reglas FIFA
            </p>
            <h3 className="text-base sm:text-lg font-bold truncate mt-0.5">
              {tournament?.name || 'Competencia de Fútbol'} · {division?.name || match.roundName}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar planilla"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Marcador Principal */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
              <span className="font-semibold text-[#0A1633]">
                {phaseLabel} · {match.roundName}
              </span>
              <span className="inline-flex items-center gap-3 font-mono tabular-nums">
                {match.scheduledDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                    {formatAsuncionDate(match.scheduledDate)}
                    {match.scheduledTime ? ` · ${match.scheduledTime} hs` : ''}
                  </span>
                )}
                {match.courtName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#0284C7]" />
                    {match.courtName}
                  </span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-11 items-center gap-2 pt-1">
              <div className="col-span-4 text-right">
                <p className="text-sm sm:text-lg font-bold text-[#0A1633] leading-tight">
                  {match.entryAName}
                </p>
                {sheet?.goalkeeperAName && (
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Arq: {sheet.goalkeeperAName}
                  </p>
                )}
              </div>

              <div className="col-span-3 text-center">
                <div className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#0A1633] text-white font-mono tabular-nums text-xl sm:text-2xl font-bold tracking-tight">
                  {formatFootballScoreString(match)}
                </div>
                {fs && (fs.halfTimeA != null || fs.extraTimeA != null) && (
                  <p className="text-[11px] font-mono tabular-nums text-[#475569] mt-1">
                    {fs.halfTimeA != null && fs.halfTimeB != null
                      ? `PT ${fs.halfTimeA}-${fs.halfTimeB}`
                      : ''}
                    {fs.extraTimeA != null && fs.extraTimeB != null
                      ? ` · Alargue ${fs.extraTimeA}-${fs.extraTimeB}`
                      : ''}
                  </p>
                )}
                {match.outcomeNote && (
                  <p className="text-[11px] font-medium text-emerald-700 mt-0.5">
                    {match.outcomeNote}
                  </p>
                )}
              </div>

              <div className="col-span-4 text-left">
                <p className="text-sm sm:text-lg font-bold text-[#0A1633] leading-tight">
                  {match.entryBName}
                </p>
                {sheet?.goalkeeperBName && (
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Arq: {sheet.goalkeeperBName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Terna Arbitral y Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-[#E2E8F0] bg-white">
              <p className="text-[11px] text-[#475569] flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-[#0A1633]" />
                Árbitro Principal
              </p>
              <p className="font-semibold text-[#0A1633] mt-0.5">
                {sheet?.referee || 'Por designar'}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-[#E2E8F0] bg-white">
              <p className="text-[11px] text-[#475569]">Asistentes</p>
              <p className="font-medium text-[#0A1633] mt-0.5">
                {[sheet?.assistantRef1, sheet?.assistantRef2].filter(Boolean).join(' / ') || 'No registrados'}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-[#E2E8F0] bg-white">
              <p className="text-[11px] text-[#475569]">4° Árbitro / Asistencia</p>
              <p className="font-medium text-[#0A1633] mt-0.5 font-mono tabular-nums">
                {sheet?.fourthOfficial || '—'}
                {sheet?.attendance ? ` · ${sheet.attendance} esp.` : ''}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-[#E2E8F0] bg-white">
              <p className="text-[11px] text-[#475569] flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-emerald-700" />
                Validación FIFA
              </p>
              <p className="font-semibold text-emerald-700 mt-0.5">
                {sheet?.signedByReferee ? 'Planilla cerrada y firmada' : 'En revisión / programada'}
              </p>
            </div>
          </div>

          {/* Cronología de Goles y Tarjetas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-[#0A1633] flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-700" />
                Incidencias del Partido (Goles y Tarjetas)
              </h4>
              {sortedEvents.length === 0 ? (
                <p className="text-xs text-[#475569]">Sin goles ni amonestaciones registradas.</p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {sortedEvents.map((ev) => {
                    const meta = EVENT_LABELS[ev.type] || EVENT_LABELS.gol;
                    const teamLabel = ev.teamSide === 'A' ? match.entryAName : match.entryBName;
                    return (
                      <div key={ev.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono tabular-nums font-bold text-[#0A1633] w-10 shrink-0">
                            {ev.minute}
                            {ev.addedMinute ? `+${ev.addedMinute}` : ''}&apos;
                          </span>
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${meta.badgeClass}`}>
                            {meta.label}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0A1633] truncate">{ev.playerName}</p>
                            <p className="text-[11px] text-[#475569] truncate">
                              {teamLabel}
                              {ev.assistPlayerName ? ` · Asist: ${ev.assistPlayerName}` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-[#0A1633] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#0284C7]" />
                Sustituciones Realizadas ({sortedSubs.length})
              </h4>
              {sortedSubs.length === 0 ? (
                <p className="text-xs text-[#475569]">Sin modificaciones registradas.</p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {sortedSubs.map((sub) => (
                    <div key={sub.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono tabular-nums font-bold text-[#0A1633] w-9 shrink-0">
                          {sub.minute}&apos;
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-emerald-700 truncate">
                            ↑ Entra: {sub.playerInName}
                          </p>
                          <p className="text-[11px] text-red-700 truncate">
                            ↓ Sale: {sub.playerOutName} ({sub.teamSide === 'A' ? match.entryAName : match.entryBName})
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sheet?.notes && (
                <div className="pt-2 border-t border-[#E2E8F0]">
                  <p className="text-[11px] font-semibold text-[#0A1633]">Observaciones del árbitro</p>
                  <p className="text-xs text-[#475569] mt-0.5">{sheet.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Alineaciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: match.entryAName, starters: startersA, subs: subsA },
              { name: match.entryBName, starters: startersB, subs: subsB },
            ].map((team, idx) => (
              <div key={idx} className="border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-[#0A1633] border-b border-[#E2E8F0] pb-2">
                  Plantel · {team.name}
                </h4>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-700 mb-1.5">
                    Titulares ({team.starters.length})
                  </p>
                  {team.starters.length === 0 ? (
                    <p className="text-xs text-[#475569]">Alineación titular pendiente.</p>
                  ) : (
                    <div className="space-y-1">
                      {team.starters.map((lp) => (
                        <div key={lp.playerId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-mono tabular-nums font-bold text-[#0A1633] w-6">
                              #{lp.jerseyNumber ?? '-'}
                            </span>
                            <span className="font-medium text-[#0A1633] truncate">
                              {lp.fullName}
                              {lp.isCaptain ? ' (C)' : ''}
                            </span>
                          </span>
                          <span className="text-[11px] text-[#475569] shrink-0">{lp.position}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {team.subs.length > 0 && (
                  <div className="pt-2 border-t border-[#E2E8F0]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#475569] mb-1.5">
                      Suplentes ({team.subs.length})
                    </p>
                    <div className="space-y-1">
                      {team.subs.map((lp) => (
                        <div key={lp.playerId} className="flex items-center justify-between text-xs py-0.5 text-[#475569]">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-mono tabular-nums w-6">#{lp.jerseyNumber ?? '-'}</span>
                            <span className="truncate">{lp.fullName}</span>
                          </span>
                          <span className="text-[11px] shrink-0">{lp.position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
