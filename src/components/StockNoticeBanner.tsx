import { AlertTriangle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function StockNoticeBanner({ compact = false }: { compact?: boolean }) {
  const { stockNotice, dismissStockNotice } = useApp();

  if (!stockNotice) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`bg-amber-50 border border-amber-300 text-amber-950 rounded-xl flex items-start justify-between gap-3 ${
        compact ? 'p-3 text-xs' : 'p-4 text-sm'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle
          className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[#D97706] shrink-0 mt-0.5`}
        />
        <span className="font-medium leading-snug">{stockNotice}</span>
      </div>
      <button
        type="button"
        onClick={dismissStockNotice}
        aria-label="Dismiss stock notice"
        className="p-1 text-amber-800 hover:text-black rounded-md shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
