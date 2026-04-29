# ⚡ IndoTrader v3.0 — Auto Crypto Scalping Bot

Bot trading crypto scalping untuk Indodax dengan **AI 5-Level** + **Auto Pair Scanner** + **Max Profit Mode**.

---

## 🚀 Deploy Cepat (Railway — Recommended)

> **Kenapa Railway, bukan Vercel?**
> Vercel bersifat serverless — state bot hilang setiap request ke instance berbeda.
> Railway menjalankan server persisten (selalu hidup), cocok untuk bot trading 24/7.

### Deploy ke Railway (GRATIS, persistent)

```bash
# 1. Buat akun di railway.app (gratis, pakai GitHub)
# 2. Di Termux:
npm install -g @railway/cli
railway login

# 3. Masuk folder project
cd indotrader-final

# 4. Init & deploy
railway init
railway up

# 5. Set environment variables di Railway dashboard:
#    railway.app → project → Variables → tambah semua dari .env.example
```

### Atau deploy ke Vercel (serverless, gratis)

```bash
npm install -g vercel
vercel login
cd indotrader-final
vercel --prod
# Set env vars di vercel.com → Settings → Environment Variables
```

---

## 📱 Termux Setup (HP Android)

```bash
# 1. Copy setup.sh + ZIP ke HP, lalu:
bash setup.sh

# 2. Edit .env.local
nano .env.local

# 3. Deploy
vercel login
vercel --prod
```

---

## 📁 Struktur Project

```
indotrader/
├── app/
│   ├── api/
│   │   ├── bot/route.js        ← Engine bot
│   │   ├── market/route.js     ← Data market
│   │   ├── scanner/route.js    ← Auto pair scanner ← BARU
│   │   ├── settings/route.js   ← Risk settings
│   │   ├── balance/route.js    ← Saldo
│   │   ├── auth/route.js       ← Login
│   │   └── trade/route.js      ← Manual trade
│   ├── page.jsx                ← Entry point (auth + scanner)
│   ├── layout.jsx              ← PWA meta tags
│   └── globals.css
│
├── components/
│   ├── Dashboard.jsx           ← UI utama (5 tab)
│   ├── CandleChart.jsx         ← Chart TradingView
│   ├── LoginScreen.jsx         ← Halaman login
│   └── PositionCard.jsx        ← StatCard, SignalPanel, dll
│
├── lib/
│   ├── autoScanner.js          ← Auto Pair Scanner ← BARU
│   ├── indicators.js           ← RSI, EMA, MACD, ATR, dll (v4)
│   ├── tradingEngine.js        ← Strategy engine (v4)
│   ├── riskManager.js          ← Risk + MaxProfitMode
│   ├── demoStore.js            ← Demo balance state
│   ├── indodax.js              ← Indodax API client
│   ├── mlModel.js              ← ML Level 4
│   └── rlEngine.js             ← RL Level 5
│
├── public/                     ← PWA icons + manifest
├── .env.example                ← Template env vars
├── setup.sh                    ← Termux setup script
└── package.json
```

---

## ⚙️ Environment Variables

```env
# Indodax API (wajib untuk Live Mode)
INDODAX_API_KEY=your_key
INDODAX_SECRET_KEY=your_secret

# Auth login
AUTH_EMAIL=admin@indotrader.app
AUTH_PASSWORD=indotrader123

# Demo balance awal
DEMO_BALANCE=100000

# Risk
MAX_RISK_PERCENT=40
STOP_LOSS_PERCENT=1.0
TAKE_PROFIT_PERCENT=2.5
MAX_CONSECUTIVE_LOSSES=3
```

---

## 🎯 Strategy Level

| Level | Nama | Fokus |
|-------|------|-------|
| L1 | Scalper | RSI7 + EMA Ribbon — **Buy Low Sell High** cepat |
| L2 | Smart Adaptive | + MTF confirmation + session filter |
| L3 | AI Scoring | Multi-indicator weighted score |
| L4 | ML Model | LSTM predict naik/turun |
| L5 | RL Agent | DQN belajar dari experience |

---

## 🔍 Fitur Baru v3.0

### Auto Pair Scanner
- Scan 6 pair: BTC, ETH, SOL, DOGE, XRP, TRX
- Score berdasarkan: volatility, momentum (RSI), volume, trend, MACD, perubahan 24h
- Update otomatis setiap 4 menit
- Toggle di tab Settings

### Max Profit Mode
- Dynamic ATR SL/TP — menyesuaikan volatilitas pasar
- Auto Compound — size naik bertahap saat win streak 3+
- Entry hanya di zona support/oversold (buy low sell high)
- Toggle di tab Settings

---

## ⚠️ Disclaimer

Bot ini adalah alat bantu, bukan jaminan profit. Selalu test di Demo Mode dulu.

---

## 🔐 Keamanan

- API Key hanya di server (Next.js API routes)
- Auth dengan session cookie httpOnly
- `.env.local` tidak pernah di-commit ke Git
