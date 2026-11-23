import { QueryClient } from '@tanstack/react-query';

/**
 * Cliente React Query optimizado para Free Tier de Firebase:
 * - Mantiene caché en memoria por 30 minutos y datos frescos por 5 minutos.
 * - Desactiva refetch automático al volver a enfocar la pestaña del navegador
 *   para evitar lecturas redundantes en Firestore.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
