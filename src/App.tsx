/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, testConnection } from './firebase';
import { buildDemoBundle } from './data/demoSeed';
import { mergeSiteLandingConfig, SITE_LANDING_DOC_ID } from './data/siteConfigDefaults';
import { subscribeCollection } from './services/firestoreService';
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
import { ItfReferenceModal } from './components/ItfReferenceModal';
import {
  AppView,
  LiveToastOverlay,
  MobileBottomNav,
  OfflineIndicator,
  PublicTab,
  TopBar,
} from './components/TopBarAndPWA';
import { EntryLandingPage } from './components/EntryLandingPage';
import { PublicPortal } from './components/PublicPortal';
import { AdminDashboard } from './components/AdminDashboard';
import { parseTournamentUrlParams, syncBrowserTournamentUrl } from './utils/tournamentLinks';

export default function App() {
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

  // Colecciones Firestore en tiempo real
  const [fsTournaments, setFsTournaments] = useState<Tournament[]>([]);
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
  const [fsSiteSettings, setFsSiteSettings] = useState<SiteLandingConfig[]>([]);
  const [firestoreLoaded, setFirestoreLoaded] = useState(false);

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
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));

    const unsubs = [
      subscribeCollection<Tournament>('tournaments', (data) => {
        setFsTournaments(data);
        setFirestoreLoaded(true);
      }),
      subscribeCollection<Division>('divisions', setFsDivisions),
      subscribeCollection<PlayerPublic>('players_public', setFsPlayers),
      subscribeCollection<Registration>('registrations', setFsRegistrations),
      subscribeCollection<Group>('groups', setFsGroups),
      subscribeCollection<Matchday>('matchdays', setFsMatchdays),
      subscribeCollection<Match>('matches', setFsMatches),
      subscribeCollection<MatchdayPhoto>('photos', setFsPhotos, true),
      subscribeCollection<NotificationAlert>('notifications', setFsNotifications),
      subscribeCollection<TournamentAd>('tournament_ads', setFsTournamentAds),
      subscribeCollection<TournamentTrophy>('tournament_trophies', setFsTournamentTrophies),
      subscribeCollection<SiteLandingConfig>('site_settings', setFsSiteSettings),
    ];

    return () => {
      unsubAuth();
      unsubs.forEach((u) => u());
    };
  }, []);

  // Si Firestore aún está vacío antes del primer login de admin, mostrar los torneos demo en modo lectura
  const useSeededFallback = firestoreLoaded && fsTournaments.length === 0;
  const tournaments = useSeededFallback ? demoFallback.tournaments : fsTournaments;
  const divisions = useSeededFallback ? demoFallback.divisions : fsDivisions;
  const players = useSeededFallback ? demoFallback.playersPublic : fsPlayers;
  const registrations = useSeededFallback ? demoFallback.registrations : fsRegistrations;
  const groups = useSeededFallback ? demoFallback.groups : fsGroups;
  const matchdays = useSeededFallback ? demoFallback.matchdays : fsMatchdays;
  const matches = useSeededFallback ? demoFallback.matches : fsMatches;
  const photos = useSeededFallback ? demoFallback.photos : fsPhotos;
  const notifications = useSeededFallback
    ? demoFallback.notifications
    : [...fsNotifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tournamentAds = useSeededFallback ? demoFallback.tournamentAds : fsTournamentAds;
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
    <ErrorBoundary>
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
          )}

          {view === 'portal' && (
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
          )}

          {view === 'admin' && (
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

        <ItfReferenceModal open={itfModalOpen} onClose={() => setItfModalOpen(false)} />
        <LiveToastOverlay toasts={toasts} onDismiss={dismissToast} />
        <OfflineIndicator />
      </div>
    </ErrorBoundary>
  );
}
