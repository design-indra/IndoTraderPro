/**
 * lib/demoStore.js — In-memory demo trading state
 * Default balance: Rp 100.000 (scalping challenge)
 */

let _startBalance = parseInt(process.env.DEMO_BALANCE || '100000');
let demoState     = null;

function createInitialState(balance = _startBalance) {
  return {
    idrBalance:        balance,
    startBalance:      balance,
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

export function getDemoState()  { if (!demoState) demoState = createInitialState(); return demoState; }

export function resetDemo(customBalance = null) {
  const bal = customBalance || _startBalance;
  _startBalance = bal;
  demoState = createInitialState(bal);
  return demoState;
}

export function setStartBalance(amount) {
  _startBalance = amount;
}

export function demoBuy(pair, currentPrice, idrAmount, riskParams = {}) {
  const state = getDemoState();
  if (state.idrBalance < idrAmount) throw new Error('Insufficient demo balance');

  const coin          = pair.split('_')[0];
  const fee           = 0.003;
  const effectiveAmt  = idrAmount * (1 - fee);
  const cryptoAmount  = effectiveAmt / currentPrice;

  state.idrBalance -= idrAmount;
  state.cryptoBalances[coin] = (state.cryptoBalances[coin] || 0) + cryptoAmount;

  const position = {
    id:           `demo_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
    pair, coin, side: 'buy',
    entryPrice:   currentPrice,
    cryptoAmount, idrAmount,
    feeIdr:       idrAmount * fee,
    stopLoss:     riskParams.stopLoss,
    takeProfit:   riskParams.takeProfit,
    trailingStop: riskParams.trailingStop,
    highestPrice: currentPrice,
    lowestPrice:  currentPrice,
    openTime:     Date.now(),
    status:       'open',
  };

  state.openPositions.push(position);
  state.lastUpdate = Date.now();
  return position;
}

export function demoSell(positionId, currentPrice, exitReason = 'signal') {
  const state  = getDemoState();
  const posIdx = state.openPositions.findIndex((p) => p.id === positionId);
  if (posIdx === -1) throw new Error(`Position ${positionId} not found`);

  const pos     = state.openPositions[posIdx];
  const fee     = 0.003;
  const grossIdr = pos.cryptoAmount * currentPrice;
  const netIdr   = grossIdr * (1 - fee);
  const pnl      = netIdr - pos.idrAmount;
  const pnlPct   = (pnl / pos.idrAmount) * 100;

  state.idrBalance += netIdr;
  state.cryptoBalances[pos.coin] = Math.max(0, (state.cryptoBalances[pos.coin] || 0) - pos.cryptoAmount);

  const closedTrade = { ...pos, exitPrice: currentPrice, exitTime: Date.now(), exitReason, grossIdr, netIdr, fee: grossIdr * fee, pnl, pnlPct, status: 'closed', duration: Date.now() - pos.openTime };

  state.openPositions.splice(posIdx, 1);
  state.closedTrades.unshift(closedTrade);
  if (state.closedTrades.length > 200) state.closedTrades = state.closedTrades.slice(0, 200);

  state.totalPnl  += pnl;
  state.tradeCount++;
  if (pnl > 0) { state.consecutiveLosses = 0; state.consecutiveWins++; }
  else         { state.consecutiveWins   = 0; state.consecutiveLosses++; }

  state.totalPnlPct = (state.totalPnl / state.startBalance) * 100;
  state.lastUpdate  = Date.now();
  return closedTrade;
}

export function updatePositions(pair, currentPrice) {
  const state   = getDemoState();
  const updated = [];
  for (const pos of state.openPositions) {
    if (pos.pair !== pair) continue;
    pos.highestPrice = Math.max(pos.highestPrice, currentPrice);
    pos.lowestPrice  = Math.min(pos.lowestPrice,  currentPrice);
    if (pos.trailingStop !== undefined) {
      const trailPct   = 0.005;
      pos.trailingStop = pos.highestPrice * (1 - trailPct);
    }
    pos.currentPrice       = currentPrice;
    pos.unrealizedPnl      = (currentPrice - pos.entryPrice) * pos.cryptoAmount;
    pos.unrealizedPnlPct   = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    updated.push(pos);
  }
  state.lastUpdate = Date.now();
  return updated;
}

export function getPortfolioValue(prices = {}) {
  const state           = getDemoState();
  let totalCryptoValue  = 0;
  for (const [coin, amount] of Object.entries(state.cryptoBalances)) {
    const price = prices[`${coin}_idr`] || 0;
    totalCryptoValue += amount * price;
  }
  return { idrBalance: state.idrBalance, cryptoValue: totalCryptoValue, totalValue: state.idrBalance + totalCryptoValue, openPositions: state.openPositions.length };
}
