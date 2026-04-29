/**
 * app/api/balance/route.js — Balance (Per-User)
 */
import { NextResponse } from 'next/server';
import { getInfo }       from '../../../lib/indodax.js';
import { getUserState }  from '../../../lib/userState.js';
import { verifyToken }   from '../../../lib/auth.js';

function extractUserId(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  const dec   = verifyToken(token);
  return dec?.id || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode   = searchParams.get('mode') || 'demo';
  const userId = extractUserId(req);

  try {
    if (mode === 'demo') {
      if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      const state = await getUserState(userId);
      let totalCryptoValue = 0;
      return NextResponse.json({
        success: true, mode: 'demo',
        balance: {
          idr: state.idrBalance,
          crypto: state.cryptoBalances || {},
          total: state.idrBalance + totalCryptoValue,
          openPositions: (state.openPositions || []).length,
          totalPnl: state.totalPnl, totalPnlPct: state.totalPnlPct,
          consecutiveLosses: state.consecutiveLosses, tradeCount: state.tradeCount,
        },
      });
    }
    const info       = await getInfo();
    const idrBalance = parseFloat(info.balance?.idr || 0);
    const cryptoBalances = {};
    for (const coin of ['btc','eth','bnb','sol','doge','trx','matic','xrp','ada']) {
      const val = parseFloat(info.balance?.[coin] || 0);
      if (val > 0) cryptoBalances[coin] = val;
    }
    return NextResponse.json({ success: true, mode: 'live', balance: { idr: idrBalance, crypto: cryptoBalances, freeze: info.balance_hold } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
