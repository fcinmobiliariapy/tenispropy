import React from 'react';

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`}
  />
);

export const PortalSkeleton: React.FC = () => (
  <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6" aria-busy="true" aria-label="Cargando portal del torneo">
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      <div className="lg:col-span-7 space-y-4">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-9 w-4/5" />
        <SkeletonBlock className="h-4 w-2/3" />
        <div className="flex gap-2.5 pt-2">
          <SkeletonBlock className="h-10 w-36 rounded-xl" />
          <SkeletonBlock className="h-10 w-36 rounded-xl" />
          <SkeletonBlock className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="lg:col-span-5">
        <SkeletonBlock className="w-full aspect-[16/9] rounded-2xl" />
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white border border-[#E2E8F0] rounded-xl p-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="space-y-2">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-6 w-16" />
        </div>
      ))}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const AdminSectionSkeleton: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Cargando sección administrativa">
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-5 w-52" />
          <SkeletonBlock className="h-3.5 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-32 rounded-xl shrink-0" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {Array.from({ length: 3 }).map((_, idx) => (
          <SkeletonBlock key={idx} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, idx) => (
        <SkeletonBlock key={idx} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  </div>
);

export const PlayersGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-48 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E2E8F0]">
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
        </div>
        <SkeletonBlock className="h-9 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

export const GalleryGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true">
    {Array.from({ length: count }).map((_, idx) => (
      <SkeletonBlock key={idx} className="aspect-[4/3] w-full rounded-xl" />
    ))}
  </div>
);

export const ModalSkeleton: React.FC = () => (
  <div
    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    aria-busy="true"
  >
    <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 space-y-4">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="h-48 w-full rounded-xl" />
      <div className="flex justify-end gap-2">
        <SkeletonBlock className="h-9 w-24 rounded-lg" />
        <SkeletonBlock className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  </div>
);
