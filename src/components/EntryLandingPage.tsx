import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  MapPin,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Division,
  Match,
  PlayerPublic,
  Tournament,
  TournamentAd,
} from '../types/tennis';
import { PWAInstallButton } from './TopBarAndPWA';

interface EntryLandingPageProps {
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  matches: Match[];
  tournamentAds: TournamentAd[];
  selectedTournamentId: string;
  onEnterTournament: (tournamentId: string) => void;
  onOpenItfModal: () => void;
}

const STATUS_META: Record<
  Tournament['status'],
  { label: string; dotClass: string; textClass: string }
> = {
  en_curso: {
    label: 'En curso ahora',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  inscripciones: {
    label: 'Inscripciones abiertas',
    dotClass: 'bg-[#0284C7]',
    textClass: 'text-[#0284C7]',
  },
  finalizado: {
    label: 'Finalizado',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-600',
  },
  borrador: {
    label: 'Próximamente',
    dotClass: 'bg-[#7C1FA2]',
    textClass: 'text-[#7C1FA2]',
  },
};

const DEFAULT_COVER = '/src/assets/images/hero_clay_court_1795134987256.jpg';

export const EntryLandingPage: React.FC<EntryLandingPageProps> = ({
  tournaments,
  divisions,
  players,
  matches,
  tournamentAds,
  selectedTournamentId,
  onEnterTournament,
  onOpenItfModal,
}) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Tournament['status']>('ALL');
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, boolean>>({});

  const visibleTournaments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments
      .filter((t) => (statusFilter === 'ALL' ? true : t.status === statusFilter))
      .filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.venue.toLowerCase().includes(q) ||
          t.city.toLowerCase().includes(q) ||
          t.organizerName.toLowerCase().includes(q)
      );
  }, [tournaments, statusFilter, query]);

  const featuredSpotlightAd = useMemo(() => {
    const active = tournamentAds.filter((a) => a.active);
    return (
      active.find((a) => a.placement === 'banner_principal') ||
      active[0] ||
      null
    );
  }, [tournamentAds]);

  const totalConfirmedMatches = useMemo(
    () => matches.filter((m) => m.published && !m.isBye).length,
    [matches]
  );

  const scrollToSelector = () => {
    const el = document.getElementById('selector-torneos');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="pb-24 md:pb-12">
      {/* Hero + Banner Publicitario Oficial de PlayPy */}
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-7 sm:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Columna izquierda: Identidad PlayPy y CTA */}
            <div className="lg:col-span-6 space-y-5">
              <div className="flex items-center gap-3.5">
                <img
                  src="/assets/aistudio/1BDAB541-40D5-45D3-AE92-EFF59F03FA01_81898b58.png"
                  alt="Logo oficial de PlayPy"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white border border-[#E2E8F0] p-1.5 shrink-0"
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7C1FA2]">
                    Plataforma Oficial
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold font-display tracking-tight leading-none mt-0.5">
                    <span className="text-[#0A1633]">Play</span>
                    <span className="text-[#7C1FA2]">Py</span>
                  </p>
                  <p className="text-xs font-medium text-[#475569] mt-1">
                    Tu App de Torneos y Competencias
                  </p>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-[#0A1633] leading-[1.1] [text-wrap:balance]">
                Elegí tu torneo y seguí cada punto en vivo
              </h1>

              <p className="text-sm sm:text-base text-[#475569] max-w-xl leading-relaxed">
                Centralizamos múltiples torneos simultáneos con reglamento ITF, fixture por ronda,
                posiciones de grupos, cuadros finales con medallero y galerías de fotos por jornada.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={scrollToSelector}
                  className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#7C1FA2] to-[#0284C7] text-white text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
                >
                  Seleccionar torneo
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onOpenItfModal}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-medium text-[#0A1633] hover:bg-slate-50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-[#7C1FA2]" />
                  Reglas ITF 2026
                </button>

                <PWAInstallButton />
              </div>
            </div>

            {/* Columna derecha: Banner Publicitario de la Aplicación PlayPy */}
            <div className="lg:col-span-6">
              <div className="relative overflow-hidden rounded-3xl bg-[#0A1633] text-white p-6 sm:p-8 border border-[#1E293B]">
                {/* Luces de acento con los colores exactos del logo PlayPy */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#0095FF]/25 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#7C1FA2]/30 blur-3xl"
                />

                <div className="relative z-10 flex flex-col justify-between gap-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#38BDF8]">
                        Banner Oficial · Espacio Publicitario PlayPy
                      </p>
                      <h2 className="text-xl sm:text-2xl font-bold font-display text-white mt-1.5 leading-snug [text-wrap:balance]">
                        Potenciá tu torneo, tus auspiciantes y la experiencia de cada jugador
                      </h2>
                    </div>
                    <img
                      src="/assets/aistudio/1BDAB541-40D5-45D3-AE92-EFF59F03FA01_81898b58.png"
                      alt="PlayPy"
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white p-1 object-contain shrink-0"
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Publicá resultados al instante, organizá categorías y activá banners
                    publicitarios inteligentes generados con IA en formato vertical y horizontal
                    para los sponsors de cada sede.
                  </p>

                  {featuredSpotlightAd ? (
                    <div className="pt-4 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#E879F9]">
                          Sponsor destacado · {featuredSpotlightAd.sponsorName}
                        </p>
                        <p className="text-sm font-semibold text-white truncate mt-0.5">
                          {featuredSpotlightAd.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEnterTournament(featuredSpotlightAd.tournamentId)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-white text-[#0A1633] text-xs font-bold hover:bg-slate-100 transition-colors shrink-0"
                      >
                        Ir al torneo
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4 border-t border-white/15 flex items-center justify-between gap-3 text-xs text-slate-300">
                      <span>Cobertura multi-sede · Hora oficial America/Asuncion</span>
                      <span className="font-semibold text-[#38BDF8] shrink-0">PlayPy 2026</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Datos de la aplicación */}
          <div className="mt-8 sm:mt-10 grid grid-cols-2 lg:grid-cols-4 border border-[#E2E8F0] rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] bg-[#F8FAFC]">
            <div className="p-4 sm:p-5">
              <p className="text-xs text-[#475569]">Torneos en PlayPy</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0A1633]">
                {tournaments.length}
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs text-[#475569]">Categorías y divisiones</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#7C1FA2]">
                {divisions.length}
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs text-[#475569]">Jugadores en competencia</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0284C7]">
                {players.length}
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs text-[#475569]">Partidos publicados</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0A1633]">
                {totalConfirmedMatches}
              </p>
            </div>
          </div>

          {/* Pilares de la plataforma */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#7C1FA2]/10 text-[#7C1FA2] flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0A1633]">Cuadros y medallero oficial</h2>
                <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                  Seguimiento de grupos, cruces eliminatorios y podio Oro, Plata y Bronce en tiempo real.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0A1633]">Fixture ordenado y flexible</h2>
                <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                  Consultá partidos por ronda o fecha, tie-breaks a 7 o 10 puntos y galerías por jornada.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#0A1633]/10 text-[#0A1633] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0A1633]">Banners IA vertical y horizontal</h2>
                <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                  Cada torneo genera y adapta sus publicidades automáticamente para móviles y pantallas grandes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Selector de Torneos para Ingresar a la Competencia */}
      <section id="selector-torneos" className="max-w-7xl mx-auto px-3 sm:px-6 mt-8 sm:mt-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7C1FA2]">
              Portal de Competencias
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0A1633] mt-1">
              Seleccioná el torneo donde querés ingresar
            </h2>
            <p className="text-sm text-[#475569] mt-1">
              Tocá cualquier torneo para abrir su fixture, tabla de posiciones, cuadro final y galería.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-3" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar torneo, sede o ciudad..."
                className="w-full sm:w-64 h-10 pl-9 pr-3 rounded-xl border border-[#E2E8F0] bg-white text-xs text-[#0A1633] focus:outline-none focus:ring-2 focus:ring-[#7C1FA2]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'en_curso', label: 'En curso' },
                  { id: 'inscripciones', label: 'Inscripciones' },
                  { id: 'finalizado', label: 'Finalizados' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === item.id
                      ? 'bg-[#0A1633] text-white'
                      : 'text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleTournaments.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-sm text-[#475569]">
            No se encontraron torneos con el filtro aplicado.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleTournaments.map((t) => {
              const tDivs = divisions.filter((d) => d.tournamentId === t.id);
              const tPlayers = players.filter((p) => p.tournamentId === t.id);
              const tAds = tournamentAds.filter((a) => a.tournamentId === t.id && a.active);
              const meta = STATUS_META[t.status];
              const isCurrent = t.id === selectedTournamentId;
              const coverSrc =
                brokenCoverIds[t.id] || !t.coverImageUrl
                  ? DEFAULT_COVER
                  : t.coverImageUrl;

              return (
                <article
                  key={t.id}
                  className={`group bg-white rounded-2xl border overflow-hidden flex flex-col justify-between transition-colors ${
                    isCurrent
                      ? 'border-[#7C1FA2]/60 ring-1 ring-[#7C1FA2]/20'
                      : 'border-[#E2E8F0] hover:border-[#0284C7]/60'
                  }`}
                >
                  <div>
                    <div className="relative aspect-[16/9] bg-[#0A1633] overflow-hidden">
                      <img
                        src={coverSrc}
                        alt={`Portada de ${t.name}`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenCoverIds((prev) => ({ ...prev, [t.id]: true }))
                        }
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A1633]/85 via-[#0A1633]/25 to-transparent flex flex-col justify-between p-4 text-white">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-black/45 backdrop-blur-sm px-2.5 py-1 rounded-md">
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                            {meta.label}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-white/90">
                            {t.itfEdition}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-slate-200 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                            <span className="truncate">
                              {t.venue} · {t.city}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#7C1FA2] truncate">
                          {t.organizerName}
                        </p>
                        <h3 className="text-lg font-bold text-[#0A1633] mt-0.5 leading-snug">
                          {t.name}
                        </h3>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0] text-xs">
                        <div>
                          <p className="text-[#475569] text-[11px]">Divisiones</p>
                          <p className="font-mono tabular-nums font-bold text-[#0A1633] mt-0.5 flex items-center gap-1">
                            <Trophy className="w-3.5 h-3.5 text-[#7C1FA2]" />
                            {tDivs.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#475569] text-[11px]">Jugadores</p>
                          <p className="font-mono tabular-nums font-bold text-[#0A1633] mt-0.5 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-[#0284C7]" />
                            {tPlayers.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#475569] text-[11px]">Sponsors</p>
                          <p className="font-mono tabular-nums font-bold text-[#0A1633] mt-0.5">
                            {tAds.length}
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-[#475569] font-mono tabular-nums">
                        {t.startDate} al {t.endDate} · {t.courts.length} canchas
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => onEnterTournament(t.id)}
                      className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-[#0A1633] text-white text-xs sm:text-sm font-semibold hover:bg-gradient-to-r hover:from-[#7C1FA2] hover:to-[#0284C7] transition-all"
                    >
                      Ingresar a la competencia
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
