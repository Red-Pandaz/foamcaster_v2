//TODO: Add logic for LiFi and 0x
//Change constants to main net contract addresses
    const ethers = require('ethers');
    const dotenv = require("dotenv").config();
    const {filterMintBurns, filterAggregatorEvents, filterExchangeTransfers, handleUnfilteredTransfers, getTransferData} = require('./functions/tokenfunctions.js');
    const { updateTimestamp, getLastTimestamp, updateZonesAndClaims, getZoneCollection } = require('./database/database.js');
    const { getClaimEvents, getZoneCreations, getZoneDestructions } = require('./functions/locationfunctions.js')
    const { retryApiCall, processTransferData, accessSecret } = require('./utils/apiutils.js');
    const { sendCastsAndTweets } = require('./farcaster/farcaster.js');
    const constants = require('./constants/constants.js');

    exports.main = async (req, res) => {
        try{

            const INFURA_API = await retryApiCall(() => accessSecret('INFURA_API'));
            const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${INFURA_API}`);
            let currentBlock = await retryApiCall(() => provider.getBlockWithTransactions('latest'))
            let currentTimestamp = Date.now();
            let [lastBlock, lastTimestamp] = await getLastTimestamp()
            let fromBlock = lastBlock + 1;
            let toBlock = currentBlock.number
  
            let cronTime = 1800000;
            let txMinimum = 25000;
            let castsToSend = [];
            let zoneArray = [];
            let claimArray = [];
            let newZones = [];
            let destroyedArray = [];
            let zoneCollection = await getZoneCollection();
    
            // Making sure that block ranges are accessed and ready to use 
    
            if(!currentBlock){
                console.log("Current block could not be aquired from provider.");
                return;
            }
            if(!lastBlock){
                console.log("Last block could not be acquired from database")
                return;
            }
    
            // Checking cron time vs the time elapsed since last timestamp. 
            // If too much time has elapsed it does nothing but try to update and return
            if((currentTimestamp - lastTimestamp) > (cronTime * 3.75)){
                console.log("Too much time in between timestamps, program risks recasting");
                updateTimestamp(currentBlock.number, []);
                return;
            }
            console.log("START BLOCK: " + fromBlock);
            console.log("END BLOCK: " + toBlock);
    
            await getZoneCreations(fromBlock, toBlock, castsToSend, zoneCollection, zoneArray, newZones);
            await getZoneDestructions(fromBlock, toBlock, zoneArray, castsToSend, destroyedArray, newZones);
            await getClaimEvents(fromBlock, toBlock, castsToSend, claimArray, zoneArray);


            // Token ABIs

            const FOAM_TOKEN_ABI = JSON.parse(require('./abi/foamtoken.json').result);
            const UNI_V3_ABI = JSON.parse(require('./abi/univ3pool.json').result);
            const UNI_V3_LIQUIDITY_ABI = JSON.parse(require('./abi/univ3liquidity.json').result);
            const VELEDROME_POOL_ABI = JSON.parse(require('./abi/veledromepoolabi.json').result);
            const VELEDROME_LIQUIDITY_ABI = JSON.parse(require('./abi/veledromeliquidityabi.json').result);

            // Token Contracts/Methods

            const FOAM_TOKEN_CONTRACT = new ethers.Contract(constants.FOAM_ADDRESS, FOAM_TOKEN_ABI, provider);
            const UNI_V3_TOKEN_CONTRACT = new ethers.Contract(constants.UNI_V3_ADDRESS, UNI_V3_ABI, provider);
            const UNI_V3_LIQUIDITY_CONTRACT = new ethers.Contract(constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, provider);
            const VELEDROME_POOL_CONTRACT = new ethers.Contract(constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, provider);
            const VELEDROME_ROUTER_CONTRACT = new ethers.Contract(constants.VELEDROME_LIQUIDITY_TOKEN, VELEDROME_LIQUIDITY_ABI, provider);

            // Token Filters

            const FOAM_TRANSFER_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer();
            
            const UNI_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.UNI_V3_ADDRESS, null );
            const UNI_SELL_FILTER= FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.UNI_V3_ADDRESS);

            const VELEDROME_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.VELEDROME_POOL_ADDRESS, null);
            const VELEDROME_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(null, [constants.VELEDROME_EXECUTIVE_ADDRESS, constants.VELEDROME_POOL_ADDRESS]);

            const ONE_INCH_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer([constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS], constants.ONE_INCH_ROUTER_ADDRESS);
            const ONE_INCH_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.ONE_INCH_ROUTER_ADDRESS, [constants.UNI_V3_ADDRESS, constants.VELEDROME_EXECUTIVE_ADDRESS]);

            const ODOS_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer([constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS,], constants.ODOS_ROUTER_ADDRESS);
            const ODOS_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.ODOS_SALES_ROUTER_ADDRESS, [constants.UNI_V3_ADDRESS, constants.VELEDROME_EXECUTIVE_ADDRESS]);

            const PARASWAP_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer([constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS], constants.PARASWAP_ROUTER_ADDRESS);
            const PARASWAP_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.PARASWAP_ROUTER_ADDRESS, [constants.UNI_V3_ADDRESS, constants.VELEDROME_EXECUTIVE_ADDRESS]);

            const OKX_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer([constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS], constants.OKX_ROUTER_ADDRESSES);
            const OKX_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.OKX_ROUTER_ADDRESSES, [constants.UNI_V3_ADDRESS, constants.VELEDROME_EXECUTIVE_ADDRESS]);

            const MINT_EVENT_FILTER = FOAM_TOKEN_CONTRACT.filters.Mint();
            const BURN_EVENT_FILTER = FOAM_TOKEN_CONTRACT.filters.Burn();
            const MINT_TRANSFER_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.FOAM_MINT_BURN_ADDRESS, null);
            const BURN_TRANSFER_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.FOAM_MINT_BURN_ADDRESS);

            const ARBITRAGE_TRADE_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer( [ constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS ], [ constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS ], null );

    
            // Retrieving filter information from constants
                const filterConstants = [
                { name: "uniOutgoingXfers", filter: UNI_BUY_FILTER },
                { name: "uniIncomingXfers", filter: UNI_SELL_FILTER },
                { name: "veledromeOutgoingXfers", filter: VELEDROME_BUY_FILTER },
                { name: "veledromeIncomingXfers", filter: VELEDROME_SELL_FILTER },
                { name: "oneInchBuys", filter: ONE_INCH_BUY_FILTER },
                { name: "oneInchSells", filter: ONE_INCH_SELL_FILTER },
                { name: "odosBuys", filter: ODOS_BUY_FILTER },
                { name: "odosSells", filter: ODOS_SELL_FILTER },
                { name: "paraswapBuys", filter: PARASWAP_BUY_FILTER },
                { name: "paraswapSells", filter: PARASWAP_SELL_FILTER },
                { name: "okxBuys", filter: OKX_BUY_FILTER },
                { name: "okxSells", filter: OKX_SELL_FILTER },
                { name: "mintEvents", filter: MINT_EVENT_FILTER },
                { name: "mintTransfers", filter: MINT_TRANSFER_FILTER },
                { name: "burnEvents", filter: BURN_EVENT_FILTER },
                { name: "burnTransfers", filter: BURN_TRANSFER_FILTER },
                { name: "allTransfers", filter: FOAM_TRANSFER_FILTER }
            ];
       
                // Scanning chain for Transfer events
                const filterResults = await getTransferData(filterConstants, fromBlock, toBlock);
    
                // Getting ready to process filterResults
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
            { name: "oneInchBuys", func: filterAggregatorEvents, args: [oneInchBuys, castsToSend, "$FOAM bought via 1inch", txMinimum] },
            { name: "oneInchSells", func: filterAggregatorEvents, args: [oneInchSells, castsToSend, "$FOAM sold via 1inch", txMinimum] },
            { name: "odosBuys", func: filterAggregatorEvents, args: [odosBuys, castsToSend, "$FOAM bought via Odos", txMinimum] },
            { name: "odosSells", func: filterAggregatorEvents, args: [odosSells, castsToSend, "$FOAM sold via Odos", txMinimum] },
            { name: "paraswapBuys", func: filterAggregatorEvents, args: [paraswapBuys, castsToSend, "$FOAM bought via Paraswap", txMinimum] },
            { name: "paraswapSells", func: filterAggregatorEvents, args: [paraswapSells, castsToSend, "$FOAM sold via Paraswap", txMinimum] },
            { name: "okxBuys", func: filterAggregatorEvents, args: [okxBuys, castsToSend, "$FOAM bought via OKX", txMinimum] },
            { name: "okxSells", func: filterAggregatorEvents, args: [okxSells, castsToSend, "$FOAM sold via OKX", txMinimum] },
            { name: "uniOutgoingXfers", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_ADDRESS, UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3", "Swap", txMinimum] },
            { name: "uniIncomingXfers", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_ADDRESS, UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3", "Swap", txMinimum] },
            { name: "veledromeOutgoingXfers", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM bought on Veledrome", "Swap", txMinimum] },
            { name: "veledromeIncomingXfers", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM sold on Veledrome", "Swap", txMinimum] },
            { name: "uniOutgoingXfers2", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on UniV3", "DecreaseLiquidity", txMinimum] },
            { name: "uniIncomingXfers2", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on UniV3", "IncreaseLiquidity", txMinimum] },
            { name: "veledromeOutgoingXfers2", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on Veledrome", "Burn", txMinimum] },
            { name: "veledromeIncomingXfers2", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_LIQUIDITY_TOKEN, VELEDROME_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on Veledrome", "Mint", txMinimum] }
        ];
            // Processing all events that requiring additional chain querying
            const filterResults2 = await processTransferData(unprocessedCalls);
        
            // Processing remaining events that don't require additional chain querying
            filterMintBurns(mintTransfers, mintEvents, castsToSend, "$FOAM bridged to Optimism from L1", txMinimum);
            filterMintBurns(burnTransfers, burnEvents, castsToSend, "$FOAM bridged to L1 from Optimism", txMinimum);
         
            handleUnfilteredTransfers(allTransfers, castsToSend, "$FOAM transferred on Optimism", txMinimum);
          
            //Final processing, sent casts out and update databases before returning

            let sentCastArray = await sendCastsAndTweets(castsToSend);
            await updateZonesAndClaims(newZones, destroyedArray, claimArray)
            // await updateTimestamp(currentBlock.number, sentCastArray);
        }catch(err){
        console.log(err)
        return
        }
        console.log("Cloud Function executed");
        return
    }