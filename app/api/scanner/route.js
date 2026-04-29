/**
 * app/api/scanner/route.js
 * GET /api/scanner         — scan semua pair, return ranking
 * GET /api/scanner?best=1  — return hanya pair terbaik
 */
import { NextResponse } from 'next/server';
import { scanBestPairs, getBestPair, getScannerCacheAge } from '../../../lib/autoScanner.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const bestOnly    = searchParams.get('best') === '1';
  const forceRefresh = searchParams.get('refresh') === '1';
  const currentPair = searchParams.get('current') || 'btc_idr';

  try {
    if (bestOnly) {
      const best = await getBestPair(currentPair, { forceRefresh });
      return NextResponse.json({
        success: true,
        bestPair: best,
        cacheAge: getScannerCacheAge(),
      });
    }

    const results = await scanBestPairs({ forceRefresh });

    return NextResponse.json({
      success: true,
      pairs: results,
      bestPair: results[0] || null,
      scannedAt: new Date().toISOString(),
      cacheAge: getScannerCacheAge(),
      count: results.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
