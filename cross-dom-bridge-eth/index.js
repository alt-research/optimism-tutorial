#! /usr/local/bin/node

// Transfers between L1 and L2 using the Optimism SDK

const ethers = require("ethers")
const optimismSDK = require("@eth-optimism/sdk")
require('dotenv').config()

// const L1CrossDomainMessenger = '0x9e87193B42BEc9fB323F7ef82e451fd991BC0100';
// const L1ERC721Bridge = '0xe7C129B19F17F39029Ed72E29bd7945A9b1Ed328';
// const L1ERC721BridgeProxy = '0x28C566166DB4f16093347b528B055131377F8E02';
// const L1StandardBridge = '0x629E65FeFEF5f5c91497F95c078793475B410512';
// const L2OutputOracle = '0xF38277ABc06c5a864c4BEC66c27f59100f9C85a7';
// const OptimismMintableERC20Factory = '0xf803EAF2334CF9595F54fB982fcf4F1a03A3674d';
// const OptimismMintableERC20FactoryProxy = '0xA0906a4cfED08DcDCa0141cD5992ea6a34Cd6075';
// const OptimismPortal = '0x88Da07E61fe89a3Ebb48FA64e7d37eCC0e6eD119';
// const ProxyAdmin = '0x3a9475237c89E927342C3BE591205f88D7cA33f8';
// const SystemConfig = '0x1C624Cd8d0CEE0CC3Ea8dBF62101900985db8f52';
// const SystemConfigProxy = '0xe97753e009ABE78ceF0dcBbCD6d3C661DAeC5Db0';
const l1Url = `https://eth-sepolia.g.alchemy.com/v2/cLUZG2mwyhiYH06iuK0GOh5fto6jS__t`
const l2Url = `https://opstack-avail-testnet.alt.technology:9545`
const AddressManager = '0x5CdC715827cBA5142037B45246e3e4b7165e1149';
const L1CrossDomainMessengerProxy = '0xca0810a976845BCB0e32e6aB3Cac8079be829f9F';
const L1StandardBridgeProxy = '0x8bbaB07621e162CD339CDCD6AB2662480B676f19';
const L2OutputOracleProxy = '0x623D810D50654f3145B74801C78A72e82667ca8b';
const OptimismPortalProxy = '0xFa9AE12B1139431EADa21228576c4CbDe4010DD5';
const privateKey = '';

// Global variable because we need them almost everywhere
let crossChainMessenger
let addr    // Our address

const getSigners = async () => {
    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
    // const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic)
    // const privateKey = hdNode.derivePath(ethers.utils.defaultPath).privateKey
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}   // getSigners


const setup = async() => {
  const [l1Signer, l2Signer] = await getSigners()
  addr = l1Signer.address
  crossChainMessenger = new optimismSDK.CrossChainMessenger({
      l1ChainId: 11155111,    // Goerli value, 1 for mainnet
      l2ChainId: 42069,  // Goerli value, 10 for mainnet
      l1SignerOrProvider: l1Signer,
      l2SignerOrProvider: l2Signer,
      contracts: optimismSDK.getAllOEContracts(42069, {
        overrides: {
          l1: {
            StateCommitmentChain: '0x0000000000000000000000000000000000000000',
            CanonicalTransactionChain: '0x0000000000000000000000000000000000000000',
            BondManager: '0x0000000000000000000000000000000000000000',
            AddressManager,
            L1CrossDomainMessenger: L1CrossDomainMessengerProxy,
            L1StandardBridge: L1StandardBridgeProxy,
            OptimismPortal: OptimismPortalProxy,
            L2OutputOracle: L2OutputOracleProxy,
          }
        }
      })
  })
}    // setup



const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18
const centieth = eth/100n


const reportBalances = async () => {
  const l1Balance = (await crossChainMessenger.l1Signer.getBalance()).toString().slice(0,-9)
  const l2Balance = (await crossChainMessenger.l2Signer.getBalance()).toString().slice(0,-9)

  console.log(`On L1:${l1Balance} Gwei    On L2:${l2Balance} Gwei`)
}    // reportBalances


const depositETH = async () => {

  console.log("Deposit ETH")
  await reportBalances()
  const start = new Date()

  const response = await crossChainMessenger.depositETH(1000n * gwei)
  console.log(`Transaction hash (on L1): ${response.hash}`)
  await response.wait()
  console.log("Waiting for status to change to RELAYED")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash,
                                                  optimismSDK.MessageStatus.RELAYED)

  await reportBalances()
  console.log(`depositETH took ${(new Date()-start)/1000} seconds\n\n`)
}     // depositETH()





const withdrawETH = async () => { 
  
  console.log("Withdraw ETH")
  const start = new Date()  
  await reportBalances()

  const response = await crossChainMessenger.withdrawETH(centieth)
  console.log(`Transaction hash (on L2): ${response.hash}`)
  console.log(`\tFor more information: https://goerli-optimism.etherscan.io/tx/${response.hash}`)
  await response.wait()

  console.log("Waiting for status to be READY_TO_PROVE")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash, 
    optimismSDK.MessageStatus.READY_TO_PROVE)
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)  
  await crossChainMessenger.proveMessage(response.hash)
  

  console.log("In the challenge period, waiting for status READY_FOR_RELAY") 
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash, 
                                                optimismSDK.MessageStatus.READY_FOR_RELAY) 
  console.log("Ready for relay, finalizing message now")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)  
  await crossChainMessenger.finalizeMessage(response.hash)

  console.log("Waiting for status to change to RELAYED")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)  
  await crossChainMessenger.waitForMessageStatus(response, 
    optimismSDK.MessageStatus.RELAYED)
  
  await reportBalances()   
  console.log(`withdrawETH took ${(new Date()-start)/1000} seconds\n\n\n`)  
}     // withdrawETH()


const main = async () => {
    await setup()
    await depositETH()
    await withdrawETH()
    // await depositERC20()
    // await withdrawERC20()
}  // main



main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })





