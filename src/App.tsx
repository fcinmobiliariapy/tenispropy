/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, testConnection } from './firebase';
import { buildDemoBundle } from './data/demoSeed';
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
  Tournament,
  TournamentAd,
} from './types/tennis';
import { useRealtimePush } from './hooks/usePWA';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ItfReferenceModal } from './components/ItfReferenceModal';
import {
  LiveToastOverlay,
  MobileBottomNav,
  OfflineIndicator,
  PublicTab,
  TopBar,
} from './components/TopBarAndPWA';
import { PublicPortal } from './components/PublicPortal';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  const demoFallback = useMemo(() => buildDemoBundle(), []);

  const [mode, setMode] = useState<'public' | 'admin'>('public');
  const [activePublicTab, setActivePublicTab] = useState<PublicTab>('resumen');
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
  const [firestoreLoaded, setFirestoreLoaded] = useState(false);

  // Seguimiento de jugadores para notificaciones push
  const [followedPlayerIds, setFollowedPlayerIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('teniscupy_followed_players');
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

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(
    'torneo_copa_asuncion_2026'
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('div_5ta_singles_masc');

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

  const handleToggleFollowPlayer = (playerId: string) => {
    setFollowedPlayerIds((prev) => {
      const next = prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId];
      try {
        localStorage.setItem('teniscupy_followed_players', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#F8F9F8] text-[#0F1A15]">
        <TopBar
          mode={mode}
          activePublicTab={activePublicTab}
          onSelectPublicTab={setActivePublicTab}
          onToggleMode={() => setMode((m) => (m === 'public' ? 'admin' : 'public'))}
          isAuthenticated={Boolean(user)}
        />

        <div className="flex-1">
          {mode === 'public' ? (
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
              activeTab={activePublicTab}
              onSelectTab={setActivePublicTab}
              selectedTournamentId={effectiveTournamentId}
              onSelectTournament={(tid) => {
                setSelectedTournamentId(tid);
                const firstDiv = divisions.find((d) => d.tournamentId === tid);
                if (firstDiv) setSelectedDivisionId(firstDiv.id);
              }}
              selectedDivisionId={effectiveDivisionId}
              onSelectDivision={setSelectedDivisionId}
              onOpenItfModal={() => setItfModalOpen(true)}
              pushEnabled={pushEnabled}
              onRequestPush={requestPushPermission}
              followedPlayerIds={followedPlayerIds}
              onToggleFollowPlayer={handleToggleFollowPlayer}
            />
          ) : (
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
              selectedTournamentId={effectiveTournamentId}
              onSelectTournament={(tid) => {
                setSelectedTournamentId(tid);
                const firstDiv = divisions.find((d) => d.tournamentId === tid);
                if (firstDiv) setSelectedDivisionId(firstDiv.id);
              }}
              selectedDivisionId={effectiveDivisionId}
              onSelectDivision={setSelectedDivisionId}
              onOpenItfModal={() => setItfModalOpen(true)}
            />
          )}
        </div>

        <footer className="border-t border-[#E2E7E4] bg-white py-5 px-4 sm:px-6 text-xs text-[#4A5550] mb-14 md:mb-0">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-medium text-[#0F1A15]">TenisCupy</span>
            <span>
              Gestión de torneos de tenis · Zona horaria America/Asuncion · Reglas ITF 2026
            </span>
          </div>
        </footer>

        {mode === 'public' && (
          <MobileBottomNav
            activeTab={activePublicTab}
            onSelectTab={setActivePublicTab}
          />
        )}

        <ItfReferenceModal open={itfModalOpen} onClose={() => setItfModalOpen(false)} />
        <LiveToastOverlay toasts={toasts} onDismiss={dismissToast} />
        <OfflineIndicator />
      </div>
    </ErrorBoundary>
  );
}
