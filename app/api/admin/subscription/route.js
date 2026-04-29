/**
 * app/api/admin/subscription/route.js — Admin: Kelola Subscription User
 * Hanya bisa diakses oleh role admin
 */
import { NextResponse } from 'next/server';
import { supabase }     from '../../../../lib/supabase.js';
import { verifyToken }  from '../../../../lib/auth.js';

function extractUser(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  return verifyToken(token);
}

// GET /api/admin/subscription — list semua user
export async function GET(req) {
  const user = extractUser(req);
  if (!user || user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role, subscription_status, subscription_expires_at, created_at, last_login')
    .order('created_at', { ascending: false });

  if (error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, users });
}

// POST /api/admin/subscription — aktivasi / nonaktif / perpanjang
export async function POST(req) {
  const user = extractUser(req);
  if (!user || user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const { action, userId, days = 30 } = await req.json().catch(() => ({}));

  if (!userId)
    return NextResponse.json({ success: false, error: 'userId wajib diisi' }, { status: 400 });

  let update = {};

  if (action === 'activate') {
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    update = { subscription_status: 'active', subscription_expires_at: expiresAt };
  } else if (action === 'deactivate') {
    update = { subscription_status: 'inactive' };
  } else if (action === 'extend') {
    const { data: u } = await supabase.from('users').select('subscription_expires_at').eq('id', userId).single();
    const base = u?.subscription_expires_at && new Date(u.subscription_expires_at) > new Date()
      ? new Date(u.subscription_expires_at)
      : new Date();
    const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    update = { subscription_status: 'active', subscription_expires_at: expiresAt };
  } else if (action === 'delete') {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: 'User dihapus' });
  } else if (action === 'make_admin') {
    update = { role: 'admin' };
  } else {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  }

  const { data, error } = await supabase.from('users').update(update).eq('id', userId).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: data });
}
