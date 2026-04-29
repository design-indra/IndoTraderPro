/**
 * lib/userState.js — Per-User Crypto Trading State (Supabase)
 * Menggantikan demoStore.js yang global menjadi per-user via Supabase
 */
import { supabase } from './supabase.js';

const DEFAULT_BALANCE = parseInt(process.env.DEMO_BALANCE || '100000');

function buildDefault(userId) {
  return {
    userId,
    idrBalance:        DEFAULT_BALANCE,
    startBalance:      DEFAULT_BALANCE,
    cryptoBalances:    {},
    openPositions:     [],
    closedTrades:      [],
    totalPnl:          0,
    totalPnlPct:       0,
    consecutiveLosses: 0,
    consecutiveWins:   0,
    tradeCount:        0,
    startTime:         Date.now(),
    lastUpdate:        Date.now(),
  };
}

// ── Load state user dari Supabase ─────────────────────────────────────────────
export async function getUserState(userId) {
  const { data, error } = await supabase
    .from('user_states')
    .select('state')
    .eq('user_id', userId)
    .single();

  if (error || !data) return buildDefault(userId);
  return { ...buildDefault(userId), ...data.state, userId };
}

// ── Save state user ke Supabase ───────────────────────────────────────────────
export async function saveUserState(userId, state) {
  const payload = { ...state, lastUpdate: Date.now() };
  const { error } = await supabase
    .from('user_states')
    .upsert({ user_id: userId, state: payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error('saveUserState: ' + error.message);
  return payload;
}

// ── Reset state user ──────────────────────────────────────────────────────────
export async function resetUserState(userId, balance = DEFAULT_BALANCE) {
  const fresh = buildDefault(userId);
  fresh.idrBalance   = balance;
  fresh.startBalance = balance;
  await saveUserState(userId, fresh);
  return fresh;
}

// ── Buy (open position) ───────────────────────────────────────────────────────
export async function userDemoBuy(userId, pair, currentPrice, idrAmount, riskParams = {}) {
  const state = await getUserState(userId);
  if (state.idrBalance < idrAmount) throw new Error('Saldo IDR tidak cukup');

  const coin         = pair.split('_')[0];
  const fee          = 0.003;
  const effectiveAmt = idrAmount * (1 - fee);
  const cryptoAmt    = effectiveAmt / currentPrice;

  state.idrBalance -= idrAmount;
  state.cryptoBalances       = state.cryptoBalances || {};
  state.cryptoBalances[coin] = (state.cryptoBalances[coin] || 0) + cryptoAmt;

  const position = {
    id:           `pos_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    pair, coin, side: 'buy',
    entryPrice:   currentPrice,
    cryptoAmount: cryptoAmt,
    idrAmount,
    feeIdr:       idrAmount * fee,
    stopLoss:     riskParams.stopLoss,
    takeProfit:   riskParams.takeProfit,
    trailingStop: riskParams.trailingStop,
    highestPrice: currentPrice,
    lowestPrice:  currentPrice,
    openTime:     Date.now(),
    tp1Triggered: false,
    breakevenSet: false,
    status:       'open',
  };

  state.openPositions = [...(state.openPositions || []), position];
  await saveUserState(userId, state);
  return { success: true, position, state };
}

// ── Sell (close position) ─────────────────────────────────────────────────────
export async function userDemoSell(userId, positionId, currentPrice, exitReason = 'signal') {
  const state  = await getUserState(userId);
  const posIdx = (state.openPositions || []).findIndex(p => p.id === positionId);
  if (posIdx === -1) throw new Error(`Posisi ${positionId} tidak ditemukan`);

  const pos      = state.openPositions[posIdx];
  const fee      = 0.003;
  const grossIdr = pos.cryptoAmount * currentPrice;
  const netIdr   = grossIdr * (1 - fee);
  const pnl      = netIdr - pos.idrAmount;
  const pnlPct   = (pnl / pos.idrAmount) * 100;
  const pnlPips  = pnlPct; // Untuk crypto, pips = pct

  state.idrBalance += netIdr;
  state.cryptoBalances       = state.cryptoBalances || {};
  state.cryptoBalances[pos.coin] = Math.max(0, (state.cryptoBalances[pos.coin] || 0) - pos.cryptoAmount);

  const closedTrade = {
    ...pos,
    exitPrice:   currentPrice,
    exitTime:    Date.now(),
    exitReason,
    grossIdr, netIdr,
    fee:         grossIdr * fee,
    pnl, pnlPct, pnlPips,
    status:      'closed',
    duration:    Date.now() - (pos.openTime || Date.now()),
  };

  state.openPositions  = state.openPositions.filter(p => p.id !== positionId);
  state.closedTrades   = [closedTrade, ...(state.closedTrades || [])].slice(0, 200);
  state.totalPnl      += pnl;
  state.tradeCount     = (state.tradeCount || 0) + 1;

  if (pnl > 0) { state.consecutiveLosses = 0; state.consecutiveWins   = (state.consecutiveWins || 0) + 1; }
  else         { state.consecutiveWins   = 0; state.consecutiveLosses = (state.consecutiveLosses || 0) + 1; }

  state.totalPnlPct = state.startBalance > 0
    ? (state.totalPnl / state.startBalance) * 100 : 0;

  await saveUserState(userId, state);
  return { success: true, trade: closedTrade, pnl, pnlPips, state };
}

// ── Update unrealized PnL posisi terbuka ──────────────────────────────────────
export async function userUpdatePositions(userId, pair, currentPrice) {
  const state = await getUserState(userId);
  let changed = false;

  state.openPositions = (state.openPositions || []).map(pos => {
    if (pos.pair !== pair) return pos;
    changed = true;
    const highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    const lowestPrice  = Math.min(pos.lowestPrice  || pos.entryPrice, currentPrice);
    let trailingStop   = pos.trailingStop;
    if (trailingStop !== undefined) {
      const trailPct = 0.005;
      trailingStop   = Math.max(trailingStop, highestPrice * (1 - trailPct));
    }
    const unrealizedPnl    = (currentPrice - pos.entryPrice) * pos.cryptoAmount;
    const unrealizedPnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    return { ...pos, currentPrice, highestPrice, lowestPrice, trailingStop, unrealizedPnl, unrealizedPnlPct };
  });

  if (changed) await saveUserState(userId, state);
  return state.openPositions;
}
