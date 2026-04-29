/**
 * app/api/bot/route.js — IndoTrader Pro Bot Controller (Per-User)
 * v3.0 — Multi-tenant: setiap user punya bot, saldo, dan trade masing-masing
 */
import { NextResponse } from 'next/server';
import {
  getBotState, startBot, stopBot, resetBotState,
  resumeBot, getLogs, runCycle, recordTradeResult,
} from '../../../lib/tradingEngine.js';
import { getOHLCV, trade as indodaxTrade, openOrders } from '../../../lib/indodax.js';
import { verifyToken } from '../../../lib/auth.js';
import {
  getUserState, saveUserState, resetUserState,
  userDemoBuy, userDemoSell, userUpdatePositions,
} from '../../../lib/userState.js';
import { getRiskSettings } from '../../../lib/riskManager.js';
import { getBestPair }     from '../../../lib/autoScanner.js';

function extractUserId(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  const dec   = verifyToken(token);
  return dec?.id || null;
}

function buildDefaultDemo(userId) {
  return {
    userId, idrBalance: 100000, startBalance: 100000,
    cryptoBalances: {}, openPositions: [], closedTrades: [],
    totalPnl: 0, totalPnlPct: 0, consecutiveLosses: 0,
    consecutiveWins: 0, tradeCount: 0,
  };
}

// ── Per-user scan cache ────────────────────────────────────────────────────────
const userScanCache = new Map();

// ── GET: load state per user ───────────────────────────────────────────────────
export async function GET(req) {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const state = getBotState(userId);
  const logs  = getLogs(userId, 50);
  const sc    = userScanCache.get(userId) || null;

  let demo = buildDefaultDemo(userId);
  try { demo = await getUserState(userId); } catch (e) { console.error('[GET userState]', e.message); }

  return NextResponse.json({
    success: true,
    bot: {
      running: state.running, mode: state.mode, level: state.level, pair: state.pair,
      isPaused: state.isPaused, pauseReason: state.pauseReason,
      consecutiveLosses: state.consecutiveLosses, consecutiveWins: state.consecutiveWins,
      totalPnl: state.totalPnl, lastSignal: state.lastSignal, stats: state.stats,
    },
    demo: {
      idrBalance: demo.idrBalance, startBalance: demo.startBalance,
      cryptoBalances: demo.cryptoBalances || {},
      totalPnl: demo.totalPnl, totalPnlPct: demo.totalPnlPct,
      openPositions: demo.openPositions || [],
      closedTrades: (demo.closedTrades || []).slice(0, 50),
      tradeCount: demo.tradeCount, consecutiveLosses: demo.consecutiveLosses,
    },
    scanResult: sc,
    logs,
  });
}

// ── POST: semua action terikat ke userId ───────────────────────────────────────
export async function POST(req) {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, config, clientState } = body;

  // Load per-user state
  let demo = null;
  try { demo = await getUserState(userId); } catch (e) { console.error('[userState load]', e.message); }
  if (!demo && clientState) {
    demo = {
      userId: null,
      idrBalance:        clientState.idrBalance        ?? 100000,
      startBalance:      clientState.startBalance      ?? 100000,
      cryptoBalances:    clientState.cryptoBalances    ?? {},
      openPositions:     clientState.openPositions     ?? [],
      closedTrades:      clientState.closedTrades      ?? [],
      totalPnl:          clientState.totalPnl          ?? 0,
      totalPnlPct:       clientState.totalPnlPct       ?? 0,
      consecutiveLosses: clientState.consecutiveLosses ?? 0,
      consecutiveWins:   clientState.consecutiveWins   ?? 0,
      tradeCount:        clientState.tradeCount        ?? 0,
    };
  }
  if (!demo) demo = buildDefaultDemo(userId);

  try {
    switch (action) {

      case 'start': {
        if (config?.mode === 'live' && !config.confirmed)
          return NextResponse.json({ success: false, requireConfirmation: true });
        startBot(userId, config || {});
        return NextResponse.json({ success: true, message: 'Bot started', state: getBotState(userId) });
      }

      case 'sync':
        return NextResponse.json({ success: true, bot: getBotState(userId), demo, logs: getLogs(userId, 50) });

      case 'stop':
        stopBot(userId);
        return NextResponse.json({ success: true });

      case 'resume':
        resumeBot(userId);
        return NextResponse.json({ success: true });

      case 'reset': {
        resetBotState(userId);
        const amount = config?.balance || 100000;
        userScanCache.delete(userId);
        let fresh = buildDefaultDemo(userId);
        fresh.idrBalance = amount; fresh.startBalance = amount;
        try { fresh = await resetUserState(userId, amount); } catch (e) { console.error('[resetUserState]', e.message); }
        return NextResponse.json({ success: true, demo: fresh });
      }

      case 'deleteTrade': {
        const tradeId = config?.tradeId;
        if (tradeId) {
          demo.closedTrades = (demo.closedTrades || []).filter(t => t.id !== tradeId);
          demo.totalPnl     = demo.closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
          demo.tradeCount   = demo.closedTrades.length;
          demo.totalPnlPct  = demo.startBalance > 0 ? (demo.totalPnl / demo.startBalance) * 100 : 0;
          await saveUserState(userId, demo);
        }
        return NextResponse.json({ success: true, demo });
      }

      case 'clearHistory': {
        demo.closedTrades      = [];
        demo.totalPnl          = 0; demo.totalPnlPct   = 0;
        demo.tradeCount        = 0; demo.consecutiveWins = 0;
        demo.consecutiveLosses = 0;
        await saveUserState(userId, demo);
        return NextResponse.json({ success: true, demo });
      }

      case 'cycle': {
        const state = getBotState(userId);
        if (!state.running) return NextResponse.json({ success: false, error: 'Bot not running' });

        const pair = config?.pair || state.pair || 'btc_idr';
        const tf   = config?.tf   || '5m';
        const riskCfg = getRiskSettings();

        // Auto scanner
        let activePair = pair;
        if (config?.autoScanner && (demo.openPositions || []).length === 0) {
          const best = await getBestPair(pair).catch(() => null);
          if (best?.pair) activePair = best.pair;
        }
        if ((demo.openPositions || []).length > 0) activePair = demo.openPositions[0].pair;

        const candles = await getOHLCV(activePair, tf, 100);
        if (!candles || candles.length < 30)
          return NextResponse.json({ success: false, error: 'Insufficient candle data' });

        const close = candles[candles.length - 1].close;

        // Update unrealized PnL
        try { demo.openPositions = await userUpdatePositions(userId, activePair, close); } catch {}

        // Reload fresh state sebelum runCycle
        let freshDemo = demo;
        try { freshDemo = await getUserState(userId); } catch {}

        const openPos = (freshDemo.openPositions || []).filter(p => p.pair === activePair);

        const decision = await runCycle(userId, candles, {
          balance:       freshDemo.idrBalance,
          startBalance:  freshDemo.startBalance || 100000,
          targetBalance: riskCfg.targetProfitIDR || 1000000,
          openPositions: openPos,
          prices:        { [activePair]: close },
        });

        // Process exits
        for (const exitDec of (decision.exits || [])) {
          try {
            if (exitDec.isPartial) {
              const pos      = exitDec.position;
              const halfIdr  = Math.floor(pos.idrAmount * 0.5);
              const halfCrypto = pos.cryptoAmount ? pos.cryptoAmount * 0.5 : null;
              const st = await getUserState(userId);
              const trade = {
                id: pos.id + '_partial_' + Date.now(), pair: activePair,
                openTime: pos.openTime, exitTime: Date.now(),
                entryPrice: pos.entryPrice, exitPrice: close,
                idrAmount: halfIdr, cryptoAmount: halfCrypto,
                pnl: exitDec.pnl || 0,
                pnlPct: halfIdr > 0 ? ((exitDec.pnl || 0) / halfIdr) * 100 : 0,
                exitReason: 'partial_tp1', side: 'buy', isPartial: true,
                duration: Date.now() - (pos.openTime || Date.now()),
              };
              st.closedTrades  = [trade, ...(st.closedTrades || [])].slice(0, 200);
              st.idrBalance   += halfIdr + (exitDec.pnl || 0);
              st.totalPnl     += exitDec.pnl || 0;
              st.tradeCount    = (st.tradeCount || 0) + 1;
              st.totalPnlPct   = st.startBalance > 0 ? (st.totalPnl / st.startBalance) * 100 : 0;
              const idx = st.openPositions.findIndex(p => p.id === pos.id);
              if (idx !== -1) st.openPositions[idx] = { ...st.openPositions[idx], idrAmount: halfIdr, cryptoAmount: halfCrypto, tp1Triggered: true, trailingStop: close * 0.995 };
              await saveUserState(userId, st);
              demo = st;
              recordTradeResult(userId, exitDec.pnl || 0, activePair);
              continue;
            }
            if (exitDec.isBreakeven) {
              const st  = await getUserState(userId);
              const idx = st.openPositions.findIndex(p => p.id === exitDec.position.id);
              if (idx !== -1) st.openPositions[idx] = { ...st.openPositions[idx], stopLoss: exitDec.newStopLoss, breakevenSet: true };
              await saveUserState(userId, st);
              demo = st;
              continue;
            }
            if (state.mode === 'demo') {
              const result = await userDemoSell(userId, exitDec.position.id, close, exitDec.reason);
              if (result.success) { recordTradeResult(userId, result.pnl, activePair); try { demo = await getUserState(userId); } catch {} }
            } else if (state.mode === 'live') {
              const pos = exitDec.position;
              await indodaxTrade(activePair, 'sell', close, null, pos.cryptoAmount);
            }
          } catch (err) { console.error('Exit error:', err.message); }
        }

        // Process entry
        if (decision.entry) {
          try {
            if (state.mode === 'demo') {
              await userDemoBuy(userId, activePair, close, decision.entry.idrAmount, {
                stopLoss: decision.entry.stopLoss, takeProfit: decision.entry.takeProfit,
                trailingStop: decision.entry.trailingStop,
              });
              try { demo = await getUserState(userId); } catch {}
            } else if (state.mode === 'live') {
              await indodaxTrade(activePair, 'buy', close, decision.entry.idrAmount, null);
            }
          } catch (err) { decision.entryError = err.message; }
        }

        const freshState = getBotState(userId);
        return NextResponse.json({
          success: true, decision, pair: activePair, demo,
          bot: {
            running: freshState.running, mode: freshState.mode, level: freshState.level,
            pair: freshState.pair, isPaused: freshState.isPaused,
            consecutiveLosses: freshState.consecutiveLosses, consecutiveWins: freshState.consecutiveWins,
            totalPnl: freshState.totalPnl, lastSignal: freshState.lastSignal, stats: freshState.stats,
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (err) {
    console.error('Bot API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
