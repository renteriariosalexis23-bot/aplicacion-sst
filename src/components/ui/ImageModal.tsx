import React from "react";
import { Loader2, X } from "lucide-react";

interface ImageModalProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  altText?: string;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  imageUrl,
  isOpen,
  onClose,
  altText = "Imagen a pantalla completa",
}) => {
  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={altText}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
};
