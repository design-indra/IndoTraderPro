/**
 * app/api/market/route.js
 * GET /api/market?pair=btc_idr&tf=1m
 * Returns ticker + OHLCV + indicators
 */

import { NextResponse } from 'next/server';
import { getTicker, getOHLCV } from '../../../lib/indodax.js';
import {
  getLatestRSI, getLatestEMA, calculateMACD,
  calculateBollingerBands, detectMarketTrend, detectVolumeSpike,
} from '../../../lib/indicators.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pair = searchParams.get('pair') || 'btc_idr';
  const tf = searchParams.get('tf') || '5m';
  const count = parseInt(searchParams.get('count') || '100');

  try {
    const [ticker, candles] = await Promise.all([
      getTicker(pair).catch(() => null),
      getOHLCV(pair, tf, count),
    ]);

    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const rsi = getLatestRSI(closes, 14);
    const ema9 = getLatestEMA(closes, 9);
    const ema21 = getLatestEMA(closes, 21);
    const ema50 = getLatestEMA(closes, 50);
    const macd = calculateMACD(closes);
    const bb = calculateBollingerBands(closes);
    const trend = detectMarketTrend(closes);
    const volumeSpike = detectVolumeSpike(volumes);

    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] || lastClose;
    const change24h = ticker
      ? ((parseFloat(ticker.last) - parseFloat(ticker.open)) / parseFloat(ticker.open)) * 100
      : ((lastClose - prevClose) / prevClose) * 100;

    return NextResponse.json({
      success: true,
      pair,
      tf,
      ticker: ticker
        ? {
            last: parseFloat(ticker.last),
            buy: parseFloat(ticker.buy),
            sell: parseFloat(ticker.sell),
            high: parseFloat(ticker.high),
            low: parseFloat(ticker.low),
            vol: parseFloat(ticker.vol_idr),
            change24h: parseFloat(change24h.toFixed(2)),
          }
        : {
            last: lastClose,
            buy: lastClose * 0.999,
            sell: lastClose * 1.001,
            high: Math.max(...closes.slice(-24)),
            low: Math.min(...closes.slice(-24)),
            change24h: parseFloat(change24h.toFixed(2)),
          },
      indicators: {
        rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
        ema9: ema9 ? parseFloat(ema9.toFixed(0)) : null,
        ema21: ema21 ? parseFloat(ema21.toFixed(0)) : null,
        ema50: ema50 ? parseFloat(ema50.toFixed(0)) : null,
        macd: macd.latest
          ? {
              macd: parseFloat(macd.latest.macd?.toFixed(0) || 0),
              signal: parseFloat(macd.latest.signal?.toFixed(0) || 0),
              histogram: parseFloat(macd.latest.histogram?.toFixed(0) || 0),
            }
          : null,
        bb: bb.latest
          ? {
              upper: parseFloat(bb.latest.upper.toFixed(0)),
              middle: parseFloat(bb.latest.middle.toFixed(0)),
              lower: parseFloat(bb.latest.lower.toFixed(0)),
            }
          : null,
        trend,
        volumeSpike,
      },
      candles: candles.slice(-100), // Return last 100 candles
      candleCount: candles.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
