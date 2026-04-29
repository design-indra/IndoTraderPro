/**
 * app/api/trade/route.js
 * POST /api/trade - manual trade execution
 * GET  /api/trade - open orders + trade history
 */

import { NextResponse } from 'next/server';
import { trade, openOrders, cancelOrder, orderHistory } from '../../../lib/indodax.js';
import { getDemoState, demoBuy, demoSell } from '../../../lib/demoStore.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pair = searchParams.get('pair') || 'btc_idr';
  const mode = searchParams.get('mode') || 'demo';

  try {
    if (mode === 'demo') {
      const state = getDemoState();
      return NextResponse.json({
        success: true,
        openPositions: state.openPositions.filter((p) => p.pair === pair),
        closedTrades: state.closedTrades.filter((t) => t.pair === pair).slice(0, 20),
      });
    }

    const [orders, history] = await Promise.all([
      openOrders(pair).catch(() => ({ orders: {} })),
      orderHistory(pair, 20).catch(() => ({ orders: [] })),
    ]);

    return NextResponse.json({
      success: true,
      openOrders: orders.orders || {},
      history: history.orders || [],
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { mode, type, pair, price, idrAmount, cryptoAmount, positionId, reason } = body;

  // Validate
  if (!pair || !type) {
    return NextResponse.json({ success: false, error: 'Missing pair or type' }, { status: 400 });
  }

  try {
    if (mode === 'demo') {
      if (type === 'buy') {
        if (!price || !idrAmount) {
          return NextResponse.json({ success: false, error: 'Missing price or idrAmount' }, { status: 400 });
        }
        const position = demoBuy(pair, price, idrAmount, {});
        return NextResponse.json({ success: true, position });
      }

      if (type === 'sell') {
        if (!positionId || !price) {
          return NextResponse.json({ success: false, error: 'Missing positionId or price' }, { status: 400 });
        }
        const result = demoSell(positionId, price, reason || 'manual');
        return NextResponse.json({ success: true, trade: result });
      }
    }

    // Live trading
    if (type === 'buy') {
      if (!price || !idrAmount) {
        return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 });
      }
      const result = await trade(pair, 'buy', price, idrAmount);
      return NextResponse.json({ success: true, order: result });
    }

    if (type === 'sell') {
      if (!price || !cryptoAmount) {
        return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 });
      }
      const result = await trade(pair, 'sell', price, null, cryptoAmount);
      return NextResponse.json({ success: true, order: result });
    }

    if (type === 'cancel') {
      const { orderId, orderType } = body;
      const result = await cancelOrder(pair, orderId, orderType);
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ success: false, error: 'Unknown trade type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
