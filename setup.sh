#!/data/data/com.termux/files/usr/bin/bash
# ════════════════════════════════════════════════════
#   IndoTrader v3.0 — Termux Setup Script
#   Jalankan: bash setup.sh
# ════════════════════════════════════════════════════

set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo ""
  echo -e "${BLUE}${BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║        IndoTrader v3.0               ║"
  echo "  ║   Auto Crypto Scalping · Indodax     ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
}

step() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }

banner

step "Update Termux packages..."
pkg update -y && pkg upgrade -y
ok "Termux updated"

step "Install Node.js, git, curl, unzip..."
pkg install -y nodejs git curl unzip zip
ok "Dependencies installed"
echo -e "  Node: $(node -v)  |  NPM: $(npm -v)"

step "Install Vercel CLI globally..."
npm install -g vercel 2>/dev/null && ok "Vercel CLI installed" || warn "Install manual: npm i -g vercel"

step "Cek file ZIP project..."
ZIP_FILE=$(ls indotrader*.zip 2>/dev/null | head -1)
if [ -n "$ZIP_FILE" ]; then
  unzip -o "$ZIP_FILE"
  PROJ_DIR=$(unzip -l "$ZIP_FILE" | awk 'NR==4{print $4}' | cut -d'/' -f1)
  ok "Project diekstrak: $PROJ_DIR"
  cd "$PROJ_DIR"
else
  warn "ZIP tidak ditemukan — pastikan indotrader*.zip ada di folder ini"
  exit 1
fi

step "Setup .env..."
if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  ok ".env.local dibuat"
  echo -e "  ${YELLOW}⚡ Edit .env.local: nano .env.local${NC}"
else
  ok ".env.local sudah ada"
fi

step "Install npm packages..."
npm install
ok "npm packages terinstall"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗"
echo -e "║  ✅  Setup selesai! Langkah selanjutnya:     ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  1. Edit .env.local:   ${CYAN}nano .env.local${NC}"
echo -e "  2. Login Vercel:      ${CYAN}vercel login${NC}"
echo -e "  3. Deploy:            ${CYAN}vercel --prod${NC}"
echo -e "  4. Dev lokal:         ${CYAN}npm run dev${NC}"
echo ""
