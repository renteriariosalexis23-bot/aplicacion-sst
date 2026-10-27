import React, { useState, useEffect, useRef } from "react";
import { Loader2, Search, X, Command } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ElementType;
  group?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  navigation: NavigationItem[];
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  navigation,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Filter items based on query
  const filteredItems = query
    ? navigation.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.group?.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Focus after render
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : prev));
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        e.preventDefault();
      } else if (e.key === "Enter" && filteredItems.length > 0) {
        navigate(filteredItems[selectedIndex].href);
        onClose();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[20vh] px-4 backdrop-blur-sm bg-slate-900/50 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-lg"
            placeholder="Buscar módulos, reportes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.length === 0 && (
            <div className="py-8 text-center text-slate-500">
              <Command className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm">Escribe para buscar módulos y secciones</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Muro</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Reportes</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Auditorías</span>
              </div>
            </div>
          )}

          {query.length > 0 && filteredItems.length === 0 && (
            <div className="py-8 text-center text-slate-500">
              <Search className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm">No se encontraron resultados para "{query}"</p>
            </div>
          )}

          {filteredItems.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.href}
                className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
                  isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                }`}
                onClick={() => {
                  navigate(item.href);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={`p-2 rounded-lg mr-3 ${isSelected ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium">{item.name}</div>
                  {item.group && <div className="text-xs opacity-70 mt-0.5">{item.group}</div>}
                </div>
              </button>
            );
          })}
        </div>
        
        <div className="px-4 py-3 border-t border-slate-50 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-4">
            <span className="flex items-center"><kbd className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm mr-1">↑</kbd> <kbd className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm mr-2">↓</kbd> Navegar</span>
            <span className="flex items-center"><kbd className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm mr-2">↵</kbd> Seleccionar</span>
            <span className="flex items-center"><kbd className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm mr-2">Esc</kbd> Cerrar</span>
          </div>
        </div>
      </div>
      
      {/* Background click handler */}
      <div className="fixed inset-0 z-[-1]" onClick={onClose}></div>
    </div>
  );
};
