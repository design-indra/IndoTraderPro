/**
 * app/api/register/route.js — User Registration
 */
import { NextResponse } from 'next/server';
import { supabase }     from '../../../lib/supabase.js';
import { hashPassword } from '../../../lib/auth.js';

export async function POST(req) {
  const { name, email, password } = await req.json().catch(() => ({}));
  if (!name || !email || !password)
    return NextResponse.json({ success: false, error: 'Semua field wajib diisi' }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ success: false, error: 'Password minimal 6 karakter' }, { status: 400 });

  const emailLower = email.toLowerCase().trim();
  const { data: existing } = await supabase.from('users').select('id').eq('email', emailLower).single();
  if (existing)
    return NextResponse.json({ success: false, error: 'Email sudah terdaftar' }, { status: 409 });

  const { data: newUser, error } = await supabase.from('users')
    .insert({ name: name.trim(), email: emailLower, password_hash: hashPassword(password),
      role: 'user', subscription_status: 'pending', created_at: new Date().toISOString() })
    .select('id, email, name, role, subscription_status').single();

  if (error)
    return NextResponse.json({ success: false, error: 'Gagal buat akun: ' + error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: 'Akun dibuat! Menunggu aktivasi admin.', user: newUser });
}
