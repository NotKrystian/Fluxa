import { ref, computed, onMounted, shallowRef } from 'vue'
import { BrowserProvider, JsonRpcSigner } from 'ethers'

export function useWeb3() {
  const provider = shallowRef<BrowserProvider | null>(null)
  const signer = shallowRef<JsonRpcSigner | null>(null)
  const address = ref<string>('')
  const chainId = ref<number | null>(null)
  const isConnecting = ref(false)

  const isConnected = computed(() => !!address.value)

  const checkWalletInstalled = (): boolean => {
    return typeof window.ethereum !== 'undefined'
  }

  const setupListeners = () => {
    if (!window.ethereum) return

    const ethereum = window.ethereum
    ethereum.on('accountsChanged', handleAccountsChanged)
    ethereum.on('chainChanged', handleChainChanged)
  }

  const removeListeners = () => {
    if (!window.ethereum) return

    const ethereum = window.ethereum
    ethereum.removeListener('accountsChanged', handleAccountsChanged)
    ethereum.removeListener('chainChanged', handleChainChanged)
  }

  const initializeProvider = async () => {
    if (!window.ethereum) throw new Error('No wallet detected')

    try {
      const ethersProvider = new BrowserProvider(window.ethereum)
      const ethersSigner = await ethersProvider.getSigner()
      const signerAddress = await ethersSigner.getAddress()
      const network = await ethersProvider.getNetwork()

      provider.value = ethersProvider
      signer.value = ethersSigner
      address.value = signerAddress
      chainId.value = Number(network.chainId)

      console.log('Provider initialized:', {
        address: signerAddress,
        chainId: Number(network.chainId)
      })
    } catch (error) {
      console.error('Failed to initialize provider:', error)
      throw error
    }
  }

  // Check if wallet is already connected on page load
  const checkConnection = async () => {
    if (!checkWalletInstalled()) return

    try {
      if (!window.ethereum) return

      // Check if we have permission to access accounts
      const accounts = await window.ethereum.request({
        method: 'eth_accounts'
      }) as string[]

      if (accounts.length > 0) {
        // Wallet is already connected, initialize it
        await initializeProvider()
        setupListeners()
        console.log('Wallet auto-connected:', address.value)
      }
    } catch (error) {
      console.error('Error checking connection:', error)
    }
  }

  // Run on mount
  onMounted(() => {
    checkConnection()
  })

  const connectWallet = async () => {
    if (isConnecting.value) return
    
    try {
      isConnecting.value = true

      if (!checkWalletInstalled()) {
        alert('Please install MetaMask: https://metamask.io/download/')
        window.open('https://metamask.io/download/', '_blank')
        return
      }

      if (!window.ethereum) {
        throw new Error('Ethereum provider not found')
      }

      // Request account access
      await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      // Initialize provider
      await initializeProvider()
      
      // Set up listeners
      setupListeners()

      console.log('Wallet connected successfully')

    } catch (error: any) {
      console.error('Error connecting wallet:', error)
      
      if (error.code === 4001) {
        alert('Connection rejected. Please approve the connection request in MetaMask.')
      } else {
        alert(`Failed to connect wallet: ${error.message || 'Unknown error'}`)
      }
      throw error
    } finally {
      isConnecting.value = false
    }
  }

  const disconnectWallet = () => {
    removeListeners()
    
    provider.value = null
    signer.value = null
    address.value = ''
    chainId.value = null

    console.log('Wallet disconnected')
  }

  const signMessage = async (message: string): Promise<string> => {
    if (!signer.value) {
      throw new Error('Wallet not connected')
    }

    try {
      const signature = await signer.value.signMessage(message)
      console.log('Message signed successfully')
      return signature
    } catch (error: any) {
      console.error('Error signing message:', error)
      if (error.code === 4001) {
        throw new Error('Signature rejected by user')
      }
      throw error
    }
  }

  const switchChain = async (targetChainId: number): Promise<void> => {
    if (!window.ethereum) {
      alert('No wallet detected')
      return
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }]
      })
      console.log('Chain switched to:', targetChainId)
    } catch (error: any) {
      console.error('Error switching chain:', error)
      
      if (error.code === 4902) {
        alert('This network is not added to your wallet. Please add it manually in MetaMask.')
      } else if (error.code === 4001) {
        alert('Network switch rejected')
      } else {
        alert(`Failed to switch network: ${error.message}`)
      }
      throw error
    }
  }

  const handleAccountsChanged = async (accounts: string[]) => {
    console.log('Accounts changed:', accounts)
    
    if (accounts.length === 0) {
      console.log('Wallet disconnected')
      disconnectWallet()
    } else {
      // Re-initialize to get the new account
      try {
        await initializeProvider()
      } catch (error) {
        console.error('Error handling account change:', error)
      }
    }
  }

  const handleChainChanged = (newChainId: string) => {
    console.log('Chain changed to:', newChainId)
    // Reload to avoid state issues
    window.location.reload()
  }

  const formatAddress = (addr: string): string => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return {
    provider,
    signer,
    address,
    chainId,
    isConnected,
    isConnecting,
    connectWallet,
    disconnectWallet,
    signMessage,
    switchChain,
    formatAddress,
    checkWalletInstalled
  }
}
