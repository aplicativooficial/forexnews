import { useState, useEffect } from 'react';
import { Smartphone, Download, Share, PlusSquare, ArrowUpRight, CheckCircle2, Bell } from 'lucide-react';
import { motion } from 'motion/react';

export function InstallGuideSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // 1. Ask for notification permission first
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const { showNotification } = await import('../lib/fcm');
        showNotification("FOREX NEWS: Terminal Ativo!", {
          body: "Você receberá alertas de notícias de alto impacto.",
          icon: "https://i.postimg.cc/fby2h1bg/logo-branca2.png"
        });
      }
    }

    // 2. Procced with Installation
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isInstalled) {
      alert("✅ O App já está na sua tela!");
    } else {
      // Check if iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert("📲 No iPhone: Toque em Compartilhar ⬆️ e depois em 'Adicionar à Tela de Início' ➕");
      } else {
        alert("📲 No Android: Toque nos 3 pontinhos ⋮ e depois em 'Instalar'");
      }
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Instalar <span className="text-brand-gold">App</span></h2>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Acesso em 1 Segundo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* iOS Simplificado */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111] border-2 border-white/5 rounded-3xl p-6 relative overflow-hidden"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
               <Smartphone className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-bold text-white uppercase tracking-wider">iPhone (Safari)</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-brand-gold">1.</span>
              <p className="text-sm text-gray-300">Toque no ícone <span className="inline-block p-1 bg-blue-500/20 rounded"><Share className="h-4 w-4 text-blue-400" /></span> abaixo no Safari</p>
            </div>
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-brand-gold">2.</span>
              <p className="text-sm text-gray-300">Selecione <span className="text-white font-bold">"Adicionar à Tela de Início"</span> <PlusSquare className="h-4 w-4 inline-block text-brand-gold ml-1" /></p>
            </div>
          </div>
        </motion.div>

        {/* Android Simplificado */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-[#111] border-2 border-white/5 rounded-3xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-brand-green/10 flex items-center justify-center">
               <Smartphone className="h-5 w-5 text-brand-green" />
            </div>
            <h3 className="font-bold text-white uppercase tracking-wider">Android (Chrome)</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-brand-gold">1.</span>
              <p className="text-sm text-gray-300">Toque nos <span className="font-bold text-white underline">3 pontos ⋮</span> no topo</p>
            </div>
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-brand-gold">2.</span>
              <p className="text-sm text-gray-300">Clique em <span className="text-white font-bold">"Instalar Aplicativo"</span></p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="max-w-md mx-auto">
        <button 
          onClick={handleInstallClick}
          className="w-full bg-brand-gold text-bg-dark font-black py-5 rounded-2xl golden-gradient shadow-[0_15px_40px_rgba(212,175,55,0.3)] uppercase tracking-[3px] text-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <Bell className="h-5 w-5" />
          Ativar App e Alertas
        </button>
        <p className="text-center text-[10px] text-gray-600 mt-4 uppercase tracking-widest font-bold">Resolução 4K • Terminal de Notícias</p>
      </div>
    </div>
  );
}
