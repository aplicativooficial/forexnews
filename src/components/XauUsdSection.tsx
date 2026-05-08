import { useState, useEffect, useRef } from 'react';
import { Calendar, TrendingUp, Edit2, Save, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { DailyAnalysis } from '@/src/types';
import { api } from '@/src/lib/api';

export function XauUsdSection({ isAdmin }: { isAdmin: boolean }) {
  const chartContainer = useRef<HTMLDivElement>(null);
  const calendarContainer = useRef<HTMLDivElement>(null);
  
  const [analysis, setAnalysis] = useState<DailyAnalysis>({
    date: new Date().toLocaleDateString('pt-BR'),
    text: "O ouro (XAU/USD) apresenta uma tendência lateralizada no curto prazo, aguardando os dados de inflação dos EUA. Suporte importante em 2300 e resistência em 2450."
  });
  const [isEditing, setIsEditing] = useState(false);
  const [tempText, setTempText] = useState(analysis.text);

  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        const data = await api.getDailyAnalysis();
        if (data) {
          setAnalysis(data);
          setTempText(data.text);
        }
      } catch (error) {
        console.error("Error loading XAU analysis:", error);
      }
    };
    loadAnalysis();
    const interval = setInterval(loadAnalysis, 60000); // 1 minute polling is enough
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // TradingView Advanced Chart Widget - Gold
    if (chartContainer.current && !chartContainer.current.querySelector('iframe')) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        "autosize": true,
        "symbol": "SAXO:XAUUSD",
        "interval": "15",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "br",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "calendar": false,
        "hide_top_toolbar": false,
        "save_image": false,
        "backgroundColor": "rgba(0, 0, 0, 1)",
        "gridColor": "rgba(42, 46, 57, 0.06)",
        "withdateranges": true,
        "support_host": "https://www.tradingview.com"
      });
      chartContainer.current.appendChild(script);
    }

    // TradingView Economic Calendar Widget
    if (calendarContainer.current && !calendarContainer.current.querySelector('iframe')) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        "width": "100%",
        "height": 460,
        "colorTheme": "dark",
        "isWidescreen": false,
        "displayMode": "adaptive",
        "locale": "br",
        "importanceFilter": "-1,0,1"
      });
      calendarContainer.current.appendChild(script);
    }
  }, []);

  const handleSaveAnalysis = async () => {
    try {
      const updatedAnalysis: DailyAnalysis = {
        id: 'current',
        date: new Date().toLocaleDateString('pt-BR'),
        text: tempText
      };
      await api.saveDailyAnalysis(updatedAnalysis);
      setAnalysis(updatedAnalysis);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving XAU analysis:", error);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chart (Span 2) */}
        <div className="xl:col-span-2 immersive-card">
          <div className="immersive-card-header leading-none">
             <div className="immersive-card-title">XAU/USD Gold Spot</div>
             <div className="flex items-center gap-3">
               <span className="text-[10px] text-gray-500 font-bold tracking-widest leading-none">LIVE MARKET FEED</span>
               <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[8px] text-green-500/70 font-bold uppercase tracking-tighter">Real-Time Data</span>
               </div>
             </div>
          </div>
          <div className="h-[450px] md:h-[600px] bg-[#0F0F0F] relative">
            <div className="tradingview-widget-container h-full" ref={chartContainer}>
              <div className="tradingview-widget-container__widget h-full"></div>
            </div>
          </div>
        </div>

        {/* Sidebar Data */}
        <div className="space-y-6">
          {/* Analysis Card */}
          <div className="immersive-card h-fit">
            <div className="immersive-card-header">
               <div className="immersive-card-title flex items-center gap-2">
                 <TrendingUp className="h-4 w-4" />
                 Trading Signal
               </div>
               <span className="text-[10px] text-gray-500 font-mono">{analysis.date}</span>
            </div>
            <div className="p-5">
              {isEditing ? (
                <div className="space-y-3">
                  <textarea 
                    value={tempText}
                    onChange={(e) => setTempText(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-border-dim rounded-lg p-3 text-sm text-[#DDD] focus:outline-none focus:border-brand-gold h-32 resize-none"
                  />
                  <button 
                    onClick={handleSaveAnalysis}
                    className="w-full bg-brand-gold text-bg-dark font-bold py-2 rounded-lg text-[11px] uppercase tracking-wider golden-gradient"
                  >
                    Salvar Dados
                  </button>
                </div>
              ) : (
                <div className="relative group">
                  <p className="text-[13px] text-[#A0A0A0] leading-relaxed italic">"{analysis.text}"</p>
                  {isAdmin && (
                    <button 
                      onClick={() => { setTempText(analysis.text); setIsEditing(true); }}
                      className="absolute -top-1 -right-1 p-2 bg-[#1A1A1A] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit2 className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Economic Calendar */}
          <div className="immersive-card flex flex-col h-[500px]">
             <div className="immersive-card-header flex-shrink-0">
                <div className="immersive-card-title flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendário Econômico
                </div>
             </div>
             <div className="flex-1 overflow-hidden tradingview-widget-container" ref={calendarContainer}>
                <div className="tradingview-widget-container__widget h-full"></div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

