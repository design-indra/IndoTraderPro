/**
 * lib/indodax.js
 * Indodax Private & Public API Client
 * Authentication: HMAC-SHA512
 */

import crypto from 'crypto';

const BASE_URL = 'https://indodax.com/tapi';
const PUBLIC_URL = 'https://indodax.com/api';

let nonceCounter = Date.now();
const getNonce = () => String(++nonceCounter);

/**
 * Sign payload with HMAC-SHA512
 */
function signPayload(payload, secretKey) {
  return crypto
    .createHmac('sha512', secretKey)
    .update(payload)
    .digest('hex');
}

/**
 * Build URL-encoded query string
 */
function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Private API request (authenticated)
 */
export async function privateRequest(method, params = {}) {
  const apiKey = process.env.INDODAX_API_KEY;
  const secretKey = process.env.INDODAX_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('INDODAX_API_KEY or INDODAX_SECRET_KEY not configured');
  }

  const payload = buildQuery({
    method,
    nonce: getNonce(),
    ...params,
  });

  const sign = signPayload(payload, secretKey);

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Key: apiKey,
      Sign: sign,
    },
    body: payload,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.success !== 1) {
    throw new Error(data.error || 'Unknown Indodax API error');
  }

  return data.return;
}

/**
 * Public API request (unauthenticated)
 */
export async function publicRequest(endpoint) {
  const res = await fetch(`${PUBLIC_URL}/${endpoint}`, {
    next: { revalidate: 5 },
  });

  if (!res.ok) {
    throw new Error(`HTTP error: ${res.status}`);
  }

  return res.json();
}

// ─── Private API Methods ───────────────────────────────────────────────────

/**
 * Get account information & balances
 */
export async function getInfo() {
  return privateRequest('getInfo');
}

/**
 * Get transaction history
 */
export async function transHistory() {
  return privateRequest('transHistory');
}

/**
 * Place a trade order
 * @param {string} pair - e.g. 'btc_idr'
 * @param {string} type - 'buy' | 'sell'
 * @param {number} price - IDR price
 * @param {number} idr - IDR amount (for buy)
 * @param {number} btc - Crypto amount (for sell)
 */
export async function trade(pair, type, price, idr, btc) {
  const params = { pair, type, price };
  if (type === 'buy') params.idr = Math.floor(idr);
  else params[pair.split('_')[0]] = btc;

  return privateRequest('trade', params);
}

/**
 * Get open orders
 * @param {string} pair - e.g. 'btc_idr'
 */
export async function openOrders(pair) {
  return privateRequest('openOrders', { pair });
}

/**
 * Cancel an order
 */
export async function cancelOrder(pair, orderId, type) {
  return privateRequest('cancelOrder', { pair, order_id: orderId, type });
}

/**
 * Get order history
 */
export async function orderHistory(pair, count = 10, from = 0) {
  return privateRequest('orderHistory', { pair, count, from });
}

// ─── Public API Methods ────────────────────────────────────────────────────

/**
 * Get ticker data for a pair
 */
export async function getTicker(pair) {
  const data = await publicRequest(`${pair}/ticker`);
  return data.ticker;
}

/**
 * Get all tickers
 */
export async function getAllTickers() {
  return publicRequest('ticker_all');
}

/**
 * Get order book
 */
export async function getDepth(pair) {
  return publicRequest(`${pair}/depth`);
}

/**
 * Get trade history (public)
 * @param {string} pair
 */
export async function getTrades(pair) {
  return publicRequest(`${pair}/trades`);
}

/**
 * Fetch OHLCV candlestick data
 * Indodax doesn't provide native OHLCV, so we build from public trades
 * or use the chart endpoint
 */
export async function getOHLCV(pair, tf = '1m', count = 100) {
  try {
    // Use the candlestick chart API
    const symbol = pair.replace('_', '').toUpperCase();
    const tfMap = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };
    const resolution = tfMap[tf] || 1;

    const to = Math.floor(Date.now() / 1000);
    const from = to - resolution * 60 * count;

    const url = `https://indodax.com/tradingview/history?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;
    const res = await fetch(url, { next: { revalidate: 5 } });
    const data = await res.json();

    if (data.s !== 'ok') {
      return generateMockOHLCV(count);
    }

    return data.t.map((time, i) => ({
      time: time * 1000,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    }));
  } catch {
    return generateMockOHLCV(count);
  }
}

/**
 * Fallback mock OHLCV generator for demo/testing
 */
function generateMockOHLCV(count) {
  const candles = [];
  let price = 500000000; // BTC ~500M IDR
  const now = Date.now();

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.48) * price * 0.015;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = Math.random() * 5 + 0.1;

    candles.push({
      time: now - i * 60000,
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume: parseFloat(volume.toFixed(4)),
    });

    price = close;
  }

  return candles;
}
