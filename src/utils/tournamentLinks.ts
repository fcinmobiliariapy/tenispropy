import { PublicTab } from '../components/TopBarAndPWA';

export interface TournamentDeepLinkOptions {
  divisionId?: string;
  tab?: PublicTab;
}

export function buildTournamentDirectUrl(
  tournamentId: string,
  options?: TournamentDeepLinkOptions
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://playpy.app';
  const params = new URLSearchParams();
  params.set('torneo', tournamentId);
  if (options?.divisionId) {
    params.set('division', options.divisionId);
  }
  if (options?.tab && options.tab !== 'resumen') {
    params.set('tab', options.tab);
  }
  return `${origin}/?${params.toString()}`;
}

export function parseTournamentUrlParams(): {
  tournamentId: string | null;
  divisionId: string | null;
  tab: PublicTab | null;
} {
  if (typeof window === 'undefined') {
    return { tournamentId: null, divisionId: null, tab: null };
  }
  const params = new URLSearchParams(window.location.search);
  const tournamentId = params.get('torneo')?.trim() || null;
  const divisionId = params.get('division')?.trim() || null;
  const rawTab = params.get('tab')?.trim() || null;
  const validTabs: PublicTab[] = ['resumen', 'fixture', 'jornadas', 'jugadores'];
  const tab = rawTab && validTabs.includes(rawTab as PublicTab) ? (rawTab as PublicTab) : null;
  return { tournamentId, divisionId, tab };
}

export function syncBrowserTournamentUrl(
  view: 'landing' | 'portal' | 'admin',
  tournamentId?: string,
  divisionId?: string,
  tab?: PublicTab
): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (view === 'portal' && tournamentId) {
      url.searchParams.set('torneo', tournamentId);
      if (divisionId) url.searchParams.set('division', divisionId);
      else url.searchParams.delete('division');
      if (tab && tab !== 'resumen') url.searchParams.set('tab', tab);
      else url.searchParams.delete('tab');
    } else {
      url.searchParams.delete('torneo');
      url.searchParams.delete('division');
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  } catch {
    // ignore history errors in sandboxed frames
  }
}
