const ethers = require('ethers');
const dotenv = require("dotenv").config();
const {filterMintBurns, filterAggregatorEvents, filterExchangeTransfers, handleUnfilteredTransfers, handleUnfilteredBaseTransfers, getTransferData, getBaseTransferData, filterBaseExchangeEvents, filterBaseSwapEvents, filterBaseMintBurns, filterBaseAggregatorEvents} = require('./functions/tokenfunctions.js');
const { updateTimestamp, getLastTimestamp, updateZonesAndClaims, getZoneCollection } = require('./database/database.js');
const { getClaimEvents, getZoneCreations, getZoneDestructions } = require('./functions/locationfunctions.js')
const { retryApiCall, processTransferData, accessSecret } = require('./utils/apiutils.js');
const { sendCastsAndTweets } = require('./farcaster/farcaster.js');
const constants = require('./constants/constants.js');
    // async function main(){
    exports.main = async (req, res) => {
        try{

            const INFURA_API = await retryApiCall(() => accessSecret('INFURA_API'));
            const ALCHEMY_API = await retryApiCall(() => accessSecret('ALCHEMY_API'));
            const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${INFURA_API}`);
         
            let currentBlock = await retryApiCall(() => provider.getBlockWithTransactions('latest'))
            const baseProvider = new ethers.providers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API}`);
            let baseCurrentBlock = await retryApiCall(() => baseProvider.getBlockWithTransactions('latest'))
            let currentTimestamp = Date.now();
            let [lastBlock, lastTimestamp, lastBaseBlock] = await getLastTimestamp()
            let fromBlock = lastBlock + 1;
            let toBlock = currentBlock.number
            let baseFromBlock = null

            if(lastBaseBlock){
                baseFromBlock = lastBaseBlock + 1
            } else{
                baseFromBlock = baseCurrentBlock.number - 1800
            }
            let baseToBlock = baseCurrentBlock.number
  
            let cronTime = 1800000;
            let txMinimum = 10000;
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
                updateTimestamp(currentBlock.number, baseCurrentBlock.number, []);
                return;
            }
            console.log("OP START BLOCK: " + fromBlock);
            console.log("OP END BLOCK: " + toBlock);
            console.log("BASE START BLOCK: " + baseFromBlock)
            console.log("BASE TO BLOCK: " + baseToBlock)

    
            await getZoneCreations(baseFromBlock, baseToBlock, castsToSend, zoneCollection, zoneArray, newZones);
            await getZoneDestructions(baseFromBlock, baseToBlock, zoneArray, castsToSend, destroyedArray, newZones);
            await getClaimEvents(baseFromBlock, baseToBlock, castsToSend, claimArray, zoneArray);
            await updateZonesAndClaims(newZones, destroyedArray, claimArray)



            // Optimism Token ABIs

            const FOAM_TOKEN_ABI = JSON.parse(require('./abi/foamtoken.json').result);
            const UNI_V3_ABI = JSON.parse(require('./abi/univ3pool.json').result);
            const UNI_V3_LIQUIDITY_ABI = JSON.parse(require('./abi/univ3liquidity.json').result);
            const VELEDROME_POOL_ABI = JSON.parse(require('./abi/veledromepoolabi.json').result);
            const VELEDROME_LIQUIDITY_ABI = JSON.parse(require('./abi/veledromeliquidityabi.json').result);

            // Base Token ABIs
            const BASE_FOAM_TOKEN_ABI = JSON.parse(require('./abi/basefoamtoken.json').result);
            const BASE_UNI_V3_ABI = JSON.parse(require('./abi/baseuniv3pool.json').result);
            const BASE_UNI_V3_LIQUIDITY_ABI = JSON.parse(require('./abi/baseuniv3liquidity.json').result);


            // Optimism Token Contracts/Methods

            const FOAM_TOKEN_CONTRACT = new ethers.Contract(constants.FOAM_ADDRESS, FOAM_TOKEN_ABI, provider);
            const UNI_V3_TOKEN_CONTRACT = new ethers.Contract(constants.UNI_V3_ADDRESS, UNI_V3_ABI, provider);
            const UNI_V3_LIQUIDITY_CONTRACT = new ethers.Contract(constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, provider);
            const VELEDROME_POOL_CONTRACT = new ethers.Contract(constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, provider);
            const VELEDROME_ROUTER_CONTRACT = new ethers.Contract(constants.VELEDROME_LIQUIDITY_TOKEN, VELEDROME_LIQUIDITY_ABI, provider);

            // Base Token Contracts/Methods
            const BASE_FOAM_TOKEN_CONTRACT = new ethers.Contract(constants.BASE_FOAM_ADDRESS, BASE_FOAM_TOKEN_ABI, baseProvider);

            // Optimism Token Filters

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

            const ZERO_X_BUY_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer([constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS], constants.ZERO_X_ROUTER_ADDRESS);
            const ZERO_X_SELL_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.ZERO_X_ROUTER_ADDRESS, [constants.UNI_V3_ADDRESS, constants.VELEDROME_EXECUTIVE_ADDRESS]);

            const MINT_EVENT_FILTER = FOAM_TOKEN_CONTRACT.filters.Mint();
            const BURN_EVENT_FILTER = FOAM_TOKEN_CONTRACT.filters.Burn();
            const MINT_TRANSFER_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(constants.FOAM_MINT_BURN_ADDRESS, null);
            const BURN_TRANSFER_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.FOAM_MINT_BURN_ADDRESS);

            const ARBITRAGE_TRADE_FILTER = FOAM_TOKEN_CONTRACT.filters.Transfer( [ constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS ], [ constants.UNI_V3_ADDRESS, constants.VELEDROME_POOL_ADDRESS ], null );


            //Base Token Filters
            const BASE_WETH_UNI_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_UNIV3_WETH_ADDRESS , null);
            const BASE_WETH_UNI_SELL_FILTER= BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_UNIV3_WETH_ADDRESS);
    
            const BASE_USDC_UNI_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_UNIV3_USDC_ADDRESS , null );
            const BASE_USDC_UNI_SELL_FILTER= BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_UNIV3_USDC_ADDRESS);
            
            const BASE_AERODROME_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_AERODROME_POOL_ADDRESS , null);
            const BASE_AERODROME_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_AERODROME_POOL_ADDRESS);

            const BASE_ONE_INCH_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer([constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS], constants.BASE_ONE_INCH_ROUTER_ADDRESS);
            const BASE_ONE_INCH_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_ONE_INCH_ROUTER_ADDRESS, [constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS]);

            const BASE_PARASWAP_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer([constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS], constants.BASE_PARASWAP_ROUTER_ADDRESS);
            const BASE_PARASWAP_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_PARASWAP_ROUTER_ADDRESS, [constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS]);
    
            const BASE_FOAM_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer();
            const BASE_MINT_EVENT_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Mint();
            const BASE_BURN_EVENT_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Burn();
            const BASE_MINT_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.FOAM_MINT_BURN_ADDRESS, null);
            const BASE_BURN_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.FOAM_MINT_BURN_ADDRESS);

    
            // Optimism filter constants
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
                { name: "zeroXBuys", filter: ZERO_X_BUY_FILTER },
                { name: "zeroXSells", filter: ZERO_X_SELL_FILTER },
                { name: "mintEvents", filter: MINT_EVENT_FILTER },
                { name: "mintTransfers", filter: MINT_TRANSFER_FILTER },
                { name: "burnEvents", filter: BURN_EVENT_FILTER },
                { name: "burnTransfers", filter: BURN_TRANSFER_FILTER },
                { name: "allTransfers", filter: FOAM_TRANSFER_FILTER },
                
            ];

            //Base filter constants
            const baseFilterConstants = [
            
                { name: "baseUniWETHOutgoingXfers", filter: BASE_WETH_UNI_BUY_FILTER },
                { name: "baseUniWETHIncomingXfers", filter: BASE_WETH_UNI_SELL_FILTER },
                { name: "baseUniUSDCOutgoingXfers", filter: BASE_USDC_UNI_BUY_FILTER },
                { name: "baseUniUSDCIncomingXfers", filter: BASE_USDC_UNI_SELL_FILTER },

                { name: "baseAerodromeOutgoingXfers", filter: BASE_AERODROME_BUY_FILTER },
                { name: "baseAerodromeIncomingXfers", filter: BASE_AERODROME_SELL_FILTER },

                { name: "baseOneInchBuys", filter: BASE_ONE_INCH_BUY_FILTER },
                { name: "baseOneInchSells", filter: BASE_ONE_INCH_SELL_FILTER },
                { name: "baseParaswapBuys", filter: BASE_PARASWAP_BUY_FILTER },
                { name: "baseParaswapSells", filter: BASE_PARASWAP_SELL_FILTER },


                { name: "baseMintEvents", filter: BASE_MINT_EVENT_FILTER },
                { name: "baseMintTransfers", filter: BASE_MINT_TRANSFER_FILTER },
                { name: "baseBurnEvents", filter: BASE_BURN_EVENT_FILTER },
                { name: "baseBurnTransfers", filter: BASE_BURN_TRANSFER_FILTER },
                { name: "allBaseTransfers", filter: BASE_FOAM_TRANSFER_FILTER }
            ]
       
                // Scanning chain for Transfer events
                const filterResults = await getTransferData(filterConstants, fromBlock, toBlock);
                const baseFilterResults = await getBaseTransferData(baseFilterConstants, baseFromBlock, baseToBlock);
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
                    zeroXBuys,
                    zeroXSells,
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

                const {
                    baseMintEvents,
                    baseMintTransfers,
                    baseBurnEvents,
                    baseBurnTransfers,
                    allBaseTransfers,
                    baseUniWETHOutgoingXfers,
                    baseUniWETHIncomingXfers,
                    baseUniUSDCOutgoingXfers,
                    baseUniUSDCIncomingXfers,
                    baseAerodromeOutgoingXfers,
                    baseAerodromeIncomingXfers,
                    baseOneInchBuys,
                    baseOneInchSells,
                    baseParaswapBuys,
                    baseParaswapSells,
                } = baseFilterResults
            
         //Aggregator events MUST be caught before exchange events get processed
         const unprocessedCalls = [
            { name: "oneInchBuys", func: filterAggregatorEvents, args: [oneInchBuys, castsToSend, "$FOAM bought via 1inch (Optimism):", txMinimum] },
            { name: "oneInchSells", func: filterAggregatorEvents, args: [oneInchSells, castsToSend, "$FOAM sold via 1inch (Optimism):", txMinimum] },
            { name: "odosBuys", func: filterAggregatorEvents, args: [odosBuys, castsToSend, "$FOAM bought via Odos (Optimism):", txMinimum] },
            { name: "odosSells", func: filterAggregatorEvents, args: [odosSells, castsToSend, "$FOAM sold via Odos (Optimism):", txMinimum] },
            { name: "paraswapBuys", func: filterAggregatorEvents, args: [paraswapBuys, castsToSend, "$FOAM bought via Paraswap (Optimism):", txMinimum] },
            { name: "paraswapSells", func: filterAggregatorEvents, args: [paraswapSells, castsToSend, "$FOAM sold via Paraswap (Optimism):", txMinimum] },
            { name: "okxBuys", func: filterAggregatorEvents, args: [okxBuys, castsToSend, "$FOAM bought via OKX (Optimism):", txMinimum] },
            { name: "okxSells", func: filterAggregatorEvents, args: [okxSells, castsToSend, "$FOAM sold via OKX (Optimism):", txMinimum] },
            { name: "zeroXBuys", func: filterAggregatorEvents, args: [zeroXBuys, castsToSend, "$FOAM bought via 0x (Optimism):", txMinimum] },
            { name: "zeroXSells", func: filterAggregatorEvents, args: [zeroXSells, castsToSend, "$FOAM sold via 0x (Optimism):", txMinimum] },
            { name: "uniOutgoingXfers", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_ADDRESS, UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3 (Optimism):", "Swap", txMinimum] },
            { name: "uniIncomingXfers", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_ADDRESS, UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3 (Optimism):", "Swap", txMinimum] },
            { name: "veledromeOutgoingXfers", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM bought on Veledrome (Optimism):", "Swap", txMinimum] },
            { name: "veledromeIncomingXfers", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM sold on Veledrome (Optimism):", "Swap", txMinimum] },
            { name: "uniOutgoingXfers2", func: filterExchangeTransfers, args: [uniOutgoingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from liquidity on UniV3 (Optimism):", "DecreaseLiquidity", txMinimum] },
            { name: "uniIncomingXfers2", func: filterExchangeTransfers, args: [uniIncomingXfers, constants.UNI_V3_LIQUIDITY_ADDRESS, UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to liquidity on UniV3 (Optimism):", "IncreaseLiquidity", txMinimum] },
            { name: "veledromeOutgoingXfers2", func: filterExchangeTransfers, args: [veledromeOutgoingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM removed from liquidity on Veledrome (Optimism):", "Burn", txMinimum] },
            { name: "veledromeIncomingXfers2", func: filterExchangeTransfers, args: [veledromeIncomingXfers, constants.VELEDROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM added to liquidity on Veledrome (Optimism):", "Mint", txMinimum] }
        ];
            // Processing all events that requiring additional chain querying
            const filterResults2 = await processTransferData(unprocessedCalls);

                     //Aggregator events MUST be caught before exchange events get processed
         const unprocessedBaseCalls = [
            { name: "baseOneInchBuys", func: filterBaseAggregatorEvents, args: [baseOneInchBuys, castsToSend, "$FOAM bought via 1inch (Base):", txMinimum] },
            { name: "baseOneInchSells", func: filterBaseAggregatorEvents, args: [baseOneInchSells, castsToSend, "$FOAM sold via 1inch (Base):", txMinimum] },
            { name: "baseParaswapBuys", func: filterBaseAggregatorEvents, args: [baseParaswapBuys, castsToSend, "$FOAM bought via Paraswap (Base):", txMinimum] },
            { name: "baseParaswapSells", func: filterBaseAggregatorEvents, args: [baseParaswapSells, castsToSend, "$FOAM sold via Paraswap (Base):", txMinimum] },

            
            { name: "uniWETHOutgoingXfers", func: filterBaseExchangeEvents, args: [baseUniWETHOutgoingXfers, constants.BASE_UNIV3_WETH_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3 (Base):", "Swap", txMinimum] }, 
            { name: "uniWETHIncomingXfers", func: filterBaseExchangeEvents, args: [baseUniWETHIncomingXfers, constants.BASE_UNIV3_WETH_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3 (Base):", "Swap", txMinimum] },
            { name: "uniWETHOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseUniWETHOutgoingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from $WETH liquidity pool on UniV3 (Base):", "DecreaseLiquidity", txMinimum] },
            { name: "uniWETHIncomingXfers2", func: filterBaseExchangeEvents, args: [baseUniWETHIncomingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to $WETH liquidity pool on UniV3 (Base):", "IncreaseLiquidity", txMinimum] },
            
            { name: "uniUSDCOutgoingXfers", func: filterBaseExchangeEvents, args: [baseUniUSDCOutgoingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3 (Base):", "Swap", txMinimum] },
            { name: "uniUSDCIncomingXfers", func: filterBaseExchangeEvents, args: [baseUniUSDCIncomingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3 (Base):", "Swap", txMinimum] },
            { name: "uniUSDCOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseUniUSDCOutgoingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from $USDC liquidity pool on UniV3 (Base):", "DecreaseLiquidity", txMinimum] },
            { name: "uniUSDCIncomingXfers2", func: filterBaseExchangeEvents, args: [baseUniUSDCIncomingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to $USDC liquidity pool on UniV3 (Base):", "IncreaseLiquidity", txMinimum] },

            { name: "aerodromeOutgoingXfers", func: filterBaseExchangeEvents, args: [baseAerodromeOutgoingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on Aerodrome (Base):", "Swap", txMinimum] },
            { name: "aerodromeIncomingXfers", func: filterBaseExchangeEvents, args: [baseAerodromeIncomingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on Aerodrome (Base):", "Swap", txMinimum] },
            { name: "aerodromeOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseAerodromeOutgoingXfers, constants.BASE_AERODROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM removed from liquidity on Aerodrome (Base):", "Burn", txMinimum] },
            { name: "aerodromeIncomingXfers2", func: filterBaseExchangeEvents, args: [baseAerodromeIncomingXfers, constants.BASE_AERODROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM added to liquidity on Aerodrome (Base):", "Mint", txMinimum] },
        ];

              // Processing all events that requiring additional chain querying
        const baseFilterResults2 = await processTransferData(unprocessedBaseCalls);
        
        
            // Processing remaining Optimism events that don't require additional chain querying
            await filterMintBurns(mintTransfers, mintEvents, castsToSend, "$FOAM bridged to Optimism from L1:", txMinimum);
            await filterMintBurns(burnTransfers, burnEvents, castsToSend, "$FOAM bridged to L1 from Optimism:", txMinimum);
         
            await handleUnfilteredTransfers(allTransfers, castsToSend, "$FOAM transferred on Optimism:", txMinimum);


            // Processing remaining Base events that don't require additional chain querying
            await filterBaseMintBurns(baseMintTransfers, baseMintEvents, castsToSend, "$FOAM bridged to Base from L1:", txMinimum);
            await filterBaseMintBurns(baseBurnTransfers, baseBurnEvents, castsToSend, "$FOAM bridged to L1 from Base:", txMinimum);

            await handleUnfilteredBaseTransfers(allBaseTransfers, castsToSend, "$FOAM transferred on Base:", txMinimum);
        
          
            //Final processing, sent casts out and update database before returning
            let sentCastArray = await sendCastsAndTweets(castsToSend);
            await updateTimestamp(currentBlock.number, baseCurrentBlock.number, sentCastArray);
        }catch(err){
        console.log(err)
        return
        }
        console.log("Cloud Function executed");
        return
    }
// main()

// async function testBaseAggregator(){
//     const ALCHEMY_API = await retryApiCall(() => accessSecret('ALCHEMY_API'));
//     const baseProvider = new ethers.providers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API}`);
//     let baseCurrentBlock = await retryApiCall(() => baseProvider.getBlockWithTransactions('latest'))
//     let baseFromBlock = baseCurrentBlock.number - 200000
//     let baseToBlock = baseCurrentBlock.number

//     let cronTime = 1800000;
//     let txMinimum = 1000;
//     let castsToSend = [];


//     // Optimism Token ABIs

//     const FOAM_TOKEN_ABI = JSON.parse(require('./abi/foamtoken.json').result);
//     const UNI_V3_ABI = JSON.parse(require('./abi/univ3pool.json').result);
//     const UNI_V3_LIQUIDITY_ABI = JSON.parse(require('./abi/univ3liquidity.json').result);
//     const VELEDROME_POOL_ABI = JSON.parse(require('./abi/veledromepoolabi.json').result);
//     const VELEDROME_LIQUIDITY_ABI = JSON.parse(require('./abi/veledromeliquidityabi.json').result);

//     // Base Token ABIs
//     const BASE_FOAM_TOKEN_ABI = JSON.parse(require('./abi/basefoamtoken.json').result);
//     const BASE_UNI_V3_ABI = JSON.parse(require('./abi/baseuniv3pool.json').result);
//     const BASE_UNI_V3_LIQUIDITY_ABI = JSON.parse(require('./abi/baseuniv3liquidity.json').result);

//      // Base Token Contracts/Methods
//     const BASE_FOAM_TOKEN_CONTRACT = new ethers.Contract(constants.BASE_FOAM_ADDRESS, BASE_FOAM_TOKEN_ABI, baseProvider);
//     //Base Token Filters
//     const BASE_WETH_UNI_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_UNIV3_WETH_ADDRESS , null);
//     const BASE_WETH_UNI_SELL_FILTER= BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_UNIV3_WETH_ADDRESS);
         
//     const BASE_USDC_UNI_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_UNIV3_USDC_ADDRESS , null );
//     const BASE_USDC_UNI_SELL_FILTER= BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_UNIV3_USDC_ADDRESS);
                 
//     const BASE_AERODROME_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_AERODROME_POOL_ADDRESS , null);
//     const BASE_AERODROME_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.BASE_AERODROME_POOL_ADDRESS);
     
//     const BASE_ONE_INCH_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer([constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS], constants.BASE_ONE_INCH_ROUTER_ADDRESS);
//     const BASE_ONE_INCH_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_ONE_INCH_ROUTER_ADDRESS, [constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS]);
     
//     const BASE_PARASWAP_BUY_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer([constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS], constants.BASE_PARASWAP_ROUTER_ADDRESS);
//     const BASE_PARASWAP_SELL_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.BASE_PARASWAP_ROUTER_ADDRESS, [constants.BASE_UNIV3_WETH_ADDRESS, constants.BASE_UNIV3_USDC_ADDRESS, constants.BASE_AERODROME_POOL_ADDRESS]);
         
//     const BASE_FOAM_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer();
//     const BASE_MINT_EVENT_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Mint();
//     const BASE_BURN_EVENT_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Burn();
//     const BASE_MINT_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(constants.FOAM_MINT_BURN_ADDRESS, null);
//     const BASE_BURN_TRANSFER_FILTER = BASE_FOAM_TOKEN_CONTRACT.filters.Transfer(null, constants.FOAM_MINT_BURN_ADDRESS);

//     //Base filter constants
//     const baseFilterConstants = [
            
//         { name: "baseUniWETHOutgoingXfers", filter: BASE_WETH_UNI_BUY_FILTER },
//         { name: "baseUniWETHIncomingXfers", filter: BASE_WETH_UNI_SELL_FILTER },
//         { name: "baseUniUSDCOutgoingXfers", filter: BASE_USDC_UNI_BUY_FILTER },
//         { name: "baseUniUSDCIncomingXfers", filter: BASE_USDC_UNI_SELL_FILTER },
    
//         { name: "baseAerodromeOutgoingXfers", filter: BASE_AERODROME_BUY_FILTER },
//         { name: "baseAerodromeIncomingXfers", filter: BASE_AERODROME_SELL_FILTER },
    
//         { name: "baseOneInchBuys", filter: BASE_ONE_INCH_BUY_FILTER },
//         { name: "baseOneInchSells", filter: BASE_ONE_INCH_SELL_FILTER },
//         { name: "baseParaswapBuys", filter: BASE_PARASWAP_BUY_FILTER },
//         { name: "baseParaswapSells", filter: BASE_PARASWAP_SELL_FILTER },
    
    
//         { name: "baseMintEvents", filter: BASE_MINT_EVENT_FILTER },
//         { name: "baseMintTransfers", filter: BASE_MINT_TRANSFER_FILTER },
//         { name: "baseBurnEvents", filter: BASE_BURN_EVENT_FILTER },
//         { name: "baseBurnTransfers", filter: BASE_BURN_TRANSFER_FILTER },
//         { name: "allBaseTransfers", filter: BASE_FOAM_TRANSFER_FILTER }
//     ]

//     const baseFilterResults = await getBaseTransferData(baseFilterConstants, baseFromBlock, baseToBlock);
//     const {
//         baseMintEvents,
//         baseMintTransfers,
//         baseBurnEvents,
//         baseBurnTransfers,
//         allBaseTransfers,
//         baseUniWETHOutgoingXfers,
//         baseUniWETHIncomingXfers,
//         baseUniUSDCOutgoingXfers,
//         baseUniUSDCIncomingXfers,
//         baseAerodromeOutgoingXfers,
//         baseAerodromeIncomingXfers,
//         baseOneInchBuys,
//         baseOneInchSells,
//         baseParaswapBuys,
//         baseParaswapSells,
//     } = baseFilterResults

//     //Aggregator events MUST be caught before exchange events get processed
//     const unprocessedBaseCalls = [
//         { name: "baseOneInchBuys", func: filterBaseAggregatorEvents, args: [baseOneInchBuys, castsToSend, "$FOAM bought via 1inch (Base):", txMinimum] },
//         { name: "baseOneInchSells", func: filterBaseAggregatorEvents, args: [baseOneInchSells, castsToSend, "$FOAM sold via 1inch (Base):", txMinimum] },
//         { name: "baseParaswapBuys", func: filterBaseAggregatorEvents, args: [baseParaswapBuys, castsToSend, "$FOAM bought via Paraswap (Base):", txMinimum] },
//         { name: "baseParaswapSells", func: filterBaseAggregatorEvents, args: [baseParaswapSells, castsToSend, "$FOAM sold via Paraswap (Base):", txMinimum] },
                    
                                
//         // { name: "uniWETHOutgoingXfers", func: filterBaseExchangeEvents, args: [baseUniWETHOutgoingXfers, constants.BASE_UNIV3_WETH_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3 (Base):", "Swap", txMinimum] }, 
//         // { name: "uniWETHIncomingXfers", func: filterBaseExchangeEvents, args: [baseUniWETHIncomingXfers, constants.BASE_UNIV3_WETH_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3 (Base):", "Swap", txMinimum] },
//         // { name: "uniWETHOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseUniWETHOutgoingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from $WETH liquidity pool on UniV3 (Base):", "DecreaseLiquidity", txMinimum] },
//         // { name: "uniWETHIncomingXfers2", func: filterBaseExchangeEvents, args: [baseUniWETHIncomingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to $WETH liquidity pool on UniV3 (Base):", "IncreaseLiquidity", txMinimum] },
                                
//         // { name: "uniUSDCOutgoingXfers", func: filterBaseExchangeEvents, args: [baseUniUSDCOutgoingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on UniV3 (Base):", "Swap", txMinimum] },
//         // { name: "uniUSDCIncomingXfers", func: filterBaseExchangeEvents, args: [baseUniUSDCIncomingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on UniV3 (Base):", "Swap", txMinimum] },
//         // { name: "uniUSDCOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseUniUSDCOutgoingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM removed from $USDC liquidity pool on UniV3 (Base):", "DecreaseLiquidity", txMinimum] },
//         // { name: "uniUSDCIncomingXfers2", func: filterBaseExchangeEvents, args: [baseUniUSDCIncomingXfers, constants.BASE_UNIV3_LIQUIDITY_ADDRESS, BASE_UNI_V3_LIQUIDITY_ABI, castsToSend, "$FOAM added to $USDC liquidity pool on UniV3 (Base):", "IncreaseLiquidity", txMinimum] },
                    
//         { name: "aerodromeOutgoingXfers", func: filterBaseExchangeEvents, args: [baseAerodromeOutgoingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM bought on Aerodrome (Base):", "Swap", txMinimum] },
//         { name: "aerodromeIncomingXfers", func: filterBaseExchangeEvents, args: [baseAerodromeIncomingXfers, constants.BASE_UNIV3_USDC_ADDRESS, BASE_UNI_V3_ABI, castsToSend, "$FOAM sold on Aerodrome (Base):", "Swap", txMinimum] },
//         { name: "aerodromeOutgoingXfers2", func: filterBaseExchangeEvents, args: [baseAerodromeOutgoingXfers, constants.BASE_AERODROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM removed from liquidity on Aerodrome (Base):", "Burn", txMinimum] },
//         { name: "aerodromeIncomingXfers2", func: filterBaseExchangeEvents, args: [baseAerodromeIncomingXfers, constants.BASE_AERODROME_POOL_ADDRESS, VELEDROME_POOL_ABI, castsToSend, "$FOAM added to liquidity on Aerodrome (Base):", "Mint", txMinimum] },
// ];
                
//     // Processing all events that requiring additional chain querying
//     const baseFilterResults2 = await processTransferData(unprocessedBaseCalls);
//     // Processing remaining Base events that don't require additional chain querying
//     await filterBaseMintBurns(baseMintTransfers, baseMintEvents, castsToSend, "$FOAM bridged to Base from L1:", txMinimum);
//     await filterBaseMintBurns(baseBurnTransfers, baseBurnEvents, castsToSend, "$FOAM bridged to L1 from Base:", txMinimum);
   
//     console.log(castsToSend)


// }

// testBaseAggregator()