/**
 * lib/autoScanner.js — Auto Pair Scanner
 * Scan 6 pair utama Indodax, pilih yang paling potensial
 * berdasarkan: volatility, momentum, volume, RSI, trend
 */

import { getOHLCV, getTicker } from './indodax.js';
import {
  getLatestRSI, getLatestEMA, calculateATR,
  detectVolumeSpike, detectMarketTrend, calculateMACD,
} from './indicators.js';

const SCAN_PAIRS = ['btc_idr','eth_idr','sol_idr','doge_idr','xrp_idr','trx_idr'];

// Cache hasil scan agar tidak hit API terlalu sering
let scanCache = { result: null, timestamp: 0 };
const CACHE_TTL = 3 * 60 * 1000; // 3 menit

/**
 * Hitung score sebuah pair berdasarkan kondisi market saat ini
 * Score tinggi = pair sedang dalam kondisi bagus untuk scalping
 */
async function scorePair(pair) {
  try {
    const [candles, ticker] = await Promise.all([
      getOHLCV(pair, '5m', 60),
      getTicker(pair).catch(() => null),
    ]);

    if (!candles || candles.length < 20) return null;

    const closes  = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const close   = closes[closes.length - 1];

    // ── Volatility Score (ATR % dari harga) ──────────────────────────────
    // Scalping butuh volatilitas cukup — terlalu rendah susah profit, terlalu tinggi = risiko
    const atr    = calculateATR(candles, 14);
    const atrPct = atr ? (atr / close) * 100 : 0;
    // Sweet spot: 0.3% - 2.5% ATR
    let volatilityScore;
    if (atrPct < 0.2)       volatilityScore = 20;  // Terlalu sepi
    else if (atrPct < 0.5)  volatilityScore = 60;
    else if (atrPct < 1.5)  volatilityScore = 100; // Ideal
    else if (atrPct < 2.5)  volatilityScore = 80;
    else if (atrPct < 4.0)  volatilityScore = 50;
    else                    volatilityScore = 20;  // Terlalu volatile/berbahaya

    // ── Momentum Score (RSI + arah harga) ────────────────────────────────
    // Cari pair yang RSI-nya di zona recovery (30-50) = berpotensi naik
    const rsi = getLatestRSI(closes, 14);
    let momentumScore = 50;
    if (rsi !== null) {
      if (rsi >= 25 && rsi <= 40)      momentumScore = 95; // Oversold = peluang beli murah
      else if (rsi > 40 && rsi <= 50)  momentumScore = 80; // Recovery zone
      else if (rsi > 50 && rsi <= 60)  momentumScore = 65; // Netral-bullish
      else if (rsi > 60 && rsi <= 70)  momentumScore = 45; // Mendekati overbought
      else if (rsi > 70)               momentumScore = 20; // Overbought = hindari
      else if (rsi < 25)               momentumScore = 55; // Sangat oversold (hati-hati)
    }

    // ── Volume Score ──────────────────────────────────────────────────────
    // Volume tinggi = likuiditas bagus, spread kecil
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastVol = volumes[volumes.length - 1];
    const volRatio = avgVol > 0 ? lastVol / avgVol : 1;
    let volumeScore;
    if (volRatio >= 2.0)       volumeScore = 100; // Volume spike = momentum kuat
    else if (volRatio >= 1.5)  volumeScore = 85;
    else if (volRatio >= 1.0)  volumeScore = 70;
    else if (volRatio >= 0.7)  volumeScore = 50;
    else                       volumeScore = 30;  // Volume sangat rendah = sepi

    // ── Trend Score ───────────────────────────────────────────────────────
    // Preferensi pair yang sedang bullish atau sideways (bukan bearish kuat)
    const trend = detectMarketTrend(closes);
    const ema9  = getLatestEMA(closes, 9);
    const ema21 = getLatestEMA(closes, 21);
    let trendScore = 50;
    if (trend === 'bullish' && ema9 > ema21) trendScore = 90;
    else if (trend === 'sideways')           trendScore = 70; // Scalping bagus di sideways
    else if (trend === 'bullish')            trendScore = 75;
    else if (trend === 'bearish' && rsi < 35) trendScore = 60; // Bearish tapi oversold
    else if (trend === 'bearish')            trendScore = 25;

    // ── MACD Score ────────────────────────────────────────────────────────
    const macd = calculateMACD(closes);
    let macdScore = 50;
    if (macd.latest) {
      if (macd.latest.histogram > 0 && macd.latest.macd > macd.latest.signal) macdScore = 85;
      else if (macd.latest.histogram > 0) macdScore = 70;
      else if (macd.latest.histogram < 0 && macd.latest.histogram > -atr * 0.1) macdScore = 55;
      else macdScore = 30;
    }

    // ── 24h Change dari ticker ────────────────────────────────────────────
    let change24hScore = 50;
    if (ticker) {
      const change = ((parseFloat(ticker.last) - parseFloat(ticker.open || ticker.last)) / parseFloat(ticker.last)) * 100;
      if (change >= -3 && change <= 5)     change24hScore = 80; // Naik moderat = bagus
      else if (change > 5 && change <= 10) change24hScore = 60; // Sudah naik banyak
      else if (change > 10)               change24hScore = 30; // Terlalu tinggi = risiko koreksi
      else if (change < -3 && change >= -8) change24hScore = 70; // Turun = beli murah
      else                                change24hScore = 40;  // Turun terlalu dalam
    }

    // ── Final Score (weighted average) ───────────────────────────────────
    const totalScore = Math.round(
      volatilityScore * 0.25 +
      momentumScore   * 0.30 +
      volumeScore     * 0.20 +
      trendScore      * 0.15 +
      macdScore       * 0.07 +
      change24hScore  * 0.03
    );

    return {
      pair,
      score: totalScore,
      details: {
        volatility:   { score: volatilityScore, atrPct: parseFloat(atrPct.toFixed(3)) },
        momentum:     { score: momentumScore,   rsi: rsi ? parseFloat(rsi.toFixed(1)) : null },
        volume:       { score: volumeScore,     ratio: parseFloat(volRatio.toFixed(2)) },
        trend:        { score: trendScore,      direction: trend },
        macd:         { score: macdScore,       histogram: macd.latest?.histogram || 0 },
        change24h:    { score: change24hScore },
      },
      lastPrice: close,
      displayPair: pair.replace('_idr','').toUpperCase() + '/IDR',
    };
  } catch (err) {
    console.error(`Scanner error for ${pair}:`, err.message);
    return null;
  }
}

/**
 * Scan semua pair dan return ranking
 * @param {object} options - { forceRefresh, minScore }
 * @returns {Promise<Array>} sorted pair list
 */
export async function scanBestPairs(options = {}) {
  const { forceRefresh = false, minScore = 55 } = options;

  // Return cache jika masih fresh
  if (!forceRefresh && scanCache.result && Date.now() - scanCache.timestamp < CACHE_TTL) {
    return scanCache.result;
  }

  // Scan semua pair secara parallel
  const results = await Promise.all(SCAN_PAIRS.map(scorePair));
  const valid = results
    .filter(r => r !== null && r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  // Update cache
  scanCache = { result: valid, timestamp: Date.now() };

  return valid;
}

/**
 * Get pair terbaik saat ini (untuk auto-switch)
 */
export async function getBestPair(currentPair = 'btc_idr', options = {}) {
  const results = await scanBestPairs(options);
  if (results.length === 0) return currentPair;
  return results[0].pair;
}

/**
 * Get cache timestamp
 */
export function getScannerCacheAge() {
  if (!scanCache.timestamp) return null;
  return Math.round((Date.now() - scanCache.timestamp) / 1000); // dalam detik
}

export { SCAN_PAIRS };
