/**
 * app/api/settings/route.js — Settings (Per-User aware)
 * v5 + Multi-User: resetDemoBalance sekarang per-user
 */
import { NextResponse } from 'next/server';
import { getRiskSettings, updateRiskSettings } from '../../../lib/riskManager.js';
import { verifyToken }   from '../../../lib/auth.js';
import { resetUserState } from '../../../lib/userState.js';

function extractUserId(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  const dec   = verifyToken(token);
  return dec?.id || null;
}

export async function GET(req) {
  const risk      = getRiskSettings();
  const hasApiKey = !!(process.env.INDODAX_API_KEY && process.env.INDODAX_SECRET_KEY);
  return NextResponse.json({
    success: true, risk,
    api: { configured: hasApiKey, keyPreview: hasApiKey ? process.env.INDODAX_API_KEY?.slice(0,6) + '...' : null },
  });
}

export async function POST(req) {
  const userId = extractUserId(req);
  const body   = await req.json().catch(() => ({}));
  const { action, settings } = body;

  if (action === 'updateRisk') {
    const updated = updateRiskSettings(settings);
    return NextResponse.json({ success: true, risk: updated });
  }
  if (action === 'toggleMaxProfitMode') {
    const cur = getRiskSettings();
    const updated = updateRiskSettings({ maxProfitMode: !cur.maxProfitMode, ultraProfitMode: false, ultraLightMode: false });
    return NextResponse.json({ success: true, maxProfitMode: updated.maxProfitMode, risk: updated });
  }
  if (action === 'toggleUltraProfitMode') {
    const cur = getRiskSettings();
    const updated = updateRiskSettings({ ultraProfitMode: !cur.ultraProfitMode, maxProfitMode: false, ultraLightMode: false });
    return NextResponse.json({ success: true, ultraProfitMode: updated.ultraProfitMode, risk: updated });
  }
  if (action === 'toggleUltraLightMode') {
    const cur = getRiskSettings();
    const updated = updateRiskSettings({ ultraLightMode: !cur.ultraLightMode, maxProfitMode: false, ultraProfitMode: false });
    return NextResponse.json({ success: true, ultraLightMode: updated.ultraLightMode, risk: updated });
  }
  if (action === 'toggleScanner') {
    const cur = getRiskSettings();
    const updated = updateRiskSettings({ autoScannerEnabled: !cur.autoScannerEnabled });
    return NextResponse.json({ success: true, autoScannerEnabled: updated.autoScannerEnabled, risk: updated });
  }
  if (action === 'resetDemoBalance') {
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const amount = parseInt(settings?.balance || '100000');
    await resetUserState(userId, amount);
    return NextResponse.json({ success: true, message: `Demo balance reset ke Rp ${amount.toLocaleString('id-ID')}` });
  }
  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
