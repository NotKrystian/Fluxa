type EnvKey = keyof ImportMetaEnv

const getEnvValue = (...keys: EnvKey[]): string | undefined => {
  for (const key of keys) {
    const value = import.meta.env[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

type TokenConfig = {
  symbol: string
  decimals: number
  address?: string
}

const BASE_TOKENS: Array<{ symbol: string; decimals: number; envKeys: EnvKey[] }> = [
  {
    symbol: 'USDC',
    decimals: 6,
    envKeys: ['VITE_ARC_USDC_ADDRESS', 'NEXT_PUBLIC_ARC_USDC_ADDRESS']
  },
  {
    symbol: 'FLX',
    decimals: 18,
    envKeys: ['VITE_ARC_FLX_TOKEN', 'NEXT_PUBLIC_ARC_FLX_TOKEN']
  }
]

const TOKENS: TokenConfig[] = BASE_TOKENS.map((token) => ({
  symbol: token.symbol,
  decimals: token.decimals,
  address: getEnvValue(...token.envKeys)
}))

export const supportedTokenSymbols: string[] = (() => {
  const configured = TOKENS.filter((token) => Boolean(token.address)).map((token) => token.symbol)
  return configured.length > 0 ? configured : BASE_TOKENS.map((token) => token.symbol)
})()

export const getTokenAddress = (symbol: string): string | undefined => {
  return TOKENS.find((token) => token.symbol === symbol)?.address
}

export const getTokenDecimals = (symbol: string): number => {
  return TOKENS.find((token) => token.symbol === symbol)?.decimals ?? 18
}
