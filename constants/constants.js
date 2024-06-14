const ethers = require('ethers')
const { accessSecret, retryApiCall } = require('../utils/apiutils.js')
// const INFURA_API = await retryApiCall(() => accessSecret('INFURA_API'));
const INFURA_API = process.env.INFURA_API
const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${INFURA_API}`);
const testProvider =  new ethers.providers.JsonRpcProvider(`https://devnet-l2.foam.space/api/eth-rpc`);

// Token Addresses
const FOAM_ADDRESS = '0x79E6c6b6aABA4432FAbacB30cC0C879D8f3E598e';
const FOAM_MINT_BURN_ADDRESS = '0x0000000000000000000000000000000000000000';
const UNI_V3_ADDRESS = "0xB2e1aa3bE89504fCC6373139E2bD5575A92A5a26";
const UNI_V3_LIQUIDITY_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const VELEDROME_POOL_ADDRESS = '0xBFfaE96495480581813377448a2BfeA4057d627E';
const VELEDROME_LIQUIDITY_TOKEN = '0xbffae96495480581813377448a2bfea4057d627e';
const VELEDROME_EXECUTIVE_ADDRESS = '0xE6C3e27D93eE2296b8f05467fE9B7A31c9e467A1';
const ODOS_ROUTER_ADDRESS = '0xCa423977156BB05b13A2BA3b76Bc5419E2fE9680';
const ODOS_SALES_ROUTER_ADDRESS = '0x926fAAfcE6148884CD5cF98Cd1878f865E8911Bf';
const ONE_INCH_ROUTER_ADDRESS = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const PARASWAP_ROUTER_ADDRESS = '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57';
const OKX_ROUTER_ADDRESSES = ['0x443EF018e182d409bcf7f794d409bCea4C73C2C7', '0xf332761c673b59B21fF6dfa8adA44d78c12dEF09'];
const VELEDROME_REWARDS_ADDRESS = '0x0583A0a9fD4AF1A93b515A8B57D33B39B2941306';


// Token Methods
const FOAM_TOKEN_XFER_METHOD = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

//Localization Addresses
const BYTES_PARSER_ADDRESS = '0x8fF139f43fA7C77b38EB524d0960C09572dCcf04'
const LOCALIZATION_STORE_ADDRESS = '0xefeff44D8a20C86C65E68b1Dd673Cd15E24855C1'
const CID_MANAGER_ADDRESS = '0x2122BCf033A0ff6c36Ac5d45E5ffbFe2F91251Ae'
const GOSSIP_UTILS_ADDRESS = '0xd0D7687C0612A128E907061E919ea44AB0c99b17'
const TEST_PRESENCE_CLAIM_BOUNTY_ADDRESS = '0x0f7d71925A8FAB24666fd7f4d8Ac6AbD53051d42'
const TEST_ZONE_ADDRESS = '0x2B66f5cB7287C6DEfBaF211dF6F9FC003da78160'
const TEST_FOAM_PRESENCE_CLAIM_ADDRESS = '0x62894DF7e66939e59a20722D713015EBF118B8dA'
const ZONE_ADDRESS = null
const FOAM_PRESENCE_CLAIM_ADDRESS = null



//exporting all constants
module.exports = {
    FOAM_ADDRESS,
    FOAM_MINT_BURN_ADDRESS,
    UNI_V3_ADDRESS,
    UNI_V3_LIQUIDITY_ADDRESS,
    VELEDROME_POOL_ADDRESS,
    VELEDROME_LIQUIDITY_TOKEN,
    VELEDROME_EXECUTIVE_ADDRESS,
    ODOS_ROUTER_ADDRESS,
    ODOS_SALES_ROUTER_ADDRESS,
    ONE_INCH_ROUTER_ADDRESS,
    PARASWAP_ROUTER_ADDRESS,
    OKX_ROUTER_ADDRESSES,
    VELEDROME_REWARDS_ADDRESS,
    FOAM_TOKEN_XFER_METHOD,
    TEST_ZONE_ADDRESS,
    TEST_FOAM_PRESENCE_CLAIM_ADDRESS,
    ZONE_ADDRESS,
    FOAM_PRESENCE_CLAIM_ADDRESS,
};
