import React, { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  SiteLandingConfig,
  SitePillar,
  SitePillarIcon,
  Tournament,
} from '../../types/tennis';
import {
  DEFAULT_SITE_LANDING_CONFIG,
  DEFAULT_TOURNAMENT_COVER,
  OFFICIAL_PLAYPY_LOGO,
  SITE_LANDING_DOC_ID,
} from '../../data/siteConfigDefaults';
import { saveEntity } from '../../services/firestoreService';
import { compressImageDataUrl, optimizeAndUploadAdBanner } from '../../utils/imageOptimizer';
import { BannerStylePreset, generateAdaptiveTournamentAdBanners } from '../TournamentAd';

interface AdminLandingPageSectionProps {
  siteConfig: SiteLandingConfig;
  tournaments: Tournament[];
  userEmail: string;
  isSuperAdmin: boolean;
}

const PILLAR_ICON_OPTIONS: Array<{ value: SitePillarIcon; label: string }> = [
  { value: 'award', label: 'Medalla / Podio' },
  { value: 'calendar', label: 'Calendario / Fixture' },
  { value: 'sparkles', label: 'Destellos / IA' },
  { value: 'trophy', label: 'Trofeo / Torneo' },
  { value: 'users', label: 'Jugadores / Comunidad' },
  { value: 'shield', label: 'Escudo / Oficial' },
];

const STYLE_PRESETS: BannerStylePreset[] = [
  'PlayPy Oficial',
  'Polvo de Ladrillo',
  'Noche & LED',
  'Elegante Minimal',
];

const MAX_STORED_IMAGE_CHARS = 250000;

function formatFirestoreError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) detail = parsed.error;
  } catch {
    // plain text error
  }
  const lower = detail.toLowerCase();
  if (lower.includes('permission_denied') || lower.includes('insufficient permissions')) {
    return 'No se pudo guardar en Firestore por permisos o validación de campos. Verificá tu sesión de staff y que los textos y enlaces cumplan los límites permitidos.';
  }
  if (lower.includes('unavailable') || lower.includes('offline')) {
    return 'No hay conexión con Firestore en este momento. Verificá tu conexión e intentá nuevamente.';
  }
  return detail || fallback;
}

async function normalizeImageInput(raw: string, requiredFallback?: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return requiredFallback ?? null;
  }
  if (trimmed.startsWith('data:image/')) {
    return compressImageDataUrl(trimmed, 220000);
  }
  if (trimmed.length > MAX_STORED_IMAGE_CHARS) {
    throw new Error('La URL de la imagen supera el tamaño máximo permitido (250.000 caracteres).');
  }
  return trimmed;
}

function normalizeOptionalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Protocolo inválido');
    }
    const result = parsed.toString();
    if (result.length > 2000) {
      throw new Error('El enlace del banner no puede superar los 2000 caracteres.');
    }
    return result;
  } catch {
    throw new Error('El enlace CTA del banner no es una URL válida (ej. https://playpy.com).');
  }
}

function clampText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function clampOptionalText(value: string | null | undefined, maxLen: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

export const AdminLandingPageSection: React.FC<AdminLandingPageSectionProps> = ({
  siteConfig,
  tournaments,
  userEmail,
  isSuperAdmin,
}) => {
  const [form, setForm] = useState<SiteLandingConfig>(siteConfig);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiPreset, setAiPreset] = useState<BannerStylePreset>('PlayPy Oficial');
  const [aiPrompt, setAiPrompt] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) {
      setForm(siteConfig);
    }
  }, [siteConfig, dirty]);

  const updateField = <K extends keyof SiteLandingConfig>(
    key: K,
    value: SiteLandingConfig[K]
  ) => {
    setDirty(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUploadImage = async (
    fieldKey:
      | 'logoUrl'
      | 'heroBackgroundImageUrl'
      | 'defaultTournamentCoverUrl'
      | 'bannerImageHorizontalUrl'
      | 'bannerImageVerticalUrl'
      | 'bannerBadgeUrl',
    file?: File | null
  ) => {
    if (!file) return;
    setUploadingField(fieldKey);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const uploadedUrl = await optimizeAndUploadAdBanner(file);
      updateField(fieldKey, uploadedUrl);
      setSuccessMsg('Imagen optimizada y lista. Guardá los cambios para publicarla en la página principal.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo subir la imagen seleccionada.'
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleGenerateLandingAiBanners = async () => {
    setGeneratingAi(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const brandLabel = `${form.brandFirst || 'Play'}${form.brandSecond || ''}`.trim() || 'PlayPy';
      const generated = await generateAdaptiveTournamentAdBanners({
        tournamentName: tournaments[0]?.name || `${brandLabel} Circuito Oficial`,
        venue: tournaments[0]?.venue || 'Multi-sede',
        city: tournaments[0]?.city || 'Asunción',
        sponsorName: brandLabel,
        title: form.bannerTitle || form.heroTitle,
        subtitle: form.bannerDescription || form.brandSubtitle,
        placement: 'banner_principal',
        stylePreset: aiPreset,
        customPrompt: aiPrompt.trim() || undefined,
      });

      setDirty(true);
      setForm((prev) => ({
        ...prev,
        bannerEnabled: true,
        bannerImageHorizontalUrl: generated.horizontalUrl,
        bannerImageVerticalUrl: generated.verticalUrl,
      }));
      setSuccessMsg(
        'Banners adaptativos Horizontal (16:9) y Vertical (3:4) generados con IA. Revisá la vista previa y guardá los cambios.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron generar los banners adaptativos con IA.'
      );
    } finally {
      setGeneratingAi(false);
    }
  };

  const handlePillarChange = (idx: number, patch: Partial<SitePillar>) => {
    setDirty(true);
    setSuccessMsg(null);
    setForm((prev) => {
      const next = [...prev.pillars];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, pillars: next };
    });
  };

  const handleAddPillar = () => {
    if (form.pillars.length >= 6) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      pillars: [
        ...prev.pillars,
        {
          icon: 'trophy',
          title: 'Nuevo bloque informativo',
          description: 'Describí brevemente un beneficio o característica destacada.',
        },
      ],
    }));
  };

  const handleRemovePillar = (idx: number) => {
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      pillars: prev.pillars.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const logoUrl = await normalizeImageInput(form.logoUrl, OFFICIAL_PLAYPY_LOGO);
      const defaultCoverUrl = await normalizeImageInput(
        form.defaultTournamentCoverUrl,
        DEFAULT_TOURNAMENT_COVER
      );
      const heroBgUrl = await normalizeImageInput(form.heroBackgroundImageUrl || '');
      const bannerHorizUrl = await normalizeImageInput(form.bannerImageHorizontalUrl || '');
      const bannerVertUrl = await normalizeImageInput(form.bannerImageVerticalUrl || '');
      const bannerBadgeUrl = await normalizeImageInput(form.bannerBadgeUrl || '');
      const bannerCtaUrl = normalizeOptionalUrl(form.bannerCtaUrl || '');

      const cleanedPillars: SitePillar[] = form.pillars
        .slice(0, 6)
        .filter((p) => p.title.trim().length > 0)
        .map((p) => ({
          icon: p.icon,
          title: clampText(p.title, 100),
          description: clampText(p.description || '', 280),
        }));

      const platformBadge = clampText(form.platformBadge || 'Plataforma Oficial', 80);
      const brandFirst = clampText(form.brandFirst || 'Play', 40);
      const heroTitle = clampText(form.heroTitle, 160);
      const primaryCtaLabel = clampText(form.primaryCtaLabel || 'Seleccionar torneo', 60);

      if (!heroTitle) {
        throw new Error('El título principal del Hero no puede estar vacío.');
      }

      const payload: SiteLandingConfig = {
        id: SITE_LANDING_DOC_ID,
        logoUrl: logoUrl || OFFICIAL_PLAYPY_LOGO,
        platformBadge,
        brandFirst,
        brandSecond: clampOptionalText(form.brandSecond, 40) || '',
        brandSubtitle: clampOptionalText(form.brandSubtitle, 120) || '',
        heroTitle,
        heroDescription: clampOptionalText(form.heroDescription, 500) || '',
        heroBackgroundImageUrl: heroBgUrl,
        primaryCtaLabel,
        secondaryCtaLabel: clampOptionalText(form.secondaryCtaLabel, 60) || '',
        showItfButton: Boolean(form.showItfButton),
        bannerEnabled: Boolean(form.bannerEnabled),
        bannerKicker: clampOptionalText(form.bannerKicker, 120) || '',
        bannerTitle: clampOptionalText(form.bannerTitle, 180) || '',
        bannerDescription: clampOptionalText(form.bannerDescription, 500) || '',
        bannerImageHorizontalUrl: bannerHorizUrl,
        bannerImageVerticalUrl: bannerVertUrl,
        bannerBadgeUrl,
        bannerCtaLabel: clampOptionalText(form.bannerCtaLabel, 60) || '',
        bannerCtaUrl,
        bannerShowSpotlightAd: Boolean(form.bannerShowSpotlightAd),
        bannerFooterLeft: clampOptionalText(form.bannerFooterLeft, 140) || '',
        bannerFooterRight: clampOptionalText(form.bannerFooterRight, 80) || '',
        defaultTournamentCoverUrl: defaultCoverUrl || DEFAULT_TOURNAMENT_COVER,
        useAutoMetrics: Boolean(form.useAutoMetrics),
        stat1Label: clampOptionalText(form.stat1Label, 80) || '',
        stat1CustomValue: clampOptionalText(form.stat1CustomValue, 40),
        stat2Label: clampOptionalText(form.stat2Label, 80) || '',
        stat2CustomValue: clampOptionalText(form.stat2CustomValue, 40),
        stat3Label: clampOptionalText(form.stat3Label, 80) || '',
        stat3CustomValue: clampOptionalText(form.stat3CustomValue, 40),
        stat4Label: clampOptionalText(form.stat4Label, 80) || '',
        stat4CustomValue: clampOptionalText(form.stat4CustomValue, 40),
        pillars: cleanedPillars,
        selectorKicker: clampOptionalText(form.selectorKicker, 100) || '',
        selectorTitle: clampOptionalText(form.selectorTitle, 160) || '',
        selectorSubtitle: clampOptionalText(form.selectorSubtitle, 300) || '',
        footerTagline: clampOptionalText(form.footerTagline, 140) || '',
        footerRightText: clampOptionalText(form.footerRightText, 140) || '',
        updatedAt: new Date().toISOString(),
        updatedBy: clampOptionalText(userEmail, 160),
      };

      await saveEntity('site_settings', payload);
      setForm(payload);
      setDirty(false);
      setSuccessMsg('Página principal guardada y actualizada en tiempo real.');
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo guardar la configuración de la página principal.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setRestoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const resetPayload: SiteLandingConfig = {
        ...DEFAULT_SITE_LANDING_CONFIG,
        updatedAt: new Date().toISOString(),
        updatedBy: clampOptionalText(userEmail, 160),
      };
      await saveEntity('site_settings', resetPayload);
      setForm(resetPayload);
      setDirty(false);
      setConfirmRestore(false);
      setSuccessMsg('Se restauraron todos los textos, imágenes y valores por defecto.');
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudieron restaurar los valores por defecto.'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Cabecera del editor */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C1FA2]/10 text-[#7C1FA2] flex items-center justify-center shrink-0">
            <LayoutTemplate className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0A1633]">
              Personalización de la Página Principal
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Editá textos, logo, imágenes, banner publicitario adaptativo, métricas, pilares y pie de página.
              {siteConfig.updatedBy ? ` Última edición por ${siteConfig.updatedBy}.` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!confirmRestore ? (
            <button
              type="button"
              onClick={() => setConfirmRestore(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:text-[#0A1633]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurar defaults
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 p-1 rounded-xl border border-amber-300 bg-amber-50">
              <button
                type="button"
                disabled={restoring}
                onClick={handleRestoreDefaults}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {restoring ? 'Restaurando...' : 'Confirmar reset'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestore(false)}
                className="px-2 py-1 text-xs text-[#475569] hover:text-[#0A1633]"
              >
                Cancelar
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar página principal'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* 1. Identidad, Logo y Portada Base */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0A1633]">1. Identidad, Logo y Portada Base</h3>
          <p className="text-xs text-[#475569] mt-0.5">
            Define la marca mostrada en la barra superior, el ingreso y la portada por defecto de torneos sin foto propia.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Logo */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={form.logoUrl || OFFICIAL_PLAYPY_LOGO}
                alt="Vista previa logo"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl bg-white border border-[#E2E8F0] object-contain p-1 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#0A1633]">Logo oficial</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium text-[#0A1633] cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    {uploadingField === 'logoUrl' ? 'Subiendo...' : 'Subir logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadImage('logoUrl', e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateField('logoUrl', OFFICIAL_PLAYPY_LOGO)}
                    className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs text-[#475569] hover:text-[#0A1633] bg-white"
                  >
                    Logo PlayPy
                  </button>
                </div>
              </div>
            </div>
            <input
              type="text"
              value={form.logoUrl}
              onChange={(e) => updateField('logoUrl', e.target.value)}
              placeholder="URL o ruta del logo"
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            />
          </div>

          {/* Portada por defecto */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={form.defaultTournamentCoverUrl || DEFAULT_TOURNAMENT_COVER}
                alt="Vista previa portada por defecto"
                referrerPolicy="no-referrer"
                className="w-20 h-14 rounded-xl bg-[#0A1633] border border-[#E2E8F0] object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#0A1633]">Portada por defecto de torneos</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium text-[#0A1633] cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5 text-[#0284C7]" />
                    {uploadingField === 'defaultTournamentCoverUrl' ? 'Subiendo...' : 'Subir portada'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleUploadImage('defaultTournamentCoverUrl', e.target.files?.[0])
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField('defaultTournamentCoverUrl', DEFAULT_TOURNAMENT_COVER)
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs text-[#475569] hover:text-[#0A1633] bg-white"
                  >
                    Portada base
                  </button>
                </div>
              </div>
            </div>
            <input
              type="text"
              value={form.defaultTournamentCoverUrl}
              onChange={(e) => updateField('defaultTournamentCoverUrl', e.target.value)}
              placeholder="URL o ruta de portada por defecto"
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Etiqueta superior (máx. 80)
            </label>
            <input
              type="text"
              maxLength={80}
              value={form.platformBadge}
              onChange={(e) => updateField('platformBadge', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Nombre parte 1 (Navy)
            </label>
            <input
              type="text"
              maxLength={40}
              value={form.brandFirst}
              onChange={(e) => updateField('brandFirst', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Nombre parte 2 (Violeta)
            </label>
            <input
              type="text"
              maxLength={40}
              value={form.brandSecond}
              onChange={(e) => updateField('brandSecond', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Subtítulo de marca
            </label>
            <input
              type="text"
              maxLength={120}
              value={form.brandSubtitle}
              onChange={(e) => updateField('brandSubtitle', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
        </div>
      </section>

      {/* 2. Portada Principal (Hero) */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0A1633]">2. Encabezado Principal (Hero)</h3>
          <p className="text-xs text-[#475569] mt-0.5">
            Título, descripción, botones de acción e imagen de fondo opcional.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Título principal * (máx. 160)
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={form.heroTitle}
                onChange={(e) => updateField('heroTitle', e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Descripción (máx. 500)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={form.heroDescription}
                onChange={(e) => updateField('heroDescription', e.target.value)}
                className="w-full p-3 rounded-xl border border-[#E2E8F0] text-xs"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#0A1633]">
                  Imagen de fondo del Hero (opcional)
                </p>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium text-[#0A1633] cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5 text-[#7C1FA2]" />
                    {uploadingField === 'heroBackgroundImageUrl' ? 'Subiendo...' : 'Subir fondo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleUploadImage('heroBackgroundImageUrl', e.target.files?.[0])
                      }
                    />
                  </label>
                  {form.heroBackgroundImageUrl && (
                    <button
                      type="button"
                      onClick={() => updateField('heroBackgroundImageUrl', null)}
                      className="px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs text-red-700 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              {form.heroBackgroundImageUrl && (
                <img
                  src={form.heroBackgroundImageUrl}
                  alt="Fondo Hero"
                  referrerPolicy="no-referrer"
                  className="w-full h-24 rounded-lg object-cover border border-[#E2E8F0]"
                />
              )}
              <input
                type="text"
                value={form.heroBackgroundImageUrl || ''}
                onChange={(e) =>
                  updateField('heroBackgroundImageUrl', e.target.value || null)
                }
                placeholder="URL de fondo opcional (vacío = fondo limpio blanco)"
                className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Botón principal *
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={form.primaryCtaLabel}
                  onChange={(e) => updateField('primaryCtaLabel', e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Botón reglamento
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={form.secondaryCtaLabel}
                  onChange={(e) => updateField('secondaryCtaLabel', e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#0A1633] cursor-pointer">
              <input
                type="checkbox"
                checked={form.showItfButton}
                onChange={(e) => updateField('showItfButton', e.target.checked)}
                className="rounded border-[#E2E8F0] text-[#7C1FA2]"
              />
              Mostrar botón de Reglamento ITF 2026
            </label>
          </div>
        </div>
      </section>

      {/* 3. Banner Publicitario Principal y Generación Adaptativa IA */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A1633]">
              3. Banner Publicitario Principal (Adaptativo Horizontal + Vertical)
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Personalizá el bloque publicitario superior o generá versiones adaptativas 16:9 y 3:4 automáticamente.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A1633] cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={form.bannerEnabled}
              onChange={(e) => updateField('bannerEnabled', e.target.checked)}
              className="rounded border-[#E2E8F0] text-[#7C1FA2]"
            />
            Mostrar banner en portada
          </label>
        </div>

        {/* Generador IA para el banner principal */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#0A1633] via-[#3A1662] to-[#0A1633] text-white space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#38BDF8] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Generador de Banner Adaptativo IA
              </p>
              <p className="text-xs text-slate-200 mt-0.5">
                Crea simultáneamente la pieza Horizontal (16:9) para desktop y Vertical (3:4) para móviles.
              </p>
            </div>
            <button
              type="button"
              disabled={generatingAi}
              onClick={handleGenerateLandingAiBanners}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-white text-[#0A1633] text-xs font-bold hover:bg-slate-100 disabled:opacity-60 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#7C1FA2]" />
              {generatingAi ? 'Generando H + V...' : 'Generar banner IA (H + V)'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <select
              value={aiPreset}
              onChange={(e) => setAiPreset(e.target.value as BannerStylePreset)}
              className="h-9 px-3 rounded-lg bg-white/10 border border-white/20 text-xs text-white"
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset} value={preset} className="text-[#0A1633]">
                  Estilo: {preset}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Indicaciones opcionales (ej. copa nocturna, luces azules, auspiciantes...)"
              className="md:col-span-2 h-9 px-3 rounded-lg bg-white/10 border border-white/20 text-xs text-white placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Imágenes Horizontal 16:9 & Vertical 3:4 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Horizontal */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0A1633] inline-flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#0284C7]" />
                Imagen Horizontal (16:9 · Desktop/Tablet)
              </span>
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3 h-3 text-[#7C1FA2]" />
                  {uploadingField === 'bannerImageHorizontalUrl' ? 'Subiendo...' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleUploadImage('bannerImageHorizontalUrl', e.target.files?.[0])
                    }
                  />
                </label>
                {form.bannerImageHorizontalUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('bannerImageHorizontalUrl', null)}
                    className="px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs text-red-700"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {form.bannerImageHorizontalUrl ? (
              <img
                src={form.bannerImageHorizontalUrl}
                alt="Vista previa Horizontal 16:9"
                referrerPolicy="no-referrer"
                className="w-full aspect-[16/9] rounded-lg object-cover bg-[#0A1633] border border-[#E2E8F0]"
              />
            ) : (
              <div className="w-full aspect-[16/9] rounded-lg border border-dashed border-[#CBD5E1] bg-white flex items-center justify-center text-[11px] text-[#475569] text-center px-4">
                Sin imagen horizontal (se mostrará la tarjeta oficial PlayPy con gradiente)
              </div>
            )}

            <input
              type="text"
              value={form.bannerImageHorizontalUrl || ''}
              onChange={(e) =>
                updateField('bannerImageHorizontalUrl', e.target.value || null)
              }
              placeholder="URL imagen horizontal 16:9"
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            />
          </div>

          {/* Vertical */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0A1633] inline-flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#7C1FA2]" />
                Imagen Vertical (3:4 · Móviles)
              </span>
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3 h-3 text-[#7C1FA2]" />
                  {uploadingField === 'bannerImageVerticalUrl' ? 'Subiendo...' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleUploadImage('bannerImageVerticalUrl', e.target.files?.[0])
                    }
                  />
                </label>
                {form.bannerImageVerticalUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('bannerImageVerticalUrl', null)}
                    className="px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs text-red-700"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {form.bannerImageVerticalUrl ? (
              <div className="flex justify-center bg-[#0A1633] rounded-lg p-2 border border-[#E2E8F0]">
                <img
                  src={form.bannerImageVerticalUrl}
                  alt="Vista previa Vertical 3:4"
                  referrerPolicy="no-referrer"
                  className="h-44 aspect-[3/4] rounded object-cover"
                />
              </div>
            ) : (
              <div className="w-full h-44 rounded-lg border border-dashed border-[#CBD5E1] bg-white flex items-center justify-center text-[11px] text-[#475569] text-center px-4">
                Sin imagen vertical (en móvil usará la imagen horizontal o tarjeta PlayPy)
              </div>
            )}

            <input
              type="text"
              value={form.bannerImageVerticalUrl || ''}
              onChange={(e) =>
                updateField('bannerImageVerticalUrl', e.target.value || null)
              }
              placeholder="URL imagen vertical 3:4"
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            />
          </div>
        </div>

        {/* Textos, Badge y Enlace del Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Kicker / Etiqueta superior
            </label>
            <input
              type="text"
              maxLength={120}
              value={form.bannerKicker}
              onChange={(e) => updateField('bannerKicker', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Título del banner
            </label>
            <input
              type="text"
              maxLength={180}
              value={form.bannerTitle}
              onChange={(e) => updateField('bannerTitle', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Descripción del banner
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={form.bannerDescription}
              onChange={(e) => updateField('bannerDescription', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Texto botón CTA del banner
            </label>
            <input
              type="text"
              maxLength={60}
              value={form.bannerCtaLabel}
              onChange={(e) => updateField('bannerCtaLabel', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Enlace URL del botón CTA (opcional)
            </label>
            <input
              type="text"
              maxLength={2000}
              value={form.bannerCtaUrl || ''}
              onChange={(e) => updateField('bannerCtaUrl', e.target.value || null)}
              placeholder="https://..."
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Pie izquierdo del banner
            </label>
            <input
              type="text"
              maxLength={140}
              value={form.bannerFooterLeft}
              onChange={(e) => updateField('bannerFooterLeft', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Pie derecho del banner
            </label>
            <input
              type="text"
              maxLength={80}
              value={form.bannerFooterRight}
              onChange={(e) => updateField('bannerFooterRight', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
          <label className="inline-flex items-center gap-2 text-xs text-[#0A1633] cursor-pointer">
            <input
              type="checkbox"
              checked={form.bannerShowSpotlightAd}
              onChange={(e) => updateField('bannerShowSpotlightAd', e.target.checked)}
              className="rounded border-[#E2E8F0] text-[#7C1FA2]"
            />
            Mostrar auspiciante destacado del circuito mediante TournamentAd
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#475569]">Insignia del banner:</span>
            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs cursor-pointer hover:bg-slate-50">
              <Upload className="w-3 h-3 text-[#7C1FA2]" />
              {uploadingField === 'bannerBadgeUrl' ? 'Subiendo...' : 'Subir insignia'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadImage('bannerBadgeUrl', e.target.files?.[0])}
              />
            </label>
            {form.bannerBadgeUrl && (
              <button
                type="button"
                onClick={() => updateField('bannerBadgeUrl', null)}
                className="px-2 py-1 rounded-lg border border-[#E2E8F0] text-xs text-red-700"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. Métricas / Datos de la Página */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A1633]">4. Datos y Métricas de la Aplicación</h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Usá conteos automáticos en tiempo real de Firestore o definí cifras personalizadas.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A1633] cursor-pointer">
            <input
              type="checkbox"
              checked={form.useAutoMetrics}
              onChange={(e) => updateField('useAutoMetrics', e.target.checked)}
              className="rounded border-[#E2E8F0] text-[#7C1FA2]"
            />
            Calcular métricas automáticamente en vivo
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              labelKey: 'stat1Label' as const,
              valKey: 'stat1CustomValue' as const,
              title: 'Indicador 1',
            },
            {
              labelKey: 'stat2Label' as const,
              valKey: 'stat2CustomValue' as const,
              title: 'Indicador 2',
            },
            {
              labelKey: 'stat3Label' as const,
              valKey: 'stat3CustomValue' as const,
              title: 'Indicador 3',
            },
            {
              labelKey: 'stat4Label' as const,
              valKey: 'stat4CustomValue' as const,
              title: 'Indicador 4',
            },
          ].map((stat) => (
            <div key={stat.labelKey} className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <p className="text-[11px] font-semibold text-[#0A1633]">{stat.title}</p>
              <input
                type="text"
                maxLength={80}
                value={form[stat.labelKey]}
                onChange={(e) => updateField(stat.labelKey, e.target.value)}
                placeholder="Etiqueta"
                className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
              <input
                type="text"
                maxLength={40}
                disabled={form.useAutoMetrics}
                value={form[stat.valKey] || ''}
                onChange={(e) => updateField(stat.valKey, e.target.value || null)}
                placeholder={form.useAutoMetrics ? 'Valor automático en vivo' : 'Valor personalizado'}
                className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 5. Bloques / Pilares de la Página */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A1633]">
              5. Pilares y Beneficios Destacados ({form.pillars.length}/6)
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Editá o agregá hasta 6 bloques informativos mostrados debajo de las métricas.
            </p>
          </div>
          {form.pillars.length < 6 && (
            <button
              type="button"
              onClick={handleAddPillar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0A1633] hover:bg-slate-50 shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#7C1FA2]" />
              Agregar bloque
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {form.pillars.map((pillar, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={pillar.icon}
                  onChange={(e) =>
                    handlePillarChange(idx, { icon: e.target.value as SitePillarIcon })
                  }
                  className="h-8 px-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium"
                >
                  {PILLAR_ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {form.pillars.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePillar(idx)}
                    title="Eliminar bloque"
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <input
                type="text"
                maxLength={100}
                value={pillar.title}
                onChange={(e) => handlePillarChange(idx, { title: e.target.value })}
                placeholder="Título del bloque"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold"
              />

              <textarea
                rows={3}
                maxLength={280}
                value={pillar.description}
                onChange={(e) => handlePillarChange(idx, { description: e.target.value })}
                placeholder="Descripción breve"
                className="w-full p-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 6. Selector de Torneos y Pie de Página */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0A1633]">
            6. Selector de Torneos y Pie de Página
          </h3>
          <p className="text-xs text-[#475569] mt-0.5">
            Personalizá los encabezados de la grilla de torneos y los textos del pie global de PlayPy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Kicker del selector
            </label>
            <input
              type="text"
              maxLength={100}
              value={form.selectorKicker}
              onChange={(e) => updateField('selectorKicker', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Título del selector
            </label>
            <input
              type="text"
              maxLength={160}
              value={form.selectorTitle}
              onChange={(e) => updateField('selectorTitle', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Subtítulo del selector
            </label>
            <input
              type="text"
              maxLength={300}
              value={form.selectorSubtitle}
              onChange={(e) => updateField('selectorSubtitle', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Lema en pie de página
            </label>
            <input
              type="text"
              maxLength={140}
              value={form.footerTagline}
              onChange={(e) => updateField('footerTagline', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Texto derecho en pie de página
            </label>
            <input
              type="text"
              maxLength={140}
              value={form.footerRightText}
              onChange={(e) => updateField('footerRightText', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
          <span className="text-[11px] text-[#475569]">
            Acceso actual: {isSuperAdmin ? 'Superadministrador' : 'Organizador'} ({userEmail})
          </span>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 min-h-[40px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </section>
    </form>
  );
};
