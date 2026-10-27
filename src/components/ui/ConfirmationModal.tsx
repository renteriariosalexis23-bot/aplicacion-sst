import React from "react";
import { Loader2, AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmVariant?: "danger" | "primary";
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  confirmVariant = "danger",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm border border-slate-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${confirmVariant === 'danger' ? 'bg-red-100' : 'bg-blue-100'}`}>
            <AlertTriangle className={`w-6 h-6 ${confirmVariant === 'danger' ? 'text-red-600' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-600 mb-6 text-sm whitespace-pre-wrap">{message}</p>
          </div>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium text-sm border border-slate-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-white rounded-lg transition-colors font-medium text-sm shadow-sm ${
              confirmVariant === 'danger' 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
