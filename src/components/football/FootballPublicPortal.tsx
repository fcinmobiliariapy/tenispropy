import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Crown,
  Images,
  MapPin,
  Medal,
  QrCode,
  Search,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Division,
  Group,
  Match,
  Matchday,
  MatchdayPhoto,
  NotificationAlert,
  PlayerPublic,
  Registration,
  Tournament,
  TournamentAd,
  TournamentTrophy,
} from '../../types/tennis';
import {
  computeFootballBestGoalkeepers,
  computeFootballDisciplinaryTable,
  computeFootballGroupStandings,
  computeFootballTopScorers,
  createDefaultFifaConfig,
  FIFA_EDITION_LABEL,
  formatFootballScoreString,
} from '../../utils/footballEngine';
import { compareMatchesByRound, formatAsuncionDate } from '../../utils/tournamentEngine';
import { PublicTab } from '../TopBarAndPWA';
import { TournamentAd as TournamentAdCard } from '../TournamentAd';
import { OptimizedImage } from '../OptimizedImage';
import { FootballMatchSheetModal } from './FootballMatchSheetModal';
import { TournamentQrModal } from '../TournamentQrModal';

interface FootballPublicPortalProps {
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  registrations: Registration[];
  groups: Group[];
  matchdays: Matchday[];
  matches: Match[];
  photos: MatchdayPhoto[];
  notifications: NotificationAlert[];
  tournamentAds: TournamentAd[];
  tournamentTrophies: TournamentTrophy[];
  activeTab: PublicTab;
  onSelectTab: (tab: PublicTab) => void;
  onGoLanding?: () => void;
  selectedTournamentId: string;
  onSelectTournament: (id: string) => void;
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  defaultTournamentCoverUrl?: string;
  logoUrl?: string;
}

type ResumenSubTab = 'posiciones' | 'clasificatoria_final' | 'goleadores' | 'valla' | 'disciplina';

export const FootballPublicPortal: React.FC<FootballPublicPortalProps> = ({
  tournaments,
  divisions,
  players,
  registrations,
  groups,
  matchdays,
  matches,
  photos,
  tournamentAds,
  activeTab,
  onSelectTab,
  onGoLanding,
  selectedTournamentId,
  onSelectTournament,
  selectedDivisionId,
  onSelectDivision,
  defaultTournamentCoverUrl,
  logoUrl,
}) => {
  const activeTournament =
    tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const tournamentDivisions = useMemo(
    () => divisions.filter((d) => d.tournamentId === activeTournament?.id),
    [divisions, activeTournament?.id]
  );
  const activeDivision =
    tournamentDivisions.find((d) => d.id === selectedDivisionId) || tournamentDivisions[0];

  const [resumenSubTab, setResumenSubTab] = useState<ResumenSubTab>('posiciones');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | 'grupos' | 'clasificatoria' | 'eliminacion'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'finished'>('ALL');
  const [playerCategoryFilter, setPlayerCategoryFilter] = useState<string>('ALL');
  const [playerTeamFilter, setPlayerTeamFilter] = useState<string>('ALL');
  const [playerPosFilter, setPlayerPosFilter] = useState<string>('ALL');
  const [playerSearch, setPlayerSearch] = useState<string>('');
  const [selectedMatchForSheet, setSelectedMatchForSheet] = useState<Match | null>(null);
  const [showFifaRulesModal, setShowFifaRulesModal] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const divMatches = useMemo(
    () =>
      matches
        .filter((m) => m.divisionId === activeDivision?.id && m.published)
        .sort(compareMatchesByRound),
    [matches, activeDivision?.id]
  );

  const divGroups = useMemo(
    () =>
      groups
        .filter((g) => g.divisionId === activeDivision?.id && g.published)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [groups, activeDivision?.id]
  );

  const divRegistrations = useMemo(
    () =>
      registrations.filter(
        (r) => r.divisionId === activeDivision?.id && r.status !== 'retirada'
      ),
    [registrations, activeDivision?.id]
  );

  const computedStandingsByGroup = useMemo(() => {
    if (!activeDivision) return [];
    return divGroups.map((g) => ({
      group: g,
      rows: computeFootballGroupStandings(g, divMatches, divRegistrations, activeDivision),
    }));
  }, [divGroups, divMatches, divRegistrations, activeDivision]);

  const qualifyingMatches = useMemo(
    () => divMatches.filter((m) => m.phase === 'clasificatoria'),
    [divMatches]
  );

  const knockoutMatches = useMemo(
    () => divMatches.filter((m) => m.phase === 'eliminacion'),
    [divMatches]
  );

  const tournamentPlayers = useMemo(
    () => players.filter((p) => p.tournamentId === activeTournament?.id),
    [players, activeTournament?.id]
  );

  const tournamentRegistrations = useMemo(
    () => registrations.filter((r) => r.tournamentId === activeTournament?.id && r.status !== 'retirada'),
    [registrations, activeTournament?.id]
  );

  const topScorers = useMemo(
    () =>
      computeFootballTopScorers({
        matches: divMatches,
        players: tournamentPlayers,
        registrations: divRegistrations,
        divisions: tournamentDivisions,
        divisionId: activeDivision?.id || 'ALL',
      }),
    [divMatches, tournamentPlayers, divRegistrations, tournamentDivisions, activeDivision?.id]
  );

  const bestGoalkeepers = useMemo(
    () =>
      computeFootballBestGoalkeepers({
        matches: divMatches,
        players: tournamentPlayers,
        registrations: divRegistrations,
        divisions: tournamentDivisions,
        divisionId: activeDivision?.id || 'ALL',
      }),
    [divMatches, tournamentPlayers, divRegistrations, tournamentDivisions, activeDivision?.id]
  );

  const disciplinaryRows = useMemo(
    () =>
      computeFootballDisciplinaryTable({
        matches: divMatches,
        players: tournamentPlayers,
        divisions: tournamentDivisions,
        divisionId: activeDivision?.id || 'ALL',
      }),
    [divMatches, tournamentPlayers, tournamentDivisions, activeDivision?.id]
  );

  const totalGoals = useMemo(
    () =>
      divMatches.reduce((acc, m) => {
        if (!m.footballScore) return acc;
        return acc + (m.footballScore.goalsA || 0) + (m.footballScore.goalsB || 0);
      }, 0),
    [divMatches]
  );

  const filteredFixtureMatches = useMemo(() => {
    return divMatches
      .filter((m) => (phaseFilter === 'ALL' ? true : m.phase === phaseFilter))
      .filter((m) =>
        teamFilter === 'ALL' ? true : m.entryAId === teamFilter || m.entryBId === teamFilter
      )
      .filter((m) => {
        if (statusFilter === 'ALL') return true;
        const isFinished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
        return statusFilter === 'finished' ? isFinished : !isFinished;
      });
  }, [divMatches, phaseFilter, teamFilter, statusFilter]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    tournamentDivisions.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    tournamentPlayers.forEach((p) => {
      if (p.habitualCategory) set.add(p.habitualCategory);
    });
    return Array.from(set);
  }, [tournamentDivisions, tournamentPlayers]);

  const filteredPlayersList = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return tournamentPlayers
      .filter((p) =>
        playerCategoryFilter === 'ALL' ? true : p.habitualCategory === playerCategoryFilter
      )
      .filter((p) =>
        playerTeamFilter === 'ALL'
          ? true
          : p.teamId === playerTeamFilter || p.club === playerTeamFilter
      )
      .filter((p) => (playerPosFilter === 'ALL' ? true : p.position === playerPosFilter))
      .filter(
        (p) =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          String(p.jerseyNumber || '').includes(q)
      )
      .sort((a, b) => (a.club || '').localeCompare(b.club || '', 'es') || (a.jerseyNumber || 99) - (b.jerseyNumber || 99));
  }, [
    tournamentPlayers,
    playerCategoryFilter,
    playerTeamFilter,
    playerPosFilter,
    playerSearch,
  ]);

  const divMatchdays = useMemo(
    () =>
      matchdays
        .filter((md) => md.divisionId === activeDivision?.id)
        .sort((a, b) => a.order - b.order),
    [matchdays, activeDivision?.id]
  );

  const divPhotos = useMemo(
    () => photos.filter((ph) => ph.divisionId === activeDivision?.id && ph.published),
    [photos, activeDivision?.id]
  );

  const mainBannerAd = useMemo(
    () =>
      tournamentAds.find(
        (a) =>
          a.tournamentId === activeTournament?.id &&
          a.active &&
          a.placement === 'banner_principal'
      ) || null,
    [tournamentAds, activeTournament?.id]
  );

  const fifaConfig = activeDivision?.fifaConfig || createDefaultFifaConfig(activeDivision?.footballFormat);
  const coverSrc = activeTournament?.coverImageUrl || defaultTournamentCoverUrl || '';

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-7 pb-24 md:pb-12 space-y-6">
      {/* Cabecera de la competencia de Fútbol FIFA */}
      <section className="rounded-3xl bg-[#0A1633] text-white border border-[#1E293B] overflow-hidden">
        <div className="relative p-5 sm:p-7">
          {coverSrc && (
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-20">
              <OptimizedImage
                src={coverSrc}
                alt=""
                width={1280}
                height={320}
                transformWidth={1280}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0A1633] via-[#0A1633]/85 to-[#0A1633]/60" />
            </div>
          )}

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {onGoLanding && (
                  <button
                    type="button"
                    onClick={onGoLanding}
                    className="text-slate-300 hover:text-white underline underline-offset-2"
                  >
                    ← Todos los torneos
                  </button>
                )}
                <span className="text-emerald-400 font-bold uppercase tracking-[0.1em]">
                  Fútbol · {activeTournament?.itfEdition || FIFA_EDITION_LABEL}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight">
                {activeTournament?.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  {activeTournament?.venue} · {activeTournament?.city}
                </span>
                <span className="font-mono tabular-nums">
                  {activeTournament?.startDate} al {activeTournament?.endDate}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {tournaments.length > 1 && (
                <select
                  aria-label="Cambiar competencia"
                  value={activeTournament?.id || ''}
                  onChange={(e) => onSelectTournament(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-white/10 border border-white/20 text-xs text-white"
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id} className="text-[#0A1633]">
                      {t.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setShowFifaRulesModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white"
              >
                <BookOpen className="w-4 h-4 text-emerald-400" />
                Reglas FIFA
              </button>

              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
              >
                <QrCode className="w-4 h-4" />
                QR Torneo
              </button>
            </div>
          </div>
        </div>

        {/* Selector de Categorías (Divisiones) */}
        <div className="bg-white text-[#0A1633] px-4 sm:px-6 py-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#475569] shrink-0">
              Categorías:
            </span>
            {tournamentDivisions.length === 0 ? (
              <span className="text-xs text-[#475569]">Sin categorías creadas</span>
            ) : (
              tournamentDivisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDivision(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    d.id === activeDivision?.id
                      ? 'bg-[#0A1633] text-white'
                      : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  {d.category} · {d.name}
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] overflow-x-auto shrink-0">
            {(
              [
                { id: 'resumen', label: 'Competencia', icon: Trophy },
                { id: 'fixture', label: 'Fixture y Planillas', icon: Calendar },
                { id: 'jornadas', label: 'Jornadas', icon: Images },
                { id: 'jugadores', label: 'Jugadores', icon: Users },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-emerald-700 text-white'
                      : 'text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {mainBannerAd && (
        <TournamentAdCard
          ad={mainBannerAd}
          variant="featured"
          tournamentName={activeTournament?.name}
          tournamentVenue={activeTournament?.venue}
          tournamentCity={activeTournament?.city}
        />
      )}

      {/* TAB 1: COMPETENCIA (Posiciones, Fase Clasificatoria/Final, Goleadores, Valla Menos Vendida) */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* KPIs de la categoría */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Equipos en categoría</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633] mt-1">
                {divRegistrations.length}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Partidos publicados</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633] mt-1">
                {divMatches.filter((m) => !m.isBye).length}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Goles convertidos</p>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {totalGoals}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Tiempo reglamentario</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633] mt-1">
                2×{fifaConfig.halfMinutes}&apos;
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Goleador líder</p>
              <p className="text-sm font-bold text-[#0A1633] truncate mt-1">
                {topScorers[0]
                  ? `${topScorers[0].playerName} (${topScorers[0].goals})`
                  : 'Por definir'}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[11px] text-[#475569]">Valla menos vendida</p>
              <p className="text-sm font-bold text-emerald-700 truncate mt-1">
                {bestGoalkeepers[0]
                  ? `${bestGoalkeepers[0].goalkeeperName} (${bestGoalkeepers[0].goalsConceded} GC)`
                  : 'Por definir'}
              </p>
            </div>
          </div>

          {/* Sub-navegación interna de Competencia */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-3">
            {(
              [
                { id: 'posiciones', label: 'Tabla de Posiciones (Grupos)' },
                { id: 'clasificatoria_final', label: 'Fase Clasificatoria y Final' },
                { id: 'goleadores', label: `Tabla de Goleadores (${topScorers.length})` },
                { id: 'valla', label: `Valla Menos Vendida (${bestGoalkeepers.length})` },
                { id: 'disciplina', label: 'Tarjetas y Fair Play FIFA' },
              ] as const
            ).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setResumenSubTab(sub.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  resumenSubTab === sub.id
                    ? 'bg-[#0A1633] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* SUBTAB A: TABLA DE POSICIONES FIFA */}
          {resumenSubTab === 'posiciones' && (
            <div className="space-y-5">
              {computedStandingsByGroup.length === 0 ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
                  Todavía no hay grupos publicados en la categoría {activeDivision?.name || ''}.
                </div>
              ) : (
                computedStandingsByGroup.map(({ group, rows }) => (
                  <div
                    key={group.id}
                    className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
                  >
                    <div className="px-5 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-[#0A1633]">{group.name}</h2>
                        <p className="text-[11px] text-[#475569]">
                          Clasifican los primeros {activeDivision?.drawConfig.qualifiersPerGroup || 2} · Desempate oficial FIFA (PTS → DG → GF → Duelo directo → Fair Play)
                        </p>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-emerald-700 font-semibold">
                        Victoria {fifaConfig.pointsWin} · Empate {fifaConfig.pointsDraw} · Derrota {fifaConfig.pointsLoss}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[#475569] text-[11px] uppercase tracking-wider bg-white">
                            <th className="py-2.5 px-3 text-left w-10">#</th>
                            <th className="py-2.5 px-3 text-left">Equipo</th>
                            <th className="py-2.5 px-2 text-right font-mono">PJ</th>
                            <th className="py-2.5 px-2 text-right font-mono">PG</th>
                            <th className="py-2.5 px-2 text-right font-mono">PE</th>
                            <th className="py-2.5 px-2 text-right font-mono">PP</th>
                            <th className="py-2.5 px-2 text-right font-mono">GF</th>
                            <th className="py-2.5 px-2 text-right font-mono">GC</th>
                            <th className="py-2.5 px-2 text-right font-mono">DG</th>
                            <th className="py-2.5 px-2 text-right font-mono">FP</th>
                            <th className="py-2.5 px-3 text-right font-mono font-bold text-[#0A1633]">PTS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {rows.map((row, idx) => {
                            const dg = row.goalDiff ?? 0;
                            return (
                              <tr
                                key={row.entryId}
                                className={`hover:bg-slate-50 ${
                                  row.qualified ? 'border-l-4 border-l-emerald-600' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#0A1633]">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-[#0A1633]">
                                  <div className="flex items-center gap-2">
                                    <span>{row.displayName}</span>
                                    {row.qualified && (
                                      <span className="text-[10px] font-bold text-emerald-700">
                                        Clasifica
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.played}</td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.won}</td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.drawn ?? 0}</td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.lost}</td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.goalsFor ?? 0}</td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.goalsAgainst ?? 0}</td>
                                <td
                                  className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                                    dg > 0 ? 'text-emerald-700' : dg < 0 ? 'text-red-700' : 'text-[#475569]'
                                  }`}
                                >
                                  {dg > 0 ? `+${dg}` : dg}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                                  {row.fairPlayPoints ?? 0}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-sm text-[#0A1633]">
                                  {row.points}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SUBTAB B: FASE CLASIFICATORIA Y FASE FINAL */}
          {resumenSubTab === 'clasificatoria_final' && (
            <div className="space-y-6">
              {/* Podio de la Categoría */}
              {(activeDivision?.championName || activeDivision?.runnerUpName) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                    <Crown className="w-7 h-7 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                        Campeón
                      </p>
                      <p className="text-sm font-bold text-[#0A1633]">{activeDivision.championName || 'Por definir'}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-[#E2E8F0] rounded-2xl p-4 flex items-center gap-3">
                    <Medal className="w-7 h-7 text-slate-600 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Vicecampeón
                      </p>
                      <p className="text-sm font-bold text-[#0A1633]">{activeDivision.runnerUpName || 'Por definir'}</p>
                    </div>
                  </div>
                  <div className="bg-orange-50/60 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
                    <Award className="w-7 h-7 text-orange-700 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-orange-800">
                        Tercer Puesto
                      </p>
                      <p className="text-sm font-bold text-[#0A1633]">{activeDivision.thirdPlaceName || 'Por definir'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fase Clasificatoria (Repechaje / Play-In) */}
              <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#0A1633]">
                    Fase Clasificatoria (Play-In / Repechaje)
                  </h3>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Cruces clasificatorios previos a la Fase Final. En caso de empate, se define por alargue / penales FIFA.
                  </p>
                </div>

                {qualifyingMatches.length === 0 ? (
                  <p className="text-xs text-[#475569]">
                    No hay cruces de Fase Clasificatoria publicados en esta categoría.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {qualifyingMatches.map((m) => (
                      <div key={m.id} className="border border-[#E2E8F0] rounded-xl p-4 bg-[#F8FAFC] space-y-2.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#0284C7]">{m.roundName}</span>
                          <span className="font-mono tabular-nums text-[#475569]">
                            {m.scheduledDate ? `${formatAsuncionDate(m.scheduledDate)} ${m.scheduledTime || ''}` : 'Por programar'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm space-y-1">
                            <p className={`truncate ${m.winnerEntryId === m.entryAId ? 'font-bold text-emerald-700' : 'font-semibold text-[#0A1633]'}`}>
                              {m.entryAName}
                            </p>
                            <p className={`truncate ${m.winnerEntryId === m.entryBId ? 'font-bold text-emerald-700' : 'font-semibold text-[#0A1633]'}`}>
                              {m.entryBName}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block px-3 py-1 rounded-lg bg-[#0A1633] text-white font-mono tabular-nums text-xs font-bold">
                              {formatFootballScoreString(m)}
                            </span>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                          <span className="text-[#475569] truncate">{m.outcomeNote || m.courtName || 'Estadio por definir'}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedMatchForSheet(m)}
                            className="font-semibold text-[#0284C7] hover:underline shrink-0"
                          >
                            Ver planilla →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Fase Final */}
              <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#0A1633]">Fase Final (Eliminación Directa FIFA)</h3>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Llaves de Octavos, Cuartos, Semifinales, Tercer Puesto y Final con definición por alargue y penales.
                  </p>
                </div>

                {knockoutMatches.length === 0 ? (
                  <p className="text-xs text-[#475569]">
                    El cuadro de Fase Final se habilitará cuando finalicen las fases previas.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {knockoutMatches.map((m) => (
                      <div key={m.id} className="border border-[#E2E8F0] rounded-xl p-4 bg-white space-y-2.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#7C1FA2]">{m.roundName}</span>
                          <span className="font-mono tabular-nums text-[#475569]">
                            {m.isBye ? 'BYE' : m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Por programar'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm space-y-1">
                            <p className={`truncate ${m.winnerEntryId === m.entryAId ? 'font-bold text-emerald-700' : 'font-semibold text-[#0A1633]'}`}>
                              {m.entryAName}
                            </p>
                            <p className={`truncate ${m.winnerEntryId === m.entryBId ? 'font-bold text-emerald-700' : 'font-semibold text-[#0A1633]'}`}>
                              {m.entryBName}
                            </p>
                          </div>
                          <span className="px-3 py-1 rounded-lg bg-[#0A1633] text-white font-mono tabular-nums text-xs font-bold shrink-0">
                            {formatFootballScoreString(m)}
                          </span>
                        </div>
                        {!m.isBye && (
                          <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                            <span className="text-[#475569] truncate">{m.outcomeNote || m.courtName || ''}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedMatchForSheet(m)}
                              className="font-semibold text-[#0284C7] hover:underline shrink-0"
                            >
                              Ver planilla →
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SUBTAB C: TABLA DE GOLEADORES */}
          {resumenSubTab === 'goleadores' && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h2 className="text-base font-bold text-[#0A1633]">
                  Tabla de Goleadores · {activeDivision?.name}
                </h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Contabiliza goles de jugada y penal registrados en las Planillas de Juego (excluye goles en contra según reglas FIFA).
                </p>
              </div>
              {topScorers.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#475569]">
                  Aún no hay goles cargados en las planillas de esta categoría.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#475569]">
                        <th className="py-2.5 px-3 text-left w-10">#</th>
                        <th className="py-2.5 px-3 text-left">Jugador</th>
                        <th className="py-2.5 px-3 text-left">Equipo</th>
                        <th className="py-2.5 px-2 text-right font-mono">PJ</th>
                        <th className="py-2.5 px-2 text-right font-mono">Pen.</th>
                        <th className="py-2.5 px-2 text-right font-mono">Asist.</th>
                        <th className="py-2.5 px-2 text-right font-mono">G/PJ</th>
                        <th className="py-2.5 px-3 text-right font-mono font-bold text-[#0A1633]">Goles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {topScorers.map((row, idx) => (
                        <tr key={row.playerId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#0A1633]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-[#0A1633]">
                              {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                              {row.playerName}
                            </p>
                            {row.position && (
                              <p className="text-[11px] text-[#475569]">{row.position}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[#475569] font-medium">{row.teamName}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.matchesPlayed}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.penaltyGoals}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.assists}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{row.goalsPerMatch.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-sm text-emerald-700">
                            {row.goals}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB D: VALLA MENOS VENDIDA */}
          {resumenSubTab === 'valla' && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h2 className="text-base font-bold text-[#0A1633]">
                  Valla Menos Vendida · {activeDivision?.name}
                </h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Ordenado por mejor promedio de goles recibidos por partido (GC/PJ), total de goles recibidos (GC) y vallas invictas. Mínimo {fifaConfig.minMatchesForBestGoalkeeper} partido(s) jugado(s).
                </p>
              </div>
              {bestGoalkeepers.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#475569]">
                  Aún no hay partidos finalizados para calcular la valla menos vendida.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#475569]">
                        <th className="py-2.5 px-3 text-left w-10">#</th>
                        <th className="py-2.5 px-3 text-left">Arquero / Valla</th>
                        <th className="py-2.5 px-3 text-left">Equipo</th>
                        <th className="py-2.5 px-2 text-right font-mono">PJ</th>
                        <th className="py-2.5 px-2 text-right font-mono">V. Invicta</th>
                        <th className="py-2.5 px-2 text-right font-mono">GC</th>
                        <th className="py-2.5 px-3 text-right font-mono font-bold text-[#0A1633]">Prom. GC/PJ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {bestGoalkeepers.map((gk, idx) => (
                        <tr
                          key={gk.goalkeeperKey}
                          className={`hover:bg-slate-50 ${idx === 0 && gk.eligible ? 'bg-emerald-50/40' : ''}`}
                        >
                          <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#0A1633]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#0A1633]">
                            {gk.goalkeeperName}
                            {!gk.eligible && (
                              <span className="ml-2 text-[10px] font-normal text-amber-700">
                                (Debajo del mín. PJ)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[#475569] font-medium">{gk.teamName}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{gk.matchesPlayed}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                            {gk.cleanSheets}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-[#0A1633]">
                            {gk.goalsConceded}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-sm text-[#0284C7]">
                            {gk.goalsAgainstAvg.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB E: DISCIPLINA Y FAIR PLAY FIFA */}
          {resumenSubTab === 'disciplina' && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h2 className="text-base font-bold text-[#0A1633]">
                  Registro Disciplinario y Tarjetas FIFA
                </h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Límite reglamentario de acumulación: {fifaConfig.yellowCardSuspensionLimit} amarillas o tarjeta roja directa.
                </p>
              </div>
              {disciplinaryRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#475569]">
                  Sin amonestaciones ni expulsiones registradas en esta categoría.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#475569]">
                        <th className="py-2.5 px-3 text-left">Jugador</th>
                        <th className="py-2.5 px-3 text-left">Equipo</th>
                        <th className="py-2.5 px-2 text-right font-mono">Amarillas</th>
                        <th className="py-2.5 px-2 text-right font-mono">2da Amarilla</th>
                        <th className="py-2.5 px-2 text-right font-mono">Rojas</th>
                        <th className="py-2.5 px-3 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {disciplinaryRows.map((d) => (
                        <tr key={d.playerId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-[#0A1633]">{d.playerName}</td>
                          <td className="py-2.5 px-3 text-[#475569]">{d.teamName}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{d.yellowCards}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{d.doubleYellows}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{d.redCards}</td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {d.suspendedRisk ? (
                              <span className="text-red-700">Sanción / Apercibido</span>
                            ) : (
                              <span className="text-emerald-700">Habilitado</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FIXTURE Y PLANILLAS DE JUEGO */}
      {activeTab === 'fixture' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={phaseFilter}
                onChange={(e) =>
                  setPhaseFilter(
                    e.target.value as 'ALL' | 'grupos' | 'clasificatoria' | 'eliminacion'
                  )
                }
                className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs font-medium bg-white"
              >
                <option value="ALL">Todas las fases</option>
                <option value="grupos">Fase de Grupos</option>
                <option value="clasificatoria">Fase Clasificatoria</option>
                <option value="eliminacion">Fase Final</option>
              </select>

              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs font-medium bg-white"
              >
                <option value="ALL">Todos los equipos</option>
                {divRegistrations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'pending' | 'finished')}
                className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs font-medium bg-white"
              >
                <option value="ALL">Todos los estados</option>
                <option value="pending">Por disputar</option>
                <option value="finished">Finalizados</option>
              </select>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#475569]">
              {filteredFixtureMatches.length} partido(s)
            </span>
          </div>

          {filteredFixtureMatches.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              No hay partidos publicados con los filtros seleccionados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredFixtureMatches.map((m) => {
                const isFinished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
                const goalEvents = (m.footballSheet?.events || []).filter(
                  (ev) => ev.type === 'gol' || ev.type === 'penal' || ev.type === 'en_contra'
                );
                return (
                  <div
                    key={m.id}
                    className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-emerald-700 truncate">{m.roundName}</span>
                        <span className="font-mono tabular-nums text-[#475569] shrink-0">
                          {m.scheduledDate
                            ? `${formatAsuncionDate(m.scheduledDate)}${m.scheduledTime ? ` · ${m.scheduledTime}h` : ''}`
                            : 'Por programar'}
                          {m.courtName ? ` · ${m.courtName}` : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1 text-sm">
                          <p
                            className={`truncate ${
                              m.winnerEntryId === m.entryAId
                                ? 'font-bold text-[#0A1633]'
                                : 'font-medium text-[#0A1633]'
                            }`}
                          >
                            {m.entryAName}
                          </p>
                          <p
                            className={`truncate ${
                              m.winnerEntryId === m.entryBId
                                ? 'font-bold text-[#0A1633]'
                                : 'font-medium text-[#0A1633]'
                            }`}
                          >
                            {m.entryBName}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span
                            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono tabular-nums text-sm font-bold ${
                              isFinished
                                ? 'bg-[#0A1633] text-white'
                                : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569]'
                            }`}
                          >
                            {formatFootballScoreString(m)}
                          </span>
                        </div>
                      </div>

                      {goalEvents.length > 0 && (
                        <p className="text-[11px] text-[#475569] line-clamp-2">
                          Goles:{' '}
                          {goalEvents
                            .map(
                              (g) =>
                                `${g.playerName} ${g.minute}'${g.type === 'penal' ? ' (P)' : g.type === 'en_contra' ? ' (EC)' : ''}`
                            )
                            .join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#475569] inline-flex items-center gap-1">
                        {m.footballSheet?.signedByReferee ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            Planilla oficial cerrada
                          </>
                        ) : (
                          'Planilla disponible'
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedMatchForSheet(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#0284C7] text-xs font-semibold text-[#0A1633]"
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-[#0284C7]" />
                        Ver planilla de juego
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: JORNADAS */}
      {activeTab === 'jornadas' && (
        <div className="space-y-4">
          {divMatchdays.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              No hay jornadas cargadas para esta categoría.
            </div>
          ) : (
            divMatchdays.map((md) => {
              const mdPhotos = divPhotos.filter((ph) => ph.matchdayId === md.id);
              const mdMatches = divMatches.filter((m) => m.matchdayId === md.id);
              return (
                <div
                  key={md.id}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#0A1633]">{md.name}</h3>
                      {md.description && (
                        <p className="text-xs text-[#475569] mt-0.5">{md.description}</p>
                      )}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#475569]">
                      {md.date ? formatAsuncionDate(md.date) : ''} · {mdMatches.length} partidos
                    </span>
                  </div>

                  {mdPhotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {mdPhotos.map((ph) => (
                        <div key={ph.id} className="rounded-xl overflow-hidden border border-[#E2E8F0]">
                          <OptimizedImage
                            src={ph.thumbUrl || ph.fullUrl}
                            alt={ph.caption || md.name}
                            width={320}
                            height={220}
                            transformWidth={420}
                            className="w-full aspect-[4/3] object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: LISTADO DE JUGADORES Y PLANTELES (Filtrable por categoría, equipo y posición) */}
      {activeTab === 'jugadores' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-2.5" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Buscar jugador, equipo o dorsal..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>

            <select
              value={playerCategoryFilter}
              onChange={(e) => setPlayerCategoryFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
            >
              <option value="ALL">Todas las categorías</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  Categoría: {c}
                </option>
              ))}
            </select>

            <select
              value={playerTeamFilter}
              onChange={(e) => setPlayerTeamFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
            >
              <option value="ALL">Todos los equipos</option>
              {tournamentRegistrations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>

            <select
              value={playerPosFilter}
              onChange={(e) => setPlayerPosFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
            >
              <option value="ALL">Todas las posiciones</option>
              <option value="Arquero">Arquero</option>
              <option value="Defensor">Defensor</option>
              <option value="Mediocampista">Mediocampista</option>
              <option value="Delantero">Delantero</option>
            </select>
          </div>

          {filteredPlayersList.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              No se encontraron jugadores con los filtros aplicados.
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs">
                <span className="font-bold text-[#0A1633]">Listado Oficial de Jugadores</span>
                <span className="font-mono tabular-nums text-[#475569]">
                  {filteredPlayersList.length} jugador(es)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#475569]">
                      <th className="py-2.5 px-3 text-left w-14">Dorsal</th>
                      <th className="py-2.5 px-3 text-left">Jugador</th>
                      <th className="py-2.5 px-3 text-left">Equipo / Club</th>
                      <th className="py-2.5 px-3 text-left">Categoría</th>
                      <th className="py-2.5 px-3 text-left">Posición</th>
                      <th className="py-2.5 px-3 text-left">Pie hábil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredPlayersList.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#0A1633]">
                          #{p.jerseyNumber ?? '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#0A1633]">{p.fullName}</td>
                        <td className="py-2.5 px-3 text-[#475569] font-medium">{p.club}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{p.habitualCategory}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              p.position === 'Arquero'
                                ? 'text-amber-700'
                                : p.position === 'Delantero'
                                ? 'text-emerald-700'
                                : 'text-[#0284C7]'
                            }`}
                          >
                            {p.position || 'Jugador'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {p.preferredFoot || p.dominantHand}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Planilla de Juego */}
      <FootballMatchSheetModal
        open={Boolean(selectedMatchForSheet)}
        onClose={() => setSelectedMatchForSheet(null)}
        match={selectedMatchForSheet}
        tournament={activeTournament}
        division={activeDivision}
      />

      {/* Modal Reglas FIFA */}
      {showFifaRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-[#E2E8F0] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0A1633] flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-700" />
                Reglamento FIFA de la Competencia
              </h3>
              <button
                type="button"
                onClick={() => setShowFifaRulesModal(false)}
                className="text-xs font-semibold text-[#475569] hover:text-[#0A1633]"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#475569] leading-relaxed">
              <p>
                <strong className="text-[#0A1633]">1. Puntuación en Fase de Grupos:</strong>{' '}
                Victoria {fifaConfig.pointsWin} pts, Empate {fifaConfig.pointsDraw} pt, Derrota {fifaConfig.pointsLoss} pts. Walkover oficial FIFA: resultado 3 - 0.
              </p>
              <p>
                <strong className="text-[#0A1633]">2. Desempate Oficial FIFA:</strong>{' '}
                1° Puntos · 2° Diferencia de Gol (DG) · 3° Goles a Favor (GF) · 4° Enfrentamiento directo entre empatados (PTS, DG, GF) · 5° Fair Play (-1 amarilla, -3 doble amarilla, -4 roja directa) · 6° Sorteo.
              </p>
              <p>
                <strong className="text-[#0A1633]">3. Fase Clasificatoria y Fase Final:</strong>{' '}
                Duración 2×{fifaConfig.halfMinutes}&apos;. En caso de empate se habilita{' '}
                {fifaConfig.allowExtraTime ? `alargue 2×${fifaConfig.extraTimeHalfMinutes}' y ` : ''}
                definición por penales FIFA. Máximo {fifaConfig.maxSubstitutions} sustituciones por equipo.
              </p>
              <p>
                <strong className="text-[#0A1633]">4. Goleadores y Valla Menos Vendida:</strong>{' '}
                Los goles en contra no suman para la tabla de goleadores. La valla menos vendida exige al menos{' '}
                {fifaConfig.minMatchesForBestGoalkeeper} partido(s) disputado(s) y ordena por promedio GC/PJ.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {qrOpen && activeTournament && (
        <TournamentQrModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          tournament={activeTournament}
          divisions={divisions}
          logoUrl={logoUrl}
        />
      )}
    </div>
  );
};
