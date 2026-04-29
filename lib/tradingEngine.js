/**
 * lib/tradingEngine.js — Advanced Trading Engine v4 (Per-User Multi-Tenant)
 *
 * PERUBAHAN dari versi global:
 * - botState → Map<userId, state> (per-user)
 * - Semua fungsi menerima userId sebagai parameter pertama
 * - addLog(userId, msg, type)
 * - startBot(userId, cfg), stopBot(userId), dll
 * - runCycle(userId, candles, currentState) → tidak ada lagi global state
 */

import {
  getLatestRSI, getLatestEMA, calculateMACD,
  calculateBollingerBands, detectVolumeSpike, detectMarketTrend,
  computeSignalScore, extractFeatures, calculateATR,
  detectCandlePattern, isGoodTradingSession, calculateAdaptiveTPSL,
  getHigherTFBias, getEquityMode, isPairBlacklisted, reportPairLoss,
  resetPairLoss, getBlacklistedPairs,
  calculateStochRSI, detectSupportResistance, calculateFibonacci,
  calculateMomentumScore, detectDivergence, calculateVWAP,
  calculateTrendStrength,
} from './indicators.js';

import {
  calculatePositionSize, canOpenPosition,
  getStopLossPrice, getTakeProfitPrice, checkPositionExit,
  checkSignalReversal, updateTrailingStop, getRiskSettings,
  getActiveProfitMode,
} from './riskManager.js';

import { getMLSignal, addTrainingSample, getTrainingDataStats } from './mlModel.js';
import { getRLSignal, remember, computeReward, trainStep, buildState, getRLStats } from './rlEngine.js';

// ─── Per-User Bot State ───────────────────────────────────────────────────────
const userBotStates  = new Map();
const stateLastSeen  = new Map();
const MAX_STATES     = 200;

function makeDefaultState() {
  return {
    running: false, mode: 'demo', level: 1, pair: 'btc_idr',
    consecutiveLosses: 0, consecutiveWins: 0, totalPnl: 0,
    isPaused: false, pauseReason: null,
    cooldownUntil: 0, lastSignal: null, lastActionTime: 0,
    featureHistory: [], prevRLState: null, prevAction: null,
    sessionSkipLogged: false,
    logs: [],
    stats: { totalTrades:0, wins:0, losses:0, winRate:0, avgPnl:0, bestTrade:0, worstTrade:0 },
  };
}

function getState(userId) {
  if (!userBotStates.has(userId)) userBotStates.set(userId, makeDefaultState());
  stateLastSeen.set(userId, Date.now());
  // GC: hapus state lama jika terlalu banyak
  if (userBotStates.size > MAX_STATES) {
    let oldest = null, oldestT = Infinity;
    for (const [uid, t] of stateLastSeen) {
      if (t < oldestT && uid !== userId) { oldest = uid; oldestT = t; }
    }
    if (oldest) { userBotStates.delete(oldest); stateLastSeen.delete(oldest); }
  }
  return userBotStates.get(userId);
}

export const getBotState = (userId) => getState(userId);
export const getLogs     = (userId, n = 50) => getState(userId).logs.slice(0, n);

export function startBot(userId, cfg = {}) {
  const s = getState(userId);
  s.running   = true;  s.isPaused  = false;
  s.mode      = cfg.mode  || 'demo';
  s.level     = cfg.level || 1;
  s.pair      = cfg.pair  || 'btc_idr';
  s.cooldownUntil  = 0;
  s.lastActionTime = 0;
  s.sessionSkipLogged = false;
  addLog(userId, `🚀 IndoTrader Pro v4 — L${s.level} ${s.mode.toUpperCase()} | ${s.pair.toUpperCase()}`, 'system');
}

export function stopBot(userId) {
  const s = getState(userId);
  s.running = false;
  addLog(userId, '🛑 Bot stopped', 'system');
}

export function resumeBot(userId) {
  const s = getState(userId);
  s.isPaused = false; s.pauseReason = null; s.consecutiveLosses = 0;
  s.sessionSkipLogged = false;
  addLog(userId, '▶️ Bot resumed', 'system');
}

export function resetBotState(userId) {
  const savedLogs = getState(userId).logs.slice(0, 5);
  const fresh     = makeDefaultState();
  fresh.logs      = savedLogs;
  userBotStates.set(userId, fresh);
}

function addLog(userId, msg, type = 'info') {
  const s = getState(userId);
  const entry = { id: Date.now() + Math.random(), time: new Date().toISOString(), message: msg, type };
  s.logs.unshift(entry);
  if (s.logs.length > 300) s.logs = s.logs.slice(0, 300);
  return entry;
}

// ─── Advanced Context (sama dengan Indotrader asli) ───────────────────────────
function getAdvancedContext(candles) {
  const closes = candles.map(c => c.close);
  const close  = closes[closes.length - 1];
  const sr          = detectSupportResistance(candles, 20, 0.004);
  const fib         = calculateFibonacci(candles, Math.min(50, candles.length - 1));
  const momentum    = calculateMomentumScore(candles);
  const divergence  = detectDivergence(candles);
  const vwap        = calculateVWAP(candles);
  const trendStrength = calculateTrendStrength(candles);
  const isBuyingLow = (
    (sr.nearSupport || sr.distanceToSupport < 1.5) &&
    (!sr.nearResistance) &&
    (vwap ? vwap.belowVWAP : true) &&
    (fib ? fib.position < 0.5 : true)
  );
  const goodRiskReward = sr.srRatio >= 1.5 || sr.distanceToResistance > sr.distanceToSupport * 2;
  return { sr, fib, momentum, divergence, vwap, trendStrength, isBuyingLow, goodRiskReward, close };
}

// ─── Level Signals (identik dengan Indotrader asli) ──────────────────────────
function level1Signal(candles) {
  const closes  = candles.map(c=>c.close);
  const volumes = candles.map(c=>c.volume);
  const close   = closes[closes.length-1];
  const rsi7    = getLatestRSI(closes, 7);
  const rsi14   = getLatestRSI(closes, 14);
  const ema5    = getLatestEMA(closes, 5);
  const ema9    = getLatestEMA(closes, 9);
  const ema21   = getLatestEMA(closes, 21);
  const stochRSI = calculateStochRSI(closes);
  const ribbonBull = ema5>ema9 && ema9>ema21 && close>ema9;
  const ribbonBear = ema5<ema9 && ema9<ema21 && close<ema9;
  const avgVol   = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const volRatio = avgVol>0 ? volumes[volumes.length-1]/avgVol : 1;
  const htfBias  = getHigherTFBias(candles);
  const candle   = detectCandlePattern(candles);
  const ctx      = getAdvancedContext(candles);
  let action='HOLD', score=50;
  const reasons=[];
  if (rsi7 < 28 && ribbonBull && htfBias.bias !== 'bearish' && ctx.isBuyingLow) { action='BUY'; score=88; reasons.push(`RSI7 ${rsi7?.toFixed(0)} oversold + ribbon + support`); }
  else if (stochRSI !== null && stochRSI < 15 && ema9 > ema21 && ctx.goodRiskReward) { action='BUY'; score=85; reasons.push(`StochRSI ${stochRSI} extreme oversold`); }
  else if (ctx.divergence.bullish && htfBias.bias !== 'bearish') { action='BUY'; score=82; reasons.push(`Bullish divergence`); }
  else if (ctx.fib && ctx.fib.inGoldenZone && candle.direction === 'bullish' && htfBias.bias !== 'bearish') { action='BUY'; score=80; reasons.push(`Fib golden zone + ${candle.pattern}`); }
  else if (rsi14 < 35 && ema9 > ema21 && htfBias.bias !== 'bearish' && candle.direction === 'bullish') { action='BUY'; score=75; reasons.push(`RSI14 oversold + ${candle.pattern}`); }
  else if (candle.pattern === 'morning_star' && htfBias.bias !== 'bearish' && ctx.isBuyingLow) { action='BUY'; score=83; reasons.push(`Morning star + support`); }
  else if (candle.pattern === 'bullish_engulfing' && ema9 > ema21 && htfBias.bias === 'bullish') { action='BUY'; score=80; reasons.push(`Bullish engulfing + HTF bullish`); }
  if (rsi7 > 72 && ribbonBear && htfBias.bias !== 'bullish') { action='SELL'; score=15; reasons.push(`RSI7 overbought + ribbon bear`); }
  else if (candle.pattern === 'bearish_engulfing' && htfBias.bias === 'bearish') { action='SELL'; score=20; reasons.push(`Bearish engulfing + HTF bearish`); }
  else if (candle.pattern === 'shooting_star' && rsi7 > 55) { action='SELL'; score=22; reasons.push(`Shooting star overbought`); }
  return { action, score, reasons, rsi7, rsi14, ema9, ema21, stochRSI, volRatio, htfBias, candle, ctx };
}

function level2Signal(candles) {
  const closes = candles.map(c=>c.close);
  const close  = closes[closes.length-1];
  const rsi14  = getLatestRSI(closes, 14);
  const ema9   = getLatestEMA(closes, 9);
  const ema21  = getLatestEMA(closes, 21);
  const ema50  = getLatestEMA(closes, 50);
  const macd   = calculateMACD(closes);
  const bb     = calculateBollingerBands(closes);
  const trend  = detectMarketTrend(closes);
  const htfBias = getHigherTFBias(candles);
  const ctx    = getAdvancedContext(candles);
  let action='HOLD', score=50, confidence=0;
  const reasons=[];
  const bullishPoints = [
    rsi14 !== null && rsi14 < 40,
    ema9 > ema21 && ema21 > ema50,
    macd.latest && macd.latest.histogram > 0,
    bb.latest && close < bb.latest.lower * 1.01,
    trend.direction === 'up',
    htfBias.bias === 'bullish',
    ctx.isBuyingLow,
    ctx.divergence.bullish,
  ].filter(Boolean).length;
  confidence = (bullishPoints / 8) * 100;
  if (bullishPoints >= 5 && ctx.isBuyingLow) { action='BUY'; score=70+bullishPoints*3; reasons.push(`${bullishPoints}/8 bull signals + beli murah`); }
  else if (bullishPoints >= 4 && htfBias.bias === 'bullish') { action='BUY'; score=65+bullishPoints*3; reasons.push(`${bullishPoints}/8 bull signals + HTF bullish`); }
  const bearishPoints = [
    rsi14 !== null && rsi14 > 65,
    ema9 < ema21,
    macd.latest && macd.latest.histogram < 0,
    bb.latest && close > bb.latest.upper * 0.99,
    trend.direction === 'down',
  ].filter(Boolean).length;
  if (bearishPoints >= 3) { action='SELL'; score=30-bearishPoints*5; reasons.push(`${bearishPoints}/5 bear signals`); }
  return { action, score, confidence, bullishPoints, reasons, rsi14, ema9, ema21, trend, htfBias, ctx };
}

function level3Signal(candles) {
  const closes  = candles.map(c=>c.close);
  const volumes = candles.map(c=>c.volume);
  const close   = closes[closes.length-1];
  const signalData = computeSignalScore(candles);
  const ctx        = getAdvancedContext(candles);
  const htfBias    = getHigherTFBias(candles);
  const volSpike   = detectVolumeSpike(volumes);
  let { score=50, action='HOLD', reasons=[] } = signalData;
  if (ctx.momentum.score > 60 && score > 60) { score = Math.min(95, score + 10); reasons.push(`Momentum kuat (${ctx.momentum.score.toFixed(0)})`); }
  if (ctx.isBuyingLow && action === 'BUY') { score = Math.min(95, score + 8); reasons.push('Beli di zona murah (S/R)'); }
  if (ctx.trendStrength && ctx.trendStrength.adx > 25) { score = Math.min(95, score + 5); reasons.push(`Trend kuat ADX ${ctx.trendStrength.adx.toFixed(0)}`); }
  if (volSpike && action === 'BUY') { score = Math.min(95, score + 5); reasons.push('Volume spike konfirmasi'); }
  if (htfBias.bias === 'bullish' && action === 'BUY') { score = Math.min(95, score + 5); reasons.push('HTF bullish'); }
  if (htfBias.bias === 'bearish' && action === 'BUY') { score = Math.max(40, score - 15); reasons.push('⚠️ HTF bearish (kurangi risk)'); }
  if (ctx.divergence.bullish && action === 'BUY') { score = Math.min(95, score + 10); reasons.push('Bullish divergence'); }
  let grade = 'D';
  if (score >= 85) grade = 'A+';
  else if (score >= 75) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 55) grade = 'C';
  return { action: score >= 60 ? action : (score <= 35 ? 'SELL' : 'HOLD'), score, grade, reasons, htfBias, ctx, volSpike };
}

async function level4Signal(candles) {
  const closes = candles.map(c => c.close);
  const features = extractFeatures(candles);
  const mlResult  = await getMLSignal(features).catch(() => null);
  const ctx        = getAdvancedContext(candles);
  const htfBias    = getHigherTFBias(candles);
  const l3         = level3Signal(candles);
  let action = 'HOLD', score = 50;
  const reasons = [];
  if (mlResult) {
    if (mlResult.signal === 'BUY' && mlResult.confidence > 0.6 && ctx.isBuyingLow) {
      action = 'BUY'; score = 60 + mlResult.confidence * 35;
      reasons.push(`ML BUY (conf: ${(mlResult.confidence*100).toFixed(0)}%) + beli murah`);
    } else if (mlResult.signal === 'SELL' && mlResult.confidence > 0.6) {
      action = 'SELL'; score = 40 - mlResult.confidence * 20;
      reasons.push(`ML SELL (conf: ${(mlResult.confidence*100).toFixed(0)}%)`);
    }
  }
  if (l3.action === action && action !== 'HOLD') { score = Math.min(95, score + 8); reasons.push('L3 konfirmasi'); }
  if (ctx.divergence.bullish && action === 'BUY') { score = Math.min(95, score + 5); reasons.push('Bullish divergence'); }
  if (htfBias.bias === 'bearish' && action === 'BUY') { score = Math.max(40, score - 15); }
  return { action, score, mlResult, reasons, ctx, htfBias };
}

async function level5Signal(candles, openPositions = []) {
  const closes   = candles.map(c => c.close);
  const features = extractFeatures(candles);
  const rlState  = buildState(candles, openPositions);
  const rlResult = await getRLSignal(rlState, openPositions.length).catch(() => null);
  const ctx      = getAdvancedContext(candles);
  const htfBias  = getHigherTFBias(candles);
  let action = 'HOLD', score = 50;
  const reasons = [];
  if (rlResult) {
    if (rlResult.action === 'BUY' && rlResult.qValue > 0 && ctx.isBuyingLow) {
      action = 'BUY'; score = 60 + Math.min(35, rlResult.qValue * 10);
      reasons.push(`RL BUY (Q: ${rlResult.qValue.toFixed(2)}) + beli murah`);
    } else if (rlResult.action === 'SELL' && rlResult.qValue < 0) {
      action = 'SELL'; score = 40 + rlResult.qValue * 5;
      reasons.push(`RL SELL (Q: ${rlResult.qValue.toFixed(2)})`);
    }
  }
  if (ctx.divergence.bullish && action === 'BUY') { score = Math.min(95, score + 8); reasons.push('Bullish divergence'); }
  if (htfBias.bias === 'bearish' && action === 'BUY') { score = Math.max(40, score - 15); }
  return { action, score, rlResult, reasons, ctx, htfBias };
}

// ─── Run Cycle (per user) ─────────────────────────────────────────────────────
export async function runCycle(userId, candles, currentState = {}) {
  const s = getState(userId);
  if (!s.running) return { action: 'HOLD', reason: 'bot_stopped' };

  const { balance = 100000, openPositions = [], prices = {}, startBalance, targetBalance } = currentState;
  const riskCfg = getRiskSettings();

  // ── 1. Session Filter ──────────────────────────────────────────────────────
  const session = isGoodTradingSession();
  if (!session.isGood && openPositions.length === 0) {
    if (!s.sessionSkipLogged) {
      addLog(userId, `🕐 Jam ${session.wibH?.toString().padStart(2,'0')||'--'}:${session.wibMin?.toString().padStart(2,'0')||'--'} WIB — sesi sepi, standby`, 'info');
      s.sessionSkipLogged = true;
    }
    return { action: 'HOLD', reason: 'off_session', session };
  }
  if (session.isGood) s.sessionSkipLogged = false;

  // ── 2. Pair Blacklist ──────────────────────────────────────────────────────
  const pair = s.pair;
  if (isPairBlacklisted(pair) && openPositions.length === 0) {
    const bl = getBlacklistedPairs().find(b => b.pair === pair);
    const minsLeft = bl ? Math.ceil(bl.remainingMs / 60000) : 0;
    addLog(userId, `🚫 ${pair.toUpperCase()} blacklist ${minsLeft}m`, 'warning');
    return { action: 'HOLD', reason: 'pair_blacklisted', pair };
  }

  // ── 3. Auto-pause ──────────────────────────────────────────────────────────
  if (s.consecutiveLosses >= riskCfg.maxConsecutiveLosses) {
    if (!s.isPaused) {
      s.isPaused = true; s.pauseReason = 'consecutive_losses';
      addLog(userId, `⚠️ Auto-pause: ${riskCfg.maxConsecutiveLosses} losses berturut`, 'warning');
    }
    return { action: 'HOLD', reason: 'auto_paused' };
  }

  if (candles.length < 30) return { action: 'HOLD', reason: 'insufficient_data' };

  const close = candles[candles.length - 1].close;
  const atr   = calculateATR(candles) || close * 0.01;

  // ── 4. Equity Mode ─────────────────────────────────────────────────────────
  const equityMode = getEquityMode(balance, startBalance || 100000, targetBalance || riskCfg.targetProfitIDR || 1000000);

  // ── 5. Get signal ──────────────────────────────────────────────────────────
  let signal;
  try {
    switch (s.level) {
      case 1: signal = level1Signal(candles); break;
      case 2: signal = level2Signal(candles); break;
      case 3: signal = level3Signal(candles); break;
      case 4: signal = await level4Signal(candles); break;
      case 5: signal = await level5Signal(candles, openPositions); break;
      default: signal = level1Signal(candles);
    }
  } catch (err) {
    addLog(userId, `❌ Signal error: ${err.message}`, 'error');
    signal = { action: 'HOLD' };
  }

  s.lastSignal = { ...signal, close, time: Date.now(), session, equityMode };

  // ── 6. Check exits ─────────────────────────────────────────────────────────
  const exitDecisions = [];
  for (const pos of openPositions) {
    if (pos.pair !== pair) continue;
    const exitCheck = checkPositionExit(pos, close, signal, candles);
    if (exitCheck.shouldExit) exitDecisions.push({ ...exitCheck, position: pos });
  }

  // ── 7. Entry logic ─────────────────────────────────────────────────────────
  let entryDecision = null;
  const { allowed } = canOpenPosition(openPositions.length, s.consecutiveLosses, s.isPaused);

  if (allowed && signal.action === 'BUY') {
    const cooldownMs = (riskCfg.cooldownSeconds || 15) * 1000;
    if (Date.now() - s.lastActionTime >= cooldownMs) {
      const sizing = calculatePositionSize(balance, openPositions.length, {
        consecutiveLosses: s.consecutiveLosses,
        totalPnl:          s.totalPnl,
        consecutiveWins:   s.consecutiveWins,
      }, signal.grade || 'C');

      if (sizing.idrAmount >= (riskCfg.minTradeIDR || 1000)) {
        const slPrice = getStopLossPrice(close, 'buy', atr, riskCfg);
        const tpPrice = getTakeProfitPrice(close, 'buy', atr, riskCfg);
        const rr      = (tpPrice - close) / (close - slPrice);

        if (rr >= 1.0) {
          s.lastActionTime = Date.now();
          addLog(userId,
            `📈 BUY ${pair.replace('_idr','').toUpperCase()} @ ${close.toLocaleString('id-ID')} | ` +
            `Rp${sizing.idrAmount.toLocaleString('id-ID')} | SL:${slPrice.toLocaleString('id-ID')} | TP:${tpPrice.toLocaleString('id-ID')} | ` +
            `Score:${signal.score?.toFixed(0)} | R:R ${rr.toFixed(1)}`,
            'buy'
          );
          entryDecision = {
            action: 'BUY', price: close, idrAmount: sizing.idrAmount,
            stopLoss: slPrice, takeProfit: tpPrice,
            trailingStop: close * (1 - (riskCfg.trailingStopPercent || 0.5) / 100),
            openTime: Date.now(), signal,
          };
        }
      }
    }
  }

  return {
    action:   entryDecision ? 'BUY' : (exitDecisions.length ? 'SELL' : 'HOLD'),
    entry:    entryDecision,
    exits:    exitDecisions,
    signal,
    close,
    level:    s.level,
    mode:     s.mode,
    pair,
  };
}

// ─── Record Trade Result ───────────────────────────────────────────────────────
export function recordTradeResult(userId, pnl, pair = '') {
  const s = getState(userId);
  s.totalPnl += pnl;
  s.stats.totalTrades++;
  if (pnl > 0) {
    s.stats.wins++;
    s.consecutiveLosses = 0; s.consecutiveWins++;
    s.stats.bestTrade = Math.max(s.stats.bestTrade, pnl);
    if (pair) resetPairLoss(pair);
  } else {
    s.stats.losses++;
    s.consecutiveWins = 0; s.consecutiveLosses++;
    s.stats.worstTrade = Math.min(s.stats.worstTrade, pnl);
    if (pair) {
      const bl = reportPairLoss(pair);
      if (bl) addLog(userId, `🚫 ${pair.toUpperCase()} blacklist 1 jam (2x loss)`, 'warning');
    }
    if (s.consecutiveLosses >= 3) addLog(userId, '⚠️ 3 losses berturut — auto-pause aktif', 'warning');
  }
  s.stats.winRate = (s.stats.wins / s.stats.totalTrades) * 100;
  const n = s.stats.totalTrades;
  s.stats.avgPnl = parseFloat(((s.stats.avgPnl * (n - 1) + pnl) / n).toFixed(0));
}
