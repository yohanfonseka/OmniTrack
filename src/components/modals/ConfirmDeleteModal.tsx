import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface ConfirmDeleteModalProps {
  title: string;
  itemName: string;
  itemType: 'Campaign' | 'Line Item';
  warningDetails?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  title,
  itemName,
  itemType,
  warningDetails,
  onConfirm,
  onClose
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to delete ${itemType.toLowerCase()}`);
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200/80 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
          <div className="flex items-center gap-2 font-semibold text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Are you sure you want to delete this {itemType.toLowerCase()}?</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200 font-mono text-slate-800 text-xs break-all font-semibold">
            {itemName}
          </div>
          <p className="text-[11px] text-rose-800/90 leading-relaxed">
            {warningDetails || (
              itemType === 'Campaign'
                ? 'Deleting this campaign will permanently delete all associated line items, daily performance data, and mapped platform links.'
                : 'Deleting this line item will remove its budget allocation from the parent campaign, delete mapped platform campaign data, and update campaign health metrics.'
            )}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-100 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 shadow-xs transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete {itemType}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
