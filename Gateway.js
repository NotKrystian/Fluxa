import Web3 from "web3";
import erc20Abi from "./abis/erc20.json";
import gatewayMinterAbi from "./abis/gatewayMinter.json";
import gatewayWalletAbi from "./abis/gatewayWallet.json";

const web3 = new Web3(window.ethereum);

export const GATEWAY_CONFIG = {
  // Testnet
  sepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    domain: 0,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  avalancheFuji: {
    chainId: 43113,
    name: "Avalanche Fuji",
    domain: 1,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    domain: 6,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCeC6",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  hyperEVMTestnet: {
    chainId: 17864,
    name: "HyperEVM Testnet",
    domain: 19,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  seiAtlantic: {
    chainId: 1328,
    name: "Sei Atlantic",
    domain: 16,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  sonicTestnet: {
    chainId: 64165,
    name: "Sonic Testnet",
    domain: 13,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  worldChainSepolia: {
    chainId: 4801,
    name: "World Chain Sepolia",
    domain: 14,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  arcTestnet: {
    chainId: 8008135,
    name: "Arc Testnet",
    domain: 26,
    usdc: "0xCd0C22E7184A533577a6c5AA1b4E2E916dC37718",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  },

  // Mainnet
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    domain: 0,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  arbitrum: {
    chainId: 42161,
    name: "Arbitrum",
    domain: 3,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  avalanche: {
    chainId: 43114,
    name: "Avalanche",
    domain: 1,
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  base: {
    chainId: 8453,
    name: "Base",
    domain: 6,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  optimism: {
    chainId: 10,
    name: "OP",
    domain: 2,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d53F0C3B",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  polygon: {
    chainId: 137,
    name: "Polygon PoS",
    domain: 7,
    usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  hyperEVM: {
    chainId: 2019,
    name: "HyperEVM",
    domain: 19,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  sei: {
    chainId: 1329,
    name: "Sei",
    domain: 16,
    usdc: "0x3924d5ad0745e9EC889e5e826f5E4B99D6eE1FB6",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  sonic: {
    chainId: 250,
    name: "Sonic",
    domain: 13,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  unichain: {
    chainId: 130,
    name: "Unichain",
    domain: 10,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d53F0C3B",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  },

  worldChain: {
    chainId: 480,
    name: "World Chain",
    domain: 14,
    usdc: "0xdc2D855A98cFfBDEeB978b8afc1bbF7DAd37e27f",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  }
};

export async function gatewayMintUSDC(amountUSDC, sourceChain, destinationChain, recipientAddress) {
  try {
    const src = GATEWAY_CONFIG[sourceChain];
    const dest = GATEWAY_CONFIG[destinationChain];

    if (!src || !dest) {
      throw new Error("Invalid chain selection");
    }

    const accounts = await web3.eth.requestAccounts();
    const from = accounts[0];

    // Switch to source chain if needed
    const currentChainId = await web3.eth.getChainId();
    if (currentChainId !== src.chainId) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainHexId: "0x" + src.chainId.toString(16) }]
      });
    }

    const usdc = new web3.eth.Contract(erc20Abi, src.usdc);
    const gatewayMinter = new web3.eth.Contract(gatewayMinterAbi, src.gatewayMinter);

    const amount = web3.utils.toBN(amountUSDC).mul(web3.utils.toBN(1_000_000));

    // Approve USDC to GatewayMinter
    const approveTx = await usdc.methods.approve(src.gatewayMinter, amount).send({ from });
    console.log("Approval transaction:", approveTx.transactionHash);

    const recipientBytes32 =
      "0x" + recipientAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    // Mint through Gateway
    const receipt = await gatewayMinter.methods
      .mint(
        dest.domain,
        recipientBytes32,
        amount,
        src.usdc
      )
      .send({ from });

    console.log("Gateway mint receipt:", receipt);
    return receipt;
  } catch (error) {
    console.error("Gateway transfer failed:", error);
    throw error;
  }
}

export async function gatewayBurnUSDC(amountUSDC, sourceChain, destinationChain, recipientAddress) {
  try {
    const src = GATEWAY_CONFIG[sourceChain];
    const dest = GATEWAY_CONFIG[destinationChain];

    if (!src || !dest) {
      throw new Error("Invalid chain selection");
    }

    const accounts = await web3.eth.requestAccounts();
    const from = accounts[0];

    // Switch to source chain if needed
    const currentChainId = await web3.eth.getChainId();
    if (currentChainId !== src.chainId) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainHexId: "0x" + src.chainId.toString(16) }]
      });
    }

    const usdc = new web3.eth.Contract(erc20Abi, src.usdc);
    const gatewayMinter = new web3.eth.Contract(gatewayMinterAbi, src.gatewayMinter);

    const amount = web3.utils.toBN(amountUSDC).mul(web3.utils.toBN(1_000_000));

    // Approve USDC to GatewayMinter
    const approveTx = await usdc.methods.approve(src.gatewayMinter, amount).send({ from });
    console.log("Approval transaction:", approveTx.transactionHash);

    const recipientBytes32 =
      "0x" + recipientAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    // Burn through Gateway
    const receipt = await gatewayMinter.methods
      .burn(
        dest.domain,
        recipientBytes32,
        amount,
        src.usdc
      )
      .send({ from });

    console.log("Gateway burn receipt:", receipt);
    return receipt;
  } catch (error) {
    console.error("Gateway transfer failed:", error);
    throw error;
  }
}
