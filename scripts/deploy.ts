import { ethers } from "hardhat";

async function main() {
  const LendingPool = await ethers.getContractFactory("LendingPoolTest");
  const pool = await LendingPool.deploy();
  await pool.deployed();
  console.log("LendingPool deployed to:", pool.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 