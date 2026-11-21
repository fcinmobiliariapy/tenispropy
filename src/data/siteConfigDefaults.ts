import { SiteLandingConfig } from '../types/tennis';

export const SITE_LANDING_DOC_ID = 'landing_page';
export const OFFICIAL_PLAYPY_LOGO =
  '/assets/aistudio/1BDAB541-40D5-45D3-AE92-EFF59F03FA01_81898b58.png';
export const DEFAULT_TOURNAMENT_COVER =
  '/src/assets/images/hero_clay_court_1795134987256.jpg';

export const DEFAULT_SITE_LANDING_CONFIG: SiteLandingConfig = {
  id: SITE_LANDING_DOC_ID,
  logoUrl: OFFICIAL_PLAYPY_LOGO,
  platformBadge: 'Plataforma Oficial',
  brandFirst: 'Play',
  brandSecond: 'Py',
  brandSubtitle: 'Tu App de Torneos y Competencias',
  heroTitle: 'Elegí tu torneo y seguí cada punto en vivo',
  heroDescription:
    'Centralizamos múltiples torneos simultáneos con reglamento ITF, fixture por ronda, posiciones de grupos, cuadros finales con medallero y galerías de fotos por jornada.',
  heroBackgroundImageUrl: null,
  primaryCtaLabel: 'Seleccionar torneo',
  secondaryCtaLabel: 'Reglas ITF 2026',
  showItfButton: true,
  bannerEnabled: true,
  bannerKicker: 'Banner Oficial · Espacio Publicitario PlayPy',
  bannerTitle: 'Potenciá tu torneo, tus auspiciantes y la experiencia de cada jugador',
  bannerDescription:
    'Publicá resultados al instante, organizá categorías y activá banners publicitarios inteligentes generados con IA en formato vertical y horizontal para los sponsors de cada sede.',
  bannerImageHorizontalUrl: null,
  bannerImageVerticalUrl: null,
  bannerBadgeUrl: OFFICIAL_PLAYPY_LOGO,
  bannerCtaLabel: 'Conocer más',
  bannerCtaUrl: null,
  bannerShowSpotlightAd: true,
  bannerFooterLeft: 'Cobertura multi-sede · Hora oficial America/Asuncion',
  bannerFooterRight: 'PlayPy 2026',
  defaultTournamentCoverUrl: DEFAULT_TOURNAMENT_COVER,
  useAutoMetrics: true,
  stat1Label: 'Torneos en PlayPy',
  stat1CustomValue: null,
  stat2Label: 'Categorías y divisiones',
  stat2CustomValue: null,
  stat3Label: 'Jugadores en competencia',
  stat3CustomValue: null,
  stat4Label: 'Partidos publicados',
  stat4CustomValue: null,
  pillars: [
    {
      icon: 'award',
      title: 'Cuadros y medallero oficial',
      description:
        'Seguimiento de grupos, cruces eliminatorios y podio Oro, Plata y Bronce en tiempo real.',
    },
    {
      icon: 'calendar',
      title: 'Fixture ordenado y flexible',
      description:
        'Consultá partidos por ronda o fecha, tie-breaks a 7 o 10 puntos y galerías por jornada.',
    },
    {
      icon: 'sparkles',
      title: 'Banners IA vertical y horizontal',
      description:
        'Cada torneo genera y adapta sus publicidades automáticamente para móviles y pantallas grandes.',
    },
  ],
  selectorKicker: 'Portal de Competencias',
  selectorTitle: 'Seleccioná el torneo donde querés ingresar',
  selectorSubtitle:
    'Tocá cualquier torneo para abrir su fixture, tabla de posiciones, cuadro final y galería.',
  footerTagline: 'Tu App de Torneos y Competencias',
  footerRightText: 'Zona horaria America/Asuncion · Reglas ITF 2026',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
};

export function mergeSiteLandingConfig(
  incoming?: Partial<SiteLandingConfig> | null
): SiteLandingConfig {
  if (!incoming) return DEFAULT_SITE_LANDING_CONFIG;
  return {
    ...DEFAULT_SITE_LANDING_CONFIG,
    ...incoming,
    id: SITE_LANDING_DOC_ID,
    logoUrl: incoming.logoUrl?.trim() || DEFAULT_SITE_LANDING_CONFIG.logoUrl,
    defaultTournamentCoverUrl:
      incoming.defaultTournamentCoverUrl?.trim() ||
      DEFAULT_SITE_LANDING_CONFIG.defaultTournamentCoverUrl,
    pillars:
      Array.isArray(incoming.pillars) && incoming.pillars.length > 0
        ? incoming.pillars
        : DEFAULT_SITE_LANDING_CONFIG.pillars,
  };
}
