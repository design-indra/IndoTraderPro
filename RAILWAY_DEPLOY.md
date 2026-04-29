# 🚂 Deploy ke Railway (Recommended untuk Bot 24/7)

## Kenapa Railway?

| | Vercel (Serverless) | Railway (Persistent) |
|--|--|--|
| State bot | ❌ Hilang tiap request | ✅ Tetap di memory |
| Bot 24/7 | ❌ Tidak cocok | ✅ Server selalu hidup |
| Demo balance | ❌ Sering reset | ✅ Persist sampai restart |
| Gratis | ✅ Ya | ✅ Ya (500 jam/bulan) |
| Custom domain | ✅ | ✅ |

---

## Deploy via Termux (HP Android)

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login Railway
```bash
railway login
# Akan minta buka browser — login dengan GitHub
```

### 3. Deploy project
```bash
cd ~/indotrader-final
railway init
# Pilih: Create new project
# Name: indotrader

railway up
# Tunggu build selesai (~3-5 menit)
```

### 4. Set Environment Variables
```bash
# Cara 1: via CLI
railway variables set INDODAX_API_KEY=xxx
railway variables set INDODAX_SECRET_KEY=xxx
railway variables set AUTH_EMAIL=admin@indotrader.app
railway variables set AUTH_PASSWORD=password_kamu
railway variables set DEMO_BALANCE=100000
railway variables set NODE_ENV=production

# Cara 2: via dashboard
# Buka railway.app → project kamu → Variables
# Tambah semua dari .env.example
```

### 5. Set Start Command
```bash
railway variables set RAILWAY_RUN_COMMAND="npm run start"
```

Atau buat file `railway.json` di root:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/bot",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### 6. Lihat URL app
```bash
railway open
# Atau: railway domain
```

---

## Update Setelah Ada Perubahan File

```bash
cd ~/indotrader-final
# Copy file yang berubah, lalu:
railway up
```

---

## Troubleshooting

### Error: Build gagal
```bash
# Cek log
railway logs

# Pastikan package.json ada script start
# "start": "next start"
```

### Error: Out of memory
```bash
# Railway free tier: 512MB RAM
# TensorFlow.js bisa berat — disable Level 4 & 5 kalau perlu
```

### Bot berhenti sendiri
```bash
# Railway restart otomatis jika crash
# Cek di dashboard: Deployments → lihat status
```

---

## Perbandingan Platform Gratis

| Platform | RAM | Storage | 24/7 | Cocok |
|----------|-----|---------|------|-------|
| Railway | 512MB | 1GB | ✅ | ⭐⭐⭐ |
| Render | 512MB | - | ✅ (sleep 15m) | ⭐⭐ |
| Fly.io | 256MB | 1GB | ✅ | ⭐⭐ |
| Vercel | - | - | ❌ serverless | ⭐ |
| Koyeb | 512MB | - | ✅ | ⭐⭐ |

**Railway paling direkomendasikan** untuk bot trading karena persistent dan mudah setup.
