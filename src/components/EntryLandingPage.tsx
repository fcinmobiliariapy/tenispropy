import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  ExternalLink,
  MapPin,
  QrCode,
  Search,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Division,
  Match,
  PlayerPublic,
  SiteLandingConfig,
  SitePillarIcon,
  Tournament,
  TournamentAd as TournamentAdModel,
} from '../types/tennis';
import {
  DEFAULT_SITE_LANDING_CONFIG,
  DEFAULT_TOURNAMENT_COVER,
  OFFICIAL_PLAYPY_LOGO,
} from '../data/siteConfigDefaults';
import { PWAInstallButton } from './TopBarAndPWA';
import { TournamentAd } from './TournamentAd';
import { formatScoreString } from '../utils/itfRules';
import { formatAsuncionDate } from '../utils/tournamentEngine';
import { buildMatchWhatsAppMessage } from '../utils/whatsappShare';
import { buildTournamentDirectUrl } from '../utils/tournamentLinks';
import { WhatsAppShareButton } from './WhatsAppShareButton';
import { getOptimizedImageUrl } from '../utils/imageOptimizer';
import { OptimizedImage } from './OptimizedImage';
import { ModalSkeleton } from './Skeletons';

const TournamentQrModal = lazy(() =>
  import('./TournamentQrModal').then((m) => ({ default: m.TournamentQrModal }))
);

interface EntryLandingPageProps {
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  matches: Match[];
  tournamentAds: TournamentAdModel[];
  siteConfig?: SiteLandingConfig;
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

const PILLAR_STYLES: Record<
  SitePillarIcon,
  { icon: React.ReactNode; boxClass: string }
> = {
  award: {
    icon: <Award className="w-5 h-5" />,
    boxClass: 'bg-[#7C1FA2]/10 text-[#7C1FA2]',
  },
  calendar: {
    icon: <Calendar className="w-5 h-5" />,
    boxClass: 'bg-[#0284C7]/10 text-[#0284C7]',
  },
  sparkles: {
    icon: <Sparkles className="w-5 h-5" />,
    boxClass: 'bg-[#0A1633]/10 text-[#0A1633]',
  },
  trophy: {
    icon: <Trophy className="w-5 h-5" />,
    boxClass: 'bg-[#7C1FA2]/10 text-[#7C1FA2]',
  },
  users: {
    icon: <Users className="w-5 h-5" />,
    boxClass: 'bg-[#0284C7]/10 text-[#0284C7]',
  },
  shield: {
    icon: <Shield className="w-5 h-5" />,
    boxClass: 'bg-[#0A1633]/10 text-[#0A1633]',
  },
};

export const EntryLandingPage: React.FC<EntryLandingPageProps> = ({
  tournaments,
  divisions,
  players,
  matches,
  tournamentAds,
  siteConfig = DEFAULT_SITE_LANDING_CONFIG,
  selectedTournamentId,
  onEnterTournament,
  onOpenItfModal,
}) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Tournament['status']>('ALL');
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, boolean>>({});
  const [logoBroken, setLogoBroken] = useState(false);
  const [bannerImgBroken, setBannerImgBroken] = useState(false);
  const [qrTournament, setQrTournament] = useState<Tournament | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setLogoBroken(false);
  }, [siteConfig.logoUrl]);

  useEffect(() => {
    setBannerImgBroken(false);
  }, [siteConfig.bannerImageHorizontalUrl, siteConfig.bannerImageVerticalUrl]);

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

  const featuredTournament = useMemo(
    () =>
      featuredSpotlightAd
        ? tournaments.find((t) => t.id === featuredSpotlightAd.tournamentId) || null
        : null,
    [featuredSpotlightAd, tournaments]
  );

  const totalConfirmedMatches = useMemo(
    () => matches.filter((m) => m.published && !m.isBye).length,
    [matches]
  );

  const highlightMatches = useMemo(() => {
    const valid = matches.filter(
      (m) => !m.isBye && m.published && m.entryAId && m.entryBId
    );
    const live = valid.filter((m) => m.status === 'en_curso');
    const upcoming = valid
      .filter((m) => m.status === 'programado' || m.status === 'reprogramado')
      .sort((a, b) =>
        `${a.scheduledDate || '9999-99-99'} ${a.scheduledTime || '99:99'}`.localeCompare(
          `${b.scheduledDate || '9999-99-99'} ${b.scheduledTime || '99:99'}`
        )
      );
    const finished = valid
      .filter((m) =>
        ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return [...live, ...upcoming, ...finished].slice(0, 6);
  }, [matches]);

  const scrollToSelector = () => {
    const el = document.getElementById('selector-torneos');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resolvedLogo = logoBroken
    ? OFFICIAL_PLAYPY_LOGO
    : siteConfig.logoUrl?.trim() || OFFICIAL_PLAYPY_LOGO;
  const resolvedDefaultCover =
    siteConfig.defaultTournamentCoverUrl?.trim() || DEFAULT_TOURNAMENT_COVER;
  const hasBannerImages = Boolean(
    !bannerImgBroken &&
      (siteConfig.bannerImageHorizontalUrl?.trim() ||
        siteConfig.bannerImageVerticalUrl?.trim())
  );
  const bannerHoriz =
    siteConfig.bannerImageHorizontalUrl?.trim() ||
    siteConfig.bannerImageVerticalUrl?.trim() ||
    '';
  const bannerVert =
    siteConfig.bannerImageVerticalUrl?.trim() ||
    siteConfig.bannerImageHorizontalUrl?.trim() ||
    '';

  const statItems = [
    {
      label: siteConfig.stat1Label || 'Torneos en PlayPy',
      value:
        !siteConfig.useAutoMetrics && siteConfig.stat1CustomValue?.trim()
          ? siteConfig.stat1CustomValue.trim()
          : tournaments.length,
      tone: 'text-[#0A1633]',
    },
    {
      label: siteConfig.stat2Label || 'Categorías y divisiones',
      value:
        !siteConfig.useAutoMetrics && siteConfig.stat2CustomValue?.trim()
          ? siteConfig.stat2CustomValue.trim()
          : divisions.length,
      tone: 'text-[#7C1FA2]',
    },
    {
      label: siteConfig.stat3Label || 'Jugadores en competencia',
      value:
        !siteConfig.useAutoMetrics && siteConfig.stat3CustomValue?.trim()
          ? siteConfig.stat3CustomValue.trim()
          : players.length,
      tone: 'text-[#0284C7]',
    },
    {
      label: siteConfig.stat4Label || 'Partidos publicados',
      value:
        !siteConfig.useAutoMetrics && siteConfig.stat4CustomValue?.trim()
          ? siteConfig.stat4CustomValue.trim()
          : totalConfirmedMatches,
      tone: 'text-[#0A1633]',
    },
  ];

  return (
    <div className="pb-24 md:pb-12">
      {/* Hero + Banner Publicitario Oficial Configurable */}
      <section className="relative bg-white border-b border-[#E2E8F0] overflow-hidden">
        {siteConfig.heroBackgroundImageUrl && (
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            <img
              src={getOptimizedImageUrl(siteConfig.heroBackgroundImageUrl, 1600)}
              alt=""
              width={1600}
              height={900}
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-15"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/90 to-white" />
          </div>
        )}

        <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 py-7 sm:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Columna izquierda: Identidad y CTA */}
            <div className={siteConfig.bannerEnabled ? 'lg:col-span-6 space-y-5' : 'lg:col-span-12 space-y-5 max-w-3xl'}>
              <div className="flex items-center gap-3.5">
                <img
                  src={getOptimizedImageUrl(resolvedLogo, 160)}
                  alt={`Logo oficial de ${siteConfig.brandFirst}${siteConfig.brandSecond}`}
                  width={80}
                  height={80}
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoBroken(true)}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white border border-[#E2E8F0] p-1.5 shrink-0"
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7C1FA2]">
                    {siteConfig.platformBadge}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold font-display tracking-tight leading-none mt-0.5">
                    <span className="text-[#0A1633]">{siteConfig.brandFirst}</span>
                    <span className="text-[#7C1FA2]">{siteConfig.brandSecond}</span>
                  </p>
                  {siteConfig.brandSubtitle && (
                    <p className="text-xs font-medium text-[#475569] mt-1">
                      {siteConfig.brandSubtitle}
                    </p>
                  )}
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-[#0A1633] leading-[1.1] [text-wrap:balance]">
                {siteConfig.heroTitle}
              </h1>

              {siteConfig.heroDescription && (
                <p className="text-sm sm:text-base text-[#475569] max-w-xl leading-relaxed">
                  {siteConfig.heroDescription}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={scrollToSelector}
                  className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#7C1FA2] to-[#0284C7] text-white text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
                >
                  {siteConfig.primaryCtaLabel || 'Seleccionar torneo'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                {siteConfig.showItfButton && (
                  <button
                    type="button"
                    onClick={onOpenItfModal}
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-medium text-[#0A1633] hover:bg-slate-50 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-[#7C1FA2]" />
                    {siteConfig.secondaryCtaLabel || 'Reglas ITF 2026'}
                  </button>
                )}

                <PWAInstallButton />
              </div>
            </div>

            {/* Columna derecha: Banner Publicitario Principal Configurable (incluye soporte adaptativo Horizontal + Vertical) */}
            {siteConfig.bannerEnabled && (
              <div className="lg:col-span-6">
                <div className="relative overflow-hidden rounded-3xl bg-[#0A1633] text-white border border-[#1E293B]">
                  {hasBannerImages ? (
                    <div className="relative">
                      <div
                        className={
                          isMobileViewport && siteConfig.bannerImageVerticalUrl
                            ? 'aspect-[3/4] max-h-[420px] mx-auto bg-[#0A1633]'
                            : 'aspect-[16/9] bg-[#0A1633]'
                        }
                      >
                        <picture className="block w-full h-full">
                          {siteConfig.bannerImageVerticalUrl && (
                            <source media="(max-width: 639px)" srcSet={getOptimizedImageUrl(bannerVert, 720)} />
                          )}
                          {siteConfig.bannerImageHorizontalUrl && (
                            <source media="(min-width: 640px)" srcSet={getOptimizedImageUrl(bannerHoriz, 1280)} />
                          )}
                          <img
                            src={getOptimizedImageUrl(isMobileViewport ? bannerVert : bannerHoriz, 1080)}
                            alt={siteConfig.bannerTitle || 'Banner publicitario'}
                            width={1280}
                            height={720}
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={() => setBannerImgBroken(true)}
                            className="w-full h-full object-cover"
                          />
                        </picture>
                      </div>
                      <div className="p-5 sm:p-6 bg-[#0A1633] border-t border-white/10 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#38BDF8]">
                              {siteConfig.bannerKicker}
                            </p>
                            <h2 className="text-lg sm:text-xl font-bold font-display text-white mt-1 leading-snug">
                              {siteConfig.bannerTitle}
                            </h2>
                          </div>
                          {siteConfig.bannerCtaUrl ? (
                            <a
                              href={siteConfig.bannerCtaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl bg-white text-[#0A1633] text-xs font-bold hover:bg-slate-100 shrink-0"
                            >
                              {siteConfig.bannerCtaLabel || 'Conocer más'}
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : null}
                        </div>
                        {siteConfig.bannerDescription && (
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {siteConfig.bannerDescription}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative p-6 sm:p-8">
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
                              {siteConfig.bannerKicker}
                            </p>
                            <h2 className="text-xl sm:text-2xl font-bold font-display text-white mt-1.5 leading-snug [text-wrap:balance]">
                              {siteConfig.bannerTitle}
                            </h2>
                          </div>
                          {siteConfig.bannerBadgeUrl && (
                            <img
                              src={getOptimizedImageUrl(siteConfig.bannerBadgeUrl, 128)}
                              alt={`${siteConfig.brandFirst}${siteConfig.brandSecond}`}
                              width={56}
                              height={56}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white p-1 object-contain shrink-0"
                            />
                          )}
                        </div>

                        {siteConfig.bannerDescription && (
                          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            {siteConfig.bannerDescription}
                          </p>
                        )}

                        {siteConfig.bannerCtaUrl && (
                          <div>
                            <a
                              href={siteConfig.bannerCtaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-gradient-to-r from-[#7C1FA2] to-[#0284C7] text-white text-xs font-bold hover:opacity-95"
                            >
                              {siteConfig.bannerCtaLabel || 'Conocer más'}
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}

                        {siteConfig.bannerShowSpotlightAd && featuredSpotlightAd ? (
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
                            <span>{siteConfig.bannerFooterLeft}</span>
                            <span className="font-semibold text-[#38BDF8] shrink-0">
                              {siteConfig.bannerFooterRight}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Datos / métricas de la aplicación */}
          <div className="mt-8 sm:mt-10 grid grid-cols-2 lg:grid-cols-4 border border-[#E2E8F0] rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] bg-[#F8FAFC]">
            {statItems.map((st, idx) => (
              <div key={idx} className="p-4 sm:p-5">
                <p className="text-xs text-[#475569]">{st.label}</p>
                <p className={`mt-1 text-2xl font-bold font-mono tabular-nums ${st.tone}`}>
                  {st.value}
                </p>
              </div>
            ))}
          </div>

          {/* Pilares de la plataforma */}
          {siteConfig.pillars.length > 0 && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {siteConfig.pillars.map((pillar, idx) => {
                const style = PILLAR_STYLES[pillar.icon] || PILLAR_STYLES.award;
                return (
                  <div key={idx} className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.boxClass}`}
                    >
                      {style.icon}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#0A1633]">{pillar.title}</h2>
                      <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sponsor destacado usando TournamentAd adaptativo cuando el banner superior tiene imagen */}
          {siteConfig.bannerEnabled &&
            hasBannerImages &&
            siteConfig.bannerShowSpotlightAd &&
            featuredSpotlightAd && (
              <div className="mt-8 pt-6 border-t border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#7C1FA2]">
                    Auspiciante destacado del circuito
                  </p>
                  <button
                    type="button"
                    onClick={() => onEnterTournament(featuredSpotlightAd.tournamentId)}
                    className="text-xs font-semibold text-[#0284C7] hover:underline"
                  >
                    Ver torneo ({featuredTournament?.name || 'Ir al portal'}) →
                  </button>
                </div>
                <TournamentAd
                  ad={featuredSpotlightAd}
                  variant="featured"
                  tournamentName={featuredTournament?.name}
                  tournamentVenue={featuredTournament?.venue}
                  tournamentCity={featuredTournament?.city}
                />
              </div>
            )}
        </div>
      </section>

      {/* Marcadores en vivo, próximos cruces y resultados rápidos con compartir por WhatsApp */}
      {highlightMatches.length > 0 && (
        <section className="max-w-7xl mx-auto px-3 sm:px-6 mt-7 sm:mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7C1FA2]">
                Actividad del circuito
              </p>
              <h2 className="text-lg sm:text-xl font-bold text-[#0A1633]">
                Partidos en cancha, próximos cruces y resultados
              </h2>
            </div>
            <span className="text-xs text-[#475569]">
              Compartí cualquier cruce al instante por WhatsApp
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {highlightMatches.map((m) => {
              const t = tournaments.find((x) => x.id === m.tournamentId);
              const d = divisions.find((x) => x.id === m.divisionId);
              const isFinished = ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
              const isLive = m.status === 'en_curso';
              return (
                <div
                  key={m.id}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-[#7C1FA2]/45 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#7C1FA2] truncate">
                        {t?.name || 'Torneo'} · {d?.name || m.roundName}
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          isLive
                            ? 'text-[#C2410C]'
                            : m.status === 'wo'
                            ? 'text-amber-800'
                            : isFinished
                            ? 'text-[#15803D]'
                            : 'text-[#0284C7]'
                        }`}
                      >
                        {isLive
                          ? '● En cancha'
                          : m.status === 'wo'
                          ? 'W.O.'
                          : isFinished
                          ? 'Finalizado'
                          : 'Programado'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm space-y-0.5">
                        <p className={`truncate ${m.winnerEntryId === m.entryAId ? 'font-bold text-[#0A1633]' : 'font-medium text-[#0A1633]'}`}>
                          {m.entryAName}
                        </p>
                        <p className={`truncate ${m.winnerEntryId === m.entryBId ? 'font-bold text-[#0A1633]' : 'font-medium text-[#0A1633]'}`}>
                          {m.entryBName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {isFinished ? (
                          <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#7C1FA2]">
                            {formatScoreString(m.sets, m.status)}
                          </span>
                        ) : (
                          <span className="font-mono tabular-nums text-[11px] text-[#475569]">
                            {m.scheduledDate
                              ? `${formatAsuncionDate(m.scheduledDate)}${m.scheduledTime ? ` · ${m.scheduledTime}h` : ''}`
                              : 'Por programar'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onEnterTournament(m.tournamentId)}
                      className="text-xs font-semibold text-[#0284C7] hover:underline truncate"
                    >
                      Ver en torneo →
                    </button>
                    <WhatsAppShareButton
                      compact
                      label="WhatsApp"
                      message={buildMatchWhatsAppMessage({
                        match: m,
                        tournament: t,
                        division: d,
                        appUrl: buildTournamentDirectUrl(m.tournamentId, {
                          divisionId: m.divisionId,
                          tab: 'fixture',
                        }),
                      })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Selector de Torneos para Ingresar a la Competencia */}
      <section id="selector-torneos" className="max-w-7xl mx-auto px-3 sm:px-6 mt-8 sm:mt-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7C1FA2]">
              {siteConfig.selectorKicker}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0A1633] mt-1">
              {siteConfig.selectorTitle}
            </h2>
            {siteConfig.selectorSubtitle && (
              <p className="text-sm text-[#475569] mt-1">{siteConfig.selectorSubtitle}</p>
            )}
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
                  ? resolvedDefaultCover
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
                      <OptimizedImage
                        src={coverSrc}
                        alt={`Portada de ${t.name}`}
                        width={640}
                        height={360}
                        transformWidth={640}
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

                  <div className="px-5 pb-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEnterTournament(t.id)}
                      className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-[#0A1633] text-white text-xs sm:text-sm font-semibold hover:bg-gradient-to-r hover:from-[#7C1FA2] hover:to-[#0284C7] transition-all"
                    >
                      Ingresar a la competencia
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrTournament(t)}
                      title="Link directo y código QR del torneo"
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-[#0A1633] text-xs font-semibold hover:bg-slate-50 transition-colors shrink-0"
                    >
                      <QrCode className="w-4 h-4 text-[#7C1FA2]" />
                      <span>QR</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {qrTournament && (
        <Suspense fallback={<ModalSkeleton />}>
          <TournamentQrModal
            open={Boolean(qrTournament)}
            onClose={() => setQrTournament(null)}
            tournament={qrTournament}
            divisions={divisions}
            logoUrl={resolvedLogo}
          />
        </Suspense>
      )}
    </div>
  );
};
