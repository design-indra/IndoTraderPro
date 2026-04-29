/**
 * lib/mlModel.js
 * Level 4 — Machine Learning: LSTM with TensorFlow.js
 * Predicts probability of price going up/down
 */

// TF.js is loaded lazily to avoid SSR issues
let tf = null;
let model = null;
let modelReady = false;
let trainingData = { features: [], labels: [] };
const SEQUENCE_LEN = 10;
const FEATURE_DIM = 6;

async function loadTF() {
  if (!tf) {
    try {
      tf = await import('@tensorflow/tfjs');
    } catch {
      console.warn('TensorFlow.js not available');
      return false;
    }
  }
  return true;
}

/**
 * Build LSTM model architecture
 */
async function buildModel() {
  if (!await loadTF()) return null;

  const m = tf.sequential();

  m.add(tf.layers.lstm({
    units: 64,
    inputShape: [SEQUENCE_LEN, FEATURE_DIM],
    returnSequences: false,
    dropout: 0.2,
    recurrentDropout: 0.1,
  }));

  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  m.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  return m;
}

/**
 * Initialize the model (load saved or create new)
 */
export async function initModel() {
  if (modelReady) return true;

  try {
    model = await buildModel();
    if (model) {
      modelReady = true;
      console.log('[ML] LSTM model initialized');
      return true;
    }
  } catch (err) {
    console.error('[ML] Model init failed:', err);
  }
  return false;
}

/**
 * Add training sample
 * @param {number[]} features - Feature vector [rsi, ema_diff, macd, vol, bb, pct_change]
 * @param {number} label - 1 if price went up, 0 if down
 */
export function addTrainingSample(features, label) {
  trainingData.features.push(features);
  trainingData.labels.push(label);

  // Keep rolling window
  if (trainingData.features.length > 5000) {
    trainingData.features = trainingData.features.slice(-5000);
    trainingData.labels = trainingData.labels.slice(-5000);
  }
}

/**
 * Train model with accumulated data
 * @returns {{ loss: number, accuracy: number } | null}
 */
export async function trainModel() {
  if (!modelReady || !tf) {
    await initModel();
  }

  const { features, labels } = trainingData;

  if (features.length < SEQUENCE_LEN + 10) {
    return { error: 'Not enough training data', samples: features.length };
  }

  // Build sequences
  const X = [];
  const Y = [];

  for (let i = SEQUENCE_LEN; i < features.length; i++) {
    X.push(features.slice(i - SEQUENCE_LEN, i));
    Y.push([labels[i]]);
  }

  const xTensor = tf.tensor3d(X, [X.length, SEQUENCE_LEN, FEATURE_DIM]);
  const yTensor = tf.tensor2d(Y, [Y.length, 1]);

  let result = null;

  try {
    const history = await model.fit(xTensor, yTensor, {
      epochs: 10,
      batchSize: 32,
      validationSplit: 0.1,
      shuffle: true,
      verbose: 0,
    });

    const lastEpoch = history.history;
    result = {
      loss: lastEpoch.loss[lastEpoch.loss.length - 1],
      accuracy: lastEpoch.acc?.[lastEpoch.acc.length - 1] || 0,
      samples: X.length,
    };
  } catch (err) {
    result = { error: err.message };
  } finally {
    xTensor.dispose();
    yTensor.dispose();
  }

  return result;
}

/**
 * Predict probability of price going up
 * @param {number[][]} recentFeatures - Last SEQUENCE_LEN feature vectors
 * @returns {number | null} Probability 0–1
 */
export async function predict(recentFeatures) {
  if (!modelReady || !model) {
    // Return random-ish guess if model not ready
    return 0.5 + (Math.random() - 0.5) * 0.2;
  }

  if (recentFeatures.length < SEQUENCE_LEN) return null;

  const seq = recentFeatures.slice(-SEQUENCE_LEN);

  let prob = null;
  const xTensor = tf.tensor3d([seq], [1, SEQUENCE_LEN, FEATURE_DIM]);

  try {
    const output = model.predict(xTensor);
    const data = await output.data();
    prob = data[0];
    output.dispose();
  } catch (err) {
    console.error('[ML] Prediction error:', err);
  } finally {
    xTensor.dispose();
  }

  return prob;
}

/**
 * Get ML-based trading signal
 * @param {number[][]} featureHistory
 * @returns {{ action: string, probability: number, confidence: string }}
 */
export async function getMLSignal(featureHistory) {
  const prob = await predict(featureHistory);

  if (prob === null) return { action: 'HOLD', probability: 0.5, confidence: 'low' };

  let action = 'HOLD';
  let confidence = 'medium';

  if (prob > 0.72) { action = 'BUY'; confidence = prob > 0.85 ? 'high' : 'medium'; }
  else if (prob < 0.28) { action = 'SELL'; confidence = prob < 0.15 ? 'high' : 'medium'; }

  return { action, probability: prob, confidence };
}

/**
 * Backtesting: simulate ML signals on historical data
 * @param {Array<{ features: number[], close: number }>} historicalData
 */
export async function backtest(historicalData) {
  const results = [];
  let balance = 10_000_000;
  let position = null;
  const featureHistory = [];

  for (let i = 0; i < historicalData.length; i++) {
    const { features, close } = historicalData[i];
    featureHistory.push(features);

    if (featureHistory.length < SEQUENCE_LEN) continue;

    const { action, probability } = await getMLSignal(featureHistory);

    if (!position && action === 'BUY') {
      position = { entryPrice: close, entryBalance: balance };
    } else if (position && action === 'SELL') {
      const pnl = (close - position.entryPrice) / position.entryPrice;
      balance = balance * (1 + pnl * 0.15); // 15% of balance per trade
      results.push({
        entry: position.entryPrice,
        exit: close,
        pnl,
        balance,
        probability,
      });
      position = null;
    }
  }

  const wins = results.filter((r) => r.pnl > 0).length;
  return {
    trades: results.length,
    wins,
    losses: results.length - wins,
    winRate: results.length > 0 ? (wins / results.length) * 100 : 0,
    finalBalance: balance,
    return: ((balance - 10_000_000) / 10_000_000) * 100,
  };
}

export function getTrainingDataStats() {
  return {
    samples: trainingData.features.length,
    ready: trainingData.features.length >= SEQUENCE_LEN + 10,
    modelReady,
  };
}
