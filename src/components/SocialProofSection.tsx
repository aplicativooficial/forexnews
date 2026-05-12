import { useState, useEffect, FormEvent } from 'react';
import { Users, Plus, Trash2, Camera, Star, Award, TrendingUp, X, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { SocialProof } from '@/src/types';
import { api } from '@/src/lib/api';

export function SocialProofSection({ isAdmin }: { isAdmin: boolean }) {
  const [proofs, setProofs] = useState<SocialProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableIAs, setAvailableIAs] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('Todas');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [newProof, setNewProof] = useState<Partial<SocialProof>>({
    iaName: 'HFTGOLD ULTIMA'
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getSocialProofs();
        setProofs(data);
        setLoading(false);
      } catch (error) {
        console.error("Error loading social proofs:", error);
        setLoading(false);
      }
    };
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadIAs = async () => {
      try {
        const data = await api.getAIResults();
        const names = data.map(ai => ai.name);
        setAvailableIAs(names.length > 0 ? names : [
          'HFTGOLD ULTIMA',
          'SNIPERXAU',
          'SNIPERXAU PRO',
          'SNIPER GOLD',
          'SNIPER SHOW',
          'SNIPER SHOW PRO',
          'FAST BTC',
          'HFTGOLD MONETA'
        ]);
      } catch (error) {
        console.error("Error loading AIs for proof:", error);
      }
    };
    loadIAs();
  }, []);

  const handleOpenEdit = (proof: SocialProof) => {
    setEditingId(proof.id);
    setNewProof(proof);
  };

  const handleSaveProof = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const proofData: SocialProof = {
        id: editingId || crypto.randomUUID(),
        memberName: newProof.memberName || 'Membro Anônimo',
        result: newProof.result || 'R$0,00',
        testimonial: newProof.testimonial || '',
        iaName: newProof.iaName || 'Standard IA',
        date: new Date().toLocaleDateString('pt-BR'),
        imageUrl: newProof.imageUrl || 'https://picsum.photos/seed/default/800/600'
      };

      await api.saveSocialProof(proofData);
      setEditingId(null);
      setIsAdding(false);
      
      // Update local state for immediate feedback
      setProofs(prev => {
        if (editingId) return prev.map(p => p.id === editingId ? proofData : p);
        return [proofData, ...prev];
      });

      setNewProof({ iaName: availableIAs[0] || 'HFTGOLD ULTIMA' });
    } catch (error) {
      console.error("Erro ao salvar feedback:", error);
      alert("Erro ao salvar. Verifique permissões.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (confirm("Deseja remover este depoimento permanentemente?")) {
      try {
        await api.deleteSocialProof(id);
        setProofs(prev => prev.filter(p => p.id !== id));
      } catch (error: any) {
        console.error("Erro ao deletar:", error);
        alert(`Erro ao excluir: ${error.message || 'Verifique suas permissões.'}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-gold"></div>
      </div>
    );
  }

  const ias = Array.from(new Set(proofs.map(p => p.iaName))).concat(['Todas']);
  const filteredProofs = filter === 'Todas' ? proofs : proofs.filter(p => p.iaName === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['Todas', ...availableIAs].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border",
                filter === f 
                  ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30" 
                  : "bg-[#1A1A1A] text-gray-500 border-border-dim hover:text-white"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-brand-gold text-bg-dark font-bold px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider golden-gradient transition-all"
          >
            <Plus className="h-4 w-4" />
            Adicionar Feedback
          </button>
        )}
      </div>

      <div className="immersive-card">
        <div className="immersive-card-header">
           <div className="immersive-card-title uppercase tracking-[2px]">Feedback dos Alunos</div>
           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Live Feed</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 p-6 gap-6">
          {filteredProofs.map((proof) => (
            <motion.div 
              layout
              key={proof.id}
              className="bg-[#1E1E1E] border border-border-dim rounded-xl p-5 flex flex-col sm:flex-row gap-5 group"
            >
               <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-full bg-brand-gold flex items-center justify-center text-bg-dark font-bold text-xs uppercase">
                      {proof.memberName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-white">{proof.memberName}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-tight">{proof.date}</div>
                    </div>
                  </div>
                  <div className="text-[#00C896] font-bold text-sm mb-3">{proof.result}</div>
                  <p className="text-[11px] text-[#A0A0A0] leading-relaxed italic line-clamp-3">"{proof.testimonial}"</p>
                  
                  {isAdmin && (
                    <div className="mt-auto pt-3 flex justify-end gap-2">
                       <button onClick={() => handleOpenEdit(proof)} className="text-gray-500 hover:text-brand-gold p-1">
                          <Edit2 className="h-4 w-4" />
                       </button>
                       <button onClick={() => handleDelete(proof.id)} className="text-red-400/50 hover:text-red-400 p-1">
                          <Trash2 className="h-4 w-4" />
                       </button>
                    </div>
                  )}
               </div>
               <div 
                 className="w-full h-48 sm:w-24 sm:h-24 rounded-lg border border-white/5 cursor-pointer hover:opacity-80 transition-opacity shrink-0 overflow-hidden"
                 onClick={() => setSelectedImage(proof.imageUrl)}
               >
                  <img 
                    src={proof.imageUrl} 
                    alt="Feedback" 
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
               </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(isAdding || editingId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="w-full max-w-2xl bg-bg-card border border-gray-800 rounded-3xl p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-brand-gold">{editingId ? 'Editar Feedback' : 'Novo Feedback de Aluno'}</h3>
                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-500 hover:text-white">
                  <X className="h-7 w-7" />
                </button>
              </div>
              <form onSubmit={handleSaveProof} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                   <div>
                      <label className="block text-sm text-gray-400 mb-1">Nome do Membro</label>
                      <input 
                        type="text" 
                        required
                        value={newProof.memberName || ''}
                        onChange={(e) => setNewProof({...newProof, memberName: e.target.value})}
                        className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold"
                        placeholder="Ex: João Silva"
                      />
                   </div>
                   <div>
                      <label className="block text-sm text-gray-400 mb-1">IA Utilizada</label>
                      <select 
                        value={newProof.iaName}
                        onChange={(e) => setNewProof({...newProof, iaName: e.target.value})}
                        className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white"
                      >
                         {availableIAs.map(name => (
                           <option key={name} value={name}>{name}</option>
                         ))}
                      </select>
                   </div>
                   <div>
                      <label className="block text-sm text-gray-400 mb-1">Resultado Financeiro</label>
                      <input 
                        type="text" 
                        required
                        value={newProof.result || ''}
                        onChange={(e) => setNewProof({...newProof, result: e.target.value})}
                        className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold"
                        placeholder="Ex: +R$ 2.450,00"
                      />
                   </div>
                </div>
                <div className="space-y-4">
                   <div>
                      <label className="block text-sm text-gray-400 mb-1">Imagem do Comprovante (URL)</label>
                      <input 
                        type="url" 
                        required
                        value={newProof.imageUrl || ''}
                        onChange={(e) => setNewProof({...newProof, imageUrl: e.target.value})}
                        className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold"
                        placeholder="https://..."
                      />
                   </div>
                   <div>
                      <label className="block text-sm text-gray-400 mb-1">Depoimento</label>
                      <textarea 
                        rows={4}
                        required
                        value={newProof.testimonial || ''}
                        onChange={(e) => setNewProof({...newProof, testimonial: e.target.value})}
                        className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold resize-none"
                        placeholder="Descreva o sucesso do membro..."
                      />
                   </div>
                </div>
                <div className="col-span-full pt-4">
                   <button 
                     type="submit"
                     className="w-full bg-brand-gold text-bg-dark font-bold py-4 rounded-xl golden-gradient shadow-xl shadow-brand-gold/10 hover:scale-[1.01] transition-all"
                   >
                     {editingId ? 'Salvar Alterações' : 'Publicar Feedback'}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md cursor-zoom-out"
            onClick={() => setSelectedImage(null)}
          >
             <motion.img 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.8, opacity: 0 }}
               src={selectedImage} 
               className="max-w-full max-h-full rounded-lg shadow-2xl border border-white/10"
             />
             <button className="absolute top-6 right-6 p-4 text-white bg-white/10 rounded-full hover:bg-white/20 transition-all">
                <X className="h-8 w-8" />
             </button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
