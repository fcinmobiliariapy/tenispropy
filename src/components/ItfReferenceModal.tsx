import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { ITF_EDITION_LABEL, ITF_REFERENCE_GUIDE } from '../utils/itfRules';

interface ItfReferenceModalProps {
  open: boolean;
  onClose: () => void;
}

export const ItfReferenceModal: React.FC<ItfReferenceModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="itf-modal-title"
    >
      <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3 min-w-0">
            <BookOpen className="w-5 h-5 text-[#7C1FA2] shrink-0" />
            <div className="min-w-0">
              <h2 id="itf-modal-title" className="text-base sm:text-lg font-semibold text-[#0A1633]">
                Reglamento Oficial de Puntuación
              </h2>
              <p className="text-xs text-[#475569] truncate">
                Edición aplicada: {ITF_EDITION_LABEL} · Formatos y validación automática
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar reglamento"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {ITF_REFERENCE_GUIDE.map((section) => (
            <div key={section.id} className="pb-5 border-b border-[#E2E8F0] last:border-b-0 last:pb-0">
              <p className="text-xs font-medium text-[#7C1FA2]">{section.code}</p>
              <h3 className="text-base font-semibold text-[#0A1633] mt-1">{section.title}</h3>
              <p className="text-sm text-[#475569] mt-1">{section.summary}</p>
              <ul className="mt-3 space-y-2">
                {section.details.map((detail, idx) => (
                  <li key={idx} className="text-sm text-[#0A1633] flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-4 sm:px-6 py-3.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 min-h-[44px] rounded-xl sm:rounded-lg bg-[#0A1633] text-white text-sm font-medium hover:bg-[#7C1FA2] transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
