import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Images,
  LayoutGrid,
  List,
  Medal,
  QrCode,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
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
} from '../types/tennis';
import {
  fetchPaginatedPlayersByTournament,
  fetchPaginatedPublishedPhotos,
} from '../services/firestoreService';
import { formatScoreString } from '../utils/itfRules';
import {
  compareMatchesByRound,
  computeGroupStandings,
  computeQualifiedSeededEntries,
  dedupeMatches,
  formatAsuncionDate,
  generateKnockoutBracket,
  getKnockoutStageRank,
  isRealFinalMatch,
} from '../utils/tournamentEngine';
import { PublicTab, PWAInstallButton } from './TopBarAndPWA';
import { TournamentAd as TournamentAdCard } from './TournamentAd';
import {
  buildFixtureAgendaWhatsAppMessage,
  buildMatchWhatsAppMessage,
  buildTournamentWhatsAppMessage,
} from '../utils/whatsappShare';
import { buildTournamentDirectUrl } from '../utils/tournamentLinks';
import { WhatsAppShareButton } from './WhatsAppShareButton';
import { OptimizedImage } from './OptimizedImage';
import { isFootballTournament } from '../utils/footballEngine';
import { AdminSectionSkeleton, GalleryGridSkeleton, ModalSkeleton, PlayersGridSkeleton } from './Skeletons';

const FootballPublicPortal = lazy(() =>
  import('./football/FootballPublicPortal').then((m) => ({ default: m.FootballPublicPortal }))
);
const TournamentTrophiesViewer = lazy(() =>
  import('./TournamentTrophiesViewer').then((m) => ({ default: m.TournamentTrophiesViewer }))
);
const HeadToHeadModal = lazy(() =>
  import('./HeadToHeadModal').then((m) => ({ default: m.HeadToHeadModal }))
);
const TournamentQrModal = lazy(() =>
  import('./TournamentQrModal').then((m) => ({ default: m.TournamentQrModal }))
);
const MatchupsFlyerModal = lazy(() =>
  import('./MatchupsFlyerModal').then((m) => ({ default: m.MatchupsFlyerModal }))
);

interface PublicPortalProps {
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
  onOpenItfModal: () => void;
  pushEnabled: boolean;
  onRequestPush: () => Promise<boolean>;
  followedPlayerIds: string[];
  onToggleFollowPlayer: (playerId: string) => void;
  defaultTournamentCoverUrl?: string;
  logoUrl?: string;
}

const MATCH_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  programado: { label: 'Programado', tone: 'text-slate-700' },
  en_curso: { label: 'En cancha', tone: 'text-[#C2410C] font-semibold' },
  finalizado: { label: 'Finalizado', tone: 'text-[#15803D] font-medium' },
  wo: { label: 'Walkover (W.O.)', tone: 'text-amber-800 font-semibold' },
  retiro: { label: 'Retiro (RET)', tone: 'text-amber-800 font-medium' },
  descalificado: { label: 'Descalificado (DQ)', tone: 'text-red-700 font-medium' },
  reprogramado: { label: 'Reprogramado', tone: 'text-[#C2410C] font-medium' },
};

const TIEBREAKER_LABELS: Record<string, string> = {
  points: 'Puntos de clasificación',
  head_to_head: 'Enfrentamiento directo',
  sets_pct: 'Porcentaje de sets ganados',
  sets_diff: 'Diferencia de sets',
  games_pct: 'Porcentaje de games ganados',
  games_diff: 'Diferencia de games',
  draw: 'Sorteo / Preclasificación',
};

const PlayerAvatar: React.FC<{
  player?: PlayerPublic | null;
  fallbackName?: string;
  sizeClass?: string;
  toneClass?: string;
}> = ({
  player,
  fallbackName = '',
  sizeClass = 'w-11 h-11 text-xs',
  toneClass = 'bg-[#7C1FA2] text-white',
}) => {
  const initials = useMemo(() => {
    if (player) {
      const f = player.firstName?.trim()?.[0] || '';
      const l = player.lastName?.trim()?.[0] || '';
      if (f || l) return `${f}${l}`.toUpperCase();
    }
    const parts = fallbackName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0]?.slice(0, 2) || 'TC').toUpperCase();
  }, [player, fallbackName]);

  const initialsFallback = (
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center font-bold tracking-tight shrink-0 ${toneClass}`}
    >
      {initials}
    </div>
  );

  if (player?.photoUrl) {
    return (
      <OptimizedImage
        src={player.photoUrl}
        alt={player.fullName || fallbackName || 'Foto del jugador'}
        width={64}
        height={64}
        transformWidth={160}
        fallback={initialsFallback}
        className={`${sizeClass} rounded-xl object-cover border border-[#E2E8F0] bg-slate-100 shrink-0`}
      />
    );
  }

  return initialsFallback;
};

const EntryAvatars: React.FC<{
  entryPlayers: PlayerPublic[];
  fallbackName: string;
  sizeClass?: string;
  toneClass?: string;
}> = ({ entryPlayers, fallbackName, sizeClass = 'w-12 h-12 text-sm', toneClass }) => {
  if (entryPlayers.length === 0) {
    return (
      <PlayerAvatar
        fallbackName={fallbackName}
        sizeClass={sizeClass}
        toneClass={toneClass}
      />
    );
  }
  if (entryPlayers.length === 1) {
    return (
      <PlayerAvatar
        player={entryPlayers[0]}
        fallbackName={fallbackName}
        sizeClass={sizeClass}
        toneClass={toneClass}
      />
    );
  }
  return (
    <div className="flex items-center -space-x-2.5 shrink-0">
      {entryPlayers.slice(0, 2).map((p) => (
        <div key={p.id} className="rounded-xl ring-2 ring-white">
          <PlayerAvatar
            player={p}
            sizeClass={sizeClass}
            toneClass={toneClass}
          />
        </div>
      ))}
    </div>
  );
};

interface BracketMatchCardProps {
  match: Match;
  variant?: 'standard' | 'final' | 'third_place';
  tournamentName?: string;
  divisionName?: string;
  getSidePlayers: (playerIds: string[], entryId?: string | null) => PlayerPublic[];
  getSideSeed: (entryId?: string | null) => number | null;
  onSelectMatch?: (match: Match) => void;
}

const BracketMatchCard: React.FC<BracketMatchCardProps> = ({
  match,
  variant = 'standard',
  tournamentName,
  divisionName,
  getSidePlayers,
  getSideSeed,
  onSelectMatch,
}) => {
  const isFinal = variant === 'final';
  const isThird = variant === 'third_place';
  const canInspectH2H = Boolean(
    onSelectMatch && !match.isBye && (match.entryAId || match.entryBId)
  );
  const hasWinner = Boolean(match.winnerEntryId && !match.isBye);
  const statusInfo = MATCH_STATUS_LABEL[match.status];

  const playersA = isFinal || isThird ? getSidePlayers(match.playerIdsA, match.entryAId) : [];
  const playersB = isFinal || isThird ? getSidePlayers(match.playerIdsB, match.entryBId) : [];
  const seedA = getSideSeed(match.entryAId);
  const seedB = getSideSeed(match.entryBId);

  const scheduleText = match.isBye
    ? 'Pase libre'
    : match.scheduledDate
    ? `${formatAsuncionDate(match.scheduledDate)}${match.scheduledTime ? ` · ${match.scheduledTime} hs` : ''}`
    : 'Por programar';

  const interactiveClass = canInspectH2H
    ? 'cursor-pointer hover:border-[#7C1FA2]/70 transition-colors focus-visible:outline-2 focus-visible:outline-[#7C1FA2]'
    : '';

  const containerClass = `${
    isFinal
      ? 'rounded-2xl border border-[#F59E0B]/60 bg-gradient-to-b from-[#FFFBEB] via-white to-[#F8FAFC] p-3.5 sm:p-4 shadow-[0_10px_28px_-14px_rgba(180,83,9,0.28)]'
      : isThird
      ? 'rounded-2xl border border-[#EA580C]/45 bg-gradient-to-b from-[#FFF7ED] via-white to-white p-3.5 sm:p-4 shadow-[0_10px_28px_-14px_rgba(194,65,12,0.18)]'
      : 'rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3'
  } ${interactiveClass}`;

  const renderSide = (side: 'A' | 'B') => {
    const entryId = side === 'A' ? match.entryAId : match.entryBId;
    const entryName = side === 'A' ? match.entryAName : match.entryBName;
    const seed = side === 'A' ? seedA : seedB;
    const sidePlayers = side === 'A' ? playersA : playersB;

    const isWinner = Boolean(hasWinner && entryId && match.winnerEntryId === entryId);
    const isRunnerUp = Boolean(isFinal && hasWinner && !isWinner);

    const rowTone = isFinal
      ? isWinner
        ? 'bg-gradient-to-r from-[#FEF3C7]/90 to-[#FFFBEB] border-[#F59E0B]/65'
        : isRunnerUp
        ? 'bg-gradient-to-r from-[#F1F5F9] to-[#F8FAFC] border-[#94A3B8]/60'
        : 'bg-white/90 border-[#E2E8F0]/80'
      : isThird
      ? isWinner
        ? 'bg-gradient-to-r from-[#FFEDD5]/90 to-[#FFF7ED] border-[#EA580C]/55'
        : 'bg-white/90 border-[#E2E8F0]/80'
      : isWinner
      ? 'bg-white border-emerald-200'
      : 'bg-white/75 border-transparent';

    const avatarTone = isFinal
      ? isWinner
        ? 'bg-[#92400E] text-[#FEF3C7] ring-2 ring-[#F59E0B]/60'
        : isRunnerUp
        ? 'bg-[#334155] text-[#F1F5F9] ring-2 ring-[#94A3B8]/60'
        : 'bg-slate-600 text-white'
      : isThird
      ? isWinner
        ? 'bg-[#9A3412] text-[#FFEDD5] ring-2 ring-[#EA580C]/50'
        : 'bg-slate-600 text-white'
      : 'bg-[#7C1FA2] text-white';

    const medalCaption =
      isFinal && isWinner
        ? { text: '1° · Campeón', cls: 'text-[#92400E]' }
        : isFinal && isRunnerUp
        ? { text: '2° · Vicecampeón', cls: 'text-[#475569]' }
        : isThird && isWinner
        ? { text: '3° · Tercer Puesto', cls: 'text-[#9A3412]' }
        : null;

    const outcomeOnlyLabel =
      match.sets.length === 0 && isWinner
        ? match.status === 'wo'
          ? 'W.O.'
          : match.status === 'retiro'
          ? 'RET'
          : match.status === 'descalificado'
          ? 'DQ'
          : match.status === 'finalizado'
          ? 'GAN'
          : ''
        : '';

    return (
      <div
        className={`flex items-center justify-between gap-2.5 rounded-xl border transition-colors ${
          isFinal || isThird ? 'px-3 py-2.5' : 'px-2.5 py-2'
        } ${rowTone}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {(isFinal || isThird) && (
            <EntryAvatars
              entryPlayers={sidePlayers}
              fallbackName={entryName}
              sizeClass="w-8 h-8 text-[11px]"
              toneClass={avatarTone}
            />
          )}
          <div className="min-w-0">
            {medalCaption && (
              <p className={`text-[10px] font-bold uppercase tracking-[0.08em] leading-none mb-1 ${medalCaption.cls}`}>
                {medalCaption.text}
              </p>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              {seed && (
                <span className="font-mono tabular-nums text-[10px] font-semibold text-[#475569] shrink-0">
                  [{seed}]
                </span>
              )}
              <span
                className={`truncate ${
                  isFinal || isThird ? 'text-xs sm:text-sm' : 'text-xs'
                } ${
                  isWinner
                    ? 'font-bold text-[#0A1633]'
                    : isRunnerUp
                    ? 'font-semibold text-[#1E293B]'
                    : 'font-medium text-[#0A1633]'
                }`}
              >
                {entryName}
              </span>
              {isWinner && !isFinal && !isThird && (
                <CheckCircle2
                  className="w-3.5 h-3.5 text-[#15803D] shrink-0"
                  aria-label="Ganador"
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {match.sets.length > 0 ? (
            match.sets.map((s, idx) => {
              const myGames = side === 'A' ? s.a : s.b;
              const oppGames = side === 'A' ? s.b : s.a;
              const tb = side === 'A' ? s.tbA : s.tbB;
              const wonSet = myGames > oppGames;
              return (
                <span
                  key={idx}
                  className={`min-w-[20px] text-center font-mono tabular-nums text-xs ${
                    wonSet
                      ? isFinal && isWinner
                        ? 'font-bold text-[#92400E]'
                        : isThird && isWinner
                        ? 'font-bold text-[#9A3412]'
                        : 'font-bold text-[#7C1FA2]'
                      : 'text-[#475569]'
                  }`}
                >
                  {myGames}
                  {tb !== null && tb !== undefined && (
                    <sup className="text-[9px] font-normal text-[#475569] ml-[1px]">{tb}</sup>
                  )}
                </span>
              );
            })
          ) : outcomeOnlyLabel ? (
            <span
              className={`font-mono tabular-nums text-[11px] font-bold ${
                isThird ? 'text-[#9A3412]' : isFinal ? 'text-[#92400E]' : 'text-[#7C1FA2]'
              }`}
            >
              {outcomeOnlyLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className={containerClass}
      role={canInspectH2H ? 'button' : undefined}
      tabIndex={canInspectH2H ? 0 : undefined}
      onClick={canInspectH2H ? () => onSelectMatch?.(match) : undefined}
      onKeyDown={
        canInspectH2H
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectMatch?.(match);
              }
            }
          : undefined
      }
      title={canInspectH2H ? 'Ver Cara a Cara e historial previo' : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        {isFinal ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FDE68A] to-[#F59E0B] text-[#78350F] flex items-center justify-center shrink-0">
              <Trophy className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#92400E] leading-tight">
                Gran Final · Oro y Plata
              </p>
            </div>
          </div>
        ) : isThird ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FDBA74] to-[#C2410C] text-white flex items-center justify-center shrink-0">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A3412] leading-tight">
                Partido por el 3er Puesto · Bronce
              </p>
            </div>
          </div>
        ) : (
          <span className="text-[11px] font-mono tabular-nums text-[#475569] truncate">
            {scheduleText}
          </span>
        )}

        <span
          className={`text-[11px] shrink-0 ${
            isFinal || isThird
              ? statusInfo?.tone || 'text-[#475569]'
              : 'font-mono tabular-nums text-[#475569]'
          }`}
        >
          {isFinal || isThird
            ? statusInfo?.label || ''
            : match.courtName || ''}
        </span>
      </div>

      <div className="space-y-1.5">
        {renderSide('A')}
        {renderSide('B')}
      </div>

      {(isFinal || isThird) && (
        <div className="mt-2.5 pt-2 border-t border-[#E2E8F0]/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#475569]">
          <span className="font-mono tabular-nums">
            {scheduleText}
            {match.courtName ? ` · ${match.courtName}` : ''}
          </span>
          <div className="flex items-center gap-2">
            {match.outcomeNote && (
              <span className="truncate max-w-full font-medium text-[#0A1633]">
                {match.outcomeNote}
              </span>
            )}
            {!match.isBye && (match.entryAId || match.entryBId) && (
              <>
                {canInspectH2H && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7C1FA2]">
                    <ArrowLeftRight className="w-3 h-3" />
                    Cara a Cara
                  </span>
                )}
                <WhatsAppShareButton
                  compact
                  label="Compartir"
                  message={buildMatchWhatsAppMessage({
                    match,
                    tournamentName,
                    divisionName,
                  })}
                />
              </>
            )}
          </div>
        </div>
      )}

      {!isFinal && !isThird && !match.isBye && (match.entryAId || match.entryBId) && (
        <div className="mt-2 pt-2 border-t border-[#E2E8F0]/70 flex items-center justify-between gap-2">
          <span className={`text-[10px] truncate ${statusInfo?.tone || 'text-[#475569]'}`}>
            {match.status === 'wo' && match.winnerName
              ? `W.O. · Gana ${match.winnerName}`
              : statusInfo?.label || ''}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {canInspectH2H && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#7C1FA2]">
                <ArrowLeftRight className="w-3 h-3" />
                H2H
              </span>
            )}
            <WhatsAppShareButton
              compact
              label="WhatsApp"
              message={buildMatchWhatsAppMessage({
                match,
                tournamentName,
                divisionName,
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const PublicPortal: React.FC<PublicPortalProps> = ({
  tournaments,
  divisions,
  players,
  registrations,
  groups,
  matchdays,
  matches,
  photos,
  notifications,
  tournamentAds,
  tournamentTrophies,
  activeTab,
  onSelectTab,
  onGoLanding,
  selectedTournamentId,
  onSelectTournament,
  selectedDivisionId,
  onSelectDivision,
  onOpenItfModal,
  pushEnabled,
  onRequestPush,
  followedPlayerIds,
  onToggleFollowPlayer,
  defaultTournamentCoverUrl,
  logoUrl,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Fixture filters & ordering
  const [fixtureView, setFixtureView] = useState<'list' | 'calendar'>('list');
  const [fixtureSortBy, setFixtureSortBy] = useState<'ronda' | 'fecha'>('ronda');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filterTournamentId, setFilterTournamentId] = useState<string>('ALL');
  const [filterDivisionId, setFilterDivisionId] = useState<string>('ALL');
  const [filterMatchdayId, setFilterMatchdayId] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterCourt, setFilterCourt] = useState<string>('ALL');
  const [filterPlayerQuery, setFilterPlayerQuery] = useState<string>('');

  // Mobile bracket round selector
  const [mobileBracketRoundIdx, setMobileBracketRoundIdx] = useState<number>(0);

  // Lightbox state
  const [lightboxPhotos, setLightboxPhotos] = useState<MatchdayPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  // Player profile modal, Head-to-Head, QR & Flyer modal state
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerCategoryFilter, setPlayerCategoryFilter] = useState<string>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerPublic | null>(null);
  const [selectedH2HMatch, setSelectedH2HMatch] = useState<Match | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [flyerModalOpen, setFlyerModalOpen] = useState(false);
  const [visiblePlayersLimit, setVisiblePlayersLimit] = useState(18);
  const [visibleFixtureLimit, setVisibleFixtureLimit] = useState(24);
  const playersSentinelRef = useRef<HTMLDivElement | null>(null);
  const photosSentinelRef = useRef<HTMLDivElement | null>(null);

  const activeTournament = useMemo(
    () => tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0] || null,
    [tournaments, selectedTournamentId]
  );

  // Paginación infinita basada en cursor para Jugadores (reduce lecturas iniciales)
  const paginatedPlayersQuery = useInfiniteQuery({
    queryKey: ['players_paginated', activeTournament?.id || 'none'],
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    queryFn: ({ pageParam }) =>
      fetchPaginatedPlayersByTournament({
        tournamentId: activeTournament!.id,
        pageSize: 18,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(
      activeTab === 'jugadores' && activeTournament?.id && !activeTournament?.isDemo
    ),
  });

  // Paginación infinita basada en cursor para Fotos publicadas de jornadas
  const paginatedPhotosQuery = useInfiniteQuery({
    queryKey: ['photos_paginated'],
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    queryFn: ({ pageParam }) =>
      fetchPaginatedPublishedPhotos({
        pageSize: 24,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: activeTab === 'jornadas',
  });

  const mergedPhotos = useMemo(() => {
    const map = new Map<string, MatchdayPhoto>();
    photos.forEach((ph) => map.set(ph.id, ph));
    paginatedPhotosQuery.data?.pages.forEach((page) => {
      page.items.forEach((ph) => map.set(ph.id, ph));
    });
    return Array.from(map.values());
  }, [photos, paginatedPhotosQuery.data]);

  const heroCoverUrl =
    activeTournament?.coverImageUrl ||
    defaultTournamentCoverUrl ||
    '/src/assets/images/hero_clay_court_1795134987256.jpg';

  useEffect(() => {
    setHeroImgFailed(false);
  }, [heroCoverUrl]);

  useEffect(() => {
    setSelectedPlayer(null);
    setPlayerSearch('');
    setPlayerCategoryFilter('ALL');
    setVisiblePlayersLimit(18);
  }, [activeTournament?.id]);

  useEffect(() => {
    setVisiblePlayersLimit(18);
  }, [playerSearch, playerCategoryFilter]);

  useEffect(() => {
    setVisibleFixtureLimit(24);
  }, [
    filterTournamentId,
    filterDivisionId,
    filterMatchdayId,
    filterDate,
    filterCourt,
    filterPlayerQuery,
    fixtureSortBy,
  ]);

  const activeTournamentAds = useMemo(
    () =>
      tournamentAds
        .filter((ad) => ad.tournamentId === activeTournament?.id && ad.active)
        .sort((a, b) => a.order - b.order),
    [tournamentAds, activeTournament?.id]
  );

  const principalAds = useMemo(
    () => activeTournamentAds.filter((ad) => ad.placement === 'banner_principal'),
    [activeTournamentAds]
  );

  const lateralAds = useMemo(
    () => activeTournamentAds.filter((ad) => ad.placement === 'lateral'),
    [activeTournamentAds]
  );

  const pieAds = useMemo(
    () => activeTournamentAds.filter((ad) => ad.placement === 'pie'),
    [activeTournamentAds]
  );

  const tournamentDivisions = useMemo(
    () => divisions.filter((d) => d.tournamentId === activeTournament?.id),
    [divisions, activeTournament]
  );

  const activeDivision = useMemo(
    () =>
      tournamentDivisions.find((d) => d.id === selectedDivisionId) ||
      tournamentDivisions[0] ||
      null,
    [tournamentDivisions, selectedDivisionId]
  );

  const divisionRegistrations = useMemo(
    () =>
      registrations.filter(
        (r) => r.divisionId === activeDivision?.id && r.status !== 'retirada'
      ),
    [registrations, activeDivision]
  );

  const divisionGroups = useMemo(
    () => groups.filter((g) => g.divisionId === activeDivision?.id && g.published),
    [groups, activeDivision]
  );

  const divisionMatches = useMemo(
    () =>
      dedupeMatches(
        matches.filter((m) => m.divisionId === activeDivision?.id && m.published)
      ).sort(compareMatchesByRound),
    [matches, activeDivision]
  );

  const divisionMatchdays = useMemo(
    () =>
      matchdays
        .filter((md) => md.divisionId === activeDivision?.id)
        .sort((a, b) => a.order - b.order),
    [matchdays, activeDivision]
  );

  const upcomingMatches = useMemo(
    () =>
      divisionMatches.filter(
        (m) => !m.isBye && (m.status === 'programado' || m.status === 'en_curso' || m.status === 'reprogramado')
      ),
    [divisionMatches]
  );

  const recentResults = useMemo(
    () =>
      divisionMatches.filter(
        (m) => !m.isBye && ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
      ),
    [divisionMatches]
  );

  // Fixture filtered list across tournaments/divisions
  const filteredFixtureMatches = useMemo(() => {
    const q = filterPlayerQuery.trim().toLowerCase();
    return dedupeMatches(matches.filter((m) => m.published && !m.isBye))
      .filter((m) => (filterTournamentId === 'ALL' ? true : m.tournamentId === filterTournamentId))
      .filter((m) => (filterDivisionId === 'ALL' ? true : m.divisionId === filterDivisionId))
      .filter((m) => (filterMatchdayId === 'ALL' ? true : m.matchdayId === filterMatchdayId))
      .filter((m) => (!filterDate ? true : m.scheduledDate === filterDate))
      .filter((m) => (filterCourt === 'ALL' ? true : m.courtName === filterCourt))
      .filter((m) =>
        !q
          ? true
          : m.entryAName.toLowerCase().includes(q) || m.entryBName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (fixtureSortBy === 'ronda') {
          const cmp = compareMatchesByRound(a, b);
          if (cmp !== 0) return cmp;
          return a.divisionId.localeCompare(b.divisionId);
        }
        const dA = `${a.scheduledDate || '9999-99-99'} ${a.scheduledTime || '99:99'}`;
        const dB = `${b.scheduledDate || '9999-99-99'} ${b.scheduledTime || '99:99'}`;
        const dateCmp = dA.localeCompare(dB);
        return dateCmp !== 0 ? dateCmp : compareMatchesByRound(a, b);
      });
  }, [
    matches,
    filterTournamentId,
    filterDivisionId,
    filterMatchdayId,
    filterDate,
    filterCourt,
    filterPlayerQuery,
    fixtureSortBy,
  ]);

  const allCourts = useMemo(() => {
    const set = new Set<string>();
    tournaments.forEach((t) => t.courts.forEach((c) => set.add(c.name)));
    return Array.from(set);
  }, [tournaments]);

  const knockoutRounds = useMemo(() => {
    const rawKo = divisionMatches.filter(
      (m) => m.phase === 'eliminacion' && !m.isThirdPlace && m.roundName !== 'Tercer Puesto'
    );
    const minKoOrder = rawKo.length > 0 ? Math.min(...rawKo.map((m) => m.roundOrder)) : 0;
    const ko = rawKo.filter(
      (m) => !(m.roundOrder === minKoOrder && !m.entryAId && !m.entryBId && !m.winnerEntryId)
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
  }, [divisionMatches]);

  const thirdPlaceMatch = useMemo(
    () =>
      divisionMatches.find(
        (m) => m.phase === 'eliminacion' && (m.isThirdPlace || m.roundName === 'Tercer Puesto')
      ) || null,
    [divisionMatches]
  );

  const finalMatch = useMemo(
    () => divisionMatches.find((m) => isRealFinalMatch(m, divisionMatches)) || null,
    [divisionMatches]
  );

  const liveDivisionGroups = useMemo(() => {
    if (!activeDivision) return [];
    return [...divisionGroups]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((grp) => {
        const liveStandings = computeGroupStandings(
          grp,
          divisionMatches,
          divisionRegistrations,
          activeDivision
        );
        const grpMatches = divisionMatches
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
        return {
          ...grp,
          standings: liveStandings.length > 0 ? liveStandings : grp.standings,
          matches: grpMatches,
        };
      });
  }, [activeDivision, divisionGroups, divisionMatches, divisionRegistrations]);

  const projectedFinalMatches = useMemo(() => {
    if (
      !activeDivision ||
      activeDivision.format !== 'grupos_y_final' ||
      knockoutRounds.length > 0 ||
      liveDivisionGroups.length === 0
    ) {
      return [];
    }
    const qualifiers = computeQualifiedSeededEntries(
      liveDivisionGroups,
      divisionMatches,
      divisionRegistrations,
      activeDivision
    );
    if (qualifiers.length < 2) return [];
    return generateKnockoutBracket(qualifiers, activeDivision, 10).filter(
      (m) => m.roundOrder === 10 && !m.isThirdPlace
    );
  }, [activeDivision, knockoutRounds.length, liveDivisionGroups, divisionMatches, divisionRegistrations]);

  useEffect(() => {
    setMobileBracketRoundIdx(0);
  }, [activeDivision?.id]);

  const playersById = useMemo(
    () => new Map<string, PlayerPublic>(players.map((p) => [p.id, p])),
    [players]
  );

  const getMatchSidePlayers = (playerIds: string[], entryId?: string | null): PlayerPublic[] => {
    const direct = (playerIds || [])
      .map((pid) => playersById.get(pid))
      .filter((p): p is PlayerPublic => Boolean(p));
    if (direct.length > 0) return direct;
    if (!entryId) return [];
    const reg = registrations.find((r) => r.id === entryId);
    if (!reg) return [];
    return reg.playerIds
      .map((pid) => playersById.get(pid))
      .filter((p): p is PlayerPublic => Boolean(p));
  };

  const getMatchSideSeed = (entryId?: string | null): number | null => {
    if (!entryId) return null;
    const reg =
      divisionRegistrations.find((r) => r.id === entryId) ||
      registrations.find((r) => r.id === entryId);
    return reg?.seed ?? null;
  };

  const podiumData = useMemo(() => {
    if (!activeDivision) return null;

    const resolveEntry = (entryId?: string | null, fallbackName?: string | null) => {
      if (!fallbackName && !entryId) return null;
      const reg =
        divisionRegistrations.find((r) => (entryId ? r.id === entryId : false)) ||
        registrations.find((r) => (entryId ? r.id === entryId : false)) ||
        divisionRegistrations.find((r) =>
          fallbackName ? r.displayName.toLowerCase() === fallbackName.toLowerCase() : false
        );
      const entryPlayers = (reg?.playerIds || [])
        .map((pid) => players.find((p) => p.id === pid))
        .filter((p): p is PlayerPublic => Boolean(p));
      return {
        name: fallbackName || reg?.displayName || '',
        club: reg?.club || entryPlayers[0]?.club || '',
        players: entryPlayers,
      };
    };

    const runnerUpEntryId =
      finalMatch && finalMatch.winnerEntryId
        ? finalMatch.winnerEntryId === finalMatch.entryAId
          ? finalMatch.entryBId
          : finalMatch.entryAId
        : null;

    const first = resolveEntry(activeDivision.championEntryId, activeDivision.championName);
    const second = resolveEntry(runnerUpEntryId, activeDivision.runnerUpName);
    const thirdName =
      activeDivision.thirdPlaceName ||
      (thirdPlaceMatch?.winnerName ? thirdPlaceMatch.winnerName : null);
    const thirdId =
      activeDivision.thirdPlaceEntryId ||
      (thirdPlaceMatch?.winnerEntryId ? thirdPlaceMatch.winnerEntryId : null);
    const third =
      activeDivision.hasThirdPlaceMatch || thirdName
        ? resolveEntry(thirdId, thirdName)
        : null;

    if (!first && !second && !third) return null;

    const finalScore =
      finalMatch && finalMatch.winnerEntryId
        ? formatScoreString(finalMatch.sets, finalMatch.status)
        : null;
    const thirdScore =
      thirdPlaceMatch && thirdPlaceMatch.winnerEntryId
        ? formatScoreString(thirdPlaceMatch.sets, thirdPlaceMatch.status)
        : null;

    return {
      first,
      second,
      third,
      finalScore,
      thirdScore,
      hasThirdPlaceSlot: Boolean(activeDivision.hasThirdPlaceMatch || third || thirdPlaceMatch),
    };
  }, [activeDivision, divisionRegistrations, registrations, players, finalMatch, thirdPlaceMatch]);

  const tournamentPlayers = useMemo(() => {
    const map = new Map<string, PlayerPublic>();
    players
      .filter((p) => p.tournamentId === activeTournament?.id)
      .forEach((p) => map.set(p.id, p));
    paginatedPlayersQuery.data?.pages.forEach((page) => {
      page.items
        .filter((p) => p.tournamentId === activeTournament?.id)
        .forEach((p) => map.set(p.id, p));
    });
    return Array.from(map.values());
  }, [players, paginatedPlayersQuery.data, activeTournament?.id]);

  const playerDivisionEnrollmentMap = useMemo(() => {
    const divMap = new Map(tournamentDivisions.map((d) => [d.id, d]));
    const map = new Map<string, { categories: Set<string>; divisionNames: string[] }>();
    registrations.forEach((r) => {
      if (r.tournamentId !== activeTournament?.id || r.status === 'retirada') return;
      const div = divMap.get(r.divisionId);
      if (!div) return;
      r.playerIds.forEach((pid) => {
        const entry = map.get(pid) || { categories: new Set<string>(), divisionNames: [] };
        if (div.category?.trim()) {
          entry.categories.add(div.category.trim().toLowerCase());
        }
        if (!entry.divisionNames.includes(div.name)) {
          entry.divisionNames.push(div.name);
        }
        map.set(pid, entry);
      });
    });
    return map;
  }, [registrations, activeTournament?.id, tournamentDivisions]);

  const playerCategoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    tournamentDivisions.forEach((d) => {
      const c = d.category?.trim();
      if (c && !seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        list.push(c);
      }
    });
    tournamentPlayers.forEach((p) => {
      const c = p.habitualCategory?.trim();
      if (c && !seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        list.push(c);
      }
    });
    return list;
  }, [tournamentDivisions, tournamentPlayers]);

  const playerMatchesCategory = (p: PlayerPublic, cat: string) => {
    const norm = cat.trim().toLowerCase();
    if (p.habitualCategory.trim().toLowerCase() === norm) return true;
    const enrolled = playerDivisionEnrollmentMap.get(p.id);
    return Boolean(enrolled && enrolled.categories.has(norm));
  };

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return tournamentPlayers
      .filter((p) => {
        if (playerCategoryFilter !== 'ALL' && !playerMatchesCategory(p, playerCategoryFilter)) {
          return false;
        }
        if (!q) return true;
        const enrolledDivs = playerDivisionEnrollmentMap.get(p.id)?.divisionNames || [];
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.habitualCategory.toLowerCase().includes(q) ||
          enrolledDivs.some((dn) => dn.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.stats.wins - a.stats.wins || a.fullName.localeCompare(b.fullName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentPlayers, playerSearch, playerCategoryFilter, playerDivisionEnrollmentMap]);

  const paginatedPlayers = useMemo(
    () => filteredPlayers.slice(0, visiblePlayersLimit),
    [filteredPlayers, visiblePlayersLimit]
  );

  const hasMorePlayersToShow =
    visiblePlayersLimit < filteredPlayers.length || Boolean(paginatedPlayersQuery.hasNextPage);

  // Infinite scroll automático vía IntersectionObserver para Jugadores y Galería de Fotos
  useEffect(() => {
    if (activeTab !== 'jugadores' || !hasMorePlayersToShow) return undefined;
    const el = playersSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisiblePlayersLimit((prev) => prev + 18);
        if (paginatedPlayersQuery.hasNextPage && !paginatedPlayersQuery.isFetchingNextPage) {
          void paginatedPlayersQuery.fetchNextPage();
        }
      },
      { rootMargin: '220px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    activeTab,
    hasMorePlayersToShow,
    paginatedPlayersQuery.hasNextPage,
    paginatedPlayersQuery.isFetchingNextPage,
    paginatedPlayersQuery.fetchNextPage,
  ]);

  useEffect(() => {
    if (activeTab !== 'jornadas' || !paginatedPhotosQuery.hasNextPage) return undefined;
    const el = photosSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!paginatedPhotosQuery.isFetchingNextPage) {
          void paginatedPhotosQuery.fetchNextPage();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    activeTab,
    paginatedPhotosQuery.hasNextPage,
    paginatedPhotosQuery.isFetchingNextPage,
    paginatedPhotosQuery.fetchNextPage,
  ]);

  const paginatedFixtureMatches = useMemo(
    () => filteredFixtureMatches.slice(0, visibleFixtureLimit),
    [filteredFixtureMatches, visibleFixtureLimit]
  );

  const activeFixtureFiltersCount = useMemo(() => {
    let count = 0;
    if (filterTournamentId !== 'ALL') count++;
    if (filterDivisionId !== 'ALL') count++;
    if (filterMatchdayId !== 'ALL') count++;
    if (filterDate) count++;
    if (filterCourt !== 'ALL') count++;
    if (filterPlayerQuery.trim()) count++;
    return count;
  }, [
    filterTournamentId,
    filterDivisionId,
    filterMatchdayId,
    filterDate,
    filterCourt,
    filterPlayerQuery,
  ]);

  useEffect(() => {
    setMobileBracketRoundIdx(0);
  }, [activeDivision?.id]);

  const openLightbox = (list: MatchdayPhoto[], idx: number) => {
    setLightboxPhotos(list);
    setLightboxIndex(idx);
  };

  if (isFootballTournament(activeTournament)) {
    return (
      <Suspense fallback={<div className="max-w-7xl mx-auto px-3 sm:px-6 py-8"><AdminSectionSkeleton /></div>}>
        <FootballPublicPortal
          tournaments={tournaments}
          divisions={divisions}
          players={players}
          registrations={registrations}
          groups={groups}
          matchdays={matchdays}
          matches={matches}
          photos={photos}
          notifications={notifications}
          tournamentAds={tournamentAds}
          tournamentTrophies={tournamentTrophies}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onGoLanding={onGoLanding}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={onSelectTournament}
          selectedDivisionId={selectedDivisionId}
          onSelectDivision={onSelectDivision}
          defaultTournamentCoverUrl={defaultTournamentCoverUrl}
          logoUrl={logoUrl}
        />
      </Suspense>
    );
  }

  return (
    <div className="pb-24 md:pb-12">
      {/* Hero Split + Selector de Torneo y División */}
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  {onGoLanding && (
                    <button
                      type="button"
                      onClick={onGoLanding}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Cambiar torneo
                    </button>
                  )}
                  <p className="text-xs font-medium text-[#7C1FA2] tracking-wide">
                    PlayPy Circuito Oficial · Hora America/Asuncion
                  </p>
                </div>
                <h1 className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#0A1633] leading-[1.12] [text-wrap:balance]">
                  {activeTournament ? activeTournament.name : 'Torneos en Vivo'}
                </h1>
                {activeTournament && (
                  <p className="mt-2 sm:mt-3 text-xs sm:text-base text-[#475569] max-w-2xl">
                    {activeTournament.venue}, {activeTournament.city} · Organiza{' '}
                    {activeTournament.organizerName} · {activeTournament.courts.length} canchas
                    habilitadas · {activeTournament.itfEdition}
                  </p>
                )}
              </div>

              {/* Selectores reales de Torneo y División */}
              <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-[#E2E8F0] space-y-3.5 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="public-tournament-select" className="block text-xs font-medium text-[#475569] mb-1.5">
                      Torneo activo
                    </label>
                    <select
                      id="public-tournament-select"
                      value={activeTournament?.id || ''}
                      onChange={(e) => onSelectTournament(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium text-[#0A1633] focus:outline-none focus:ring-2 focus:ring-[#7C1FA2]"
                    >
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="public-division-select" className="block text-xs font-medium text-[#475569] mb-1.5">
                      División (Categoría · Modalidad · Rama)
                    </label>
                    <select
                      id="public-division-select"
                      value={activeDivision?.id || ''}
                      onChange={(e) => onSelectDivision(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium text-[#0A1633] focus:outline-none focus:ring-2 focus:ring-[#7C1FA2]"
                    >
                      {tournamentDivisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Acciones rápidas */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    onClick={onRequestPush}
                    className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] sm:min-h-[40px] whitespace-nowrap shrink-0 ${
                      pushEnabled
                        ? 'bg-emerald-50 text-[#7C1FA2] border border-emerald-200'
                        : 'bg-[#7C1FA2] text-white hover:bg-[#6B1A8B]'
                    }`}
                  >
                    {pushEnabled ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    {pushEnabled ? 'Alertas activas' : 'Activar alertas'}
                  </button>

                  <button
                    onClick={onOpenItfModal}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-4 h-4 text-[#7C1FA2]" />
                    Reglas ITF
                  </button>

                  {activeTournament && (
                    <>
                      <button
                        type="button"
                        onClick={() => setQrModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-[40px] whitespace-nowrap shrink-0"
                      >
                        <QrCode className="w-4 h-4 text-[#7C1FA2]" />
                        Link y QR
                      </button>

                      <button
                        type="button"
                        onClick={() => setFlyerModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-[40px] whitespace-nowrap shrink-0"
                      >
                        <FileImage className="w-4 h-4 text-[#0284C7]" />
                        Flyer de cruces
                      </button>

                      <WhatsAppShareButton
                        message={buildTournamentWhatsAppMessage({
                          tournament: activeTournament,
                          division: activeDivision,
                          appUrl: buildTournamentDirectUrl(activeTournament.id, {
                            divisionId: activeDivision?.id,
                            tab: activeTab,
                          }),
                        })}
                        label="Compartir torneo"
                        className="min-h-[40px]"
                      />
                    </>
                  )}

                  <PWAInstallButton />
                </div>
              </div>
            </div>

            {/* Visual hero 16:9 */}
            <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-[#E2E8F0] min-h-[190px] sm:min-h-[240px] bg-[#7C1FA2]">
              {!heroImgFailed ? (
                <OptimizedImage
                  src={heroCoverUrl}
                  alt={
                    activeTournament
                      ? `Portada de ${activeTournament.name}`
                      : 'Cancha principal de torneo PlayPy'
                  }
                  width={960}
                  height={540}
                  transformWidth={960}
                  priority
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-white/90 bg-gradient-to-br from-[#7C1FA2] to-[#0A1633]">
                  <Trophy className="w-10 h-10 mb-2" />
                  <p className="text-sm font-medium">{activeTournament?.venue}</p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-4 sm:p-5 text-white">
                <p className="text-xs text-white/80">
                  {activeDivision?.name} · {activeDivision?.format === 'grupos_y_final' ? 'Grupos y fase final' : activeDivision?.format === 'todos_contra_todos' ? 'Todos contra todos' : 'Eliminación directa'}
                </p>
                <p className="text-sm sm:text-base font-semibold mt-0.5">
                  {activeTournament?.startDate} al {activeTournament?.endDate}
                </p>
              </div>
            </div>
          </div>

          {/* 4-column summary strip below hero split */}
          {activeDivision && (
            <div className="mt-6 sm:mt-8 grid grid-cols-2 lg:grid-cols-4 border border-[#E2E8F0] rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] bg-[#F8FAFC]">
              <div className="p-3.5 sm:p-4">
                <p className="text-[11px] sm:text-xs text-[#475569]">Inscriptos en división</p>
                <p className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                  {divisionRegistrations.length} / {activeDivision.maxEntries}
                </p>
              </div>
              <div className="p-3.5 sm:p-4">
                <p className="text-[11px] sm:text-xs text-[#475569]">Partidos programados</p>
                <p className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                  {upcomingMatches.length}
                </p>
              </div>
              <div className="p-3.5 sm:p-4">
                <p className="text-[11px] sm:text-xs text-[#475569]">Resultados confirmados</p>
                <p className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                  {recentResults.length}
                </p>
              </div>
              <div className="p-3.5 sm:p-4">
                <p className="text-[11px] sm:text-xs text-[#475569]">Formato ITF</p>
                <p className="mt-1 text-xs sm:text-sm font-semibold text-[#0A1633] truncate">
                  {activeDivision.itfConfig.setsToWin === 2 ? 'Mejor de 3 sets' : activeDivision.itfConfig.setsToWin === 1 ? 'Set único' : 'Mejor de 5 sets'}
                  {activeDivision.itfConfig.setTiebreakPoints === 10 ? ' · TB a 10' : ''}
                  {activeDivision.itfConfig.directTiebreakMatch ? ' · TB directo 10' : ''}
                  {activeDivision.itfConfig.matchTiebreakThirdSet ? ' · MTB 10' : ''}
                  {activeDivision.itfConfig.decisivePointNoAd ? ' · Sin ventaja' : ''}
                  {activeDivision.itfConfig.optionalSetScores ? ' · Sets opcionales' : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 mt-5 sm:mt-6">
        {/* Segmented Sub-navigation (Desktop md+; en móvil se usa MobileBottomNav) */}
        <div className="hidden md:flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto max-w-full">
            {(
              [
                { id: 'resumen', label: 'Torneos y Cuadro' },
                { id: 'fixture', label: 'Fixture' },
                { id: 'jornadas', label: 'Jornadas y Fotos' },
                { id: 'jugadores', label: 'Jugadores' },
              ] as Array<{ id: PublicTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                  activeTab === tab.id
                    ? 'bg-[#7C1FA2] text-white'
                    : 'text-[#475569] hover:text-[#0A1633]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeDivision && (
            <p className="text-xs text-[#475569]">
              {activeDivision.category} · {activeDivision.modality} · {activeDivision.gender}
            </p>
          )}
        </div>

        {/* Encabezado compacto en móvil para identificar sección y división */}
        {activeDivision && (
          <div className="md:hidden flex items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
            <p className="text-xs font-semibold text-[#0A1633] truncate">
              {activeTab === 'resumen' && 'Torneos y Cuadro'}
              {activeTab === 'fixture' && 'Fixture'}
              {activeTab === 'jornadas' && 'Jornadas y Fotos'}
              {activeTab === 'jugadores' && 'Jugadores'}
            </p>
            <p className="text-[11px] text-[#475569] shrink-0">
              {activeDivision.category} · {activeDivision.modality}
            </p>
          </div>
        )}

        {/* TAB 1: TORNEOS, PODIO, PRÓXIMOS Y CUADRO FINAL */}
        {activeTab === 'resumen' && activeDivision && (
          <div className="mt-5 sm:mt-6 space-y-6 sm:space-y-8">
            {/* Resumen rápido de Campeones arriba (el detalle de medallas vive en #division-cuadro) */}
            {podiumData && (
              <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:px-5 sm:py-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    {podiumData.first && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FDE68A] to-[#F59E0B] text-[#78350F] flex items-center justify-center shrink-0">
                          <Trophy className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#92400E]">
                            1° Oro · Campeón
                          </p>
                          <p className="text-sm font-bold text-[#0A1633] truncate">
                            {podiumData.first.name}
                          </p>
                        </div>
                      </div>
                    )}

                    {podiumData.second && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E2E8F0] to-[#94A3B8] text-[#1E293B] flex items-center justify-center shrink-0">
                          <Medal className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#475569]">
                            2° Plata · Vicecampeón
                          </p>
                          <p className="text-sm font-semibold text-[#0A1633] truncate">
                            {podiumData.second.name}
                          </p>
                        </div>
                      </div>
                    )}

                    {podiumData.third && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FDBA74] to-[#C2410C] text-white flex items-center justify-center shrink-0">
                          <Award className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9A3412]">
                            3° Bronce · Tercer Puesto
                          </p>
                          <p className="text-sm font-semibold text-[#0A1633] truncate">
                            {podiumData.third.name}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {(knockoutRounds.length > 0 || thirdPlaceMatch) && (
                    <a
                      href="#division-cuadro"
                      className="px-3.5 min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#0A1633] hover:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      Ver medallero y cuadro final
                    </a>
                  )}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Próximos Partidos */}
              <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[#0A1633]">Próximos partidos</h2>
                    <p className="text-xs text-[#475569]">
                      Horarios locales Paraguay (America/Asuncion)
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectTab('fixture')}
                    className="text-xs font-medium text-[#7C1FA2] hover:underline whitespace-nowrap"
                  >
                    Ver fixture completo
                  </button>
                </div>

                {upcomingMatches.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#475569]">
                    No hay partidos pendientes programados en esta división.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E8F0]">
                    {upcomingMatches.slice(0, 6).map((m) => (
                      <div
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedH2HMatch(m)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedH2HMatch(m);
                          }
                        }}
                        className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors focus-visible:outline-2 focus-visible:outline-[#7C1FA2]"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-[#475569]">
                            {m.roundName} · {m.courtName || 'Cancha por definir'}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#0A1633]">
                            {m.entryAName} <span className="text-[#475569] font-normal">vs</span> {m.entryBName}
                          </p>
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7C1FA2]">
                            <ArrowLeftRight className="w-3 h-3" />
                            Ver Cara a Cara
                          </p>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                          <div className="text-left sm:text-right">
                            <p className="text-xs font-mono tabular-nums font-medium text-[#0A1633]">
                              {m.scheduledDate
                                ? `${formatAsuncionDate(m.scheduledDate)}${m.scheduledTime ? ` · ${m.scheduledTime} hs` : ''}`
                                : 'Fecha por definir'}
                            </p>
                            <p className={`text-xs mt-0.5 ${MATCH_STATUS_LABEL[m.status]?.tone || 'text-[#475569]'}`}>
                              {MATCH_STATUS_LABEL[m.status]?.label || m.status}
                            </p>
                          </div>
                          <WhatsAppShareButton
                            compact
                            label="WhatsApp"
                            message={buildMatchWhatsAppMessage({
                              match: m,
                              tournament: activeTournament,
                              division: activeDivision,
                            })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Últimos Resultados & Alertas en Vivo */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E2E8F0]">
                    <h2 className="text-base font-semibold text-[#0A1633]">Resultados recientes</h2>
                  </div>
                  {recentResults.length === 0 ? (
                    <div className="p-6 text-center text-sm text-[#475569]">
                      Aún no se registraron marcadores en esta división.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#E2E8F0]">
                      {recentResults.slice(0, 5).map((m) => (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedH2HMatch(m)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedH2HMatch(m);
                            }
                          }}
                          className="p-4 space-y-2 cursor-pointer hover:bg-[#F8FAFC] transition-colors focus-visible:outline-2 focus-visible:outline-[#7C1FA2]"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-[#475569]">
                            <span>{m.roundName}</span>
                            <span className={MATCH_STATUS_LABEL[m.status]?.tone}>
                              {MATCH_STATUS_LABEL[m.status]?.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm min-w-0">
                              <p className={`truncate ${m.winnerEntryId === m.entryAId ? 'font-semibold text-[#0A1633]' : 'text-[#475569]'}`}>
                                {m.entryAName}
                              </p>
                              <p className={`truncate ${m.winnerEntryId === m.entryBId ? 'font-semibold text-[#0A1633]' : 'text-[#475569]'}`}>
                                {m.entryBName}
                              </p>
                            </div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#7C1FA2] text-right shrink-0">
                              {formatScoreString(m.sets, m.status)}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7C1FA2] truncate">
                              <ArrowLeftRight className="w-3 h-3 shrink-0" />
                              Cara a Cara
                              {m.winnerName ? ` · Ganó ${m.winnerName}` : ''}
                            </span>
                            <WhatsAppShareButton
                              compact
                              label="Compartir"
                              message={buildMatchWhatsAppMessage({
                                match: m,
                                tournament: activeTournament,
                                division: activeDivision,
                              })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Últimas alertas push */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#0A1633]">Avisos en tiempo real</h2>
                    <span className="text-xs text-[#475569]">{notifications.length}</span>
                  </div>
                  <div className="divide-y divide-[#E2E8F0]">
                    {notifications.slice(0, 4).map((n) => (
                      <div key={n.id} className="p-4">
                        <p className="text-xs font-semibold text-[#0A1633]">{n.title}</p>
                        <p className="text-xs text-[#475569] mt-1">{n.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Grupos y Cruces de Zona (sin etiqueta Posiciones) */}
            {divisionGroups.length > 0 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-[#0A1633]">
                    Grupos y cruces de zona · {activeDivision.name}
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Criterios de desempate:{' '}
                    {activeDivision.drawConfig.tiebreakers
                      .map((c, idx) => `${idx + 1}. ${TIEBREAKER_LABELS[c] || c}`)
                      .join(' · ')}
                  </p>
                </div>

                {liveDivisionGroups.map((grp) => (
                  <div key={grp.id} className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                    <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#0A1633]">{grp.name}</h3>
                      <span className="text-xs text-[#475569]">
                        {activeDivision.format === 'todos_contra_todos'
                          ? 'Todos contra todos'
                          : `Clasifican primeros ${activeDivision.drawConfig.qualifiersPerGroup}`}
                      </span>
                    </div>

                    {/* Vista móvil en tarjetas (< md) */}
                    <div className="md:hidden divide-y divide-[#E2E8F0]">
                      {grp.standings.map((row, idx) => (
                        <div key={row.entryId} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 text-center font-mono tabular-nums text-xs font-semibold text-[#475569] shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-[#0A1633] truncate">
                                  {row.displayName}
                                </span>
                                {row.seed && (
                                  <span className="text-[11px] text-[#475569]">[{row.seed}]</span>
                                )}
                                {row.qualified && (
                                  <span className="text-[11px] font-semibold text-[#15803D]">
                                    · Clasifica
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#475569] font-mono tabular-nums mt-0.5">
                                {row.played} PJ · {row.won}G-{row.lost}P · Sets {row.setsWon}/{row.setsLost} · DG{' '}
                                {row.gamesDiff >= 0 ? `+${row.gamesDiff}` : row.gamesDiff}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold font-mono tabular-nums text-[#7C1FA2]">
                              {row.points}
                            </p>
                            <p className="text-[10px] text-[#475569]">PTS</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Vista escritorio en tabla (md+) */}
                    <div className="hidden md:block overflow-x-auto clean-scroll">
                      <table className="w-full text-left border-collapse min-w-[680px]">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#475569]">
                            <th className="py-2.5 px-4 w-10">#</th>
                            <th className="py-2.5 px-4">Participante</th>
                            <th className="py-2.5 px-3 text-right">PJ</th>
                            <th className="py-2.5 px-3 text-right">PG</th>
                            <th className="py-2.5 px-3 text-right">PP</th>
                            <th className="py-2.5 px-3 text-right">SF / SC</th>
                            <th className="py-2.5 px-3 text-right">GF / GC</th>
                            <th className="py-2.5 px-3 text-right">DG</th>
                            <th className="py-2.5 px-4 text-right">PTS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] text-sm">
                          {grp.standings.map((row, idx) => (
                            <tr key={row.entryId} className="hover:bg-[#F8FAFC]">
                              <td className="py-3 px-4 font-mono tabular-nums text-xs text-[#475569]">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[#0A1633]">{row.displayName}</span>
                                  {row.seed && (
                                    <span className="text-xs text-[#475569]">[{row.seed}]</span>
                                  )}
                                  {row.qualified && (
                                    <span className="text-xs font-medium text-[#15803D]">
                                      · Clasifica
                                    </span>
                                  )}
                                </div>
                                {row.club && <p className="text-xs text-[#475569]">{row.club}</p>}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">{row.played}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-[#15803D]">{row.won}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-[#475569]">{row.lost}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-xs">
                                {row.setsWon}/{row.setsLost}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-xs">
                                {row.gamesWon}/{row.gamesLost}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-xs">
                                {row.gamesDiff >= 0 ? `+${row.gamesDiff}` : row.gamesDiff}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#0A1633]">
                                {row.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Cruces del grupo y resultados reflejados */}
                    {grp.matches.length > 0 && (
                      <div className="p-4 sm:px-5 border-t border-[#E2E8F0] bg-[#FAFBF9] space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#475569]">
                            Cruces y resultados · {grp.name} ({grp.matches.length})
                          </h4>
                          <span className="text-[11px] text-[#475569]">
                            Tocá un partido para ver Cara a Cara
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {grp.matches.map((m) => {
                            const hasResult = Boolean(
                              m.winnerEntryId ||
                                m.sets.length > 0 ||
                                ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status)
                            );
                            const winA = Boolean(m.winnerEntryId && m.winnerEntryId === m.entryAId);
                            const winB = Boolean(m.winnerEntryId && m.winnerEntryId === m.entryBId);
                            return (
                              <div
                                key={m.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedH2HMatch(m)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedH2HMatch(m);
                                  }
                                }}
                                className={`p-3 rounded-xl border bg-white cursor-pointer transition-colors hover:border-[#7C1FA2]/70 ${
                                  hasResult ? 'border-emerald-200/90' : 'border-[#E2E8F0]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] text-[#475569]">
                                  <span className="truncate font-medium">
                                    {m.roundName}
                                    {m.scheduledDate ? ` · ${formatAsuncionDate(m.scheduledDate)}` : ''}
                                    {m.scheduledTime ? ` ${m.scheduledTime} hs` : ''}
                                  </span>
                                  <span className={MATCH_STATUS_LABEL[m.status]?.tone || 'text-[#475569]'}>
                                    {MATCH_STATUS_LABEL[m.status]?.label || m.status}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <div className="min-w-0 space-y-0.5 text-xs">
                                    <p className={`flex items-center gap-1.5 truncate ${winA ? 'font-bold text-[#0A1633]' : 'text-[#475569]'}`}>
                                      <span className="truncate">{m.entryAName}</span>
                                      {winA && <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />}
                                    </p>
                                    <p className={`flex items-center gap-1.5 truncate ${winB ? 'font-bold text-[#0A1633]' : 'text-[#475569]'}`}>
                                      <span className="truncate">{m.entryBName}</span>
                                      {winB && <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {hasResult ? (
                                      <span className="font-mono tabular-nums text-xs font-bold text-[#7C1FA2] bg-purple-50 px-2 py-1 rounded-lg">
                                        {formatScoreString(m.sets, m.status)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-[#475569]">Por jugar</span>
                                    )}
                                    <WhatsAppShareButton
                                      compact
                                      label="WA"
                                      message={buildMatchWhatsAppMessage({
                                        match: m,
                                        tournament: activeTournament,
                                        division: activeDivision,
                                      })}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="px-4 sm:px-5 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs text-[#475569]">
                      {activeDivision.drawConfig.woHandlingNote}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Cuadro Final: Podio de Medallas + Bracket Eliminatorio + Final y 3er Puesto */}
            <section
              id="division-cuadro"
              className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C1FA2]">
                    Fase Eliminatoria · {activeDivision.name}
                  </p>
                  <h2 className="text-lg sm:text-xl font-bold text-[#0A1633] mt-0.5">
                    Cuadro final y medallero
                  </h2>
                </div>
                <p className="text-xs text-[#475569]">
                  Avance automático al confirmar marcadores
                  {activeDivision.hasThirdPlaceMatch ? ' · Incluye definición por el 3er puesto' : ''}
                </p>
              </div>

              {/* Podio de Medallas (Oro, Plata, Bronce) integrado al Cuadro Final */}
              {podiumData && (
                <div className="p-4 sm:p-6 border-b border-[#E2E8F0] bg-gradient-to-b from-[#FAFBF9] to-white">
                  <div
                    className={`grid grid-cols-1 gap-4 items-end ${
                      podiumData.hasThirdPlaceSlot
                        ? 'lg:grid-cols-3'
                        : 'lg:grid-cols-2 max-w-4xl mx-auto'
                    }`}
                  >
                    {/* 2° Plata: Vicecampeón */}
                    {podiumData.second && (
                      <div
                        className={`rounded-2xl border border-[#94A3B8]/60 bg-gradient-to-br from-[#F8FAFC] via-[#E2E8F0]/45 to-white p-5 flex flex-col justify-between ${
                          podiumData.hasThirdPlaceSlot ? 'order-2 lg:order-1 lg:min-h-[192px]' : 'order-2 lg:min-h-[188px]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#CBD5E1]/70">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E2E8F0] to-[#94A3B8] text-[#1E293B] flex items-center justify-center shrink-0">
                                <Medal className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#334155]">
                                  Plata · 2° Puesto
                                </p>
                                <p className="text-[11px] text-[#475569]">Vicecampeón</p>
                              </div>
                            </div>
                            <span className="font-mono tabular-nums text-xs font-bold text-[#475569]">
                              02
                            </span>
                          </div>

                          <div className="mt-4 flex items-center gap-3.5">
                            <EntryAvatars
                              entryPlayers={podiumData.second.players}
                              fallbackName={podiumData.second.name}
                              sizeClass="w-12 h-12 text-sm"
                              toneClass="bg-[#334155] text-[#F1F5F9] ring-2 ring-[#94A3B8]/60"
                            />
                            <div className="min-w-0">
                              <h3 className="text-base font-bold text-[#0A1633] leading-snug">
                                {podiumData.second.name}
                              </h3>
                              {podiumData.second.club && (
                                <p className="text-xs text-[#475550] truncate mt-0.5">
                                  {podiumData.second.club}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#CBD5E1]/60 flex items-center justify-between text-xs">
                          <span className="text-[#475569] font-medium">Finalista oficial</span>
                          <span className="font-mono tabular-nums text-[#334155] font-semibold">
                            2° lugar
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 1° Oro: Campeón */}
                    {podiumData.first && (
                      <div
                        className={`rounded-2xl border border-[#F59E0B]/65 bg-gradient-to-br from-[#FFFBEB] via-[#FEF3C7]/45 to-white p-5 sm:p-6 shadow-[0_12px_32px_-16px_rgba(180,83,9,0.32)] flex flex-col justify-between ${
                          podiumData.hasThirdPlaceSlot
                            ? 'order-1 lg:order-2 lg:min-h-[220px]'
                            : 'order-1 lg:min-h-[208px]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F59E0B]/35">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FDE68A] to-[#F59E0B] text-[#78350F] flex items-center justify-center shrink-0">
                                <Trophy className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#92400E]">
                                  Oro · 1° Puesto
                                </p>
                                <p className="text-[11px] font-medium text-[#B45309]">
                                  Campeón de la división
                                </p>
                              </div>
                            </div>
                            <span className="font-mono tabular-nums text-xs font-bold text-[#92400E]">
                              01
                            </span>
                          </div>

                          <div className="mt-5 flex items-center gap-4">
                            <EntryAvatars
                              entryPlayers={podiumData.first.players}
                              fallbackName={podiumData.first.name}
                              sizeClass="w-14 h-14 text-base"
                              toneClass="bg-[#92400E] text-[#FEF3C7] ring-2 ring-[#F59E0B]/70"
                            />
                            <div className="min-w-0">
                              <h3 className="text-xl font-bold text-[#0A1633] leading-tight">
                                {podiumData.first.name}
                              </h3>
                              {podiumData.first.club && (
                                <p className="text-xs font-medium text-[#475569] mt-1">
                                  {podiumData.first.club}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-[#F59E0B]/30 flex items-center justify-between text-xs">
                          <span className="font-medium text-[#92400E]">
                            {podiumData.finalScore ? 'Marcador de la Final' : 'Título Oficial'}
                          </span>
                          {podiumData.finalScore && (
                            <span className="font-mono tabular-nums font-bold text-[#92400E]">
                              {podiumData.finalScore}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3° Bronce: Tercer Puesto */}
                    {podiumData.hasThirdPlaceSlot && (
                      <div className="order-3 rounded-2xl border border-[#EA580C]/45 bg-gradient-to-br from-[#FFF7ED] via-[#FFEDD5]/45 to-white p-5 flex flex-col justify-between lg:min-h-[192px]">
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EA580C]/25">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FDBA74] to-[#C2410C] text-white flex items-center justify-center shrink-0">
                                <Award className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A3412]">
                                  Bronce · 3° Puesto
                                </p>
                                <p className="text-[11px] text-[#C2410C]">Tercer lugar</p>
                              </div>
                            </div>
                            <span className="font-mono tabular-nums text-xs font-bold text-[#9A3412]">
                              03
                            </span>
                          </div>

                          {podiumData.third ? (
                            <div className="mt-4 flex items-center gap-3.5">
                              <EntryAvatars
                                entryPlayers={podiumData.third.players}
                                fallbackName={podiumData.third.name}
                                sizeClass="w-12 h-12 text-sm"
                                toneClass="bg-[#9A3412] text-[#FFEDD5] ring-2 ring-[#EA580C]/55"
                              />
                              <div className="min-w-0">
                                <h3 className="text-base font-bold text-[#0A1633] leading-snug">
                                  {podiumData.third.name}
                                </h3>
                                {podiumData.third.club && (
                                  <p className="text-xs text-[#475569] truncate mt-0.5">
                                    {podiumData.third.club}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 py-1.5">
                              <p className="text-sm font-semibold text-[#0A1633]">
                                Por definir en cancha
                              </p>
                              <p className="text-xs text-[#475569] mt-0.5">
                                {thirdPlaceMatch
                                  ? `${thirdPlaceMatch.entryAName} vs ${thirdPlaceMatch.entryBName}`
                                  : 'Partido por el 3er puesto habilitado'}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#EA580C]/20 flex items-center justify-between text-xs">
                          <span className="text-[#9A3412] font-medium">
                            {podiumData.thirdScore ? 'Marcador 3er Puesto' : 'Definición por podio'}
                          </span>
                          {podiumData.thirdScore && (
                            <span className="font-mono tabular-nums font-bold text-[#9A3412]">
                              {podiumData.thirdScore}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-6">
                {knockoutRounds.length === 0 && !thirdPlaceMatch ? (
                  projectedFinalMatches.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#7C1FA2]">
                          Proyección en vivo de cruces de Fase Final según la tabla actual de grupos
                        </p>
                        <span className="text-[11px] text-[#475569]">
                          Se confirmará oficialmente al cierre de la fase de grupos
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {projectedFinalMatches.map((pm) => (
                          <div
                            key={pm.id}
                            className={`rounded-xl border border-dashed p-3.5 space-y-2 ${
                              pm.isBye
                                ? 'border-emerald-300 bg-emerald-50/40'
                                : 'border-[#7C1FA2]/45 bg-[#FAFBF9]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-[#7C1FA2]">{pm.roundName}</span>
                              <span className="text-[#475569]">
                                {pm.isBye ? 'Pase libre' : 'Proyectado'}
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div className="px-2.5 py-2 rounded-lg bg-white border border-[#E2E8F0] font-semibold text-[#0A1633] truncate">
                                {pm.entryAName}
                              </div>
                              <div className="px-2.5 py-2 rounded-lg bg-white border border-[#E2E8F0] font-semibold text-[#0A1633] truncate">
                                {pm.entryBName}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-sm text-[#475569]">
                      Los cruces de fase final se publicarán al completar el sorteo o la etapa de grupos.
                    </div>
                  )
                ) : (
                  <div>
                    {/* Vista móvil (< md): Selector de ronda con distinción Oro / Bronce */}
                    <div className="md:hidden space-y-4">
                      <div className="flex items-center gap-2 overflow-x-auto clean-scroll pb-1">
                        {knockoutRounds.map((round, rIdx) => {
                          const isFinalRound =
                            Boolean(finalMatch && round.matches.some((m) => m.id === finalMatch.id)) ||
                            round.roundName.toLowerCase() === 'final';
                          const isActive = mobileBracketRoundIdx === rIdx;
                          return (
                            <button
                              key={round.roundName}
                              onClick={() => setMobileBracketRoundIdx(rIdx)}
                              className={`px-3.5 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border inline-flex items-center gap-1.5 transition-colors ${
                                isFinalRound
                                  ? isActive
                                    ? 'bg-[#92400E] text-[#FEF3C7] border-[#92400E]'
                                    : 'bg-[#FFFBEB] text-[#92400E] border-[#F59E0B]/55'
                                  : isActive
                                  ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                                  : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]'
                              }`}
                            >
                              {isFinalRound && <Trophy className="w-3.5 h-3.5" />}
                              {round.roundName}
                            </button>
                          );
                        })}
                        {thirdPlaceMatch && (
                          <button
                            onClick={() => setMobileBracketRoundIdx(knockoutRounds.length)}
                            className={`px-3.5 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border inline-flex items-center gap-1.5 transition-colors ${
                              mobileBracketRoundIdx === knockoutRounds.length ||
                              knockoutRounds.length === 0
                                ? 'bg-[#9A3412] text-[#FFEDD5] border-[#9A3412]'
                                : 'bg-[#FFF7ED] text-[#9A3412] border-[#EA580C]/45'
                            }`}
                          >
                            <Award className="w-3.5 h-3.5" />
                            3er Puesto
                          </button>
                        )}
                      </div>

                      {knockoutRounds.length > 0 && mobileBracketRoundIdx < knockoutRounds.length ? (
                        <div className="space-y-3">
                          {knockoutRounds[mobileBracketRoundIdx]?.matches.map((m) => {
                            const isFinalCard =
                              m.id === finalMatch?.id || isRealFinalMatch(m, divisionMatches);
                            return (
                              <BracketMatchCard
                                key={m.id}
                                match={m}
                                variant={isFinalCard ? 'final' : 'standard'}
                                tournamentName={activeTournament?.name}
                                divisionName={activeDivision?.name}
                                getSidePlayers={getMatchSidePlayers}
                                getSideSeed={getMatchSideSeed}
                                onSelectMatch={setSelectedH2HMatch}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        thirdPlaceMatch && (
                          <BracketMatchCard
                            match={thirdPlaceMatch}
                            variant="third_place"
                            tournamentName={activeTournament?.name}
                            divisionName={activeDivision?.name}
                            getSidePlayers={getMatchSidePlayers}
                            getSideSeed={getMatchSideSeed}
                            onSelectMatch={setSelectedH2HMatch}
                          />
                        )
                      )}
                    </div>

                    {/* Vista escritorio (md+): Bracket proporcional con conectores y Escenario de Finales */}
                    <div className="hidden md:block">
                      {(() => {
                        const lastRound = knockoutRounds[knockoutRounds.length - 1];
                        const lastIsFinalStage = Boolean(
                          lastRound &&
                            (lastRound.matches.some(
                              (m) => m.id === finalMatch?.id || isRealFinalMatch(m, divisionMatches)
                            ) ||
                              lastRound.roundName.trim().toLowerCase() === 'final')
                        );
                        const prelimRounds = lastIsFinalStage
                          ? knockoutRounds.slice(0, -1)
                          : knockoutRounds;
                        const finalStageMatches = lastIsFinalStage && lastRound ? lastRound.matches : [];

                        if (prelimRounds.length === 0) {
                          return (
                            <div
                              className={`grid grid-cols-1 gap-5 ${
                                finalStageMatches.length > 0 && (thirdPlaceMatch || activeDivision.hasThirdPlaceMatch)
                                  ? 'lg:grid-cols-2'
                                  : 'max-w-xl mx-auto'
                              }`}
                            >
                              {finalStageMatches.map((m) => (
                                <BracketMatchCard
                                  key={m.id}
                                  match={m}
                                  variant="final"
                                  tournamentName={activeTournament?.name}
                                  divisionName={activeDivision?.name}
                                  getSidePlayers={getMatchSidePlayers}
                                  getSideSeed={getMatchSideSeed}
                                  onSelectMatch={setSelectedH2HMatch}
                                />
                              ))}
                              {thirdPlaceMatch ? (
                                <BracketMatchCard
                                  match={thirdPlaceMatch}
                                  variant="third_place"
                                  tournamentName={activeTournament?.name}
                                  divisionName={activeDivision?.name}
                                  getSidePlayers={getMatchSidePlayers}
                                  getSideSeed={getMatchSideSeed}
                                  onSelectMatch={setSelectedH2HMatch}
                                />
                              ) : (
                                activeDivision.hasThirdPlaceMatch && (
                                  <div className="rounded-2xl border border-dashed border-[#EA580C]/45 bg-[#FFF7ED]/60 p-5 flex flex-col justify-center">
                                    <div className="flex items-center gap-2 text-[#9A3412]">
                                      <Award className="w-4 h-4" />
                                      <p className="text-xs font-bold uppercase tracking-[0.08em]">
                                        Partido por el 3er Puesto · Bronce
                                      </p>
                                    </div>
                                    <p className="text-xs text-[#475569] mt-2">
                                      Se programará automáticamente al definirse los cruces de semifinales.
                                    </p>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="overflow-x-auto clean-scroll pb-2">
                            <div className="flex items-stretch gap-5 min-w-max py-1">
                              {prelimRounds.map((round, rIdx) => {
                                const nextRound = knockoutRounds[rIdx + 1];
                                const canPairConnect = Boolean(
                                  nextRound && round.matches.length === nextRound.matches.length * 2
                                );

                                if (canPairConnect) {
                                  const pairs: Array<[Match, Match]> = [];
                                  for (let i = 0; i < round.matches.length; i += 2) {
                                    pairs.push([round.matches[i], round.matches[i + 1]]);
                                  }

                                  return (
                                    <div key={round.roundName} className="w-[272px] shrink-0 flex flex-col">
                                      <div className="pb-2 mb-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-[#7C1FA2]">
                                          {round.roundName}
                                        </span>
                                        <span className="font-mono tabular-nums text-[11px] text-[#475569]">
                                          {round.matches.length} {round.matches.length === 1 ? 'partido' : 'partidos'}
                                        </span>
                                      </div>

                                      <div className="flex-1 flex flex-col justify-around gap-4">
                                        {pairs.map(([mTop, mBot], pIdx) => (
                                          <div
                                            key={`${mTop.id}-${mBot.id}-${pIdx}`}
                                            className="relative flex-1 flex flex-col justify-around gap-3 pr-4"
                                          >
                                            <div
                                              aria-hidden="true"
                                              className="pointer-events-none absolute right-0 top-1/4 bottom-1/4 w-px bg-[#CBD5E1]"
                                            />
                                            <div
                                              aria-hidden="true"
                                              className="pointer-events-none absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-px bg-[#CBD5E1]"
                                            />
                                            <div className="relative flex-1 flex items-center">
                                              <div className="w-full">
                                                <BracketMatchCard
                                                  match={mTop}
                                                  variant="standard"
                                                  tournamentName={activeTournament?.name}
                                                  divisionName={activeDivision?.name}
                                                  getSidePlayers={getMatchSidePlayers}
                                                  getSideSeed={getMatchSideSeed}
                                                  onSelectMatch={setSelectedH2HMatch}
                                                />
                                              </div>
                                              <div
                                                aria-hidden="true"
                                                className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-px bg-[#CBD5E1]"
                                              />
                                            </div>
                                            <div className="relative flex-1 flex items-center">
                                              <div className="w-full">
                                                <BracketMatchCard
                                                  match={mBot}
                                                  variant="standard"
                                                  tournamentName={activeTournament?.name}
                                                  divisionName={activeDivision?.name}
                                                  getSidePlayers={getMatchSidePlayers}
                                                  getSideSeed={getMatchSideSeed}
                                                  onSelectMatch={setSelectedH2HMatch}
                                                />
                                              </div>
                                              <div
                                                aria-hidden="true"
                                                className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-px bg-[#CBD5E1]"
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={round.roundName} className="w-[264px] shrink-0 flex flex-col">
                                    <div className="pb-2 mb-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-[#7C1FA2]">
                                        {round.roundName}
                                      </span>
                                      <span className="font-mono tabular-nums text-[11px] text-[#475569]">
                                        {round.matches.length} {round.matches.length === 1 ? 'partido' : 'partidos'}
                                      </span>
                                    </div>
                                    <div className="flex-1 flex flex-col justify-around gap-3">
                                      {round.matches.map((m) => (
                                        <BracketMatchCard
                                          key={m.id}
                                          match={m}
                                          variant="standard"
                                          tournamentName={activeTournament?.name}
                                          divisionName={activeDivision?.name}
                                          getSidePlayers={getMatchSidePlayers}
                                          getSideSeed={getMatchSideSeed}
                                          onSelectMatch={setSelectedH2HMatch}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Columna de Definición: Gran Final (Oro/Plata) + Partido por el 3er Puesto (Bronce) */}
                              {(finalStageMatches.length > 0 || thirdPlaceMatch || activeDivision.hasThirdPlaceMatch) && (
                                <div className="w-[330px] xl:w-[350px] shrink-0 flex flex-col">
                                  <div className="pb-2 mb-3 border-b border-[#F59E0B]/45 flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#92400E]">
                                      <Trophy className="w-3.5 h-3.5" />
                                      Definición por Medallas
                                    </span>
                                    <span className="text-[11px] font-medium text-[#475569]">
                                      {thirdPlaceMatch || activeDivision.hasThirdPlaceMatch
                                        ? '1° · 2° · 3°'
                                        : '1° · 2°'}
                                    </span>
                                  </div>

                                  <div className="flex-1 flex flex-col justify-center gap-5">
                                    {finalStageMatches.map((m) => (
                                      <BracketMatchCard
                                        key={m.id}
                                        match={m}
                                        variant="final"
                                        tournamentName={activeTournament?.name}
                                        divisionName={activeDivision?.name}
                                        getSidePlayers={getMatchSidePlayers}
                                        getSideSeed={getMatchSideSeed}
                                        onSelectMatch={setSelectedH2HMatch}
                                      />
                                    ))}

                                    {thirdPlaceMatch ? (
                                      <BracketMatchCard
                                        match={thirdPlaceMatch}
                                        variant="third_place"
                                        tournamentName={activeTournament?.name}
                                        divisionName={activeDivision?.name}
                                        getSidePlayers={getMatchSidePlayers}
                                        getSideSeed={getMatchSideSeed}
                                        onSelectMatch={setSelectedH2HMatch}
                                      />
                                    ) : (
                                      activeDivision.hasThirdPlaceMatch && (
                                        <div className="rounded-2xl border border-dashed border-[#EA580C]/45 bg-[#FFF7ED]/65 p-4">
                                          <div className="flex items-center gap-2 text-[#9A3412]">
                                            <Award className="w-4 h-4 shrink-0" />
                                            <p className="text-[11px] font-bold uppercase tracking-[0.08em]">
                                              Partido por el 3er Puesto · Bronce
                                            </p>
                                          </div>
                                          <p className="text-xs text-[#475569] mt-1.5">
                                            Se habilitará con los semifinalistas al completarse la ronda previa.
                                          </p>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Premios del Torneo (Trofeos por Categoría) */}
        {activeTab === 'resumen' && (
          <Suspense
            fallback={<div className="mt-6 h-48 rounded-2xl bg-slate-200/70 animate-pulse" />}
          >
            <TournamentTrophiesViewer
              trophies={tournamentTrophies}
              divisions={tournamentDivisions}
              tournament={activeTournament || null}
              activeDivisionId={activeDivision?.id}
            />
          </Suspense>
        )}

        {/* Publicidades personalizadas del torneo en portada (Resumen) */}
        {activeTab === 'resumen' && (principalAds.length > 0 || lateralAds.length > 0) && (
          <section className="mt-6 sm:mt-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C1FA2]">
                  Patrocinadores del certamen
                </p>
                <h2 className="text-base sm:text-lg font-bold text-[#0A1633]">
                  Auspiciantes oficiales · {activeTournament?.name}
                </h2>
              </div>
              <span className="text-xs text-[#475569]">
                {principalAds.length + lateralAds.length}{' '}
                {principalAds.length + lateralAds.length === 1 ? 'auspiciante activo' : 'auspiciantes activos'}
              </span>
            </div>

            {principalAds.length > 0 && (
              <div className="space-y-4">
                {principalAds.map((ad) => (
                  <TournamentAdCard
                    key={ad.id}
                    ad={ad}
                    variant="featured"
                    tournamentName={activeTournament?.name}
                    tournamentVenue={activeTournament?.venue}
                    tournamentCity={activeTournament?.city}
                  />
                ))}
              </div>
            )}

            {lateralAds.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lateralAds.map((ad) => (
                  <TournamentAdCard
                    key={ad.id}
                    ad={ad}
                    variant="compact"
                    tournamentName={activeTournament?.name}
                    tournamentVenue={activeTournament?.venue}
                    tournamentCity={activeTournament?.city}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: FIXTURE (LISTADO Y CALENDARIO) */}
        {activeTab === 'fixture' && (
          <div className="mt-5 sm:mt-6 space-y-4 sm:space-y-5">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 sm:mb-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0A1633]">
                    Fixture general y programación
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Hora local America/Asuncion · {filteredFixtureMatches.length} partidos
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  {activeTournament && (
                    <button
                      type="button"
                      onClick={() => setFlyerModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50"
                    >
                      <FileImage className="w-3.5 h-3.5 text-[#7C1FA2]" />
                      Flyer de cruces
                    </button>
                  )}

                  {filteredFixtureMatches.length > 0 && (
                    <WhatsAppShareButton
                      label="Compartir fixture"
                      showCopy
                      message={buildFixtureAgendaWhatsAppMessage({
                        matches: filteredFixtureMatches,
                        tournamentName: activeTournament?.name || 'Torneo PlayPy',
                        divisionName: activeDivision?.name,
                        appUrl: activeTournament
                          ? buildTournamentDirectUrl(activeTournament.id, {
                              divisionId: activeDivision?.id,
                              tab: 'fixture',
                            })
                          : undefined,
                      })}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setShowMobileFilters((v) => !v)}
                    className="sm:hidden inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    Filtros {activeFixtureFiltersCount > 0 ? `(${activeFixtureFiltersCount})` : ''}
                  </button>

                  <div className="flex items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setFixtureSortBy('ronda')}
                      className={`px-2.5 min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        fixtureSortBy === 'ronda' ? 'bg-white text-[#0A1633] shadow-xs' : 'text-[#475569]'
                      }`}
                    >
                      Por ronda
                    </button>
                    <button
                      type="button"
                      onClick={() => setFixtureSortBy('fecha')}
                      className={`px-2.5 min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        fixtureSortBy === 'fecha' ? 'bg-white text-[#0A1633] shadow-xs' : 'text-[#475569]'
                      }`}
                    >
                      Por fecha
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                    <button
                      onClick={() => setFixtureView('list')}
                      className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        fixtureView === 'list' ? 'bg-white text-[#0A1633] shadow-xs' : 'text-[#475569]'
                      }`}
                    >
                      <List className="w-4 h-4" />
                      Listado
                    </button>
                    <button
                      onClick={() => setFixtureView('calendar')}
                      className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        fixtureView === 'calendar' ? 'bg-white text-[#0A1633] shadow-xs' : 'text-[#475569]'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      Calendario
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={`${
                  showMobileFilters ? 'grid' : 'hidden sm:grid'
                } grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 sm:gap-3 pt-2 sm:pt-0`}
              >
                <select
                  aria-label="Filtrar por torneo"
                  value={filterTournamentId}
                  onChange={(e) => {
                    setFilterTournamentId(e.target.value);
                    setFilterDivisionId('ALL');
                    setFilterMatchdayId('ALL');
                  }}
                  className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="ALL">Todos los torneos</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar por división"
                  value={filterDivisionId}
                  onChange={(e) => {
                    setFilterDivisionId(e.target.value);
                    setFilterMatchdayId('ALL');
                  }}
                  className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="ALL">Todas las divisiones</option>
                  {divisions
                    .filter((d) => filterTournamentId === 'ALL' || d.tournamentId === filterTournamentId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>

                <select
                  aria-label="Filtrar por jornada"
                  value={filterMatchdayId}
                  onChange={(e) => setFilterMatchdayId(e.target.value)}
                  className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="ALL">Todas las jornadas</option>
                  {matchdays
                    .filter((md) => filterDivisionId === 'ALL' || md.divisionId === filterDivisionId)
                    .map((md) => (
                      <option key={md.id} value={md.id}>
                        {md.name}
                      </option>
                    ))}
                </select>

                <input
                  type="date"
                  aria-label="Filtrar por fecha"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#0A1633]"
                />

                <select
                  aria-label="Filtrar por cancha"
                  value={filterCourt}
                  onChange={(e) => setFilterCourt(e.target.value)}
                  className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="ALL">Todas las canchas</option>
                  {allCourts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-3.5 sm:top-3" />
                  <input
                    type="text"
                    placeholder="Buscar jugador..."
                    value={filterPlayerQuery}
                    onChange={(e) => setFilterPlayerQuery(e.target.value)}
                    className="w-full h-11 sm:h-10 pl-8 pr-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#0A1633]"
                  />
                </div>
              </div>
            </div>

            {filteredFixtureMatches.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-sm text-[#475569]">
                No se encontraron partidos con los filtros seleccionados.
              </div>
            ) : fixtureView === 'list' ? (
              <>
                {/* Tarjetas móviles para Fixture (< md) */}
                <div className="md:hidden space-y-3">
                  {paginatedFixtureMatches.map((m) => {
                    const t = tournaments.find((x) => x.id === m.tournamentId);
                    const d = divisions.find((x) => x.id === m.divisionId);
                    return (
                      <div
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedH2HMatch(m)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedH2HMatch(m);
                          }
                        }}
                        className="bg-white border border-[#E2E8F0] hover:border-[#7C1FA2]/60 rounded-2xl p-4 space-y-2.5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-[#475569]">
                          <span className="truncate font-medium text-[#7C1FA2]">
                            {d?.name} · {m.roundName}
                          </span>
                          <span className="font-mono tabular-nums shrink-0 font-semibold text-[#0A1633]">
                            {m.scheduledDate
                              ? `${formatAsuncionDate(m.scheduledDate)}${m.scheduledTime ? ` · ${m.scheduledTime} hs` : ''}`
                              : 'Fecha por definir'}
                          </span>
                        </div>

                        <div className="space-y-1 text-sm">
                          <p className={m.winnerEntryId === m.entryAId ? 'font-bold text-[#7C1FA2]' : 'font-medium text-[#0A1633]'}>
                            {m.entryAName}
                          </p>
                          <p className={m.winnerEntryId === m.entryBId ? 'font-bold text-[#7C1FA2]' : 'font-medium text-[#0A1633]'}>
                            {m.entryBName}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-[#475569] truncate">
                            <ArrowLeftRight className="w-3 h-3 text-[#7C1FA2] shrink-0" />
                            <span className="truncate">{m.courtName || 'Cancha por definir'} · {t?.name}</span>
                          </span>
                          <div className="shrink-0 flex items-center gap-2 text-right">
                            <span className={MATCH_STATUS_LABEL[m.status]?.tone}>
                              {MATCH_STATUS_LABEL[m.status]?.label}
                            </span>
                            {(m.sets.length > 0 || m.status === 'wo' || m.status === 'retiro' || m.status === 'descalificado') && (
                              <span className="font-mono tabular-nums font-semibold text-[#7C1FA2]">
                                {formatScoreString(m.sets, m.status)}
                              </span>
                            )}
                            <WhatsAppShareButton
                              compact
                              label="WhatsApp"
                              message={buildMatchWhatsAppMessage({
                                match: m,
                                tournament: t,
                                division: d,
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tabla escritorio para Fixture (md+) */}
                <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-2xl overflow-x-auto clean-scroll">
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#475569]">
                        <th className="py-3 px-4">Fecha / Hora</th>
                        <th className="py-3 px-4">Torneo / División</th>
                        <th className="py-3 px-4">Fase y Ronda</th>
                        <th className="py-3 px-4">Participantes</th>
                        <th className="py-3 px-4">Cancha</th>
                        <th className="py-3 px-4">Estado / Marcador</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-sm">
                      {paginatedFixtureMatches.map((m) => {
                        const t = tournaments.find((x) => x.id === m.tournamentId);
                        const d = divisions.find((x) => x.id === m.divisionId);
                        const hasOutcomeScore =
                          m.sets.length > 0 ||
                          m.status === 'wo' ||
                          m.status === 'retiro' ||
                          m.status === 'descalificado';
                        return (
                          <tr
                            key={m.id}
                            onClick={() => setSelectedH2HMatch(m)}
                            className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                            title="Clic para ver Cara a Cara e historial"
                          >
                            <td className="py-3 px-4 font-mono tabular-nums text-xs">
                              <div className="font-medium text-[#0A1633]">
                                {m.scheduledDate ? formatAsuncionDate(m.scheduledDate) : 'Fecha por definir'}
                              </div>
                              <div className="text-[#475569]">
                                {m.scheduledTime ? `${m.scheduledTime} hs` : 'Opcional'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="font-medium text-[#0A1633]">{d?.name}</div>
                              <div className="text-[#475569]">{t?.name}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#475569]">
                              <span className="capitalize">{m.phase}</span> · {m.roundName}
                            </td>
                            <td className="py-3 px-4">
                              <span className={m.winnerEntryId === m.entryAId ? 'font-semibold text-[#0A1633]' : 'text-[#0A1633]'}>
                                {m.entryAName}
                              </span>
                              <span className="text-[#475569] mx-1.5">vs</span>
                              <span className={m.winnerEntryId === m.entryBId ? 'font-semibold text-[#0A1633]' : 'text-[#0A1633]'}>
                                {m.entryBName}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#475569]">
                              {m.courtName || 'Sin asignar'}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <span className={MATCH_STATUS_LABEL[m.status]?.tone}>
                                {MATCH_STATUS_LABEL[m.status]?.label}
                              </span>
                              {hasOutcomeScore && (
                                <span className="ml-2 font-mono tabular-nums font-semibold text-[#7C1FA2]">
                                  {formatScoreString(m.sets, m.status)}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedH2HMatch(m);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-[11px] font-semibold text-[#7C1FA2] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                  H2H
                                </button>
                                <WhatsAppShareButton
                                  compact
                                  label="WhatsApp"
                                  message={buildMatchWhatsAppMessage({
                                    match: m,
                                    tournament: t,
                                    division: d,
                                  })}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              /* Vista Calendario agrupada por fecha */
              <div className="space-y-4">
                {Array.from(
                  paginatedFixtureMatches.reduce((acc, m) => {
                    const key = m.scheduledDate || 'Sin fecha';
                    if (!acc.has(key)) acc.set(key, []);
                    acc.get(key)!.push(m);
                    return acc;
                  }, new Map<string, Match[]>())
                ).map(([dateKey, dayMatches]) => (
                  <div key={dateKey} className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#7C1FA2]" />
                      <h3 className="text-sm font-semibold text-[#0A1633]">
                        {dateKey === 'Sin fecha' ? 'Partidos por programar' : formatAsuncionDate(dateKey)}
                      </h3>
                      <span className="text-xs text-[#475569]">· {dayMatches.length} partidos</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#E2E8F0]">
                      {dayMatches.map((m) => {
                        const t = tournaments.find((x) => x.id === m.tournamentId);
                        const d = divisions.find((x) => x.id === m.divisionId);
                        const hasOutcomeScore =
                          m.sets.length > 0 ||
                          m.status === 'wo' ||
                          m.status === 'retiro' ||
                          m.status === 'descalificado';
                        return (
                          <div
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedH2HMatch(m)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedH2HMatch(m);
                              }
                            }}
                            className="bg-white hover:bg-[#F8FAFC] p-4 space-y-2 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs text-[#475569]">
                              <span className="font-mono tabular-nums font-semibold text-[#0A1633]">
                                {m.scheduledTime ? `${m.scheduledTime} hs` : 'TBC'}
                              </span>
                              <span>{m.courtName || 'Sin cancha'}</span>
                            </div>
                            <p className="text-xs text-[#7C1FA2] font-medium">
                              {d?.name} · {m.roundName}
                            </p>
                            <p className="text-sm font-semibold text-[#0A1633]">
                              {m.entryAName} vs {m.entryBName}
                            </p>
                            <div className="flex items-center justify-between gap-2 text-xs pt-1">
                              <div>
                                <span className={MATCH_STATUS_LABEL[m.status]?.tone}>
                                  {MATCH_STATUS_LABEL[m.status]?.label}
                                </span>
                                {hasOutcomeScore && (
                                  <span className="ml-2 font-mono tabular-nums font-semibold text-[#7C1FA2]">
                                    {formatScoreString(m.sets, m.status)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7C1FA2]">
                                  <ArrowLeftRight className="w-3 h-3" />
                                  H2H
                                </span>
                                <WhatsAppShareButton
                                  compact
                                  label="WhatsApp"
                                  message={buildMatchWhatsAppMessage({
                                    match: m,
                                    tournament: t,
                                    division: d,
                                  })}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {visibleFixtureLimit < filteredFixtureMatches.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleFixtureLimit((prev) => prev + 24)}
                  className="px-5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50 transition-colors"
                >
                  Mostrar más partidos ({filteredFixtureMatches.length - visibleFixtureLimit} restantes)
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: JORNADAS Y GALERÍAS DE FOTOS */}
        {activeTab === 'jornadas' && activeDivision && (
          <div className="mt-6 space-y-6">
            {divisionMatchdays.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-sm text-[#475569]">
                Aún no se crearon jornadas en esta división.
              </div>
            ) : (
              divisionMatchdays.map((md) => {
                const mdMatches = divisionMatches.filter((m) => m.matchdayId === md.id);
                const mdPhotos = md.galleryPublished
                  ? mergedPhotos
                      .filter((p) => p.matchdayId === md.id && p.published)
                      .sort((a, b) => a.order - b.order)
                  : [];
                const coverPhoto =
                  mdPhotos.find((p) => p.id === md.coverPhotoId || p.isCover) || mdPhotos[0];

                return (
                  <article
                    key={md.id}
                    className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
                  >
                    <div className="p-5 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#7C1FA2] font-medium">
                          {md.date ? `${formatAsuncionDate(md.date)} · ` : ''}Jornada {md.order}
                        </p>
                        <h2 className="text-lg font-semibold text-[#0A1633] mt-0.5">{md.name}</h2>
                        {md.description && (
                          <p className="text-sm text-[#475569] mt-1">{md.description}</p>
                        )}
                      </div>
                      <p className="text-xs text-[#475569] shrink-0">
                        {mdMatches.length} partidos · {mdPhotos.length} fotos publicadas
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
                      {/* Partidos de la jornada */}
                      <div className="lg:col-span-6 p-5">
                        <h3 className="text-xs font-semibold text-[#475569] mb-3">
                          Partidos y resultados de la jornada
                        </h3>
                        {mdMatches.length === 0 ? (
                          <p className="text-sm text-[#475569]">Sin partidos asignados aún.</p>
                        ) : (
                          <div className="divide-y divide-[#E2E8F0]">
                            {mdMatches.map((m) => (
                              <div
                                key={m.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedH2HMatch(m)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedH2HMatch(m);
                                  }
                                }}
                                className="py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs text-[#475569]">
                                    {m.scheduledTime ? `${m.scheduledTime} hs` : 'TBC'} · {m.courtName || 'Sin cancha'}
                                  </p>
                                  <p className="text-sm font-medium text-[#0A1633] truncate">
                                    {m.entryAName} vs {m.entryBName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    {m.sets.length > 0 || m.status === 'wo' || m.status === 'retiro' || m.status === 'descalificado' ? (
                                      <span className="font-mono tabular-nums text-xs font-semibold text-[#7C1FA2]">
                                        {formatScoreString(m.sets, m.status)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-[#475569]">
                                        {MATCH_STATUS_LABEL[m.status]?.label}
                                      </span>
                                    )}
                                  </div>
                                  <WhatsAppShareButton
                                    compact
                                    label="WA"
                                    message={buildMatchWhatsAppMessage({
                                      match: m,
                                      tournament: activeTournament,
                                      division: activeDivision,
                                    })}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Galería publicada */}
                      <div className="lg:col-span-6 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-semibold text-[#475569]">
                            Galería de fotos
                          </h3>
                          {coverPhoto && (
                            <span className="text-xs text-[#7C1FA2] font-medium">
                              Portada destacada
                            </span>
                          )}
                        </div>
                        {paginatedPhotosQuery.isLoading && mdPhotos.length === 0 ? (
                          <GalleryGridSkeleton count={6} />
                        ) : mdPhotos.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-xs text-[#475569]">
                            <Images className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                            La galería de esta jornada aún no fue publicada.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {mdPhotos.map((ph, idx) => (
                              <button
                                key={ph.id}
                                onClick={() => openLightbox(mdPhotos, idx)}
                                className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E2E8F0] bg-slate-100 text-left focus-visible:outline-2 focus-visible:outline-[#7C1FA2]"
                              >
                                <OptimizedImage
                                  src={ph.thumbUrl}
                                  alt={ph.caption || `Foto ${idx + 1} de ${md.name}`}
                                  width={420}
                                  height={315}
                                  transformWidth={420}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                {ph.caption && (
                                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                                    <p className="text-[11px] text-white line-clamp-2">{ph.caption}</p>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}

            {paginatedPhotosQuery.hasNextPage && (
              <div ref={photosSentinelRef} className="flex flex-col items-center gap-3 pt-2">
                {paginatedPhotosQuery.isFetchingNextPage ? (
                  <GalleryGridSkeleton count={3} />
                ) : (
                  <button
                    type="button"
                    onClick={() => void paginatedPhotosQuery.fetchNextPage()}
                    className="px-5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50 transition-colors"
                  >
                    Cargar más fotos de la galería
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: JUGADORES, PERFILES Y ESTADÍSTICAS */}
        {activeTab === 'jugadores' && (
          <div className="mt-6 space-y-5">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0A1633]">
                    Jugadores del torneo · {activeTournament?.name || 'Certamen activo'}
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Filtrá por categoría o buscá por nombre/club. Tocá un jugador para ver su ficha y estadísticas ({filteredPlayers.length} mostrados).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  {playerCategoryOptions.length > 0 && (
                    <select
                      value={playerCategoryFilter}
                      onChange={(e) => setPlayerCategoryFilter(e.target.value)}
                      aria-label="Filtrar jugadores por categoría"
                      className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                    >
                      <option value="ALL">Todas las categorías ({tournamentPlayers.length})</option>
                      {playerCategoryOptions.map((cat) => {
                        const count = tournamentPlayers.filter((p) =>
                          playerMatchesCategory(p, cat)
                        ).length;
                        return (
                          <option key={cat} value={cat}>
                            Cat. {cat} ({count})
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <div className="relative flex-1 sm:w-72">
                    <Search className="w-4 h-4 text-[#475569] absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, club o categoría..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#0A1633]"
                    />
                  </div>
                </div>
              </div>

              {playerCategoryOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setPlayerCategoryFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      playerCategoryFilter === 'ALL'
                        ? 'bg-[#7C1FA2] text-white'
                        : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                    }`}
                  >
                    Todas ({tournamentPlayers.length})
                  </button>
                  {playerCategoryOptions.map((cat) => {
                    const count = tournamentPlayers.filter((p) =>
                      playerMatchesCategory(p, cat)
                    ).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setPlayerCategoryFilter(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          playerCategoryFilter === cat
                            ? 'bg-[#7C1FA2] text-white'
                            : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                        }`}
                      >
                        Cat. {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {paginatedPlayersQuery.isLoading && tournamentPlayers.length === 0 ? (
              <PlayersGridSkeleton count={6} />
            ) : filteredPlayers.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
                <p className="text-sm font-medium text-[#0A1633]">
                  {playerSearch.trim() || playerCategoryFilter !== 'ALL'
                    ? 'No se encontraron jugadores que coincidan con el filtro seleccionado.'
                    : 'Este torneo todavía no tiene jugadores cargados.'}
                </p>
                <p className="text-xs text-[#475569] mt-1">
                  Cada torneo gestiona sus categorías y plantel de jugadores de forma independiente.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedPlayers.map((p) => {
                    const winRate =
                      p.stats.matchesPlayed > 0
                        ? Math.round((p.stats.wins / p.stats.matchesPlayed) * 100)
                        : 0;
                    const isFollowing = followedPlayerIds.includes(p.id);
                    const enrolledDivs = playerDivisionEnrollmentMap.get(p.id)?.divisionNames || [];
                    return (
                      <div
                        key={p.id}
                        className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <PlayerAvatar player={p} sizeClass="w-12 h-12 text-sm" />
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold text-[#0A1633] truncate">{p.fullName}</h3>
                                <p className="text-xs text-[#475569] mt-0.5 truncate">
                                  {p.club} · Cat. {p.habitualCategory} · {p.dominantHand}
                                </p>
                                {enrolledDivs.length > 0 && (
                                  <p className="text-[11px] font-medium text-[#7C1FA2] mt-0.5 truncate">
                                    {enrolledDivs.join(' · ')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => onToggleFollowPlayer(p.id)}
                              title="Seguir notificaciones de este jugador"
                              className={`min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                                isFollowing
                                  ? 'bg-emerald-50 border-emerald-200 text-[#7C1FA2]'
                                  : 'bg-white border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                              }`}
                            >
                              {isFollowing ? 'Siguiendo' : 'Seguir'}
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-[#E2E8F0] text-center">
                            <div>
                              <p className="text-[11px] text-[#475569]">Partidos</p>
                              <p className="text-sm font-bold font-mono tabular-nums text-[#0A1633]">
                                {p.stats.matchesPlayed}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-[#475569]">Victorias</p>
                              <p className="text-sm font-bold font-mono tabular-nums text-[#15803D]">
                                {p.stats.wins} ({winRate}%)
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-[#475569]">Títulos</p>
                              <p className="text-sm font-bold font-mono tabular-nums text-[#0A1633]">
                                {p.stats.titles}
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedPlayer(p)}
                          className="mt-4 w-full min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#F8FAFC] hover:bg-slate-100 border border-[#E2E8F0] text-xs font-medium text-[#0A1633] transition-colors"
                        >
                          Ver ficha y estadísticas
                        </button>
                      </div>
                    );
                  })}
                </div>

                {hasMorePlayersToShow && (
                  <div ref={playersSentinelRef} className="flex flex-col items-center gap-3 pt-2">
                    {paginatedPlayersQuery.isFetchingNextPage ? (
                      <PlayersGridSkeleton count={3} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setVisiblePlayersLimit((prev) => prev + 18);
                          if (
                            paginatedPlayersQuery.hasNextPage &&
                            !paginatedPlayersQuery.isFetchingNextPage
                          ) {
                            void paginatedPlayersQuery.fetchNextPage();
                          }
                        }}
                        className="px-5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50 transition-colors"
                      >
                        Cargar más jugadores ({paginatedPlayers.length} mostrados)
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Pie con publicidades personalizadas asignadas a pie de página */}
      {pieAds.length > 0 && (
        <section className="max-w-7xl mx-auto px-3 sm:px-6 mt-8 pt-6 border-t border-[#E2E8F0]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#475569]">
              Acompañan {activeTournament?.name}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pieAds.map((ad) => (
              <TournamentAdCard
                key={ad.id}
                ad={ad}
                variant="footer"
                tournamentName={activeTournament?.name}
                tournamentVenue={activeTournament?.venue}
                tournamentCity={activeTournament?.city}
              />
            ))}
          </div>
        </section>
      )}

      {/* Lightbox a tamaño completo */}
      {lightboxPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxPhotos([]);
            if (e.key === 'ArrowRight')
              setLightboxIndex((i) => (i + 1) % lightboxPhotos.length);
            if (e.key === 'ArrowLeft')
              setLightboxIndex((i) => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length);
          }}
          tabIndex={0}
        >
          <div className="flex items-center justify-between text-white">
            <p className="text-xs text-white/80 font-mono tabular-nums">
              {lightboxIndex + 1} / {lightboxPhotos.length}
            </p>
            <button
              onClick={() => setLightboxPhotos([])}
              aria-label="Cerrar visor"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative my-4">
            {lightboxPhotos.length > 1 && (
              <button
                onClick={() =>
                  setLightboxIndex((i) => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length)
                }
                aria-label="Foto anterior"
                className="absolute left-2 sm:left-6 min-h-[44px] min-w-[44px] rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <OptimizedImage
              src={lightboxPhotos[lightboxIndex]?.fullUrl}
              alt={lightboxPhotos[lightboxIndex]?.caption || 'Foto de jornada'}
              width={1440}
              height={960}
              transformWidth={1440}
              priority
              className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
            />
            {lightboxPhotos.length > 1 && (
              <button
                onClick={() => setLightboxIndex((i) => (i + 1) % lightboxPhotos.length)}
                aria-label="Foto siguiente"
                className="absolute right-2 sm:right-6 min-h-[44px] min-w-[44px] rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="text-center text-white max-w-2xl mx-auto pb-2">
            {lightboxPhotos[lightboxIndex]?.caption && (
              <p className="text-sm">{lightboxPhotos[lightboxIndex].caption}</p>
            )}
            {lightboxPhotos[lightboxIndex]?.matchId && (
              <p className="text-xs text-white/70 mt-1">
                Partido vinculado:{' '}
                {(() => {
                  const lm = matches.find((m) => m.id === lightboxPhotos[lightboxIndex].matchId);
                  return lm ? `${lm.entryAName} vs ${lm.entryBName}` : 'Encuentro oficial';
                })()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal de Perfil y Estadísticas del Jugador */}
      {selectedPlayer && (
          <div
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <PlayerAvatar player={selectedPlayer} sizeClass="w-12 h-12 text-base" />
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-[#0A1633] truncate">
                      {selectedPlayer.fullName}
                    </h2>
                    <p className="text-xs text-[#475569] truncate">
                      {selectedPlayer.club} · Cat. {selectedPlayer.habitualCategory} · {selectedPlayer.gender}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  aria-label="Cerrar perfil"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#475569]">Partidos</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                      {selectedPlayer.stats.matchesPlayed}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#475569]">G / P</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-[#15803D]">
                      {selectedPlayer.stats.wins} - {selectedPlayer.stats.losses}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#475569]">Sets (G/P)</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                      {selectedPlayer.stats.setsWon}/{selectedPlayer.stats.setsLost}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#475569]">Games (G/P)</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-[#0A1633]">
                      {selectedPlayer.stats.gamesWon}/{selectedPlayer.stats.gamesLost}
                    </p>
                  </div>
                </div>

                <div className="text-sm text-[#475569] space-y-1">
                  <p>
                    <strong className="text-[#0A1633]">Perfil técnico:</strong> {selectedPlayer.dominantHand} · Revés a {selectedPlayer.backhand.toLowerCase()} · Racha actual:{' '}
                    <span className="font-mono tabular-nums font-semibold text-[#0A1633]">
                      {selectedPlayer.stats.currentStreak > 0
                        ? `+${selectedPlayer.stats.currentStreak}`
                        : selectedPlayer.stats.currentStreak}
                    </span>
                  </p>
                  {selectedPlayer.bio && <p>{selectedPlayer.bio}</p>}
                </div>

              <div>
                <h3 className="text-sm font-semibold text-[#0A1633] mb-2.5">
                  Historial de partidos recientes
                </h3>
                {(() => {
                  const history = matches.filter(
                    (m) =>
                      !m.isBye &&
                      m.published &&
                      (m.playerIdsA.includes(selectedPlayer.id) ||
                        m.playerIdsB.includes(selectedPlayer.id))
                  );
                  if (history.length === 0) {
                    return <p className="text-xs text-[#475569]">Sin partidos registrados.</p>;
                  }
                  return (
                    <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                      {history.map((m) => {
                        const div = divisions.find((d) => d.id === m.divisionId);
                        const isA = m.playerIdsA.includes(selectedPlayer.id);
                        const won =
                          m.winnerEntryId &&
                          ((isA && m.winnerEntryId === m.entryAId) ||
                            (!isA && m.winnerEntryId === m.entryBId));
                        return (
                          <div
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedPlayer(null);
                              setSelectedH2HMatch(m);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedPlayer(null);
                                setSelectedH2HMatch(m);
                              }
                            }}
                            className="p-3 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                          >
                            <div>
                              <p className="text-[#475569]">
                                {div?.name} · {m.roundName}
                              </p>
                              <p className="font-medium text-[#0A1633] mt-0.5">
                                {m.entryAName} vs {m.entryBName}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {m.winnerEntryId ? (
                                <span className={won ? 'font-semibold text-[#15803D]' : 'text-red-700'}>
                                  {won ? 'Victoria' : 'Derrota'} · {formatScoreString(m.sets, m.status)}
                                </span>
                              ) : (
                                <span className="text-[#475569]">
                                  {formatAsuncionDate(m.scheduledDate)} {m.scheduledTime || ''}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cara a Cara (Head-to-Head) */}
      {selectedH2HMatch && (
        <Suspense fallback={<ModalSkeleton />}>
          <HeadToHeadModal
            match={selectedH2HMatch}
            allMatches={matches}
            tournaments={tournaments}
            divisions={divisions}
            players={players}
            registrations={registrations}
            onClose={() => setSelectedH2HMatch(null)}
          />
        </Suspense>
      )}

      {/* Modal Link Directo y QR del Torneo */}
      {qrModalOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <TournamentQrModal
            open={qrModalOpen}
            onClose={() => setQrModalOpen(false)}
            tournament={activeTournament || null}
            divisions={tournamentDivisions}
            defaultDivisionId={activeDivision?.id}
            logoUrl={logoUrl}
          />
        </Suspense>
      )}

      {/* Modal Generador de Flyer de Cruces */}
      {flyerModalOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <MatchupsFlyerModal
            open={flyerModalOpen}
            onClose={() => setFlyerModalOpen(false)}
            tournament={activeTournament || null}
            divisions={divisions}
            matchdays={matchdays}
            matches={matches}
            defaultDivisionId={activeDivision?.id || 'ALL'}
            logoUrl={logoUrl}
          />
        </Suspense>
      )}
    </div>
  );
};
