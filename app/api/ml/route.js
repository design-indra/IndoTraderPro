/**
 * app/api/ml/route.js
 * POST /api/ml - trigger training
 * GET  /api/ml - model stats
 */

import { NextResponse } from 'next/server';
import { trainModel, getTrainingDataStats } from '../../../lib/mlModel.js';
import { getRLStats } from '../../../lib/rlEngine.js';

export async function GET() {
  const mlStats = getTrainingDataStats();
  const rlStats = getRLStats();

  return NextResponse.json({
    success: true,
    ml: mlStats,
    rl: rlStats,
  });
}

export async function POST(req) {
  const { action } = await req.json().catch(() => ({}));

  if (action === 'train') {
    try {
      const result = await trainModel();
      return NextResponse.json({ success: true, result });
    } catch (err) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
