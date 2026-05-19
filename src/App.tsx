/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  Newspaper, 
  Coins, 
  Users, 
  Image as ImageIcon, 
  Bot, 
  Trophy, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  X,
  Plus,
  Trash2,
  Edit2,
  Save,
  LogOut,
  ExternalLink,
  Clock,
  TrendingUp,
  Award,
  Bell,
  Smartphone,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { 
  NewsItem, 
  BrokerBanner, 
  AIResult, 
  DailyAnalysis 
} from '@/src/types';
import { useAuth } from './lib/AuthContext';
import { CommunityUpdate } from '@/src/types';
import { handleResponse } from './lib/api';

// Section Components
import { NewsSection } from './components/NewsSection';
import { XauUsdSection } from './components/XauUsdSection';
import { AIResultsSection } from './components/AIResultsSection';
import { RankingSection } from './components/RankingSection';
import { CommunitySection } from './components/CommunitySection';
import { InstallGuideSection } from './components/InstallGuideSection';

// Components (defined below or in separate files)
// For simplicity in this turn, I'll define some main structures here

const ADMIN_PASSWORD = "Fabinho123*";

export default function App() {
  const { user, isAdmin: contextIsAdmin, logout, loading, setLocalAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState('news');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [logoClicks, setLogoClicks] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const isAdmin = contextIsAdmin;

  // Sync unread state for Community
  useEffect(() => {
    const pollLocalNotifications = async () => {
      try {
        const res = await fetch('/api/notifications?limit=5');
        const notifications = await res.json();
        if (notifications && notifications.length > 0) {
          const latest = notifications[0];
          const lastNotifiedId = localStorage.getItem('forex_last_notified_id');
          
          if (latest.id !== lastNotifiedId) {
            localStorage.setItem('forex_last_notified_id', latest.id);
            if (Notification.permission === 'granted') {
              try {
                const { showNotification } = await import('./lib/fcm');
                showNotification(latest.title, {
                  body: latest.body || "",
                  tag: latest.id
                });
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    };

    const checkUnread = () => {
      const updatesStr = localStorage.getItem('forex_community_updates');
      const lastSeenId = localStorage.getItem('forex_last_seen_community_id');
      
      if (updatesStr) {
        const updates = JSON.parse(updatesStr);
        if (updates.length > 0) {
          const latestId = updates[0].id;
          if (activeSection === 'community') {
            localStorage.setItem('forex_last_seen_community_id', latestId);
            setUnreadCount(0);
          } else {
            const lastSeenIndex = updates.findIndex((u: any) => u.id === lastSeenId);
            const count = lastSeenIndex === -1 ? updates.length : lastSeenIndex;
            setUnreadCount(count);
          }
        }
      }
    };

    checkUnread();
    pollLocalNotifications();
    const interval = setInterval(() => {
      checkUnread();
      pollLocalNotifications();
    }, 1500);
    return () => clearInterval(interval);
  }, [activeSection]);

    // Auto request notification on mount & Standalone Proactive Permission
    useEffect(() => {
      const initNotifications = async () => {
        // Log status for debug
        console.log("Permission Status:", Notification.permission);

        // Diagnostic token count
        try {
          const diagRes = await fetch('/api/notification-status');
          const diagData = await handleResponse(diagRes);
          if (diagData) {
            console.log("Registered tokens on server:", diagData.tokenCount);
          }
        } catch (e) {
          console.warn("Failed to fetch diagnostics.");
        }

        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const { requestFcmToken } = await import('./lib/fcm');
            await requestFcmToken();
          } catch (err) {
            console.error("Error auto-syncing FCM token:", err);
          }
        } else if ('Notification' in window && Notification.permission === 'default') {
          const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
          console.log("Standalone Mode (App instalada):", !!isStandaloneMode);
          if (!isStandaloneMode && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            console.log("Dica: Para notificações no iOS, é necessário 'Adicionar à Tela de Início'.");
          }
        }

    // Foreground message listener
    const setupForegroundListener = async () => {
      try {
        const { subscribeToMessages } = await import('./lib/fcm');
        subscribeToMessages(async (payload) => {
          if (!payload) return;
          console.log("Notificação em primeiro plano:", payload);
          
          const { title, body } = payload.notification || payload.data || {};
          
          if (title) {
            const { showNotification } = await import('./lib/fcm');
            showNotification(title, {
              body: body || "",
              data: payload.data,
              tag: payload.data?.tag || payload.data?.notificationId || 'forex-news-alert',
              renotify: true,
              requireInteraction: true
            } as any);
          }
        });
      } catch (err) {
        console.error("Error setting up foreground listener:", err);
      }
    };

    setupForegroundListener();
      };

      initNotifications();

    // Detect Service Worker updates (logging only to avoid reload loop)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log("Novo Service Worker assumiu o controle.");
      });
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("Seu navegador não suporta notificações.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      console.log("Status da permissão de notificação:", permission);
      
      if (permission === 'granted') {
        const { requestFcmToken } = await import('./lib/fcm');
        const token = await requestFcmToken();
        
        if (token) {
          const { showNotification } = await import('./lib/fcm');
          showNotification("✅ Notificações Ativadas!", {
            body: "Você receberá os comunicados do Forex News diretamente aqui.",
            icon: '/pwa-192x192.png'
          });
          // Forçar atualização do CTA
          setIsStandalone(prev => prev); 
        } else {
          alert("Erro ao gerar identificador de notificação. Verifique sua conexão.");
        }
      } else {
        alert("Permissão negada. Para receber alertas, ative as notificações nas configurações do seu navegador.");
      }
    } catch (error: any) {
      console.error("Error subscribing to push:", error);
      alert(error.message || "Erro ao configurar notificações.");
    }
  };

  useEffect(() => {
    const checkStandalone = () => {
      // @ts-ignore
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full bg-bg-dark flex flex-col items-center justify-center space-y-4">
        <div className="w-20 h-20 rounded-2xl overflow-hidden animate-pulse">
           <img src="https://i.postimg.cc/fby2h1bg/logo-branca2.png" alt="Loading..." className="w-full h-full object-cover" />
        </div>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-gold"></div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Conectando ao Terminal...</p>
      </div>
    );
  }

  // Logo 5-click trick for admin
  const handleLogoClick = () => {
    setLogoClicks(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowAdminModal(true);
        return 0;
      }
      return next;
    });
  };

  const handleAdminAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (adminPass === ADMIN_PASSWORD) {
      setLocalAdmin(true);
      setShowAdminModal(false);
      setAdminPass('');
    } else {
      alert("Senha incorreta");
    }
  };

  const menuItems = [
    { id: 'news', label: 'Notícias', icon: Newspaper },
    { id: 'community', label: 'Comunidade', icon: Bell },
    { id: 'xauusd', label: 'XAU/USD Panel', icon: Coins },
    { id: 'ai-results', label: 'Performance IA', icon: Bot },
    { id: 'ranking', label: 'Ranking Global', icon: Trophy },
    { id: 'install', label: 'Instalar App', icon: Smartphone },
  ];

  const displayMenuItems = isAdmin 
    ? [...menuItems, { id: 'admin', label: 'Painel Gestor', icon: Save }]
    : menuItems;

  const handleNotificationCTA = () => {
    if (!isStandalone) {
      setActiveSection('install');
    } else {
      requestNotificationPermission();
    }
  };

  const getNotificationCTAContent = () => {
    if (!isStandalone) {
      return {
        title: "Instale o Aplicativo",
        subtitle: "Instale agora em menos de um minuto",
        button: "Instalar APP",
        icon: Smartphone,
        color: "gold"
      };
    }
    
    if (Notification.permission === 'granted') {
      return {
        title: "Notificações Ativas",
        subtitle: "Você já está recebendo alertas",
        button: null,
        icon: CheckCircle2,
        color: "green"
      };
    }

    return {
      title: "Ativar Notificações",
      subtitle: "Receba alertas em tempo real",
      button: "Ativar",
      icon: Bell,
      color: "gold"
    };
  };

  const ctaContent = getNotificationCTAContent();

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg-dark font-sans text-[#E5E5E5] relative safe-area-padding">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-bg-sidebar/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 z-30 shadow-xl shadow-black/40">
        <div className="flex items-center gap-3">
          <Menu 
            className="h-6 w-6 text-white cursor-pointer hover:text-brand-gold transition-colors shrink-0" 
            onClick={() => setIsMobileMenuOpen(true)}
          />
          <div 
            className="cursor-pointer"
            onClick={handleLogoClick}
          >
             <div className="w-32 h-10 flex items-center">
                <img 
                  src="https://i.postimg.cc/fby2h1bg/logo-branca2.png" 
                  alt="Forex News" 
                  className="max-w-full max-h-full object-contain" 
                />
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <div 
              className="relative p-2 cursor-pointer"
              onClick={() => setActiveSection('community')}
            >
              <Bell className="h-5 w-5 text-text-dim" />
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-brand-red text-[8px] font-bold text-white border border-bg-sidebar animate-pulse shadow-[0_0_8px_rgba(255,76,76,0.6)]">
                {unreadCount}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed inset-y-0 left-0 w-[240px] bg-bg-sidebar z-50 flex flex-col border-r border-border-sidebar"
            >
              <div className="flex h-20 items-center px-6 border-b border-border-dim justify-between">
                <div className="flex items-center">
                  <div className="w-44 h-16 shrink-0">
                    <img src="https://i.postimg.cc/fby2h1bg/logo-branca2.png" alt="Forex News" className="w-full h-full object-contain" />
                  </div>
                </div>
                <X className="h-5 w-5 text-text-dim cursor-pointer" onClick={() => setIsMobileMenuOpen(false)} />
              </div>

              <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
                {displayMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg p-3.5 transition-all duration-200 text-sm",
                      activeSection === item.id 
                        ? "nav-item-active" 
                        : "text-text-dim hover:bg-[#1A1A1A] hover:text-white"
                    )}
                  >
                    <div className="relative shrink-0">
                      <item.icon className="h-5 w-5" />
                      {item.id === 'community' && unreadCount > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-red text-[10px] font-bold text-white border-2 border-bg-sidebar">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="font-medium tracking-tight whitespace-nowrap">{item.label}</span>
                  </button>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar (Desktop) */}
      <aside 
        className={cn(
          "hidden lg:flex relative flex-col border-r border-border-sidebar bg-bg-sidebar transition-all duration-300 ease-in-out z-20",
          isSidebarOpen ? "w-[240px]" : "w-20"
        )}
      >
        {/* Header/Logo */}
        <div 
          className="flex h-24 items-center px-4 cursor-pointer"
          onClick={handleLogoClick}
        >
          <div className="flex items-center justify-center w-full overflow-hidden">
              <div className={cn("relative shrink-0 group transition-all duration-300", isSidebarOpen ? "w-48 h-14" : "w-14 h-14")}>
                 <img src="https://i.postimg.cc/fby2h1bg/logo-branca2.png" alt="Logo" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110" />
              </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {displayMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg p-3.5 transition-all duration-200 text-sm",
                activeSection === item.id 
                  ? "nav-item-active" 
                  : "text-text-dim hover:bg-[#1A1A1A] hover:text-white"
              )}
            >
              <div className="relative shrink-0">
                <item.icon className="h-5 w-5" />
                {item.id === 'community' && unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-red text-[10px] font-bold text-white border-2 border-bg-sidebar animate-pulse shadow-[0_0_8px_rgba(255,76,76,0.6)] px-1">
                    {unreadCount}
                  </span>
                )}
              </div>
              {isSidebarOpen && <span className="font-medium tracking-tight whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Admin/Stats context footer */}
        <div className="p-4 border-t border-border-dim">
          {!isAdmin ? (
            <div className="space-y-2">
              <div className={cn(
                 "flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5",
                 !isSidebarOpen && "justify-center"
              )}>
                <div className="h-1.5 w-1.5 rounded-full bg-brand-green shadow-[0_0_8px_#00C896]" />
                {isSidebarOpen && <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Servidor Online</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-brand-gold/10 rounded-full border border-brand-gold/20">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
                <span className="text-[9px] text-brand-gold font-bold uppercase truncate max-w-[120px]">
                  ADM {user ? `: ${user.email}` : ''}
                </span>
              </div>
              <button 
                onClick={() => logout()}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-3 text-red-400 hover:bg-red-400/10 transition-colors text-sm",
                  !isSidebarOpen && "justify-center"
                )}
              >
                <LogOut className="h-5 w-5" />
                {isSidebarOpen && <span className="font-medium">Sair</span>}
              </button>
            </div>
          )}
        </div>
        
        {/* Sidebar Toggle */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-24 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border-dim bg-bg-sidebar text-gray-400 hover:text-brand-gold md:flex shadow-lg"
        >
          {isSidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto immersive-gradient">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-24 items-center justify-between px-8 shrink-0">
            <div>
              <h1 className="text-2xl font-light text-white tracking-tight">
                Mercado <span className="text-brand-gold font-bold">Financeiro</span>
              </h1>
              <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-widest font-medium">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} • Terminal de Trading
              </p>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] border border-border-dim rounded-full text-[11px] font-medium text-gray-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-green shadow-[0_0_6px_#00C896]" />
                  Londres Aberto
               </div>
               <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] border border-border-dim rounded-full text-[11px] font-medium text-gray-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-green shadow-[0_0_6px_#00C896]" />
                  Nova York Aberto
               </div>
            </div>
        </header>

        {/* Section Content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8 pt-20 lg:pt-0 max-w-full mx-auto w-full relative">
          {/* Global Notification Call to Action */}
          {typeof window !== 'undefined' && (
            <motion.div 
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               className={cn(
                 "mb-6 border p-3 sm:p-4 rounded-2xl flex flex-row items-center justify-between gap-3 sm:gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-sm transition-all",
                 ctaContent.color === 'green' 
                   ? "bg-brand-green/5 border-brand-green/20" 
                   : "bg-brand-gold/5 border-brand-gold/20"
               )}
            >
              <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                <div className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border",
                  ctaContent.color === 'green' 
                    ? "bg-brand-green/10 border-brand-green/20" 
                    : "bg-brand-gold/10 border-brand-gold/20"
                )}>
                  <ctaContent.icon className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5",
                    ctaContent.color === 'green' ? "text-brand-green" : "text-brand-gold animate-bounce"
                  )} />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <h4 className="text-[11px] sm:text-sm font-black text-white uppercase tracking-tight truncate leading-tight">
                    {ctaContent.title}
                  </h4>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest font-bold truncate">
                    {ctaContent.subtitle}
                  </p>
                </div>
              </div>
              {ctaContent.button && (
                <button 
                  onClick={handleNotificationCTA}
                  className="bg-brand-gold text-bg-dark px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-[1px] transition-all hover:scale-105 active:scale-95 shadow-[0_5px_15px_rgba(212,175,55,0.2)] whitespace-nowrap shrink-0"
                >
                  {ctaContent.button}
                </button>
              )}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              className="h-full"
              key={activeSection}
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.15 }}
            >
              <SectionRouter 
                section={activeSection} 
                isAdmin={isAdmin} 
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>


      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="w-full max-w-md bg-bg-card border border-gray-800 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-brand-gold italic uppercase">Terminal Seguro</h3>
                <button onClick={() => setShowAdminModal(false)} className="text-gray-500 hover:text-white">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Senha Master</label>
                  <input 
                    type="password" 
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    autoFocus
                    className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-gold transition-colors"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-brand-gold hover:bg-opacity-90 text-bg-dark font-bold py-3 rounded-xl golden-gradient transition-all"
                >
                  Entrar
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Section Router
function SectionRouter({ section, isAdmin }: { section: string, isAdmin: boolean }) {
  switch (section) {
    case 'news': return <NewsSection />;
    case 'community': return <CommunitySection isAdmin={isAdmin} />;
    case 'xauusd': return <XauUsdSection isAdmin={isAdmin} />;
    case 'ai-results': return <AIResultsSection isAdmin={isAdmin} />;
    case 'ranking': return <RankingSection />;
    case 'install': return <InstallGuideSection />;
    case 'admin': return <div className="text-center py-20 text-gray-500 uppercase font-black tracking-widest">Acesso ao Terminal Master Concedido</div>;
    default: return <div>Seção em construção</div>;
  }
}

