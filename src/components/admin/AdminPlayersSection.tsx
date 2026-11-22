import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Download, FileSpreadsheet, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Division, Gender, PlayerPrivate, PlayerPublic, Registration, StaffPermissions, Tournament } from '../../types/tennis';
import { downloadCsvTemplate, ParsedImportPlayerRow, parsePlayersImportFile } from '../../utils/importPlayers';
import { optimizeAndUploadAvatar } from '../../utils/imageOptimizer';
import { makeId } from '../../utils/tournamentEngine';
import { deletePlayerCascade, saveEntity } from '../../services/firestoreService';

const FALLBACK_CATEGORIES = ['6ta', '5ta', '4ta', '3ra', '2da', '1ra', 'Libre', 'Senior'];

interface Props {
  tournament: Tournament | null;
  divisions: Division[];
  playersPublic: PlayerPublic[];
  playersPrivate: Record<string, PlayerPrivate>;
  registrations: Registration[];
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
  onRefreshPrivate: (playerIds: string[]) => Promise<void>;
}

export const AdminPlayersSection: React.FC<Props> = ({
  tournament,
  divisions,
  playersPublic,
  playersPrivate,
  registrations,
  isSuperAdmin,
  permissions,
  onRefreshPrivate,
}) => {
  const canCreate = permissions ? permissions.canCreate : true;
  const canEdit = permissions ? permissions.canEdit : true;
  const canDelete = permissions ? (permissions.canDelete || isSuperAdmin) : isSuperAdmin;
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const enabledCategories = useMemo(() => {
    const seen = new Set<string>();
    divisions
      .filter((d) => !tournament || d.tournamentId === tournament.id)
      .forEach((d) => {
        const cat = d.category.trim();
        if (cat) seen.add(cat);
      });
    return Array.from(seen);
  }, [divisions, tournament]);

  const defaultCategory = enabledCategories[0] || '5ta';

  // Campos públicos + PII privados
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [club, setClub] = useState('');
  const [habitualCategory, setHabitualCategory] = useState(defaultCategory);
  const [gender, setGender] = useState<Gender>('Masculino');
  const [dominantHand, setDominantHand] = useState<'Diestro' | 'Zurdo'>('Diestro');
  const [backhand, setBackhand] = useState<'Una mano' | 'Dos manos'>('Dos manos');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Importación Excel / CSV
  const [importRows, setImportRows] = useState<ParsedImportPlayerRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setCategoryFilter('ALL');
    if (!editingId && !showForm) {
      setHabitualCategory(defaultCategory);
    }
  }, [tournament?.id, defaultCategory, editingId, showForm]);

  const selectableCategories = useMemo(() => {
    const base = enabledCategories.length > 0 ? [...enabledCategories] : [...FALLBACK_CATEGORIES];
    if (habitualCategory && !base.includes(habitualCategory)) {
      base.push(habitualCategory);
    }
    return base;
  }, [enabledCategories, habitualCategory]);

  const filterCategoryOptions = useMemo(() => {
    const seen = new Set<string>(enabledCategories);
    playersPublic.forEach((p) => {
      if (p.habitualCategory?.trim()) seen.add(p.habitualCategory.trim());
    });
    return Array.from(seen);
  }, [enabledCategories, playersPublic]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return playersPublic
      .filter((p) => {
        if (categoryFilter !== 'ALL' && p.habitualCategory !== categoryFilter) {
          return false;
        }
        if (!q) return true;
        const priv = playersPrivate[p.id];
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.habitualCategory.toLowerCase().includes(q) ||
          (priv?.documentNumber || '').toLowerCase().includes(q) ||
          (priv?.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [playersPublic, playersPrivate, search, categoryFilter]);

  const startEdit = (p: PlayerPublic) => {
    const priv = playersPrivate[p.id];
    setEditingId(p.id);
    setFirstName(p.firstName);
    setLastName(p.lastName);
    setDocumentNumber(priv?.documentNumber && priv.documentNumber !== 'S/D' ? priv.documentNumber : '');
    setBirthDate(priv?.birthDate || '');
    setPhone(priv?.phone || '');
    setEmail(priv?.email || '');
    setClub(p.club);
    setHabitualCategory(p.habitualCategory || defaultCategory);
    setGender(p.gender);
    setDominantHand(p.dominantHand);
    setBackhand(p.backhand);
    setBio(p.bio || '');
    setPhotoUrl(p.photoUrl || '');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setDocumentNumber('');
    setBirthDate('');
    setPhone('');
    setEmail('');
    setClub('');
    setHabitualCategory(defaultCategory);
    setGender('Masculino');
    setDominantHand('Diestro');
    setBackhand('Dos manos');
    setBio('');
    setPhotoUrl('');
    setShowForm(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setFeedback(null);
    try {
      const url = await optimizeAndUploadAvatar(file);
      setPhotoUrl(url);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo procesar la foto del jugador.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    const now = new Date().toISOString();
    const id = editingId || makeId('pl');
    const existing = playersPublic.find((x) => x.id === id);

    const cat = habitualCategory.trim() || defaultCategory;

    const pubDoc: PlayerPublic = {
      id,
      tournamentId: existing?.tournamentId || tournament.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName: `${firstName.trim()} ${lastName.trim()}`,
      club: club.trim() || 'Independiente',
      habitualCategory: cat,
      gender,
      dominantHand,
      backhand,
      bio: bio.trim(),
      photoUrl: photoUrl.trim() || null,
      stats: existing?.stats || {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        titles: 0,
        currentStreak: 0,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const privDoc: PlayerPrivate = {
      id,
      playerId: id,
      tournamentId: pubDoc.tournamentId,
      documentNumber: documentNumber.trim(),
      birthDate: birthDate.trim(),
      phone: phone.trim(),
      email: email.trim(),
      updatedAt: now,
    };

    await saveEntity('players_public', pubDoc);
    await saveEntity('players_private', privDoc);
    await onRefreshPrivate([id]);
    setFeedback(editingId ? `Jugador "${pubDoc.fullName}" actualizado.` : `Jugador "${pubDoc.fullName}" registrado en ${tournament.name}.`);
    resetForm();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Duplicados evaluados estrictamente dentro del torneo activo
    const docMap = new Map<string, string>();
    playersPublic.forEach((pub) => {
      const priv = playersPrivate[pub.id];
      if (!priv || !priv.documentNumber) return;
      const norm = priv.documentNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (norm && norm !== 'SD') docMap.set(norm, priv.playerId);
    });
    const parsed = await parsePlayersImportFile(file, docMap, enabledCategories);
    setImportRows(parsed);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!tournament) return;
    setImporting(true);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      let importedCount = 0;
      const refreshedIds: string[] = [];

      for (const row of importRows) {
        if (row.status === 'error') continue;
        if (row.status === 'duplicate' && skipDuplicates) continue;

        const id = row.existingPlayerId || makeId('pl');
        const existing = playersPublic.find((p) => p.id === id);

        const pubDoc: PlayerPublic = {
          id,
          tournamentId: existing?.tournamentId || tournament.id,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: `${row.firstName} ${row.lastName}`,
          club: row.club,
          habitualCategory: row.habitualCategory,
          gender: row.gender,
          dominantHand: existing?.dominantHand || 'Diestro',
          backhand: existing?.backhand || 'Dos manos',
          bio: existing?.bio || '',
          photoUrl: existing?.photoUrl ?? null,
          stats: existing?.stats || {
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            setsWon: 0,
            setsLost: 0,
            gamesWon: 0,
            gamesLost: 0,
            titles: 0,
            currentStreak: 0,
          },
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        const privDoc: PlayerPrivate = {
          id,
          playerId: id,
          tournamentId: pubDoc.tournamentId,
          documentNumber: row.documentNumber,
          birthDate: row.birthDate,
          phone: row.phone,
          email: row.email,
          updatedAt: now,
        };

        await saveEntity('players_public', pubDoc);
        await saveEntity('players_private', privDoc);
        refreshedIds.push(id);
        importedCount++;
      }

      if (refreshedIds.length > 0) await onRefreshPrivate(refreshedIds);
      setImportRows([]);
      setFeedback(`Importación completada en ${tournament.name}: ${importedCount} jugadores procesados.`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeletePlayer = async (player: PlayerPublic) => {
    await deletePlayerCascade(player.id);
    setConfirmDeleteId(null);
    if (editingId === player.id) resetForm();
    setFeedback(`Jugador "${player.fullName}" eliminado del torneo.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#7C1FA2]">
            Torneo activo · {tournament?.name || 'Sin torneo seleccionado'}
          </p>
          <h2 className="text-xl font-bold text-[#0A1633]">Padrón Privado de Jugadores del Torneo</h2>
          <p className="text-xs text-[#475569]">
            Cada torneo carga y administra su propio padrón privado de jugadores. El documento y contacto quedan aislados del portal público.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadCsvTemplate(enabledCategories)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-[38px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Plantilla CSV
          </button>

          {canCreate && (
            <>
              <label className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#7C1FA2]" />
                Importar Excel / CSV
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
              >
                <Plus className="w-4 h-4" />
                Nuevo jugador
              </button>
            </>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#7C1FA2]">
          {feedback}
        </div>
      )}

      {/* Vista previa de importación Excel/CSV */}
      {importRows.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-[#7C1FA2]" />
              <div>
                <h3 className="text-sm font-semibold text-[#0A1633]">
                  Vista previa de importación ({importRows.length} filas)
                </h3>
                <p className="text-xs text-[#475569]">
                  Válidos: {importRows.filter((r) => r.status === 'valid').length} · Duplicados:{' '}
                  {importRows.filter((r) => r.status === 'duplicate').length} · Errores:{' '}
                  {importRows.filter((r) => r.status === 'error').length}
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[#0A1633]">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              Omitir documentos duplicados
            </label>
          </div>

          <div className="overflow-x-auto max-h-64 border border-[#E2E8F0] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                <tr>
                  <th className="py-2 px-3">Fila</th>
                  <th className="py-2 px-3">Jugador</th>
                  <th className="py-2 px-3">Documento</th>
                  <th className="py-2 px-3">Club / Cat.</th>
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {importRows.map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="py-2 px-3 font-mono">{row.rowIndex}</td>
                    <td className="py-2 px-3 font-medium text-[#0A1633]">
                      {row.firstName} {row.lastName}
                    </td>
                    <td className="py-2 px-3 font-mono">{row.documentNumber || '—'}</td>
                    <td className="py-2 px-3">
                      {row.club} · {row.habitualCategory}
                    </td>
                    <td className="py-2 px-3 font-medium">
                      <span
                        className={
                          row.status === 'valid'
                            ? 'text-[#15803D]'
                            : row.status === 'duplicate'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }
                      >
                        {row.status === 'valid' ? 'Válido' : row.status === 'duplicate' ? 'Duplicado' : 'Error'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#475569]">{row.messages.join(' · ') || 'Listo para importar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setImportRows([])}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569]"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-4 py-2 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
            >
              {importing ? 'Importando...' : 'Confirmar importación'}
            </button>
          </div>
        </div>
      )}

      {/* Formulario crear/editar jugador */}
      {showForm && (
        <form
          onSubmit={handleSavePlayer}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-[#0A1633]">
            {editingId ? 'Editar ficha de jugador' : 'Registrar nuevo jugador'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Nombres *
              </label>
              <input
                required
                placeholder="Ej. Martín"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Apellidos *
              </label>
              <input
                required
                placeholder="Ej. Benítez"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Documento CI / DNI (opcional)
              </label>
              <input
                placeholder="Ej. 4589120"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Fecha de nacimiento (opcional)
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Teléfono
              </label>
              <input
                placeholder="+595 981 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@ejemplo.py"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Club
              </label>
              <input
                placeholder="Club o academia"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Categoría del torneo *
              </label>
              <select
                value={habitualCategory}
                onChange={(e) => setHabitualCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm"
              >
                {selectableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#475569] mt-1">
                {enabledCategories.length > 0
                  ? `Categorías habilitadas en ${tournament?.name}: ${enabledCategories.join(', ')}`
                  : 'Sin divisiones creadas aún en este torneo; mostrando categorías estándar.'}
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Rama
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm"
              >
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Mano hábil
              </label>
              <select
                value={dominantHand}
                onChange={(e) => setDominantHand(e.target.value as 'Diestro' | 'Zurdo')}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm"
              >
                <option value="Diestro">Mano: Diestro</option>
                <option value="Zurdo">Mano: Zurdo</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Revés
              </label>
              <select
                value={backhand}
                onChange={(e) => setBackhand(e.target.value as 'Una mano' | 'Dos manos')}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm"
              >
                <option value="Dos manos">Revés: Dos manos</option>
                <option value="Una mano">Revés: Una mano</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Biografía / Perfil público
              </label>
              <input
                placeholder="Notas deportivas opcionales"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Vista previa foto de jugador"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-[#E2E8F0]"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[#7C1FA2] text-white flex items-center justify-center font-bold text-sm">
                  {(firstName[0] || 'J').toUpperCase()}
                  {(lastName[0] || 'T').toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-[#0A1633]">Foto del jugador (opcional)</p>
                <p className="text-[11px] text-[#475569]">
                  JPG, PNG o WebP · Se muestra en perfiles, ranking y podio público.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 cursor-pointer">
                <Camera className="w-3.5 h-3.5 text-[#7C1FA2]" />
                {uploadingPhoto ? 'Subiendo foto...' : photoUrl ? 'Cambiar foto' : 'Subir foto'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoUrl('')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
            >
              {editingId ? 'Guardar cambios' : 'Registrar jugador'}
            </button>
          </div>
        </form>
      )}

      {/* Buscador y Tabla Privada */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto flex-1">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, documento, club o correo..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoría"
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
            >
              <option value="ALL">Todas las categorías</option>
              {filterCategoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  Cat. {cat}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-[#475569] font-mono tabular-nums">
            {filtered.length} jugadores registrados
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#475569]">
            Este torneo todavía no tiene jugadores cargados. Registrá jugadores manualmente o importalos desde Excel / CSV.
          </div>
        ) : (
          <>
            {/* Vista móvil en tarjetas (< md) */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {filtered.map((p) => {
                const priv = playersPrivate[p.id];
                const activeRegCount = registrations.filter(
                  (r) => r.tournamentId === p.tournamentId && r.status !== 'retirada' && r.playerIds.includes(p.id)
                ).length;
                return (
                  <div key={p.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt={p.fullName}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover border border-[#E2E8F0] shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-[#7C1FA2]/10 text-[#7C1FA2] flex items-center justify-center font-bold text-xs shrink-0">
                            {p.firstName[0]}
                            {p.lastName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0A1633] text-sm truncate">{p.fullName}</p>
                          <p className="text-xs text-[#475569] truncate">
                            {p.club} · Cat. {p.habitualCategory}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5">
                      <div>
                        <p className="text-[11px] text-[#475569]">Doc. / Nac.</p>
                        <p className="font-mono tabular-nums text-[#0A1633] truncate">
                          {priv ? (priv.documentNumber && priv.documentNumber !== 'S/D' ? priv.documentNumber : 'Sin documento') : '—'}
                          {priv?.birthDate ? ` · ${priv.birthDate}` : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#475569]">Récord</p>
                        <p className="font-mono tabular-nums text-[#0A1633]">
                          {p.stats.wins}G - {p.stats.losses}P
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[11px] text-[#475569]">Contacto</p>
                        <p className="text-[#0A1633] truncate">
                          {priv?.phone || '—'} · {priv?.email || '—'}
                        </p>
                      </div>
                    </div>

                    {confirmDeleteId === p.id ? (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-2 text-xs">
                        <p className="font-medium text-red-900">
                          ¿Eliminar a {p.fullName} de este torneo?
                          {activeRegCount > 0 ? ` (Tiene ${activeRegCount} inscripción/es activa/s)` : ''}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 min-h-[40px] rounded-lg border border-red-200 bg-white font-medium text-[#0A1633]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePlayer(p)}
                            className="flex-1 min-h-[40px] rounded-lg bg-red-700 text-white font-medium"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {canEdit && (
                          <button
                            onClick={() => startEdit(p)}
                            className="flex-1 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                          >
                            Editar ficha
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="min-h-[44px] px-4 rounded-xl border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vista escritorio en tabla (md+) */}
            <div className="hidden md:block overflow-x-auto clean-scroll">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#475569]">
                    <th className="py-2.5 px-4">Jugador</th>
                    <th className="py-2.5 px-4">Documento (PII)</th>
                    <th className="py-2.5 px-4">Contacto (PII)</th>
                    <th className="py-2.5 px-4">Club y Categoría</th>
                    <th className="py-2.5 px-4 text-right">Récord</th>
                    <th className="py-2.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {filtered.map((p) => {
                    const priv = playersPrivate[p.id];
                    const activeRegCount = registrations.filter(
                      (r) => r.tournamentId === p.tournamentId && r.status !== 'retirada' && r.playerIds.includes(p.id)
                    ).length;
                    return (
                      <tr key={p.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {p.photoUrl ? (
                              <img
                                src={p.photoUrl}
                                alt={p.fullName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-[#7C1FA2]/10 text-[#7C1FA2] flex items-center justify-center font-bold text-xs shrink-0">
                                {p.firstName[0]}
                                {p.lastName[0]}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-[#0A1633] text-sm">{p.fullName}</p>
                              <p className="text-[#475569]">
                                {p.gender} · {p.dominantHand}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-[#0A1633]">
                          <div>
                            {priv
                              ? priv.documentNumber && priv.documentNumber !== 'S/D'
                                ? priv.documentNumber
                                : 'Sin documento'
                              : '—'}
                          </div>
                          <div className="text-[#475569]">{priv?.birthDate || '—'}</div>
                        </td>
                        <td className="py-3 px-4 text-[#475569]">
                          <div>{priv?.phone || '—'}</div>
                          <div>{priv?.email || '—'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-[#0A1633] font-medium">{p.club}</div>
                          <div className="text-[#475569]">Cat. {p.habitualCategory}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {p.stats.wins}G - {p.stats.losses}P
                        </td>
                        <td className="py-3 px-4 text-right">
                          {confirmDeleteId === p.id ? (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {activeRegCount > 0 && (
                                <span className="text-[11px] text-red-700 font-medium">
                                  ({activeRegCount} insc.)
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1 rounded border border-[#E2E8F0] bg-white text-[11px]"
                              >
                                No
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(p)}
                                className="px-2.5 py-1 rounded bg-red-700 text-white text-[11px] font-medium"
                              >
                                Eliminar
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => startEdit(p)}
                                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                                >
                                  Editar
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  title="Eliminar jugador"
                                  className="p-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
