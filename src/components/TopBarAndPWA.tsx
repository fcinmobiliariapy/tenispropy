import React, { useState } from 'react';
import { Bell, Calendar, Download, Home, Images, Trophy, Users, WifiOff, X } from 'lucide-react';
import { LiveToast, useOnlineStatus, usePWAInstall } from '../hooks/usePWA';
import { OFFICIAL_PLAYPY_LOGO } from '../data/siteConfigDefaults';

export type PublicTab = 'resumen' | 'fixture' | 'jornadas' | 'jugadores';
export type AppView = 'landing' | 'portal' | 'admin';

interface TopBarProps {
  view: AppView;
  activePublicTab: PublicTab;
  onGoLanding: () => void;
  onSelectPublicTab: (tab: PublicTab) => void;
  onToggleAdmin: () => void;
  isAuthenticated: boolean;
  logoUrl?: string;
  brandFirst?: string;
  brandSecond?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  view,
  activePublicTab,
  onGoLanding,
  onSelectPublicTab,
  onToggleAdmin,
  isAuthenticated,
  logoUrl,
  brandFirst = 'Play',
  brandSecond = 'Py',
}) => {
  const navItems: Array<{ id: PublicTab; label: string }> = [
    { id: 'resumen', label: 'Competencia' },
    { id: 'fixture', label: 'Fixture' },
    { id: 'jornadas', label: 'Jornadas' },
    { id: 'jugadores', label: 'Jugadores' },
  ];

  const resolvedLogo = logoUrl?.trim() || OFFICIAL_PLAYPY_LOGO;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-8">
        {/* Zona 1: Logo oficial + Wordmark limpio */}
        <button
          onClick={onGoLanding}
          className="flex items-center gap-2.5 text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap shrink-0 font-display focus-visible:outline-2 focus-visible:outline-[#7C1FA2] rounded min-h-[44px]"
        >
          <img
            src={resolvedLogo}
            alt={`${brandFirst}${brandSecond}`}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-contain bg-white border border-[#E2E8F0] p-0.5 shrink-0"
          />
          <span>
            <span className="text-[#0A1633]">{brandFirst}</span>
            <span className="text-[#7C1FA2]">{brandSecond}</span>
          </span>
        </button>

        {/* Zona 2: Enlaces concisos de una sola línea */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
          <button
            onClick={onGoLanding}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              view === 'landing'
                ? 'text-[#0A1633] border-[#7C1FA2]'
                : 'border-transparent hover:text-[#0A1633]'
            }`}
          >
            Inicio
          </button>
          {navItems.map((item) => {
            const isActive = view === 'portal' && activePublicTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectPublicTab(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  isActive
                    ? 'text-[#0A1633] border-[#7C1FA2]'
                    : 'border-transparent hover:text-[#0A1633]'
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
            onClick={onToggleAdmin}
            className={`px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-[38px] ${
              view === 'admin'
                ? 'bg-[#0A1633] text-white hover:bg-slate-800'
                : 'bg-gradient-to-r from-[#7C1FA2] to-[#0284C7] text-white hover:opacity-95'
            }`}
          >
            {view === 'admin'
              ? 'Ver PlayPy'
              : isAuthenticated
              ? 'Panel privado'
              : 'Acceso staff'}
          </button>
        </div>
      </div>
    </header>
  );
};

export const MobileBottomNav: React.FC<{
  view: AppView;
  activeTab: PublicTab;
  onGoLanding: () => void;
  onSelectTab: (tab: PublicTab) => void;
}> = ({ view, activeTab, onGoLanding, onSelectTab }) => {
  const items: Array<{ id: PublicTab; label: string; icon: React.ReactNode }> = [
    { id: 'resumen', label: 'Torneo', icon: <Trophy className="w-5 h-5" /> },
    { id: 'fixture', label: 'Fixture', icon: <Calendar className="w-5 h-5" /> },
    { id: 'jornadas', label: 'Jornadas', icon: <Images className="w-5 h-5" /> },
    { id: 'jugadores', label: 'Jugadores', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-15">
        <button
          onClick={onGoLanding}
          className={`relative flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            view === 'landing' ? 'text-[#7C1FA2] font-semibold' : 'text-[#475569]'
          }`}
        >
          {view === 'landing' && (
            <span className="absolute top-0 left-2 right-2 h-0.5 rounded-b bg-[#7C1FA2]" />
          )}
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Inicio</span>
        </button>

        {items.map((item) => {
          const active = view === 'portal' && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] transition-colors ${
                active ? 'text-[#7C1FA2] font-semibold' : 'text-[#475569]'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-2 right-2 h-0.5 rounded-b bg-[#7C1FA2]" />
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
        className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#0A1633] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px]"
      >
        <Download className="w-4 h-4 text-[#7C1FA2]" />
        Instalar app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#0A1633] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px]"
        >
          <Download className="w-4 h-4 text-[#7C1FA2]" />
          Instalar en iOS
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-6 border border-[#E2E8F0]">
              <h3 className="text-base font-semibold text-[#0A1633]">Instalar PlayPy en iPhone / iPad</h3>
              <p className="mt-2 text-sm text-[#475569]">
                1. Tocá el botón <strong>Compartir</strong> en la barra de Safari.<br />
                2. Seleccioná <strong>Agregar a pantalla de inicio</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#0A1633] min-h-[44px] text-sm font-medium text-white"
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
          className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-sm flex items-start gap-3"
        >
          <Bell className="w-4 h-4 text-[#7C1FA2] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#0A1633] truncate">{toast.title}</p>
            <p className="text-xs text-[#475569] mt-0.5">{toast.body}</p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar notificación"
            className="text-[#475569] hover:text-[#0A1633] p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
