# IndoTrader Pro v4 — Deploy Guide

## 1. Setup Supabase
1. Buat project baru di https://supabase.com
2. Masuk ke SQL Editor
3. Paste isi file `USER_STATES_SETUP.sql` dan klik Run
4. Catat: Project URL, anon key, dan service_role key

## 2. Deploy ke Railway
1. Push project ke GitHub
2. Login Railway → New Project → Deploy from GitHub
3. Tambah Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://xxx.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJ...
   - `SUPABASE_SERVICE_ROLE_KEY` = eyJ...
   - `JWT_SECRET` = random-string-minimal-32-karakter
   - `DEMO_BALANCE` = 100000
   - `MAX_POSITIONS` = 1
   - `MAX_RISK_PERCENT` = 40
   - `STOP_LOSS_PERCENT` = 1.0
   - `TAKE_PROFIT_PERCENT` = 2.5
   - `TRAILING_STOP_PERCENT` = 0.5
   - `MAX_CONSECUTIVE_LOSSES` = 3

## 3. Login Admin Pertama
- Email: admin@indotrader.app
- Password: admin123
- SEGERA ganti password setelah login pertama!

## 4. Aktivasi User Baru
1. Login sebagai admin
2. Klik tombol 👑 Admin di pojok kanan atas
3. User yang baru daftar akan muncul dengan status "Pending"
4. Klik "Aktifkan 30hr" untuk memberi akses 30 hari
