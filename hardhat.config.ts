import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

// ---------------------------------------------------------------------------
// Infura configuration helper – avoids reliance on public RPC gateways
// ---------------------------------------------------------------------------
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID || "";
const INFURA_PROJECT_SECRET = process.env.INFURA_PROJECT_SECRET || "";

// Build an Infura URL with optional basic-auth if a project secret is supplied
const buildInfuraUrl = (network: string): string => {
  if (!INFURA_PROJECT_ID) return "";
  if (INFURA_PROJECT_SECRET) {
    return `https://${INFURA_PROJECT_ID}:${INFURA_PROJECT_SECRET}@${network}.infura.io/v3/${INFURA_PROJECT_ID}`;
  }
  return `https://${network}.infura.io/v3/${INFURA_PROJECT_ID}`;
};

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56,
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://rpc.ankr.com/bsc_testnet_chapel",
      chainId: 97,
      gasPrice: 3000000000,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || '']
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || buildInfuraUrl("sepolia"),
      chainId: 11155111,
      timeout: 120000,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || ""],
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || buildInfuraUrl("mainnet"),
      chainId: 1,
      timeout: 120000,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || ""],
    }
  },
};

export default config; 