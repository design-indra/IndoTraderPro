'use client';

import { ScrollText, TrendingUp, TrendingDown, AlertTriangle, Info, Zap } from 'lucide-react';

const LOG_ICONS = {
  buy: <TrendingUp size={11} className="text-emerald-400" />,
  sell: <TrendingDown size={11} className="text-sky-400" />,
  profit: <TrendingUp size={11} className="text-emerald-400" />,
  loss: <TrendingDown size={11} className="text-red-400" />,
  warning: <AlertTriangle size={11} className="text-amber-400" />,
  error: <AlertTriangle size={11} className="text-red-400" />,
  system: <Zap size={11} className="text-slate-400" />,
  info: <Info size={11} className="text-slate-400" />,
};

const LOG_COLORS = {
  buy: 'text-emerald-400 bg-emerald-900/30',
  sell: 'text-sky-400 bg-sky-900/30',
  profit: 'text-emerald-400 bg-emerald-900/30',
  loss: 'text-red-400 bg-red-900/30',
  warning: 'text-amber-400 bg-amber-900/30',
  error: 'text-red-400 bg-red-900/30',
  system: 'text-slate-400 bg-slate-700/40',
  info: 'text-slate-400 bg-slate-700/40',
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TradeLog({ logs = [] }) {
  return (
    <div className="rounded-2xl border border-slate-700 overflow-hidden" style={{background:'var(--surface-2)'}}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <ScrollText size={14} className="text-sky-400" />
        <span className="text-xs font-semibold text-slate-400">Trade Log</span>
        <span className="ml-auto mono text-xs text-slate-500">{logs.length} entries</span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
        {logs.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-slate-600">
            <ScrollText size={24} />
            <p className="text-xs mt-2 text-slate-500">Log kosong — start bot</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-2.5 flex items-start gap-2.5 hover:bg-slate-700/20 transition-colors slide-in"
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5 ${LOG_COLORS[log.type] || LOG_COLORS.info}`}>
                  {LOG_ICONS[log.type] || LOG_ICONS.info}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 leading-relaxed break-words">{log.message}</p>
                  <p className="mono text-xs text-slate-500 mt-0.5">{formatTime(log.time)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
