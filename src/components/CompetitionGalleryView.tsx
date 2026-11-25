import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Images,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { Division, Match, Matchday, MatchdayPhoto, Tournament } from '../types/tennis';
import { formatAsuncionDate } from '../utils/tournamentEngine';
import { buildTournamentDirectUrl } from '../utils/tournamentLinks';
import { OptimizedImage } from './OptimizedImage';
import { GalleryGridSkeleton } from './Skeletons';

interface CompetitionGalleryViewProps {
  tournament: Tournament | null;
  divisions: Division[];
  matchdays: Matchday[];
  matches: Match[];
  photos: MatchdayPhoto[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  isFootball?: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  cloudinary: 'Cloudinary CDN',
  cloudflare_images: 'Cloudflare Images',
  cloudflare_r2: 'Cloudflare R2',
};

export const CompetitionGalleryView: React.FC<CompetitionGalleryViewProps> = ({
  tournament,
  divisions,
  matchdays,
  matches,
  photos,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  isFootball = false,
}) => {
  const [albumFilter, setAlbumFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [matchdayFilter, setMatchdayFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const divisionsMap = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions]
  );
  const matchdaysMap = useMemo(
    () => new Map(matchdays.map((md) => [md.id, md])),
    [matchdays]
  );
  const matchesMap = useMemo(
    () => new Map(matches.map((m) => [m.id, m])),
    [matches]
  );

  // Publicar solo fotos del torneo activo cuyo matchday (si tiene) también esté publicado o sea galería general
  const publishedTournamentPhotos = useMemo(() => {
    if (!tournament) return [];
    return photos
      .filter((ph) => {
        if (ph.tournamentId !== tournament.id || !ph.published) return false;
        if (ph.matchdayId) {
          const md = matchdaysMap.get(ph.matchdayId);
          if (md && md.galleryPublished === false) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
        return a.order - b.order || b.createdAt.localeCompare(a.createdAt);
      });
  }, [photos, tournament, matchdaysMap]);

  const albumOptions = useMemo(() => {
    const counts = new Map<string, number>();
    publishedTournamentPhotos.forEach((ph) => {
      const label = (ph.album || '').trim() || 'General';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [publishedTournamentPhotos]);

  const featuredCount = useMemo(
    () => publishedTournamentPhotos.filter((ph) => ph.isCover).length,
    [publishedTournamentPhotos]
  );

  const filteredPhotos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publishedTournamentPhotos.filter((ph) => {
      if (albumFilter === 'FEATURED' && !ph.isCover) return false;
      if (
        albumFilter !== 'ALL' &&
        albumFilter !== 'FEATURED' &&
        ((ph.album || '').trim() || 'General') !== albumFilter
      ) {
        return false;
      }
      if (divisionFilter !== 'ALL') {
        if (divisionFilter === 'TOURNAMENT_GENERAL') {
          if (ph.divisionId) return false;
        } else if (ph.divisionId !== divisionFilter) {
          return false;
        }
      }
      if (matchdayFilter !== 'ALL') {
        if (matchdayFilter === 'NO_MATCHDAY') {
          if (ph.matchdayId) return false;
        } else if (ph.matchdayId !== matchdayFilter) {
          return false;
        }
      }
      if (q) {
        const divName = ph.divisionId ? divisionsMap.get(ph.divisionId)?.name || '' : '';
        const mdName = ph.matchdayId ? matchdaysMap.get(ph.matchdayId)?.name || '' : '';
        const linkedMatch = ph.matchId ? matchesMap.get(ph.matchId) : undefined;
        const matchLabel = linkedMatch
          ? `${linkedMatch.entryAName} ${linkedMatch.entryBName}`
          : '';
        const haystack = [ph.caption || '', ph.album || '', divName, mdName, matchLabel]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    publishedTournamentPhotos,
    albumFilter,
    divisionFilter,
    matchdayFilter,
    searchQuery,
    divisionsMap,
    matchdaysMap,
    matchesMap,
  ]);

  // Reset filters when tournament changes
  useEffect(() => {
    setAlbumFilter('ALL');
    setDivisionFilter('ALL');
    setMatchdayFilter('ALL');
    setSearchQuery('');
    setLightboxIndex(null);
  }, [tournament?.id]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null || filteredPhotos.length === 0) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((i) => (i === null ? 0 : (i + 1) % filteredPhotos.length));
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((i) =>
          i === null ? 0 : (i - 1 + filteredPhotos.length) % filteredPhotos.length
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, filteredPhotos.length]);

  const accentText = isFootball ? 'text-emerald-700' : 'text-[#7C1FA2]';
  const accentBg = isFootball ? 'bg-emerald-700 text-white' : 'bg-[#7C1FA2] text-white';

  const activeLightboxPhoto =
    lightboxIndex !== null && filteredPhotos[lightboxIndex]
      ? filteredPhotos[lightboxIndex]
      : null;

  const handleCopyGalleryLink = async () => {
    if (!tournament) return;
    const shareUrl = buildTournamentDirectUrl(tournament.id, { tab: 'galeria' });
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  if (!tournament) return null;

  return (
    <section className="mt-6 space-y-5">
      {/* Cabecera editorial y controles de filtro */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${accentText}`}>
              Archivo Fotográfico Oficial
            </p>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-[#0A1633] mt-0.5">
              Galería · {tournament.name}
            </h2>
            <p className="text-xs text-[#475569] mt-1">
              {publishedTournamentPhotos.length}{' '}
              {publishedTournamentPhotos.length === 1 ? 'imagen publicada' : 'imágenes publicadas'}
              {' · '}
              Entrega optimizada WebP
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyGalleryLink}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-xs font-semibold text-[#0A1633] self-start sm:self-auto"
          >
            <Share2 className={`w-3.5 h-3.5 ${accentText}`} />
            {copiedNotice ? 'Enlace copiado' : 'Compartir galería'}
          </button>
        </div>

        {/* Barra de álbumes y filtros */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAlbumFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                albumFilter === 'ALL'
                  ? accentBg
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
              }`}
            >
              Todas ({publishedTournamentPhotos.length})
            </button>
            {featuredCount > 0 && (
              <button
                type="button"
                onClick={() => setAlbumFilter('FEATURED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  albumFilter === 'FEATURED'
                    ? accentBg
                    : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                }`}
              >
                Destacadas ({featuredCount})
              </button>
            )}
            {albumOptions.map((alb) => (
              <button
                key={alb.name}
                type="button"
                onClick={() => setAlbumFilter(alb.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  albumFilter === alb.name
                    ? accentBg
                    : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0A1633]'
                }`}
              >
                {alb.name} ({alb.count})
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {divisions.length > 0 && (
              <select
                aria-label="Filtrar por categoría"
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
              >
                <option value="ALL">Todas las categorías</option>
                <option value="TOURNAMENT_GENERAL">General de competencia</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}

            {matchdays.length > 0 && (
              <select
                aria-label="Filtrar por jornada"
                value={matchdayFilter}
                onChange={(e) => setMatchdayFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
              >
                <option value="ALL">Todas las jornadas</option>
                <option value="NO_MATCHDAY">Sin jornada específica</option>
                {matchdays.map((md) => (
                  <option key={md.id} value={md.id}>
                    {md.name}
                  </option>
                ))}
              </select>
            )}

            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar en galería..."
                className="w-full h-9 pl-8 pr-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#0A1633]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grilla fotográfica Bento / Editorial */}
      {isLoading && filteredPhotos.length === 0 ? (
        <GalleryGridSkeleton count={6} />
      ) : filteredPhotos.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-12 text-center space-y-2">
          <Camera className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-[#0A1633]">
            {publishedTournamentPhotos.length === 0
              ? 'Todavía no hay fotografías publicadas en esta competencia.'
              : 'Ninguna foto coincide con los filtros actuales.'}
          </p>
          <p className="text-xs text-[#475569]">
            {publishedTournamentPhotos.length === 0
              ? 'Cuando la organización suba imágenes desde el panel privado, aparecerán aquí.'
              : 'Probá seleccionar "Todas" para ver toda la cobertura del certamen.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 auto-rows-[210px]">
          {filteredPhotos.map((ph, idx) => {
            const isHeroTile = idx === 0 && filteredPhotos.length >= 3;
            const divObj = ph.divisionId ? divisionsMap.get(ph.divisionId) : undefined;
            const mdObj = ph.matchdayId ? matchdaysMap.get(ph.matchdayId) : undefined;
            const metaLine = [
              ph.album || null,
              divObj ? divObj.category || divObj.name : null,
              mdObj ? mdObj.name : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <button
                key={ph.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className={`group relative rounded-2xl overflow-hidden border border-[#E2E8F0] bg-slate-100 text-left focus-visible:outline-2 focus-visible:outline-[#7C1FA2] ${
                  isHeroTile ? 'sm:col-span-2 sm:row-span-2' : ''
                }`}
              >
                <OptimizedImage
                  src={isHeroTile ? ph.fullUrl || ph.thumbUrl : ph.thumbUrl || ph.fullUrl}
                  alt={ph.caption || `${tournament.name} · Foto ${idx + 1}`}
                  width={isHeroTile ? 960 : 480}
                  height={isHeroTile ? 720 : 360}
                  transformWidth={isHeroTile ? 960 : 480}
                  priority={idx < 2}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />

                <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent opacity-95 sm:opacity-90 group-hover:opacity-100 transition-opacity">
                  {ph.caption && (
                    <p
                      className={`text-white font-medium leading-snug ${
                        isHeroTile ? 'text-sm line-clamp-2' : 'text-xs line-clamp-2'
                      }`}
                    >
                      {ph.caption}
                    </p>
                  )}
                  {metaLine && (
                    <p className="text-[11px] text-white/75 mt-0.5 truncate">{metaLine}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {hasNextPage && onLoadMore && (
        <div className="flex justify-center pt-2">
          {isFetchingNextPage ? (
            <GalleryGridSkeleton count={4} />
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              className="px-5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50 transition-colors"
            >
              Cargar más fotos de la competencia
            </button>
          )}
        </div>
      )}

      {/* Lightbox Fullscreen */}
      {activeLightboxPhoto && lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de fotografía"
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-4 sm:p-6"
        >
          <div
            className="flex items-center justify-between text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-xs font-mono tabular-nums text-white/80">
                {lightboxIndex + 1} / {filteredPhotos.length}
                {activeLightboxPhoto.storageProvider &&
                PROVIDER_LABELS[activeLightboxPhoto.storageProvider]
                  ? ` · ${PROVIDER_LABELS[activeLightboxPhoto.storageProvider]}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Cerrar visor"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center relative my-4"
            onClick={(e) => e.stopPropagation()}
          >
            {filteredPhotos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((i) =>
                    i === null ? 0 : (i - 1 + filteredPhotos.length) % filteredPhotos.length
                  )
                }
                aria-label="Foto anterior"
                className="absolute left-1 sm:left-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/80"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <OptimizedImage
              src={activeLightboxPhoto.fullUrl || activeLightboxPhoto.thumbUrl}
              alt={activeLightboxPhoto.caption || `${tournament.name} · Imagen`}
              width={1440}
              height={960}
              transformWidth={1440}
              priority
              className="max-h-[75vh] w-auto max-w-full object-contain rounded-xl"
            />

            {filteredPhotos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((i) => (i === null ? 0 : (i + 1) % filteredPhotos.length))
                }
                aria-label="Foto siguiente"
                className="absolute right-1 sm:right-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/80"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          <div
            className="text-center text-white max-w-2xl mx-auto space-y-1 pb-1"
            onClick={(e) => e.stopPropagation()}
          >
            {activeLightboxPhoto.caption && (
              <p className="text-sm font-medium">{activeLightboxPhoto.caption}</p>
            )}
            <p className="text-xs text-white/70">
              {[
                activeLightboxPhoto.album || 'General',
                activeLightboxPhoto.divisionId
                  ? divisionsMap.get(activeLightboxPhoto.divisionId)?.name
                  : null,
                activeLightboxPhoto.matchdayId
                  ? matchdaysMap.get(activeLightboxPhoto.matchdayId)?.name
                  : null,
                activeLightboxPhoto.matchId
                  ? (() => {
                      const lm = matchesMap.get(activeLightboxPhoto.matchId);
                      return lm ? `${lm.entryAName} vs ${lm.entryBName}` : null;
                    })()
                  : null,
                activeLightboxPhoto.createdAt
                  ? formatAsuncionDate(activeLightboxPhoto.createdAt.slice(0, 10))
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

/**
 * Tira compacta destacada para la pestaña Competencia (Resumen),
 * enlazando directamente a la Galería completa de la competencia.
 */
export const CompetitionGalleryStrip: React.FC<{
  tournamentName: string;
  photos: MatchdayPhoto[];
  onOpenFullGallery: () => void;
  isFootball?: boolean;
}> = ({ tournamentName, photos, onOpenFullGallery, isFootball = false }) => {
  const published = useMemo(
    () =>
      photos
        .filter((p) => p.published)
        .sort((a, b) => {
          if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
          return a.order - b.order;
        }),
    [photos]
  );

  if (published.length === 0) return null;

  const preview = published.slice(0, 4);
  const accentText = isFootball ? 'text-emerald-700' : 'text-[#7C1FA2]';

  return (
    <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${accentText}`}>
            Galería de la competencia
          </p>
          <h3 className="text-base sm:text-lg font-bold text-[#0A1633]">
            Momentos destacados · {tournamentName}
          </h3>
        </div>

        <button
          type="button"
          onClick={onOpenFullGallery}
          className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-xs font-semibold text-[#0A1633] transition-colors"
        >
          <Images className={`w-3.5 h-3.5 ${accentText}`} />
          Ver galería ({published.length})
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {preview.map((ph, idx) => (
          <button
            key={ph.id}
            type="button"
            onClick={onOpenFullGallery}
            className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E2E8F0] bg-slate-100 text-left"
          >
            <OptimizedImage
              src={ph.thumbUrl || ph.fullUrl}
              alt={ph.caption || `${tournamentName} · Destacada ${idx + 1}`}
              width={420}
              height={315}
              transformWidth={420}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {ph.caption && (
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent">
                <p className="text-[11px] text-white line-clamp-1">{ph.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};
