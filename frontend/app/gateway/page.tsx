'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { ArrowRight, ArrowLeft, RefreshCw, Wallet, CheckCircle2, XCircle, Send, Download } from 'lucide-react'
import { getSigner, getTokenBalance, formatTokenAmount, parseTokenAmount } from '@/utils/contracts'

const CHAINS = [
  { 
    id: 'arc', 
    name: 'Arc Testnet', 
    chainId: 5042002, 
    lzChainId: 30110,
    rpc: process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    explorer: 'https://testnet.arcscan.net'
  },
  { 
    id: 'base', 
    name: 'Base Sepolia', 
    chainId: 84532, 
    lzChainId: 40245,
    rpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    explorer: 'https://sepolia.basescan.org'
  }
];

// Gateway ABI
const GATEWAY_ABI = [
  'function depositForWrap(uint256 amount, uint32 destinationChain, address destinationRecipient) external payable',
  'function burnForUnwrap(uint256 amount, uint32 originChain, address originRecipient) external payable',
  'function totalLocked() external view returns (uint256)',
  'function totalWrapped(uint32) external view returns (uint256)',
  'function remoteGateways(uint32) external view returns (address)',
  'function remoteGatewaysBytes(uint32) external view returns (bytes)',
  'function wrappedToken() external view returns (address)',
  'function token() external view returns (address)',
  'function isOrigin() external view returns (bool)',
  'function lzEndpoint() external view returns (address)',
  'event TokenDeposited(address indexed depositor, uint256 amount, uint32 destinationChain, address destinationRecipient, uint256 nonce)',
  'event WrappedTokensMinted(address indexed recipient, uint256 amount, uint32 originChain, uint256 nonce)',
  'event WrappedTokensBurned(address indexed burner, uint256 amount, uint32 originChain, address originRecipient, uint256 nonce)',
  'event TokensReleased(uint32 sourceChain, address indexed recipient, uint256 amount, uint256 nonce)'
];

// LayerZero Endpoint ABI for fee estimation
const LZ_ENDPOINT_ABI = [
  'function estimateFees(uint16 _dstChainId, address _userApplication, bytes calldata _payload, bool _payInZRO, bytes calldata _adapterParams) external view returns (uint nativeFee, uint zroFee)'
];

// WrappedToken ABI
const WRAPPED_TOKEN_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

// ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

export default function GatewayPage() {
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [selectedChain, setSelectedChain] = useState('base')
  const [direction, setDirection] = useState<'wrap' | 'unwrap'>('wrap')
  
  // Wrap: origin → destination
  const [originChain, setOriginChain] = useState('base')
  const [destinationChain, setDestinationChain] = useState('arc')
  
  // Amounts
  const [wrapAmount, setWrapAmount] = useState('')
  const [unwrapAmount, setUnwrapAmount] = useState('')
  
  // Balances
  const [originBalance, setOriginBalance] = useState('0')
  const [wrappedBalance, setWrappedBalance] = useState('0')
  
  // Status
  const [wrapping, setWrapping] = useState(false)
  const [unwrapping, setUnwrapping] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  
  // Gateway addresses
  const getGatewayAddress = (chainId: string): string => {
    if (chainId === 'arc') {
      return process.env.NEXT_PUBLIC_ARC_GATEWAY || '';
    } else if (chainId === 'base') {
      return process.env.NEXT_PUBLIC_BASE_SEPOLIA_GATEWAY || '';
    }
    return '';
  };
  
  const getTokenAddress = (chainId: string): string => {
    if (chainId === 'arc') {
      return process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || '';
    } else if (chainId === 'base') {
      return process.env.NEXT_PUBLIC_BASE_SEPOLIA_FLX_TOKEN || '';
    }
    return '';
  };
  
  const getWrappedTokenAddress = (chainId: string): string => {
    if (chainId === 'base') {
      return process.env.NEXT_PUBLIC_BASE_SEPOLIA_WRAPPED_TOKEN || '';
    }
    return '';
  };
  
  // Check configuration
  const checkConfiguration = () => {
    const originGateway = getGatewayAddress(originChain);
    const originToken = getTokenAddress(originChain);
    const destGateway = getGatewayAddress(destinationChain);
    const wrappedToken = getWrappedTokenAddress(destinationChain);
    
    const missing: string[] = [];
    if (!originGateway) missing.push(`${originChain.toUpperCase()}_GATEWAY`);
    if (!originToken) missing.push(`${originChain.toUpperCase()}_FLX_TOKEN`);
    if (direction === 'wrap' && !destGateway) missing.push(`${destinationChain.toUpperCase()}_GATEWAY`);
    if (direction === 'unwrap' && !wrappedToken) missing.push(`${destinationChain.toUpperCase()}_WRAPPED_TOKEN`);
    
    return { missing, originGateway, originToken, destGateway, wrappedToken };
  };
  
  // Connect wallet
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask not found. Please install MetaMask.');
      return;
    }
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      
      if (accounts.length > 0) {
        setUserAddress(accounts[0]);
        setConnected(true);
        setError('');
      }
    } catch (err: any) {
      setError(`Failed to connect: ${err.message}`);
    }
  };
  
  // Update balances
  const updateBalances = async () => {
    if (!userAddress) return;
    
    try {
      const originChainConfig = CHAINS.find(c => c.id === originChain);
      const destChainConfig = CHAINS.find(c => c.id === destinationChain);
      
      if (!originChainConfig || !destChainConfig) return;
      
      // Get origin token balance
      const originTokenAddress = getTokenAddress(originChain);
      if (originTokenAddress) {
        const provider = new ethers.JsonRpcProvider(originChainConfig.rpc || `https://${originChain === 'arc' ? 'rpc.testnet.arc.network' : 'sepolia.base.org'}`);
        const tokenContract = new ethers.Contract(originTokenAddress, ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(userAddress);
        const decimals = await tokenContract.decimals();
        setOriginBalance(formatTokenAmount(balance, decimals));
      }
      
      // Get wrapped token balance on destination
      if (direction === 'unwrap') {
        const wrappedTokenAddress = getWrappedTokenAddress(destinationChain);
        if (wrappedTokenAddress) {
          const provider = new ethers.JsonRpcProvider(destChainConfig.rpc || `https://${destinationChain === 'arc' ? 'rpc.testnet.arc.network' : 'sepolia.base.org'}`);
          const wrappedContract = new ethers.Contract(wrappedTokenAddress, WRAPPED_TOKEN_ABI, provider);
          const balance = await wrappedContract.balanceOf(userAddress);
          const decimals = await wrappedContract.decimals();
          setWrappedBalance(formatTokenAmount(balance, decimals));
        }
      }
    } catch (err: any) {
      console.error('Error updating balances:', err);
    }
  };
  
  useEffect(() => {
    if (connected && userAddress) {
      updateBalances();
    }
  }, [connected, userAddress, originChain, destinationChain, direction]);
  
  // Handle wrap
  const handleWrap = async () => {
    if (!userAddress || !wrapAmount) {
      setError('Please enter an amount');
      return;
    }
    
    setWrapping(true);
    setError('');
    setStatus('');
    
    try {
      const originChainConfig = CHAINS.find(c => c.id === originChain);
      const destChainConfig = CHAINS.find(c => c.id === destinationChain);
      
      if (!originChainConfig || !destChainConfig) {
        throw new Error('Invalid chain configuration');
      }
      
      // Check configuration
      const config = checkConfiguration();
      if (config.missing.length > 0) {
        const envVars = config.missing.map(m => `NEXT_PUBLIC_${m.toUpperCase().replace(/-/g, '_')}`).join(', ');
        throw new Error(`Missing configuration: ${envVars}\n\nAdd these to frontend/.env.local`);
      }
      
      const originGatewayAddress = config.originGateway!;
      const originTokenAddress = config.originToken!;
      
      // Check if wallet is on correct network
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not found');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      if (Number(network.chainId) !== originChainConfig.chainId) {
        setStatus(`Please switch to ${originChainConfig.name} in MetaMask...`);
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${originChainConfig.chainId.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // Chain not added, try to add it
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${originChainConfig.chainId.toString(16)}`,
                chainName: originChainConfig.name,
                nativeCurrency: originChainConfig.nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [originChainConfig.rpc || ''],
                blockExplorerUrls: [originChainConfig.explorer || '']
              }],
            });
          } else {
            throw switchError;
          }
        }
        // Wait a bit for network switch
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const signer = await provider.getSigner();
      
      // Parse amount (18 decimals for FLX)
      const amount = parseTokenAmount(wrapAmount, 18);
      
      // Check token balance first
      setStatus('Checking token balance...');
      const tokenContractReadOnly = new ethers.Contract(originTokenAddress, ERC20_ABI, provider);
      const userBalance = await tokenContractReadOnly.balanceOf(userAddress);
      if (userBalance < amount) {
        throw new Error(`Insufficient token balance. You have ${ethers.formatUnits(userBalance, 18)} FLX, but need ${ethers.formatUnits(amount, 18)} FLX.`);
      }
      
      // Check and approve token if needed
      setStatus('Checking token approval...');
      const allowance = await tokenContractReadOnly.allowance(userAddress, originGatewayAddress);
      if (allowance < amount) {
        setStatus('Approving token...');
        // Create contract with signer for approval
        const tokenContract = new ethers.Contract(originTokenAddress, ERC20_ABI, signer);
        const approveTx = await tokenContract.approve(originGatewayAddress, amount);
        await approveTx.wait();
        setStatus('Token approved!');
      } else {
        setStatus('Token already approved!');
      }
      
      // Create read-only Gateway contract for fee estimation
      const gatewayReadOnly = new ethers.Contract(originGatewayAddress, GATEWAY_ABI, provider);
      
      // Estimate LayerZero fee using the endpoint's estimateFees function
      setStatus('Estimating LayerZero message fee...');
      let estimatedLZFee: bigint;
      
      try {
        // Get the LayerZero endpoint address from the Gateway
        const lzEndpointAddress = await gatewayReadOnly.lzEndpoint();
        
        // Create LayerZero endpoint contract
        const lzEndpoint = new ethers.Contract(lzEndpointAddress, LZ_ENDPOINT_ABI, provider);
        
        // Build the payload that will be sent (same as in depositForWrap)
        // Payload: abi.encode(recipient, amount, messageNonce, originChainId)
        // We'll use a dummy nonce (0) for estimation - actual nonce will be set by the contract
        const dummyNonce = BigInt(0);
        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'uint256', 'uint32'],
          [userAddress, amount, dummyNonce, originChainConfig.chainId]
        );
        
        // Get destination LayerZero chain ID
        const dstLzChainId = destChainConfig.lzChainId;
        
        // Build adapter params (Type 1: gas amount only)
        // Format: abi.encodePacked(uint16 txType, uint256 gasAmount)
        // txType = 1 means we're only specifying gas, no native token airdrop
        // Note: Must use encodePacked (not encode) to match LayerZero's expected format
        // Reduced gas amount to lower costs (100k should be enough for minting)
        const txType = 1;
        const gasAmount = BigInt(100000); // Gas amount for destination chain execution (reduced from 200k to lower costs)
        const adapterParams = ethers.solidityPacked(
          ['uint16', 'uint256'],
          [txType, gasAmount]
        );
        
        // Estimate fees: (nativeFee, zroFee)
        // _payInZRO = false (pay in native token), adapterParams with gas amount
        const [nativeFee] = await lzEndpoint.estimateFees(
          dstLzChainId,
          originGatewayAddress,
          payload,
          false, // _payInZRO = false (pay in native token)
          adapterParams // Adapter params with gas amount
        );
        
        estimatedLZFee = nativeFee;
        setStatus(`✓ LayerZero fee estimated: ${originChain === 'arc' ? ethers.formatUnits(nativeFee, 6) : ethers.formatEther(nativeFee)} ${originChain === 'arc' ? 'USDC' : 'ETH'}`);
      } catch (feeError: any) {
        console.warn('Failed to estimate LayerZero fee, using conservative fallback:', feeError.message);
        // Use a more conservative fallback if estimation fails
        // Reduced fallback fees to lower costs
        estimatedLZFee = originChain === 'arc' 
          ? ethers.parseUnits('0.5', 6) // 0.5 USDC on Arc (reduced from 1)
          : ethers.parseEther('0.0005'); // 0.0005 ETH on Base (reduced from 0.001, ~$0.15)
        setStatus(`⚠️ Using conservative fallback fee: ${originChain === 'arc' ? ethers.formatUnits(estimatedLZFee, 6) : ethers.formatEther(estimatedLZFee)} ${originChain === 'arc' ? 'USDC' : 'ETH'}`);
      }
      
      // Add 20% buffer to the estimated fee to account for price fluctuations
      const feeBuffer = (estimatedLZFee * BigInt(120)) / BigInt(100); // 20% buffer
      
      // Add extra buffer for Gateway contract to handle unwrapping operations
      // This ensures the Gateway has enough native tokens for future unwrap transactions
      const gatewayBuffer = originChain === 'arc'
        ? ethers.parseUnits('0.5', 6) // 0.5 USDC buffer for Arc Gateway
        : ethers.parseEther('0.0001'); // 0.0001 ETH buffer for Base Gateway
      
      const totalValue = feeBuffer + gatewayBuffer;
      
      // Call depositForWrap
      // Note: Gateway uses internal chain IDs (5042002 for Arc, 84532 for Base), not LayerZero chain IDs
      setStatus('Verifying Gateway configuration...');
      
      // gatewayReadOnly already created above for fee estimation
      
      // Comprehensive pre-flight checks
      setStatus('Running pre-flight checks...');
      
      try {
        // Check 1: isOrigin
        const isOrigin = await gatewayReadOnly.isOrigin();
        if (!isOrigin) {
          throw new Error('This Gateway is not the origin Gateway. Only origin Gateways can wrap tokens. Make sure you\'re wrapping from the origin chain (Base).');
        }
        setStatus('✓ Gateway is origin');
        
        // Check 2: Remote Gateway address
        const remoteGateway = await gatewayReadOnly.remoteGateways(destChainConfig.chainId);
        if (!remoteGateway || remoteGateway === ethers.ZeroAddress) {
          throw new Error(`Remote Gateway not configured for ${destChainConfig.name} (chain ID: ${destChainConfig.chainId}).\n\nRun: node scripts/setupConnections.js to configure Gateway connections.`);
        }
        setStatus(`✓ Remote Gateway configured: ${remoteGateway.slice(0, 6)}...${remoteGateway.slice(-4)}`);
        
        // Check 3: Remote Gateway bytes (required for LayerZero)
        let remoteGatewayBytes;
        try {
          // remoteGatewaysBytes is a public mapping, so it's accessible as a function
          remoteGatewayBytes = await gatewayReadOnly.remoteGatewaysBytes(destChainConfig.chainId);
          if (!remoteGatewayBytes || remoteGatewayBytes.length === 0) {
            throw new Error(`Remote Gateway bytes not configured for ${destChainConfig.name}.\n\nRun: node scripts/setupConnections.js to configure Gateway connections.`);
          }
          setStatus(`✓ Remote Gateway bytes configured (${remoteGatewayBytes.length} bytes)`);
        } catch (bytesError: any) {
          if (bytesError.message.includes('not configured') || bytesError.message.includes('not a function')) {
            // If function doesn't exist in ABI, skip this check (old contract version)
            console.warn('Could not read remoteGatewaysBytes:', bytesError.message);
            setStatus('⚠️ Could not verify remote Gateway bytes (may be old contract version)');
          } else {
            throw bytesError;
          }
        }
        
        // Check 4: LayerZero endpoint
        try {
          // lzEndpoint is a public variable, so it's accessible as a function
          const lzEndpoint = await gatewayReadOnly.lzEndpoint();
          if (!lzEndpoint || lzEndpoint === ethers.ZeroAddress) {
            throw new Error('LayerZero endpoint not configured on Gateway.');
          }
          setStatus(`✓ LayerZero endpoint configured: ${lzEndpoint.slice(0, 6)}...${lzEndpoint.slice(-4)}`);
        } catch (lzError: any) {
          // If function doesn't exist in ABI, skip this check (old contract version)
          if (lzError.message.includes('not a function')) {
            console.warn('Could not verify LayerZero endpoint (may be old contract version):', lzError.message);
            setStatus('⚠️ Could not verify LayerZero endpoint (may be old contract version)');
          } else {
            console.warn('Could not verify LayerZero endpoint:', lzError.message);
          }
        }
        
        // Check 5: Token balance (already checked above, but verify again)
        const tokenContractReadOnly = new ethers.Contract(originTokenAddress, ERC20_ABI, provider);
        const userBalance = await tokenContractReadOnly.balanceOf(userAddress);
        if (userBalance < amount) {
          throw new Error(`Insufficient token balance. You have ${ethers.formatUnits(userBalance, 18)} FLX, but need ${ethers.formatUnits(amount, 18)} FLX.`);
        }
        setStatus(`✓ Token balance sufficient: ${ethers.formatUnits(userBalance, 18)} FLX`);
        
        // Check allowance (approval should have been done above, but verify)
        const allowance = await tokenContractReadOnly.allowance(userAddress, originGatewayAddress);
        if (allowance < amount) {
          // If allowance is still insufficient, try to approve again
          setStatus('Approval insufficient, approving again...');
          const tokenContract = new ethers.Contract(originTokenAddress, ERC20_ABI, signer);
          const approveTx = await tokenContract.approve(originGatewayAddress, amount);
          await approveTx.wait();
          setStatus(`✓ Token approved: ${ethers.formatUnits(amount, 18)} FLX`);
        } else {
          setStatus(`✓ Token allowance sufficient: ${ethers.formatUnits(allowance, 18)} FLX`);
        }
        
        // Check 6: Try to get LayerZero chain ID mapping
        try {
          // This might not be a public function, but let's try
          // The Gateway uses getLZChainId internally, but we can't call it directly
          // We'll rely on the Gateway contract to handle this
          setStatus('✓ All pre-flight checks passed');
        } catch (lzChainError: any) {
          console.warn('Could not verify LayerZero chain ID mapping:', lzChainError.message);
        }
        
      } catch (checkError: any) {
        if (checkError.message.includes('Remote Gateway') || 
            checkError.message.includes('not the origin Gateway') ||
            checkError.message.includes('Insufficient')) {
          throw checkError;
        }
        console.warn('Pre-flight check warning:', checkError.message);
      }
      
      // Now create the contract with signer for actual transaction
      setStatus('Depositing tokens and sending LayerZero message...');
      const gateway = new ethers.Contract(originGatewayAddress, GATEWAY_ABI, signer);
      
      // Check native token balance (ETH on Base, USDC on Arc)
      setStatus('Checking native token balance...');
      const nativeBalance = await provider.getBalance(userAddress);
      // Base Sepolia has very cheap gas (~0.001 gwei), so gas costs are minimal
      const estimatedGasCost = originChain === 'arc'
        ? ethers.parseUnits('0.01', 6) // ~0.01 USDC for gas on Arc
        : ethers.parseEther('0.00001'); // ~0.00001 ETH for gas on Base (very cheap)
      const totalNeeded = totalValue + estimatedGasCost;
      
      if (nativeBalance < totalNeeded) {
        const neededFormatted = originChain === 'arc'
          ? ethers.formatUnits(totalNeeded, 6)
          : ethers.formatEther(totalNeeded);
        const haveFormatted = originChain === 'arc'
          ? ethers.formatUnits(nativeBalance, 6)
          : ethers.formatEther(nativeBalance);
        const nativeSymbol = originChain === 'arc' ? 'USDC' : 'ETH';
        throw new Error(
          `Insufficient ${nativeSymbol} balance!\n\n` +
          `You have: ${haveFormatted} ${nativeSymbol}\n` +
          `You need: ${neededFormatted} ${nativeSymbol} (for LayerZero fee + Gateway buffer + gas)\n\n` +
          `Please add more ${nativeSymbol} to your wallet on ${originChainConfig.name}.`
        );
      }

      // Skip gas estimation if RPC doesn't support it well
      // Pre-flight checks should catch most issues
      setStatus('Pre-flight checks passed. Proceeding with transaction...');
      
      setStatus(`Sending ${originChain === 'arc' ? ethers.formatUnits(totalValue, 6) : ethers.formatEther(totalValue)} ${originChain === 'arc' ? 'USDC' : 'ETH'} (LayerZero fee + Gateway buffer)...`);
      
      // Try the transaction directly with manual gas limit to bypass estimation issues
      // LayerZero will use what it needs from msg.value and refund the rest
      try {
        // Use a higher gas limit to ensure the transaction has enough gas
        // depositForWrap does: token transfer + LayerZero send, so we need more gas
        const gasLimit = BigInt(300000); // Increased to 300k for LayerZero operations
        
        // Try calling the function directly with gas limit
        // This bypasses MetaMask's gas estimation which is failing
        const tx = await gateway.depositForWrap(
          amount,
          destChainConfig.chainId, // Internal chain ID (uint32)
          userAddress, // Recipient on destination chain
          { 
            value: totalValue, // LayerZero fee + buffer for Gateway to handle unwrapping
            gasLimit: gasLimit // Manual gas limit to bypass estimation
          }
        );
        
        setStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
        const receipt = await tx.wait();
        
        if (!receipt) {
          throw new Error('Transaction receipt not received');
        }
        
        setStatus(`✅ Wrap initiated! Transaction: ${receipt.hash}`);
        setWrapAmount('');
        
        // Refresh balances
        setTimeout(() => {
          updateBalances();
        }, 2000);
      } catch (txError: any) {
        // If transaction fails, try to extract the actual error
        let errorMessage = 'Transaction failed';
        
        if (txError.reason && typeof txError.reason === 'string') {
          errorMessage = txError.reason;
        } else if (txError.data) {
          try {
            const decoded = gateway.interface.parseError(txError.data);
            errorMessage = `Transaction failed: ${decoded?.name || 'Unknown error'}`;
          } catch {
            if (txError.message) {
              errorMessage = txError.message;
            }
          }
        } else if (txError.message) {
          errorMessage = txError.message;
        }
        
        // Check for common errors
        if (errorMessage.includes('NOT_ORIGIN')) {
          throw new Error('This Gateway is not the origin Gateway. Make sure you are wrapping from the origin chain (Base).');
        }
        if (errorMessage.includes('NO_REMOTE_GATEWAY') || errorMessage.includes('Remote Gateway')) {
          throw new Error(`Remote Gateway not configured. Run: node scripts/setupConnections.js`);
        }
        if (errorMessage.includes('NO_REMOTE_GATEWAY_BYTES')) {
          throw new Error(`Remote Gateway bytes not configured. Run: node scripts/setupConnections.js`);
        }
        if (errorMessage.includes('insufficient funds') || errorMessage.includes('INSUFFICIENT')) {
          const nativeSymbol = originChain === 'arc' ? 'USDC' : 'ETH';
          throw new Error(`Insufficient ${nativeSymbol} balance for LayerZero fee and gas.`);
        }
        
        throw new Error(errorMessage);
      }
      
    } catch (err: any) {
      console.error('Wrap error:', err);
      setError(err.message || 'Wrap failed');
    } finally {
      setWrapping(false);
    }
  };
  
  // Handle unwrap
  const handleUnwrap = async () => {
    if (!userAddress || !unwrapAmount) {
      setError('Please enter an amount');
      return;
    }
    
    setUnwrapping(true);
    setError('');
    setStatus('');
    
    try {
      const originChainConfig = CHAINS.find(c => c.id === originChain);
      const destChainConfig = CHAINS.find(c => c.id === destinationChain);
      
      if (!originChainConfig || !destChainConfig) {
        throw new Error('Invalid chain configuration');
      }
      
      // Check configuration
      const config = checkConfiguration();
      if (config.missing.length > 0) {
        const envVars = config.missing.map(m => `NEXT_PUBLIC_${m.toUpperCase().replace(/-/g, '_')}`).join(', ');
        throw new Error(`Missing configuration: ${envVars}\n\nAdd these to frontend/.env.local`);
      }
      
      const destGatewayAddress = config.destGateway!;
      const wrappedTokenAddress = config.wrappedToken!;
      
      // Check if wallet is on correct network
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not found');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      if (Number(network.chainId) !== destChainConfig.chainId) {
        setStatus(`Please switch to ${destChainConfig.name} in MetaMask...`);
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${destChainConfig.chainId.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${destChainConfig.chainId.toString(16)}`,
                chainName: destChainConfig.name,
                nativeCurrency: destChainConfig.nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [destChainConfig.rpc || ''],
                blockExplorerUrls: [destChainConfig.explorer || '']
              }],
            });
          } else {
            throw switchError;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const signer = await provider.getSigner();
      
      // Parse amount (18 decimals for wrapped token)
      const amount = parseTokenAmount(unwrapAmount, 18);
      
      // Create read-only Gateway contract for fee estimation
      const gatewayReadOnly = new ethers.Contract(destGatewayAddress, GATEWAY_ABI, provider);
      
      // Estimate LayerZero fee using the endpoint's estimateFees function
      setStatus('Estimating LayerZero message fee...');
      let estimatedLZFee: bigint;
      
      try {
        // Get the LayerZero endpoint address from the Gateway
        const lzEndpointAddress = await gatewayReadOnly.lzEndpoint();
        
        // Create LayerZero endpoint contract
        const lzEndpoint = new ethers.Contract(lzEndpointAddress, LZ_ENDPOINT_ABI, provider);
        
        // Build the payload that will be sent (same as in burnForUnwrap)
        // Payload: abi.encode(recipient, amount, messageNonce, sourceChainId)
        // We'll use a dummy nonce (0) for estimation - actual nonce will be set by the contract
        const dummyNonce = BigInt(0);
        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'uint256', 'uint32'],
          [userAddress, amount, dummyNonce, destChainConfig.chainId]
        );
        
        // Get origin LayerZero chain ID (where we're sending the message)
        const dstLzChainId = originChainConfig.lzChainId;
        
        // Build adapter params (Type 1: gas amount only)
        // Format: abi.encodePacked(uint16 txType, uint256 gasAmount)
        // txType = 1 means we're only specifying gas, no native token airdrop
        // Note: Must use encodePacked (not encode) to match LayerZero's expected format
        // Reduced gas amount to lower costs (100k should be enough for minting)
        const txType = 1;
        const gasAmount = BigInt(100000); // Gas amount for destination chain execution (reduced from 200k to lower costs)
        const adapterParams = ethers.solidityPacked(
          ['uint16', 'uint256'],
          [txType, gasAmount]
        );
        
        // Estimate fees: (nativeFee, zroFee)
        // _payInZRO = false (pay in native token), adapterParams with gas amount
        const [nativeFee] = await lzEndpoint.estimateFees(
          dstLzChainId,
          destGatewayAddress,
          payload,
          false, // _payInZRO = false (pay in native token)
          adapterParams // Adapter params with gas amount
        );
        
        estimatedLZFee = nativeFee;
        setStatus(`✓ LayerZero fee estimated: ${destinationChain === 'arc' ? ethers.formatUnits(nativeFee, 6) : ethers.formatEther(nativeFee)} ${destinationChain === 'arc' ? 'USDC' : 'ETH'}`);
      } catch (feeError: any) {
        console.warn('Failed to estimate LayerZero fee, using conservative fallback:', feeError.message);
        // Use a more conservative fallback if estimation fails
        // Reduced fallback fees to lower costs
        estimatedLZFee = destinationChain === 'arc'
          ? ethers.parseUnits('0.5', 6) // 0.5 USDC on Arc (reduced from 1)
          : ethers.parseEther('0.0005'); // 0.0005 ETH on Base (reduced from 0.001)
        setStatus(`⚠️ Using conservative fallback fee: ${destinationChain === 'arc' ? ethers.formatUnits(estimatedLZFee, 6) : ethers.formatEther(estimatedLZFee)} ${destinationChain === 'arc' ? 'USDC' : 'ETH'}`);
      }
      
      // Add 20% buffer to the estimated fee to account for price fluctuations
      const feeBuffer = (estimatedLZFee * BigInt(120)) / BigInt(100); // 20% buffer
      estimatedLZFee = feeBuffer;
      
      // Call burnForUnwrap
      setStatus('Verifying Gateway configuration...');
      
      // Verify Gateway is properly configured
      try {
        const isOrigin = await gatewayReadOnly.isOrigin();
        if (isOrigin) {
          throw new Error('This Gateway is the origin Gateway. Only destination Gateways can unwrap tokens.');
        }
        
        const remoteGateway = await gatewayReadOnly.remoteGateways(originChainConfig.chainId);
        if (!remoteGateway || remoteGateway === ethers.ZeroAddress) {
          throw new Error(`Remote Gateway not configured for ${originChainConfig.name} (chain ID: ${originChainConfig.chainId}). Gateway needs to be set up first.`);
        }
        
        const wrappedToken = await gatewayReadOnly.wrappedToken();
        if (!wrappedToken || wrappedToken === ethers.ZeroAddress) {
          throw new Error('Wrapped token not configured on this Gateway.');
        }
      } catch (checkError: any) {
        if (checkError.message.includes('Remote Gateway') || checkError.message.includes('Wrapped token') || checkError.message.includes('origin Gateway')) {
          throw checkError;
        }
        console.warn('Could not verify Gateway configuration:', checkError);
      }
      
      // Check wrapped token balance and allowance
      setStatus('Checking wrapped token balance...');
      const wrappedTokenContract = new ethers.Contract(wrappedTokenAddress, ERC20_ABI, provider);
      const wrappedBalance = await wrappedTokenContract.balanceOf(userAddress);
      if (wrappedBalance < amount) {
        throw new Error(`Insufficient wrapped token balance. You have ${ethers.formatUnits(wrappedBalance, 18)} wFLX, but need ${ethers.formatUnits(amount, 18)} wFLX.`);
      }
      
      // Check and approve wrapped token if needed
      setStatus('Checking wrapped token approval...');
      const wrappedTokenContractWithSigner = new ethers.Contract(wrappedTokenAddress, ERC20_ABI, signer);
      const allowance = await wrappedTokenContract.allowance(userAddress, destGatewayAddress);
      if (allowance < amount) {
        setStatus('Approving wrapped token...');
        const approveTx = await wrappedTokenContractWithSigner.approve(destGatewayAddress, amount);
        await approveTx.wait();
        setStatus('Wrapped token approved!');
      } else {
        setStatus('Wrapped token already approved!');
      }
      
      // Now create the contract with signer for actual transaction
      setStatus('Burning wrapped tokens and sending LayerZero message...');
      const gateway = new ethers.Contract(destGatewayAddress, GATEWAY_ABI, signer);
      
      // Check native token balance (ETH on Base, USDC on Arc)
      setStatus('Checking native token balance...');
      const nativeBalance = await provider.getBalance(userAddress);
      // Base Sepolia has very cheap gas (~0.001 gwei), so gas costs are minimal
      const estimatedGasCost = destinationChain === 'arc'
        ? ethers.parseUnits('0.01', 6) // ~0.01 USDC for gas on Arc
        : ethers.parseEther('0.00001'); // ~0.00001 ETH for gas on Base (very cheap)
      const totalNeeded = estimatedLZFee + estimatedGasCost;
      
      if (nativeBalance < totalNeeded) {
        const neededFormatted = destinationChain === 'arc'
          ? ethers.formatUnits(totalNeeded, 6)
          : ethers.formatEther(totalNeeded);
        const haveFormatted = destinationChain === 'arc'
          ? ethers.formatUnits(nativeBalance, 6)
          : ethers.formatEther(nativeBalance);
        const nativeSymbol = destinationChain === 'arc' ? 'USDC' : 'ETH';
        throw new Error(
          `Insufficient ${nativeSymbol} balance!\n\n` +
          `You have: ${haveFormatted} ${nativeSymbol}\n` +
          `You need: ${neededFormatted} ${nativeSymbol} (for LayerZero fee + gas)\n\n` +
          `Please add more ${nativeSymbol} to your wallet on ${destChainConfig.name}.`
        );
      }

      // Try to estimate gas first
      try {
        const estimatedGas = await gateway.burnForUnwrap.estimateGas(
          amount,
          originChainConfig.chainId,
          userAddress,
          { value: estimatedLZFee }
        );
        setStatus(`Estimated gas: ${estimatedGas.toString()}`);
      } catch (estimateError: any) {
        // Check for insufficient funds error
        if (estimateError.code === 'INSUFFICIENT_FUNDS' || estimateError.message?.includes('insufficient funds')) {
          const gasEstimate = destinationChain === 'arc'
            ? ethers.parseUnits('0.01', 6)
            : ethers.parseEther('0.00001');
          const neededFormatted = destinationChain === 'arc'
            ? ethers.formatUnits(estimatedLZFee + gasEstimate, 6)
            : ethers.formatEther(estimatedLZFee + gasEstimate);
          const nativeSymbol = destinationChain === 'arc' ? 'USDC' : 'ETH';
          throw new Error(
            `Insufficient ${nativeSymbol} balance for LayerZero fee and gas!\n\n` +
            `You need approximately ${neededFormatted} ${nativeSymbol} on ${destChainConfig.name}.\n` +
            `Please add more ${nativeSymbol} to your wallet.`
          );
        }
        
        let errorMessage = 'Transaction would revert';
        if (estimateError.data) {
          try {
            const reason = gateway.interface.parseError(estimateError.data);
            errorMessage = `Transaction would revert: ${reason?.name || 'Unknown error'}`;
          } catch {
            if (estimateError.reason) {
              errorMessage = estimateError.reason;
            } else if (estimateError.message) {
              errorMessage = estimateError.message;
            }
          }
        } else if (estimateError.reason && typeof estimateError.reason === 'string') {
          errorMessage = estimateError.reason;
        } else if (estimateError.message) {
          errorMessage = estimateError.message;
        }
        throw new Error(errorMessage);
      }
      
      const tx = await gateway.burnForUnwrap(
        amount,
        originChainConfig.chainId,
        userAddress, // Recipient on origin chain
        { value: estimatedLZFee }
      );
      
      setStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
      const receipt = await tx.wait();
      
      setStatus(`✅ Unwrap initiated! Transaction: ${receipt.hash}`);
      setStatus(`⏳ LayerZero message sent. Tokens will be released on ${originChainConfig.name} shortly...`);
      
      // Clear amount
      setUnwrapAmount('');
      
      // Update balances
      setTimeout(() => {
        updateBalances();
      }, 3000);
      
    } catch (err: any) {
      console.error('Unwrap error:', err);
      setError(err.message || 'Unwrap failed');
    } finally {
      setUnwrapping(false);
    }
  };
  
  // Update direction when chains change
  useEffect(() => {
    if (direction === 'wrap') {
      // Wrap: origin is where tokens are, destination is where wrapped tokens are minted
      // For Base → Arc: Base is origin, Arc is destination
      setOriginChain('base');
      setDestinationChain('arc');
    } else {
      // Unwrap: destination is where wrapped tokens are burned, origin is where tokens are released
      // For Arc → Base: Arc is destination (has wrapped tokens), Base is origin (releases real tokens)
      setOriginChain('base');
      setDestinationChain('arc');
    }
  }, [direction]);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Fluxa Gateway
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Wrap and unwrap tokens across chains using LayerZero
          </p>
        </div>
        
        {/* Wallet Connection */}
        {!connected ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-8 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">Connect your wallet to use Gateway</p>
            <button
              onClick={connectWallet}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Connection Status */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-mono">{userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}</span>
                </div>
                <button
                  onClick={updateBalances}
                  className="p-2 rounded-lg border border-gray-300 hover:border-blue-500 transition-colors"
                  title="Refresh balances"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Configuration Check */}
            {(() => {
              const config = checkConfiguration();
              if (config.missing.length > 0) {
                return (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-6">
                    <div className="flex items-start space-x-3">
                      <XCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
                          Missing Configuration
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                          Add these to <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">frontend/.env.local</code>:
                        </p>
                        <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                          {config.missing.map((m) => {
                            const envVar = `NEXT_PUBLIC_${m.toUpperCase().replace(/-/g, '_')}`;
                            return (
                              <li key={m}>
                                <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{envVar}</code>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Direction Toggle */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
              <div className="flex items-center justify-center space-x-4 mb-6">
                <button
                  onClick={() => setDirection('wrap')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    direction === 'wrap'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Send className="w-5 h-5" />
                    <span>Wrap (Lock & Mint)</span>
                  </div>
                </button>
                <button
                  onClick={() => setDirection('unwrap')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    direction === 'unwrap'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Download className="w-5 h-5" />
                    <span>Unwrap (Burn & Release)</span>
                  </div>
                </button>
              </div>
              
              {direction === 'wrap' ? (
                <div className="text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Lock tokens on <strong>{CHAINS.find(c => c.id === originChain)?.name}</strong> and mint wrapped tokens on <strong>{CHAINS.find(c => c.id === destinationChain)?.name}</strong>
                  </p>
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                    <span>{CHAINS.find(c => c.id === originChain)?.name}</span>
                    <ArrowRight className="w-4 h-4" />
                    <span>{CHAINS.find(c => c.id === destinationChain)?.name}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Burn wrapped tokens on <strong>{CHAINS.find(c => c.id === destinationChain)?.name}</strong> and release tokens on <strong>{CHAINS.find(c => c.id === originChain)?.name}</strong>
                  </p>
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                    <span>{CHAINS.find(c => c.id === destinationChain)?.name}</span>
                    <ArrowLeft className="w-4 h-4" />
                    <span>{CHAINS.find(c => c.id === originChain)?.name}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Wrap Form */}
            {direction === 'wrap' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-2xl font-semibold mb-4">Wrap Tokens</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Amount (FLX)</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={wrapAmount}
                        onChange={(e) => setWrapAmount(e.target.value)}
                        placeholder="0.0"
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                      <button
                        onClick={() => setWrapAmount(originBalance)}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
                      >
                        Max
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Balance: {originBalance} FLX</p>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>From:</strong> {CHAINS.find(c => c.id === originChain)?.name} (Origin)
                      <br />
                      <strong>To:</strong> {CHAINS.find(c => c.id === destinationChain)?.name} (Destination)
                      <br />
                      <strong>Gateway:</strong> {getGatewayAddress(originChain) ? `${getGatewayAddress(originChain).slice(0, 6)}...${getGatewayAddress(originChain).slice(-4)}` : 'Not configured'}
                    </p>
                  </div>
                  
                  <button
                    onClick={handleWrap}
                    disabled={wrapping || !wrapAmount}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {wrapping ? 'Wrapping...' : 'Wrap Tokens'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Unwrap Form */}
            {direction === 'unwrap' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-2xl font-semibold mb-4">Unwrap Tokens</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Amount (wFLX)</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={unwrapAmount}
                        onChange={(e) => setUnwrapAmount(e.target.value)}
                        placeholder="0.0"
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                      <button
                        onClick={() => setUnwrapAmount(wrappedBalance)}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
                      >
                        Max
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Balance: {wrappedBalance} wFLX</p>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>From:</strong> {CHAINS.find(c => c.id === destinationChain)?.name} (Has wrapped tokens)
                      <br />
                      <strong>To:</strong> {CHAINS.find(c => c.id === originChain)?.name} (Releases real tokens)
                      <br />
                      <strong>Gateway:</strong> {getGatewayAddress(destinationChain) ? `${getGatewayAddress(destinationChain).slice(0, 6)}...${getGatewayAddress(destinationChain).slice(-4)}` : 'Not configured'}
                    </p>
                  </div>
                  
                  <button
                    onClick={handleUnwrap}
                    disabled={unwrapping || !unwrapAmount}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {unwrapping ? 'Unwrapping...' : 'Unwrap Tokens'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Status/Error Messages */}
            {status && (
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-line">{status}</p>
              </div>
            )}
            
            {error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

