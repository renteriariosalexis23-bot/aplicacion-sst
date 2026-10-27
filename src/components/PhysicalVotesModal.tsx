import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, X, Save, AlertCircle } from "lucide-react";
import { CommitteeElection } from '../types';

interface PhysicalVotesModalProps {
  election: CommitteeElection;
  onClose: () => void;
  onSave: (
    candidatesVotes: { userId: string; physicalVotes: number }[],
    blankVotes: number,
    nullVotes: number
  ) => Promise<void>;
}

export const PhysicalVotesModal: React.FC<PhysicalVotesModalProps> = ({ election, onClose, onSave }) => {
  const [candidatesVotes, setCandidatesVotes] = useState(
    election.candidates.map(c => ({
      userId: c.userId,
      name: c.name || 'Candidato',
      physicalVotes: c.physicalVotes || 0,
      isTachado: c.isTachado
    }))
  );
  
  const [blankVotes, setBlankVotes] = useState(election.blankPhysicalVotes || 0);
  const [nullVotes, setNullVotes] = useState(election.nullPhysicalVotes || 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        candidatesVotes.map(c => ({ userId: c.userId, physicalVotes: c.physicalVotes })),
        blankVotes,
        nullVotes
      );
      onClose();
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Votos Presenciales (Físicos)</h2>
            <p className="text-sm text-slate-500 mt-1">Ingresa los resultados del escrutinio manual</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 leading-relaxed">
              Estos votos se sumarán automáticamente a los votos virtuales emitidos por la plataforma para el cálculo final de resultados.
            </p>
          </div>

          <h3 className="font-bold text-slate-800 mb-4">Votos por Candidato</h3>
          <div className="space-y-3 mb-6">
            {candidatesVotes.filter(c => !c.isTachado).map((candidate, idx) => (
              <div key={candidate.userId} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                <span className="font-medium text-slate-700">{candidate.name}</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    min="0"
                    value={candidate.physicalVotes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const newVotes = [...candidatesVotes];
                      newVotes[idx].physicalVotes = val;
                      setCandidatesVotes(newVotes);
                    }}
                    className="w-24 p-2 text-center font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-slate-500 text-sm">votos</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-bold text-slate-800 mb-4">Otros Votos (Presenciales)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 mb-2">Votos en Blanco</label>
              <input 
                type="number"
                min="0"
                value={blankVotes}
                onChange={(e) => setBlankVotes(parseInt(e.target.value) || 0)}
                className="w-full p-2.5 font-bold text-slate-800 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 mb-2">Votos Nulos/Viciados</label>
              <input 
                type="number"
                min="0"
                value={nullVotes}
                onChange={(e) => setNullVotes(parseInt(e.target.value) || 0)}
                className="w-full p-2.5 font-bold text-slate-800 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : 'Guardar Votos'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
