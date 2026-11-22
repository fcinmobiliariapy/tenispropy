import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Mail,
  Plus,
  Search,
  Shield,
  Trash2,
  Trophy,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  StaffInvite,
  StaffPermissions,
  StaffRole,
  Tournament,
  UserRole,
} from '../../types/tennis';
import {
  ABM_PERMISSION_FIELDS,
  BOOTSTRAPPED_SUPERADMIN_EMAIL,
  buildStaffInviteId,
  countEnabledPermissions,
  DEFAULT_PERMISSIONS_BY_ROLE,
  MODULE_PERMISSION_FIELDS,
  normalizePermissions,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '../../utils/rbac';
import {
  deleteStaffInvite,
  deleteStaffRole,
  saveStaffInvite,
  saveStaffRole,
} from '../../services/firestoreService';

interface AdminUsersPermissionsSectionProps {
  tournaments: Tournament[];
  staffRoles: StaffRole[];
  staffInvites: StaffInvite[];
  currentUserUid: string;
  currentUserEmail: string;
  isBootstrappedSuperAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onRefreshUsers: () => Promise<void>;
}

type FormMode = 'invite_email' | 'direct_uid';

export const AdminUsersPermissionsSection: React.FC<AdminUsersPermissionsSectionProps> = ({
  tournaments,
  staffRoles,
  staffInvites,
  currentUserUid,
  currentUserEmail,
  canCreate,
  canEdit,
  canDelete,
  onRefreshUsers,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [showForm, setShowForm] = useState(false);

  // Modo edición vs alta
  const [editingKind, setEditingKind] = useState<'role' | 'invite' | null>(null);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('invite_email');

  // Campos de usuario
  const [uidInput, setUidInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<UserRole>('organizador');
  const [activeInput, setActiveInput] = useState(true);
  const [allTournamentsInput, setAllTournamentsInput] = useState(false);
  const [assignedTournamentIds, setAssignedTournamentIds] = useState<string[]>([]);
  const [permissionsInput, setPermissionsInput] = useState<StaffPermissions>(() => ({
    ...DEFAULT_PERMISSIONS_BY_ROLE.organizador,
  }));

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const tournamentNameMap = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t.name])),
    [tournaments]
  );

  const pendingInvites = useMemo(
    () =>
      staffInvites.filter(
        (inv) =>
          !inv.claimedUid &&
          !staffRoles.some((sr) => sr.email.toLowerCase() === inv.emailLower)
      ),
    [staffInvites, staffRoles]
  );

  const openNewUserForm = () => {
    setEditingKind(null);
    setEditingTargetId(null);
    setFormMode('invite_email');
    setUidInput('');
    setEmailInput('');
    setDisplayNameInput('');
    setRoleInput('organizador');
    setActiveInput(true);
    setAllTournamentsInput(false);
    setAssignedTournamentIds(tournaments[0] ? [tournaments[0].id] : []);
    setPermissionsInput({ ...DEFAULT_PERMISSIONS_BY_ROLE.organizador });
    setErrorMsg(null);
    setFeedback(null);
    setShowForm(true);
  };

  const openEditActiveUser = (sr: StaffRole) => {
    setEditingKind('role');
    setEditingTargetId(sr.uid);
    setFormMode('direct_uid');
    setUidInput(sr.uid);
    setEmailInput(sr.email);
    setDisplayNameInput(sr.displayName);
    setRoleInput(sr.role);
    setActiveInput(sr.active !== false);
    setAllTournamentsInput(Boolean(sr.allTournaments || sr.role === 'superadmin'));
    setAssignedTournamentIds(sr.assignedTournamentIds || []);
    setPermissionsInput(normalizePermissions(sr.role, sr.permissions));
    setErrorMsg(null);
    setFeedback(null);
    setShowForm(true);
  };

  const openEditInvite = (inv: StaffInvite) => {
    setEditingKind('invite');
    setEditingTargetId(inv.id);
    setFormMode('invite_email');
    setUidInput('');
    setEmailInput(inv.email);
    setDisplayNameInput(inv.displayName);
    setRoleInput(inv.role);
    setActiveInput(inv.active);
    setAllTournamentsInput(Boolean(inv.allTournaments || inv.role === 'superadmin'));
    setAssignedTournamentIds(inv.assignedTournamentIds || []);
    setPermissionsInput(normalizePermissions(inv.role, inv.permissions));
    setErrorMsg(null);
    setFeedback(null);
    setShowForm(true);
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setRoleInput(nextRole);
    setPermissionsInput({ ...DEFAULT_PERMISSIONS_BY_ROLE[nextRole] });
    if (nextRole === 'superadmin') {
      setAllTournamentsInput(true);
    }
  };

  const toggleTournamentAssignment = (tid: string) => {
    setAssignedTournamentIds((prev) =>
      prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
    );
  };

  const handleTogglePermission = (key: keyof StaffPermissions) => {
    setPermissionsInput((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);

    const cleanEmail = emailInput.trim();
    const cleanEmailLower = cleanEmail.toLowerCase();
    const cleanName = displayNameInput.trim() || cleanEmail.split('@')[0] || 'Usuario';

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Ingresá un correo de Google válido.');
      return;
    }

    if (formMode === 'direct_uid' && !uidInput.trim()) {
      setErrorMsg('Ingresá el UID de Firebase del usuario o cambiá a Alta por Correo.');
      return;
    }

    if (
      roleInput !== 'superadmin' &&
      !allTournamentsInput &&
      assignedTournamentIds.length === 0
    ) {
      setErrorMsg('Asigná al menos una competencia o marcá "Todas las competencias".');
      return;
    }

    const finalPerms = normalizePermissions(roleInput, permissionsInput);
    const finalAllTournaments = roleInput === 'superadmin' ? true : allTournamentsInput;
    const finalTournamentIds = finalAllTournaments ? [] : assignedTournamentIds;
    const now = new Date().toISOString();

    setSaving(true);
    try {
      if (editingKind === 'role' || formMode === 'direct_uid') {
        const targetUid = (editingKind === 'role' ? editingTargetId : uidInput.trim()) || '';
        if (!/^[a-zA-Z0-9_-]+$/.test(targetUid)) {
          throw new Error('El UID de Firebase solo puede contener letras, números, guiones y guiones bajos.');
        }
        const existing = staffRoles.find((sr) => sr.uid === targetUid);
        const roleDoc: StaffRole = {
          uid: targetUid,
          email: cleanEmail,
          displayName: cleanName,
          role: roleInput,
          assignedTournamentIds: finalTournamentIds,
          allTournaments: finalAllTournaments,
          active: activeInput,
          permissions: finalPerms,
          inviteId: existing?.inviteId ?? null,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        await saveStaffRole(roleDoc);
        setFeedback(
          editingKind === 'role'
            ? `Permisos y competencias de "${cleanName}" actualizados.`
            : `Usuario "${cleanName}" habilitado con UID directo.`
        );
      } else {
        const inviteId = editingTargetId || buildStaffInviteId(cleanEmailLower);
        const existingInv = staffInvites.find((inv) => inv.id === inviteId);
        const inviteDoc: StaffInvite = {
          id: inviteId,
          email: cleanEmail,
          emailLower: cleanEmailLower,
          displayName: cleanName,
          role: roleInput,
          assignedTournamentIds: finalTournamentIds,
          allTournaments: finalAllTournaments,
          active: activeInput,
          permissions: finalPerms,
          invitedBy: existingInv?.invitedBy || currentUserEmail,
          claimedUid: existingInv?.claimedUid ?? null,
          createdAt: existingInv?.createdAt || now,
          updatedAt: now,
        };
        await saveStaffInvite(inviteDoc);
        setFeedback(
          editingKind === 'invite'
            ? `Pre-autorización de "${cleanEmail}" actualizada.`
            : `Usuario "${cleanEmail}" agregado. Al ingresar con Google recibirá automáticamente su rol y competencias.`
        );
      }

      await onRefreshUsers();
      setShowForm(false);
      setEditingKind(null);
      setEditingTargetId(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el usuario y sus permisos en Firestore.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleQuickToggleActive = async (item: { kind: 'role'; data: StaffRole } | { kind: 'invite'; data: StaffInvite }) => {
    setErrorMsg(null);
    setFeedback(null);
    const now = new Date().toISOString();
    try {
      if (item.kind === 'role') {
        const sr = item.data;
        if (sr.email.toLowerCase() === BOOTSTRAPPED_SUPERADMIN_EMAIL) {
          setErrorMsg('No se puede suspender al superadministrador principal.');
          return;
        }
        await saveStaffRole({
          ...sr,
          active: sr.active === false,
          updatedAt: now,
        });
      } else {
        const inv = item.data;
        await saveStaffInvite({
          ...inv,
          active: !inv.active,
          updatedAt: now,
        });
      }
      await onRefreshUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  const handleDeleteEntry = async (
    kind: 'role' | 'invite',
    id: string,
    label: string
  ) => {
    setErrorMsg(null);
    setFeedback(null);
    try {
      if (kind === 'role') {
        await deleteStaffRole(id);
      } else {
        await deleteStaffInvite(id);
      }
      setConfirmDeleteKey(null);
      await onRefreshUsers();
      setFeedback(`Usuario "${label}" dado de baja correctamente.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar el acceso.');
    }
  };

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffRoles
      .filter((sr) => (roleFilter === 'ALL' ? true : sr.role === roleFilter))
      .filter(
        (sr) =>
          !q ||
          sr.displayName.toLowerCase().includes(q) ||
          sr.email.toLowerCase().includes(q) ||
          sr.uid.toLowerCase().includes(q)
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [staffRoles, roleFilter, search]);

  const filteredInvites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pendingInvites
      .filter((inv) => (roleFilter === 'ALL' ? true : inv.role === roleFilter))
      .filter(
        (inv) =>
          !q ||
          inv.displayName.toLowerCase().includes(q) ||
          inv.email.toLowerCase().includes(q)
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [pendingInvites, roleFilter, search]);

  const activeStaffCount = staffRoles.filter((s) => s.active !== false).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#7C1FA2]">
            Seguridad y Control de Acceso (ABM · Funciones · Competencias)
          </p>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Usuarios, Roles y Permisos del Equipo
          </h2>
          <p className="text-xs text-[#475569]">
            Agregá nuevos usuarios por correo Google o UID, definí permisos de Alta, Baja y
            Modificación y asigná las competencias habilitadas.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openNewUserForm}
            className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar usuario
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border border-[#E2E8F0] rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] bg-white">
        <div className="p-4">
          <p className="text-xs text-[#475569]">Usuarios activos en equipo</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0A1633]">
            {activeStaffCount}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#475569]">Pre-autorizaciones por correo</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#7C1FA2]">
            {pendingInvites.length}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#475569]">Competencias asignables</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0284C7]">
            {tournaments.length}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Formulario Alta / Modificación */}
      {showForm && (
        <form
          onSubmit={handleSaveUser}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
            <div>
              <h3 className="text-sm font-bold text-[#0A1633]">
                {editingKind
                  ? `Modificar acceso y permisos · ${displayNameInput || emailInput}`
                  : 'Alta de nuevo usuario del equipo'}
              </h3>
              <p className="text-xs text-[#475569]">
                Elegí el rol base y ajustá permisos granulares ABM, módulos, parámetros y torneos.
              </p>
            </div>

            {!editingKind && (
              <div className="inline-flex items-center p-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                <button
                  type="button"
                  onClick={() => setFormMode('invite_email')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    formMode === 'invite_email'
                      ? 'bg-[#7C1FA2] text-white'
                      : 'text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  Alta por correo Google
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('direct_uid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    formMode === 'direct_uid'
                      ? 'bg-[#7C1FA2] text-white'
                      : 'text-[#475569] hover:text-[#0A1633]'
                  }`}
                >
                  Directo por UID Firebase
                </button>
              </div>
            )}
          </div>

          {/* Datos de identidad y rol */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {formMode === 'direct_uid' && (
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  UID de Firebase *
                </label>
                <input
                  required
                  disabled={editingKind === 'role'}
                  value={uidInput}
                  onChange={(e) => setUidInput(e.target.value)}
                  placeholder="Ej. AbC123xyz..."
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] font-mono text-xs disabled:opacity-70"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Correo de Google *
              </label>
              <input
                required
                type="email"
                disabled={editingKind === 'invite'}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="usuario@gmail.com"
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs disabled:bg-[#F8FAFC]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Nombre completo *
              </label>
              <input
                required
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="Nombre y apellido"
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Rol asignado
              </label>
              <select
                value={roleInput}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-[#475569]">
              <strong className="text-[#0A1633]">{ROLE_LABELS[roleInput]}:</strong>{' '}
              {ROLE_DESCRIPTIONS[roleInput]}
            </span>
            <label className="inline-flex items-center gap-2 font-medium text-[#0A1633] cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={activeInput}
                onChange={(e) => setActiveInput(e.target.checked)}
              />
              Usuario activo (habilitado para ingresar)
            </label>
          </div>

          {/* Permisos ABM (Alta, Baja, Modificación) */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#7C1FA2]">
              Permisos ABM (Alta, Baja y Modificaciones)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ABM_PERMISSION_FIELDS.map((field) => {
                const checked = roleInput === 'superadmin' ? true : permissionsInput[field.key];
                return (
                  <label
                    key={field.key}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start gap-2.5 ${
                      checked
                        ? 'border-[#7C1FA2]/45 bg-[#F3E8FF]/35'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={roleInput === 'superadmin'}
                      checked={checked}
                      onChange={() => handleTogglePermission(field.key)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[#0A1633]">{field.label}</p>
                      <p className="text-[11px] text-[#475569] mt-0.5 leading-snug">
                        {field.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Acceso a Funciones y Parámetros de la Página */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#0284C7]">
              Acceso a funciones y parámetros de la página
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {MODULE_PERMISSION_FIELDS.map((field) => {
                const checked = roleInput === 'superadmin' ? true : permissionsInput[field.key];
                return (
                  <label
                    key={field.key}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start gap-2.5 ${
                      checked
                        ? 'border-[#0284C7]/45 bg-[#E0F2FE]/30'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={roleInput === 'superadmin'}
                      checked={checked}
                      onChange={() => handleTogglePermission(field.key)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[#0A1633]">{field.label}</p>
                      <p className="text-[11px] text-[#475569] mt-0.5 leading-snug">
                        {field.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Asignación de Competencias / Torneos */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#0A1633]">
                Asignación de competencias
              </p>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0A1633] cursor-pointer">
                <input
                  type="checkbox"
                  disabled={roleInput === 'superadmin'}
                  checked={roleInput === 'superadmin' || allTournamentsInput}
                  onChange={(e) => setAllTournamentsInput(e.target.checked)}
                />
                Todas las competencias (actuales y futuras)
              </label>
            </div>

            {!(roleInput === 'superadmin' || allTournamentsInput) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {tournaments.map((t) => {
                  const selected = assignedTournamentIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 text-xs ${
                        selected
                          ? 'border-[#7C1FA2] bg-[#F3E8FF]/30'
                          : 'border-[#E2E8F0] bg-[#F8FAFC]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleTournamentAssignment(t.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0A1633] truncate">{t.name}</p>
                        <p className="text-[11px] text-[#475569] truncate">
                          {t.venue} · {t.startDate}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingKind(null);
                setEditingTargetId(null);
              }}
              className="px-4 min-h-[40px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#475569]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 min-h-[40px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-60"
            >
              {saving
                ? 'Guardando...'
                : editingKind
                ? 'Guardar cambios'
                : 'Registrar usuario'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros y Buscador */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuario, correo o UID..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
            >
              <option value="ALL">Todos los roles</option>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs font-mono tabular-nums text-[#475569]">
            {filteredRoles.length} activos · {filteredInvites.length} pendientes
          </span>
        </div>

        {/* Lista de usuarios activos */}
        <div className="divide-y divide-[#E2E8F0]">
          {filteredRoles.length === 0 && filteredInvites.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#475569]">
              No hay usuarios o pre-autorizaciones que coincidan con la búsqueda.
            </div>
          ) : (
            <>
              {filteredRoles.map((sr) => {
                const perms = normalizePermissions(sr.role, sr.permissions);
                const permCount = countEnabledPermissions(perms);
                const isRootSuperAdmin = sr.email.toLowerCase() === BOOTSTRAPPED_SUPERADMIN_EMAIL;
                const isSelf = sr.uid === currentUserUid;
                const deleteKey = `role_${sr.uid}`;
                const assignedNames = sr.allTournaments || sr.role === 'superadmin'
                  ? 'Todas las competencias'
                  : sr.assignedTournamentIds.length === 0
                  ? 'Sin competencias asignadas'
                  : sr.assignedTournamentIds
                      .map((id) => tournamentNameMap.get(id) || id)
                      .join(', ');

                return (
                  <div key={sr.uid} className="p-4 sm:px-5 space-y-2.5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Shield className="w-4 h-4 text-[#7C1FA2] shrink-0" />
                          <span className="text-sm font-bold text-[#0A1633]">
                            {sr.displayName}
                          </span>
                          <span className="text-xs font-semibold text-[#7C1FA2]">
                            · {ROLE_LABELS[sr.role] || sr.role}
                          </span>
                          {sr.active === false && (
                            <span className="text-[11px] font-semibold text-red-700">
                              (Suspendido)
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-[11px] font-medium text-[#0284C7]">
                              (Tu sesión)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#475569] truncate">
                          {sr.email} · <span className="font-mono text-[11px]">UID: {sr.uid}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#475569]">
                          <span>
                            ABM:{' '}
                            <strong className="text-[#0A1633]">
                              {[
                                perms.canCreate ? 'Alta' : null,
                                perms.canEdit ? 'Modif.' : null,
                                perms.canDelete ? 'Baja' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Solo lectura'}
                            </strong>
                          </span>
                          <span className="font-mono tabular-nums">
                            {permCount}/11 permisos activos
                          </span>
                          <span className="inline-flex items-center gap-1 truncate max-w-md">
                            <Trophy className="w-3 h-3 text-[#7C1FA2] shrink-0" />
                            {assignedNames}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {canEdit && !isRootSuperAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleQuickToggleActive({ kind: 'role', data: sr })}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                            >
                              {sr.active === false ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                                  Activar
                                </>
                              ) : (
                                <>
                                  <UserX className="w-3.5 h-3.5 text-amber-700" />
                                  Suspender
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditActiveUser(sr)}
                              className="inline-flex items-center gap-1 px-3 min-h-[34px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#7C1FA2]" />
                              Editar
                            </button>
                          </>
                        )}

                        {canDelete && !isRootSuperAdmin && !isSelf && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(deleteKey)}
                            className="inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Baja
                          </button>
                        )}
                      </div>
                    </div>

                    {confirmDeleteKey === deleteKey && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-red-900">
                          ¿Revocar acceso de administración a {sr.displayName} ({sr.email})?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="px-3 py-1 rounded-lg border border-red-200 bg-white text-[#0A1633]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry('role', sr.uid, sr.displayName)}
                            className="px-3 py-1 rounded-lg bg-red-700 text-white font-semibold"
                          >
                            Confirmar baja
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredInvites.map((inv) => {
                const perms = normalizePermissions(inv.role, inv.permissions);
                const deleteKey = `invite_${inv.id}`;
                const assignedNames = inv.allTournaments || inv.role === 'superadmin'
                  ? 'Todas las competencias'
                  : inv.assignedTournamentIds.length === 0
                  ? 'Sin competencias asignadas'
                  : inv.assignedTournamentIds
                      .map((id) => tournamentNameMap.get(id) || id)
                      .join(', ');

                return (
                  <div key={inv.id} className="p-4 sm:px-5 bg-[#FAF5FF]/40 space-y-2.5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Mail className="w-4 h-4 text-[#0284C7] shrink-0" />
                          <span className="text-sm font-bold text-[#0A1633]">
                            {inv.displayName}
                          </span>
                          <span className="text-xs font-semibold text-[#0284C7]">
                            · {ROLE_LABELS[inv.role]} · Pendiente de primer ingreso
                          </span>
                          {!inv.active && (
                            <span className="text-[11px] font-semibold text-red-700">
                              (Pausada)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#475569] truncate">
                          {inv.email} · Invitado por {inv.invitedBy}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#475569]">
                          <span>
                            ABM:{' '}
                            <strong className="text-[#0A1633]">
                              {[
                                perms.canCreate ? 'Alta' : null,
                                perms.canEdit ? 'Modif.' : null,
                                perms.canDelete ? 'Baja' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Solo lectura'}
                            </strong>
                          </span>
                          <span className="inline-flex items-center gap-1 truncate max-w-md">
                            <Trophy className="w-3 h-3 text-[#7C1FA2] shrink-0" />
                            {assignedNames}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleQuickToggleActive({ kind: 'invite', data: inv })}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                            >
                              {inv.active ? 'Pausar' : 'Activar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditInvite(inv)}
                              className="inline-flex items-center gap-1 px-3 min-h-[34px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#7C1FA2]" />
                              Editar
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(deleteKey)}
                            className="inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Baja
                          </button>
                        )}
                      </div>
                    </div>

                    {confirmDeleteKey === deleteKey && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-red-900">
                          ¿Eliminar la pre-autorización de {inv.email}?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="px-3 py-1 rounded-lg border border-red-200 bg-white text-[#0A1633]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry('invite', inv.id, inv.email)}
                            className="px-3 py-1 rounded-lg bg-red-700 text-white font-semibold"
                          >
                            Confirmar baja
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
