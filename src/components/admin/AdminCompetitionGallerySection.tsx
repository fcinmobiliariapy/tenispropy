import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Info,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Division,
  Match,
  Matchday,
  MatchdayPhoto,
  StaffPermissions,
  Tournament,
} from '../../types/tennis';
import {
  fetchUploadStorageStatus,
  getOptimizedImageUrl,
  optimizeAndUploadPhoto,
  UploadStorageStatus,
} from '../../utils/imageOptimizer';
import { makeId } from '../../utils/tournamentEngine';
import { isFootballTournament } from '../../utils/footballEngine';
import {
  publishNotificationAndBroadcast,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

const DEFAULT_ALBUMS = [
  'General',
  'Inauguración',
  'Partidos',
  'Premiación',
  'Sede / Canchas',
  'Destacadas',
];

const PROVIDER_DISPLAY: Record<
  UploadStorageStatus['activeProvider'],
  { label: string; detail: string; badgeClass: string }
> = {
  cloudinary: {
    label: 'Cloudinary CDN conectado',
    detail: 'Optimización WebP/AVIF automática y carpetas por competencia en Cloudinary.',
    badgeClass: 'bg-sky-50 border-sky-200 text-sky-900',
  },
  cloudflare_images: {
    label: 'Cloudflare Images conectado',
    detail: 'Carga directa (Direct Creator Upload) con red CDN global y cero consumo en Vercel.',
    badgeClass: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  cloudflare_r2: {
    label: 'Cloudflare R2 conectado',
    detail: 'Almacenamiento S3 sin cargos por ancho de banda (egress $0).',
    badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  local: {
    label: 'Modo desarrollo local (/uploads)',
    detail:
      'En producción (Vercel) conectá Cloudinary o Cloudflare Images mediante variables de entorno.',
    badgeClass: 'bg-slate-100 border-[#E2E8F0] text-[#0A1633]',
  },
};

interface Props {
  tournament: Tournament;
  divisions: Division[];
  matchdays: Matchday[];
  matches: Match[];
  publishedPhotos: MatchdayPhoto[];
  draftPhotos: MatchdayPhoto[];
  onDraftPhotosChange: (photos: MatchdayPhoto[]) => void;
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
}

export const AdminCompetitionGallerySection: React.FC<Props> = ({
  tournament,
  divisions,
  matchdays,
  matches,
  publishedPhotos,
  draftPhotos,
  onDraftPhotosChange,
  isSuperAdmin,
  permissions,
}) => {
  const canCreate = permissions ? permissions.canCreate : true;
  const canEdit = permissions ? permissions.canEdit : true;
  const canDelete = permissions ? permissions.canDelete || isSuperAdmin : isSuperAdmin;

  const [storageStatus, setStorageStatus] = useState<UploadStorageStatus | null>(null);
  const [showProviderGuide, setShowProviderGuide] = useState(false);

  // Parámetros de subida
  const [uploadDivisionId, setUploadDivisionId] = useState<string>('');
  const [uploadMatchdayId, setUploadMatchdayId] = useState<string>('');
  const [uploadAlbum, setUploadAlbum] = useState<string>('General');
  const [customAlbum, setCustomAlbum] = useState<string>('');
  const [publishImmediately, setPublishImmediately] = useState<boolean>(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    active: boolean;
    current: number;
    total: number;
    fileName: string;
  }>({ active: false, current: 0, total: 0, fileName: '' });

  // Filtros de administración
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'published' | 'draft'>('ALL');
  const [albumFilter, setAlbumFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchUploadStorageStatus(true).then((status) => {
      if (active) setStorageStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUploadDivisionId('');
    setUploadMatchdayId('');
    setAlbumFilter('ALL');
    setDivisionFilter('ALL');
    setConfirmDeleteId(null);
    setFeedback(null);
    setErrorMsg(null);
  }, [tournament.id]);

  const tournamentDivisions = useMemo(
    () => divisions.filter((d) => d.tournamentId === tournament.id),
    [divisions, tournament.id]
  );

  const tournamentMatchdays = useMemo(
    () =>
      matchdays
        .filter((md) => md.tournamentId === tournament.id)
        .sort((a, b) => a.order - b.order),
    [matchdays, tournament.id]
  );

  const uploadFilteredMatchdays = useMemo(() => {
    if (!uploadDivisionId) return tournamentMatchdays;
    return tournamentMatchdays.filter((md) => md.divisionId === uploadDivisionId);
  }, [tournamentMatchdays, uploadDivisionId]);

  const tournamentMatches = useMemo(
    () => matches.filter((m) => m.tournamentId === tournament.id && !m.isBye),
    [matches, tournament.id]
  );

  const combinedPhotos = useMemo(() => {
    const map = new Map<string, MatchdayPhoto>();
    publishedPhotos
      .filter((p) => p.tournamentId === tournament.id)
      .forEach((p) => map.set(p.id, p));
    draftPhotos
      .filter((p) => p.tournamentId === tournament.id)
      .forEach((p) => map.set(p.id, p));
    return Array.from(map.values()).sort(
      (a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt)
    );
  }, [publishedPhotos, draftPhotos, tournament.id]);

  const draftCount = useMemo(
    () => combinedPhotos.filter((p) => !p.published).length,
    [combinedPhotos]
  );

  const albumFilterOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_ALBUMS);
    combinedPhotos.forEach((p) => {
      if (p.album && p.album.trim()) set.add(p.album.trim());
    });
    return Array.from(set);
  }, [combinedPhotos]);

  const filteredPhotos = useMemo(() => {
    return combinedPhotos.filter((ph) => {
      if (statusFilter === 'published' && !ph.published) return false;
      if (statusFilter === 'draft' && ph.published) return false;
      if (albumFilter !== 'ALL' && ((ph.album || '').trim() || 'General') !== albumFilter) {
        return false;
      }
      if (divisionFilter === 'GENERAL' && ph.divisionId) return false;
      if (
        divisionFilter !== 'ALL' &&
        divisionFilter !== 'GENERAL' &&
        ph.divisionId !== divisionFilter
      ) {
        return false;
      }
      return true;
    });
  }, [combinedPhotos, statusFilter, albumFilter, divisionFilter]);

  const effectiveAlbumName =
    uploadAlbum === '__CUSTOM__'
      ? customAlbum.trim() || 'General'
      : uploadAlbum.trim() || 'General';

  const processUploadFiles = async (files: File[]) => {
    if (files.length === 0 || !canCreate) return;
    setErrorMsg(null);
    setFeedback(null);
    setUploadProgress({
      active: true,
      current: 0,
      total: files.length,
      fileName: files[0]?.name || '',
    });

    try {
      const now = new Date().toISOString();
      let currentMaxOrder = combinedPhotos.reduce((acc, p) => Math.max(acc, p.order), 0);
      const addedDrafts: MatchdayPhoto[] = [];
      let publishedAddedCount = 0;

      const selectedMd = uploadMatchdayId
        ? tournamentMatchdays.find((md) => md.id === uploadMatchdayId) || null
        : null;
      const resolvedDivisionId = uploadDivisionId || selectedMd?.divisionId || null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({
          active: true,
          current: i + 1,
          total: files.length,
          fileName: file.name,
        });

        const uploaded = await optimizeAndUploadPhoto(file, {
          tournamentId: tournament.id,
          album: effectiveAlbumName,
        });

        currentMaxOrder += 1;
        const shouldPublish = publishImmediately;
        const photo: MatchdayPhoto = {
          id: makeId('ph'),
          tournamentId: tournament.id,
          divisionId: resolvedDivisionId,
          matchdayId: selectedMd?.id || null,
          matchId: null,
          album: effectiveAlbumName,
          storageProvider: uploaded.storageProvider,
          assetId: uploaded.assetId || null,
          thumbUrl: uploaded.thumbUrl,
          fullUrl: uploaded.fullUrl,
          caption: '',
          order: currentMaxOrder,
          isCover: combinedPhotos.length === 0 && i === 0,
          published: shouldPublish,
          createdAt: now,
          updatedAt: now,
        };

        await saveEntity(shouldPublish ? 'photos' : 'photos_drafts', photo);
        if (shouldPublish) {
          publishedAddedCount += 1;
        } else {
          addedDrafts.push(photo);
        }
      }

      if (addedDrafts.length > 0) {
        onDraftPhotosChange([...draftPhotos, ...addedDrafts]);
      }

      if (selectedMd && publishImmediately && !selectedMd.galleryPublished) {
        await saveEntity('matchdays', {
          ...selectedMd,
          galleryPublished: true,
          updatedAt: now,
        });
      }

      setFeedback(
        publishImmediately
          ? `${publishedAddedCount} foto(s) optimizada(s) y publicada(s) en la galería de ${tournament.name}.`
          : `${addedDrafts.length} foto(s) guardada(s) en borrador para revisión.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron subir las fotografías.');
    } finally {
      setUploadProgress({ active: false, current: 0, total: 0, fileName: '' });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    void processUploadFiles(files);
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    void processUploadFiles(files);
  };

  const handleUpdatePhotoMeta = async (photo: MatchdayPhoto, patch: Partial<MatchdayPhoto>) => {
    setErrorMsg(null);
    const updated: MatchdayPhoto = {
      ...photo,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveEntity(updated.published ? 'photos' : 'photos_drafts', updated);
      if (!updated.published) {
        onDraftPhotosChange(draftPhotos.map((p) => (p.id === updated.id ? updated : p)));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar la foto.');
    }
  };

  const handleTogglePublished = async (photo: MatchdayPhoto) => {
    if (!canEdit) return;
    setErrorMsg(null);
    const now = new Date().toISOString();
    const targetPublished = !photo.published;
    const updated: MatchdayPhoto = {
      ...photo,
      published: targetPublished,
      updatedAt: now,
    };
    try {
      if (targetPublished) {
        await saveEntity('photos', updated);
        await removeEntity('photos_drafts', photo.id);
        onDraftPhotosChange(draftPhotos.filter((p) => p.id !== photo.id));
        setFeedback('Foto publicada en el portal público.');
      } else {
        await saveEntity('photos_drafts', updated);
        await removeEntity('photos', photo.id);
        onDraftPhotosChange([...draftPhotos.filter((p) => p.id !== photo.id), updated]);
        setFeedback('Foto movida a borrador.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const handlePublishAllDrafts = async () => {
    const drafts = combinedPhotos.filter((p) => !p.published);
    if (drafts.length === 0 || !canEdit) return;
    setPublishingAll(true);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      for (const p of drafts) {
        await saveEntity('photos', { ...p, published: true, updatedAt: now });
        await removeEntity('photos_drafts', p.id);
      }
      onDraftPhotosChange(draftPhotos.filter((p) => p.tournamentId !== tournament.id));

      await publishNotificationAndBroadcast(
        {
          id: makeId('notif'),
          tournamentId: tournament.id,
          title: `Galería actualizada · ${tournament.name}`,
          body: `Se publicaron ${drafts.length} nueva(s) foto(s) en la galería oficial de ${tournament.name}.`,
          targetPlayerIds: [],
          createdAt: now,
        },
        'gallery:published'
      );

      setFeedback(`${drafts.length} borrador(es) publicados en la galería de ${tournament.name}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al publicar borradores.');
    } finally {
      setPublishingAll(false);
    }
  };

  const handleSetCover = async (photo: MatchdayPhoto) => {
    if (!canEdit) return;
    setErrorMsg(null);
    try {
      for (const p of combinedPhotos) {
        const shouldCover = p.id === photo.id;
        if (p.isCover !== shouldCover) {
          await handleUpdatePhotoMeta(p, { isCover: shouldCover });
        }
      }
      setFeedback('Foto destacada como portada de la galería.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo marcar la portada.');
    }
  };

  const handleReorder = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= filteredPhotos.length) return;
    const a = filteredPhotos[idx];
    const b = filteredPhotos[targetIdx];
    const nextOrderA = b.order === a.order ? a.order + dir : b.order;
    const nextOrderB = a.order;
    await handleUpdatePhotoMeta(a, { order: nextOrderA });
    await handleUpdatePhotoMeta(b, { order: nextOrderB });
  };

  const handleDeletePhoto = async (photo: MatchdayPhoto) => {
    try {
      await removeEntity(photo.published ? 'photos' : 'photos_drafts', photo.id);
      if (!photo.published) {
        onDraftPhotosChange(draftPhotos.filter((p) => p.id !== photo.id));
      }
      setConfirmDeleteId(null);
      setFeedback('Foto eliminada de la competencia.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar la foto.');
    }
  };

  const activeProviderMeta = storageStatus
    ? PROVIDER_DISPLAY[storageStatus.activeProvider]
    : PROVIDER_DISPLAY.local;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#7C1FA2]">
            {tournament.name} · {isFootballTournament(tournament) ? 'Fútbol FIFA' : 'Tenis'}
          </p>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Galería de imágenes de la competencia
          </h2>
          <p className="text-xs text-[#475569] mt-0.5">
            Cada imagen se convierte automáticamente a WebP en el navegador antes de subirla a Cloudinary o Cloudflare Images.
          </p>
        </div>

        {canEdit && draftCount > 0 && (
          <button
            type="button"
            onClick={handlePublishAllDrafts}
            disabled={publishingAll}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {publishingAll ? 'Publicando...' : `Publicar ${draftCount} borrador(es)`}
          </button>
        )}
      </div>

      {/* Estado de conexión con Cloudinary / Cloudflare Images */}
      <div className={`rounded-2xl border p-4 space-y-2.5 ${activeProviderMeta.badgeClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Cloud className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold">{activeProviderMeta.label}</p>
              <p className="text-[11px] opacity-90 mt-0.5">{activeProviderMeta.detail}</p>
              {storageStatus?.activeProvider === 'cloudinary' && (
                <p className="text-[11px] font-mono mt-1 opacity-80">
                  Carpeta destino: {storageStatus.cloudinaryFolder}/competitions/{tournament.id}/photos
                </p>
              )}
              {storageStatus?.activeProvider === 'cloudflare_images' && (
                <p className="text-[11px] font-mono mt-1 opacity-80">
                  Metadata CDN: tournamentId={tournament.id}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowProviderGuide((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 border border-black/10 text-[11px] font-semibold text-[#0A1633] hover:bg-white"
          >
            <Info className="w-3.5 h-3.5" />
            {showProviderGuide ? 'Ocultar guía de conexión' : 'Configurar Cloudinary / Cloudflare'}
          </button>
        </div>

        {showProviderGuide && (
          <div className="bg-white/95 border border-[#E2E8F0] rounded-xl p-4 text-xs text-[#475569] space-y-2.5">
            <p className="font-semibold text-[#0A1633]">
              Variables de entorno admitidas en <code className="font-mono">.env.local</code> o Vercel (sin exponer secretos en la interfaz):
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                <p className="font-bold text-[#0A1633]">Opción 1: Cloudinary (25 créditos gratis/mes)</p>
                <p className="text-[11px]">
                  Modo cliente (Preset sin firma): <code className="font-mono">VITE_CLOUDINARY_CLOUD_NAME</code>,{' '}
                  <code className="font-mono">VITE_CLOUDINARY_UPLOAD_PRESET</code>,{' '}
                  <code className="font-mono">VITE_CLOUDINARY_FOLDER</code>.
                </p>
                <p className="text-[11px]">
                  O modo firmado en servidor: <code className="font-mono">CLOUDINARY_CLOUD_NAME</code>,{' '}
                  <code className="font-mono">CLOUDINARY_API_KEY</code>,{' '}
                  <code className="font-mono">CLOUDINARY_API_SECRET</code>.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                <p className="font-bold text-[#0A1633]">Opción 2: Cloudflare Images (Direct Upload)</p>
                <p className="text-[11px]">
                  Variables de servidor: <code className="font-mono">CLOUDFLARE_ACCOUNT_ID</code>,{' '}
                  <code className="font-mono">CLOUDFLARE_IMAGES_API_TOKEN</code>,{' '}
                  <code className="font-mono">CLOUDFLARE_IMAGES_ACCOUNT_HASH</code>.
                </p>
                <p className="text-[11px]">
                  Opcional: <code className="font-mono">VITE_MEDIA_PROVIDER=&quot;cloudflare_images&quot;</code> si tenés ambos configurados.
                </p>
              </div>
            </div>
          </div>
        )}
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

      {/* Zona de carga por competencia */}
      {canCreate && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Categoría / División (opcional)
              </label>
              <select
                value={uploadDivisionId}
                onChange={(e) => {
                  setUploadDivisionId(e.target.value);
                  setUploadMatchdayId('');
                }}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              >
                <option value="">Toda la competencia (general)</option>
                {tournamentDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Jornada (opcional)
              </label>
              <select
                value={uploadMatchdayId}
                onChange={(e) => setUploadMatchdayId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              >
                <option value="">Sin jornada específica</option>
                {uploadFilteredMatchdays.map((md) => (
                  <option key={md.id} value={md.id}>
                    {md.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Álbum / Colección
              </label>
              <select
                value={uploadAlbum}
                onChange={(e) => setUploadAlbum(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              >
                {DEFAULT_ALBUMS.map((alb) => (
                  <option key={alb} value={alb}>
                    {alb}
                  </option>
                ))}
                <option value="__CUSTOM__">Otro álbum personalizado...</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Visibilidad al subir
              </label>
              <select
                value={publishImmediately ? 'published' : 'draft'}
                onChange={(e) => setPublishImmediately(e.target.value === 'published')}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              >
                <option value="published">Publicar al instante en el portal</option>
                <option value="draft">Guardar en borrador primero</option>
              </select>
            </div>
          </div>

          {uploadAlbum === '__CUSTOM__' && (
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Nombre del álbum personalizado
              </label>
              <input
                type="text"
                maxLength={60}
                value={customAlbum}
                onChange={(e) => setCustomAlbum(e.target.value)}
                placeholder="Ej: Cuartos de Final, Clima en Sede..."
                className="w-full sm:w-80 h-9 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
              />
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDropFiles}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? 'border-[#7C1FA2] bg-purple-50/40'
                : 'border-[#E2E8F0] bg-[#F8FAFC]/60'
            }`}
          >
            <Camera className="w-7 h-7 mx-auto text-[#7C1FA2] mb-2" />
            {uploadProgress.active ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#0A1633]">
                  Optimizando a WebP y subiendo {uploadProgress.current} de {uploadProgress.total}...
                </p>
                <p className="text-[11px] text-[#475569] truncate max-w-md mx-auto">
                  {uploadProgress.fileName}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-[#475569]">
                  Arrastrá fotos aquí o seleccionalas desde tu dispositivo (JPG, PNG, WebP).
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Seleccionar imágenes para {tournament.name}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleFileInputChange}
                    disabled={uploadProgress.active}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros del inventario fotográfico */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[#7C1FA2]" />
          <span className="text-xs font-semibold text-[#0A1633]">
            {filteredPhotos.length} de {combinedPhotos.length} fotos
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'published' | 'draft')}
            className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
          >
            <option value="ALL">Todos los estados ({combinedPhotos.length})</option>
            <option value="published">Publicadas ({combinedPhotos.length - draftCount})</option>
            <option value="draft">Borradores ({draftCount})</option>
          </select>

          <select
            value={albumFilter}
            onChange={(e) => setAlbumFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
          >
            <option value="ALL">Todos los álbumes</option>
            {albumFilterOptions.map((alb) => (
              <option key={alb} value={alb}>
                Álbum: {alb}
              </option>
            ))}
          </select>

          {tournamentDivisions.length > 0 && (
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
            >
              <option value="ALL">Todas las categorías</option>
              <option value="GENERAL">Solo general del torneo</option>
              {tournamentDivisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Grilla de gestión */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-10 text-center text-xs text-[#475569]">
          Aún no hay imágenes registradas con estos filtros en {tournament.name}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPhotos.map((ph, idx) => (
            <div
              key={ph.id}
              className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[4/3] bg-slate-100">
                <img
                  src={getOptimizedImageUrl(ph.thumbUrl || ph.fullUrl, 520)}
                  alt={ph.caption || `Foto ${idx + 1}`}
                  width={520}
                  height={390}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-slate-950/75 text-white text-[10px] font-medium px-2 py-0.5 rounded">
                  {ph.published ? 'Publicada' : 'Borrador'}
                  {ph.isCover ? ' · Portada' : ''}
                  {ph.storageProvider ? ` · ${ph.storageProvider}` : ''}
                </div>
                <a
                  href={ph.fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver imagen original"
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/70 text-white hover:bg-slate-950"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <input
                    type="text"
                    maxLength={240}
                    defaultValue={ph.caption || ''}
                    placeholder="Pie de foto o descripción..."
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (ph.caption || '')) {
                        void handleUpdatePhotoMeta(ph, { caption: val });
                      }
                    }}
                    className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Álbum de foto"
                      value={(ph.album || '').trim() || 'General'}
                      onChange={(e) => void handleUpdatePhotoMeta(ph, { album: e.target.value })}
                      className="h-8 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[11px]"
                    >
                      {albumFilterOptions.map((alb) => (
                        <option key={alb} value={alb}>
                          {alb}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Categoría de foto"
                      value={ph.divisionId || ''}
                      onChange={(e) =>
                        void handleUpdatePhotoMeta(ph, {
                          divisionId: e.target.value || null,
                          matchdayId: null,
                        })
                      }
                      className="h-8 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[11px]"
                    >
                      <option value="">General del torneo</option>
                      {tournamentDivisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {tournamentMatchdays.length > 0 && (
                    <select
                      aria-label="Jornada vinculada"
                      value={ph.matchdayId || ''}
                      onChange={(e) => {
                        const mdId = e.target.value || null;
                        const mdObj = mdId
                          ? tournamentMatchdays.find((m) => m.id === mdId)
                          : null;
                        void handleUpdatePhotoMeta(ph, {
                          matchdayId: mdId,
                          divisionId: mdObj ? mdObj.divisionId : ph.divisionId || null,
                        });
                      }}
                      className="w-full h-8 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[11px]"
                    >
                      <option value="">Sin jornada específica</option>
                      {tournamentMatchdays
                        .filter((md) => !ph.divisionId || md.divisionId === ph.divisionId)
                        .map((md) => (
                          <option key={md.id} value={md.id}>
                            {md.name}
                          </option>
                        ))}
                    </select>
                  )}

                  {tournamentMatches.length > 0 && (
                    <select
                      aria-label="Partido vinculado"
                      value={ph.matchId || ''}
                      onChange={(e) =>
                        void handleUpdatePhotoMeta(ph, { matchId: e.target.value || null })
                      }
                      className="w-full h-8 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[11px]"
                    >
                      <option value="">Sin partido vinculado</option>
                      {tournamentMatches
                        .filter((m) => !ph.divisionId || m.divisionId === ph.divisionId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.entryAName} vs {m.entryBName}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0]">
                  {confirmDeleteId === ph.id ? (
                    <div className="p-2 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-red-900 font-medium">¿Eliminar foto?</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded border border-red-200 bg-white text-[#0A1633]"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePhoto(ph)}
                          className="px-2 py-1 rounded bg-red-700 text-white font-medium"
                        >
                          Sí
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleReorder(idx, -1)}
                          disabled={idx === 0}
                          title="Subir orden"
                          className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] disabled:opacity-40"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReorder(idx, 1)}
                          disabled={idx === filteredPhotos.length - 1}
                          title="Bajar orden"
                          className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] disabled:opacity-40"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSetCover(ph)}
                              title="Destacar como portada"
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
                                ph.isCover
                                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                                  : 'bg-white border-[#E2E8F0] text-[#475569]'
                              }`}
                            >
                              <Star className="w-3 h-3" />
                              Portada
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTogglePublished(ph)}
                              title={ph.published ? 'Pasar a borrador' : 'Publicar foto'}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
                                ph.published
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-white border-[#E2E8F0] text-[#475569]'
                              }`}
                            >
                              {ph.published ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                              {ph.published ? 'Pública' : 'Publicar'}
                            </button>
                          </>
                        )}
                        {((!ph.published && canEdit) || canDelete) && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(ph.id)}
                            title="Eliminar foto"
                            className="p-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
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
  );
};
