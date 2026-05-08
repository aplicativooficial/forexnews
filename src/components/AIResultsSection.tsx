import { useState, useEffect, FormEvent } from 'react';
import { Bot, Plus, Trash2, Activity, X, Clock, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { AIResult } from '@/src/types';
import { api } from '@/src/lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

export function AIResultsSection({ isAdmin }: { isAdmin: boolean }) {
  const [results, setResults] = useState<AIResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncText, setSyncText] = useState('');
  const [newResult, setNewResult] = useState<Partial<AIResult>>({
    status: 'Active',
    isLive: true
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getAIResults();
        setResults(data.sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      } catch (error) {
        console.error("Error loading AI results:", error);
      }
    };
    loadData();
    // Polling every 30 seconds for relative "real-time" feel without Firebase
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAISync = async () => {
    if (!syncText.trim()) return;
    setIsSyncing(true);
    try {
      const monthRegex = /(Profit|Return|Lucro|Mês)\s*:\s*([\d.-]+)%?/i;
      const yearRegex = /(Year|Yearly|Cumulative|Ano|Acumulado)\s*:\s*([\d.-]+)%?/i;
      const winRegex = /(Win|Rate|Taxa|Acerto|Vitória)\s*:\s*([\d.-]+)%?/i;
      
      for (const r of results) {
        if (syncText.toLowerCase().includes(r.name.split(' ')[0].toLowerCase())) {
          const mMatch = syncText.match(monthRegex);
          const yMatch = syncText.match(yearRegex);
          const wMatch = syncText.match(winRegex);
          
          await api.saveAIResult({
            ...r,
            currentMonthReturn: mMatch ? Number(mMatch[2]) : r.currentMonthReturn,
            yearCumulativeReturn: yMatch ? Number(yMatch[2]) : r.yearCumulativeReturn,
            winRate: wMatch ? Number(wMatch[2]) : r.winRate,
            lastSync: new Date().toLocaleTimeString('pt-BR')
          });
        }
      }
      
      setSyncText('');
      alert("Sincronização concluída com sucesso via texto!");
    } catch (error) {
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSpreadsheetSync = async () => {
    setIsSyncing(true);
    try {
      const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1hJDvBcirXgkd1RqwIRXFgkn0fIkm2rjSeAh28GxAnJM/gviz/tq?tqx=out:json&sheet=Resultados';
      const response = await fetch(SPREADSHEET_URL);
      const text = await response.text();
      // Strip the google.visualization.Query.setResponse wrapper
      const json = JSON.parse(text.substring(47, text.length - 2));
      const rows = json.table.rows;

      for (const row of rows) {
        const traderName = row.c[0]?.v || ''; // A: Trader
        const sourceName = row.c[1]?.v || ''; // B: Fonte
        const monthlyReturn = row.c[2]?.v || 0; // C: Retorno Mensal
        const winRate = row.c[3]?.v || 0; // D: Win Rate
        const trades = row.c[4]?.v || 0; // E: Trades
        const statusStr = row.c[6]?.v || ''; // G: Status
        const maxDrawdown = row.c[7]?.v || 0; // H: Max Drawdown
        const externalUrl = row.c[8]?.v || ''; // I: Link de Monitoramento

        // Construct unique ID-like identifier for matching
        const normalizedName = `${traderName} ${sourceName}`.trim();
        const searchName = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const targetIA = results.find(r => {
           const dbName = `${r.name} ${r.source || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
           return dbName.includes(searchName) || searchName.includes(dbName);
        });

        const aiData: AIResult = {
          id: targetIA?.id || crypto.randomUUID(),
          name: traderName,
          source: sourceName,
          logo: targetIA?.logo || `https://api.dicebear.com/7.x/bottts/svg?seed=${searchName}&backgroundColor=D4AF37`,
          currentMonthReturn: Number(monthlyReturn.toFixed(2)),
          yearCumulativeReturn: targetIA?.yearCumulativeReturn || 0,
          winRate: Number(winRate.toFixed(2)),
          totalTradesMonth: Number(trades),
          maxDrawdown: Number(maxDrawdown),
          equityData: targetIA?.equityData || [100, 100 + monthlyReturn],
          status: (statusStr.includes('✅') || statusStr.includes('Ativo')) ? 'Active' : statusStr.includes('🛠') ? 'Maintenance' : 'Beta',
          lastSync: new Date().toLocaleTimeString('pt-BR'),
          isLive: true,
          trackingUrl: externalUrl && externalUrl.startsWith('http') ? externalUrl : targetIA?.trackingUrl || ''
        };

        await api.saveAIResult(aiData);
      }
      alert("Sincronização Avançada com Planilha concluída!");
    } catch (error) {
      console.error("Spreadsheet sync error:", error);
      alert("Erro ao sincronizar. Verifique se o formato da planilha mudou.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Auto-sync for admin every 10 minutes if the page is open
    if (isAdmin && results.length > 0) {
      const interval = setInterval(handleSpreadsheetSync, 600000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, results.length]);

  const handleOpenEdit = (ai: AIResult) => {
    setEditingId(ai.id);
    setResultFormData(ai);
  };

  const setResultFormData = (ai: AIResult) => {
    setNewResult(ai);
  };

  const handleSaveResult = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const aiData: AIResult = {
        id: editingId || crypto.randomUUID(),
        name: newResult.name || 'Nova IA',
        logo: newResult.logo || `https://api.dicebear.com/7.x/bottts/svg?seed=${newResult.name}&backgroundColor=D4AF37`,
        currentMonthReturn: Number(newResult.currentMonthReturn) || 0,
        yearCumulativeReturn: Number(newResult.yearCumulativeReturn) || 0,
        maxDrawdown: Number(newResult.maxDrawdown) || 0,
        totalTradesMonth: Number(newResult.totalTradesMonth) || 0,
        winRate: Number(newResult.winRate) || 0,
        equityData: newResult.equityData || [100, 102, 105, 108, 110, 112, Number(newResult.currentMonthReturn) + 100],
        status: (newResult.status as any) || 'Active',
        trackingUrl: newResult.trackingUrl || '',
        lastSync: new Date().toLocaleTimeString('pt-BR'),
        isLive: true
      };

      await api.saveAIResult(aiData);
      setEditingId(null);
      setIsAdding(false);
      setNewResult({ status: 'Active', isLive: true });
    } catch (error) {
      console.error("Erro ao salvar IA:", error);
      alert("Erro ao salvar. Verifique permissões.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    
    if (confirm("Remover dados desta IA permanentemente?")) {
      try {
        await api.deleteAIResult(id);
        setResults(prev => prev.filter(r => r.id !== id));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-brand-gold" />
          <h2 className="text-xl font-bold text-white tracking-tight uppercase tracking-[2px]">Terminal de Algoritmos</h2>
        </div>
        {isAdmin && (
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex bg-[#1A1A1A] border border-border-dim rounded-lg overflow-hidden flex-1 group">
               <input 
                 type="text" 
                 placeholder="Cole dados da Corretora aqui para Sync..." 
                 value={syncText}
                 onChange={(e) => setSyncText(e.target.value)}
                 className="flex-1 bg-transparent px-4 py-2 text-[11px] focus:outline-none text-white"
               />
               <button 
                 onClick={handleAISync}
                 disabled={isSyncing}
                 className="bg-brand-green/20 text-brand-green hover:bg-brand-green/30 px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-all border-l border-border-dim disabled:opacity-50"
               >
                 {isSyncing ? 'Processando...' : 'Sync IA'}
               </button>
            </div>
            <button 
                onClick={handleSpreadsheetSync}
                disabled={isSyncing}
                className="flex items-center justify-center gap-2 bg-[#222] border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10 font-bold px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider transition-all disabled:opacity-50"
            >
                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                Sync Planilha
            </button>
            <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center justify-center gap-2 bg-brand-gold text-bg-dark font-bold px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
            >
                <Plus className="h-4 w-4" />
                Configurar IA
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 pb-10">
        {results.map((ai) => (
          <motion.div
            key={ai.id}
            className="immersive-card group"
          >
             <div className="immersive-card-header">
                <div className="flex items-center gap-3">
                   <div className="h-8 w-8 bg-[#0D0D0D] rounded overflow-hidden">
                      <img src={ai.logo} alt={ai.name} className="w-full h-full" referrerPolicy="no-referrer" />
                   </div>
                   <div className="flex flex-col">
                      <div className="immersive-card-title leading-tight">{ai.name}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mt-0.5">{ai.source}</div>
                      {ai.lastSync && (
                         <div className="flex items-center gap-1 mt-1 text-[8px] text-gray-500 font-mono">
                            <Clock className="h-2 w-2" />
                            Sinc: {ai.lastSync}
                         </div>
                      )}
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <div className={cn(
                     "h-1.5 w-1.5 rounded-full animate-pulse",
                     ai.status === 'Active' ? "bg-brand-green shadow-[0_0_6px_#00C896]" : "bg-gray-600"
                   )} />
                   <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      {ai.status === 'Active' ? 'Real-Time' : ai.status}
                   </span>
                </div>
             </div>

             <div className="p-5 flex flex-col sm:flex-row gap-6">
                <div className="flex-1 space-y-4">
                   <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Resultado do dia anterior</span>
                      <span className={cn(
                        "text-lg font-bold font-mono",
                        ai.currentMonthReturn >= 0 ? "text-brand-green" : "text-brand-red"
                      )}>{ai.currentMonthReturn >= 0 ? '+' : ''}{ai.currentMonthReturn}%</span>
                   </div>
                   <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Resultado semanal</span>
                      <span className="text-sm font-bold text-white font-mono">{ai.winRate}%</span>
                   </div>
                   <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Resultado do mês</span>
                      <span className="text-sm font-bold text-white font-mono">{ai.totalTradesMonth}%</span>
                   </div>
                </div>
             </div>

             <div className="px-5 pb-5 flex items-center justify-between gap-4">
                {ai.trackingUrl && (
                  <a 
                    href={ai.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold py-2 rounded text-[10px] uppercase tracking-widest text-center transition-all flex items-center justify-center gap-2"
                  >
                    <Activity className="h-3 w-3 text-brand-green" />
                    Monitorar em Tempo Real
                  </a>
                )}
                {isAdmin && (
                  <div className="flex justify-end gap-2 shrink-0">
                     <button 
                       onClick={() => handleOpenEdit(ai)}
                       className="p-2 text-gray-500 hover:text-brand-gold transition-colors"
                     >
                       <Plus className="h-4 w-4" />
                     </button>
                     <button 
                       onClick={() => handleDelete(ai.id)}
                       className="p-2 text-red-400/50 hover:text-red-400 transition-colors"
                     >
                       <Trash2 className="h-4 w-4" />
                     </button>
                  </div>
                )}
             </div>
          </motion.div>
        ))}
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
                <h3 className="text-2xl font-bold text-brand-gold">
                  {editingId ? 'Editar Resultado IA' : 'Novo Resultado de IA'}
                </h3>
                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-500 hover:text-white">
                  <X className="h-7 w-7" />
                </button>
              </div>
              <form onSubmit={handleSaveResult} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-full">
                   <label className="block text-sm text-gray-400 mb-1">Nome da IA</label>
                   <input required type="text" value={newResult.name || ''} onChange={(e) => setNewResult({...newResult, name: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div className="col-span-full">
                   <label className="block text-sm text-gray-400 mb-1">Logo URL (Opcional)</label>
                   <input type="text" value={newResult.logo || ''} onChange={(e) => setNewResult({...newResult, logo: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" placeholder="https://..." />
                </div>
                <div className="col-span-full">
                   <label className="block text-sm text-gray-400 mb-1">Link de Monitoramento (Tempo Real)</label>
                   <input type="text" value={newResult.trackingUrl || ''} onChange={(e) => setNewResult({...newResult, trackingUrl: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" placeholder="https://myaccount..." />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Resultado do dia anterior (%)</label>
                   <input required type="number" step="0.01" value={newResult.currentMonthReturn || ''} onChange={(e) => setNewResult({...newResult, currentMonthReturn: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Acumulado Ano (%)</label>
                   <input required type="number" step="0.01" value={newResult.yearCumulativeReturn || ''} onChange={(e) => setNewResult({...newResult, yearCumulativeReturn: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Max Drawdown (%)</label>
                   <input required type="number" step="0.01" value={newResult.maxDrawdown || ''} onChange={(e) => setNewResult({...newResult, maxDrawdown: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Resultado semanal (%)</label>
                   <input required type="number" step="0.01" value={newResult.winRate || ''} onChange={(e) => setNewResult({...newResult, winRate: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Resultado do mês</label>
                   <input required type="number" value={newResult.totalTradesMonth || ''} onChange={(e) => setNewResult({...newResult, totalTradesMonth: e.target.value})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white" />
                </div>
                <div>
                   <label className="block text-sm text-gray-400 mb-1">Status</label>
                   <select value={newResult.status || 'Active'} onChange={(e) => setNewResult({...newResult, status: e.target.value as any})} className="w-full bg-bg-dark border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold text-white">
                      <option value="Active">Ativo (Live)</option>
                      <option value="Beta">Beta</option>
                      <option value="Maintenance">Manutenção</option>
                   </select>
                </div>
                <div className="col-span-full pt-4">
                   <button type="submit" className="w-full bg-brand-gold text-bg-dark font-bold py-4 rounded-xl golden-gradient shadow-xl uppercase tracking-widest">
                     {editingId ? 'Atualizar Resultados' : 'Publicar Resultados'}
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
