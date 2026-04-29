-- ============================================================
--  IndoTrader Pro — Supabase Database Setup
--  Jalankan di: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabel Users
CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  email                   TEXT UNIQUE NOT NULL,
  password_hash           TEXT NOT NULL,
  role                    TEXT DEFAULT 'user' CHECK (role IN ('user','admin')),
  subscription_status     TEXT DEFAULT 'pending' CHECK (subscription_status IN ('pending','active','inactive')),
  subscription_expires_at TIMESTAMPTZ,
  last_login              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel User States (saldo + posisi per user)
CREATE TABLE IF NOT EXISTS user_states (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 4. RLS (Row Level Security)
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_states ENABLE ROW LEVEL SECURITY;

-- Service role bisa akses semua (dipakai server-side)
CREATE POLICY "service_role_users"       ON users       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_user_states" ON user_states FOR ALL TO service_role USING (true);

-- 5. Buat akun Admin pertama
-- GANTI email dan password_hash sesuai kebutuhan!
-- Hash berikut = SHA256("admin123" + "indotrader-salt-2024")
-- Untuk ganti password, jalankan di Node.js:
-- require('crypto').createHash('sha256').update('PASSWORD' + 'indotrader-salt-2024').digest('hex')
INSERT INTO users (name, email, password_hash, role, subscription_status)
VALUES (
  'Admin',
  'admin@indotrader.app',
  '$2b$12$3SLpSY0mHcdH4T6mX3YaiesInBXyCfsO/YQncTFicWYTsQ3QqmIgi',
  'admin',
  'active'
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- SELESAI. Refresh browser Supabase untuk melihat tabel baru.
-- ============================================================
