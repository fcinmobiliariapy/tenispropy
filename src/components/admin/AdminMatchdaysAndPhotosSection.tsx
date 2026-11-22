import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  CheckCircle2,
  Edit3,
  FileImage,
  Images,
  Plus,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  Division,
  Match,
  Matchday,
  MatchdayPhoto,
  RescheduleRecord,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import { optimizeAndUploadPhoto } from '../../utils/imageOptimizer';
import {
  autoProposeSchedule,
  compareMatchesByRound,
  dedupeMatches,
  detectScheduleConflicts,
  formatAsuncionDate,
  makeId,
} from '../../utils/tournamentEngine';
import {
  deleteMatchdayCascade,
  publishNotificationAndBroadcast,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

interface Props {
  tournament: Tournament;
  tournaments: Tournament[];
  division: Division;
  divisions?: Division[];
  onSelectDivision?: (id: string) => void;
  matchdays: Matchday[];
  divisionMatches: Match[];
  allMatches: Match[];
  publishedPhotos: MatchdayPhoto[];
  draftPhotos: MatchdayPhoto[];
  onDraftPhotosChange: (photos: MatchdayPhoto[]) => void;
  userEmail: string;
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
  onOpenFlyerModal?: () => void;
}

export const AdminMatchdaysAndPhotosSection: React.FC<Props> = ({
  tournament,
  tournaments,
  division,
  divisions,
  onSelectDivision,
  matchdays,
  divisionMatches,
  allMatches,
  publishedPhotos,
  draftPhotos,
  onDraftPhotosChange,
  userEmail,
  isSuperAdmin,
  permissions,
  onOpenFlyerModal,
}) => {
  const canCreate = permissions ? permissions.canCreate : true;
  const canEdit = permissions ? permissions.canEdit : true;
  const canDelete = permissions ? (permissions.canDelete || isSuperAdmin) : isSuperAdmin;
  const [selectedMatchdayId, setSelectedMatchdayId] = useState<string>(
    matchdays[0]?.id || ''
  );
  const [innerTab, setInnerTab] = useState<'partidos' | 'fotos'>('partidos');
  const [schedulePhaseFilter, setSchedulePhaseFilter] = useState<'ALL' | 'grupos' | 'eliminacion'>('ALL');

  // Nueva / Editar / Eliminar jornada
  const [showNewMd, setShowNewMd] = useState(false);
  const [mdName, setMdName] = useState('');
  const [mdDate, setMdDate] = useState('');
  const [mdDesc, setMdDesc] = useState('');
  const [editingMdId, setEditingMdId] = useState<string | null>(null);
  const [editMdName, setEditMdName] = useState('');
  const [editMdDate, setEditMdDate] = useState('');
  const [editMdOrder, setEditMdOrder] = useState(1);
  const [editMdDesc, setEditMdDesc] = useState('');
  const [confirmDeleteMdId, setConfirmDeleteMdId] = useState<string | null>(null);

  // Edición de horario de partido
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editCourtId, setEditCourtId] = useState('');
  const [editMatchdayId, setEditMatchdayId] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Fotos
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tournamentsMap = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments]
  );

  const activeMatchday =
    matchdays.find((m) => m.id === selectedMatchdayId) || matchdays[0] || null;

  const activeScheduleConflicts = useMemo(() => {
    if (!editingMatchId) return [];
    const m = divisionMatches.find((x) => x.id === editingMatchId);
    if (!m) return [];
    return detectScheduleConflicts(
      {
        matchId: m.id,
        tournamentId: tournament.id,
        date: editDate,
        time: editTime,
        courtId: editCourtId,
        playerIds: [...m.playerIdsA, ...m.playerIdsB],
      },
      allMatches,
      tournamentsMap
    );
  }, [editingMatchId, editDate, editTime, editCourtId, divisionMatches, allMatches, tournament.id, tournamentsMap]);

  // Fotos combinadas (borrador + publicadas de esta jornada)
  const matchdayPhotos = useMemo(() => {
    if (!activeMatchday) return [];
    const combined = [
      ...publishedPhotos.filter((p) => p.matchdayId === activeMatchday.id),
      ...draftPhotos.filter((p) => p.matchdayId === activeMatchday.id),
    ];
    const dedup = new Map<string, MatchdayPhoto>();
    combined.forEach((p) => dedup.set(p.id, p));
    return Array.from(dedup.values()).sort((a, b) => a.order - b.order);
  }, [activeMatchday, publishedPhotos, draftPhotos]);

  const handleCreateMatchday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mdName.trim()) return;
    const now = new Date().toISOString();
    const md: Matchday = {
      id: makeId('md'),
      tournamentId: tournament.id,
      divisionId: division.id,
      name: mdName.trim(),
      date: mdDate.trim(),
      order: matchdays.length + 1,
      description: mdDesc.trim(),
      galleryPublished: false,
      coverPhotoId: null,
      createdAt: now,
      updatedAt: now,
    };
    await saveEntity('matchdays', md);
    setSelectedMatchdayId(md.id);
    setMdName('');
    setMdDate('');
    setMdDesc('');
    setShowNewMd(false);
    setFeedback(`Jornada "${md.name}" creada.`);
  };

  const startEditMatchday = (md: Matchday) => {
    setEditingMdId(md.id);
    setEditMdName(md.name);
    setEditMdDate(md.date || '');
    setEditMdOrder(md.order);
    setEditMdDesc(md.description || '');
    setConfirmDeleteMdId(null);
  };

  const handleSaveMatchdayEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMdId || !editMdName.trim()) return;
    const existing = matchdays.find((m) => m.id === editingMdId);
    if (!existing) return;
    const updated: Matchday = {
      ...existing,
      name: editMdName.trim(),
      date: editMdDate.trim(),
      order: Number(editMdOrder) || existing.order,
      description: editMdDesc.trim(),
      updatedAt: new Date().toISOString(),
    };
    await saveEntity('matchdays', updated);
    setEditingMdId(null);
    setFeedback(`Jornada "${updated.name}" actualizada.`);
  };

  const handleDeleteMatchday = async (md: Matchday) => {
    await deleteMatchdayCascade(md.id, divisionMatches, publishedPhotos, draftPhotos);
    onDraftPhotosChange(draftPhotos.filter((p) => p.matchdayId !== md.id));
    setConfirmDeleteMdId(null);
    setEditingMdId(null);
    const remaining = matchdays.find((m) => m.id !== md.id);
    setSelectedMatchdayId(remaining?.id || '');
    setFeedback(`Jornada "${md.name}" y sus fotos eliminadas.`);
  };

  const openScheduleEditor = (m: Match) => {
    setEditingMatchId(m.id);
    setEditDate(m.scheduledDate || '');
    setEditTime(m.scheduledTime || '');
    setEditCourtId(m.courtId || '');
    setEditMatchdayId(m.matchdayId || activeMatchday?.id || '');
    setRescheduleReason('');
  };

  const handleSaveMatchSchedule = async (forceOverride = false) => {
    if (!editingMatchId) return;
    const match = divisionMatches.find((x) => x.id === editingMatchId);
    if (!match) return;
    if (activeScheduleConflicts.length > 0 && !forceOverride) {
      setErrorMsg('Hay conflictos horarios detectados. Corregí el horario o confirmá guardar igualmente.');
      return;
    }

    const cleanDate = editDate.trim() || null;
    const cleanTime = editTime.trim() || null;
    const court = tournament.courts.find((c) => c.id === editCourtId) || null;
    const now = new Date().toISOString();
    const isReschedule = Boolean(
      match.scheduledDate &&
        (match.scheduledDate !== cleanDate ||
          (match.scheduledTime || null) !== cleanTime ||
          (match.courtId || null) !== (court?.id || null))
    );

    const nextHistory: RescheduleRecord[] = [...match.rescheduleHistory];
    if (isReschedule) {
      nextHistory.push({
        id: makeId('res'),
        at: now,
        byEmail: userEmail,
        reason: rescheduleReason.trim() || 'Ajuste de programación',
        fromDate: match.scheduledDate || null,
        fromTime: match.scheduledTime || null,
        fromCourt: match.courtName || null,
        toDate: cleanDate || 'Sin fecha',
        toTime: cleanTime || 'TBC',
        toCourt: court?.name || 'Cancha por definir',
      });
    }

    const updated: Match = {
      ...match,
      matchdayId: editMatchdayId || null,
      scheduledDate: cleanDate,
      scheduledTime: cleanTime,
      courtId: court?.id || null,
      courtName: court?.name || null,
      status: isReschedule && match.status === 'programado' ? 'reprogramado' : match.status,
      rescheduleHistory: nextHistory,
      published: true,
      updatedAt: now,
    };

    await saveEntity('matches', updated);

    const scheduleParts = [
      cleanDate ? formatAsuncionDate(cleanDate) : 'Fecha por definir',
      cleanTime ? `${cleanTime} hs` : null,
      court?.name || null,
    ].filter(Boolean);

    await publishNotificationAndBroadcast(
      {
        id: makeId('notif'),
        tournamentId: tournament.id,
        divisionId: division.id,
        matchId: updated.id,
        title: isReschedule
          ? `Partido reprogramado · ${division.name}`
          : `Partido actualizado · ${division.name}`,
        body: `${updated.entryAName} vs ${updated.entryBName} — ${scheduleParts.join(' · ')}.`,
        targetPlayerIds: [...updated.playerIdsA, ...updated.playerIdsB],
        createdAt: now,
      },
      isReschedule ? 'match:rescheduled' : 'match:upcoming'
    );

    setEditingMatchId(null);
    setErrorMsg(null);
    setFeedback('Programación guardada y publicada.');
  };

  const handleAutoSchedule = async () => {
    setErrorMsg(null);
    const unscheduled = divisionMatches.filter((m) => !m.isBye && !m.scheduledDate);
    if (unscheduled.length === 0) {
      setFeedback('Todos los partidos de esta división ya tienen fecha y horario.');
      return;
    }
    const baseDate = activeMatchday?.date || tournament.startDate;
    const proposals = autoProposeSchedule(
      unscheduled,
      allMatches,
      tournament,
      tournamentsMap,
      baseDate
    );
    const now = new Date().toISOString();
    for (const prop of proposals) {
      const target = unscheduled.find((m) => m.id === prop.matchId);
      if (!target) continue;
      await saveEntity('matches', {
        ...target,
        matchdayId: target.matchdayId || activeMatchday?.id || null,
        scheduledDate: prop.date,
        scheduledTime: prop.time,
        courtId: prop.courtId,
        courtName: prop.courtName,
        published: true,
        updatedAt: now,
      });
    }
    setFeedback(`Propuesta automática aplicada a ${proposals.length} partidos sin conflictos.`);
  };

  const handleNotifyMatch = async (m: Match) => {
    const now = new Date().toISOString();
    await publishNotificationAndBroadcast(
      {
        id: makeId('notif'),
        tournamentId: tournament.id,
        divisionId: division.id,
        matchId: m.id,
        title: `Llamado a cancha · ${division.name}`,
        body: `${m.entryAName} vs ${m.entryBName} — Presentarse en ${m.courtName || 'Mesa de Control'} (${m.scheduledTime || 'ahora'} hs).`,
        targetPlayerIds: [...m.playerIdsA, ...m.playerIdsB],
        createdAt: now,
      },
      'match:upcoming'
    );
    setFeedback(`Notificación push enviada a ${m.entryAName} y ${m.entryBName}.`);
  };

  // Subida múltiple de fotos con miniaturas WebP
  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !activeMatchday) return;
    setUploadingPhotos(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      let currentMaxOrder = matchdayPhotos.reduce((acc, p) => Math.max(acc, p.order), 0);
      const newDrafts: MatchdayPhoto[] = [];

      for (const file of files) {
        const { thumbUrl, fullUrl } = await optimizeAndUploadPhoto(file);
        currentMaxOrder++;
        const photo: MatchdayPhoto = {
          id: makeId('ph'),
          tournamentId: tournament.id,
          divisionId: division.id,
          matchdayId: activeMatchday.id,
          matchId: null,
          thumbUrl,
          fullUrl,
          caption: '',
          order: currentMaxOrder,
          isCover: matchdayPhotos.length === 0 && newDrafts.length === 0,
          published: false,
          createdAt: now,
          updatedAt: now,
        };
        await saveEntity('photos_drafts', photo);
        newDrafts.push(photo);
      }

      onDraftPhotosChange([...draftPhotos, ...newDrafts]);
      setFeedback(`${newDrafts.length} foto(s) optimizada(s) cargadas en borrador.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir imágenes.');
    } finally {
      setUploadingPhotos(false);
      e.target.value = '';
    }
  };

  const handleUpdatePhotoMeta = async (photo: MatchdayPhoto, patch: Partial<MatchdayPhoto>) => {
    const updated: MatchdayPhoto = {
      ...photo,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const col = updated.published ? 'photos' : 'photos_drafts';
    await saveEntity(col, updated);
    if (!updated.published) {
      onDraftPhotosChange(draftPhotos.map((p) => (p.id === updated.id ? updated : p)));
    }
  };

  const handleSetCover = async (photo: MatchdayPhoto) => {
    if (!activeMatchday) return;
    for (const p of matchdayPhotos) {
      const shouldCover = p.id === photo.id;
      if (p.isCover !== shouldCover) {
        await handleUpdatePhotoMeta(p, { isCover: shouldCover });
      }
    }
    await saveEntity('matchdays', {
      ...activeMatchday,
      coverPhotoId: photo.id,
      updatedAt: new Date().toISOString(),
    });
    setFeedback('Portada de la jornada actualizada.');
  };

  const handleReorderPhoto = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= matchdayPhotos.length) return;
    const a = matchdayPhotos[idx];
    const b = matchdayPhotos[targetIdx];
    await handleUpdatePhotoMeta(a, { order: b.order });
    await handleUpdatePhotoMeta(b, { order: a.order });
  };

  const handleDeletePhoto = async (photo: MatchdayPhoto) => {
    const col = photo.published ? 'photos' : 'photos_drafts';
    await removeEntity(col, photo.id);
    if (!photo.published) {
      onDraftPhotosChange(draftPhotos.filter((p) => p.id !== photo.id));
    }
    setConfirmDeletePhotoId(null);
    setFeedback('Foto eliminada.');
  };

  const handlePublishGallery = async () => {
    if (!activeMatchday) return;
    const now = new Date().toISOString();
    const toPublish = matchdayPhotos.filter((p) => !p.published);
    for (const p of toPublish) {
      const pubPhoto: MatchdayPhoto = { ...p, published: true, updatedAt: now };
      await saveEntity('photos', pubPhoto);
      await removeEntity('photos_drafts', p.id);
    }
    onDraftPhotosChange(draftPhotos.filter((p) => p.matchdayId !== activeMatchday.id));

    await saveEntity('matchdays', {
      ...activeMatchday,
      galleryPublished: true,
      updatedAt: now,
    });

    await publishNotificationAndBroadcast(
      {
        id: makeId('notif'),
        tournamentId: tournament.id,
        divisionId: division.id,
        title: `Galería publicada · ${activeMatchday.name}`,
        body: `Ya podés ver las ${matchdayPhotos.length} fotos de ${activeMatchday.name} en ${division.name}.`,
        targetPlayerIds: [],
        createdAt: now,
      },
      'gallery:published'
    );

    setFeedback(`Galería de "${activeMatchday.name}" publicada para el público.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#7C1FA2] font-medium">
            {tournament.name} · Zona America/Asuncion
          </p>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Jornadas, Fixture y Fotos — {division.name}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {onOpenFlyerModal && (
            <button
              type="button"
              onClick={onOpenFlyerModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
            >
              <FileImage className="w-3.5 h-3.5 text-[#0095FF]" />
              Flyer de cruces
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleAutoSchedule}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
            >
              <Wand2 className="w-3.5 h-3.5 text-[#7C1FA2]" />
              Proponer horarios automáticos
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => setShowNewMd((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
            >
              <Plus className="w-4 h-4" />
              Nueva jornada
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#7C1FA2]">
          {feedback}
        </div>
      )}

      {divisions && divisions.length > 1 && onSelectDivision && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mr-1">
            Categoría / División:
          </span>
          {divisions.map((d) => {
            const active = d.id === division.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onSelectDivision(d.id);
                  setEditingMatchId(null);
                  setSchedulePhaseFilter('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#7C1FA2] text-white'
                    : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#0A1633] hover:bg-slate-100'
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      )}

      {showNewMd && (
        <form
          onSubmit={handleCreateMatchday}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Nombre jornada *</label>
            <input
              required
              placeholder="Ej. Jornada 3 · Semifinales"
              value={mdName}
              onChange={(e) => setMdName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Fecha (opcional)</label>
            <input
              type="date"
              value={mdDate}
              onChange={(e) => setMdDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Descripción</label>
            <input
              placeholder="Resumen opcional"
              value={mdDesc}
              onChange={(e) => setMdDesc(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-4 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
          >
            Crear jornada
          </button>
        </form>
      )}

      {/* Selector de Jornada y Pestañas (Partidos vs Fotos) */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC]">
          <div className="flex items-center gap-2 overflow-x-auto">
            {matchdays.map((md) => (
              <button
                key={md.id}
                onClick={() => setSelectedMatchdayId(md.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeMatchday?.id === md.id
                    ? 'bg-[#0A1633] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#475569]'
                }`}
              >
                {md.name}{md.date ? ` (${md.date})` : ''}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeMatchday && (canEdit || canDelete) && (
              <div className="flex items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => startEditMatchday(activeMatchday)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    Editar jornada
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMdId(activeMatchday.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
              <button
                onClick={() => setInnerTab('partidos')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                  innerTab === 'partidos' ? 'bg-[#7C1FA2] text-white' : 'text-[#475569]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Partidos y horarios
              </button>
              <button
                onClick={() => setInnerTab('fotos')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                  innerTab === 'fotos' ? 'bg-[#7C1FA2] text-white' : 'text-[#475569]'
                }`}
              >
                <Images className="w-3.5 h-3.5" />
                Fotos ({matchdayPhotos.length})
              </button>
            </div>
          </div>
        </div>

        {editingMdId && activeMatchday?.id === editingMdId && (
          <form
            onSubmit={handleSaveMatchdayEdit}
            className="p-4 border-b border-[#E2E8F0] bg-[#FAFBF9] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-[#475569] mb-1">Nombre jornada</label>
              <input
                required
                value={editMdName}
                onChange={(e) => setEditMdName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1">Fecha (opcional)</label>
              <input
                type="date"
                value={editMdDate}
                onChange={(e) => setEditMdDate(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-[#475569] mb-1">Orden</label>
              <input
                type="number"
                min={1}
                value={editMdOrder}
                onChange={(e) => setEditMdOrder(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-mono"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-[#475569] mb-1">Descripción</label>
              <input
                value={editMdDesc}
                onChange={(e) => setEditMdDesc(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditingMdId(null)}
                className="px-3 h-9 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3.5 h-9 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium"
              >
                Guardar
              </button>
            </div>
          </form>
        )}

        {confirmDeleteMdId && activeMatchday?.id === confirmDeleteMdId && (
          <div className="p-4 border-b border-red-200 bg-red-50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-red-900 font-medium">
              ¿Eliminar la jornada "{activeMatchday.name}" y todas sus fotos? (Los partidos vinculados quedarán sin jornada asignada).
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteMdId(null)}
                className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-[#0A1633]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMatchday(activeMatchday)}
                className="px-3.5 py-1.5 rounded-lg bg-red-700 text-white font-medium"
              >
                Confirmar eliminación
              </button>
            </div>
          </div>
        )}

        {/* PESTAÑA PARTIDOS Y HORARIOS */}
        {innerTab === 'partidos' && (
          <div className="p-5 space-y-4">
            {editingMatchId && (
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#0A1633]">
                    Programar / Reprogramar partido (fechas opcionales)
                  </h4>
                  {(editDate || editTime) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDate('');
                        setEditTime('');
                      }}
                      className="text-xs font-medium text-[#475569] hover:text-[#0A1633] underline"
                    >
                      Dejar sin fecha ni hora
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">Jornada</label>
                    <select
                      value={editMatchdayId}
                      onChange={(e) => setEditMatchdayId(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                    >
                      <option value="">Sin jornada asignada</option>
                      {matchdays.map((md) => (
                        <option key={md.id} value={md.id}>
                          {md.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">Fecha (opcional)</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">Hora (opcional)</label>
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">Cancha</label>
                    <select
                      value={editCourtId}
                      onChange={(e) => setEditCourtId(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                    >
                      <option value="">Cancha por definir</option>
                      {tournament.courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">Motivo si reprograma</label>
                    <input
                      placeholder="Motivo opcional..."
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                    />
                  </div>
                </div>

                {activeScheduleConflicts.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                    {activeScheduleConflicts.map((c, idx) => (
                      <p key={idx} className="text-xs text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>{c.message}</span>
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingMatchId(null)}
                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                  >
                    Cancelar
                  </button>
                  {activeScheduleConflicts.length > 0 ? (
                    <button
                      onClick={() => handleSaveMatchSchedule(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium"
                    >
                      Guardar pese al conflicto
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSaveMatchSchedule(false)}
                      className="px-4 py-1.5 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium"
                    >
                      Guardar programación
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-1.5">
                {(['ALL', 'grupos', 'eliminacion'] as const).map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => setSchedulePhaseFilter(ph)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      schedulePhaseFilter === ph
                        ? 'bg-[#0A1633] text-white'
                        : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569]'
                    }`}
                  >
                    {ph === 'ALL' ? 'Todos' : ph === 'grupos' ? 'Grupos' : 'Eliminación'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[#475569]">
                División activa: <strong className="text-[#0A1633]">{division.name}</strong>
              </span>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {dedupeMatches(divisionMatches)
                .filter((m) => !m.isBye && (schedulePhaseFilter === 'ALL' || m.phase === schedulePhaseFilter))
                .sort(compareMatchesByRound)
                .map((m) => (
                  <div
                    key={m.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs text-[#475569]">
                        {m.roundName} ·{' '}
                        {m.matchdayId
                          ? matchdays.find((md) => md.id === m.matchdayId)?.name || 'Jornada'
                          : 'Sin jornada'}
                      </p>
                      <p className="text-sm font-semibold text-[#0A1633]">
                        {m.entryAName} vs {m.entryBName}
                      </p>
                      {m.rescheduleHistory.length > 0 && (
                        <p className="text-[11px] text-[#C2410C] mt-0.5">
                          Reprogramado {m.rescheduleHistory.length} vez/veces (último:{' '}
                          {m.rescheduleHistory[m.rescheduleHistory.length - 1].reason})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono tabular-nums text-[#475569]">
                        {m.scheduledDate ? `${m.scheduledDate} ${m.scheduledTime || ''}` : 'Sin horario'}{' '}
                        · {m.courtName || 'Sin cancha'}
                      </span>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => openScheduleEditor(m)}
                            className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0A1633] hover:bg-slate-50"
                          >
                            Programar
                          </button>
                          <button
                            onClick={() => handleNotifyMatch(m)}
                            title="Enviar alerta push a los jugadores"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#7C1FA2] hover:bg-emerald-50"
                          >
                            <Bell className="w-3.5 h-3.5" />
                            Llamar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* PESTAÑA FOTOS DE LA JORNADA */}
        {innerTab === 'fotos' && activeMatchday && (
          <div className="p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#0A1633]">
                  Galería de {activeMatchday.name}
                </h3>
                <p className="text-xs text-[#475569]">
                  Admite JPG, PNG y WebP · Se generan miniaturas WebP automáticas para carga rápida móvil.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-4 h-4 text-[#7C1FA2]" />
                    {uploadingPhotos ? 'Optimizando y subiendo...' : 'Subir fotos'}
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadPhotos}
                      disabled={uploadingPhotos}
                      className="hidden"
                    />
                  </label>
                )}

                {canEdit && (
                  <button
                    onClick={handlePublishGallery}
                    disabled={matchdayPhotos.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B] disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {activeMatchday.galleryPublished ? 'Actualizar publicación' : 'Publicar galería'}
                  </button>
                )}
              </div>
            </div>

            {matchdayPhotos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E2E8F0] p-10 text-center text-xs text-[#475569]">
                Subí una o varias fotos desde tu computadora o celular para revisar la galería en borrador.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchdayPhotos.map((ph, idx) => (
                  <div
                    key={ph.id}
                    className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-[#F8FAFC] flex flex-col"
                  >
                    <div className="relative aspect-[4/3] bg-slate-200">
                      <img
                        src={ph.thumbUrl}
                        alt={ph.caption || `Foto ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded">
                        {ph.published ? 'Publicada' : 'Borrador'} {ph.isCover ? '· Portada' : ''}
                      </div>
                    </div>

                    <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Pie de foto opcional..."
                          defaultValue={ph.caption || ''}
                          onBlur={(e) => handleUpdatePhotoMeta(ph, { caption: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                        />
                        <select
                          value={ph.matchId || ''}
                          onChange={(e) =>
                            handleUpdatePhotoMeta(ph, { matchId: e.target.value || null })
                          }
                          className="w-full h-8 px-2 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                        >
                          <option value="">Sin partido vinculado</option>
                          {divisionMatches
                            .filter((m) => !m.isBye)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.entryAName} vs {m.entryBName}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                        {confirmDeletePhotoId === ph.id ? (
                          <div className="p-2 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-red-900 font-medium">¿Eliminar foto?</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePhotoId(null)}
                                className="px-2 py-1 rounded border border-red-200 bg-white text-[#0A1633]"
                              >
                                No
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(ph)}
                                className="px-2 py-1 rounded bg-red-700 text-white font-medium"
                              >
                                Sí
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleReorderPhoto(idx, -1)}
                                disabled={idx === 0}
                                title="Subir orden"
                                className="p-1.5 rounded border border-[#E2E8F0] bg-white text-[#475569] disabled:opacity-40"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReorderPhoto(idx, 1)}
                                disabled={idx === matchdayPhotos.length - 1}
                                title="Bajar orden"
                                className="p-1.5 rounded border border-[#E2E8F0] bg-white text-[#475569] disabled:opacity-40"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => handleSetCover(ph)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                                    ph.isCover
                                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                                      : 'bg-white border-[#E2E8F0] text-[#475569]'
                                  }`}
                                >
                                  <Star className="w-3 h-3" />
                                  Portada
                                </button>
                              )}
                              {((!ph.published && canEdit) || canDelete) && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePhotoId(ph.id)}
                                  title="Eliminar foto"
                                  className="p-1.5 rounded border border-red-200 bg-white text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
