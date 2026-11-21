import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { AdPlacement, TournamentAd as TournamentAdModel } from '../types/tennis';

export type BannerStylePreset =
  | 'PlayPy Oficial'
  | 'Polvo de Ladrillo'
  | 'Noche & LED'
  | 'Elegante Minimal';

export interface GenerateAdaptiveBannerParams {
  tournamentName: string;
  venue?: string;
  city?: string;
  sponsorName: string;
  title?: string;
  subtitle?: string;
  placement?: AdPlacement;
  stylePreset?: BannerStylePreset | string;
  customPrompt?: string;
}

export interface GeneratedAdaptiveBannerResult {
  horizontalUrl: string;
  verticalUrl: string;
  headline: string;
  subheadline: string;
  badge?: string;
  ctaLabel?: string;
  motif?: string;
}

/**
 * Llama al generador de imágenes publicitarias del servidor para crear
 * simultáneamente las versiones adaptativas Horizontal (16:9) y Vertical (3:4)
 * personalizadas para cada torneo o para el banner principal.
 */
export async function generateAdaptiveTournamentAdBanners(
  params: GenerateAdaptiveBannerParams
): Promise<GeneratedAdaptiveBannerResult> {
  const res = await fetch('/api/ai/generate-banner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tournamentName: params.tournamentName,
      venue: params.venue || '',
      city: params.city || '',
      sponsorName: params.sponsorName,
      title: params.title || params.sponsorName,
      subtitle: params.subtitle || '',
      placement: params.placement || 'banner_principal',
      stylePreset: params.stylePreset || 'PlayPy Oficial',
      customPrompt: params.customPrompt || '',
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<GeneratedAdaptiveBannerResult> & {
    error?: string;
  };

  if (!res.ok || !data.horizontalUrl || !data.verticalUrl) {
    throw new Error(data.error || 'No se pudieron generar las imágenes adaptativas del banner.');
  }

  return {
    horizontalUrl: data.horizontalUrl,
    verticalUrl: data.verticalUrl,
    headline: data.headline || params.title || params.sponsorName,
    subheadline: data.subheadline || params.subtitle || '',
    badge: data.badge,
    ctaLabel: data.ctaLabel,
    motif: data.motif,
  };
}

interface TournamentAdProps {
  ad: TournamentAdModel;
  variant?: 'featured' | 'compact' | 'footer';
  tournamentName?: string;
  tournamentVenue?: string;
  tournamentCity?: string;
  canAdaptWithAi?: boolean;
  onAdapted?: (updatedAd: TournamentAdModel) => Promise<void> | void;
}

export const TournamentAd: React.FC<TournamentAdProps> = ({
  ad,
  variant = 'compact',
  tournamentName,
  tournamentVenue,
  tournamentCity,
  canAdaptWithAi = false,
  onAdapted,
}) => {
  const [horizontalErr, setHorizontalErr] = useState(false);
  const [verticalErr, setVerticalErr] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const horizontalSrc = ad.horizontalImageUrl || ad.imageUrl;
  const verticalSrc = ad.verticalImageUrl || ad.imageUrl;
  const hasDedicatedVertical = Boolean(ad.verticalImageUrl);
  const hasDedicatedHorizontal = Boolean(ad.horizontalImageUrl);

  useEffect(() => {
    setHorizontalErr(false);
    setVerticalErr(false);
  }, [ad.imageUrl, ad.horizontalImageUrl, ad.verticalImageUrl]);

  const sponsorInitials = useMemo(() => {
    const parts = ad.sponsorName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0]?.slice(0, 2) || 'PY').toUpperCase();
  }, [ad.sponsorName]);

  const isFeatured = variant === 'featured';
  const isFooter = variant === 'footer';

  const activeFormatLabel = useMemo(() => {
    if (isFooter) return '16:9';
    if (isFeatured) {
      return isMobileViewport && hasDedicatedVertical ? '3:4 Móvil' : '16:9';
    }
    return hasDedicatedVertical ? '3:4 Vertical' : '16:9';
  }, [isFooter, isFeatured, isMobileViewport, hasDedicatedVertical]);

  const handleAdaptiveRegenerate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAdapted || adapting) return;
    setAdapting(true);
    setAdaptError(null);
    try {
      const generated = await generateAdaptiveTournamentAdBanners({
        tournamentName: tournamentName || 'Torneo PlayPy',
        venue: tournamentVenue,
        city: tournamentCity,
        sponsorName: ad.sponsorName,
        title: ad.title,
        subtitle: ad.subtitle || undefined,
        placement: ad.placement,
        customPrompt: ad.aiPrompt || undefined,
      });

      const updated: TournamentAdModel = {
        ...ad,
        imageUrl: ad.placement === 'lateral' ? generated.verticalUrl : generated.horizontalUrl,
        horizontalImageUrl: generated.horizontalUrl,
        verticalImageUrl: generated.verticalUrl,
        updatedAt: new Date().toISOString(),
      };
      await onAdapted(updated);
    } catch (err) {
      setAdaptError(
        err instanceof Error ? err.message : 'No se pudieron regenerar los banners adaptativos.'
      );
    } finally {
      setAdapting(false);
    }
  };

  const renderFallback = (compactLabel = false) => (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-white bg-gradient-to-br from-[#0A1633] via-[#7C1FA2] to-[#0284C7]">
      <span className="font-mono tabular-nums text-base font-bold tracking-wider">
        {sponsorInitials}
      </span>
      {!compactLabel && (
        <span className="text-[11px] text-white/85 mt-1 line-clamp-1">
          {ad.sponsorName}
        </span>
      )}
    </div>
  );

  const renderFeaturedMedia = () => {
    const mobileShowsVertical = isMobileViewport && hasDedicatedVertical;
    const primarySrc = mobileShowsVertical ? verticalSrc : horizontalSrc;
    const hasErr = mobileShowsVertical ? verticalErr : horizontalErr;

    return (
      <div className="relative overflow-hidden bg-[#0A1633] shrink-0 w-full md:w-[46%]">
        <div
          className={
            mobileShowsVertical
              ? 'aspect-[3/4] max-h-[380px] mx-auto'
              : 'w-full h-full aspect-[16/9] md:aspect-auto md:min-h-[210px]'
          }
        >
          {primarySrc && !hasErr ? (
            <picture className="block w-full h-full">
              {hasDedicatedVertical && verticalSrc && (
                <source media="(max-width: 639px)" srcSet={verticalSrc} />
              )}
              {hasDedicatedHorizontal && horizontalSrc && (
                <source media="(min-width: 640px)" srcSet={horizontalSrc} />
              )}
              <img
                src={primarySrc}
                alt={`${ad.sponsorName} - ${ad.title}`}
                referrerPolicy="no-referrer"
                onError={() =>
                  mobileShowsVertical ? setVerticalErr(true) : setHorizontalErr(true)
                }
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            </picture>
          ) : (
            renderFallback()
          )}
        </div>
      </div>
    );
  };

  const cardBody = (
    <div
      className={`group h-full bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex ${
        isFeatured
          ? 'flex-col md:flex-row'
          : isFooter
          ? 'flex-row items-center gap-3.5 p-3'
          : 'flex-col'
      } hover:border-[#7C1FA2]/50 transition-colors`}
    >
      {/* Bloque multimedia adaptativo: Vertical (3:4) y Horizontal (16:9) según formato/viewport */}
      {isFeatured ? (
        renderFeaturedMedia()
      ) : isFooter ? (
        <div className="relative overflow-hidden bg-[#0A1633] shrink-0 w-24 aspect-[16/9] rounded-xl">
          {horizontalSrc && !horizontalErr ? (
            <img
              src={horizontalSrc}
              alt={`${ad.sponsorName} - ${ad.title}`}
              referrerPolicy="no-referrer"
              onError={() => setHorizontalErr(true)}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          ) : (
            renderFallback(true)
          )}
        </div>
      ) : (
        <div
          className={`relative overflow-hidden bg-[#0A1633] shrink-0 w-full ${
            hasDedicatedVertical ? 'aspect-[3/4] max-h-[340px]' : 'aspect-[16/9]'
          }`}
        >
          {verticalSrc && !verticalErr ? (
            <img
              src={verticalSrc}
              alt={`${ad.sponsorName} - ${ad.title}`}
              referrerPolicy="no-referrer"
              onError={() => setVerticalErr(true)}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          ) : horizontalSrc && !horizontalErr ? (
            <img
              src={horizontalSrc}
              alt={`${ad.sponsorName} - ${ad.title}`}
              referrerPolicy="no-referrer"
              onError={() => setHorizontalErr(true)}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          ) : (
            renderFallback()
          )}
        </div>
      )}

      <div
        className={`flex-1 min-w-0 flex flex-col justify-between ${
          isFooter ? 'py-0.5' : isFeatured ? 'p-5 sm:p-6' : 'p-4'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C1FA2] truncate">
              {ad.sponsorName}
            </p>
            <span className="text-[10px] text-[#475569] shrink-0">
              Auspiciante{(hasDedicatedHorizontal || hasDedicatedVertical) ? ` · ${activeFormatLabel}` : ''}
            </span>
          </div>
          <h3
            className={`font-bold text-[#0A1633] leading-snug mt-1 ${
              isFeatured
                ? 'text-base sm:text-lg'
                : isFooter
                ? 'text-xs sm:text-sm truncate'
                : 'text-sm sm:text-base'
            }`}
          >
            {ad.title}
          </h3>
          {ad.subtitle && !isFooter && (
            <p className="text-xs sm:text-sm text-[#475569] mt-1.5 line-clamp-2">
              {ad.subtitle}
            </p>
          )}
          {adaptError && (
            <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              {adaptError}
            </p>
          )}
        </div>

        {(ad.targetUrl || canAdaptWithAi) && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 ${
              isFooter ? 'mt-1' : 'mt-3 pt-2.5 border-t border-[#E2E8F0]'
            }`}
          >
            {ad.targetUrl ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] group-hover:underline">
                Visitar sitio oficial
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </span>
            ) : (
              <span />
            )}

            {canAdaptWithAi && onAdapted && (
              <button
                type="button"
                onClick={handleAdaptiveRegenerate}
                disabled={adapting}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#7C1FA2]/30 bg-[#7C1FA2]/5 text-[11px] font-semibold text-[#7C1FA2] hover:bg-[#7C1FA2]/10 disabled:opacity-50"
              >
                {adapting ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {adapting ? 'Adaptando H/V...' : 'Regenerar H + V'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (ad.targetUrl) {
    return (
      <a
        href={ad.targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C1FA2] rounded-2xl"
      >
        {cardBody}
      </a>
    );
  }

  return cardBody;
};

export default TournamentAd;
