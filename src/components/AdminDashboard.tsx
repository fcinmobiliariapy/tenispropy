import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileImage,
  LayoutTemplate,
  LogIn,
  LogOut,
  QrCode,
  Shield,
  Shuffle,
  Trash2,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import { signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
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
  SiteLandingConfig,
  StaffInvite,
  StaffRole,
  Tournament,
  TournamentAd,
  TournamentTrophy,
  UserRole,
} from '../types/tennis';
import {
  analyzeDuplicateMatches,
  analyzeEliminationDiagnostics,
} from '../utils/tournamentEngine';
import {
  canUserAccessTournament,
  resolveEffectivePermissions,
  ROLE_LABELS,
} from '../utils/rbac';
import {
  claimStaffInvite,
  deleteMatchesBatch,
  fetchAllPlayersPrivate,
  fetchAllStaffRoles,
  fetchDraftPhotosForAdmin,
  fetchStaffInvites,
  fetchStaffRole,
  findStaffInviteByEmail,
  seedDemoTournamentsToFirestore,
} from '../services/firestoreService';
import { AdminTournamentsSection } from './admin/AdminTournamentsSection';
import { AdminPlayersSection } from './admin/AdminPlayersSection';
import { AdminRegistrationsDrawSection } from './admin/AdminRegistrationsDrawSection';
import { AdminMatchdaysAndPhotosSection } from './admin/AdminMatchdaysAndPhotosSection';
import { AdminScoringAndRolesSection } from './admin/AdminScoringAndRolesSection';
import { AdminEliminationDiagnosticPanel } from './admin/AdminEliminationDiagnosticPanel';
import { AdminLandingPageSection } from './admin/AdminLandingPageSection';
import { AdminUsersPermissionsSection } from './admin/AdminUsersPermissionsSection';
import { TournamentQrModal } from './TournamentQrModal';
import { MatchupsFlyerModal } from './MatchupsFlyerModal';

type AdminTab =
  | 'torneos'
  | 'jugadores'
  | 'inscripciones'
  | 'jornadas'
  | 'marcadores'
  | 'diagnostico'
  | 'pagina_principal'
  | 'usuarios';

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
  tournamentTrophies: TournamentTrophy[];
  siteConfig: SiteLandingConfig;
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
  tournamentTrophies,
  siteConfig,
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
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [playersPrivate, setPlayersPrivate] = useState<Record<string, PlayerPrivate>>({});
  const [draftPhotos, setDraftPhotos] = useState<MatchdayPhoto[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [duplicateCleanupFeedback, setDuplicateCleanupFeedback] = useState<string | null>(null);
  const [duplicateCleanupError, setDuplicateCleanupError] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [flyerModalOpen, setFlyerModalOpen] = useState(false);

  const normalizedEmail = (user?.email || '').trim().toLowerCase();
  const isBootstrappedSuperAdmin =
    Boolean(user?.emailVerified) && normalizedEmail === 'elpatriota62@gmail.com';
  const effectiveRole: UserRole | null = isBootstrappedSuperAdmin
    ? 'superadmin'
    : staffRole?.role || null;

  const isSuperAdmin = effectiveRole === 'superadmin';
  const effectivePermissions = useMemo(
    () => resolveEffectivePermissions(staffRole, isBootstrappedSuperAdmin),
    [staffRole, isBootstrappedSuperAdmin]
  );

  const refreshUsersList = async () => {
    const [rolesList, invitesList] = await Promise.all([
      fetchAllStaffRoles().catch(() => []),
      fetchStaffInvites().catch(() => []),
    ]);
    setAllStaffRoles(rolesList);
    setStaffInvites(invitesList);
  };

  const loadStaffAndPrivateData = async (currentUser: FirebaseUser) => {
    let roleDoc = await fetchStaffRole(currentUser.uid);

    if (!roleDoc && currentUser.emailVerified && currentUser.email) {
      try {
        const invite = await findStaffInviteByEmail(currentUser.email);
        if (invite && invite.active !== false && !invite.claimedUid) {
          roleDoc = await claimStaffInvite(currentUser, invite);
        }
      } catch {
        // Sin invitación válida o pendiente
      }
    }

    setStaffRole(roleDoc);

    const currentEmail = (currentUser.email || '').trim().toLowerCase();
    const bootstrapped = currentEmail === 'elpatriota62@gmail.com' && currentUser.emailVerified;
    const resolvedPerms = resolveEffectivePermissions(roleDoc, bootstrapped);

    if (bootstrapped || resolvedPerms) {
      await seedDemoTournamentsToFirestore(currentUser.uid, false).catch(() => false);
      const drafts = await fetchDraftPhotosForAdmin();
      setDraftPhotos(drafts);
      if (bootstrapped || resolvedPerms?.manageUsers) {
        await refreshUsersList();
      } else {
        setAllStaffRoles([]);
        setStaffInvites([]);
      }
    } else {
      setAllStaffRoles([]);
      setStaffInvites([]);
    }
  };

  useEffect(() => {
    if (user) {
      loadStaffAndPrivateData(user);
    } else {
      setStaffRole(null);
      setAllStaffRoles([]);
      setStaffInvites([]);
      setPlayersPrivate({});
      setDraftPhotos([]);
    }
  }, [user]);

  useEffect(() => {
    if (user && effectivePermissions?.managePlayers && players.length > 0) {
      fetchAllPlayersPrivate(players.map((p) => p.id)).then(setPlayersPrivate);
    }
  }, [user, effectivePermissions?.managePlayers, players]);

  const accessibleTournaments = useMemo(
    () =>
      tournaments.filter((t) =>
        canUserAccessTournament(staffRole, isBootstrappedSuperAdmin, t.id)
      ),
    [tournaments, staffRole, isBootstrappedSuperAdmin]
  );

  const duplicateAnalysis = useMemo(() => analyzeDuplicateMatches(matches), [matches]);

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
            horarios, carga de marcadores ITF, usuarios y galerías de fotos.
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

  if (!isBootstrappedSuperAdmin && staffRole && staffRole.active === false) {
    return (
      <div className="max-w-lg mx-auto my-12 px-4">
        <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-[#0A1633]">Acceso suspendido temporalmente</h2>
          <p className="mt-2 text-sm text-[#475569]">
            Tu perfil administrativo (<strong>{user.email}</strong>) fue pausado por un
            administrador. Solicitá la reactivación para continuar operando.
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

  if (!effectivePermissions) {
    return (
      <div className="max-w-lg mx-auto my-12 px-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-[#0A1633]">Acceso restringido al equipo</h2>
          <p className="mt-2 text-sm text-[#475569]">
            Tu cuenta (<strong>{user.email}</strong>) no tiene un rol administrativo asignado
            todavía. Solicitá al administrador que te pre-autorice por correo o habilite tu UID:
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

  const activeTournament =
    accessibleTournaments.find((t) => t.id === selectedTournamentId) || accessibleTournaments[0];
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
  const tournamentMatches = activeTournament
    ? matches.filter((m) => m.tournamentId === activeTournament.id)
    : [];
  const tournamentMatchdays = activeTournament
    ? matchdays.filter((md) => md.tournamentId === activeTournament.id)
    : [];

  const handleCleanupDuplicateMatches = async () => {
    if (
      (!isSuperAdmin && !effectivePermissions.canDelete) ||
      duplicateAnalysis.duplicateMatches.length === 0
    ) {
      return;
    }
    setCleaningDuplicates(true);
    setDuplicateCleanupError(null);
    setDuplicateCleanupFeedback(null);
    try {
      const targetIds = duplicateAnalysis.duplicateMatches.map((m) => m.id);
      await deleteMatchesBatch(targetIds);
      setDuplicateCleanupFeedback(
        `Se eliminaron ${targetIds.length} ${
          targetIds.length === 1 ? 'partido duplicado' : 'partidos duplicados'
        } conservando los resultados y programaciones válidas.`
      );
    } catch (err) {
      setDuplicateCleanupError(
        err instanceof Error
          ? err.message
          : 'No se pudieron eliminar los partidos duplicados en Firestore.'
      );
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const tournamentDiagnosticIssuesCount = tournamentDivisions.reduce((acc, d) => {
    const divM = tournamentMatches.filter((m) => m.divisionId === d.id);
    return acc + analyzeEliminationDiagnostics(d, divM).summary.totalIssues;
  }, 0);

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    show: boolean;
    badgeCount?: number;
  }> = [
    {
      id: 'torneos',
      label: 'Torneos y divisiones',
      icon: <Trophy className="w-4 h-4" />,
      show: effectivePermissions.manageTournaments,
    },
    {
      id: 'jugadores',
      label: 'Jugadores (PII)',
      icon: <Users className="w-4 h-4" />,
      show: effectivePermissions.managePlayers,
    },
    {
      id: 'inscripciones',
      label: 'Inscripciones y sorteo',
      icon: <Shuffle className="w-4 h-4" />,
      show: effectivePermissions.manageDraws && Boolean(activeDivision),
    },
    {
      id: 'jornadas',
      label: 'Jornadas y fotos',
      icon: <Calendar className="w-4 h-4" />,
      show:
        effectivePermissions.manageScheduleAndMedia &&
        Boolean(activeTournament && activeDivision),
    },
    {
      id: 'marcadores',
      label: 'Marcadores oficiales',
      icon: <ClipboardCheck className="w-4 h-4" />,
      show: effectivePermissions.manageScoring && Boolean(activeTournament && activeDivision),
    },
    {
      id: 'diagnostico',
      label: 'Diagnóstico de cuadro',
      icon: <Activity className="w-4 h-4" />,
      show:
        (effectivePermissions.manageScoring || effectivePermissions.manageDraws) &&
        Boolean(activeTournament && activeDivision),
      badgeCount: tournamentDiagnosticIssuesCount,
    },
    {
      id: 'pagina_principal',
      label: 'Página principal',
      icon: <LayoutTemplate className="w-4 h-4" />,
      show: effectivePermissions.manageLandingPage,
    },
    {
      id: 'usuarios',
      label: 'Usuarios y permisos',
      icon: <UserCog className="w-4 h-4" />,
      show: Boolean(isSuperAdmin || effectivePermissions.manageUsers),
    },
  ];

  const visibleNavItems = navItems.filter((i) => i.show);
  const currentTab: AdminTab = visibleNavItems.some((i) => i.id === activeTab)
    ? activeTab
    : visibleNavItems[0]?.id || 'torneos';

  const roleBadgeLabel = effectiveRole ? ROLE_LABELS[effectiveRole] : 'Staff';
  const canDeleteAnyMatch = Boolean(isSuperAdmin || effectivePermissions.canDelete);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-10">
      {/* Navegación y contexto compacto para móviles / tablets (< lg) */}
      <div className="lg:hidden space-y-3 mb-5">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E2E8F0]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#7C1FA2]">
                Perfil: {roleBadgeLabel}
              </p>
              <p className="text-sm font-semibold text-[#0A1633] truncate">
                {user.displayName || user.email}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeTournament && (
                <>
                  <button
                    type="button"
                    onClick={() => setQrModalOpen(true)}
                    title="Link directo y QR del torneo"
                    className="min-h-[40px] px-2.5 rounded-lg border border-[#E2E8F0] text-xs text-[#0A1633] hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    <span className="hidden sm:inline">QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlyerModalOpen(true)}
                    title="Flyer de cruces de partidos"
                    className="min-h-[40px] px-2.5 rounded-lg border border-[#E2E8F0] text-xs text-[#0A1633] hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <FileImage className="w-3.5 h-3.5 text-[#0095FF]" />
                    <span className="hidden sm:inline">Flyer</span>
                  </button>
                </>
              )}
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
                Torneo en gestión ({accessibleTournaments.length})
              </label>
              <select
                value={activeTournament?.id || ''}
                onChange={(e) => onSelectTournament(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {accessibleTournaments.length === 0 ? (
                  <option value="">Sin torneos asignados</option>
                ) : (
                  accessibleTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
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
                {tournamentDivisions.length === 0 ? (
                  <option value="">Sin divisiones</option>
                ) : (
                  tournamentDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                )}
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
              {Boolean(item.badgeCount && item.badgeCount > 0) && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    currentTab === item.id
                      ? 'bg-white/25 text-white'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  {item.badgeCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar de Administración (solo desktop lg+) */}
        <aside className="hidden lg:block lg:w-64 shrink-0 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3 sticky top-20">
            <div className="pb-3 border-b border-[#E2E8F0]">
              <p className="text-xs font-medium text-[#7C1FA2]">Perfil: {roleBadgeLabel}</p>
              <p className="text-sm font-semibold text-[#0A1633] truncate mt-0.5">
                {user.displayName || user.email}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Torneo en gestión ({accessibleTournaments.length})
              </label>
              <select
                value={activeTournament?.id || ''}
                onChange={(e) => onSelectTournament(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
              >
                {accessibleTournaments.length === 0 ? (
                  <option value="">Sin torneos asignados</option>
                ) : (
                  accessibleTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
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
                {tournamentDivisions.length === 0 ? (
                  <option value="">Sin divisiones</option>
                ) : (
                  tournamentDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                )}
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
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {Boolean(item.badgeCount && item.badgeCount > 0) && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        currentTab === item.id
                          ? 'bg-white/25 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {activeTournament && (
              <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633] hover:bg-slate-100"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#7C1FA2]" />
                  <span>Link y QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlyerModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633] hover:bg-slate-100"
                >
                  <FileImage className="w-3.5 h-3.5 text-[#0095FF]" />
                  <span>Flyer</span>
                </button>
              </div>
            )}

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
        <div className="flex-1 min-w-0 space-y-5">
          {duplicateCleanupFeedback && duplicateAnalysis.duplicateMatches.length === 0 && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs font-medium text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{duplicateCleanupFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateCleanupFeedback(null)}
                className="text-[11px] font-semibold underline shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}

          {duplicateAnalysis.duplicateMatches.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-950">
                      Se detectaron {duplicateAnalysis.duplicateMatches.length}{' '}
                      {duplicateAnalysis.duplicateMatches.length === 1
                        ? 'partido duplicado'
                        : 'partidos duplicados'}{' '}
                      en {duplicateAnalysis.groups.length}{' '}
                      {duplicateAnalysis.groups.length === 1 ? 'cruce' : 'cruces'}
                    </h3>
                    <p className="text-xs text-amber-900 mt-0.5">
                      Al limpiar, se conservarán automáticamente los partidos con resultados, sets
                      cargados o programación asignada y se borrarán las copias redundantes.
                    </p>
                  </div>
                </div>
                {canDeleteAnyMatch ? (
                  <button
                    type="button"
                    onClick={handleCleanupDuplicateMatches}
                    disabled={cleaningDuplicates}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold hover:bg-red-800 disabled:opacity-60 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {cleaningDuplicates
                      ? 'Eliminando duplicados...'
                      : `Eliminar ${duplicateAnalysis.duplicateMatches.length} duplicados`}
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-amber-900 bg-white/80 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Solicitá a un perfil con permiso de eliminación ejecutar la limpieza.
                  </span>
                )}
              </div>
              {duplicateCleanupError && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {duplicateCleanupError}
                </p>
              )}
            </div>
          )}

          {visibleNavItems.length === 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              Tu perfil actual no tiene módulos habilitados o competencias asignadas todavía.
            </div>
          )}

          {currentTab === 'torneos' && effectivePermissions.manageTournaments && (
            <AdminTournamentsSection
              tournaments={accessibleTournaments}
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
              tournamentTrophies={tournamentTrophies}
              selectedTournamentId={activeTournament?.id || ''}
              onSelectTournament={onSelectTournament}
              selectedDivisionId={activeDivision?.id || ''}
              onSelectDivision={onSelectDivision}
              currentUid={user.uid}
              isSuperAdmin={isSuperAdmin}
              permissions={effectivePermissions}
              onOpenItfModal={onOpenItfModal}
              onOpenQrModal={() => setQrModalOpen(true)}
              onOpenFlyerModal={() => setFlyerModalOpen(true)}
            />
          )}

          {currentTab === 'jugadores' && effectivePermissions.managePlayers && (
            <AdminPlayersSection
              tournament={activeTournament || null}
              divisions={tournamentDivisions}
              playersPublic={tournamentPlayers}
              playersPrivate={playersPrivate}
              registrations={registrations}
              isSuperAdmin={isSuperAdmin}
              permissions={effectivePermissions}
              onRefreshPrivate={async (ids) => {
                const fetched = await fetchAllPlayersPrivate(ids);
                setPlayersPrivate((prev) => ({ ...prev, ...fetched }));
              }}
            />
          )}

          {currentTab === 'inscripciones' && activeDivision && effectivePermissions.manageDraws && (
            <AdminRegistrationsDrawSection
              division={activeDivision}
              divisions={tournamentDivisions}
              onSelectDivision={onSelectDivision}
              allDivisions={divisions}
              players={tournamentPlayers}
              registrations={divisionRegistrations}
              allRegistrations={registrations}
              groups={divisionGroups}
              matches={divisionMatches}
              isSuperAdmin={isSuperAdmin}
              permissions={effectivePermissions}
            />
          )}

          {currentTab === 'jornadas' &&
            activeTournament &&
            activeDivision &&
            effectivePermissions.manageScheduleAndMedia && (
              <AdminMatchdaysAndPhotosSection
                tournament={activeTournament}
                tournaments={accessibleTournaments}
                division={activeDivision}
                divisions={tournamentDivisions}
                onSelectDivision={onSelectDivision}
                matchdays={divisionMatchdays}
                divisionMatches={divisionMatches}
                allMatches={matches}
                publishedPhotos={publishedPhotos}
                draftPhotos={draftPhotos}
                onDraftPhotosChange={setDraftPhotos}
                userEmail={user.email || 'staff'}
                isSuperAdmin={isSuperAdmin}
                permissions={effectivePermissions}
                onOpenFlyerModal={() => setFlyerModalOpen(true)}
              />
            )}

          {currentTab === 'marcadores' &&
            activeTournament &&
            activeDivision &&
            effectivePermissions.manageScoring && (
              <AdminScoringAndRolesSection
                tournament={activeTournament}
                division={activeDivision}
                divisions={tournamentDivisions}
                onSelectDivision={onSelectDivision}
                divisionMatches={divisionMatches}
                tournamentMatches={tournamentMatches}
                allMatches={matches}
                allDivisions={divisions}
                divisionGroups={divisionGroups}
                allGroups={groups}
                divisionRegistrations={divisionRegistrations}
                allRegistrations={registrations}
                players={tournamentPlayers}
                userEmail={user.email || 'staff'}
                isSuperAdmin={isSuperAdmin}
                permissions={effectivePermissions}
                canOpenUsersTab={Boolean(isSuperAdmin || effectivePermissions.manageUsers)}
                onOpenUsersTab={() => setActiveTab('usuarios')}
                onOpenDiagnosticTab={() => setActiveTab('diagnostico')}
              />
            )}

          {currentTab === 'diagnostico' &&
            activeTournament &&
            activeDivision &&
            (effectivePermissions.manageScoring || effectivePermissions.manageDraws) && (
              <AdminEliminationDiagnosticPanel
                tournament={activeTournament}
                division={activeDivision}
                divisions={tournamentDivisions}
                onSelectDivision={onSelectDivision}
                divisionMatches={divisionMatches}
                tournamentMatches={tournamentMatches}
                allMatches={matches}
                allDivisions={divisions}
                allGroups={groups}
                divisionRegistrations={divisionRegistrations}
                allRegistrations={registrations}
                players={tournamentPlayers}
                userEmail={user.email || 'staff'}
                isSuperAdmin={isSuperAdmin}
                permissions={effectivePermissions}
                onOpenScoringTab={() => setActiveTab('marcadores')}
              />
            )}

          {currentTab === 'pagina_principal' && effectivePermissions.manageLandingPage && (
            <AdminLandingPageSection
              siteConfig={siteConfig}
              tournaments={accessibleTournaments}
              userEmail={user.email || 'staff'}
              isSuperAdmin={isSuperAdmin}
              permissions={effectivePermissions}
            />
          )}

          {currentTab === 'usuarios' && (isSuperAdmin || effectivePermissions.manageUsers) && (
            <AdminUsersPermissionsSection
              tournaments={isSuperAdmin ? tournaments : accessibleTournaments}
              staffRoles={allStaffRoles}
              staffInvites={staffInvites}
              currentUserUid={user.uid}
              currentUserEmail={user.email || ''}
              isBootstrappedSuperAdmin={isBootstrappedSuperAdmin}
              canCreate={Boolean(isSuperAdmin || effectivePermissions.canCreate)}
              canEdit={Boolean(isSuperAdmin || effectivePermissions.canEdit)}
              canDelete={Boolean(isSuperAdmin || effectivePermissions.canDelete)}
              onRefreshUsers={refreshUsersList}
            />
          )}
        </div>
      </div>

      {activeTournament && (
        <>
          <TournamentQrModal
            open={qrModalOpen}
            onClose={() => setQrModalOpen(false)}
            tournament={activeTournament}
            divisions={tournamentDivisions}
            defaultDivisionId={activeDivision?.id}
            logoUrl={siteConfig.logoUrl}
          />
          <MatchupsFlyerModal
            open={flyerModalOpen}
            onClose={() => setFlyerModalOpen(false)}
            tournament={activeTournament}
            divisions={tournamentDivisions}
            matches={tournamentMatches}
            matchdays={tournamentMatchdays}
            defaultDivisionId={activeDivision?.id}
            logoUrl={siteConfig.logoUrl}
          />
        </>
      )}
    </div>
  );
};
