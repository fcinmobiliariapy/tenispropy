import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import {
  Division,
  FootballPosition,
  Gender,
  PlayerPrivate,
  PlayerPublic,
  PreferredFoot,
  Registration,
  RegistrationStatus,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import {
  createEmptyFootballPlayerStats,
} from '../../utils/footballEngine';
import { makeId } from '../../utils/tournamentEngine';
import type { PlayerStats } from '../../types/tennis';

const EMPTY_PLAYER_STATS: PlayerStats = {
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
  titles: 0,
  currentStreak: 0,
};
import {
  deletePlayerCascade,
  formatFirestoreError,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

interface AdminFootballRosterSectionProps {
  tournament: Tournament | null;
  division: Division | null;
  divisions: Division[];
  onSelectDivision: (id: string) => void;
  playersPublic: PlayerPublic[];
  playersPrivate: Record<string, PlayerPrivate>;
  registrations: Registration[];
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
}

const POSITIONS: FootballPosition[] = ['Arquero', 'Defensor', 'Mediocampista', 'Delantero'];
const FEET: PreferredFoot[] = ['Derecho', 'Zurdo', 'Ambidiestro'];

export const AdminFootballRosterSection: React.FC<AdminFootballRosterSectionProps> = ({
  tournament,
  division,
  divisions,
  onSelectDivision,
  playersPublic,
  playersPrivate,
  registrations,
  isSuperAdmin,
  permissions,
}) => {
  const canCreate = Boolean(isSuperAdmin || !permissions || permissions.canCreate);
  const canEdit = Boolean(isSuperAdmin || !permissions || permissions.canEdit);
  const canDelete = Boolean(isSuperAdmin || !permissions || permissions.canDelete);

  const [subView, setSubView] = useState<'jugadores' | 'equipos'>('jugadores');
  const [search, setSearch] = useState('');
  const [filterDivisionId, setFilterDivisionId] = useState<string>(division?.id || 'ALL');
  const [filterTeamId, setFilterTeamId] = useState<string>('ALL');
  const [filterPosition, setFilterPosition] = useState<string>('ALL');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Team Form
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamDivisionId, setTeamDivisionId] = useState<string>(division?.id || divisions[0]?.id || '');
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0A1633');
  const [teamSeed, setTeamSeed] = useState<string>('');
  const [teamStatus, setTeamStatus] = useState<RegistrationStatus>('confirmada');

  // Player Form
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [pFirstName, setPFirstName] = useState('');
  const [pLastName, setPLastName] = useState('');
  const [pTeamId, setPTeamId] = useState<string>('');
  const [pCategory, setPCategory] = useState<string>(division?.category || 'Primera');
  const [pGender, setPGender] = useState<Gender>(division?.gender || 'Masculino');
  const [pJersey, setPJersey] = useState<string>('10');
  const [pPosition, setPPosition] = useState<FootballPosition>('Mediocampista');
  const [pFoot, setPFoot] = useState<PreferredFoot>('Derecho');
  const [pDoc, setPDoc] = useState('');
  const [pBirthDate, setPBirthDate] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');

  const tournamentRegs = useMemo(
    () =>
      registrations
        .filter((r) => r.tournamentId === tournament?.id)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')),
    [registrations, tournament?.id]
  );

  const activeCategoryRegs = useMemo(() => {
    const targetDivId = filterDivisionId === 'ALL' ? division?.id : filterDivisionId;
    if (!targetDivId) return tournamentRegs;
    return tournamentRegs.filter((r) => r.divisionId === targetDivId);
  }, [tournamentRegs, filterDivisionId, division?.id]);

  const regById = useMemo(() => new Map(tournamentRegs.map((r) => [r.id, r])), [tournamentRegs]);
  const divById = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedDivObj = filterDivisionId !== 'ALL' ? divById.get(filterDivisionId) : null;
    return playersPublic
      .filter((p) => {
        if (selectedDivObj) {
          const team = p.teamId ? regById.get(p.teamId) : null;
          const matchesTeamDiv = team?.divisionId === selectedDivObj.id;
          const matchesCat =
            p.habitualCategory.trim().toLowerCase() === selectedDivObj.category.trim().toLowerCase();
          if (!matchesTeamDiv && !matchesCat) return false;
        }
        if (filterTeamId !== 'ALL' && p.teamId !== filterTeamId) return false;
        if (filterPosition !== 'ALL' && p.position !== filterPosition) return false;
        if (!q) return true;
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          String(p.jerseyNumber || '').includes(q)
        );
      })
      .sort(
        (a, b) =>
          (a.club || '').localeCompare(b.club || '', 'es') ||
          (a.jerseyNumber ?? 99) - (b.jerseyNumber ?? 99) ||
          a.fullName.localeCompare(b.fullName, 'es')
      );
  }, [playersPublic, search, filterDivisionId, filterTeamId, filterPosition, divById, regById]);

  const openNewTeamForm = () => {
    setEditingTeamId(null);
    setTeamDivisionId(division?.id || divisions[0]?.id || '');
    setTeamName('');
    setTeamShortName('');
    setCoachName('');
    setPrimaryColor('#0A1633');
    setTeamSeed('');
    setTeamStatus('confirmada');
    setShowTeamForm(true);
    setErrorMsg(null);
  };

  const openEditTeamForm = (reg: Registration) => {
    setEditingTeamId(reg.id);
    setTeamDivisionId(reg.divisionId);
    setTeamName(reg.displayName);
    setTeamShortName(reg.teamShortName || '');
    setCoachName(reg.coachName || '');
    setPrimaryColor(reg.primaryColor || '#0A1633');
    setTeamSeed(reg.seed ? String(reg.seed) : '');
    setTeamStatus(reg.status);
    setShowTeamForm(true);
    setErrorMsg(null);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    const targetDivId = teamDivisionId || division?.id || divisions[0]?.id;
    if (!targetDivId) {
      setErrorMsg('Creá al menos una categoría/división primero.');
      return;
    }
    if (!teamName.trim()) {
      setErrorMsg('Ingresá el nombre del equipo o club.');
      return;
    }

    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const existing = editingTeamId ? tournamentRegs.find((r) => r.id === editingTeamId) : null;
      const parsedSeed = teamSeed.trim() ? Math.min(64, Math.max(1, Number(teamSeed))) : null;
      const regDoc: Registration = {
        id: existing ? existing.id : makeId('ftm'),
        tournamentId: tournament.id,
        divisionId: targetDivId,
        modality: 'Equipo',
        playerIds: existing ? existing.playerIds.slice(0, 35) : [],
        displayName: teamName.trim().slice(0, 180),
        teamShortName:
          teamShortName.trim().toUpperCase().slice(0, 12) ||
          teamName.trim().slice(0, 3).toUpperCase(),
        coachName: coachName.trim().slice(0, 120) || null,
        teamBadgeUrl: existing?.teamBadgeUrl || null,
        primaryColor: primaryColor || '#0A1633',
        club: teamName.trim().slice(0, 120),
        seed: Number.isFinite(parsedSeed) ? parsedSeed : null,
        status: teamStatus,
        groupId: existing?.groupId || null,
        registeredAt: existing ? existing.registeredAt : now,
        updatedAt: now,
      };
      await saveEntity('registrations', regDoc);
      setShowTeamForm(false);
      setEditingTeamId(null);
      setFeedback(`Equipo "${regDoc.displayName}" guardado correctamente.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar el equipo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (reg: Registration) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await removeEntity('registrations', reg.id);
      setFeedback(`Equipo "${reg.displayName}" eliminado de la categoría.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo eliminar el equipo.'));
    } finally {
      setSaving(false);
    }
  };

  const openNewPlayerForm = () => {
    const defaultTeam = activeCategoryRegs[0];
    const defaultDiv = defaultTeam ? divById.get(defaultTeam.divisionId) : division;
    setEditingPlayerId(null);
    setPFirstName('');
    setPLastName('');
    setPTeamId(defaultTeam?.id || '');
    setPCategory(defaultDiv?.category || division?.category || 'Primera');
    setPGender(defaultDiv?.gender || division?.gender || 'Masculino');
    setPJersey('10');
    setPPosition('Mediocampista');
    setPFoot('Derecho');
    setPDoc('');
    setPBirthDate('');
    setPPhone('');
    setPEmail('');
    setShowPlayerForm(true);
    setErrorMsg(null);
  };

  const openEditPlayerForm = (p: PlayerPublic) => {
    const priv = playersPrivate[p.id];
    setEditingPlayerId(p.id);
    setPFirstName(p.firstName);
    setPLastName(p.lastName);
    setPTeamId(p.teamId || '');
    setPCategory(p.habitualCategory || division?.category || 'Primera');
    setPGender(p.gender);
    setPJersey(p.jerseyNumber != null ? String(p.jerseyNumber) : '');
    setPPosition(p.position || 'Mediocampista');
    setPFoot(p.preferredFoot || 'Derecho');
    setPDoc(priv?.documentNumber || '');
    setPBirthDate(priv?.birthDate || '');
    setPPhone(priv?.phone || '');
    setPEmail(priv?.email || '');
    setShowPlayerForm(true);
    setErrorMsg(null);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    if (!pFirstName.trim() || !pLastName.trim()) {
      setErrorMsg('Ingresá nombre y apellido del jugador.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);

    try {
      const now = new Date().toISOString();
      const existing = editingPlayerId ? playersPublic.find((p) => p.id === editingPlayerId) : null;
      const selectedTeam = pTeamId ? regById.get(pTeamId) : null;
      const teamDiv = selectedTeam ? divById.get(selectedTeam.divisionId) : null;
      const fullName = `${pFirstName.trim()} ${pLastName.trim()}`.slice(0, 160);
      const jersey = pJersey.trim() ? Math.min(99, Math.max(0, Number(pJersey))) : null;
      const playerId = existing ? existing.id : makeId('fpl');

      const pubDoc: PlayerPublic = {
        id: playerId,
        tournamentId: tournament.id,
        sport: 'football',
        teamId: selectedTeam?.id || null,
        jerseyNumber: jersey != null && Number.isFinite(jersey) ? jersey : null,
        position: pPosition,
        preferredFoot: pFoot,
        footballStats: existing?.footballStats || createEmptyFootballPlayerStats(),
        firstName: pFirstName.trim().slice(0, 80),
        lastName: pLastName.trim().slice(0, 80),
        fullName,
        club: (selectedTeam?.displayName || existing?.club || 'Agente Libre').slice(0, 100),
        habitualCategory: (pCategory.trim() || teamDiv?.category || division?.category || 'Primera').slice(0, 40),
        gender: pGender,
        dominantHand: pFoot === 'Zurdo' ? 'Zurdo' : 'Diestro',
        backhand: 'Dos manos',
        bio: existing?.bio || '',
        photoUrl: existing?.photoUrl || null,
        stats: existing?.stats || EMPTY_PLAYER_STATS,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };

      await saveEntity('players_public', pubDoc);

      const privDoc: PlayerPrivate = {
        id: playerId,
        playerId,
        tournamentId: tournament.id,
        documentNumber: pDoc.trim().slice(0, 40),
        birthDate: pBirthDate.trim().slice(0, 20),
        phone: pPhone.trim().slice(0, 40),
        email: pEmail.trim().slice(0, 160),
        updatedAt: now,
      };
      await saveEntity('players_private', privDoc);

      // Vincular el jugador en la lista de playerIds del equipo (hasta 35 jugadores por plantilla)
      if (selectedTeam && !selectedTeam.playerIds.includes(playerId)) {
        await saveEntity('registrations', {
          ...selectedTeam,
          playerIds: [...selectedTeam.playerIds, playerId].slice(0, 35),
          updatedAt: now,
        });
      }

      // Si cambió de equipo, remover del equipo anterior
      if (existing?.teamId && existing.teamId !== selectedTeam?.id) {
        const oldTeam = regById.get(existing.teamId);
        if (oldTeam && oldTeam.playerIds.includes(playerId)) {
          await saveEntity('registrations', {
            ...oldTeam,
            playerIds: oldTeam.playerIds.filter((id) => id !== playerId),
            updatedAt: now,
          });
        }
      }

      setShowPlayerForm(false);
      setEditingPlayerId(null);
      setFeedback(`Jugador "${fullName}" guardado en el listado oficial.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar el jugador.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async (p: PlayerPublic) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      if (p.teamId) {
        const team = regById.get(p.teamId);
        if (team && team.playerIds.includes(p.id)) {
          await saveEntity('registrations', {
            ...team,
            playerIds: team.playerIds.filter((id) => id !== p.id),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      await deletePlayerCascade(p.id);
      setFeedback(`Jugador "${p.fullName}" eliminado del padrón.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo eliminar el jugador.'));
    } finally {
      setSaving(false);
    }
  };

  if (!tournament) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
        Seleccioná o creá una competencia de fútbol primero.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Equipos y Listado Oficial de Jugadores (Fútbol FIFA)
          </h2>
          <p className="text-xs text-[#475569]">
            Gestioná clubes por categoría, dorsales, posiciones (incluyendo arqueros para valla menos vendida) y datos privados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-white p-1">
            <button
              type="button"
              onClick={() => setSubView('jugadores')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                subView === 'jugadores' ? 'bg-[#0A1633] text-white' : 'text-[#475569]'
              }`}
            >
              Jugadores ({playersPublic.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('equipos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                subView === 'equipos' ? 'bg-[#0A1633] text-white' : 'text-[#475569]'
              }`}
            >
              Equipos ({tournamentRegs.length})
            </button>
          </div>
          {canCreate && (
            <>
              <button
                type="button"
                onClick={openNewTeamForm}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-700" />
                Nuevo equipo
              </button>
              <button
                type="button"
                onClick={openNewPlayerForm}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Nuevo jugador
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Formulario Equipo */}
      {showTeamForm && (
        <form
          onSubmit={handleSaveTeam}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0A1633]">
            {editingTeamId ? 'Editar equipo' : 'Registrar equipo en categoría'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Categoría / División *</label>
              <select
                value={teamDivisionId}
                onChange={(e) => setTeamDivisionId(e.target.value)}
                disabled={Boolean(editingTeamId)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white disabled:bg-slate-100"
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Nombre del Equipo / Club *</label>
              <input
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ej. Atlético Asunción FC"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Sigla (3 letras)</label>
              <input
                maxLength={12}
                value={teamShortName}
                onChange={(e) => setTeamShortName(e.target.value)}
                placeholder="ASU"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Director Técnico</label>
              <input
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                placeholder="Nombre del DT"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Preclasificación (Seed)</label>
              <input
                type="number"
                min={1}
                max={64}
                value={teamSeed}
                onChange={(e) => setTeamSeed(e.target.value)}
                placeholder="Opcional (1..64)"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-mono tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Color</label>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-9 p-1 rounded-lg border border-[#E2E8F0] bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Estado</label>
                <select
                  value={teamStatus}
                  onChange={(e) => setTeamStatus(e.target.value as RegistrationStatus)}
                  className="w-full h-9 px-2 rounded-lg border border-[#E2E8F0] text-xs bg-white"
                >
                  <option value="confirmada">Confirmada</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_lista_de_espera">En espera</option>
                  <option value="retirada">Retirada</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTeamForm(false)}
              className="px-3.5 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0A1633] text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar equipo'}
            </button>
          </div>
        </form>
      )}

      {/* Formulario Jugador */}
      {showPlayerForm && (
        <form
          onSubmit={handleSavePlayer}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0A1633]">
            {editingPlayerId ? 'Editar ficha de jugador' : 'Registrar jugador en plantel'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Nombre *</label>
              <input
                required
                value={pFirstName}
                onChange={(e) => setPFirstName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Apellido *</label>
              <input
                required
                value={pLastName}
                onChange={(e) => setPLastName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Equipo / Club</label>
              <select
                value={pTeamId}
                onChange={(e) => {
                  const tid = e.target.value;
                  setPTeamId(tid);
                  const reg = regById.get(tid);
                  const d = reg ? divById.get(reg.divisionId) : null;
                  if (d?.category) setPCategory(d.category);
                }}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
              >
                <option value="">Sin equipo asignado</option>
                {tournamentRegs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName} ({divById.get(r.divisionId)?.category || 'Cat.'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Categoría *</label>
              <input
                required
                value={pCategory}
                onChange={(e) => setPCategory(e.target.value)}
                placeholder="Primera, Sub-17..."
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Dorsal (#)</label>
              <input
                type="number"
                min={0}
                max={99}
                value={pJersey}
                onChange={(e) => setPJersey(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Posición FIFA</label>
              <select
                value={pPosition}
                onChange={(e) => setPPosition(e.target.value as FootballPosition)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Pie hábil</label>
              <select
                value={pFoot}
                onChange={(e) => setPFoot(e.target.value as PreferredFoot)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
              >
                {FEET.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Rama</label>
              <select
                value={pGender}
                onChange={(e) => setPGender(e.target.value as Gender)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs bg-white"
              >
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Mixto">Mixto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">CI / Documento (PII)</label>
              <input
                value={pDoc}
                onChange={(e) => setPDoc(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Fecha Nac. (PII)</label>
              <input
                type="date"
                value={pBirthDate}
                onChange={(e) => setPBirthDate(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Teléfono (PII)</label>
              <input
                value={pPhone}
                onChange={(e) => setPPhone(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">Correo (PII)</label>
              <input
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPlayerForm(false)}
              className="px-3.5 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar jugador'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros por categoría, equipo y posición */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#475569] absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jugador, equipo o #..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E2E8F0] text-xs"
          />
        </div>
        <select
          value={filterDivisionId}
          onChange={(e) => {
            const val = e.target.value;
            setFilterDivisionId(val);
            if (val !== 'ALL') onSelectDivision(val);
            setFilterTeamId('ALL');
          }}
          className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
        >
          <option value="ALL">Todas las categorías</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.category})
            </option>
          ))}
        </select>
        <select
          value={filterTeamId}
          onChange={(e) => setFilterTeamId(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
        >
          <option value="ALL">Todos los equipos</option>
          {activeCategoryRegs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName}
            </option>
          ))}
        </select>
        <select
          value={filterPosition}
          onChange={(e) => setFilterPosition(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs bg-white"
        >
          <option value="ALL">Todas las posiciones</option>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </div>

      {subView === 'equipos' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCategoryRegs.length === 0 ? (
            <div className="col-span-full bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#475569]">
              No hay equipos registrados en esta categoría todavía.
            </div>
          ) : (
            activeCategoryRegs.map((reg) => {
              const divObj = divById.get(reg.divisionId);
              const squadCount = playersPublic.filter(
                (p) => p.teamId === reg.id || reg.playerIds.includes(p.id)
              ).length;
              return (
                <div
                  key={reg.id}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-9 h-9 rounded-xl text-white text-xs font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: reg.primaryColor || '#0A1633' }}
                      >
                        {reg.teamShortName || reg.displayName.slice(0, 3).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0A1633] truncate">
                          {reg.displayName}
                          {reg.seed ? ` [${reg.seed}]` : ''}
                        </p>
                        <p className="text-[11px] text-[#475569] truncate">
                          {divObj?.name || 'Categoría'} · {reg.coachName ? `DT: ${reg.coachName}` : 'Sin DT'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                      {squadCount} jug.
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTeamId(reg.id);
                        setSubView('jugadores');
                      }}
                      className="text-[#0284C7] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Ver plantel
                    </button>
                    <div className="flex items-center gap-1.5">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditTeamForm(reg)}
                          className="p-1.5 rounded-lg border border-[#E2E8F0] text-[#0A1633] hover:bg-slate-50"
                          title="Editar equipo"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(reg)}
                          disabled={saving}
                          className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                          title="Eliminar equipo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          {filteredPlayers.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#475569]">
              No se encontraron jugadores con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#475569]">
                    <th className="py-2.5 px-3 text-left w-14">Dorsal</th>
                    <th className="py-2.5 px-3 text-left">Jugador</th>
                    <th className="py-2.5 px-3 text-left">Equipo</th>
                    <th className="py-2.5 px-3 text-left">Categoría</th>
                    <th className="py-2.5 px-3 text-left">Posición</th>
                    <th className="py-2.5 px-3 text-left">Pie / PII</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPlayers.map((p) => {
                    const priv = playersPrivate[p.id];
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#0A1633]">
                          #{p.jerseyNumber ?? '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#0A1633]">{p.fullName}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{p.club}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{p.habitualCategory}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              p.position === 'Arquero'
                                ? 'text-amber-700'
                                : p.position === 'Delantero'
                                ? 'text-emerald-700'
                                : 'text-[#0284C7]'
                            }`}
                          >
                            {p.position || 'Jugador'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          <span>{p.preferredFoot || p.dominantHand}</span>
                          {priv?.documentNumber && (
                            <span className="ml-2 font-mono text-[11px] text-slate-500">
                              CI {priv.documentNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditPlayerForm(p)}
                                className="p-1.5 rounded-lg border border-[#E2E8F0] text-[#0A1633] hover:bg-slate-100"
                                title="Editar jugador"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(p)}
                                disabled={saving}
                                className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                                title="Eliminar jugador"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
