import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ClipboardCheck,
  Database,
  LogIn,
  LogOut,
  Shield,
  Shuffle,
  Trophy,
  Users,
} from 'lucide-react';
import { signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import {
  Division,
  Group,
  Match,
  Matchday,
  MatchdayPhoto,
  NotificationAlert,
  PlayerPrivate,
  PlayerPublic,
  Registration,
  StaffRole,
  Tournament,
  TournamentAd,
  UserRole,
} from '../types/tennis';
import {
  fetchAllPlayersPrivate,
  fetchDraftPhotosForAdmin,
  fetchStaffRole,
  seedDemoTournamentsToFirestore,
} from '../services/firestoreService';
import { AdminTournamentsSection } from './admin/AdminTournamentsSection';
import { AdminPlayersSection } from './admin/AdminPlayersSection';
import { AdminRegistrationsDrawSection } from './admin/AdminRegistrationsDrawSection';
import { AdminMatchdaysAndPhotosSection } from './admin/AdminMatchdaysAndPhotosSection';
import { AdminScoringAndRolesSection } from './admin/AdminScoringAndRolesSection';

type AdminTab = 'torneos' | 'jugadores' | 'inscripciones' | 'jornadas' | 'marcadores';

interface AdminDashboardProps {
  user: FirebaseUser | null;
  tournaments: Tournament[];
  divisions: Division[];
  players: PlayerPublic[];
  registrations: Registration[];
  groups: Group[];
  matchdays: Matchday[];
  matches: Match[];
  publishedPhotos: MatchdayPhoto[];
  notifications: NotificationAlert[];
  tournamentAds: TournamentAd[];
  selectedTournamentId: string;
  onSelectTournament: (id: string) => void;
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  onOpenItfModal: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  tournaments,
  divisions,
  players,
  registrations,
  groups,
  matchdays,
  matches,
  publishedPhotos,
  notifications,
  tournamentAds,
  selectedTournamentId,
  onSelectTournament,
  selectedDivisionId,
  onSelectDivision,
  onOpenItfModal,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('torneos');
  const [authError, setAuthError] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [allStaffRoles, setAllStaffRoles] = useState<StaffRole[]>([]);
  const [playersPrivate, setPlayersPrivate] = useState<Record<string, PlayerPrivate>>({});
  const [draftPhotos, setDraftPhotos] = useState<MatchdayPhoto[]>([]);
  const [seeding, setSeeding] = useState(false);

  const isBootstrappedSuperAdmin =
    Boolean(user?.emailVerified) && user?.email === 'elpatriota62@gmail.com';
  const effectiveRole: UserRole | null = isBootstrappedSuperAdmin
    ? 'superadmin'
    : staffRole?.role || null;

  const isSuperAdmin = effectiveRole === 'superadmin';
  const isOrganizerOrAbove = effectiveRole === 'superadmin' || effectiveRole === 'organizador';
  const isOperatorOrAbove = isOrganizerOrAbove || effectiveRole === 'operador';

  const loadStaffAndPrivateData = async (currentUser: FirebaseUser) => {
    const roleDoc = await fetchStaffRole(currentUser.uid);
    setStaffRole(roleDoc);

    // Auto-inicializar torneos demo en Firestore en el primer login de staff autorizado
    if (
      (currentUser.email === 'elpatriota62@gmail.com' && currentUser.emailVerified) ||
      roleDoc
    ) {
      await seedDemoTournamentsToFirestore(currentUser.uid, false).catch(() => false);
      const drafts = await fetchDraftPhotosForAdmin();
      setDraftPhotos(drafts);
      if (currentUser.email === 'elpatriota62@gmail.com') {
        try {
          const snap = await getDocs(collection(db, 'staff_roles'));
          setAllStaffRoles(snap.docs.map((d) => d.data() as StaffRole));
        } catch {
          // ignore
        }
      }
    }
  };

  useEffect(() => {
    if (user) {
      loadStaffAndPrivateData(user);
    } else {
      setStaffRole(null);
      setPlayersPrivate({});
      setDraftPhotos([]);
    }
  }, [user]);

  useEffect(() => {
    if (user && isOperatorOrAbove && players.length > 0) {
      fetchAllPlayersPrivate(players.map((p) => p.id)).then(setPlayersPrivate);
    }
  }, [user, isOperatorOrAbove, players]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `El dominio actual (${currentHost}) no está autorizado en Firebase Authentication. Agregalo en Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'El navegador bloqueó la ventana emergente de Google. Habilitá las ventanas emergentes para este sitio e intentá nuevamente.'
        );
      } else if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setAuthError('Se cerró la ventana de inicio de sesión antes de completar el ingreso.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Error de red al conectar con Google. Verificá tu conexión e intentá nuevamente.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      }
    }
  };

  const handleResetDemo = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await seedDemoTournamentsToFirestore(user.uid, true);
    } finally {
      setSeeding(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto my-12 px-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#7C1FA2] text-white flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-[#0A1633]">Panel Privado de Administración</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Iniciá sesión con Google para gestionar torneos, padrón privado de jugadores, sorteos,
            horarios, carga de marcadores ITF y galerías de fotos.
          </p>
          {authError && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {authError}
            </p>
          )}
          <button
            onClick={handleGoogleLogin}
            className="mt-6 w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7C1FA2] text-white text-sm font-semibold hover:bg-[#6B1A8B] transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Ingresar con Google
          </button>
        </div>
      </div>
    );
  }

  if (!isOperatorOrAbove) {
    return (
      <div className="max-w-lg mx-auto my-12 px-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-[#0A1633]">Acceso restringido al equipo</h2>
          <p className="mt-2 text-sm text-[#475569]">
            Tu cuenta (<strong>{user.email}</strong>) no tiene un rol de administrador, organizador
            u operador asignado todavía. Solicitá al superadministrador que habilite tu UID:
          </p>
          <p className="mt-3 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] font-mono text-xs break-all">
            {user.uid}
          </p>
          <button
            onClick={() => signOut(auth)}
            className="mt-5 px-4 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0A1633]"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const activeTournament = tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const tournamentDivisions = divisions.filter((d) => d.tournamentId === activeTournament?.id);
  const tournamentPlayers = players.filter((p) => p.tournamentId === activeTournament?.id);
  const activeDivision =
    tournamentDivisions.find((d) => d.id === selectedDivisionId) || tournamentDivisions[0];

  const divisionRegistrations = registrations.filter((r) => r.divisionId === activeDivision?.id);
  const divisionGroups = groups.filter((g) => g.divisionId === activeDivision?.id);
  const divisionMatchdays = matchdays
    .filter((md) => md.divisionId === activeDivision?.id)
    .sort((a, b) => a.order - b.order);
  const divisionMatches = matches.filter((m) => m.divisionId === activeDivision?.id);

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: 'torneos', label: 'Torneos y divisiones', icon: <Trophy className="w-4 h-4" />, show: isOrganizerOrAbove },
    { id: 'jugadores', label: 'Jugadores (PII)', icon: <Users className="w-4 h-4" />, show: isOrganizerOrAbove },
    { id: 'inscripciones', label: 'Inscripciones y sorteo', icon: <Shuffle className="w-4 h-4" />, show: isOrganizerOrAbove },
    { id: 'jornadas', label: 'Jornadas y fotos', icon: <Calendar className="w-4 h-4" />, show: isOrganizerOrAbove },
    { id: 'marcadores', label: 'Marcadores y roles', icon: <ClipboardCheck className="w-4 h-4" />, show: isOperatorOrAbove },
  ];

  // Si es solo operador, llevar directo a marcadores
  const currentTab = !isOrganizerOrAbove ? 'marcadores' : activeTab;

  const visibleNavItems = navItems.filter((i) => i.show);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-10">
      {/* Navegación y contexto compacto para móviles / tablets (< lg) */}
      <div className="lg:hidden space-y-3 mb-5">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E2E8F0]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#7C1FA2] capitalize">
                Perfil: {effectiveRole}
              </p>
              <p className="text-sm font-semibold text-[#0A1633] truncate">
                {user.displayName || user.email}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isSuperAdmin && (
                <button
                  onClick={handleResetDemo}
                  disabled={seeding}
                  title="Restaurar torneos demo"
                  className="min-h-[40px] px-2.5 rounded-lg border border-[#E2E8F0] text-xs text-[#475569] hover:text-[#0A1633] inline-flex items-center gap-1"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{seeding ? 'Sync...' : 'Demo'}</span>
                </button>
              )}
              <button
                onClick={() => signOut(auth)}
                className="min-h-[40px] px-2.5 rounded-lg border border-[#E2E8F0] text-xs text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Torneo en gestión
              </label>
              <select
                value={activeTournament?.id || ''}
                onChange={(e) => onSelectTournament(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                División activa
              </label>
              <select
                value={activeDivision?.id || ''}
                onChange={(e) => onSelectDivision(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {tournamentDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <nav
          aria-label="Secciones de administración"
          className="flex items-center gap-1.5 p-1 bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto clean-scroll"
        >
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
                currentTab === item.id
                  ? 'bg-[#7C1FA2] text-white'
                  : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0A1633]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar de Administración (solo desktop lg+) */}
        <aside className="hidden lg:block lg:w-64 shrink-0 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3 sticky top-20">
            <div className="pb-3 border-b border-[#E2E8F0]">
              <p className="text-xs font-medium text-[#7C1FA2] capitalize">Perfil: {effectiveRole}</p>
              <p className="text-sm font-semibold text-[#0A1633] truncate mt-0.5">
                {user.displayName || user.email}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Torneo en gestión
              </label>
              <select
                value={activeTournament?.id || ''}
                onChange={(e) => onSelectTournament(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                División activa
              </label>
              <select
                value={activeDivision?.id || ''}
                onChange={(e) => onSelectDivision(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {tournamentDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <nav className="space-y-1 pt-2">
              {visibleNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors min-h-[40px] ${
                    currentTab === item.id
                      ? 'bg-[#7C1FA2] text-white'
                      : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0A1633]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
              {isSuperAdmin && (
                <button
                  onClick={handleResetDemo}
                  disabled={seeding}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs text-[#475569] hover:text-[#0A1633]"
                >
                  <Database className="w-3.5 h-3.5" />
                  {seeding ? 'Sincronizando...' : 'Restaurar torneos demo'}
                </button>
              )}
              <button
                onClick={() => signOut(auth)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        {/* Área de Trabajo Principal */}
        <div className="flex-1 min-w-0">
          {currentTab === 'torneos' && (
            <AdminTournamentsSection
              tournaments={tournaments}
              divisions={divisions}
              players={players}
              registrations={registrations}
              groups={groups}
              matchdays={matchdays}
              matches={matches}
              publishedPhotos={publishedPhotos}
              draftPhotos={draftPhotos}
              notifications={notifications}
              tournamentAds={tournamentAds}
              selectedTournamentId={activeTournament?.id || ''}
              onSelectTournament={onSelectTournament}
              selectedDivisionId={activeDivision?.id || ''}
              onSelectDivision={onSelectDivision}
              currentUid={user.uid}
              isSuperAdmin={isSuperAdmin}
              onOpenItfModal={onOpenItfModal}
            />
          )}

          {currentTab === 'jugadores' && (
            <AdminPlayersSection
              tournament={activeTournament || null}
              divisions={tournamentDivisions}
              playersPublic={tournamentPlayers}
              playersPrivate={playersPrivate}
              registrations={registrations}
              isSuperAdmin={isSuperAdmin}
              onRefreshPrivate={async (ids) => {
                const fetched = await fetchAllPlayersPrivate(ids);
                setPlayersPrivate((prev) => ({ ...prev, ...fetched }));
              }}
            />
          )}

          {currentTab === 'inscripciones' && activeDivision && (
            <AdminRegistrationsDrawSection
              division={activeDivision}
              allDivisions={divisions}
              players={tournamentPlayers}
              registrations={divisionRegistrations}
              allRegistrations={registrations}
              groups={divisionGroups}
              matches={divisionMatches}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {currentTab === 'jornadas' && activeTournament && activeDivision && (
            <AdminMatchdaysAndPhotosSection
              tournament={activeTournament}
              tournaments={tournaments}
              division={activeDivision}
              matchdays={divisionMatchdays}
              divisionMatches={divisionMatches}
              allMatches={matches}
              publishedPhotos={publishedPhotos}
              draftPhotos={draftPhotos}
              onDraftPhotosChange={setDraftPhotos}
              userEmail={user.email || 'staff'}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {currentTab === 'marcadores' && activeTournament && activeDivision && (
            <AdminScoringAndRolesSection
              tournament={activeTournament}
              division={activeDivision}
              divisionMatches={divisionMatches}
              allMatches={matches}
              allDivisions={divisions}
              divisionGroups={divisionGroups}
              divisionRegistrations={divisionRegistrations}
              allRegistrations={registrations}
              players={tournamentPlayers}
              userEmail={user.email || 'staff'}
              isSuperAdmin={isSuperAdmin}
              staffRoles={allStaffRoles}
              onRefreshStaffRoles={async () => {
                const snap = await getDocs(collection(db, 'staff_roles'));
                setAllStaffRoles(snap.docs.map((d) => d.data() as StaffRole));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
