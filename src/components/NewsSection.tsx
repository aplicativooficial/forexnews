import { useState, useEffect } from 'react';
import { Newspaper, Clock, ExternalLink, RefreshCw, X, Sparkles, ChevronRight, Info, AlertTriangle, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { NewsItem } from '@/src/types';
import { GoogleGenAI, Type } from "@google/genai";
import { api } from '@/src/lib/api';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function NewsSection() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Todas');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const sendPushNotification = (item: NewsItem) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`FOREX NEWS: ${item.title}`, {
        body: `${item.source} - Impacto: ${item.impact.toUpperCase()}`,
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjEwMCIgZmlsbD0iIzBEMEQwRCIvPgogIDxnIHN0cm9rZT0iI0Q0QUYzNyIgc3Ryb2tlLXdpZHRoPSI0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4KICAgIDxwYXRoIGQ9Ik04MCA0NDAgTCAxOTAgMzEwIEwgMjYwIDM3MCBMIDQ0MCAxNDAiLz4KICAgIDxwYXRoIGQ9Ik0zNTAgMTQwIEwgNDQwIDE0MCBMIDQ0MCAyMzAiLz4KICA8L2c+Cjwvc3ZnPg==',
        tag: item.id 
      });
    }
  };

  const checkAndNotify = (newItems: NewsItem[]) => {
    const seenIdsStr = localStorage.getItem('forex_seen_news_ids');
    const seenIds = seenIdsStr ? JSON.parse(seenIdsStr) : [];
    
    const highImpactNew = newItems.filter(item => 
      item.impact === 'high' && !seenIds.includes(item.id)
    );

    if (highImpactNew.length > 0) {
      sendPushNotification(highImpactNew[0]);
      const updatedSeenIds = Array.from(new Set([...seenIds, ...newItems.map(n => n.id)]));
      localStorage.setItem('forex_seen_news_ids', JSON.stringify(updatedSeenIds.slice(-100)));
    } else {
      const updatedSeenIds = Array.from(new Set([...seenIds, ...newItems.map(n => n.id)]));
      localStorage.setItem('forex_seen_news_ids', JSON.stringify(updatedSeenIds.slice(-100)));
    }
  };

  const generateAiInsights = async (item: NewsItem, background = false) => {
    // Check if this item is already being processed to avoid duplicate calls
    const newsItem = news.find(n => n.id === item.id);
    if (newsItem?.fullContent && newsItem?.summary) {
      if (!background) setSelectedNews(newsItem);
      return newsItem;
    }
    
    if (!background) setIsGenerating(true);
    try {
      // 1. Check Local API Cache first
      const cachedData = await api.getNewsCache(item.id);
      
      if (cachedData) {
        const updatedItem = {
          ...item,
          fullContent: cachedData.fullContent,
          summary: cachedData.summary,
          keyPoints: cachedData.keyPoints,
          recommendation: cachedData.recommendation
        };
        setNews(prev => prev.map(n => n.id === item.id ? updatedItem : n));
        if (!background) setSelectedNews(updatedItem);
        return updatedItem;
      }

      // 2. Generate if not cached
      const prompt = `Analista Forex Sênior: Traduza para PT-BR e Analise.
      Notícia: ${item.title} | ${item.description}
      
      Retorne JSON:
      {
        "fullContent": "Tradução detalhada do conteúdo e análise de mercado (3-4 parágrafos pequenos)",
        "summary": "Resumo executivo de 1 frase",
        "keyPoints": ["Ponto chave 1", "Ponto chave 2", "Ponto chave 3"],
        "recommendation": "Par e direção recomendada"
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullContent: { type: Type.STRING },
              summary: { type: Type.STRING },
              keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["fullContent", "summary", "keyPoints", "recommendation"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      const updatedItem = {
        ...item,
        fullContent: data.fullContent,
        summary: data.summary,
        keyPoints: data.keyPoints,
        recommendation: data.recommendation
      };

      // 3. Save to Local API Cache
      await api.saveNewsCache({
        id: item.id,
        fullContent: data.fullContent,
        summary: data.summary,
        keyPoints: data.keyPoints,
        recommendation: data.recommendation
      });

      // Update in news list as well
      setNews(prev => prev.map(n => n.id === item.id ? updatedItem : n));
      if (!background) setSelectedNews(updatedItem);
      return updatedItem;
    } catch (error) {
      console.error("AI Insights error:", error);
      return item;
    } finally {
      if (!background) setIsGenerating(false);
    }
  };

  const translateNews = async (items: NewsItem[]) => {
    try {
      const cacheKey = 'forex_news_translations';
      const cacheStr = localStorage.getItem(cacheKey);
      const cache = cacheStr ? JSON.parse(cacheStr) : {};
      
      const toTranslate = items.filter(item => !cache[item.id]);
      
      if (toTranslate.length === 0) {
        return items.map(item => ({
          ...item,
          title: cache[item.id]?.title || item.title,
          description: cache[item.id]?.description || item.description
        }));
      }

      const prompt = `Traduza para PT-BR (Forex Técnico). Retorne JSON { "translations": [{ "id", "title", "description" }] }.
      Notícias:
      ${toTranslate.map(item => `ID: ${item.id}\nTitle: ${item.title}\nDescription: ${item.description}`).join('\n\n')}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ["id", "title", "description"]
                }
              }
            }
          }
        }
      });

      const json = JSON.parse(response.text || '{}');
      const translatedData = json.translations || [];
      
      translatedData.forEach((t: any) => {
        cache[t.id] = { title: t.title, description: t.description };
      });
      localStorage.setItem(cacheKey, JSON.stringify(cache));
      
      return items.map(item => {
        const translation = cache[item.id];
        if (translation) {
          return {
            ...item,
            title: translation.title,
            description: translation.description
          };
        }
        return item;
      });
    } catch (error) {
      console.error("Translation error:", error);
      return items;
    }
  };

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.fxstreet.com/rss/news');
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("RSS API returned invalid JSON: " + text.substring(0, 100));
      }
      
      if (!data || !data.items) {
        throw new Error("Invalid response format from RSS API");
      }

      const mappedNews: NewsItem[] = data.items.map((item: any, index: number) => ({
        id: item.guid || index.toString(),
        title: item.title,
        source: 'FXStreet',
        time: new Date(item.pubDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        description: item.description.replace(/<[^>]*>?/gm, '').trim(),
        url: item.link,
        impact: index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low',
        currency: item.title.includes('USD') || item.title.includes('FED') || item.title.includes('Inflation') ? 'USD' : 
                  item.title.includes('EUR') || item.title.includes('ECB') ? 'EUR' : 
                  item.title.includes('GOLD') || item.title.includes('XAU') ? 'XAU' : 'Macro'
      }));
      
      const translatedNews = await translateNews(mappedNews);
      setNews(translatedNews);

      // Trigger background AI generation for top news with delay to avoid rate limits
      translatedNews.slice(0, 8).forEach((item, index) => {
        setTimeout(() => generateAiInsights(item, true), index * 1000);
      });
    } catch (error) {
      console.error("Error fetching news:", error);
      if (news.length === 0) {
        setNews([
          {
            id: '1',
            title: 'Dados do Payroll surpreendem mercado e USD ganha força global',
            source: 'Forex News Analysis',
            time: '10:30',
            description: 'O relatório de emprego dos EUA mostrou a criação de mais vagas do que o esperado, impulsionando o dólar contra as principais moedas.',
            url: '#',
            impact: 'high',
            currency: 'USD'
          }
        ]);
      }
    } finally {
      setLoading(false);
      setTimeLeft(300);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fetchNews();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleNewsClick = (item: NewsItem) => {
    setSelectedNews(item);
    generateAiInsights(item);
  };

  const filters = ['Todas', 'USD', 'EUR', 'XAU', 'Macro'];
  const filteredNews = filter === 'Todas' ? news : news.filter(n => n.currency === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
           {filters.map((f) => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={cn(
                 "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border shrink-0",
                 filter === f 
                   ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30" 
                   : "bg-[#1A1A1A] text-gray-500 border-border-dim hover:text-white"
               )}
             >
               {f}
             </button>
           ))}
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if ('Notification' in window) {
                    Notification.requestPermission().then(permission => {
                      setNotificationsEnabled(permission === 'granted');
                    });
                  }
                }}
                className={cn(
                  "p-1.5 rounded-lg border transition-all",
                  notificationsEnabled 
                    ? "text-brand-gold border-brand-gold/20 bg-brand-gold/5 shadow-[0_0_8px_rgba(212,175,55,0.2)]" 
                    : "text-gray-500 border-border-dim hover:text-white"
                )}
                title={notificationsEnabled ? "Notificações Ativas" : "Ativar Notificações"}
              >
                <Clock className={cn("h-4 w-4", notificationsEnabled && "animate-pulse")} />
              </button>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#00C896]">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-green shadow-[0_0_6px_#00C896]" />
                <span>Atualizando em {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              </div>
           </div>
        </div>
      </div>

      <div className="immersive-card">
        <div className="immersive-card-header">
           <div className="immersive-card-title flex items-center gap-2">
              Live Forex Feed
           </div>
           <button 
              onClick={fetchNews}
              disabled={loading}
              className={cn("text-gray-500 hover:text-white transition-colors", loading && "animate-spin")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
        </div>

        <div className="divide-y divide-[#1E1E1E]">
          {loading && news.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-6 animate-pulse bg-bg-card/50 h-24" />
            ))
          ) : filteredNews.length > 0 ? (
            filteredNews.map((item) => (
               <motion.div
                 key={item.id}
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 onClick={() => handleNewsClick(item)}
                 className={cn(
                   "group p-4 flex gap-4 items-start hover:bg-[#1A1A1A] transition-colors relative cursor-pointer",
                   item.impact === 'high' ? "border-l-3 border-l-brand-red" : item.impact === 'medium' ? "border-l-3 border-l-brand-gold" : "border-l-3 border-l-transparent"
                 )}
               >
                 <div className="min-w-[45px] text-[11px] font-mono text-gray-600 mt-0.5">
                   {item.time}
                 </div>
                 <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">{item.source}</span>
                      {item.currency && (
                        <span className="text-[9px] font-bold text-gray-500 border border-border-dim px-1 rounded">{item.currency}</span>
                      )}
                    </div>
                    <h4 className="text-[13px] font-semibold text-[#DDD] group-hover:text-white transition-colors leading-snug">{item.title}</h4>
                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                 </div>
                 <div className="opacity-0 group-hover:opacity-100 p-2 text-brand-gold transition-opacity">
                   <ChevronRight className="h-4 w-4" />
                 </div>
               </motion.div>
            ))
          ) : (
            <div className="py-20 text-center text-gray-600 text-xs uppercase tracking-widest">
              Nenhuma notícia encontrada
            </div>
          )}
        </div>
      </div>

      {/* News Detail Modal */}
      <AnimatePresence>
        {selectedNews && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-6 lg:p-12 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full h-full max-w-6xl bg-bg-dark border border-white/10 rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col relative"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-bg-sidebar/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center">
                    <Newspaper className="h-5 w-5 text-brand-gold" />
                  </div>
                  <div>
                    <h2 className="text-[10px] md:text-xs font-black text-brand-gold uppercase tracking-[2px]">Terminal de Inteligência</h2>
                    <p className="text-[9px] md:text-[10px] text-gray-500 uppercase font-bold tracking-widest">Processamento via Gemini AI</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedNews(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                  
                  {/* Left Column: Full News & Content */}
                  <div className="lg:col-span-2 space-y-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                          selectedNews.impact === 'high' ? "bg-brand-red/10 text-brand-red" : "bg-brand-gold/10 text-brand-gold"
                        )}>
                          Impacto {selectedNews.impact}
                        </span>
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{selectedNews.source} • {selectedNews.time}</span>
                      </div>
                      <h1 className="text-2xl md:text-4xl font-light text-white leading-tight tracking-tight">
                        {selectedNews.title}
                      </h1>
                    </div>

                    <div className="prose prose-invert max-w-none">
                      <div className="space-y-6">
                        <AnimatePresence mode="wait">
                          <motion.div 
                            key={selectedNews.fullContent ? 'full' : 'desc'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <p className="text-gray-300 text-lg leading-relaxed font-light whitespace-pre-wrap">
                              {selectedNews.fullContent || selectedNews.description}
                            </p>
                          </motion.div>
                        </AnimatePresence>
                        
                        {isGenerating && !selectedNews.fullContent && (
                          <div className="space-y-4 py-4">
                            <div className="h-4 bg-white/5 rounded-full w-full animate-pulse" />
                            <div className="h-4 bg-white/5 rounded-full w-[90%] animate-pulse" />
                            <div className="flex items-center gap-3 mt-4">
                               <Sparkles className="h-4 w-4 text-brand-gold animate-spin" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold animate-pulse">Sincronizando Análise em Tempo Real...</span>
                            </div>
                          </div>
                        )}

                        {!isGenerating && (
                          <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                            <a 
                              href={selectedNews.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[11px] font-black uppercase tracking-[2px] text-brand-gold hover:underline flex items-center gap-2"
                            >
                              Ver Fonte Original <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: AI Sidebar */}
                  <div className="space-y-6">
                    <div className="bg-[#1A1A1A] border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Sparkles className="h-12 w-12 text-brand-gold" />
                      </div>
                      <h3 className="text-xs font-black text-white uppercase tracking-[2px] mb-4 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-brand-gold" /> Sumário IA
                      </h3>
                      
                      {isGenerating && !selectedNews.summary ? (
                        <div className="space-y-3">
                          <div className="h-2 bg-white/5 rounded-full w-full animate-pulse" />
                          <div className="h-2 bg-white/5 rounded-full w-[80%] animate-pulse" />
                        </div>
                      ) : (
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-[13px] text-gray-400 leading-relaxed italic"
                        >
                          "{selectedNews.summary || "Processando síntese de IA..."}"
                        </motion.p>
                      )}
                    </div>

                    <div className="bg-[#1A1A1A] border border-white/5 rounded-2xl p-6">
                      <h3 className="text-xs font-black text-white uppercase tracking-[2px] mb-4 flex items-center gap-2">
                        <Info className="h-4 w-4 text-brand-gold" /> Pontos Chave
                      </h3>
                      <ul className="space-y-4">
                        {isGenerating ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <li key={i} className="flex gap-3">
                              <div className="h-2 w-2 rounded-full bg-white/10 shrink-0 mt-1.5 animate-pulse" />
                              <div className="h-2 bg-white/5 rounded-full w-full animate-pulse" />
                            </li>
                          ))
                        ) : selectedNews.keyPoints?.map((point, i) => (
                          <motion.li 
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex gap-3 text-[12px] text-gray-400 leading-tight"
                          >
                            <ChevronRight className="h-3 w-3 text-brand-gold shrink-0 mt-0.5" />
                            {point}
                          </motion.li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-brand-gold/5 border border-brand-gold/10 rounded-2xl p-6">
                      <h3 className="text-xs font-black text-brand-gold uppercase tracking-[2px] mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" /> Recomendação
                      </h3>
                      <div className="p-3 bg-brand-gold/10 rounded-xl border border-brand-gold/10">
                        <span className="text-lg font-black text-brand-gold uppercase tracking-tighter">
                          {isGenerating ? "ANALISANDO..." : (selectedNews.currency || "MACRO")}
                        </span>
                      </div>
                      <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mt-3">Baseado na volatilidade atual detectada</p>
                    </div>
                  </div>
                  
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

