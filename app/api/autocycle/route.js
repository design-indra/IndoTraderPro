/**
 * app/api/autocycle/route.js — Per-User Auto Cycle (Server-Side Background Bot)
 * Setiap user punya timer sendiri — admin stop tidak mempengaruhi user lain
 */
import { NextResponse } from 'next/server';
import { getBotState, runCycle, recordTradeResult } from '../../../lib/tradingEngine.js';
import { getOHLCV }      from '../../../lib/indodax.js';
import { getRiskSettings } from '../../../lib/riskManager.js';
import { getBestPair }   from '../../../lib/autoScanner.js';
import { verifyToken }   from '../../../lib/auth.js';
import {
  getUserState, saveUserState, userDemoBuy, userDemoSell, userUpdatePositions,
} from '../../../lib/userState.js';

// Per-user cycle timers
const userCycles = new Map();

function extractUserId(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  const dec   = verifyToken(token);
  return dec?.id || null;
}

function getCycleState(userId) {
  if (!userCycles.has(userId)) {
    userCycles.set(userId, {
      timer: null, running: false,
      config: { tf: '5m', pair: 'btc_idr', autoScanner: false },
      lastCycleTime: null, lastError: null, cycleCount: 0,
    });
  }
  return userCycles.get(userId);
}

async function runUserCycle(userId) {
  const cs  = getCycleState(userId);
  const bot = getBotState(userId);
  if (!bot.running) return;

  let demo;
  try { demo = await getUserState(userId); } catch { return; }

  const riskCfg  = getRiskSettings();
  let pair       = cs.config.pair || bot.pair || 'btc_idr';

  try {
    // Auto scanner — pilih pair terbaik
    if (cs.config.autoScanner && (demo.openPositions || []).length === 0) {
      const best = await getBestPair(pair).catch(() => null);
      if (best?.pair) pair = best.pair;
    }
    if ((demo.openPositions || []).length > 0) pair = demo.openPositions[0].pair;

    const candles = await getOHLCV(pair, cs.config.tf || '5m', 100);
    if (!candles || candles.length < 30) return;

    const close = candles[candles.length - 1].close;
    await userUpdatePositions(userId, pair, close).catch(() => {});

    const freshDemo = await getUserState(userId);
    const openPos   = (freshDemo.openPositions || []).filter(p => p.pair === pair);

    const decision = await runCycle(userId, candles, {
      balance:       freshDemo.idrBalance,
      startBalance:  freshDemo.startBalance || 100000,
      targetBalance: riskCfg.targetProfitIDR || 1000000,
      openPositions: openPos,
      prices:        { [pair]: close },
    });

    // Process exits
    for (const exitDec of (decision.exits || [])) {
      if (exitDec.isPartial) {
        const pos      = exitDec.position;
        const halfIdr  = Math.floor(pos.idrAmount * 0.5);
        const halfCrypto = pos.cryptoAmount ? pos.cryptoAmount * 0.5 : null;
        const st       = await getUserState(userId);
        const trade    = { id: pos.id + '_partial_' + Date.now(), pair, openTime: pos.openTime,
          exitTime: Date.now(), entryPrice: pos.entryPrice, exitPrice: close,
          idrAmount: halfIdr, cryptoAmount: halfCrypto, pnl: exitDec.pnl || 0,
          pnlPct: halfIdr > 0 ? ((exitDec.pnl || 0) / halfIdr) * 100 : 0,
          exitReason: 'partial_tp1', side: 'buy', isPartial: true,
          duration: Date.now() - (pos.openTime || Date.now()) };
        st.closedTrades = [trade, ...(st.closedTrades || [])].slice(0, 200);
        st.idrBalance  += halfIdr + (exitDec.pnl || 0);
        st.totalPnl    += exitDec.pnl || 0;
        st.tradeCount   = (st.tradeCount || 0) + 1;
        st.totalPnlPct  = st.startBalance > 0 ? (st.totalPnl / st.startBalance) * 100 : 0;
        const idx = st.openPositions.findIndex(p => p.id === pos.id);
        if (idx !== -1) st.openPositions[idx] = { ...st.openPositions[idx], idrAmount: halfIdr, cryptoAmount: halfCrypto, tp1Triggered: true, trailingStop: close * 0.995 };
        await saveUserState(userId, st);
        recordTradeResult(userId, exitDec.pnl || 0, pair);
        continue;
      }
      if (exitDec.isBreakeven) {
        const st  = await getUserState(userId);
        const idx = st.openPositions.findIndex(p => p.id === exitDec.position.id);
        if (idx !== -1) st.openPositions[idx] = { ...st.openPositions[idx], stopLoss: exitDec.newStopLoss, breakevenSet: true };
        await saveUserState(userId, st);
        continue;
      }
      if (exitDec.position) {
        const result = await userDemoSell(userId, exitDec.position.id, close, exitDec.reason);
        if (result.success) recordTradeResult(userId, result.pnl, pair);
      }
    }

    // Process entry
    if (decision.entry) {
      const e = decision.entry;
      await userDemoBuy(userId, pair, close, e.idrAmount, {
        stopLoss: e.stopLoss, takeProfit: e.takeProfit, trailingStop: e.trailingStop,
      });
    }

    cs.lastCycleTime = new Date().toISOString();
    cs.lastError     = null;
    cs.cycleCount++;

  } catch (err) {
    cs.lastError = err.message;
    console.error('[AutoCycle][' + userId + ']', err.message);
  }
}

function startUserCycle(userId, cfg = {}) {
  const cs = getCycleState(userId);
  if (cs.timer) clearInterval(cs.timer);
  cs.config  = { ...cs.config, ...cfg };
  cs.running = true;
  cs.timer   = setInterval(() => runUserCycle(userId), 10_000);
  runUserCycle(userId);
}

function stopUserCycle(userId) {
  const cs = getCycleState(userId);
  if (cs.timer) { clearInterval(cs.timer); cs.timer = null; }
  cs.running = false;
}

export async function GET(req) {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const cs = getCycleState(userId);
  return NextResponse.json({ success: true, autoCycleRunning: cs.running, autoCycleConfig: cs.config, lastCycleTime: cs.lastCycleTime, cycleCount: cs.cycleCount });
}

export async function POST(req) {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const { action, config } = await req.json().catch(() => ({}));
  const cs = getCycleState(userId);

  switch (action) {
    case 'start':
      startUserCycle(userId, config || {});
      return NextResponse.json({ success: true, autoCycleRunning: true });
    case 'stop':
      stopUserCycle(userId);
      return NextResponse.json({ success: true, autoCycleRunning: false });
    case 'update-config':
      cs.config = { ...cs.config, ...(config || {}) };
      if (cs.running) startUserCycle(userId, cs.config);
      return NextResponse.json({ success: true, autoCycleConfig: cs.config });
    default:
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  }
}
