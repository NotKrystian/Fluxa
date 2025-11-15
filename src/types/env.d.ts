interface ImportMetaEnv {
  readonly VITE_FLUXA_BACKEND_URL?: string
  readonly NEXT_PUBLIC_FLUXA_BACKEND_URL?: string
  readonly VITE_ARC_USDC_ADDRESS?: string
  readonly NEXT_PUBLIC_ARC_USDC_ADDRESS?: string
  readonly VITE_ARC_FLX_TOKEN?: string
  readonly NEXT_PUBLIC_ARC_FLX_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
