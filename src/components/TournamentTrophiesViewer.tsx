import React, { useMemo, useState } from 'react';
import { Award, Crown, Maximize2, Medal, Sparkles, Trophy, X } from 'lucide-react';
import {
  Division,
  Tournament,
  TournamentTrophy,
  TrophyCupStyle,
  TrophyFinish,
  TrophyPlace,
} from '../types/tennis';
import { buildTrophyWhatsAppMessage } from '../utils/whatsappShare';
import { WhatsAppShareButton } from './WhatsAppShareButton';

export const TROPHY_PLACE_LABELS: Record<TrophyPlace, string> = {
  campeon: 'Campeón · 1° Puesto',
  vicecampeon: 'Vicecampeón · 2° Puesto',
  tercer_puesto: 'Tercer Puesto · 3°',
  especial: 'Distinción Especial',
};

export const TROPHY_STYLE_LABELS: Record<TrophyCupStyle, string> = {
  classic_chalice: 'Copa Clásica',
  modern_crystal: 'Cristal Moderno',
  laurel_shield: 'Escudo Laureles',
  tennis_crown: 'Corona Tenis',
};

export const TROPHY_FINISH_LABELS: Record<TrophyFinish, string> = {
  gold: 'Oro',
  silver: 'Plata',
  bronze: 'Bronce',
  playpy_crystal: 'Cristal PlayPy',
};

export interface GenerateTrophyRequest {
  tournamentName: string;
  venue?: string;
  city?: string;
  divisionName: string;
  category?: string;
  place: TrophyPlace;
  title?: string;
  recipientName?: string;
  cupStyle: TrophyCupStyle;
  finish: TrophyFinish;
  engravingText?: string;
  customPrompt?: string;
}

export interface GenerateTrophyResponse {
  imageUrl: string;
  title: string;
  engravingText: string;
  motifNote: string;
}

export async function generateCustomTrophyImage(
  payload: GenerateTrophyRequest
): Promise<GenerateTrophyResponse> {
  const res = await fetch('/api/ai/generate-trophy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<GenerateTrophyResponse> & {
    error?: string;
  };
  if (!res.ok || !data.imageUrl) {
    throw new Error(data.error || 'No se pudo generar la imagen del trofeo con IA.');
  }
  return {
    imageUrl: data.imageUrl,
    title: data.title || payload.title || `${TROPHY_PLACE_LABELS[payload.place]} · ${payload.divisionName}`,
    engravingText: data.engravingText || payload.engravingText || payload.divisionName,
    motifNote: data.motifNote || '',
  };
}

interface TournamentTrophiesViewerProps {
  trophies: TournamentTrophy[];
  divisions: Division[];
  tournament: Tournament | null;
  activeDivisionId?: string;
}

function getPlaceBadgeStyle(place: TrophyPlace): string {
  switch (place) {
    case 'campeon':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'vicecampeon':
      return 'bg-slate-100 text-slate-800 border-slate-300';
    case 'tercer_puesto':
      return 'bg-orange-100 text-orange-900 border-orange-300';
    default:
      return 'bg-purple-100 text-[#7C1FA2] border-purple-200';
  }
}

export const TournamentTrophiesViewer: React.FC<TournamentTrophiesViewerProps> = ({
  trophies,
  divisions,
  tournament,
  activeDivisionId,
}) => {
  const [selectedDivFilter, setSelectedDivFilter] = useState<string>('ALL');
  const [lightboxTrophy, setLightboxTrophy] = useState<TournamentTrophy | null>(null);
  const [brokenImgIds, setBrokenImgIds] = useState<Record<string, boolean>>({});

  const activeTrophies = useMemo(
    () =>
      trophies
        .filter((t) => t.active && (!tournament || t.tournamentId === tournament.id))
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    [trophies, tournament]
  );

  const filterDivisions = useMemo(() => {
    const map = new Map<string, string>();
    activeTrophies.forEach((t) => {
      if (!map.has(t.divisionId)) {
        map.set(t.divisionId, t.divisionName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [activeTrophies]);

  const effectiveFilter =
    selectedDivFilter !== 'ALL' && !filterDivisions.some((d) => d.id === selectedDivFilter)
      ? 'ALL'
      : selectedDivFilter;

  const visibleTrophies = useMemo(() => {
    if (effectiveFilter === 'ALL') return activeTrophies;
    return activeTrophies.filter((t) => t.divisionId === effectiveFilter);
  }, [activeTrophies, effectiveFilter]);

  const resolveRecipient = (trophy: TournamentTrophy): string | null => {
    if (trophy.recipientName?.trim()) return trophy.recipientName.trim();
    const div = divisions.find((d) => d.id === trophy.divisionId);
    if (!div) return null;
    if (trophy.place === 'campeon') return div.championName || null;
    if (trophy.place === 'vicecampeon') return div.runnerUpName || null;
    if (trophy.place === 'tercer_puesto') return div.thirdPlaceName || null;
    return null;
  };

  if (activeTrophies.length === 0) return null;

  return (
    <section
      id="premios-torneo"
      className="mt-6 sm:mt-8 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs"
    >
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#E2E8F0] bg-gradient-to-r from-[#0A1633] via-[#131C46] to-[#23154A] text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Galardones oficiales por categoría
            </div>
            <h2 className="text-base sm:text-xl font-bold mt-0.5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
              Premios del Torneo {tournament ? `· ${tournament.name}` : ''}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeDivisionId && filterDivisions.some((d) => d.id === activeDivisionId) && (
              <button
                type="button"
                onClick={() =>
                  setSelectedDivFilter((prev) =>
                    prev === activeDivisionId ? 'ALL' : activeDivisionId
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  effectiveFilter === activeDivisionId
                    ? 'bg-[#0095FF] text-white border-[#0095FF]'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                {effectiveFilter === activeDivisionId
                  ? 'Mostrando división activa'
                  : 'Ver solo división activa'}
              </button>
            )}
            <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-xs font-medium text-slate-200">
              {visibleTrophies.length} {visibleTrophies.length === 1 ? 'trofeo' : 'trofeos'}
            </span>
          </div>
        </div>

        {filterDivisions.length > 1 && (
          <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto clean-scroll pb-1">
            <button
              type="button"
              onClick={() => setSelectedDivFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                effectiveFilter === 'ALL'
                  ? 'bg-white text-[#0A1633] font-semibold'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              Todas las categorías ({activeTrophies.length})
            </button>
            {filterDivisions.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDivFilter(d.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  effectiveFilter === d.id
                    ? 'bg-white text-[#0A1633] font-semibold'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {visibleTrophies.map((trophy) => {
            const winnerName = resolveRecipient(trophy);
            const broken = Boolean(brokenImgIds[trophy.id]);
            const placeLabel = TROPHY_PLACE_LABELS[trophy.place];

            return (
              <article
                key={trophy.id}
                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden flex flex-col hover:border-[#7C1FA2]/50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setLightboxTrophy(trophy)}
                  className="relative group block w-full aspect-[10/11] bg-[#0A1633] overflow-hidden text-left"
                >
                  {!broken && trophy.imageUrl ? (
                    <img
                      src={trophy.imageUrl}
                      alt={trophy.title}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenImgIds((prev) => ({ ...prev, [trophy.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-white bg-gradient-to-br from-[#0A1633] via-[#7C1FA2] to-[#0284C7]">
                      <Trophy className="w-12 h-12 text-amber-300 mb-2" />
                      <p className="text-sm font-bold text-center">{trophy.title}</p>
                      <p className="text-xs text-slate-200 mt-1">{trophy.divisionName}</p>
                    </div>
                  )}

                  <span className="absolute top-3 right-3 p-2 rounded-lg bg-[#0A1633]/75 text-white border border-white/20 opacity-90 group-hover:opacity-100">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </span>
                </button>

                <div className="p-4 flex-1 flex flex-col justify-between gap-3 bg-white">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${getPlaceBadgeStyle(
                          trophy.place
                        )}`}
                      >
                        {trophy.place === 'campeon' ? (
                          <Crown className="w-3 h-3" />
                        ) : trophy.place === 'especial' ? (
                          <Award className="w-3 h-3" />
                        ) : (
                          <Medal className="w-3 h-3" />
                        )}
                        {placeLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-[#0284C7]">
                        {TROPHY_STYLE_LABELS[trophy.cupStyle]} · {TROPHY_FINISH_LABELS[trophy.finish]}
                      </span>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-[#7C1FA2]">
                        {trophy.divisionName}
                      </p>
                      <h3 className="text-sm font-bold text-[#0A1633] leading-snug mt-0.5">
                        {trophy.title}
                      </h3>
                    </div>

                    <p className="text-xs text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5">
                      Grabado: <span className="font-medium text-[#0A1633]">{trophy.engravingText}</span>
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#475569]">
                        {winnerName ? 'Adjudicado a' : 'Estado del premio'}
                      </p>
                      <p
                        className={`text-xs font-bold truncate ${
                          winnerName ? 'text-[#0A1633]' : 'text-[#0284C7]'
                        }`}
                      >
                        {winnerName || 'En disputa en cancha'}
                      </p>
                    </div>

                    <WhatsAppShareButton
                      compact
                      label="Compartir"
                      message={buildTrophyWhatsAppMessage({
                        trophyTitle: trophy.title,
                        tournamentName: tournament?.name || 'Torneo PlayPy',
                        divisionName: trophy.divisionName,
                        placeLabel,
                        recipientName: winnerName,
                        engravingText: trophy.engravingText,
                      })}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Lightbox de detalle de trofeo */}
      {lightboxTrophy && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxTrophy(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden border border-[#E2E8F0] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2 bg-[#0A1633] text-white">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-sky-300 truncate">
                  {lightboxTrophy.divisionName} · {TROPHY_PLACE_LABELS[lightboxTrophy.place]}
                </p>
                <p className="text-sm font-bold truncate">{lightboxTrophy.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxTrophy(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#0A1633] flex items-center justify-center max-h-[65vh] overflow-hidden">
              <img
                src={lightboxTrophy.imageUrl}
                alt={lightboxTrophy.title}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>

            <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#475569]">
                  Grabado: <strong className="text-[#0A1633]">{lightboxTrophy.engravingText}</strong>
                </p>
                {lightboxTrophy.aiMotifNote && (
                  <p className="text-[11px] text-[#475569] mt-0.5">{lightboxTrophy.aiMotifNote}</p>
                )}
              </div>
              <WhatsAppShareButton
                showCopy
                label="Compartir premio"
                message={buildTrophyWhatsAppMessage({
                  trophyTitle: lightboxTrophy.title,
                  tournamentName: tournament?.name || 'Torneo PlayPy',
                  divisionName: lightboxTrophy.divisionName,
                  placeLabel: TROPHY_PLACE_LABELS[lightboxTrophy.place],
                  recipientName: resolveRecipient(lightboxTrophy),
                  engravingText: lightboxTrophy.engravingText,
                })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
