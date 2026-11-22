import { StaffPermissions, StaffRole, UserRole } from '../types/tennis';

export const BOOTSTRAPPED_SUPERADMIN_EMAIL = 'elpatriota62@gmail.com';

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadministrador',
  organizador: 'Organizador',
  operador: 'Operador de resultados',
  editor: 'Editor de contenido',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  superadmin:
    'Control total de la plataforma, parámetros globales, usuarios, roles y todas las competencias.',
  organizador:
    'Administra las competencias asignadas: divisiones, jugadores, sorteos, programación y marcadores.',
  operador:
    'Carga y corrige marcadores ITF en cancha y gestiona horarios asignados.',
  editor:
    'Gestiona la página principal, portadas, flyers, jornadas y galerías fotográficas.',
};

export const FULL_PERMISSIONS: StaffPermissions = {
  canCreate: true,
  canEdit: true,
  canDelete: true,
  manageTournaments: true,
  managePlayers: true,
  manageDraws: true,
  manageScheduleAndMedia: true,
  manageScoring: true,
  manageLandingPage: true,
  manageParameters: true,
  manageUsers: true,
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<UserRole, StaffPermissions> = {
  superadmin: { ...FULL_PERMISSIONS },
  organizador: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    manageTournaments: true,
    managePlayers: true,
    manageDraws: true,
    manageScheduleAndMedia: true,
    manageScoring: true,
    manageLandingPage: false,
    manageParameters: true,
    manageUsers: false,
  },
  operador: {
    canCreate: false,
    canEdit: true,
    canDelete: false,
    manageTournaments: false,
    managePlayers: false,
    manageDraws: false,
    manageScheduleAndMedia: true,
    manageScoring: true,
    manageLandingPage: false,
    manageParameters: false,
    manageUsers: false,
  },
  editor: {
    canCreate: true,
    canEdit: true,
    canDelete: false,
    manageTournaments: false,
    managePlayers: false,
    manageDraws: false,
    manageScheduleAndMedia: true,
    manageScoring: false,
    manageLandingPage: true,
    manageParameters: false,
    manageUsers: false,
  },
};

export const ABM_PERMISSION_FIELDS: Array<{
  key: keyof Pick<StaffPermissions, 'canCreate' | 'canEdit' | 'canDelete'>;
  label: string;
  description: string;
}> = [
  {
    key: 'canCreate',
    label: 'Alta (Crear)',
    description: 'Dar de alta torneos, divisiones, jugadores, inscripciones, jornadas, fotos y flyers.',
  },
  {
    key: 'canEdit',
    label: 'Modificación (Editar)',
    description: 'Editar registros existentes, reprogramar horarios, publicar sorteos y confirmar marcadores.',
  },
  {
    key: 'canDelete',
    label: 'Baja (Eliminar)',
    description: 'Eliminar partidos, inscripciones, jugadores, jornadas, publicidades o torneos.',
  },
];

export const MODULE_PERMISSION_FIELDS: Array<{
  key: keyof Omit<StaffPermissions, 'canCreate' | 'canEdit' | 'canDelete'>;
  label: string;
  description: string;
}> = [
  {
    key: 'manageTournaments',
    label: 'Torneos, Divisiones y Sponsors',
    description: 'Acceso a crear/editar competencias, canchas, publicidades IA y trofeos.',
  },
  {
    key: 'managePlayers',
    label: 'Padrón de Jugadores (PII)',
    description: 'Acceso a fichas personales privadas (documento, teléfono, correo) y carga masiva.',
  },
  {
    key: 'manageDraws',
    label: 'Inscripciones y Sorteos',
    description: 'Control de cupos, cabezas de serie, grupos y cuadros de eliminación directa.',
  },
  {
    key: 'manageScheduleAndMedia',
    label: 'Jornadas, Horarios y Galerías',
    description: 'Programación de canchas, notificaciones push, galerías de fotos y flyers.',
  },
  {
    key: 'manageScoring',
    label: 'Marcadores y Resultados',
    description: 'Carga oficial de sets ITF, W.O., retiros y correcciones con historial.',
  },
  {
    key: 'manageParameters',
    label: 'Parámetros de Competencia',
    description: 'Configuración de reglas ITF por división, criterios de desempate y QR/Links.',
  },
  {
    key: 'manageLandingPage',
    label: 'Parámetros de Página Principal',
    description: 'Edición del logo, textos, métricas, pilares y banner adaptativo global de PlayPy.',
  },
  {
    key: 'manageUsers',
    label: 'Usuarios, Roles y Permisos',
    description: 'Alta, baja, modificación de usuarios del equipo y asignación de competencias.',
  },
];

export function normalizePermissions(
  role: UserRole,
  partial?: Partial<StaffPermissions> | null
): StaffPermissions {
  if (role === 'superadmin') {
    return { ...FULL_PERMISSIONS };
  }
  const base = DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.operador;
  return {
    canCreate: partial?.canCreate ?? base.canCreate,
    canEdit: partial?.canEdit ?? base.canEdit,
    canDelete: partial?.canDelete ?? base.canDelete,
    manageTournaments: partial?.manageTournaments ?? base.manageTournaments,
    managePlayers: partial?.managePlayers ?? base.managePlayers,
    manageDraws: partial?.manageDraws ?? base.manageDraws,
    manageScheduleAndMedia: partial?.manageScheduleAndMedia ?? base.manageScheduleAndMedia,
    manageScoring: partial?.manageScoring ?? base.manageScoring,
    manageLandingPage: partial?.manageLandingPage ?? base.manageLandingPage,
    manageParameters: partial?.manageParameters ?? base.manageParameters,
    manageUsers: partial?.manageUsers ?? base.manageUsers,
  };
}

export function resolveEffectivePermissions(
  staffRole: StaffRole | null,
  isBootstrappedSuperAdmin: boolean
): StaffPermissions | null {
  if (isBootstrappedSuperAdmin) {
    return { ...FULL_PERMISSIONS };
  }
  if (!staffRole || staffRole.active === false) {
    return null;
  }
  return normalizePermissions(staffRole.role, staffRole.permissions);
}

export function canUserAccessTournament(
  staffRole: StaffRole | null,
  isBootstrappedSuperAdmin: boolean,
  tournamentId: string
): boolean {
  if (isBootstrappedSuperAdmin) return true;
  if (!staffRole || staffRole.active === false) return false;
  if (staffRole.role === 'superadmin' || staffRole.allTournaments) return true;
  return staffRole.assignedTournamentIds.includes(tournamentId);
}

export function buildStaffInviteId(email: string): string {
  const lower = email.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < lower.length; i++) {
    hash ^= lower.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const slug = lower
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return `inv_${slug}_${(hash >>> 0).toString(36)}`;
}

export function countEnabledPermissions(perms: StaffPermissions): number {
  return Object.values(perms).filter(Boolean).length;
}
