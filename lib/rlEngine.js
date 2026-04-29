/**
 * lib/rlEngine.js
 * Level 5 — Reinforcement Learning: DQN (Deep Q-Network)
 * Agent learns BUY / SELL / HOLD by maximizing cumulative profit reward
 */

let tf = null;

// ─── Hyperparameters ──────────────────────────────────────────────────────
const CONFIG = {
  stateDim: 8,       // input features per state
  actions: ['HOLD', 'BUY', 'SELL'], // 0=HOLD, 1=BUY, 2=SELL
  gamma: 0.95,       // discount factor
  epsilon: 1.0,      // exploration rate (starts high, decays)
  epsilonMin: 0.05,
  epsilonDecay: 0.995,
  learningRate: 0.001,
  batchSize: 32,
  memorySize: 10000,
  updateTargetEvery: 100, // update target network
};

let qNetwork = null;
let targetNetwork = null;
let memory = [];         // replay buffer
let stepCount = 0;
let epsilon = CONFIG.epsilon;
let rlReady = false;

async function loadTF() {
  if (!tf) {
    try {
      tf = await import('@tensorflow/tfjs');
    } catch {
      return false;
    }
  }
  return true;
}

function buildQNetwork() {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [CONFIG.stateDim] }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  m.add(tf.layers.dense({ units: CONFIG.actions.length, activation: 'linear' }));
  m.compile({ optimizer: tf.train.adam(CONFIG.learningRate), loss: 'meanSquaredError' });
  return m;
}

/**
 * Initialize RL agent
 */
export async function initRL() {
  if (rlReady) return true;
  if (!await loadTF()) return false;

  qNetwork = buildQNetwork();
  targetNetwork = buildQNetwork();
  copyWeights(qNetwork, targetNetwork);
  rlReady = true;
  console.log('[RL] DQN agent initialized');
  return true;
}

function copyWeights(from, to) {
  try {
    const weights = from.getWeights();
    to.setWeights(weights.map((w) => w.clone()));
  } catch (e) {
    console.error('[RL] Weight copy error:', e);
  }
}

/**
 * Build state vector from market data
 * @param {object} data - { rsi, ema_diff, macd_hist, volume_ratio, bb_pos, price_change, position_pnl, has_position }
 */
export function buildState(data) {
  return [
    (data.rsi || 50) / 100,
    Math.tanh((data.ema_diff || 0) * 100),
    Math.tanh((data.macd_hist || 0) * 1000),
    Math.tanh(data.volume_ratio || 0),
    data.bb_pos || 0.5,
    Math.tanh((data.price_change || 0) * 100),
    data.position_pnl || 0,
    data.has_position ? 1 : 0,
  ];
}

/**
 * Choose action using epsilon-greedy policy
 * @param {number[]} state
 * @returns {number} action index (0=HOLD, 1=BUY, 2=SELL)
 */
export async function chooseAction(state) {
  if (!rlReady || !qNetwork) {
    return 0; // default HOLD
  }

  // Epsilon-greedy: explore vs exploit
  if (Math.random() < epsilon) {
    return Math.floor(Math.random() * CONFIG.actions.length);
  }

  const stateTensor = tf.tensor2d([state], [1, CONFIG.stateDim]);
  try {
    const qValues = qNetwork.predict(stateTensor);
    const data = await qValues.data();
    qValues.dispose();
    return data.indexOf(Math.max(...data));
  } finally {
    stateTensor.dispose();
  }
}

/**
 * Store experience in replay buffer
 */
export function remember(state, action, reward, nextState, done) {
  memory.push({ state, action, reward, nextState, done });
  if (memory.length > CONFIG.memorySize) memory.shift();
}

/**
 * Compute reward for an action
 * @param {{ action, pnlPct, hasPosition, prevPnlPct }} context
 */
export function computeReward({ action, pnlPct = 0, prevPnlPct = 0, hasPosition }) {
  const actionName = CONFIG.actions[action];
  let reward = 0;

  if (actionName === 'BUY' && !hasPosition) {
    reward = 0.1; // small reward for taking action
  } else if (actionName === 'SELL' && hasPosition) {
    reward = pnlPct * 100; // reward = profit%
    if (pnlPct > 0) reward += 1; // bonus for profit
    if (pnlPct < -0.005) reward -= 2; // penalty for loss
  } else if (actionName === 'HOLD' && hasPosition) {
    reward = (pnlPct - prevPnlPct) * 50; // reward trend
  } else if (actionName === 'BUY' && hasPosition) {
    reward = -0.5; // penalty for invalid action
  } else if (actionName === 'SELL' && !hasPosition) {
    reward = -0.5;
  } else {
    reward = -0.01; // small penalty for doing nothing
  }

  return Math.max(-10, Math.min(10, reward));
}

/**
 * Train on a mini-batch from replay buffer (Experience Replay)
 */
export async function trainStep() {
  if (!rlReady || memory.length < CONFIG.batchSize) return null;

  // Sample random mini-batch
  const batch = [];
  for (let i = 0; i < CONFIG.batchSize; i++) {
    const idx = Math.floor(Math.random() * memory.length);
    batch.push(memory[idx]);
  }

  const states = batch.map((e) => e.state);
  const nextStates = batch.map((e) => e.nextState);

  const statesTensor = tf.tensor2d(states, [CONFIG.batchSize, CONFIG.stateDim]);
  const nextStatesTensor = tf.tensor2d(nextStates, [CONFIG.batchSize, CONFIG.stateDim]);

  let loss = null;

  try {
    const currentQ = qNetwork.predict(statesTensor);
    const nextQ = targetNetwork.predict(nextStatesTensor);

    const currentQData = await currentQ.data();
    const nextQData = await nextQ.data();

    const targets = [...currentQData];

    for (let i = 0; i < CONFIG.batchSize; i++) {
      const { action, reward, done } = batch[i];
      const offset = i * CONFIG.actions.length;
      const maxNextQ = Math.max(
        ...Array.from(nextQData.slice(offset, offset + CONFIG.actions.length))
      );
      targets[offset + action] = done
        ? reward
        : reward + CONFIG.gamma * maxNextQ;
    }

    const targetTensor = tf.tensor2d(targets, [CONFIG.batchSize, CONFIG.actions.length]);
    const history = await qNetwork.fit(statesTensor, targetTensor, {
      epochs: 1,
      verbose: 0,
    });

    loss = history.history.loss[0];
    targetTensor.dispose();
    currentQ.dispose();
    nextQ.dispose();
  } finally {
    statesTensor.dispose();
    nextStatesTensor.dispose();
  }

  // Decay epsilon
  if (epsilon > CONFIG.epsilonMin) {
    epsilon *= CONFIG.epsilonDecay;
  }

  // Update target network periodically
  stepCount++;
  if (stepCount % CONFIG.updateTargetEvery === 0) {
    copyWeights(qNetwork, targetNetwork);
    console.log('[RL] Target network updated');
  }

  return loss;
}

/**
 * Get RL-based trading signal
 * @param {object} marketData
 * @param {boolean} hasPosition
 * @param {number} positionPnlPct
 */
export async function getRLSignal(marketData, hasPosition = false, positionPnlPct = 0) {
  if (!rlReady) {
    await initRL();
  }

  const state = buildState({
    ...marketData,
    has_position: hasPosition,
    position_pnl: positionPnlPct,
  });

  const actionIdx = await chooseAction(state);
  const action = CONFIG.actions[actionIdx];

  return {
    action,
    actionIdx,
    state,
    epsilon: parseFloat(epsilon.toFixed(4)),
    memorySize: memory.length,
    exploiting: Math.random() >= epsilon,
  };
}

export function getRLStats() {
  return {
    ready: rlReady,
    epsilon: parseFloat(epsilon.toFixed(4)),
    memorySize: memory.length,
    steps: stepCount,
    explorationRate: `${(epsilon * 100).toFixed(1)}%`,
  };
}
