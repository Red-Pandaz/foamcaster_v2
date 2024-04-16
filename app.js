//TODO:
    //  Test new error handlers for tokenfunctions and database code
    // Test to make sure everything works
    //  Look into Google Cloud Function integrations
    //  Add comments to the codebase 

const ethers = require('ethers');
const dotenv = require("dotenv").config();
const {filterMintBurns, filterAggregatorEvents, filterExchangeTransfers, handleUnfilteredTransfers} = require('./functions/tokenfunctions.js');
const { updateTimestamp, getLastTimestamp, pruneDatabaseAndEmail } = require('./database/database.js');
const { retryApiCall, getTransferData, processTransferData, getBlockWithRetry} = require('./utils/apiutils.js');
const { sendCasts } = require('./farcaster/farcaster.js');
const constants = require('./constants/constants.js');
const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API}`);


async function main(){
    try{
        let currentBlock = await getBlockWithRetry(provider)
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

            const filterConstants = [
            { name: "uniOutgoingXfers", filter: constants.UNI_BUY_FILTER },
            { name: "uniIncomingXfers", filter: constants.UNI_SELL_FILTER },
            { name: "veledromeOutgoingXfers", filter: constants.VELEDROME_BUY_FILTER },
            { name: "veledromeIncomingXfers", filter: constants.VELEDROME_SELL_FILTER },
            { name: "oneInchBuys", filter: constants.ONE_INCH_BUY_FILTER },
            { name: "oneInchSells", filter: constants.ONE_INCH_SELL_FILTER },
            { name: "odosBuys", filter: constants.ODOS_BUY_FILTER },
            { name: "odosSells", filter: constants.ODOS_SELL_FILTER },
            { name: "paraswapBuys", filter: constants.PARASWAP_BUY_FILTER },
            { name: "paraswapSells", filter: constants.PARASWAP_SELL_FILTER },
            { name: "okxBuys", filter: constants.OKX_BUY_FILTER },
            { name: "okxSells", filter: constants.OKX_SELL_FILTER },
            { name: "mintEvents", filter: constants.MINT_EVENT_FILTER },
            { name: "mintTransfers", filter: constants.MINT_TRANSFER_FILTER },
            { name: "burnEvents", filter: constants.BURN_EVENT_FILTER },
            { name: "burnTransfers", filter: constants.BURN_TRANSFER_FILTER },
            { name: "allTransfers", filter: constants.FOAM_TRANSFER_FILTER }
        ];
   
       

            const filterResults = await  getTransferData(filterConstants, fromBlock, toBlock);
            // console.log('Filter function results:', results);

            const {
                oneInchBuys,
                oneInchSells,
                odosBuys,
                odosSells,
                paraswapBuys,
                paraswapSells,
                okxBuys,
                okxSells,
                uniOutgoingXfers,
                uniIncomingXfers,
                veledromeOutgoingXfers,
                veledromeIncomingXfers,
                mintEvents,
                mintTransfers,
                burnEvents,
                burnTransfers,
                allTransfers
            } = filterResults
        
     //Aggregator events MUST be caught before exchange events get processed
     const unprocessedCalls = [
        { name: "oneInchBuys", func: filterAggregatorEvents, args: [oneInchBuys, castsToSend, "$FOAM bought via 1inch: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "oneInchSells", func: filterAggregatorEvents, args: [oneInchSells, castsToSend, "$FOAM sold via 1inch: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "odosBuys", func: filterAggregatorEvents, args: [odosBuys, castsToSend, "$FOAM bought via Odos: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "odosSells", func: filterAggregatorEvents, args: [odosSells, castsToSend, "$FOAM sold via Odos: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "paraswapBuys", func: filterAggregatorEvents, args: [paraswapBuys, castsToSend, "$FOAM bought via Paraswap: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "paraswapSells", func: filterAggregatorEvents, args: [paraswapSells, castsToSend, "$FOAM sold via Paraswap: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "okxBuys", func: filterAggregatorEvents, args: [okxBuys, castsToSend, "$FOAM bought via OKX: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "okxSells", func: filterAggregatorEvents, args: [okxSells, castsToSend, "$FOAM sold via OKX: https://optimistic.etherscan.io/tx/", txMinimum] },
        { name: "uniOutgoingXfers", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_ADDRESS, constants.UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3: https://optimistic.etherscan.io/tx/", "Swap", txMinimum] },
        { name: "uniIncomingXfers", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_ADDRESS, constants.UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3: https://optimistic.etherscan.io/tx/", "Swap", txMinimum] },
        { name: "veledromeOutgoingXfers", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_POOL_ADDRESS, constants.VELEDROME_POOL_ABI, castsToSend, "$FOAM bought on Veledrome: https://optimistic.etherscan.io/tx/", "Swap", txMinimum] },
        { name: "veledromeIncomingXfers", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_POOL_ADDRESS, constants.VELEDROME_POOL_ABI, castsToSend, "$FOAM sold on Veledrome: https://optimistic.etherscan.io/tx/", "Swap", txMinimum] },
        { name: "uniOutgoingXfers2", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, constants.UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on UniV3: https://optimistic.etherscan.io/tx/", "DecreaseLiquidity", txMinimum] },
        { name: "uniIncomingXfers2", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, constants.UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on UniV3: https://optimistic.etherscan.io/tx/", "IncreaseLiquidity", txMinimum] },
        { name: "veledromeOutgoingXfers2", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, constants.VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on Veledrome: https://optimistic.etherscan.io/tx/", "Burn", txMinimum] },
        { name: "veledromeIncomingXfers2", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, constants.VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on Veledrome on UniV3: https://optimistic.etherscan.io/tx/", "Mint", txMinimum] }
    ];

        const filterResults2 = await processTransferData(unprocessedCalls);
        // console.log('Filter function results:', filterResults2);
    
        // Selecting minransfers, mintEvents, burnTransfers, burnEvents, and allTransfers from the results object
        filterMintBurns(mintTransfers, mintEvents, castsToSend, "$FOAM bridged to Optimism from L1: https://optimistic.etherscan.io/tx/", txMinimum);
        filterMintBurns(burnTransfers, burnEvents, castsToSend, "$FOAM bridged to L1 from Optimism: https://optimistic.etherscan.io/tx/", txMinimum);
     
        handleUnfilteredTransfers(allTransfers, castsToSend, "$FOAM transferred on Optimism: https://optimistic.etherscan.io/tx/", txMinimum);
      
        console.log(castsToSend)
        let sentCastArray = await sendCasts(castsToSend);
        await updateTimestamp(currentBlock.number, sentCastArray);
    }catch(err){
    console.log(err)
    return
    }
    return
}

module.exports = { main };