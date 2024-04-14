//TODO: Restructure directory according to best practices
    //  Look into a way to neatly wrap up all API requests in error handlers
    //  Add comments to the codebase 

const ethers = require('ethers');
const dotenv = require("dotenv").config();
const {filterMintBurns, filterAggregatorEvents, filterExchangeTransfers, handleUnfilteredTransfers, handleArbitrageTransfers} = require('./functions/tokenfunctions.js');
const { updateTimestamp, getLastTimestamp, pruneDatabaseAndEmail } = require('./database/database.js');
const { sendCasts } = require('./farcaster/farcaster.js');
const constants = require('./constants/constants.js');
const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API}`);


async function main(){
    try{
        let currentBlock = await provider.getBlockWithTransactions('latest');
        let currentTimestamp = Date.now();
        let [lastBlock, lastTimestamp] = await getLastTimestamp();
        let fromBlock = lastBlock + 1;
        let toBlock = currentBlock.number;
        let cronTime = 1800000;
        let txMinimum = 50000;
        let castsToSend = [];

        if(!currentBlock){
            console.log("Current block could not be aquired from provider.");
            return;
        }
        if(!lastBlock){
            console.log("Last block could not be acquired from database")
            return;
        }
        if((currentTimestamp - lastTimestamp) > (cronTime * 3.75)){
            console.log("Too much time in between timestamps, program risks recasting");
            updateTimestamp(currentBlock.number, []);
            return;
        }
        console.log("START BLOCK: " + fromBlock);
        console.log("END BLOCK: " + toBlock);

        let uniOutgoingXfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.UNI_BUY_FILTER, fromBlock, toBlock);
        let uniIncomingXfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.UNI_SELL_FILTER, fromBlock, toBlock);
        let veledromeOutgoingXfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.VELEDROME_BUY_FILTER, fromBlock, toBlock);
        let veledromeIncomingXfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.VELEDROME_SELL_FILTER, fromBlock, toBlock);

        let oneInchBuys = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.ONE_INCH_BUY_FILTER, fromBlock, toBlock);
        let oneInchSells = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.ONE_INCH_SELL_FILTER, fromBlock, toBlock);
        let odosBuys = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.ODOS_BUY_FILTER, fromBlock, toBlock);
        let odosSells = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.ODOS_SELL_FILTER, fromBlock, toBlock);
        let paraswapBuys = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.PARASWAP_BUY_FILTER, fromBlock, toBlock);
        let paraswapSells = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.PARASWAP_SELL_FILTER, fromBlock, toBlock);
        let okxBuys = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.OKX_BUY_FILTER, fromBlock, toBlock);
        let okxSells = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.OKX_SELL_FILTER, fromBlock, toBlock);

        let mintEvents = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.MINT_EVENT_FILTER, fromBlock, toBlock);
        let mintTransfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.MINT_TRANSFER_FILTER, fromBlock, toBlock);
        let burnEvents = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.BURN_EVENT_FILTER, fromBlock, toBlock);
        let burnTransfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.BURN_TRANSFER_FILTER, fromBlock, toBlock);

        let allTransfers = await constants.FOAM_TOKEN_CONTRACT.queryFilter(constants.FOAM_TRANSFER_FILTER, fromBlock, toBlock);
    

        filterMintBurns(mintTransfers, mintEvents, castsToSend, "$FOAM bridged to Optimism from L1: https://optimistic.etherscan.io/tx/", txMinimum);
        filterMintBurns(burnTransfers, burnEvents, castsToSend, "$FOAM bridged to L1 from Optimism: https://optimistic.etherscan.io/tx/", txMinimum);

        //Aggregator events MUST be caught before exchange events get processed
        await filterAggregatorEvents(oneInchBuys, castsToSend, "$FOAM bought via 1inch: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(oneInchSells, castsToSend, "$FOAM sold via 1inch: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(odosBuys, castsToSend, "$FOAM bought via Odos: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(odosSells, castsToSend, "$FOAM sold via Odos: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(paraswapBuys, castsToSend, "$FOAM bought via Paraswap: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(paraswapSells, castsToSend, "$FOAM sold via Paraswap: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(okxBuys, castsToSend, "$FOAM bought via OKX: https://optimistic.etherscan.io/tx/", txMinimum);
        await filterAggregatorEvents(okxSells, castsToSend, "$FOAM sold via OKX: https://optimistic.etherscan.io/tx/", txMinimum);

        await filterExchangeTransfers(uniOutgoingXfers, constants.UNI_V3_ADDRESS, constants.UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3: https://optimistic.etherscan.io/tx/", "Swap", txMinimum);
        await filterExchangeTransfers(uniIncomingXfers, constants.UNI_V3_ADDRESS, constants.UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3: https://optimistic.etherscan.io/tx/", "Swap", txMinimum);
        await filterExchangeTransfers(veledromeOutgoingXfers, constants.VELEDROME_POOL_ADDRESS, constants.VELEDROME_POOL_ABI, castsToSend, "$FOAM bought on Veledrome: https://optimistic.etherscan.io/tx/", "Swap", txMinimum);
        await filterExchangeTransfers(veledromeIncomingXfers, constants.VELEDROME_POOL_ADDRESS, constants.VELEDROME_POOL_ABI, castsToSend, "$FOAM sold on Veledrome: https://optimistic.etherscan.io/tx/", "Swap", txMinimum);
        await filterExchangeTransfers(uniOutgoingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, constants.UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on UniV3: https://optimistic.etherscan.io/tx/", "DecreaseLiquidity", txMinimum);
        await filterExchangeTransfers(uniIncomingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, constants.UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on UniV3: https://optimistic.etherscan.io/tx/", "IncreaseLiquidity", txMinimum);
        await filterExchangeTransfers(veledromeOutgoingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, constants.VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on Veledrome: https://optimistic.etherscan.io/tx/", "Burn", txMinimum);
        await filterExchangeTransfers(veledromeIncomingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, constants.VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on Veledrome on UniV3: https://optimistic.etherscan.io/tx/", "Mint", txMinimum);

        handleUnfilteredTransfers(allTransfers, castsToSend, "$FOAM transferred on Optimism: https://optimistic.etherscan.io/tx/", txMinimum);
       

        let sentCastArray = await sendCasts(castsToSend);
        await updateTimestamp(currentBlock.number, sentCastArray);
       
        return;
    }catch(err){
        console.log(err);
        return;
    }
}

module.exports = { main };