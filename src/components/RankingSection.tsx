import { useState, useEffect } from 'react';
import { Trophy, Download, ArrowUpRight, TrendingUp, Filter, BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { AIResult } from '@/src/types';
import { api } from '@/src/lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export function RankingSection() {
  const [results, setResults] = useState<AIResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'month' | 'winrate' | 'totalMonth'>('month');

  useEffect(() => {
    const loadResults = async () => {
      try {
        const data = await api.getAIResults();
        setResults(data);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar ranking:", error);
        setLoading(false);
      }
    };
    loadResults();
    const interval = setInterval(loadResults, 30000);
    return () => clearInterval(interval);
  }, []);

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'month') return b.currentMonthReturn - a.currentMonthReturn;
    if (sortBy === 'winrate') return b.winRate - a.winRate;
    if (sortBy === 'totalMonth') return b.totalTradesMonth - a.totalTradesMonth;
    return 0;
  });

  const exportCSV = () => {
    const headers = ['Posição,IA,Resultado do dia anterior (%),Resultado semanal (%),Resultado mensal (%)'];
    const rows = sortedResults.map((ai, idx) => 
      `${idx + 1},${ai.name},${ai.currentMonthReturn},${ai.winRate},${ai.totalTradesMonth}`
    );
    const content = headers.concat(rows).join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ranking_forex_new_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getChartLabel = () => {
    switch (sortBy) {
      case 'month': return 'Resultado do dia anterior (%)';
      case 'winrate': return 'Resultado semanal (%)';
      case 'totalMonth': return 'Resultado mensal (%)';
      default: return '';
    }
  };

  const chartValues = sortedResults.map(r => {
    if (sortBy === 'month') return r.currentMonthReturn;
    if (sortBy === 'winrate') return r.winRate;
    return r.totalTradesMonth;
  });

  const barData = {
    labels: sortedResults.map(r => r.name),
    datasets: [
      {
        label: getChartLabel(),
        data: chartValues,
        backgroundColor: chartValues.map(val => val >= 0 ? '#00C896' : '#FF4C4C'),
        borderRadius: 8,
      }
    ]
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Trophy className="h-5 w-5 text-brand-gold" />
          <h2 className="text-xl font-bold text-white tracking-tight leading-none uppercase tracking-[2px]">High Score Board</h2>
        </div>
        <div className="flex gap-2">
           {[
             { id: 'month', label: 'Dia Ant.' },
             { id: 'winrate', label: 'Res. Semanal' },
             { id: 'totalMonth', label: 'Res. Mensal' }
           ].map((f) => (
             <button
               key={f.id}
               onClick={() => setSortBy(f.id as any)}
               className={cn(
                 "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all border",
                 sortBy === f.id 
                   ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30" 
                   : "bg-[#1A1A1A] text-gray-500 border-border-dim hover:text-white"
               )}
             >
               {f.label}
             </button>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Table/List View */}
        <div className="xl:col-span-2 immersive-card">
          <div className="immersive-card-header">
             <div className="immersive-card-title">Ranking de Rentabilidade</div>
             <button 
               onClick={exportCSV}
               className="text-[10px] text-gray-500 hover:text-brand-gold flex items-center gap-1 uppercase font-bold tracking-widest transition-colors"
             >
               <Download className="h-3.5 w-3.5" />
               Exportar
             </button>
          </div>
          
          {/* Mobile View (Cards) */}
          <div className="md:hidden divide-y divide-border-dim">
            {sortedResults.map((ai, idx) => (
              <div key={ai.id} className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img src={ai.logo} alt="" className="h-10 w-10 rounded bg-black" referrerPolicy="no-referrer" />
                      {ai.isLive && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brand-green border-2 border-[#0D0D0D] animate-pulse" />
                      )}
                    </div>
                    <div className="flex flex-col">
                       <div className="text-[14px] font-bold text-white leading-tight">{ai.name}</div>
                       <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{ai.source}</div>
                       <div className="text-[10px] text-gray-600 font-mono mt-1">Rank #{idx + 1}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-lg font-mono font-bold",
                    (sortBy === 'month' ? ai.currentMonthReturn : sortBy === 'winrate' ? ai.winRate : ai.totalTradesMonth) >= 0 ? "text-brand-green" : "text-brand-red"
                  )}>
                    {(sortBy === 'month' ? ai.currentMonthReturn : sortBy === 'winrate' ? ai.winRate : ai.totalTradesMonth) >= 0 ? '+' : ''}
                    {(sortBy === 'month' ? ai.currentMonthReturn : sortBy === 'winrate' ? ai.winRate : ai.totalTradesMonth).toFixed(2)}%
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 bg-[#111] p-3 rounded-lg border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Dia Anterior</span>
                    <span className={cn(
                      "text-xs font-mono font-bold",
                      ai.currentMonthReturn >= 0 ? "text-brand-green" : "text-brand-red"
                    )}>
                      {ai.currentMonthReturn >= 0 ? '+' : ''}{ai.currentMonthReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-white/5 pl-3">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Res. Semanal</span>
                    <span className="text-xs font-mono text-[#DDD]">{ai.winRate}%</span>
                  </div>
                  <div className="flex flex-col pt-3 border-t border-white/5">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Res. Mensal</span>
                    <span className="text-xs font-mono text-[#DDD]">{ai.totalTradesMonth}%</span>
                  </div>
                  <div className="flex flex-col pt-3 border-t border-l border-white/5 pl-3 text-right">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Ações</span>
                    {ai.trackingUrl ? (
                      <a href={ai.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand-gold flex items-center justify-end gap-1">
                        Ver <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">N/A</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View (Table) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dim bg-[#1A1A1A]/30">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500 w-16 text-center">Pos</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500">Sistema IA / Fonte</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500 text-right">Resultado do dia anterior</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500 text-right">Resultado semanal</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500 text-right">Resultado mensal</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-gray-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim">
                {sortedResults.map((ai, idx) => (
                  <tr key={ai.id} className="group hover:bg-[#1A1A1A]/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center h-full">
                        {idx === 0 ? <TrendingUp className="h-4 w-4 text-brand-gold" /> : 
                         <span className="text-[11px] font-mono text-gray-600">#{idx + 1}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img src={ai.logo} alt="" className="h-7 w-7 rounded bg-black" referrerPolicy="no-referrer" />
                          {ai.isLive && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-green border border-[#0D0D0D] animate-pulse shadow-[0_0_4px_#00C896]" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-[13px] text-white line-clamp-1">{ai.name}</span>
                          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mt-0.5">{ai.source}</span>
                        </div>
                      </div>
                    </td>
                    <td className={cn(
                      "px-6 py-4 text-right font-mono font-bold text-[13px]",
                      ai.currentMonthReturn >= 0 ? "text-brand-green" : "text-brand-red"
                    )}>
                      {ai.currentMonthReturn >= 0 ? '+' : ''}{ai.currentMonthReturn.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-400 text-[11px] font-bold">
                       {ai.winRate}%
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-400 text-[11px] font-bold">
                       {ai.totalTradesMonth}%
                    </td>
                    <td className="px-6 py-4 text-right">
                       {ai.trackingUrl ? (
                         <a 
                           href={ai.trackingUrl} 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           className="text-[10px] uppercase font-bold text-brand-gold hover:underline inline-flex items-center gap-1"
                         >
                           Acompanhar
                           <ArrowUpRight className="h-3 w-3" />
                         </a>
                       ) : (
                         <button className="text-[10px] uppercase font-bold text-brand-gold hover:underline">Auditar</button>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comparison Chart */}
        <div className="space-y-6">
           <div className="immersive-card">
              <div className="immersive-card-header">
                 <div className="immersive-card-title">Alpha Distribution</div>
              </div>
              <div className="p-6 h-64">
                <Bar 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        display: false
                      },
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#666' }
                      }
                    },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#000',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        displayColors: true,
                        callbacks: {
                          label: (context) => {
                            const val = context.parsed.y;
                            return ` ${context.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
                          }
                        }
                      }
                    }
                  }}
                  data={barData}
                />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

