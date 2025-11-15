'use client'

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { Send, ArrowRight, RefreshCw, CheckCircle, XCircle, Clock, Globe, Zap } from 'lucide-react'
import { getSigner, isConnectedToArc, switchToArc, getTokenBalance, parseTokenAmount, formatTokenAmount, CONTRACTS } from '@/utils/contracts'
import apiClient from '@/utils/api'

const SUPPORTED_CHAINS = ['arc', 'base', 'polygon', 'avalanche', 'optimism', 'arbitrum']

export default function TestPage() {
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [isArcNetwork, setIsArcNetwork] = useState(false)
  
  // CCTP State
  const [cctpSourceChain, setCctpSourceChain] = useState('base')
  const [cctpDestChain, setCctpDestChain] = useState('arc')
  const [cctpAmount, setCctpAmount] = useState('')
  const [cctpRecipient, setCctpRecipient] = useState('')
  const [cctpUseFast, setCctpUseFast] = useState(true)
  const [cctpLoading, setCctpLoading] = useState(false)
  const [cctpStatus, setCctpStatus] = useState<any>(null)
  const [cctpError, setCctpError] = useState('')
  const [cctpTransferId, setCctpTransferId] = useState<string | null>(null)
  const [cctpWalletAddress, setCctpWalletAddress] = useState<string>('')
  const [cctpCheckingDeposit, setCctpCheckingDeposit] = useState(false)
  const [cctpDepositReceived, setCctpDepositReceived] = useState(false)
  const [cctpWalletBalance, setCctpWalletBalance] = useState<any>(null)
  const [cctpFeeEstimate, setCctpFeeEstimate] = useState<{ estimatedFee: string | null; maxFee: string | null } | null>(null)
  const [cctpGasEstimate, setCctpGasEstimate] = useState<{ sourceGasCostFormatted: string; sourceGasToken: string } | null>(null)
  const [cctpSendingGas, setCctpSendingGas] = useState(false)
  const [cctpSendingUSDC, setCctpSendingUSDC] = useState(false)
  
  // Hardcoded gas estimates per chain (in native token)
  // Base Sepolia: 0.000000205389280959 ETH per transaction, 3x = ~0.000000616 ETH for approve + depositForBurn
  const GAS_ESTIMATES: Record<string, { amount: string; token: string }> = {
    base: { amount: '0.000000616', token: 'ETH' }, // Base Sepolia: 3x actual fee (0.000000205389280959 * 3)
    basesepolia: { amount: '0.000000616', token: 'ETH' },
    'base-sepolia': { amount: '0.000000616', token: 'ETH' },
    arc: { amount: '0.05', token: 'USDC' }, // Arc: ~0.05 USDC for approve + depositForBurn
    polygon: { amount: '0.001', token: 'ETH' },
    avalanche: { amount: '0.001', token: 'ETH' },
    optimism: { amount: '0.0005', token: 'ETH' },
    arbitrum: { amount: '0.0005', token: 'ETH' }
  }
  
  // Get gas estimate for a chain
  const getGasEstimateForChain = (chain: string) => {
    const chainLower = chain.toLowerCase()
    return GAS_ESTIMATES[chainLower] || (chainLower === 'arc' ? { amount: '0.05', token: 'USDC' } : { amount: '0.001', token: 'ETH' })
  }
  
  // Gateway State
  const [gatewayChain, setGatewayChain] = useState('arc')
  const [gatewayToken, setGatewayToken] = useState('')
  const [gatewayAmount, setGatewayAmount] = useState('')
  const [gatewayDepositor, setGatewayDepositor] = useState('')
  const [gatewayUseOnChain, setGatewayUseOnChain] = useState(true)
  const [gatewayLoading, setGatewayLoading] = useState(false)
  const [gatewayStatus, setGatewayStatus] = useState<any>(null)
  const [gatewayError, setGatewayError] = useState('')
  const [gatewayBalance, setGatewayBalance] = useState('0')
  
  // Withdrawal State
  const [withdrawTargetChain, setWithdrawTargetChain] = useState('arc')
  const [withdrawToken, setWithdrawToken] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawStatus, setWithdrawStatus] = useState<any>(null)
  const [withdrawError, setWithdrawError] = useState('')

  // Connect wallet
  const connectWallet = async () => {
    try {
      const signer = await getSigner()
      if (!signer) {
        setCctpError('MetaMask not found')
        return
      }

      const address = await signer.getAddress()
      setUserAddress(address)
      setConnected(true)
      setCctpRecipient(address)
      setGatewayDepositor(address)
      setWithdrawRecipient(address)

      const onArc = await isConnectedToArc()
      setIsArcNetwork(onArc)

      if (onArc) {
        await updateBalances(address)
      }
    } catch (err: any) {
      setCctpError(err.message)
    }
  }

  // Update balances
  const updateBalances = async (address: string) => {
    try {
      // Check if we're on Arc (USDC is native token)
      const network = await (await getSigner())?.provider.getNetwork()
      const isArc = network?.chainId === BigInt(5042002)
      
      if (isArc) {
        // Arc: USDC is native token - use getBalance()
        // IMPORTANT: Native token balance is in 18 decimals (like ETH), not 6 decimals
        const provider = (await getSigner())?.provider
        if (provider) {
          const balance = await provider.getBalance(address)
          // Format balance: nativeBalance is in 18 decimals (native token format)
          const formatted = ethers.formatEther(balance)
          setGatewayBalance(formatted)
        }
      } else {
        // Other chains: USDC is ERC-20 token
        const usdcAddress = CONTRACTS.USDC || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS
        if (usdcAddress) {
          const provider = (await getSigner())?.provider
          if (provider) {
            const balance = await getTokenBalance(usdcAddress, address, provider)
            const formatted = formatTokenAmount(balance.toString(), 6) // 6 decimals for USDC
            setGatewayBalance(formatted)
          }
        }
      }
    } catch (err) {
      console.error('Error updating balances:', err)
    }
  }

  // Switch network
  const handleSwitchNetwork = async () => {
    const success = await switchToArc()
    if (success) {
      setIsArcNetwork(true)
      if (userAddress) {
        await updateBalances(userAddress)
      }
    }
  }

  // Create CCTP Transfer Request
  const handleCreateCCTPTransfer = async () => {
    if (!cctpAmount || parseFloat(cctpAmount) <= 0) {
      setCctpError('Please enter a valid amount')
      return
    }

    setCctpLoading(true)
    setCctpError('')
    setCctpStatus(null)
    setCctpDepositReceived(false)
    setCctpFeeEstimate(null) // Clear previous fee estimate

    try {
      // Convert amount to wei (USDC has 6 decimals)
      const amountWei = parseTokenAmount(cctpAmount, 6)
      
      const result = await apiClient.createCCTPTransfer({
        sourceChain: cctpSourceChain,
        destinationChain: cctpDestChain,
        amount: amountWei.toString(),
        recipient: cctpRecipient || userAddress,
        useFastAttestation: cctpUseFast
      })

      setCctpTransferId(result.transferId)
      setCctpWalletAddress(result.cctpWalletAddress)
      
      // Store fee estimate from Bridge Kit if available
      if (result.feeEstimate) {
        setCctpFeeEstimate({
          estimatedFee: result.feeEstimate.estimatedFee,
          maxFee: result.feeEstimate.maxFee
        })
      } else {
        setCctpFeeEstimate(null)
      }
      
      setCctpStatus({
        ...result,
        step: 'waiting_deposit',
        message: `Send ${cctpAmount} USDC to: ${result.cctpWalletAddress}`
      })

      // Check wallet balance and fetch gas estimates
      await refreshCCTPWalletBalance()

      // Don't start polling automatically - will check immediately after USDC is sent
      console.log('[CCTP Create] Transfer created. Waiting for USDC deposit...')
    } catch (err: any) {
      setCctpError(err.message || 'Failed to create CCTP transfer')
      console.error('CCTP error:', err)
    } finally {
      setCctpLoading(false)
    }
  }

  // Poll for deposit confirmation
  const startDepositPolling = (transferId: string) => {
    setCctpCheckingDeposit(true)
    let pollCount = 0
    const maxPolls = 100 // 5 minutes at 3 second intervals
    
    const pollInterval = setInterval(async () => {
      pollCount++
      try {
        console.log(`[Poll ${pollCount}] Checking deposit for transfer ${transferId}...`)
        
        // Pass sourceChain to help recover after server restart
        const depositStatus = await apiClient.checkCCTPDeposit(transferId, cctpSourceChain)
        
        console.log('[Poll] Deposit check result:', {
          received: depositStatus.received,
          usdcReceived: depositStatus.usdcReceived,
          gasSufficient: depositStatus.gasSufficient,
          usdcBalance: depositStatus.usdcBalance,
          usdcIncrease: depositStatus.usdcIncrease,
          gasBalance: depositStatus.gasBalance,
          requiredUSDC: depositStatus.requiredUSDC,
          requiredGas: depositStatus.requiredGas,
          message: depositStatus.message
        })
        
        // Parse numeric values for comparison
        const currentUSDC = parseFloat(depositStatus.usdcBalance || '0')
        const requiredUSDC = parseFloat(depositStatus.requiredUSDC || '0')
        const currentGas = parseFloat(depositStatus.gasBalance || '0')
        const requiredGas = parseFloat(depositStatus.requiredGas || '0')
        const gasToken = depositStatus.gasToken || (cctpSourceChain.toLowerCase() === 'arc' ? 'USDC' : 'ETH')
        
        // Verify deposits are actually present
        const usdcSufficient = currentUSDC >= requiredUSDC && requiredUSDC > 0
        const gasSufficient = depositStatus.gasSufficient === true || (currentGas >= requiredGas && requiredGas > 0)
        
        console.log('[Poll] Verification:', {
          usdcSufficient,
          gasSufficient,
          currentUSDC,
          requiredUSDC,
          currentGas,
          requiredGas
        })
        
        // Update status message based on what's missing
        if (!usdcSufficient || !gasSufficient) {
          const messages = []
          if (!usdcSufficient) {
            messages.push(`Waiting for USDC... (have: ${currentUSDC.toFixed(6)}, need: ${requiredUSDC.toFixed(6)})`)
          }
          if (!gasSufficient) {
            messages.push(`Waiting for ${gasToken} (gas)... (have: ${currentGas.toFixed(6)}, need: ${requiredGas.toFixed(6)})`)
          }
          setCctpStatus(prev => ({
            ...prev,
            step: 'waiting_deposit',
            message: messages.length > 0 ? messages.join(' | ') : 'Waiting for deposits...'
          }))
        }
        
        // If both deposits are sufficient, execute the transfer
        if (usdcSufficient && gasSufficient) {
          console.log('[Poll] ✅ Deposits verified! Both USDC and gas are sufficient. Executing transfer...')
          clearInterval(pollInterval)
          setCctpDepositReceived(true)
          setCctpCheckingDeposit(false)
          
          setCctpStatus(prev => ({
            ...prev,
            step: 'deposit_received',
            message: `Both USDC and ${gasToken} verified! Executing CCTP transfer...`
          }))
          
          // Refresh balance one more time
          await refreshCCTPWalletBalance()
          
          // Wait a moment for balance to update
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Execute the transfer
          console.log('[Poll] 🚀 Executing CCTP transfer now...')
          try {
            await executeCCTPTransfer(transferId)
            console.log('[Poll] ✅ Transfer execution completed')
          } catch (err: any) {
            console.error('[Poll] ❌ Error executing CCTP transfer:', err)
            setCctpError(err.message || 'Failed to execute CCTP transfer after deposit')
            setCctpStatus(prev => ({
              ...prev,
              step: 'error',
              message: `Deposit verified but transfer failed: ${err.message || 'Unknown error'}`
            }))
          }
        } else if (pollCount >= maxPolls) {
          // Timeout - stop polling
          console.log('[Poll] ⏱️ Polling timeout reached')
          clearInterval(pollInterval)
          setCctpCheckingDeposit(false)
          setCctpStatus(prev => ({
            ...prev,
            step: 'waiting_deposit',
            message: 'Polling timeout. Deposits may not have been received. Please check manually.'
          }))
        }
      } catch (err: any) {
        console.error('[Poll] ❌ Error checking deposit:', err)
        // Don't stop polling on error, just log it
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          setCctpCheckingDeposit(false)
        }
      }
    }, 3000) // Poll every 3 seconds

    // Stop polling after 5 minutes as backup
    setTimeout(() => {
      clearInterval(pollInterval)
      setCctpCheckingDeposit(false)
      console.log('[Poll] ⏱️ Polling stopped after timeout')
    }, 300000)
  }

  // Execute CCTP transfer after deposit confirmed
  const executeCCTPTransfer = async (transferId: string) => {
    console.log('\n[CCTP Execute] 🚀 ==========================================')
    console.log('[CCTP Execute] Starting CCTP transfer execution...')
    console.log('[CCTP Execute] Transfer ID:', transferId)
    
    try {
      setCctpLoading(true)
      setCctpError('')
      
      const executeParams = {
        transferId,
        sourceChain: cctpSourceChain,
        destinationChain: cctpDestChain,
        amount: cctpAmount,
        recipient: cctpRecipient || userAddress,
        useFastAttestation: cctpUseFast
      }
      console.log('[CCTP Execute] Parameters:', executeParams)
      
      setCctpStatus(prev => ({
        ...prev,
        step: 'executing',
        message: 'Executing CCTP transfer... This may take a few minutes.'
      }))
      
      console.log('[CCTP Execute] Step 1: Calling backend API...')
      // Pass transfer details to help recover after server restart
      const result = await apiClient.executeCCTPTransfer(transferId, {
        sourceChain: cctpSourceChain,
        destinationChain: cctpDestChain,
        amount: parseTokenAmount(cctpAmount, 6).toString(),
        recipient: cctpRecipient || userAddress,
        useFastAttestation: cctpUseFast
      })
      
      console.log('[CCTP Execute] ✅ Backend response received')
      console.log('[CCTP Execute] Result:', JSON.stringify(result, null, 2))
      
      if (result.initiate && result.initiate.txHash) {
        console.log('[CCTP Execute] Initiate TX:', result.initiate.txHash)
      }
      if (result.complete && result.complete.txHash) {
        console.log('[CCTP Execute] Complete TX:', result.complete.txHash)
      }
      if (result.totalTime) {
        console.log('[CCTP Execute] Total time:', result.totalTime, 'seconds')
      }
      
      setCctpStatus({
        ...result,
        step: 'completed',
        message: 'CCTP transfer completed successfully!'
      })
      
      console.log('[CCTP Execute] ✅ Transfer execution completed successfully!')
      console.log('[CCTP Execute] ==========================================\n')
    } catch (err: any) {
      console.error('\n[CCTP Execute] ❌ ==========================================')
      console.error('[CCTP Execute] Error executing CCTP transfer')
      console.error('[CCTP Execute] Error type:', err.constructor.name)
      console.error('[CCTP Execute] Error message:', err.message)
      if (err.response) {
        console.error('[CCTP Execute] Response status:', err.response.status)
        console.error('[CCTP Execute] Response data:', err.response.data)
      }
      console.error('[CCTP Execute] Full error:', err)
      console.error('[CCTP Execute] ==========================================\n')
      
      const errorMessage = err.response?.data?.error || err.message || 'Failed to execute CCTP transfer'
      setCctpError(errorMessage)
      setCctpStatus(prev => ({
        ...prev,
        step: 'error',
        message: `Transfer execution failed: ${errorMessage}`
      }))
      throw err // Re-throw so caller can handle it
    } finally {
      setCctpLoading(false)
    }
  }

  // Send USDC to CCTP wallet (helper function)
  const handleSendUSDCToWallet = async () => {
    console.log('[USDC Send] 🚀 Starting USDC transfer to CCTP wallet...')
    
    if (!cctpWalletAddress || !cctpAmount) {
      const error = 'Please create a transfer request first'
      console.error('[USDC Send] ❌', error)
      setCctpError(error)
      return
    }

    setCctpSendingUSDC(true)
    setCctpError('')

    try {
      console.log('[USDC Send] Step 1: Getting signer...')
      const signer = await getSigner()
      if (!signer) {
        const error = 'Please connect your wallet'
        console.error('[USDC Send] ❌', error)
        setCctpError(error)
        return
      }
      const userAddress = await signer.getAddress()
      console.log('[USDC Send] ✓ Signer obtained:', userAddress)

      // Check network for source chain
      console.log('[USDC Send] Step 2: Checking network...')
      const network = await signer.provider.getNetwork()
      
      if (cctpSourceChain === 'base') {
        const BASE_SEPOLIA_CHAIN_ID = 84532
        if (network.chainId !== BigInt(BASE_SEPOLIA_CHAIN_ID)) {
          console.log('[USDC Send] ⚠️ Wrong network, switching to Base Sepolia...')
          setCctpError(`Please switch to Base Sepolia (Chain ID: ${BASE_SEPOLIA_CHAIN_ID})`)
          try {
            await (window.ethereum as any).request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` }],
            })
            await new Promise(resolve => setTimeout(resolve, 1000))
            console.log('[USDC Send] ✓ Network switched')
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              setCctpError('Base Sepolia network not found. Please add it to your wallet.')
            }
            return
          }
        } else {
          console.log('[USDC Send] ✓ Network correct (Base Sepolia)')
        }
      } else if (cctpSourceChain === 'arc') {
        const ARC_TESTNET_CHAIN_ID = 5042002
        if (network.chainId !== BigInt(ARC_TESTNET_CHAIN_ID)) {
          console.log('[USDC Send] ⚠️ Wrong network, switching to Arc Testnet...')
          setCctpError(`Please switch to Arc Testnet (Chain ID: ${ARC_TESTNET_CHAIN_ID})`)
          try {
            await (window.ethereum as any).request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${ARC_TESTNET_CHAIN_ID.toString(16)}` }],
            })
            await new Promise(resolve => setTimeout(resolve, 1000))
            console.log('[USDC Send] ✓ Network switched')
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              setCctpError('Arc Testnet network not found. Please add it to your wallet.')
            }
            return
          }
        } else {
          console.log('[USDC Send] ✓ Network correct (Arc Testnet)')
        }
      }

      // Calculate total amount needed
      // For Arc: transfer amount + CCTP fee + gas (all in USDC, sent as native token)
      // For other chains: transfer amount + CCTP fee (gas is separate ETH transaction)
      const isArc = cctpSourceChain.toLowerCase() === 'arc'
      let totalAmount = parseFloat(cctpAmount)
      
      // Add CCTP transfer fee
      if (cctpUseFast) {
        if (cctpFeeEstimate?.maxFee) {
          totalAmount = totalAmount + parseFloat(cctpFeeEstimate.maxFee)
        } else {
          const feePercent = 0.15
          const minFee = 0.02
          const calculatedFee = (totalAmount * feePercent) / 100
          const fee = calculatedFee > minFee ? calculatedFee : minFee
          totalAmount = totalAmount + fee
        }
      }
      
      // For Arc: add gas amount to the same transaction (USDC is native gas token)
      if (isArc) {
        const gasEstimate = getGasEstimateForChain(cctpSourceChain)
        const gasAmount = parseFloat(gasEstimate.amount) * 1.2 // 20% buffer
        totalAmount = totalAmount + gasAmount
        console.log('[USDC Send] Step 3: Arc detected - including gas in transfer amount')
        console.log('[USDC Send]   Transfer amount:', cctpAmount, 'USDC')
        console.log('[USDC Send]   CCTP fee:', (totalAmount - parseFloat(cctpAmount) - gasAmount).toFixed(6), 'USDC')
        console.log('[USDC Send]   Gas amount:', gasAmount.toFixed(6), 'USDC')
      }
      
      console.log('[USDC Send] Step 3: Total amount to send:', totalAmount.toFixed(6), isArc ? 'USDC (native token, includes transfer + fee + gas)' : 'USDC (transfer + fee only)')

      if (isArc) {
        // Arc: USDC is the native token - send like ETH (native transfer)
        // IMPORTANT: Even though USDC has 6 decimals, native token transfers use 18 decimals (like ETH)
        // So we need to convert: 1.08 USDC = 1.08 * 10^18 (not 10^6)
        console.log('[USDC Send] Step 4: Checking native USDC balance...')
        const nativeBalance = await signer.provider.getBalance(userAddress)
        // Convert USDC amount to 18 decimals for native transfer (Arc native token uses 18 decimals)
        const amountWei = ethers.parseEther(totalAmount.toFixed(18)) // Use 18 decimals for native transfer
        // Format balance: nativeBalance is in 18 decimals (native token format)
        const balanceFormatted = ethers.formatEther(nativeBalance)
        console.log('[USDC Send] Native USDC balance:', balanceFormatted, 'USDC')
        console.log('[USDC Send] Required amount:', totalAmount.toFixed(6), 'USDC')
        console.log('[USDC Send] Amount in wei (18 decimals):', amountWei.toString())

        // Compare raw values (both in 18 decimals for native token)
        if (nativeBalance < amountWei) {
          const gasEstimate = getGasEstimateForChain(cctpSourceChain)
          const gasAmount = parseFloat(gasEstimate.amount) * 1.2
          const feeAmount = totalAmount - parseFloat(cctpAmount) - gasAmount
          const error = `Insufficient USDC balance. You have ${balanceFormatted} USDC, but need ${totalAmount.toFixed(6)} USDC (${cctpAmount} transfer + ${feeAmount.toFixed(6)} fee + ${gasAmount.toFixed(6)} gas)`
          console.error('[USDC Send] ❌', error)
          setCctpError(error)
          return
        }
        console.log('[USDC Send] ✓ Balance sufficient')

        // Send native USDC transfer (like sending ETH on other chains)
        // On Arc, the native token IS USDC, but native transfers use 18 decimals
        console.log('[USDC Send] Step 5: Sending native USDC transfer (Arc native token)...')
        console.log('[USDC Send] To:', cctpWalletAddress)
        console.log('[USDC Send] Amount:', amountWei.toString(), 'wei (18 decimals,', totalAmount.toFixed(6), 'USDC)')
        console.log('[USDC Send] From:', userAddress)
        console.log('[USDC Send] Note: Gas will be automatically deducted from this amount in USDC')
        
        var tx = await signer.sendTransaction({
          to: cctpWalletAddress,
          value: amountWei // Send native USDC (18 decimals for native transfer)
        })
      } else {
        // Other chains: Use ERC-20 USDC contract
        const usdcAddress = cctpSourceChain === 'base' 
          ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
          : (CONTRACTS.USDC || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS)

        if (!usdcAddress) {
          const error = 'USDC address not configured for this chain'
          console.error('[USDC Send] ❌', error)
          setCctpError(error)
          return
        }
        console.log('[USDC Send] Step 4: USDC contract address:', usdcAddress)

        // Check user's USDC balance before attempting transfer
        console.log('[USDC Send] Step 5: Checking user balance...')
        const usdcContract = new ethers.Contract(
          usdcAddress,
          ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'],
          signer
        )

        const userBalance = await usdcContract.balanceOf(userAddress)
        const amountWei = parseTokenAmount(totalAmount.toFixed(6), 6)
        const balanceFormatted = formatTokenAmount(userBalance.toString(), 6)
        console.log('[USDC Send] User balance:', balanceFormatted, 'USDC')
        console.log('[USDC Send] Required amount:', totalAmount.toFixed(6), 'USDC')

        if (userBalance < amountWei) {
          const error = `Insufficient USDC balance. You have ${balanceFormatted} USDC, but need ${totalAmount.toFixed(6)} USDC (${cctpAmount} + ${(totalAmount - parseFloat(cctpAmount)).toFixed(6)} fee)`
          console.error('[USDC Send] ❌', error)
          setCctpError(error)
          return
        }
        console.log('[USDC Send] ✓ Balance sufficient')

        // Send ERC-20 transfer
        console.log('[USDC Send] Step 6: Sending ERC-20 transfer transaction...')
        console.log('[USDC Send] To:', cctpWalletAddress)
        console.log('[USDC Send] Amount:', amountWei.toString(), 'smallest units (', totalAmount.toFixed(6), 'USDC)')
        
        var tx = await usdcContract.transfer(cctpWalletAddress, amountWei)
      }
      
      console.log('[USDC Send] ✓ Transaction sent! Hash:', tx.hash)
      console.log('[USDC Send] Step 7: Waiting for transaction confirmation...')
      
      setCctpStatus(prev => ({
        ...prev,
        depositTxHash: tx.hash,
        message: `USDC transaction sent! Hash: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`
      }))

      // Wait for transaction confirmation
      const receipt = await tx.wait()
      console.log('[USDC Send] ✅ Transaction confirmed!')
      console.log('[USDC Send] Block number:', receipt.blockNumber)
      console.log('[USDC Send] Gas used:', receipt.gasUsed.toString())
      console.log('[USDC Send] Status:', receipt.status === 1 ? 'Success' : 'Failed')

      if (receipt.status !== 1) {
        throw new Error('Transaction failed')
      }

      setCctpStatus(prev => ({
        ...prev,
        depositTxHash: tx.hash,
        message: 'USDC transaction confirmed! Verifying deposit and executing CCTP transfer...'
      }))

      // Wait 5 seconds then execute CCTP transfer
      console.log('[USDC Send] Step 8: Waiting 5 seconds for transaction to be fully processed...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Execute CCTP transfer - transaction is confirmed, deposit is there
      if (cctpTransferId) {
        console.log('[USDC Send] Step 9: Executing CCTP transfer now...')
        setCctpDepositReceived(true)
        setCctpStatus(prev => ({
          ...prev,
          step: 'deposit_received',
          message: 'USDC confirmed! Executing CCTP transfer...'
        }))
        
        // Execute CCTP transfer immediately
        await executeCCTPTransfer(cctpTransferId)
      } else {
        console.warn('[USDC Send] ⚠️ No transfer ID available. Cannot execute CCTP transfer.')
      }
      
      console.log('[USDC Send] ✅ USDC transfer complete!')
    } catch (err: any) {
      let errorMessage = 'Failed to send USDC'
      if (err.message) {
        errorMessage = err.message
      } else if (err.reason) {
        errorMessage = err.reason
      } else if (err.data?.message) {
        errorMessage = err.data.message
      }
      
      // Check for common errors
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('balance')) {
        errorMessage = 'Insufficient USDC balance. Please check your wallet.'
      } else if (errorMessage.includes('user rejected') || errorMessage.includes('denied')) {
        errorMessage = 'Transaction was rejected by user'
      } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
        const chainName = cctpSourceChain === 'arc' ? 'Arc Testnet' : cctpSourceChain === 'base' ? 'Base Sepolia' : 'the correct network'
        errorMessage = `Network error. Please check you are on ${chainName}.`
      }
      
      setCctpError(errorMessage)
      console.error('Send USDC error:', err)
    } finally {
      setCctpSendingUSDC(false)
    }
  }

  // Send gas token (ETH or USDC for Arc) to CCTP wallet
  const handleSendGasToWallet = async () => {
    if (!cctpWalletAddress) {
      setCctpError('Please create a transfer request first')
      return
    }

    setCctpSendingGas(true)
    setCctpError('')

    try {
      const signer = await getSigner()
      if (!signer) {
        setCctpError('Please connect your wallet')
        return
      }

      const isArc = cctpSourceChain.toLowerCase() === 'arc'
      
      // Use hardcoded gas estimate for the chain
      const gasEstimate = getGasEstimateForChain(cctpSourceChain)
      // Add 20% buffer for safety
      const baseAmount = parseFloat(gasEstimate.amount)
      const gasAmount = (baseAmount * 1.2).toFixed(isArc ? 6 : 6)
      
      if (isArc) {
        // Arc uses USDC as gas token
        // Check network first
        const network = await signer.provider.getNetwork()
        const ARC_TESTNET_CHAIN_ID = 5042002
        if (network.chainId !== BigInt(ARC_TESTNET_CHAIN_ID)) {
          setCctpError(`Please switch to Arc Testnet (Chain ID: ${ARC_TESTNET_CHAIN_ID})`)
          try {
            await (window.ethereum as any).request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${ARC_TESTNET_CHAIN_ID.toString(16)}` }],
            })
            await new Promise(resolve => setTimeout(resolve, 1000))
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              setCctpError('Arc Testnet network not found. Please add it to your wallet.')
            }
            return
          }
        }

        // Arc: USDC is the native token - check native balance and send like ETH
        // IMPORTANT: Even though USDC has 6 decimals, native token transfers use 18 decimals (like ETH)
        const userAddress = await signer.getAddress()
        const nativeBalance = await signer.provider.getBalance(userAddress)
        // Convert USDC amount to 18 decimals for native transfer (Arc native token uses 18 decimals)
        const usdcAmount = ethers.parseEther(gasAmount) // Use 18 decimals for native transfer
        
        // Format balance: nativeBalance is in 18 decimals (native token format)
        const balanceFormatted = ethers.formatEther(nativeBalance)
        if (nativeBalance < usdcAmount) {
          setCctpError(`Insufficient USDC balance. You have ${balanceFormatted} USDC, but need ${gasAmount} USDC for gas.`)
          return
        }

        // Send native USDC transfer (like sending ETH on other chains)
        // On Arc, the native token IS USDC, but native transfers use 18 decimals
        console.log(`[Gas Send] Sending ${gasAmount} USDC (gas) to CCTP wallet on Arc...`)
        console.log(`[Gas Send] Native USDC transfer: sendTransaction({ to: ${cctpWalletAddress}, value: ${usdcAmount.toString()} })`)
        console.log(`[Gas Send] Amount in wei (18 decimals):`, usdcAmount.toString())
        console.log(`[Gas Send] Gas will be automatically deducted from this amount in USDC`)
        const tx = await signer.sendTransaction({
          to: cctpWalletAddress,
          value: usdcAmount // Send native USDC (18 decimals for native transfer)
        })
        console.log(`[Gas Send] Transaction sent: ${tx.hash}`)
        await tx.wait()
        console.log(`[Gas Send] Transaction confirmed!`)

        setCctpStatus(prev => ({
          ...prev,
          gasTxHash: tx.hash,
          message: prev?.message ? prev.message + ` ${gasAmount} USDC (gas) sent!` : `${gasAmount} USDC (gas) sent! Waiting for confirmation...`
        }))
      } else {
        // Other chains use ETH
        const ethAmount = ethers.parseEther(gasAmount)
        
        const tx = await signer.sendTransaction({
          to: cctpWalletAddress,
          value: ethAmount
        })
        await tx.wait()

        setCctpStatus(prev => ({
          ...prev,
          gasTxHash: tx.hash,
          message: prev?.message ? prev.message + ` ${gasAmount} ETH sent!` : `${gasAmount} ETH sent! Waiting for confirmation...`
        }))
      }

      // Refresh balance after sending
      setTimeout(() => refreshCCTPWalletBalance(), 2000)
    } catch (err: any) {
      const gasToken = cctpSourceChain.toLowerCase() === 'arc' ? 'USDC' : 'ETH'
      setCctpError(err.message || `Failed to send ${gasToken}`)
      console.error(`Send ${gasToken} error:`, err)
    } finally {
      setCctpSendingGas(false)
    }
  }
  
  // Keep old function name for backward compatibility
  const handleSendETHToWallet = handleSendGasToWallet

  // Send both USDC and gas token in sequence
  // For Arc: send everything in ONE USDC transaction (transfer + fee + gas)
  // For other chains: send ETH for gas, then USDC for transfer
  const handleSendBothToWallet = async () => {
    if (!cctpWalletAddress || !cctpAmount) {
      setCctpError('Please create a transfer request first')
      return
    }

    const isArc = cctpSourceChain.toLowerCase() === 'arc'
    
    setCctpSendingGas(true)
    setCctpSendingUSDC(true)
    setCctpError('')

    try {
      if (isArc) {
        // Arc: Send everything in ONE USDC transaction (transfer + fee + gas all included)
        console.log('[Send Both] Arc detected - sending transfer + fee + gas in single USDC transaction')
        await handleSendUSDCToWallet() // This now includes gas for Arc
      } else {
        // Other chains: Send ETH for gas first, then USDC for transfer
        console.log('[Send Both] Non-Arc chain - sending ETH for gas, then USDC for transfer')
        await handleSendGasToWallet()
        // Wait a bit for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000))
        // Then send USDC
        await handleSendUSDCToWallet()
      }
    } catch (err: any) {
      setCctpError(err.message || 'Failed to send tokens')
    } finally {
      setCctpSendingGas(false)
      setCctpSendingUSDC(false)
    }
  }

  // Gateway Deposit
  const handleGatewayDeposit = async () => {
    if (!gatewayAmount || parseFloat(gatewayAmount) <= 0) {
      setGatewayError('Please enter a valid amount')
      return
    }

    if (!gatewayToken) {
      setGatewayError('Please enter token address')
      return
    }

    setGatewayLoading(true)
    setGatewayError('')
    setGatewayStatus(null)

    try {
      // Get token decimals (assume 6 for USDC, 18 for others)
      const isUSDC = gatewayToken.toLowerCase().includes('usdc') || 
                     gatewayToken.toLowerCase() === CONTRACTS.USDC?.toLowerCase()
      const decimals = isUSDC ? 6 : 18
      const amountWei = parseTokenAmount(gatewayAmount, decimals)
      
      const result = await apiClient.depositToGateway({
        chain: gatewayChain,
        token: gatewayToken,
        amount: amountWei.toString(),
        depositor: gatewayDepositor || userAddress,
        useOnChain: gatewayUseOnChain
      })

      setGatewayStatus(result)
      
      // Refresh balance
      if (gatewayDepositor || userAddress) {
        setTimeout(() => {
          apiClient.getGatewayBalance(gatewayDepositor || userAddress, gatewayToken)
            .then(balance => {
              const formatted = formatTokenAmount(balance.toString(), 6)
              setGatewayBalance(formatted)
            })
            .catch(() => {})
        }, 2000)
      }
    } catch (err: any) {
      setGatewayError(err.message || 'Gateway deposit failed')
      console.error('Gateway error:', err)
    } finally {
      setGatewayLoading(false)
    }
  }

  // Gateway Withdrawal
  const handleGatewayWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setWithdrawError('Please enter a valid amount')
      return
    }

    if (!withdrawToken) {
      setWithdrawError('Please enter token address')
      return
    }

    setWithdrawLoading(true)
    setWithdrawError('')
    setWithdrawStatus(null)

    try {
      // Get token decimals
      const isUSDC = withdrawToken.toLowerCase().includes('usdc') || 
                     withdrawToken.toLowerCase() === CONTRACTS.USDC?.toLowerCase()
      const decimals = isUSDC ? 6 : 18
      const amountWei = parseTokenAmount(withdrawAmount, decimals)
      
      const result = await apiClient.withdrawFromGateway({
        token: withdrawToken,
        amount: amountWei.toString(),
        targetChain: withdrawTargetChain,
        recipient: withdrawRecipient || userAddress,
        depositor: gatewayDepositor || userAddress
      })

      setWithdrawStatus(result)
    } catch (err: any) {
      setWithdrawError(err.message || 'Gateway withdrawal failed')
      console.error('Withdrawal error:', err)
    } finally {
      setWithdrawLoading(false)
    }
  }

  // Refresh Gateway balance
  const refreshGatewayBalance = async () => {
    if (!gatewayToken || (!gatewayDepositor && !userAddress)) return
    
    try {
      const balance = await apiClient.getGatewayBalance(
        gatewayDepositor || userAddress,
        gatewayToken
      )
      const formatted = formatTokenAmount(balance.toString(), 6)
      setGatewayBalance(formatted)
    } catch (err) {
      console.error('Error fetching Gateway balance:', err)
    }
  }

  // Refresh CCTP wallet balance with gas estimates
  // Memoize to prevent infinite loops
  const refreshCCTPWalletBalance = useCallback(async () => {
    if (!cctpSourceChain || !cctpDestChain) return
    
    try {
      // Fetch balance with gas estimates if we have amount
      const balance = await apiClient.getCCTPWalletBalance(
        cctpSourceChain,
        cctpSourceChain,
        cctpDestChain,
        cctpAmount || '1.0' // Use 1.0 as default for estimation if no amount
      )
      setCctpWalletBalance(balance)
      
      // Update gas estimate state if available
      if (balance?.gasEstimate) {
        setCctpGasEstimate({
          sourceGasCostFormatted: balance.gasEstimate.sourceGasCostFormatted,
          sourceGasToken: balance.gasEstimate.sourceGasToken
        })
      }
    } catch (err) {
      console.error('Error fetching CCTP wallet balance:', err)
      // Don't throw - just log the error to prevent infinite loops
    }
  }, [cctpSourceChain, cctpDestChain, cctpAmount])

  // Only refresh wallet balance manually when needed (after creating transfer, sending tokens, etc.)
  // Removed auto-refresh useEffect to prevent infinite loops

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Cross-Chain Transfer Testing</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test CCTP (USDC) and Gateway (ERC20) transfers between chains
        </p>
      </div>

      {/* Wallet Connection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-2">Wallet Connection</h2>
            {connected ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>Connected: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}</p>
                <p>Network: {isArcNetwork ? 'Arc' : 'Not Arc'}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">Not connected</p>
            )}
          </div>
          <div className="flex gap-2">
            {!connected ? (
              <button
                onClick={connectWallet}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Connect Wallet
              </button>
            ) : !isArcNetwork ? (
              <button
                onClick={handleSwitchNetwork}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Switch to Arc
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* CCTP Transfer Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">CCTP Transfer (USDC)</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Transfer USDC between chains using Circle CCTP. All transfers must involve Arc.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Source Chain</label>
              <select
                value={cctpSourceChain}
                onChange={(e) => setCctpSourceChain(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain} value={chain}>{chain}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Destination Chain</label>
              <select
                value={cctpDestChain}
                onChange={(e) => setCctpDestChain(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain} value={chain}>{chain}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount (USDC)</label>
              <input
                type="number"
                value={cctpAmount}
                onChange={(e) => setCctpAmount(e.target.value)}
                placeholder="100.0"
                step="0.01"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Recipient Address</label>
              <input
                type="text"
                value={cctpRecipient}
                onChange={(e) => setCctpRecipient(e.target.value)}
                placeholder={userAddress || "0x..."}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cctp-fast"
                checked={cctpUseFast}
                onChange={(e) => setCctpUseFast(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="cctp-fast" className="text-sm">Use Fast Attestation (~20-60s)</label>
            </div>

            {!cctpWalletAddress ? (
              <button
                onClick={handleCreateCCTPTransfer}
                disabled={cctpLoading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cctpLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating Transfer...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Create Transfer Request
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Send to CCTP Wallet:
                  </p>
                  <p className="text-xs font-mono text-blue-700 dark:text-blue-300 break-all mb-3">
                    {cctpWalletAddress}
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded">
                      <span className="text-blue-800 dark:text-blue-200">USDC Amount:</span>
                      <span className="font-mono font-semibold text-blue-900 dark:text-blue-100">
                        {cctpAmount} USDC
                      </span>
                    </div>
                    {cctpUseFast && (
                      <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded">
                        <span className="text-blue-800 dark:text-blue-200">Fast Transfer Fee:</span>
                        <span className="font-mono font-semibold text-blue-900 dark:text-blue-100">
                          {(() => {
                            // Use Bridge Kit's maxFee (estimated fee + 10% buffer) if available
                            if (cctpFeeEstimate?.maxFee) {
                              return parseFloat(cctpFeeEstimate.maxFee).toFixed(6);
                            }
                            // Fallback to default calculation
                            const amount = parseFloat(cctpAmount || '0');
                            const feePercent = 0.15; // 0.15%
                            const minFee = 0.02;
                            const calculatedFee = (amount * feePercent) / 100;
                            const fee = calculatedFee > minFee ? calculatedFee : minFee;
                            return fee.toFixed(4);
                          })()} USDC
                        </span>
                      </div>
                    )}
                    {cctpUseFast && cctpFeeEstimate?.estimatedFee && (
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Base Fee (from Bridge Kit):</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">
                          {parseFloat(cctpFeeEstimate.estimatedFee).toFixed(6)} USDC
                        </span>
                      </div>
                    )}
                    {cctpUseFast && (
                      <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border-2 border-blue-300 dark:border-blue-600">
                        <span className="text-blue-800 dark:text-blue-200 font-semibold">Total USDC Needed:</span>
                        <span className="font-mono font-bold text-blue-900 dark:text-blue-100">
                          {(() => {
                            const amount = parseFloat(cctpAmount || '0');
                            // Use Bridge Kit's maxFee if available
                            if (cctpFeeEstimate?.maxFee) {
                              return (amount + parseFloat(cctpFeeEstimate.maxFee)).toFixed(6);
                            }
                            // Fallback to default calculation
                            const feePercent = 0.15; // 0.15%
                            const minFee = 0.02;
                            const calculatedFee = (amount * feePercent) / 100;
                            const fee = calculatedFee > minFee ? calculatedFee : minFee;
                            return (amount + fee).toFixed(4);
                          })()} USDC
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded">
                      <span className="text-blue-800 dark:text-blue-200">
                        {cctpSourceChain.toLowerCase() === 'arc' ? 'USDC (Gas)' : 'ETH (Gas)'}:
                      </span>
                      <span className="font-mono font-semibold text-blue-900 dark:text-blue-100">
                        {(() => {
                          // Use hardcoded gas estimate for the chain
                          const gasEstimate = getGasEstimateForChain(cctpSourceChain)
                          const amount = parseFloat(gasEstimate.amount) * 1.2 // 20% buffer
                          return `~${amount.toFixed(cctpSourceChain.toLowerCase() === 'arc' ? 6 : 6)} ${gasEstimate.token}`
                        })()}
                      </span>
                    </div>
                  </div>
                  {cctpTransferId && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                      Transfer ID: {cctpTransferId}
                    </p>
                  )}
                </div>

                {/* Wallet Balance Info */}
                {cctpWalletBalance && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CCTP Wallet Balance:</span>
                      <button
                        onClick={refreshCCTPWalletBalance}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                        title="Refresh balance"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                    {(() => {
                      const isArc = cctpSourceChain.toLowerCase() === 'arc'
                      const gasToken = cctpWalletBalance.gasToken || (isArc ? 'USDC' : 'ETH')
                      const gasBalance = isArc 
                        ? (cctpWalletBalance.gasBalanceFormatted || cctpWalletBalance.usdcBalanceFormatted || '0')
                        : (cctpWalletBalance.gasBalanceFormatted || cctpWalletBalance.ethBalanceFormatted || '0')
                      
                      // Use hardcoded gas estimate for the chain
                      const chainGasEstimate = getGasEstimateForChain(cctpSourceChain)
                      const minGasRequired = parseFloat(chainGasEstimate.amount)
                      
                      const gasBalanceNum = parseFloat(gasBalance)
                      
                      return (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 dark:text-gray-400">{gasToken} (Gas):</span>
                            <span className="font-mono text-gray-800 dark:text-gray-200">
                              {gasBalanceNum.toFixed(isArc ? 6 : 6)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                            <span>Estimated Needed:</span>
                            <span className="font-mono">
                              {minGasRequired.toFixed(isArc ? 6 : 6)} {chainGasEstimate.token}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 dark:text-gray-400">USDC:</span>
                            <span className="font-mono text-gray-800 dark:text-gray-200">
                              {parseFloat(cctpWalletBalance.usdcBalanceFormatted || '0').toFixed(2)}
                            </span>
                          </div>
                          {gasBalanceNum < minGasRequired && (
                            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium mb-1">
                                ⚠️ Insufficient {gasToken} for Gas!
                              </p>
                              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                Have: {gasBalanceNum.toFixed(isArc ? 6 : 6)} {gasToken}, Need: {minGasRequired.toFixed(isArc ? 6 : 6)} {gasToken}
                              </p>
                              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                Send ~{minGasRequired.toFixed(isArc ? 6 : 6)} {gasToken} to the CCTP wallet for gas fees (use "Send {gasToken}" button above)
                              </p>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    {(() => {
                      const amount = parseFloat(cctpAmount || '0');
                      // Use Bridge Kit's maxFee if available, otherwise use default calculation
                      let fee = 0;
                      if (cctpUseFast) {
                        if (cctpFeeEstimate?.maxFee) {
                          fee = parseFloat(cctpFeeEstimate.maxFee);
                        } else {
                          const feePercent = 0.15; // 0.15%
                          const minFee = 0.02;
                          const calculatedFee = (amount * feePercent) / 100;
                          fee = calculatedFee > minFee ? calculatedFee : minFee;
                        }
                      }
                      const totalNeeded = amount + fee;
                      const currentBalance = parseFloat(cctpWalletBalance.usdcBalanceFormatted || '0');
                      return currentBalance < totalNeeded;
                    })() && (
                      <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium mb-1">
                          ⚠️ Insufficient USDC!
                        </p>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">
                          {(() => {
                            const amount = parseFloat(cctpAmount || '0');
                            let fee = 0;
                            if (cctpUseFast) {
                              if (cctpFeeEstimate?.maxFee) {
                                fee = parseFloat(cctpFeeEstimate.maxFee);
                              } else {
                                const feePercent = 0.15;
                                const minFee = 0.02;
                                const calculatedFee = (amount * feePercent) / 100;
                                fee = calculatedFee > minFee ? calculatedFee : minFee;
                              }
                            }
                            const totalNeeded = amount + fee;
                            return `Need ${totalNeeded.toFixed(6)} USDC total (${amount.toFixed(6)} + ${fee.toFixed(6)} fee)`;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className={`grid gap-2 ${cctpSourceChain.toLowerCase() === 'arc' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {/* Hide gas button for Arc since gas is included in the transfer transaction */}
                  {cctpSourceChain.toLowerCase() !== 'arc' && (
                    <button
                      onClick={handleSendETHToWallet}
                      disabled={cctpSendingGas || cctpDepositReceived}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {cctpSendingGas ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send ETH
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleSendUSDCToWallet}
                    disabled={cctpSendingUSDC || cctpDepositReceived}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {cctpSendingUSDC ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : cctpDepositReceived ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Received
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {cctpSourceChain.toLowerCase() === 'arc' 
                          ? 'Send USDC (Transfer + Gas)'
                          : 'Send USDC'}
                      </>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleSendBothToWallet}
                  disabled={cctpSendingGas || cctpSendingUSDC || cctpDepositReceived}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(cctpSendingGas || cctpSendingUSDC) ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending Both...
                    </>
                  ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {cctpSourceChain.toLowerCase() === 'arc' 
                          ? 'Send Both USDC (Gas + Transfer)'
                          : `Send Both (ETH + USDC)`}
                      </>
                  )}
                </button>

                {cctpCheckingDeposit && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Waiting for deposit confirmation...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {cctpError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{cctpError}</span>
                </div>
              </div>
            )}

            {cctpStatus && (
              <div className={`p-3 border rounded-lg ${
                cctpStatus.step === 'completed' 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : cctpStatus.step === 'deposit_received'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}>
                <div className={`flex items-center gap-2 mb-2 ${
                  cctpStatus.step === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : cctpStatus.step === 'deposit_received'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {cctpStatus.step === 'completed' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : cctpStatus.step === 'deposit_received' ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {cctpStatus.step === 'completed' ? 'Transfer Complete' :
                     cctpStatus.step === 'deposit_received' ? 'Executing Transfer' :
                     'Waiting for Deposit'}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {cctpStatus.message && <p>{cctpStatus.message}</p>}
                  {cctpStatus.depositTxHash && (
                    <p>Deposit TX: {cctpStatus.depositTxHash.slice(0, 10)}...</p>
                  )}
                  {cctpStatus.initiate && cctpStatus.initiate.txHash && (
                    <p>Initiate TX: {cctpStatus.initiate.txHash.slice(0, 10)}...</p>
                  )}
                  {cctpStatus.complete && cctpStatus.complete.txHash && (
                    <p>Complete TX: {cctpStatus.complete.txHash.slice(0, 10)}...</p>
                  )}
                  {cctpStatus.totalTime && (
                    <p>Total Time: {cctpStatus.totalTime}s</p>
                  )}
                </div>
                
                {/* Manual execute button if deposit received but not executing */}
                {cctpStatus.step === 'waiting_deposit' && cctpTransferId && cctpDepositReceived && !cctpLoading && (
                  <button
                    onClick={() => executeCCTPTransfer(cctpTransferId)}
                    className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Manually Execute Transfer
                  </button>
                )}
                
                {/* Manual execute button if status shows deposit_received but not executing */}
                {cctpStatus.step === 'deposit_received' && cctpTransferId && !cctpLoading && (
                  <button
                    onClick={() => executeCCTPTransfer(cctpTransferId)}
                    className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Execute Transfer Now
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Gateway Deposit Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold">Gateway Deposit</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Deposit tokens to Circle Gateway for cross-chain transfers.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Chain</label>
              <select
                value={gatewayChain}
                onChange={(e) => setGatewayChain(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain} value={chain}>{chain}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Token Address</label>
              <input
                type="text"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                placeholder={CONTRACTS.USDC || "0x..."}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input
                type="number"
                value={gatewayAmount}
                onChange={(e) => setGatewayAmount(e.target.value)}
                placeholder="100.0"
                step="0.01"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Depositor Address</label>
              <input
                type="text"
                value={gatewayDepositor}
                onChange={(e) => setGatewayDepositor(e.target.value)}
                placeholder={userAddress || "0x..."}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="gateway-onchain"
                checked={gatewayUseOnChain}
                onChange={(e) => setGatewayUseOnChain(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="gateway-onchain" className="text-sm">Use On-Chain Gateway Wallet</label>
            </div>

            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <span className="text-sm">Gateway Balance:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{gatewayBalance}</span>
                <button
                  onClick={refreshGatewayBalance}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <button
              onClick={handleGatewayDeposit}
              disabled={gatewayLoading}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {gatewayLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Deposit to Gateway
                </>
              )}
            </button>

            {gatewayError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{gatewayError}</span>
                </div>
              </div>
            )}

            {gatewayStatus && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Deposit Complete</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {gatewayStatus.txHash && (
                    <p>TX: {gatewayStatus.txHash.slice(0, 10)}...</p>
                  )}
                  {gatewayStatus.id && (
                    <p>Deposit ID: {gatewayStatus.id}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gateway Withdrawal Section */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl font-semibold">Gateway Withdrawal</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Withdraw tokens from Gateway to a destination chain (mints on destination).
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Target Chain</label>
            <select
              value={withdrawTargetChain}
              onChange={(e) => setWithdrawTargetChain(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
            >
              {SUPPORTED_CHAINS.map(chain => (
                <option key={chain} value={chain}>{chain}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Token Address</label>
            <input
              type="text"
              value={withdrawToken}
              onChange={(e) => setWithdrawToken(e.target.value)}
              placeholder={CONTRACTS.USDC || "0x..."}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="100.0"
              step="0.01"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Recipient Address</label>
            <input
              type="text"
              value={withdrawRecipient}
              onChange={(e) => setWithdrawRecipient(e.target.value)}
              placeholder={userAddress || "0x..."}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
            />
          </div>
        </div>

        <button
          onClick={handleGatewayWithdraw}
          disabled={withdrawLoading}
          className="mt-4 w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {withdrawLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Withdrawing...
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4" />
              Withdraw from Gateway
            </>
          )}
        </button>

        {withdrawError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              <span className="text-sm">{withdrawError}</span>
            </div>
          </div>
        )}

        {withdrawStatus && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Withdrawal Initiated</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {withdrawStatus.id && (
                <p>Withdrawal ID: {withdrawStatus.id}</p>
              )}
              {withdrawStatus.txHash && (
                <p>TX: {withdrawStatus.txHash.slice(0, 10)}...</p>
              )}
              {withdrawStatus.status && (
                <p>Status: {withdrawStatus.status}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

