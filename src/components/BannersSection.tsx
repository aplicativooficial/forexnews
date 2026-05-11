import { useState, useEffect, FormEvent } from 'react';
import { Image as ImageIcon, Plus, Trash2, ExternalLink, ShieldCheck, Zap, Percent, X, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { BrokerBanner } from '@/src/types';
import { api } from '@/src/lib/api';

export function BannersSection({ isAdmin }: { isAdmin: boolean }) {
  const [banners, setBanners] = useState<BrokerBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newBanner, setNewBanner] = useState<Partial<BrokerBanner>>({
    badge: 'Recommended'
  });

  const [footerBanner, setFooterBanner] = useState({
    title: 'Bônus Exclusivo:',
    content: 'Abra sua conta na Exness e ganhe 100% de bônus no primeiro depósito.',
    cta: 'Começar Agora',
    url: '#'
  });

  useEffect(() => {
    // Sync Banners
    const loadBanners = async () => {
      try {
        const data = await api.getBanners();
        setBanners(Array.isArray(data) ? data : []);
        setLoading(false);
      } catch (error) {
        console.error("Error loading banners:", error);
        setLoading(false);
      }
    };

    // Sync Footer Banner Config
    const loadConfig = async () => {
      try {
        const data = await api.getConfig('footer_banner');
        if (data) {
          setFooterBanner(prev => ({
            ...prev,
            ...data
          }));
        }
      } catch (error) {
        console.error("Error loading footer config:", error);
      }
    };

    loadBanners();
    loadConfig();
    const interval = setInterval(() => {
      loadBanners();
      loadConfig();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleOpenEdit = (banner: BrokerBanner) => {
    setEditingId(banner.id);
    setNewBanner(banner);
  };

  const handleSaveBanner = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const bannerData: BrokerBanner = {
        id: editingId || crypto.randomUUID(),
        brokerName: newBanner.brokerName || 'Nova Corretora',
        offer: newBanner.offer || '',
        badge: newBanner.badge || 'Recommended',
        imageUrl: newBanner.imageUrl || 'https://picsum.photos/seed/banner/1200/400',
        ctaUrl: newBanner.ctaUrl || '#'
      };

      await api.saveBanner(bannerData);
      setEditingId(null);
      setIsAdding(false);
      
      // Immediate state update
      setBanners(prev => {
        if (editingId) return prev.map(b => b.id === editingId ? bannerData : b);
        return [bannerData, ...prev];
      });

      setNewBanner({ badge: 'Recommended' });
    } catch (error) {
      console.error("Error saving banner:", error);
      alert("Erro ao salvar banner.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Remover este banner?")) {
      try {
        await api.deleteBanner(id);
        setBanners(prev => prev.filter(b => b.id !== id));
      } catch (error) {
        console.error("Error deleting banner:", error);
      }
    }
  };

  return (
    <div className="space-y-8 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border-dim">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-brand-gold" />
          <h2 className="text-xl font-bold text-white tracking-tight uppercase tracking-[2px]">Bônus e Oportunidades</h2>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-brand-gold text-bg-dark font-bold px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider transition-all"
          >
            <Plus className="h-4 w-4" />
            Configurar Bônus
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20 min-h-[200px]">
        {loading ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-gold mb-4"></div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Carregando bônus...</p>
          </div>
        ) : banners.length > 0 ? (
          banners.map((banner) => (
            <motion.div 
              layout
              key={banner.id}
              className="immersive-card flex-row h-fit"
            >
               <div className="p-6 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                        banner.badge === 'Recommended' ? "bg-brand-gold/10 text-brand-gold border border-brand-gold/30" : 
                        banner.badge === 'Exclusive Bonus' ? "bg-brand-green/10 text-brand-green border border-brand-green/30" :
                        "bg-blue-400/10 text-blue-400 border border-blue-400/30"
                      )}>
                         {banner.badge === 'Recommended' ? 'Recomendada' : 
                          banner.badge === 'Exclusive Bonus' ? 'Bônus' :
                          'Spread Baixo'}
                      </span>
                      <h3 className="text-lg font-bold text-white">{banner.brokerName}</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-6 line-clamp-2 leading-relaxed italic">"{banner.offer}"</p>
                  <div className="flex items-center gap-4">
                     <a 
                       href={banner.ctaUrl} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="bg-brand-gold text-bg-dark font-bold px-6 py-2 rounded text-[11px] uppercase tracking-widest golden-gradient hover:scale-105 transition-all"
                     >
                       Reivindicar
                     </a>
                     {isAdmin && (
                       <div className="flex gap-2">
                         <button onClick={() => handleOpenEdit(banner)} className="text-gray-500 hover:text-brand-gold">
                            <Edit2 className="h-4 w-4" />
                         </button>
                         <button onClick={() => handleDelete(banner.id)} className="text-red-400/50 hover:text-red-400">
                            <Trash2 className="h-4 w-4" />
                         </button>
                       </div>
                     )}
                  </div>
               </div>
               <div 
                 className="w-32 h-auto bg-cover bg-center border-l border-border-dim"
                 style={{ backgroundImage: `url(${banner.imageUrl})` }}
               />
            </motion.div>
          ))
        ) : (
          <div className="col-span-full border border-dashed border-border-dim rounded-2xl p-12 text-center">
            <ImageIcon className="h-12 w-12 text-gray-800 mx-auto mb-4" />
            <h3 className="text-white font-bold mb-2">Nenhum bônus configurado</h3>
            <p className="text-xs text-text-dim max-w-xs mx-auto">Novas oportunidades e promoções exclusivas serão listadas aqui em breve.</p>
          </div>
        )}
      </div>

      {/* Featured Banner Strip (Footer style) */}
      <footer className="mt-auto banner-gradient border border-brand-gold/20 p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 bg-brand-gold/5 blur-3xl rounded-full -mr-12 -mt-12 pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left z-10">
            <div className="w-12 h-12 rounded-full bg-brand-gold/10 flex items-center justify-center border border-brand-gold/20 shrink-0">
               <Zap className="h-6 w-6 text-brand-gold" />
            </div>
            <div>
              <h4 className="text-brand-gold font-black text-lg tracking-widest uppercase mb-1">
                {footerBanner.title || 'Bônus Exclusivo:'}
              </h4>
              <p className="text-sm text-[#DDD] leading-relaxed max-w-xl">
                {footerBanner.content || 'Confira nossas oportunidades para maximizar seus lucros no mercado financeiro.'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 z-10">
            <a 
              href={footerBanner.url || '#'}
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-brand-gold text-bg-dark font-black px-10 py-4 rounded-xl text-[13px] uppercase tracking-[2px] golden-gradient hover:scale-105 transition-all shadow-[0_10px_30px_rgba(212,175,55,0.3)] whitespace-nowrap block"
            >
              {footerBanner.cta || 'Começar Agora'}
            </a>
            {isAdmin && (
              <button 
                onClick={async () => {
                  const title = prompt("Título do Banner Rodapé:", footerBanner.title);
                  const content = prompt("Conteúdo do Banner Rodapé:", footerBanner.content);
                  const cta = prompt("Texto do Botão:", footerBanner.cta);
                  const url = prompt("Link de Afiliado (URL):", footerBanner.url);
                  if (title && content && cta && url) {
                    try {
                      await api.saveConfig('footer_banner', { title, content, cta, url });
                      setFooterBanner({ title, content, cta, url });
                    } catch (error) {
                      console.error("Error updating footer config:", error);
                    }
                  }
                }}
                className="text-white/30 hover:text-white p-2 transition-colors"
                title="Editar Banner Rodapé"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
          </div>
      </footer>


      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(isAdding || editingId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="w-full max-w-lg bg-bg-card border border-gray-800 rounded-3xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-brand-gold">{editingId ? 'Editar Bônus' : 'Configurar Novo Bônus'}</h3>
                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-500 hover:text-white">
                  <X className="h-7 w-7" />
                </button>
              </div>
              <form onSubmit={handleSaveBanner} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nome da Corretora</label>
                  <input 
                    type="text" 
                    required
                    value={newBanner.brokerName || ''}
                    onChange={(e) => setNewBanner({...newBanner, brokerName: e.target.value})}
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Selo de Destaque</label>
                  <select 
                    value={newBanner.badge}
                    onChange={(e) => setNewBanner({...newBanner, badge: e.target.value as any})}
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white"
                  >
                    <option value="Recommended">Recomendada</option>
                    <option value="Exclusive Bonus">Bônus Exclusivo</option>
                    <option value="Low Spread">Spread Baixo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Oferta/Descrição</label>
                  <textarea 
                    rows={3}
                    required
                    value={newBanner.offer || ''}
                    onChange={(e) => setNewBanner({...newBanner, offer: e.target.value})}
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold resize-none text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">URL da Imagem</label>
                  <input 
                    type="url" 
                    required
                    value={newBanner.imageUrl || ''}
                    onChange={(e) => setNewBanner({...newBanner, imageUrl: e.target.value})}
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">URL do Link (CTA)</label>
                  <input 
                    type="url" 
                    required
                    value={newBanner.ctaUrl || ''}
                    onChange={(e) => setNewBanner({...newBanner, ctaUrl: e.target.value})}
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white"
                  />
                </div>
                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full bg-brand-gold text-bg-dark font-bold py-4 rounded-xl golden-gradient shadow-xl uppercase tracking-widest"
                  >
                    {editingId ? 'Salvar Alterações' : 'Salvar Banner'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
