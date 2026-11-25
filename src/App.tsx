/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { where } from 'firebase/firestore';
import { auth, testConnection } from './firebase';
import { buildDemoBundle } from './data/demoSeed';
import { mergeSiteLandingConfig, SITE_LANDING_DOC_ID } from './data/siteConfigDefaults';
import {
  fetchCollectionLimited,
  fetchSiteSettingsOnce,
  fetchTournamentsOnce,
  subscribeCollection,
  subscribeTournamentCollection,
} from './services/firestoreService';
import {
  Division,
  Group,
  Match,
  Matchday,
  MatchdayPhoto,
  NotificationAlert,
  PlayerPublic,
  Registration,
  SiteLandingConfig,
  Tournament,
  TournamentAd,
  TournamentTrophy,
} from './types/tennis';
import { useRealtimePush } from './hooks/usePWA';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminSectionSkeleton, ModalSkeleton, PortalSkeleton } from './components/Skeletons';
import {
  AppView,
  LiveToastOverlay,
  MobileBottomNav,
  OfflineIndicator,
  PublicTab,
  TopBar,
} from './components/TopBarAndPWA';
import { EntryLandingPage } from './components/EntryLandingPage';
import { parseTournamentUrlParams, syncBrowserTournamentUrl } from './utils/tournamentLinks';

const PublicPortal = lazy(() =>
  import('./components/PublicPortal').then((m) => ({ default: m.PublicPortal }))
);
const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const ItfReferenceModal = lazy(() =>
  import('./components/ItfReferenceModal').then((m) => ({ default: m.ItfReferenceModal }))
);

function mergeById<T extends { id: string }>(cached: T[], scopedLive: T[]): T[] {
  if (scopedLive.length === 0) return cached;
  if (cached.length === 0) return scopedLive;
  const map = new Map<string, T>();
  cached.forEach((item) => map.set(item.id, item));
  scopedLive.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

export default function App() {
  const queryClient = useQueryClient();
  const demoFallback = useMemo(() => buildDemoBundle(), []);
  const initialUrlParams = useMemo(() => parseTournamentUrlParams(), []);

  const [view, setView] = useState<AppView>(() =>
    initialUrlParams.tournamentId ? 'portal' : 'landing'
  );
  const [activePublicTab, setActivePublicTab] = useState<PublicTab>(
    () => initialUrlParams.tab || 'resumen'
  );
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [itfModalOpen, setItfModalOpen] = useState(false);

  // Consultas cacheadas con React Query para la portada (evita abrir 12 listeners al cargar)
  const { data: queryTournaments = [], isFetched: tournamentsFetched } = useQuery({
    queryKey: ['tournaments'],
    queryFn: fetchTournamentsOnce,
  });

  const { data: querySiteSettings = [] } = useQuery({
    queryKey: ['site_settings'],
    queryFn: fetchSiteSettingsOnce,
  });

  const { data: cachedDivisions = [] } = useQuery({
    queryKey: ['summary', 'divisions'],
    queryFn: () => fetchCollectionLimited<Division>('divisions', 200),
  });

  const { data: cachedPlayers = [] } = useQuery({
    queryKey: ['summary', 'players_public'],
    queryFn: () => fetchCollectionLimited<PlayerPublic>('players_public', 300),
  });

  const { data: cachedMatches = [] } = useQuery({
    queryKey: ['summary', 'matches_published'],
    queryFn: () =>
      fetchCollectionLimited<Match>('matches', 250, [where('published', '==', true)]),
  });

  const { data: cachedAds = [] } = useQuery({
    queryKey: ['summary', 'tournament_ads'],
    queryFn: () => fetchCollectionLimited<TournamentAd>('tournament_ads', 100),
  });

  // Colecciones en tiempo real acotadas al torneo activo (solo activas en Portal o Admin)
  const [liveTournaments, setLiveTournaments] = useState<Tournament[] | null>(null);
  const [liveSiteSettings, setLiveSiteSettings] = useState<SiteLandingConfig[] | null>(null);
  const [fsDivisions, setFsDivisions] = useState<Division[]>([]);
  const [fsPlayers, setFsPlayers] = useState<PlayerPublic[]>([]);
  const [fsRegistrations, setFsRegistrations] = useState<Registration[]>([]);
  const [fsGroups, setFsGroups] = useState<Group[]>([]);
  const [fsMatchdays, setFsMatchdays] = useState<Matchday[]>([]);
  const [fsMatches, setFsMatches] = useState<Match[]>([]);
  const [fsPhotos, setFsPhotos] = useState<MatchdayPhoto[]>([]);
  const [fsNotifications, setFsNotifications] = useState<NotificationAlert[]>([]);
  const [fsTournamentAds, setFsTournamentAds] = useState<TournamentAd[]>([]);
  const [fsTournamentTrophies, setFsTournamentTrophies] = useState<TournamentTrophy[]>([]);

  const fsTournaments = liveTournaments ?? queryTournaments;
  const fsSiteSettings = liveSiteSettings ?? querySiteSettings;
  const firestoreLoaded = tournamentsFetched || liveTournaments !== null;

  // Seguimiento de jugadores para notificaciones push
  const [followedPlayerIds, setFollowedPlayerIds] = useState<string[]>(() => {
    try {
      const saved =
        localStorage.getItem('playpy_followed_players') ||
        localStorage.getItem('teniscupy_followed_players');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const { pushEnabled, requestPushPermission, toasts, dismissToast } =
    useRealtimePush(followedPlayerIds);

  useEffect(() => {
    testConnection();
    const handleOnline = () => {
      void testConnection();
    };
    window.addEventListener('online', handleOnline);
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));

    return () => {
      window.removeEventListener('online', handleOnline);
      unsubAuth();
    };
  }, []);

  // Si Firestore aún está vacío antes del primer login de admin, mostrar los torneos demo en modo lectura
  const useSeededFallback = firestoreLoaded && fsTournaments.length === 0;
  const tournaments = useSeededFallback ? demoFallback.tournaments : fsTournaments;

  const mergedDivisions = useMemo(
    () => mergeById(cachedDivisions, fsDivisions),
    [cachedDivisions, fsDivisions]
  );
  const mergedPlayers = useMemo(
    () => mergeById(cachedPlayers, fsPlayers),
    [cachedPlayers, fsPlayers]
  );
  const mergedMatches = useMemo(
    () => mergeById(cachedMatches, fsMatches),
    [cachedMatches, fsMatches]
  );
  const mergedAds = useMemo(
    () => mergeById(cachedAds, fsTournamentAds),
    [cachedAds, fsTournamentAds]
  );

  const divisions = useSeededFallback ? demoFallback.divisions : mergedDivisions;
  const players = useSeededFallback ? demoFallback.playersPublic : mergedPlayers;
  const registrations = useSeededFallback ? demoFallback.registrations : fsRegistrations;
  const groups = useSeededFallback ? demoFallback.groups : fsGroups;
  const matchdays = useSeededFallback ? demoFallback.matchdays : fsMatchdays;
  const matches = useSeededFallback ? demoFallback.matches : mergedMatches;
  const photos = useSeededFallback ? demoFallback.photos : fsPhotos;
  const notifications = useSeededFallback
    ? demoFallback.notifications
    : [...fsNotifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tournamentAds = useSeededFallback ? demoFallback.tournamentAds : mergedAds;
  const tournamentTrophies = useSeededFallback
    ? demoFallback.tournamentTrophies
    : fsTournamentTrophies;

  const siteConfig = useMemo(
    () =>
      mergeSiteLandingConfig(
        fsSiteSettings.find((s) => s.id === SITE_LANDING_DOC_ID) || fsSiteSettings[0]
      ),
    [fsSiteSettings]
  );

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(
    () => initialUrlParams.tournamentId || 'torneo_copa_asuncion_2026'
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(
    () => initialUrlParams.divisionId || 'div_5ta_singles_masc'
  );

  // Sincronizar selección si cambia el listado de torneos/divisiones
  const effectiveTournamentId = useMemo(() => {
    if (tournaments.some((t) => t.id === selectedTournamentId)) return selectedTournamentId;
    return tournaments[0]?.id || '';
  }, [tournaments, selectedTournamentId]);

  const effectiveDivisionId = useMemo(() => {
    const tDivs = divisions.filter((d) => d.tournamentId === effectiveTournamentId);
    if (tDivs.some((d) => d.id === selectedDivisionId)) return selectedDivisionId;
    return tDivs[0]?.id || '';
  }, [divisions, effectiveTournamentId, selectedDivisionId]);

  const activeLiveTournamentId = useMemo(() => {
    if (fsTournaments.length === 0) return '';
    if (fsTournaments.some((t) => t.id === selectedTournamentId)) return selectedTournamentId;
    return fsTournaments[0]?.id || '';
  }, [fsTournaments, selectedTournamentId]);

  // Suscripción en tiempo real bajo demanda: SOLO cuando el usuario entra al Portal o Panel Admin
  // y filtrada estrictamente al torneo activo para reducir drásticamente las lecturas en Firestore.
  useEffect(() => {
    if (view === 'landing') {
      return undefined;
    }

    const unsubs: Array<() => void> = [
      subscribeCollection<Tournament>(
        'tournaments',
        (data) => {
          setLiveTournaments(data);
          queryClient.setQueryData(['tournaments'], data);
        },
        false,
        50
      ),
      subscribeCollection<SiteLandingConfig>(
        'site_settings',
        (data) => {
          setLiveSiteSettings(data);
          queryClient.setQueryData(['site_settings'], data);
        },
        false,
        5
      ),
    ];

    if (activeLiveTournamentId) {
      unsubs.push(
        subscribeTournamentCollection<Division>('divisions', activeLiveTournamentId, setFsDivisions, 100),
        subscribeTournamentCollection<PlayerPublic>('players_public', activeLiveTournamentId, setFsPlayers, 350),
        subscribeTournamentCollection<Registration>('registrations', activeLiveTournamentId, setFsRegistrations, 400),
        subscribeTournamentCollection<Group>('groups', activeLiveTournamentId, setFsGroups, 100),
        subscribeTournamentCollection<Matchday>('matchdays', activeLiveTournamentId, setFsMatchdays, 100),
        subscribeTournamentCollection<Match>('matches', activeLiveTournamentId, setFsMatches, 450),
        subscribeTournamentCollection<MatchdayPhoto>(
          'photos',
          activeLiveTournamentId,
          setFsPhotos,
          250,
          [where('published', '==', true)]
        ),
        subscribeTournamentCollection<NotificationAlert>('notifications', activeLiveTournamentId, setFsNotifications, 100),
        subscribeTournamentCollection<TournamentAd>('tournament_ads', activeLiveTournamentId, setFsTournamentAds, 50),
        subscribeTournamentCollection<TournamentTrophy>('tournament_trophies', activeLiveTournamentId, setFsTournamentTrophies, 80)
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [view, activeLiveTournamentId, queryClient]);

  useEffect(() => {
    if (!firestoreLoaded) return;
    syncBrowserTournamentUrl(view, effectiveTournamentId, effectiveDivisionId, activePublicTab);
  }, [firestoreLoaded, view, effectiveTournamentId, effectiveDivisionId, activePublicTab]);

  const handleSelectTournament = (tid: string) => {
    setSelectedTournamentId(tid);
    const firstDiv = divisions.find((d) => d.tournamentId === tid);
    if (firstDiv) setSelectedDivisionId(firstDiv.id);
  };

  const handleEnterTournament = (tid: string) => {
    handleSelectTournament(tid);
    setActivePublicTab('resumen');
    setView('portal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFollowPlayer = (playerId: string) => {
    setFollowedPlayerIds((prev) => {
      const next = prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId];
      try {
        localStorage.setItem('playpy_followed_players', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  return (
    <ErrorBoundary scopeLabel="la aplicación">
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0A1633]">
        <TopBar
          view={view}
          activePublicTab={activePublicTab}
          onGoLanding={() => {
            setView('landing');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onSelectPublicTab={(tab) => {
            setActivePublicTab(tab);
            setView('portal');
          }}
          onToggleAdmin={() => setView((v) => (v === 'admin' ? 'landing' : 'admin'))}
          isAuthenticated={Boolean(user)}
          logoUrl={siteConfig.logoUrl}
          brandFirst={siteConfig.brandFirst}
          brandSecond={siteConfig.brandSecond}
        />

        <div className="flex-1">
          {view === 'landing' && (
            <ErrorBoundary scopeLabel="la portada principal" inline>
              <EntryLandingPage
                tournaments={tournaments}
                divisions={divisions}
                players={players}
                matches={matches}
                tournamentAds={tournamentAds}
                siteConfig={siteConfig}
                selectedTournamentId={effectiveTournamentId}
                onEnterTournament={handleEnterTournament}
                onOpenItfModal={() => setItfModalOpen(true)}
              />
            </ErrorBoundary>
          )}

          {view === 'portal' && (
            <ErrorBoundary scopeLabel="el portal público" inline>
              <Suspense fallback={<PortalSkeleton />}>
                <PublicPortal
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
                  activeTab={activePublicTab}
                  onSelectTab={setActivePublicTab}
                  onGoLanding={() => {
                    setView('landing');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  selectedTournamentId={effectiveTournamentId}
                  onSelectTournament={handleSelectTournament}
                  selectedDivisionId={effectiveDivisionId}
                  onSelectDivision={setSelectedDivisionId}
                  onOpenItfModal={() => setItfModalOpen(true)}
                  pushEnabled={pushEnabled}
                  onRequestPush={requestPushPermission}
                  followedPlayerIds={followedPlayerIds}
                  onToggleFollowPlayer={handleToggleFollowPlayer}
                  defaultTournamentCoverUrl={siteConfig.defaultTournamentCoverUrl}
                  logoUrl={siteConfig.logoUrl}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {view === 'admin' && (
            <ErrorBoundary scopeLabel="el panel de administración" inline>
              <Suspense fallback={<AdminSectionSkeleton />}>
                <AdminDashboard
                  user={user}
                  tournaments={tournaments}
                  divisions={divisions}
                  players={players}
                  registrations={registrations}
                  groups={groups}
                  matchdays={matchdays}
                  matches={matches}
                  publishedPhotos={photos}
                  notifications={notifications}
                  tournamentAds={tournamentAds}
                  tournamentTrophies={tournamentTrophies}
                  siteConfig={siteConfig}
                  selectedTournamentId={effectiveTournamentId}
                  onSelectTournament={handleSelectTournament}
                  selectedDivisionId={effectiveDivisionId}
                  onSelectDivision={setSelectedDivisionId}
                  onOpenItfModal={() => setItfModalOpen(true)}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        <footer className="border-t border-[#E2E8F0] bg-white py-5 px-4 sm:px-6 text-xs text-[#475569] mb-14 md:mb-0">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold font-display text-[#0A1633]">
                {siteConfig.brandFirst}
                <span className="text-[#7C1FA2]">{siteConfig.brandSecond}</span>
              </span>
              {siteConfig.footerTagline && <span>· {siteConfig.footerTagline}</span>}
            </div>
            <span>{siteConfig.footerRightText}</span>
          </div>
        </footer>

        {view !== 'admin' && (
          <MobileBottomNav
            view={view}
            activeTab={activePublicTab}
            onGoLanding={() => {
              setView('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectTab={(tab) => {
              setActivePublicTab(tab);
              setView('portal');
            }}
          />
        )}

        {itfModalOpen && (
          <Suspense fallback={<ModalSkeleton />}>
            <ItfReferenceModal open={itfModalOpen} onClose={() => setItfModalOpen(false)} />
          </Suspense>
        )}
        <LiveToastOverlay toasts={toasts} onDismiss={dismissToast} />
        <OfflineIndicator />
      </div>
    </ErrorBoundary>
  );
}
