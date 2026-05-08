import { useState, useEffect, FormEvent } from 'react';
import { Bell, Plus, Trash2, Calendar, X, RefreshCw, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { CommunityUpdate } from '@/src/types';
import { api } from '@/src/lib/api';

import { useAuth } from '../lib/AuthContext';

export function CommunitySection({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<CommunityUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState<boolean | 'sending'>(false);
  const [newUpdate, setNewUpdate] = useState<Partial<CommunityUpdate & { subtitle?: string }>>({
    type: 'update',
    isImportant: false,
    subtitle: '',
    externalLink: '',
    externalLinkText: ''
  });

  useEffect(() => {
    const loadUpdates = async () => {
      try {
        const data = await api.getCommunityUpdates();
        setUpdates(data);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar atualizações:", error);
        setLoading(false);
      }
    };
    loadUpdates();
    const interval = setInterval(loadUpdates, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAddUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert(`Acesso negado. Administrador não reconhecido para o email: ${user?.email || 'desconectado'}`);
      return;
    }

    if (isAdding === 'sending') return; // Prevent double submission

    try {
      const updateData: CommunityUpdate = {
        id: crypto.randomUUID(),
        title: (newUpdate.title || '').trim(),
        subtitle: (newUpdate.subtitle || '').trim() || "Forex News",
        content: (newUpdate.content || '').trim(),
        date: new Date().toLocaleDateString('pt-BR'),
        type: newUpdate.type || 'update',
        isImportant: !!newUpdate.isImportant,
        externalLink: (newUpdate.externalLink || '').trim(),
        externalLinkText: (newUpdate.externalLinkText || '').trim() || "Acessar Link"
      };
      
      const subtitle = updateData.subtitle;

      if (!updateData.title || !updateData.content) {
        alert("Título e conteúdo são obrigatórios.");
        return;
      }

      setIsAdding('sending'); // Block double submission
      
      await api.saveCommunityUpdate(updateData);
      
      // Force immediate refresh
      setUpdates(prev => [updateData, ...prev]);
      
      // Explicitly trigger FCM push notification via backend endpoint
      try {
        const notificationId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const response = await fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: updateData.title,
            body: updateData.content.substring(0, 150) + "...",
            url: "/community",
            subtitle: subtitle || "Forex News",
            notificationId: notificationId
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.tokensTried === 0) {
            console.warn("Nenhum dispositivo registrado para notificações.");
          } else {
            console.log(`Notificações: ${result.successCount} sucesso, ${result.failureCount} falha.`);
          }
        }
      } catch (err) {
        console.error("Failed to send push notification via API:", err);
      }
      
      setIsAdding(false);
      setNewUpdate({ type: 'update', isImportant: false, subtitle: '', externalLink: '', externalLinkText: '' });
    } catch (error: any) {
      console.error("Erro ao adicionar atualização:", error);
      alert(`Erro ao publicar: ${error.message || 'Verifique sua conexão ou permissões.'}`);
      setIsAdding(true);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      alert("Acesso negado.");
      return;
    }
    
    // Explicit and clear confirmation
    const confirmed = window.confirm("⚠️ ATENÇÃO: Deseja excluir permanentemente esta notícia da nuvem?");
    
    if (confirmed) {
      try {
        await api.deleteCommunityUpdate(id);
        // Force state update to reflect deletion immediately
        setUpdates(prev => prev.filter(u => u.id !== id));
        alert("✅ Notícia excluída com sucesso.");
      } catch (error: any) {
        console.error("Erro ao deletar do Firebase:", error);
        alert(`Erro ao excluir: ${error.message || 'Verifique sua conexão ou permissões.'}`);
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

  console.log("CommunitySection Info:", { isAdmin, userEmail: user?.email });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-border-dim">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-brand-gold animate-pulse" />
          <h2 className="text-xl font-bold text-white tracking-tight uppercase tracking-[2px]">Comunidade e Novidades</h2>
        </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <button 
                  onClick={async () => {
                    if (!window.confirm("Deseja sincronizar as notificações? Isso limpará o cache de alertas, atualizará seu identificador no servidor e garantirá que este dispositivo receba os alertas.")) return;
                    try {
                      // 1. Thorough SW reset
                      if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for(let reg of regs) { 
                          console.log("Unregistering Service Worker:", reg.scope);
                          await reg.unregister(); 
                        }
                      }
                      
                      // 2. Clear caches related to SW
                      if ('caches' in window) {
                        const keys = await caches.keys();
                        for (const key of keys) { await caches.delete(key); }
                      }

                      // 3. Request new token (this will re-register the SW)
                      const { requestFcmToken } = await import('../lib/fcm');
                      const token = await requestFcmToken();
                      
                      if (token) {
                        alert("Dispositivo Sincronizado com Sucesso! Identificador atualizado.");
                        console.log("Novo Token Após Reset:", token);
                      } else {
                        alert("Atenção: Não foi possível obter o token. Verifique se você permitiu notificações nas configurações do navegador ou se está em modo PWA (Adicionado à Tela de Início).");
                      }
                    } catch (err: any) {
                      console.error("Sync Error:", err);
                      // Provide more actionable advice based on common errors
                      let userMsg = "Erro na sincronização: " + (err.message || String(err));
                      
                      if (userMsg.toLowerCase().includes("permissão") || userMsg.toLowerCase().includes("permission")) {
                        userMsg = "Permissão Negada: Clique no ícone de CADEADO ao lado do endereço do site e mude 'Notificações' para 'Permitir'.";
                      } else if (userMsg.toLowerCase().includes("vapid") || userMsg.toLowerCase().includes("credential") || userMsg.toLowerCase().includes("autenticação")) {
                        const senderId = "857051692096";
                        const currentVapid = "BNZxtYsRCGDMr9lymhWNMQGrsCmyyCDS8qPsF61grmlykQ5jrch2Su83AWk3hZ45WP2FXf78ZGgYxp26pnm8jPo";
                        const customVapid = window.prompt(
                          `Erro de Autenticação (FCM).\n\nChave atual: ${currentVapid.substring(0, 5)}...${currentVapid.substring(currentVapid.length - 5)}\nSender ID: ${senderId}\n\nSe o erro persistir, gere uma nova chave no Console do Firebase e cole aqui:`,
                          ""
                        );
                        
                        if (customVapid && customVapid.length > 50) {
                          try {
                            const { requestFcmToken } = await import('../lib/fcm');
                            const token = await requestFcmToken(customVapid);
                            if (token) {
                              alert("Sincronizado com chave personalizada!");
                              return;
                            }
                          } catch (retryErr: any) {
                            alert("Falha mesmo com chave manual: " + retryErr.message);
                            return;
                          }
                        }
                        userMsg = `Erro de Autenticação: O par de chaves (VAPID) não coincide com o Sender ID ${senderId}.`;
                      } else if (userMsg.toLowerCase().includes("pwa") || userMsg.toLowerCase().includes("home screen")) {
                        userMsg = "No iPhone (iOS), você deve adicionar este site à 'Tela de Início' para receber notificações.";
                      }
                      
                      alert(userMsg);
                    }
                  }}
                  className="flex items-center gap-2 bg-white/10 text-brand-gold hover:bg-brand-gold/20 px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider transition-all border border-brand-gold/20"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sincronizar
                </button>
                <button 
                  onClick={async () => {
                    if (!window.confirm("Deseja enviar uma notificação de TESTE para todos os usuários?")) return;
                    try {
                      const res = await fetch('/api/test-notification', { method: 'POST' });
                      const data = await res.json();
                      alert(`Enviado! Sucessos: ${data.count || 0} | Falhas: ${data.failures || 0}`);
                    } catch (err) {
                      alert("Erro ao enviar teste: " + err);
                    }
                  }}
                  className="flex items-center gap-2 bg-white/5 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider transition-all border border-white/5"
                >
                  Teste
                </button>
              </>
            )}
            {isAdmin && (
              <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-brand-gold text-bg-dark font-bold px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider transition-all hover:scale-105"
              >
                <Plus className="h-4 w-4" />
                Nova Atualização
              </button>
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto pb-20">
        <AnimatePresence initial={false}>
          {updates.map((update) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              key={update.id}
              className={cn(
                "immersive-card p-6 border-l-4",
                update.isImportant ? "border-l-brand-gold bg-brand-gold/5" : "border-l-brand-green/30"
              )}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {update.subtitle && (
                      <span className="text-[10px] font-black text-brand-gold uppercase tracking-widest bg-brand-gold/5 px-2 py-0.5 rounded border border-brand-gold/10">
                        {update.subtitle}
                      </span>
                    )}
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                      update.type === 'update' ? "bg-blue-500/10 text-blue-400" :
                      update.type === 'news' ? "bg-brand-green/10 text-brand-green" :
                      "bg-purple-500/10 text-purple-400"
                    )}>
                      {update.type === 'update' ? 'Atualização' : update.type === 'news' ? 'Notícia' : 'Novidade'}
                    </span>
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {update.date}
                    </span>
                    {update.isImportant && (
                      <span className="text-[9px] font-bold bg-brand-gold/10 text-brand-gold px-2 py-0.5 rounded-full uppercase border border-brand-gold/30">
                        Importante
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{update.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4">{update.content}</p>
                  
                  {update.externalLink && (
                    <div className="flex justify-center sm:justify-start mt-2">
                      <motion.a
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        href={update.externalLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-white/5 hover:bg-brand-gold/20 text-brand-gold border border-brand-gold/30 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-black/20"
                      >
                        {update.externalLinkText || 'Acessar Link'}
                        <ExternalLink className="h-3 w-3" />
                      </motion.a>
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(update.id);
                    }} 
                    className="p-3 -m-3 text-red-400/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="w-full max-w-lg bg-bg-card border border-gray-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-brand-gold">Enviar Comunicado</h3>
                <button onClick={() => setIsAdding(false)} className="text-gray-500 hover:text-white">
                  <X className="h-7 w-7" />
                </button>
              </div>
              <form onSubmit={handleAddUpdate} className="space-y-5">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Título do Comunicado</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ex: Nova Operação no XauUsd"
                      value={newUpdate.title || ''}
                      onChange={(e) => setNewUpdate({...newUpdate, title: e.target.value})}
                      className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold text-white placeholder:text-gray-700 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Subtítulo / Remetente (Push)</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Forex News, Canal VIP, Urgente"
                      value={newUpdate.subtitle || ''}
                      onChange={(e) => setNewUpdate({...newUpdate, subtitle: e.target.value})}
                      className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold text-white placeholder:text-gray-700 transition-all font-mono"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Tipo de Postagem</label>
                    <select 
                      value={newUpdate.type}
                      onChange={(e) => setNewUpdate({...newUpdate, type: e.target.value as any})}
                      className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold text-white appearance-none cursor-pointer"
                    >
                      <option value="update">🚀 Atualização</option>
                      <option value="news">📰 Notícia</option>
                      <option value="novelty">✨ Novidade</option>
                    </select>
                  </div>
                  <div className="flex items-center sm:pb-3 sm:justify-end">
                    <label className="flex items-center gap-3 cursor-pointer group bg-white/5 px-4 py-4 rounded-xl border border-transparent hover:border-brand-gold/30 transition-all w-full sm:w-auto">
                      <input 
                        type="checkbox"
                        checked={newUpdate.isImportant}
                        onChange={(e) => setNewUpdate({...newUpdate, isImportant: e.target.checked})}
                        className="rounded border-gray-700 bg-bg-dark text-brand-gold focus:ring-brand-gold h-5 w-4"
                      />
                      <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-wider">Destaque Importante</span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Link Externo (Opcional)</label>
                    <input 
                      type="url" 
                      placeholder="Ex: https://youtube.com/live/..."
                      value={newUpdate.externalLink || ''}
                      onChange={(e) => setNewUpdate({...newUpdate, externalLink: e.target.value})}
                      className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold text-white placeholder:text-gray-700 transition-all text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Texto do Botão</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Ver Live do Ouro"
                      value={newUpdate.externalLinkText || ''}
                      onChange={(e) => setNewUpdate({...newUpdate, externalLinkText: e.target.value})}
                      className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold text-white placeholder:text-gray-700 transition-all text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Conteúdo da Mensagem</label>
                  <textarea 
                    rows={5}
                    required
                    placeholder="Escreva os detalhes aqui..."
                    value={newUpdate.content || ''}
                    onChange={(e) => setNewUpdate({...newUpdate, content: e.target.value})}
                    className="w-full bg-bg-dark border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-gold resize-none text-white transition-all"
                  />
                </div>
                <div className="pt-4">
                  <button 
                    type="submit"
                    disabled={isAdding === 'sending'}
                    className={cn(
                      "w-full bg-brand-gold text-bg-dark font-bold py-4 rounded-xl golden-gradient shadow-xl uppercase tracking-widest transition-all",
                      isAdding === 'sending' ? "opacity-50 cursor-not-allowed scale-100" : "hover:scale-[1.02]"
                    )}
                  >
                    {isAdding === 'sending' ? 'Enviando...' : 'Publicar e Notificar Usuários'}
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2 text-center italic">
                    Usuários que aceitaram notificações receberão um alerta navegador.
                  </p>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
