import Web3 from "web3";
import erc20Abi from "./abis/erc20.json";
import tokenMessengerAbi from "./abis/tokenMessenger.json";
// import { CCTP_CONFIG } from "./config/cctp.js";
const web3 = new Web3(window.ethereum); 



export const CCTP_CONFIG = {
  sepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    domain: 0,
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
  },

  avalancheFuji: {
    chainId: 43113,
    name: "Avalanche Fuji",
    domain: 1,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", // Fuji Testnet USDC
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
  },

  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    domain: 3,
    usdc: "0x72B78F8cE059f1f7B60C97cAcDd90c06858a2be1", // Arbitrum Sepolia USDC
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
  },

  arcTestnet: {
    chainId: 8008135,
    name: "Arc Testnet",
    domain: 26,
    usdc: "0xCd0C22E7184A533577a6c5AA1b4E2E916dC37718", 
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
  }
};







export async function cctpBurnUSDC(amountUSDC, sourceChain, destinationChain, recipientAddress) {
  try {
    const src = CCTP_CONFIG[sourceChain];
    const dest = CCTP_CONFIG[destinationChain];

    if (!src || !dest) {
      throw new Error("Invalid chain selection");
    }

    const accounts = await web3.eth.requestAccounts();
    const from = accounts[0];

    // switch to source chain
    const currentChainId = await web3.eth.getChainId();
    if (currentChainId !== src.chainId) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainHexId: "0x" + src.chainId.toString(16) }]
      });
    }

    const usdc = new web3.eth.Contract(erc20Abi, src.usdc);
    const tokenMessenger = new web3.eth.Contract(tokenMessengerAbi, src.tokenMessenger);

    const amount = web3.utils.toBN(amountUSDC).mul(web3.utils.toBN(1_000_000));

    // Approve USDC
    const approveTx = await usdc.methods.approve(src.tokenMessenger, amount).send({ from });
    console.log("Approval transaction:", approveTx.transactionHash);

    const recipientBytes32 =
      "0x" + recipientAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    const receipt = await tokenMessenger.methods
      .depositForBurn(
        amount,
        dest.domain,
        recipientBytes32,
        src.usdc
      )
      .send({ from });

    console.log("Burn receipt:", receipt);
    return receipt;
  } catch (error) {
    console.error("CCTP transfer failed:", error);
    throw error;
  }
}

