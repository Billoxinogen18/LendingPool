#!/bin/bash
# ==============================================================================
# LendingPool Full-Stack Deployment Automation Script (v5 – Zero Touch)
# ==============================================================================
# This script sets up Hardhat, compiles & deploys the LendingPool contract, and
# wires the resulting address into the Next.js frontend.  It is **idempotent** –
# running it twice will never destroy existing work.
#
#  • Generates a new wallet if DEPLOYER_PRIVATE_KEY is not present in .env
#  • Makes sure @openzeppelin + hardhat deps are installed
#  • Compiles contracts (hardhat)  ➜  artifacts/
#  • Deploys `LendingPoolTest` via `hardhat run` to BSC Testnet (default) or
#    Mainnet (pass `--mainnet`)
#  • Writes NEXT_PUBLIC_LENDING_POOL_ADDRESS to .env.local for the frontend
#  • Prints final next / vercel build-&-deploy hints
#
# Usage:
#   ./deploy_full_stack.sh [--mainnet]
# ==============================================================================
set -euo pipefail

# --- 0. Constants --------------------------------------------------------------
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$SCRIPT_DIR"   # root of repo (script lives in repo root)
CONTRACT_SRC="${PROJECT_DIR}/contracts/LendingPoolTest.sol"
ENV_FILE="${PROJECT_DIR}/.env"
ENV_LOCAL_FILE="${PROJECT_DIR}/.env.local"
USE_MAINNET=false

# --- 1. CLI args --------------------------------------------------------------
if [[ ${1:-""} == "--mainnet" ]]; then
  USE_MAINNET=true
fi

# --- 2. Helpers ---------------------------------------------------------------
print()  { printf "\033[0;32m%s\033[0m\n" "$1"; }
warn()   { printf "\033[1;33m%s\033[0m\n" "$1"; }
err()    { printf "\033[0;31m%s\033[0m\n" "$1"; }

# --- 3. Ensure contract exists ----------------------------------------------
if [[ ! -f "$CONTRACT_SRC" ]]; then
  err "Contract $CONTRACT_SRC not found. Aborting."; exit 1; fi

# --- 4. Ensure .env / wallet --------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  warn "No .env found – generating a fresh deployer wallet …"
  npx --yes hardhat create-wallet > .tmp_wallet.txt 2>/dev/null || true
  DEPLOY_KEY=$(grep -m1 "Private Key:" .tmp_wallet.txt | awk '{print $3}')
  rm -f .tmp_wallet.txt
  if [[ -z "$DEPLOY_KEY" ]]; then err "Could not generate wallet"; exit 1; fi
  cat > "$ENV_FILE" <<EOF
DEPLOYER_PRIVATE_KEY=$DEPLOY_KEY
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
EOF
  print "New wallet saved to .env – **fund it with test BNB** before continuing."
fi

source "$ENV_FILE"
if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then err "DEPLOYER_PRIVATE_KEY missing in .env"; exit 1; fi

# --- 5. Install deps (once) ---------------------------------------------------
print "Ensuring npm dependencies …"
if ! grep -q "hardhat" "$PROJECT_DIR/package.json"; then
  warn "Hardhat deps missing – installing …";
  npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv >/dev/null
fi

# --- 6. Compile ---------------------------------------------------------------
print "Compiling contracts …"
npm run compile >/dev/null

# --- 7. Deploy ---------------------------------------------------------------
NETWORK="bsctest"
$USE_MAINNET && NETWORK="bsc"
print "Deploying to $NETWORK … (this may take ~30s)"
DEPLOY_OUT=$(npm run -s deploy:$NETWORK 2>&1)
ADDR=$(echo "$DEPLOY_OUT" | grep -Eo "0x[a-fA-F0-9]{40}" | tail -1)
if [[ -z "$ADDR" ]]; then err "Deploy failed: $DEPLOY_OUT"; exit 1; fi
print "Contract deployed @ $ADDR"

# --- 8. Wire address into frontend -------------------------------------------
print "Updating $ENV_LOCAL_FILE …"
grep -v "NEXT_PUBLIC_LENDING_POOL_ADDRESS" "$ENV_LOCAL_FILE" 2>/dev/null || true > "$ENV_LOCAL_FILE.tmp" || true
echo "NEXT_PUBLIC_LENDING_POOL_ADDRESS=$ADDR" >> "$ENV_LOCAL_FILE.tmp"
mv "$ENV_LOCAL_FILE.tmp" "$ENV_LOCAL_FILE"

# --- 9. Final instructions ----------------------------------------------------
print "All set!  You can now push & deploy the Next.js app:";
cat <<EOF

   1.   npm run build        # optional local test
   2.   vercel --prod        # deploy to production

EOF 