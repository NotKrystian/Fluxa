import { createConfig, http } from 'wagmi'
import { baseSepolia, arbitrumSepolia, avalancheFuji, optimismSepolia } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'
import type { Chain } from 'wagmi/chains'

// Define Arc Testnet chain
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.net',
    },
  },
  testnet: true,
} as const satisfies Chain

// Define Polygon Amoy chain
const polygonAmoy = {
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PolygonScan',
      url: 'https://amoy.polygonscan.com',
    },
  },
  testnet: true,
} as const satisfies Chain

// Define Codex Testnet chain
const codexTestnet = {
  id: 812242,
  name: 'Codex Testnet',
  nativeCurrency: {
    name: 'CDX',
    symbol: 'CDX',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_CODEX_TESTNET_RPC_URL || 'https://812242.rpc.thirdweb.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Codex Explorer',
      url: 'https://explorer.codex-stg.xyz',
    },
  },
  testnet: true,
} as const satisfies Chain

// Define Unichain Sepolia chain
const unichainSepolia = {
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL 
        ? [process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL]
        : ['https://sepolia.unichain.io'], // Fallback RPC - may need to be updated
    },
  },
  blockExplorers: {
    default: {
      name: 'Unichain Explorer',
      url: 'https://sepolia.unichain.io',
    },
  },
  testnet: true,
} as const satisfies Chain

export const wagmiConfig = createConfig({
  chains: [arcTestnet, baseSepolia, polygonAmoy, arbitrumSepolia, avalancheFuji, optimismSepolia, codexTestnet, unichainSepolia],
  connectors: [
    injected(),
    metaMask(),
  ],
  transports: {
    [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'),
    [baseSepolia.id]: http(),
    [polygonAmoy.id]: http(process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'),
    [arbitrumSepolia.id]: http(),
    [avalancheFuji.id]: http(),
    [optimismSepolia.id]: http(),
    [codexTestnet.id]: http(process.env.NEXT_PUBLIC_CODEX_TESTNET_RPC_URL || 'https://812242.rpc.thirdweb.com'),
    [unichainSepolia.id]: http(process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.io'),
  },
})

