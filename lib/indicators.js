/**
 * lib/indicators.js — Advanced Technical Indicators v4 (UPGRADED)
 *
 * TAMBAHAN BARU v4:
 * 1. Support & Resistance detection → beli di support = beli di harga rendah
 * 2. Fibonacci Retracement levels → entry di golden zone (0.5-0.618)
 * 3. Momentum Score → skor tunggal 0-100 dari semua indikator
 * 4. Stochastic RSI → lebih sensitif dari RSI biasa
 * 5. VWAP approximation → harga di bawah VWAP = lebih murah
 * 6. Trend Strength (ADX) → hanya trade ketika trend jelas
 * 7. Divergence detection → bullish divergence = hidden buy signal terkuat
 */

// ─── RSI ──────────────────────────────────────────────────────────────────────
export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const rsi = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains/period, al = losses/period;
  rsi.push(al === 0 ? 100 : 100 - 100/(1 + ag/al));
  for (let i = period+1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    ag = (ag*(period-1) + (d>0?d:0)) / period;
    al = (al*(period-1) + (d<0?-d:0)) / period;
    rsi.push(al === 0 ? 100 : 100 - 100/(1 + ag/al));
  }
  return rsi;
}
export function getLatestRSI(closes, period = 14) {
  const r = calculateRSI(closes, period);
  return r.length > 0 ? parseFloat(r[r.length-1].toFixed(2)) : null;
}

// ─── EMA / SMA ────────────────────────────────────────────────────────────────
export function calculateEMA(values, period) {
  if (values.length < period) return [];
  const k = 2/(period+1);
  const ema = [];
  let prev = values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  ema.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i]*k + prev*(1-k);
    ema.push(prev);
  }
  return ema;
}
export function getLatestEMA(values, period) {
  const e = calculateEMA(values, period);
  return e.length > 0 ? e[e.length-1] : null;
}
export function calculateSMA(values, period) {
  if (values.length < period) return [];
  return values.map((_,i) => i < period-1 ? null : values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period).filter(v=>v!==null);
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
export function calculateMACD(closes, fast=12, slow=26, signal=9) {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const diff    = slow - fast;
  const macdLine = emaFast.slice(diff).map((v,i) => v - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signal);
  const sdiff = macdLine.length - signalLine.length;
  const histogram = signalLine.map((v,i) => macdLine[i+sdiff] - v);
  const latest = signalLine.length > 0 ? {
    macd: macdLine[macdLine.length-1],
    signal: signalLine[signalLine.length-1],
    histogram: histogram[histogram.length-1],
  } : null;
  return { macdLine, signalLine, histogram, latest };
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────────
export function calculateBollingerBands(closes, period=20, stdDev=2) {
  if (closes.length < period) return { bands: [], latest: null };
  const bands = [];
  for (let i = period-1; i < closes.length; i++) {
    const slice = closes.slice(i-period+1, i+1);
    const mean  = slice.reduce((a,b)=>a+b,0)/period;
    const std   = Math.sqrt(slice.reduce((a,b)=>a+(b-mean)**2,0)/period);
    bands.push({ upper: mean+stdDev*std, middle: mean, lower: mean-stdDev*std });
  }
  return { bands, latest: bands[bands.length-1] || null };
}

// ─── ATR ──────────────────────────────────────────────────────────────────────
export function calculateATR(candles, period=14) {
  if (candles.length < period+1) return null;
  const trs = candles.slice(1).map((c,i) => Math.max(
    c.high - c.low,
    Math.abs(c.high - candles[i].close),
    Math.abs(c.low  - candles[i].close)
  ));
  let atr = trs.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (let i = period; i < trs.length; i++) atr = (atr*(period-1)+trs[i])/period;
  return atr;
}

// ─── Volume ───────────────────────────────────────────────────────────────────
export function detectVolumeSpike(volumes, multiplier=1.5) {
  if (volumes.length < 20) return false;
  const avg = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  return volumes[volumes.length-1] > avg*multiplier;
}
export function getVolumeTrend(volumes, period=5) {
  if (volumes.length < period*2) return 'neutral';
  const recent = volumes.slice(-period).reduce((a,b)=>a+b,0)/period;
  const prev   = volumes.slice(-period*2,-period).reduce((a,b)=>a+b,0)/period;
  if (recent > prev*1.2) return 'increasing';
  if (recent < prev*0.8) return 'decreasing';
  return 'neutral';
}

// ─── Market Trend ─────────────────────────────────────────────────────────────
export function detectMarketTrend(closes, period=20) {
  if (closes.length < period) return 'sideways';
  const ema = getLatestEMA(closes, period);
  const close = closes[closes.length-1];
  const prev  = closes[closes.length-Math.floor(period/2)];
  const slope = (close - prev) / prev * 100;
  if (close > ema && slope > 0.3)  return 'bullish';
  if (close < ema && slope < -0.3) return 'bearish';
  return 'sideways';
}

// ─── STOCHASTIC RSI (NEW) ─────────────────────────────────────────────────────
/**
 * StochRSI lebih sensitif dari RSI biasa.
 * < 20 = oversold ekstrem → sinyal BUY terkuat
 * > 80 = overbought ekstrem → sinyal EXIT
 */
export function calculateStochRSI(closes, rsiPeriod=14, stochPeriod=14) {
  const rsiValues = calculateRSI(closes, rsiPeriod);
  if (rsiValues.length < stochPeriod) return null;
  const recent = rsiValues.slice(-stochPeriod);
  const minRSI = Math.min(...recent);
  const maxRSI = Math.max(...recent);
  const lastRSI = rsiValues[rsiValues.length - 1];
  if (maxRSI === minRSI) return 50;
  return parseFloat(((lastRSI - minRSI) / (maxRSI - minRSI) * 100).toFixed(2));
}

// ─── SUPPORT & RESISTANCE (NEW) ───────────────────────────────────────────────
/**
 * Deteksi level Support & Resistance dari swing high/low.
 * KUNCI STRATEGI "beli rendah jual tinggi":
 * - Beli DEKAT support = risiko kecil, reward besar
 * - Jangan beli dekat resistance = terlalu mahal
 */
export function detectSupportResistance(candles, lookback=20, threshold=0.003) {
  if (candles.length < lookback * 2) return {
    supports: [], resistances: [],
    nearSupport: false, nearResistance: false,
    closestSupport: null, closestResistance: null,
    distanceToSupport: 999, distanceToResistance: 999, srRatio: 0,
  };

  const recent = candles.slice(-lookback * 2);
  const supports = [];
  const resistances = [];

  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    // Swing Low = support
    if (c.low < recent[i-1].low && c.low < recent[i-2].low &&
        c.low < recent[i+1].low && c.low < recent[i+2].low) {
      supports.push(c.low);
    }
    // Swing High = resistance
    if (c.high > recent[i-1].high && c.high > recent[i-2].high &&
        c.high > recent[i+1].high && c.high > recent[i+2].high) {
      resistances.push(c.high);
    }
  }

  const close = candles[candles.length - 1].close;
  const nearSupport = supports.some(s => Math.abs(close - s) / s < threshold);
  const nearResistance = resistances.some(r => Math.abs(close - r) / r < threshold);
  const closestSupport = supports.filter(s => s < close).sort((a,b) => b - a)[0] || null;
  const closestResistance = resistances.filter(r => r > close).sort((a,b) => a - b)[0] || null;
  const distanceToSupport = closestSupport ? (close - closestSupport) / close * 100 : 999;
  const distanceToResistance = closestResistance ? (closestResistance - close) / close * 100 : 999;
  const srRatio = distanceToResistance > 0 && distanceToSupport > 0
    ? distanceToResistance / distanceToSupport : 0;

  return {
    supports, resistances, nearSupport, nearResistance,
    closestSupport, closestResistance,
    distanceToSupport: parseFloat(distanceToSupport.toFixed(2)),
    distanceToResistance: parseFloat(distanceToResistance.toFixed(2)),
    srRatio: parseFloat(srRatio.toFixed(2)), // > 1.5 = bagus, > 2.0 = sangat bagus
  };
}

// ─── FIBONACCI RETRACEMENT (NEW) ──────────────────────────────────────────────
/**
 * Golden Zone (0.5 - 0.618) = area terbaik untuk entry BUY setelah pullback.
 * Teknik yang dipakai trader profesional untuk "beli murah di pullback".
 */
export function calculateFibonacci(candles, lookback=50) {
  if (candles.length < lookback) return null;
  const recent = candles.slice(-lookback);
  const high = Math.max(...recent.map(c => c.high));
  const low  = Math.min(...recent.map(c => c.low));
  const range = high - low;
  if (range === 0) return null;
  const close = candles[candles.length - 1].close;

  const levels = {
    '0.0':   high,
    '0.236': high - range * 0.236,
    '0.382': high - range * 0.382,
    '0.5':   high - range * 0.5,
    '0.618': high - range * 0.618,
    '0.786': high - range * 0.786,
    '1.0':   low,
  };

  const inGoldenZone   = close >= levels['0.618'] && close <= levels['0.5'];
  const nearGolden618  = Math.abs(close - levels['0.618']) / close < 0.005;
  const nearGolden786  = Math.abs(close - levels['0.786']) / close < 0.005;
  const position       = (close - low) / range;

  return {
    levels, high, low, range, inGoldenZone, nearGolden618, nearGolden786,
    position: parseFloat(position.toFixed(3)),
    fibSignal: position < 0.4 ? 'buy_zone' : position > 0.7 ? 'sell_zone' : 'neutral',
  };
}

// ─── MOMENTUM SCORE (NEW) ─────────────────────────────────────────────────────
/**
 * Skor momentum gabungan 0-100 dari semua indikator.
 * Grade A+ (≥75) = kondisi terbaik untuk BUY
 * Grade F (≤35) = jangan BUY, tunggu
 */
export function calculateMomentumScore(candles) {
  if (candles.length < 30) return { score: 50, grade: 'C', factors: {} };

  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const close   = closes[closes.length - 1];

  let score = 50;
  const factors = {};

  // 1. RSI (25 poin)
  const rsi14 = getLatestRSI(closes, 14);
  if (rsi14 !== null) {
    if (rsi14 < 30) { score += 15; factors.rsi = 'oversold'; }
    else if (rsi14 < 40) { score += 8; factors.rsi = 'below_mid'; }
    else if (rsi14 > 70) { score -= 15; factors.rsi = 'overbought'; }
    else if (rsi14 > 60) { score -= 8; factors.rsi = 'above_mid'; }
    else factors.rsi = 'neutral';
  }

  // 2. StochRSI (20 poin)
  const stochRSI = calculateStochRSI(closes);
  if (stochRSI !== null) {
    if (stochRSI < 20) { score += 15; factors.stochRSI = 'extreme_oversold'; }
    else if (stochRSI < 35) { score += 8; factors.stochRSI = 'oversold'; }
    else if (stochRSI > 80) { score -= 15; factors.stochRSI = 'extreme_overbought'; }
    else if (stochRSI > 65) { score -= 8; factors.stochRSI = 'overbought'; }
    else factors.stochRSI = 'neutral';
  }

  // 3. EMA Trend (20 poin)
  const ema9  = getLatestEMA(closes, 9);
  const ema21 = getLatestEMA(closes, 21);
  const ema50 = getLatestEMA(closes, Math.min(50, closes.length - 1));
  if (ema9 && ema21) {
    if (ema9 > ema21 && close > ema9) { score += 12; factors.ema = 'bullish_stack'; }
    if (ema9 < ema21 && close < ema9) { score -= 12; factors.ema = 'bearish_stack'; }
    if (ema50 && close > ema50) score += 5;
    if (ema50 && close < ema50) score -= 5;
  }

  // 4. MACD (15 poin)
  const macd = calculateMACD(closes);
  if (macd.latest) {
    const hist = macd.latest.histogram;
    if (hist > 0 && macd.latest.macd > 0) { score += 10; factors.macd = 'bullish_above_zero'; }
    else if (hist > 0) { score += 5; factors.macd = 'bullish_cross'; }
    else if (hist < 0 && macd.latest.macd < 0) { score -= 10; factors.macd = 'bearish'; }
    else if (hist < 0) { score -= 5; factors.macd = 'bearish_cross'; }
  }

  // 5. Bollinger Bands (10 poin)
  const bb = calculateBollingerBands(closes);
  if (bb.latest) {
    const pos = (close - bb.latest.lower) / (bb.latest.upper - bb.latest.lower);
    if (pos < 0.1) { score += 12; factors.bb = 'at_lower_band'; }
    else if (pos < 0.25) { score += 6; factors.bb = 'near_lower'; }
    else if (pos > 0.9) { score -= 12; factors.bb = 'at_upper_band'; }
    else if (pos > 0.75) { score -= 6; factors.bb = 'near_upper'; }
    else factors.bb = 'mid_band';
  }

  // 6. Volume (10 poin)
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const volRatio = avgVol > 0 ? volumes[volumes.length-1] / avgVol : 1;
  if (volRatio > 2.5) { score += 10; factors.volume = 'very_high'; }
  else if (volRatio > 1.5) { score += 5; factors.volume = 'high'; }
  else if (volRatio < 0.5) { score -= 5; factors.volume = 'very_low'; }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 75 ? 'A+' : score >= 65 ? 'A' : score >= 55 ? 'B' : score >= 45 ? 'C' : score >= 35 ? 'D' : 'F';

  return { score: Math.round(score), grade, factors, rsi14, stochRSI };
}

// ─── DIVERGENCE DETECTION (NEW) ───────────────────────────────────────────────
/**
 * Bullish Divergence: Harga lower low, RSI higher low = reversal naik.
 * Ini adalah sinyal BUY tersembunyi yang dipakai trader pro.
 */
export function detectDivergence(candles, period=20) {
  if (candles.length < period + 5) return { bullish: false, bearish: false, type: 'none' };

  const recent  = candles.slice(-period);
  const closes  = recent.map(c => c.close);
  const lows    = recent.map(c => c.low);
  const highs   = recent.map(c => c.high);
  const rsiVals = calculateRSI(closes, Math.min(14, period - 1));

  if (rsiVals.length < 4) return { bullish: false, bearish: false, type: 'none' };

  const lastLow  = lows[lows.length - 1];
  const prevLow  = Math.min(...lows.slice(0, -3));
  const lastRSI  = rsiVals[rsiVals.length - 1];
  const prevRSI  = Math.min(...rsiVals.slice(0, -3));

  const bullishDiv = lastLow < prevLow && lastRSI > prevRSI && lastRSI < 45;

  const lastHigh     = highs[highs.length - 1];
  const prevHigh     = Math.max(...highs.slice(0, -3));
  const prevRSIHigh  = Math.max(...rsiVals.slice(0, -3));
  const bearishDiv   = lastHigh > prevHigh && lastRSI < prevRSIHigh && lastRSI > 55;

  return {
    bullish: bullishDiv,
    bearish: bearishDiv,
    rsi: lastRSI,
    type: bullishDiv ? 'bullish_divergence' : bearishDiv ? 'bearish_divergence' : 'none',
  };
}

// ─── VWAP APPROXIMATION (NEW) ─────────────────────────────────────────────────
/**
 * Volume-Weighted Average Price.
 * Harga di bawah VWAP = relatif murah → aman untuk BUY.
 * Harga di atas VWAP = relatif mahal → hati-hati.
 */
export function calculateVWAP(candles, period=20) {
  if (candles.length < period) return null;
  const recent = candles.slice(-period);
  let totalPV = 0, totalV = 0;
  for (const c of recent) {
    const typical = (c.high + c.low + c.close) / 3;
    totalPV += typical * c.volume;
    totalV  += c.volume;
  }
  if (totalV === 0) return null;
  const vwap = totalPV / totalV;
  const close = candles[candles.length - 1].close;
  const pctFromVWAP = (close - vwap) / vwap * 100;
  return {
    vwap: parseFloat(vwap.toFixed(0)),
    pctFromVWAP: parseFloat(pctFromVWAP.toFixed(2)),
    belowVWAP: close < vwap,
    signal: close < vwap * 0.99 ? 'below_vwap_buy_zone' : close > vwap * 1.01 ? 'above_vwap_caution' : 'at_vwap',
  };
}

// ─── TREND STRENGTH / ADX Simplified (NEW) ────────────────────────────────────
/**
 * Kekuatan trend. > 25 = trend kuat, layak trade.
 * < 20 = sideways, hindari entry → kemungkinan besar SL kena.
 */
export function calculateTrendStrength(candles, period=14) {
  if (candles.length < period * 2) return { adx: 0, strength: 'weak', trending: false, direction: 'none' };
  const atr = calculateATR(candles, period) || 1;
  let plusDM = 0, minusDM = 0;
  for (let i = 1; i < Math.min(period + 1, candles.length); i++) {
    const upMove   = candles[i].high - candles[i-1].high;
    const downMove = candles[i-1].low - candles[i].low;
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    else if (downMove > upMove && downMove > 0) minusDM += downMove;
  }
  const plusDI  = (plusDM / period / atr) * 100;
  const minusDI = (minusDM / period / atr) * 100;
  const diDiff  = Math.abs(plusDI - minusDI);
  const diSum   = plusDI + minusDI;
  const adx     = diSum > 0 ? (diDiff / diSum) * 100 : 0;
  return {
    adx: parseFloat(adx.toFixed(1)),
    plusDI: parseFloat(plusDI.toFixed(1)),
    minusDI: parseFloat(minusDI.toFixed(1)),
    strength: adx > 35 ? 'strong' : adx > 20 ? 'moderate' : 'weak',
    trending: adx > 20,
    direction: plusDI > minusDI ? 'up' : 'down',
  };
}

// ─── CANDLESTICK PATTERNS ─────────────────────────────────────────────────────
export function detectCandlePattern(candles) {
  if (candles.length < 3) return { pattern: 'none', direction: 'neutral', strength: 0 };
  const c0 = candles[candles.length-1];
  const c1 = candles[candles.length-2];
  const c2 = candles[candles.length-3];
  const body0  = Math.abs(c0.close - c0.open);
  const body1  = Math.abs(c1.close - c1.open);
  const range0 = c0.high - c0.low;
  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;
  const isBullish0 = c0.close > c0.open;
  const isBullish1 = c1.close > c1.open;

  if (lowerWick0 > body0*2 && upperWick0 < body0*0.5 && body0 > 0)
    return { pattern: 'hammer', direction: 'bullish', strength: 75 };
  if (upperWick0 > body0*2 && lowerWick0 < body0*0.5 && body0 > 0)
    return { pattern: 'shooting_star', direction: 'bearish', strength: 72 };
  if (!isBullish1 && isBullish0 && c0.open < c1.close && c0.close > c1.open && body0 > body1)
    return { pattern: 'bullish_engulfing', direction: 'bullish', strength: 85 };
  if (isBullish1 && !isBullish0 && c0.open > c1.close && c0.close < c1.open && body0 > body1)
    return { pattern: 'bearish_engulfing', direction: 'bearish', strength: 83 };
  const body2 = Math.abs(c2.close - c2.open);
  if (!isBullish1 && isBullish0 && body1 < body2*0.3 && c0.close > (c2.open+c2.close)/2)
    return { pattern: 'morning_star', direction: 'bullish', strength: 88 };
  if (isBullish1 && !isBullish0 && body1 < body2*0.3 && c0.close < (c2.open+c2.close)/2)
    return { pattern: 'evening_star', direction: 'bearish', strength: 86 };
  if (body0 < range0*0.1 && range0 > 0)
    return { pattern: 'doji', direction: 'neutral', strength: 0 };
  if (isBullish0 && body0 > range0*0.7)
    return { pattern: 'strong_bull', direction: 'bullish', strength: 65 };
  if (!isBullish0 && body0 > range0*0.7)
    return { pattern: 'strong_bear', direction: 'bearish', strength: 63 };
  return { pattern: 'none', direction: 'neutral', strength: 40 };
}

// ─── SESSION FILTER (WIB) ─────────────────────────────────────────────────────
export function isGoodTradingSession() {
  const now  = new Date();
  const utc  = now.getUTCHours() * 60 + now.getUTCMinutes();
  const wib  = (utc + 7 * 60) % (24 * 60);
  const wibH = Math.floor(wib / 60);
  const wibMin = wib % 60;
  const morning = wibH >= 8  && wibH < 12;
  const evening = wibH >= 19 && wibH < 23;
  const lunch   = wibH >= 13 && wibH < 15;
  const prime   = (wibH >= 9 && wibH < 11) || (wibH >= 20 && wibH < 22);
  const isGood  = morning || evening || lunch;
  const sessionName = prime ? 'Prime ⚡' : morning ? 'Pagi' : evening ? 'Malam' : lunch ? 'Siang' : 'Sepi';
  return { isGood, wibH, wibMin, sessionName, prime };
}

// ─── ADAPTIVE TP/SL ───────────────────────────────────────────────────────────
export function calculateAdaptiveTPSL(candles, entryPrice, side='buy') {
  const atr = calculateATR(candles) || entryPrice * 0.01;
  const atrPct = atr / entryPrice * 100;
  const volatility = atrPct > 3 ? 'high' : atrPct > 1 ? 'medium' : 'low';
  let slMultiplier, tpMultiplier;
  if (volatility === 'high')   { slMultiplier = 2.0; tpMultiplier = 4.5; }
  else if (volatility === 'medium') { slMultiplier = 1.5; tpMultiplier = 3.5; }
  else                         { slMultiplier = 1.2; tpMultiplier = 2.5; }
  const slDist = atr * slMultiplier;
  const tpDist = atr * tpMultiplier;
  return {
    stopLoss:   side === 'buy' ? entryPrice - slDist : entryPrice + slDist,
    takeProfit: side === 'buy' ? entryPrice + tpDist : entryPrice - tpDist,
    atr, atrPct: parseFloat(atrPct.toFixed(2)),
    slMultiplier, tpMultiplier, volatility,
    riskRewardRatio: parseFloat((tpMultiplier / slMultiplier).toFixed(2)),
  };
}

// ─── HIGHER TIMEFRAME BIAS ────────────────────────────────────────────────────
export function getHigherTFBias(candles) {
  if (candles.length < 60) return { bias: 'neutral', confidence: 0 };
  const grouped = [];
  const groupSize = Math.max(3, Math.floor(candles.length / 20));
  for (let i = 0; i + groupSize <= candles.length; i += groupSize) {
    const slice = candles.slice(i, i + groupSize);
    grouped.push({
      open: slice[0].open, high: Math.max(...slice.map(c=>c.high)),
      low:  Math.min(...slice.map(c=>c.low)), close: slice[slice.length-1].close,
      volume: slice.reduce((a,c)=>a+c.volume,0),
    });
  }
  if (grouped.length < 10) return { bias: 'neutral', confidence: 0 };
  const closes = grouped.map(c=>c.close);
  const volumes = grouped.map(c=>c.volume);
  const rsi = getLatestRSI(closes, 7);
  const ema9 = getLatestEMA(closes, 9);
  const ema21 = getLatestEMA(closes, Math.min(21, closes.length-1));
  const trend = detectMarketTrend(closes);
  const volSpike = detectVolumeSpike(volumes);
  const close = closes[closes.length-1];
  let bullScore = 0, bearScore = 0;
  if (rsi !== null) {
    if (rsi < 35) bullScore += 30;
    if (rsi > 65) bearScore += 30;
  }
  if (ema9 && ema21) {
    if (ema9 > ema21 && close > ema9) bullScore += 35;
    if (ema9 < ema21 && close < ema9) bearScore += 35;
  }
  if (trend === 'bullish') bullScore += 25;
  if (trend === 'bearish') bearScore += 25;
  if (volSpike) { bullScore += 10; bearScore += 10; }
  const total = bullScore + bearScore;
  if (total === 0) return { bias: 'neutral', confidence: 0 };
  if (bullScore > bearScore * 1.3) return { bias: 'bullish', confidence: Math.round(bullScore), rsi, trend };
  if (bearScore > bullScore * 1.3) return { bias: 'bearish', confidence: Math.round(bearScore), rsi, trend };
  return { bias: 'neutral', confidence: 50, rsi, trend };
}

// ─── EQUITY CURVE MODE ────────────────────────────────────────────────────────
export function getEquityMode(currentBalance, startBalance, targetBalance) {
  const pnlPct  = (currentBalance - startBalance) / startBalance * 100;
  const progress = startBalance > 0 ? (currentBalance - startBalance) / (targetBalance - startBalance) : 0;
  if (currentBalance < startBalance * 0.8)
    return { mode:'protect', riskMult:0.3, reason:'drawdown_protection' };
  if (progress >= 0.8)
    return { mode:'conservative', riskMult:0.5, reason:'hampir_target' };
  if (progress >= 0.5)
    return { mode:'moderate', riskMult:0.75, reason:'setengah_jalan' };
  if (pnlPct > 20 && progress < 0.3)
    return { mode:'aggressive', riskMult:1.1, reason:'profit_streak' };
  return { mode:'normal', riskMult:1.0, reason:'standard' };
}

// ─── SIGNAL SCORE ─────────────────────────────────────────────────────────────
export function computeSignalScore(ind) {
  const { rsi, ema9, ema21, macd, volume, avgVolume, close, bb, trend } = ind;
  let score = 50;
  const signals = {};
  if (rsi !== null) {
    if (rsi < 25)      { score += 25; signals.rsi = 'heavily_oversold'; }
    else if (rsi < 35) { score += 15; signals.rsi = 'oversold'; }
    else if (rsi < 45) { score += 5;  signals.rsi = 'below_mid'; }
    else if (rsi > 75) { score -= 25; signals.rsi = 'heavily_overbought'; }
    else if (rsi > 65) { score -= 15; signals.rsi = 'overbought'; }
    else if (rsi > 55) { score -= 5;  signals.rsi = 'above_mid'; }
    else signals.rsi = 'neutral';
  }
  if (ema9 && ema21) {
    if (ema9 > ema21 && close > ema9) { score += 20; signals.ema = 'bullish_cross'; }
    if (ema9 < ema21 && close < ema9) { score -= 20; signals.ema = 'bearish_cross'; }
    else signals.ema = signals.ema || 'neutral';
  }
  if (macd) {
    if (macd.histogram > 0 && macd.macd > 0) { score += 15; signals.macd = 'bullish'; }
    if (macd.histogram < 0 && macd.macd < 0) { score -= 15; signals.macd = 'bearish'; }
    else signals.macd = signals.macd || 'neutral';
  }
  if (volume && avgVolume && avgVolume > 0) {
    const vr = volume/avgVolume;
    if (vr > 2.0) { score += 15; signals.volume = 'high_spike'; }
    else if (vr > 1.5) { score += 8; signals.volume = 'spike'; }
    else if (vr < 0.5) { score -= 5; signals.volume = 'low'; }
    else signals.volume = 'normal';
  }
  if (bb && close) {
    const pos = (close - bb.lower) / (bb.upper - bb.lower);
    if (pos < 0.1) { score += 20; signals.bb = 'at_lower'; }
    else if (pos < 0.25) { score += 10; signals.bb = 'near_lower'; }
    else if (pos > 0.9) { score -= 20; signals.bb = 'at_upper'; }
    else if (pos > 0.75) { score -= 10; signals.bb = 'near_upper'; }
    else signals.bb = 'inside';
  }
  if (trend === 'bullish') { score += 10; signals.trend = 'bullish'; }
  if (trend === 'bearish') { score -= 10; signals.trend = 'bearish'; }
  score = Math.max(0, Math.min(100, score));
  let action = 'HOLD';
  if (score >= 68) action = 'BUY';
  if (score <= 32) action = 'SELL';
  return { action, score, signals, rsi, trend };
}

// ─── FEATURE EXTRACTION (for ML) ─────────────────────────────────────────────
export function extractFeatures(candles) {
  if (candles.length < 30) return null;
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const rsi14   = getLatestRSI(closes, 14);
  const rsi7    = getLatestRSI(closes, 7);
  const ema9    = getLatestEMA(closes, 9);
  const ema21   = getLatestEMA(closes, 21);
  const ema50   = getLatestEMA(closes, Math.min(50, closes.length-1));
  const macd    = calculateMACD(closes);
  const bb      = calculateBollingerBands(closes);
  const close   = closes[closes.length-1];
  const avgVol  = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const stochRSI = calculateStochRSI(closes);
  return {
    rsi14: rsi14||50, rsi7: rsi7||50, stochRSI: stochRSI||50,
    ema9_diff:  ema9  ? (close-ema9)/close*100  : 0,
    ema21_diff: ema21 ? (close-ema21)/close*100 : 0,
    ema50_diff: ema50 ? (close-ema50)/close*100 : 0,
    macd_hist: macd.latest?.histogram||0, macd_line: macd.latest?.macd||0,
    bb_pos: bb.latest ? (close-bb.latest.lower)/(bb.latest.upper-bb.latest.lower) : 0.5,
    vol_ratio: avgVol>0 ? volumes[volumes.length-1]/avgVol-1 : 0,
    price_change_1: closes.length>=2 ? (close-closes[closes.length-2])/closes[closes.length-2]*100 : 0,
    price_change_5: closes.length>=6 ? (close-closes[closes.length-6])/closes[closes.length-6]*100 : 0,
  };
}

// ─── BLACKLIST PAIR ───────────────────────────────────────────────────────────
const pairBlacklist = new Map();
export function isPairBlacklisted(pair) {
  const entry = pairBlacklist.get(pair);
  if (!entry) return false;
  if (Date.now() > entry.until) { pairBlacklist.delete(pair); return false; }
  return true;
}
export function blacklistPair(pair, durationMs=3600000, reason='2x loss') {
  const existing = pairBlacklist.get(pair) || { losses: 0 };
  pairBlacklist.set(pair, { until: Date.now() + durationMs, reason, losses: existing.losses + 1 });
}
export function reportPairLoss(pair) {
  const existing = pairBlacklist.get(pair) || { losses: 0, until: 0 };
  const newLosses = existing.losses + 1;
  if (newLosses >= 2) {
    blacklistPair(pair, newLosses >= 3 ? 7200000 : 3600000, `${newLosses}x consecutive loss`);
    return true;
  }
  pairBlacklist.set(pair, { ...existing, losses: newLosses });
  return false;
}
export function resetPairLoss(pair) { pairBlacklist.delete(pair); }
export function getBlacklistedPairs() {
  const result = [];
  for (const [pair, data] of pairBlacklist.entries()) {
    if (Date.now() < data.until) result.push({ pair, ...data, remainingMs: data.until - Date.now() });
  }
  return result;
}
