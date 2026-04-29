'use client';
import { Shield } from 'lucide-react';

const fmt    = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n||0));
const fmtPct = (n) => `${n>=0?'+':''}${(n||0).toFixed(2)}%`;

export function PositionCard({ position, currentPrice }) {
  if (!position) return null;
  const current  = currentPrice || position.entryPrice;
  const pnlPct   = ((current - position.entryPrice) / position.entryPrice) * 100;
  const pnl      = (pnlPct / 100) * position.idrAmount;
  const isProfit = pnl >= 0;
  return (
    <div className={`rounded-xl border p-3 ${isProfit?'border-emerald-700/50 bg-emerald-900/20':'border-red-700/50 bg-red-900/20'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-sky-900/40 text-sky-400 text-xs font-bold rounded-md">
            {position.pair?.replace('_idr','').toUpperCase()}/IDR
          </span>
          <span className="text-xs text-slate-500">BUY</span>
        </div>
        <span className={`text-xs font-bold mono ${isProfit?'text-emerald-400':'text-red-400'}`}>
          {isProfit?'+':''}Rp {fmt(Math.abs(pnl))} <span className="font-normal text-slate-500">({fmtPct(pnlPct)})</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-slate-500 block">Entry</span><span className="mono font-semibold text-slate-300">Rp {fmt(position.entryPrice)}</span></div>
        <div><span className="text-slate-500 block">Current</span><span className={`mono font-semibold ${isProfit?'text-emerald-400':'text-red-400'}`}>Rp {fmt(current)}</span></div>
        {position.stopLoss   && <div><span className="text-slate-500 block">Stop Loss</span><span className="mono font-medium text-red-400">Rp {fmt(position.stopLoss)}</span></div>}
        {position.takeProfit && <div><span className="text-slate-500 block">Take Profit</span><span className="mono font-medium text-emerald-400">Rp {fmt(position.takeProfit)}</span></div>}
      </div>
      {position.trailingStop && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-400 bg-amber-900/20 rounded-lg px-2 py-1">
          <Shield size={10}/> Trailing: Rp {fmt(position.trailingStop)}
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon, color='sky' }) {
  const colors = { sky:'bg-sky-900/30 text-sky-400', green:'bg-emerald-900/30 text-emerald-400', red:'bg-red-900/30 text-red-400', amber:'bg-amber-900/30 text-amber-400' };
  return (
    <div className="rounded-xl border border-slate-700 p-3 shadow-sm" style={{background:'var(--surface-2)'}}>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-1.5 ${colors[color]||colors.sky}`}>{icon}</div>
      <div className="mono font-bold text-slate-100 text-base leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export function LevelBadge({ level, levels }) {
  const lv = levels?.find((l)=>l.id===level);
  if (!lv) return null;
  return <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:lv.color}}>{lv.icon} L{lv.id}</span>;
}

export function SignalPanel({ signal, level }) {
  if (!signal) return (
    <div className="py-4 text-center">
      <p className="text-xs text-slate-500">Menunggu sinyal pertama...</p>
    </div>
  );
  const action = signal.action || 'HOLD';
  const colors = { BUY:'bg-emerald-500', SELL:'bg-red-500', HOLD:'bg-slate-500' };
  const bgs    = { BUY:'bg-emerald-900/20 border-emerald-700/50', SELL:'bg-red-900/20 border-red-700/50', HOLD:'bg-slate-700/30 border-slate-600' };
  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between p-3 rounded-xl border ${bgs[action]||bgs.HOLD}`}>
        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-bold ${colors[action]}`}>
          {action==='BUY'?'↑':action==='SELL'?'↓':'→'} {action}
        </span>
        {signal.score!==undefined && (
          <div className="text-right">
            <div className="mono font-bold text-slate-100 text-lg">{Math.round(signal.score)}</div>
            <div className="text-xs text-slate-500">score</div>
          </div>
        )}
      </div>
      {signal.signals && Object.entries(signal.signals).map(([k,v])=>(
        <div key={k} className="flex justify-between text-xs">
          <span className="text-slate-500 uppercase">{k}</span>
          <span className={`font-semibold ${String(v).includes('bull')||String(v).includes('over')?'text-emerald-400':String(v).includes('bear')?'text-red-400':'text-slate-400'}`}>{v}</span>
        </div>
      ))}
      {signal.rsi!==undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">RSI (14)</span>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${signal.rsi<30?'bg-emerald-400':signal.rsi>70?'bg-red-400':'bg-sky-400'}`} style={{width:`${signal.rsi}%`}}/>
            </div>
            <span className={`mono font-bold ${signal.rsi<30?'text-emerald-400':signal.rsi>70?'text-red-400':'text-slate-300'}`}>{signal.rsi?.toFixed(1)}</span>
          </div>
        </div>
      )}
      {signal.trend && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Trend</span>
          <span className={`font-semibold ${signal.trend==='bullish'?'text-emerald-400':signal.trend==='bearish'?'text-red-400':'text-slate-400'}`}>
            {signal.trend==='bullish'?'↑ Bullish':signal.trend==='bearish'?'↓ Bearish':'→ Sideways'}
          </span>
        </div>
      )}
    </div>
  );
}

export function RiskPanel({ consecutiveLosses=0, openPositions=0 }) {
  return (
    <div className="space-y-3">
      {[{label:'Consecutive Losses',val:consecutiveLosses,max:3,c:'#f87171'},
        {label:'Open Positions',    val:openPositions,    max:2,c:'#38bdf8'}].map((item)=>(
        <div key={item.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500">{item.label}</span>
            <span className="mono font-bold" style={{color:item.c}}>{item.val}/{item.max}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({length:item.max}).map((_,i)=>(
              <div key={i} className="h-2 flex-1 rounded-full" style={{background: i<item.val ? item.c : '#334155'}}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PositionCard;
