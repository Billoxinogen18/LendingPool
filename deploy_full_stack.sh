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
set -e

export UNDICI_HEADERS_TIMEOUT=60000

# --- Configuration ---
ENV_FILE=".env"
NETWORK="${TARGET_NETWORK:-sepolia}"
PROJECT_NAME="lending-pool-contracts"

# --- Helper Functions ---
print() {
    echo "-----> $1"
}

# --- Script Start ---
print "Starting full-stack deployment for $PROJECT_NAME on $NETWORK..."

# Step 1: Generate a new deployer wallet if .env doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  print "No .env file found. Generating a new deployer wallet..."
  DEPLOY_KEY=$(npx hardhat-template --new-wallet)

  # Use pre-set env values if present, otherwise leave placeholders for the user to fill
  # Default Infura credentials (user-provided)
  INFURA_ID_PLACEHOLDER="${INFURA_PROJECT_ID:-9cfba16e9f16482f97687dca627cb64c}"
  INFURA_SECRET_PLACEHOLDER="${INFURA_PROJECT_SECRET:-bPBOH9VcVTog8WTfz3hok8lseYYlTdX4Mgovx8fOeejR0cz32OqXcQ}"

  # Create .env file
  cat > "$ENV_FILE" <<EOF
DEPLOYER_PRIVATE_KEY=$DEPLOY_KEY
INFURA_PROJECT_ID=$INFURA_ID_PLACEHOLDER
INFURA_PROJECT_SECRET=$INFURA_SECRET_PLACEHOLDER

# Optional: Override default RPC; Hardhat will auto-construct Infura URL if left blank
# Example: SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/$INFURA_PROJECT_ID
# SEPOLIA_RPC_URL=

EOF
  print "New wallet & Infura placeholders saved to .env – fund wallet and add Infura IDs before deploying."
fi

# Load environment variables
source "$ENV_FILE"

# Ensure private key is set
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    print "No DEPLOYER_PRIVATE_KEY found – generating one now..."
    NEW_KEY=$(npx hardhat-wallet-generator 2>/dev/null | grep 'Private Key:' | awk '{print $3}')
    if [ -z "$NEW_KEY" ]; then
        # fallback to openssl random if generator not available
        NEW_KEY=$(openssl rand -hex 32)
    fi
    DEPLOYER_PRIVATE_KEY=$NEW_KEY
    echo "DEPLOYER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY" >> "$ENV_FILE"
    print "New deployer key appended to .env. Fund it before mainnet deployment." 
fi

# Step 2: Install dependencies
print "Ensuring npm dependencies..."
npm install

# Step 3: Compile contracts
print "Compiling contracts..."
npm run compile

# Step 4: Deploy to the specified network
print "Deploying to $NETWORK... (this may take ~30s)"
DEPLOY_OUTPUT=$(npm run deploy -- --network "$NETWORK")

# Extract the *last* 0x-prefixed 40-byte address printed by Hardhat – works regardless of wording.
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -Eo "0x[a-fA-F0-9]{40}" | tail -n 1)

if [ -z "$CONTRACT_ADDRESS" ]; then
    print "Error: Failed to get contract address from deployment output."
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

print "Deployment successful. Contract Address: $CONTRACT_ADDRESS"

# Step 5: Update Vercel environment variable
# Use a more generic variable name for easier reuse
VERCEL_ENV_VAR="NEXT_PUBLIC_CONTRACT_ADDRESS"

# Prepare optional token flag
if [ -n "$VERCEL_TOKEN" ]; then
  VC_FLAG="-t $VERCEL_TOKEN"
else
  VC_FLAG=""
fi

print "Updating Vercel environment variables..."
# Push contract address
vercel env rm "$VERCEL_ENV_VAR" production --yes $VC_FLAG || true
echo "$CONTRACT_ADDRESS" | vercel env add "$VERCEL_ENV_VAR" production $VC_FLAG

# Also push the chain id that the frontend should connect to
if [ "$NETWORK" == "sepolia" ]; then
  CHAIN_ID_VAR=11155111
elif [ "$NETWORK" == "mainnet" ]; then
  CHAIN_ID_VAR=1
elif [ "$NETWORK" == "bscTestnet" ]; then
  CHAIN_ID_VAR=97
else
  CHAIN_ID_VAR=56
fi

vercel env rm "NEXT_PUBLIC_CHAIN_ID" production --yes $VC_FLAG || true
echo "$CHAIN_ID_VAR" | vercel env add "NEXT_PUBLIC_CHAIN_ID" production $VC_FLAG

print "Vercel environment updated."

# Step 6: Trigger a new Vercel deployment
print "Triggering new Vercel deployment..."
vercel --prod $VC_FLAG

print "All done! Your application is deploying on Vercel with the new contract."
print "View deployment status: https://vercel.com/$VERCEL_USER/$VERCEL_PROJECT_NAME" 