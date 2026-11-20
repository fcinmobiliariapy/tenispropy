import React, { useState } from 'react';
import { Bell, Calendar, Download, Images, Trophy, Users, WifiOff, X } from 'lucide-react';
import { LiveToast, useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export type PublicTab = 'resumen' | 'fixture' | 'jornadas' | 'jugadores';

interface TopBarProps {
  mode: 'public' | 'admin';
  activePublicTab: PublicTab;
  onSelectPublicTab: (tab: PublicTab) => void;
  onToggleMode: () => void;
  isAuthenticated: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  mode,
  activePublicTab,
  onSelectPublicTab,
  onToggleMode,
  isAuthenticated,
}) => {
  const navItems: Array<{ id: PublicTab; label: string }> = [
    { id: 'resumen', label: 'Torneos' },
    { id: 'fixture', label: 'Fixture' },
    { id: 'jornadas', label: 'Jornadas' },
    { id: 'jugadores', label: 'Jugadores' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E7E4]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-8">
        {/* Zona 1: Wordmark limpio de una sola línea */}
        <button
          onClick={() => {
            if (mode === 'admin') onToggleMode();
            onSelectPublicTab('resumen');
          }}
          className="text-lg sm:text-xl font-bold tracking-tight text-[#0F1A15] whitespace-nowrap shrink-0 font-display focus-visible:outline-2 focus-visible:outline-[#14532D] rounded min-h-[44px] flex items-center"
        >
          TenisCupy
        </button>

        {/* Zona 2: 4 enlaces concisos de una sola línea */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4A5550]">
          {navItems.map((item) => {
            const isActive = mode === 'public' && activePublicTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (mode === 'admin') onToggleMode();
                  onSelectPublicTab(item.id);
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  isActive
                    ? 'text-[#0F1A15] border-[#14532D]'
                    : 'border-transparent hover:text-[#0F1A15]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zona 3: 1 acción principal */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={onToggleMode}
            className={`px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-[38px] ${
              mode === 'admin'
                ? 'bg-[#0F1A15] text-white hover:bg-slate-800'
                : 'bg-[#14532D] text-white hover:bg-[#166534]'
            }`}
          >
            {mode === 'admin' ? 'Portal público' : isAuthenticated ? 'Panel privado' : 'Acceso staff'}
          </button>
        </div>
      </div>
    </header>
  );
};

export const MobileBottomNav: React.FC<{
  activeTab: PublicTab;
  onSelectTab: (tab: PublicTab) => void;
}> = ({ activeTab, onSelectTab }) => {
  const items: Array<{ id: PublicTab; label: string; icon: React.ReactNode }> = [
    { id: 'resumen', label: 'Torneos', icon: <Trophy className="w-5 h-5" /> },
    { id: 'fixture', label: 'Fixture', icon: <Calendar className="w-5 h-5" /> },
    { id: 'jornadas', label: 'Jornadas', icon: <Images className="w-5 h-5" /> },
    { id: 'jugadores', label: 'Jugadores', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E2E7E4] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4 h-15">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] transition-colors ${
                active ? 'text-[#14532D] font-semibold' : 'text-[#4A5550]'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-3 right-3 h-0.5 rounded-b bg-[#14532D]" />
              )}
              {item.icon}
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-[#E2E7E4] bg-white px-3.5 py-2 text-xs font-medium text-[#0F1A15] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px]"
      >
        <Download className="w-4 h-4 text-[#14532D]" />
        Instalar app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E2E7E4] bg-white px-3.5 py-2 text-xs font-medium text-[#0F1A15] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px]"
        >
          <Download className="w-4 h-4 text-[#14532D]" />
          Instalar en iOS
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-6 border border-[#E2E7E4]">
              <h3 className="text-base font-semibold text-[#0F1A15]">Instalar TenisCupy en iPhone / iPad</h3>
              <p className="mt-2 text-sm text-[#4A5550]">
                1. Tocá el botón <strong>Compartir</strong> en la barra de Safari.<br />
                2. Seleccioná <strong>Agregar a pantalla de inicio</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#14532D] min-h-[44px] text-sm font-medium text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 sm:right-auto z-40 flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2.5 text-xs font-medium text-white">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Sin conexión — Mostrando datos en caché local</span>
    </div>
  );
};

export const LiveToastOverlay: React.FC<{
  toasts: LiveToast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-3 sm:right-4 z-40 space-y-2 max-w-sm w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white border border-[#E2E7E4] rounded-xl p-3.5 shadow-sm flex items-start gap-3"
        >
          <Bell className="w-4 h-4 text-[#14532D] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#0F1A15] truncate">{toast.title}</p>
            <p className="text-xs text-[#4A5550] mt-0.5">{toast.body}</p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar notificación"
            className="text-[#4A5550] hover:text-[#0F1A15] p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
