/**
 * lib/riskManager.js — Risk Management v5 (UPGRADED)
 *
 * UPGRADE v5:
 * - BUG FIX: Partial TP pnl tidak lagi dihardcode 0.01, sekarang pakai pnlPct aktual
 * - BUG FIX: updateTrailingStop tidak melemahkan trailing setelah partial TP
 * - BUG FIX: Default maxRiskPercent konsisten di seluruh sistem
 * - NEW: Ultra Profit Mode — agresif, size besar, partial TP lebih cepat (+0.7%)
 * - NEW: Ultra Light Profit Mode — konservatif, size kecil, partial TP lebih awal (+0.5%)
 * - FIX: Max Profit Mode sekarang benar-benar ubah behavior (ATR dinamis + compound)
 * - Mode eksklusif: hanya satu mode aktif sekaligus
 *
 * FILOSOFI:
 * Bukan soal berapa besar per trade, tapi soal berapa banyak trade yang menang.
 * Bot yang survive lebih lama akan menghasilkan lebih banyak cuan.
 * Risk 40% dengan win rate 60% lebih menguntungkan dari risk 80% dengan win rate 40%.
 */

let runtimeSettings = {
  maxPositions:         parseInt(process.env.MAX_POSITIONS           || '1'),
  maxRiskPercent:       parseFloat(process.env.MAX_RISK_PERCENT      || '40'),
  stopLossPercent:      parseFloat(process.env.STOP_LOSS_PERCENT     || '1.0'),
  takeProfitPercent:    parseFloat(process.env.TAKE_PROFIT_PERCENT   || '2.5'),
  trailingStopPercent:  parseFloat(process.env.TRAILING_STOP_PERCENT || '0.5'),
  maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES  || '3'),
  targetProfitIDR:      1000000,
  cooldownSeconds:      15,
  reservePercent:       10,
  minTradeIDR:          1000,
  maxRiskAbsolute:      60,
  maxHoldMinutes:       30,   // Time-based exit: paksa keluar setelah N menit nyangkut

  // ── Mode Profit ─────────────────────────────────────────────────────────────
  // CATATAN: Hanya satu mode boleh aktif sekaligus. Saat enable satu, dua lainnya off.
  maxProfitMode:      false, // Dynamic ATR SL/TP + trailing tighter (0.3%) + R:R min 1.5
  ultraProfitMode:    false, // Agresif: risk 70%, partial TP di +0.7%, R:R min 1.0, streak bonus max 1.5x
  ultraLightMode:     false, // Konservatif: risk 20%, partial TP di +0.5%, R:R min 2.0, no compounding

  // ── Fitur Exit Konsisten ─────────────────────────────────────────────────────
  autoScannerEnabled: false, // Auto switch ke pair terbaik setiap scan
  partialTpEnabled:   true,  // 1. Partial Take Profit
  breakevenEnabled:   true,  // 2. Geser SL ke breakeven setelah profit
  smartExitEnabled:   true,  // 3. Keluar awal kalau sinyal berbalik
  timeExitEnabled:    true,  // 4. Paksa keluar setelah maxHoldMinutes
};

export function getRiskSettings()               { return { ...runtimeSettings }; }
export function updateRiskSettings(newSettings) {
  runtimeSettings = { ...runtimeSettings, ...newSettings };
  return runtimeSettings;
}

/**
 * Dapatkan nama mode profit yang sedang aktif.
 * Returns: 'ultra_profit' | 'ultra_light' | 'max_profit' | 'normal'
 */
export function getActiveProfitMode() {
  if (runtimeSettings.ultraProfitMode) return 'ultra_profit';
  if (runtimeSettings.ultraLightMode)  return 'ultra_light';
  if (runtimeSettings.maxProfitMode)   return 'max_profit';
  return 'normal';
}

/**
 * Hitung position size secara dinamis berdasarkan:
 * 1. Saldo saat ini
 * 2. Streak menang/kalah
 * 3. Total PnL (profit reinforcement)
 * 4. Grade sinyal (A+ boleh lebih besar dari C)
 * 5. Mode profit yang aktif
 */
export function calculatePositionSize(totalBalance, openPositionsCount, botState = {}, signalGrade = 'C') {
  const { consecutiveLosses = 0, totalPnl = 0, consecutiveWins = 0 } = botState;
  const s    = runtimeSettings;
  const mode = getActiveProfitMode();

  // Saldo yang boleh dipakai (sisakan reservePercent)
  const reserveAmount   = Math.floor(totalBalance * s.reservePercent / 100);
  const tradableBalance = Math.max(0, totalBalance - reserveAmount);

  if (tradableBalance < s.minTradeIDR) {
    return { idrAmount: 0, riskPercent: 0, reason: 'saldo_tidak_cukup', tradableBalance };
  }

  // ── Base risk berdasarkan streak kalah ────────────────────────────────────
  let baseRisk;
  if (consecutiveLosses >= 3)      baseRisk = 15;
  else if (consecutiveLosses === 2) baseRisk = 22;
  else if (consecutiveLosses === 1) baseRisk = 30;
  else                              baseRisk = s.maxRiskPercent; // Normal: dari setting (default 40%)

  // ── Modifikasi baseRisk berdasarkan mode aktif ────────────────────────────
  let modeRiskMult  = 1.0;
  let hardCap       = s.maxRiskAbsolute; // default 60%

  if (mode === 'ultra_profit') {
    modeRiskMult = 1.6;   // +60% dari baseRisk → approx 64% saat normal
    hardCap      = 85;    // Hard cap lebih tinggi untuk ultra profit
  } else if (mode === 'ultra_light') {
    modeRiskMult = 0.45;  // -55% dari baseRisk → approx 18% saat normal
    hardCap      = 25;    // Hard cap rendah untuk keamanan
  } else if (mode === 'max_profit') {
    modeRiskMult = 1.25;  // +25% dari baseRisk → approx 50% saat normal
    hardCap      = 70;    // Hard cap sedang
  }

  // ── Bonus berdasarkan kualitas sinyal (grade) ─────────────────────────────
  const gradeBonus = {
    'A+': 1.25, 'A': 1.10, 'B': 1.00, 'C': 0.85, 'D': 0.60, 'F': 0.40,
  };
  const gradeMult = gradeBonus[signalGrade] || 1.0;

  // ── Profit compounding bertahap ──────────────────────────────────────────
  let profitMult = 1.0;
  if (mode === 'ultra_light') {
    // Ultra Light: tidak ada compounding, size selalu tetap
    profitMult = 1.0;
  } else {
    if (totalPnl > 500000)       profitMult = 1.15;
    else if (totalPnl > 200000)  profitMult = 1.08;
    else if (totalPnl > 0)       profitMult = 1.03;
    else if (totalPnl < -100000) profitMult = 0.80;
  }

  // ── Streak win bonus ─────────────────────────────────────────────────────
  let winStreakMult = 1.0;
  if (mode === 'ultra_light') {
    // Ultra Light: tidak ada win streak bonus
    winStreakMult = 1.0;
  } else if (mode === 'ultra_profit') {
    // Ultra Profit: streak bonus lebih besar
    if (consecutiveWins >= 5)      winStreakMult = 1.50;
    else if (consecutiveWins >= 3) winStreakMult = 1.30;
    else if (consecutiveWins >= 2) winStreakMult = 1.15;
  } else {
    // Normal / Max Profit
    if (consecutiveWins >= 5)      winStreakMult = 1.20;
    else if (consecutiveWins >= 3) winStreakMult = 1.10;
    else if (consecutiveWins >= 2) winStreakMult = 1.05;
  }

  // ── Final calculation ────────────────────────────────────────────────────
  const effectiveRisk = Math.min(
    baseRisk * modeRiskMult * gradeMult * profitMult * winStreakMult,
    hardCap
  );
  const idrAmount = Math.floor(tradableBalance * effectiveRisk / 100);

  return {
    idrAmount:      Math.max(0, idrAmount),
    riskPercent:    parseFloat(effectiveRisk.toFixed(1)),
    tradableBalance,
    baseRisk,
    gradeMult, profitMult, winStreakMult, modeRiskMult,
    activeMode: mode,
    reason: consecutiveLosses > 0 ? `cautious_${consecutiveLosses}loss` : `grade_${signalGrade}_${mode}`,
  };
}

export function canOpenPosition(openPositionsCount, consecutiveLosses, isPaused) {
  const s = runtimeSettings;
  if (isPaused)                                    return { allowed: false, reason: 'Bot is paused' };
  if (openPositionsCount >= s.maxPositions)        return { allowed: false, reason: `Max ${s.maxPositions} positions` };
  if (consecutiveLosses >= s.maxConsecutiveLosses) return { allowed: false, reason: `Auto-paused: ${consecutiveLosses} losses` };
  return { allowed: true, reason: 'OK' };
}

export function getStopLossPrice(entryPrice, side, atr = null) {
  const pct      = runtimeSettings.stopLossPercent / 100;
  const stopDist = atr ? Math.max(atr * 1.0, entryPrice * pct) : entryPrice * pct;
  return side === 'buy' ? entryPrice - stopDist : entryPrice + stopDist;
}

export function getTakeProfitPrice(entryPrice, side) {
  const pct = runtimeSettings.takeProfitPercent / 100;
  return side === 'buy' ? entryPrice * (1 + pct) : entryPrice * (1 - pct);
}

/**
 * Update trailing stop.
 * BUG FIX v5: Setelah partial TP (tp1Triggered), trailing stop hanya diperketat,
 * tidak pernah dilonggarkan. Ini mencegah trailing yang sudah tightened di-override
 * oleh hitungan ulang highestPrice yang mungkin lebih longgar.
 */
export function updateTrailingStop(position, currentPrice) {
  const s        = runtimeSettings;
  const mode     = getActiveProfitMode();

  // Tentukan trailing percent berdasarkan mode dan kondisi posisi
  let trailPct;
  if (position.tp1Triggered) {
    // Setelah partial TP: gunakan trailing lebih ketat
    if (mode === 'ultra_profit')     trailPct = 0.003; // 0.3% setelah partial TP ultra profit
    else if (mode === 'max_profit')  trailPct = 0.003; // 0.3% setelah partial TP max profit
    else                             trailPct = 0.005; // 0.5% (tightened default)
  } else {
    // Normal trailing sesuai mode
    if (mode === 'max_profit')       trailPct = 0.003; // Max Profit: trailing lebih ketat (0.3%)
    else if (mode === 'ultra_profit')trailPct = 0.004; // Ultra Profit: 0.4%
    else if (mode === 'ultra_light') trailPct = 0.008; // Ultra Light: lebih longgar (0.8%) - biarkan ruang lebih
    else                             trailPct = s.trailingStopPercent / 100;
  }

  const pos = { ...position };
  if (pos.side === 'buy') {
    pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    const newTrailing = pos.highestPrice * (1 - trailPct);
    // BUG FIX: Setelah partial TP, trailing hanya boleh naik (tidak turun)
    if (pos.tp1Triggered && pos.trailingStop) {
      pos.trailingStop = Math.max(pos.trailingStop, newTrailing);
    } else {
      pos.trailingStop = newTrailing;
    }
  } else {
    pos.lowestPrice  = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
    pos.trailingStop = pos.lowestPrice * (1 + trailPct);
  }
  return pos;
}

/**
 * Cek apakah posisi harus ditutup.
 * BUG FIX v5: Partial TP pnl sekarang dihitung dari harga aktual (pnlPct),
 * bukan hardcoded 0.01. Ini memastikan balance update di bot/route.js akurat.
 */
export function checkPositionExit(position, currentPrice) {
  const { entryPrice, side, stopLoss, takeProfit, trailingStop, idrAmount, openTime } = position;
  const priceDiff = side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnlPct    = priceDiff / entryPrice;
  const pnl       = idrAmount * pnlPct;

  const s    = runtimeSettings;
  const mode = getActiveProfitMode();

  // SL / TP / Trailing (cek dulu sebelum fitur lain)
  if (stopLoss)     { const hit = side==='buy'?currentPrice<=stopLoss    :currentPrice>=stopLoss;    if(hit) return {shouldClose:true,reason:'stop_loss',    pnl}; }
  if (takeProfit)   { const hit = side==='buy'?currentPrice>=takeProfit  :currentPrice<=takeProfit;  if(hit) return {shouldClose:true,reason:'take_profit',  pnl}; }
  if (trailingStop) { const hit = side==='buy'?currentPrice<=trailingStop:currentPrice>=trailingStop;if(hit) return {shouldClose:true,reason:'trailing_stop',pnl}; }

  // ── Fitur 1: Partial Take Profit ──────────────────────────────────────────
  // Threshold berbeda per mode:
  //   Ultra Light:  +0.5% (lebih cepat kunci profit)
  //   Ultra Profit: +0.7% (sedikit lebih cepat dari normal)
  //   Max Profit:   +1.0% (sama dengan normal)
  //   Normal:       +1.0%
  if (side === 'buy' && !position.tp1Triggered) {
    const tp1Pct = mode === 'ultra_light'  ? 0.005
                 : mode === 'ultra_profit' ? 0.007
                 : 0.01; // normal & max_profit
    const tp1Price = entryPrice * (1 + tp1Pct);
    if (currentPrice >= tp1Price) {
      // BUG FIX: Hitung pnl dari harga aktual, bukan hardcoded 0.01
      const actualPnlPct = (currentPrice - entryPrice) / entryPrice;
      return {
        shouldClose:   false,
        shouldPartial: true,
        partialPct:    0.5,
        reason:        'partial_tp1',
        pnl:           idrAmount * 0.5 * actualPnlPct, // FIX: pakai harga aktual
      };
    }
  }

  // ── Fitur 2: Breakeven Stop ────────────────────────────────────────────────
  // Threshold breakeven sama dengan threshold partial TP per mode
  const breakevenThreshold = mode === 'ultra_light'  ? 0.005
                           : mode === 'ultra_profit' ? 0.007
                           : 0.01;
  if (side === 'buy' && pnlPct >= breakevenThreshold && !position.breakevenSet) {
    return {
      shouldClose:     false,
      shouldBreakeven: true,
      newStopLoss:     entryPrice * 1.001,
      reason:          'breakeven_set',
      pnl,
    };
  }

  // ── Fitur 4: Time-based Exit ───────────────────────────────────────────────
  // Ultra Light: paksa keluar lebih cepat (15 menit) kalau tidak ada progress
  if (s.timeExitEnabled !== false && openTime) {
    const holdMs     = Date.now() - openTime;
    const holdMinutes = mode === 'ultra_light' ? 15 : (s.maxHoldMinutes || 30);
    const maxHoldMs  = holdMinutes * 60 * 1000;
    // Ultra Light: keluar jika profit < 0.5% setelah hold time
    // Normal/lainnya: keluar jika profit < 0.3%
    const progressThreshold = mode === 'ultra_light' ? 0.005 : 0.003;
    if (holdMs > maxHoldMs && pnlPct < progressThreshold) {
      return { shouldClose: true, reason: 'time_exit', pnl };
    }
    // Hard exit setelah 2 jam, kondisi apapun
    if (holdMs > 120 * 60 * 1000) {
      return { shouldClose: true, reason: 'max_hold_time', pnl };
    }
  }

  return { shouldClose: false, reason: null, pnl };
}

// ── Fitur 3: Smart Signal Exit ────────────────────────────────────────────────
export function checkSignalReversal(position, currentPrice, currentSignal) {
  if (!position || !currentSignal) return { shouldExit: false };

  const { entryPrice, idrAmount, side, openTime } = position;
  const priceDiff = side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnlPct    = priceDiff / entryPrice;
  const pnl       = idrAmount * pnlPct;

  // Minimal sudah pegang 2 menit sebelum smart exit berlaku
  const holdMs = openTime ? Date.now() - openTime : 0;
  if (holdMs < 2 * 60 * 1000) return { shouldExit: false };

  // Kondisi sinyal bearish kuat
  const signalBearish =
    currentSignal.action === 'SELL' ||
    (currentSignal.rsi !== null && currentSignal.rsi > 72) ||
    (currentSignal.candle?.direction === 'bearish' && currentSignal.htfBias?.bias === 'bearish');

  // a) Lagi profit → lock profit sebelum berbalik
  if (pnlPct >= 0.005 && signalBearish) {
    return { shouldExit: true, reason: 'smart_signal_exit', pnl };
  }

  // b) Loss kecil + sinyal sangat bearish → cut lebih awal dari SL
  const smallLoss  = pnlPct <= -0.005 && pnlPct >= -0.01;
  const strongSell = currentSignal.score !== undefined && currentSignal.score < 25;
  if (smallLoss && strongSell) {
    return { shouldExit: true, reason: 'early_loss_cut', pnl };
  }

  return { shouldExit: false };
}

export function calcPnL(position, currentPrice) {
  const { entryPrice, side, idrAmount } = position;
  const diff   = side === 'buy' ? currentPrice-entryPrice : entryPrice-currentPrice;
  const pnlPct = diff / entryPrice;
  return { pnl: idrAmount * pnlPct, pnlPct: pnlPct * 100 };
}

export { runtimeSettings as RISK_DEFAULTS };
