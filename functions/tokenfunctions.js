const ethers = require('ethers')
const { accessSecret, retryApiCall } = require('../utils/apiutils.js');
const constants = require('../constants/constants.js');


// There is a bit of redundancy here but transfers to and from the mint/burn address are cross-referenced against mint/burn events
function filterMintBurns(eventArray1, eventArray2, resultArray, messageTemplate, txMinimum) {
    if(!eventArray1 || !eventArray2){
        return
    }
    const filteredEvents = eventArray1.filter(event1 =>
        eventArray2.some(event2 => event2.transactionHash === event1.transactionHash)
    );
    for (const filteredEvent of filteredEvents) {
        if (resultArray.some(obj => obj.transactionHash === filteredEvent.transactionHash)) {
            continue;
        }
        let txValue = ethers.BigNumber.from(Math.round(filteredEvent.args.value* Math.pow(10, -16) / 100))
        if(txValue >= txMinimum){
            let formattedTxValue = txValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
            let castMessage = `${formattedTxValue} ${messageTemplate}${filteredEvent.transactionHash}`
            let newObject = {
                transactionHash: filteredEvent.transactionHash,
                blockHeight: filteredEvent.blockNumber,
                value: parseInt(ethers.BigNumber.from(txValue).toString()),
                cast: castMessage
            };
            resultArray.push(newObject);
           
        }
    };
    return filteredEvents;
}


// Handling transfers to and from Uniswap and Veledrome. This means checking transfers against Swap and Liquidity events
async function filterExchangeTransfers(eventArray, contractAddress, contractABI, resultArray, messageTemplate, contractMethod, txMinimum) {
    const INFURA_API = await retryApiCall(() => accessSecret('INFURA_API'));
    const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${INFURA_API}`);
    if(!eventArray){
        return
    }
    let newContract = new ethers.Contract(contractAddress, contractABI, provider)
    let newContractFilter = null
    if (contractMethod === "Swap"){
        newContractFilter = newContract.filters.Swap()
    }else if(contractMethod === "IncreaseLiquidity"){
        newContractFilter = newContract.filters.IncreaseLiquidity()
    }else if(contractMethod === "DecreaseLiquidity"){
        newContractFilter = newContract.filters.DecreaseLiquidity()
    }else if(contractMethod === "Mint"){
        newContractFilter = newContract.filters.Mint()
    }else if(contractMethod === "Burn"){
        newContractFilter = newContract.filters.Burn()
    }else{
        return
    }
   
    outerLoop:
    for (let i = 0; i < eventArray.length; i++) {
        let event = eventArray[i];
        if(event.args.to === constants.veledromeRewardsAddress){
            continue;
        }
        // Confirming non-existence of event's tx hash before proceeding
        if (resultArray.some(obj => obj.transactionHash === event.transactionHash)) {
            continue outerLoop;
        }
        let blockMatch = await retryApiCall(() => newContract.queryFilter(newContractFilter, event.blockNumber, event.blockNumber));
        if (blockMatch) {
            for (let j = 0; j < blockMatch.length; j++) {
                let match = blockMatch[j];
                if (match.transactionHash === event.transactionHash) {
                    let txValue = ethers.BigNumber.from(Math.round(event.args.value * Math.pow(10, -16) / 100))
                    if (txValue >= txMinimum) {
                        let formattedTxValue = txValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
                        let castMessage = `${formattedTxValue} ${messageTemplate}${event.transactionHash}`
                        let newObject = {
                            transactionHash: event.transactionHash,
                            blockHeight: event.blockNumber,
                            value: parseInt(ethers.BigNumber.from(txValue).toString()),
                            cast: castMessage
                        };
                        resultArray.push(newObject);
                        continue outerLoop;
                    }
                }
            }
        }
    }
}


// The first function that is called after initially gathering all relevant events.
// This must be invoked before general exchange transfer handling or the aggregator aspect of the tx will be overlooked
async function filterAggregatorEvents(events, resultArray, messageTemplate, txMinimum){ 
    const INFURA_API = await retryApiCall(() => accessSecret('INFURA_API'));
    const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${INFURA_API}`);
    // Instantly returns if no events to process
    if (!events) {
        return;
    }
    for (let event of events) {
        let netTransfer = {}; 
        //continues if tx hash is found in array
        if (resultArray.some(obj => obj.transactionHash === event.transactionHash)) {
            continue;
        }
        // Getting transaction receipt for event  
        let receipt = await retryApiCall(() =>  provider.getTransactionReceipt(event.transactionHash));
        let logs = receipt.logs;

        // Selecting only events interacting with the FOAM contract
        logs = logs.filter(log => log.address === constants.FOAM_ADDRESS);
        for (let log of logs) {

            // This is a very important check. Without this non-Transfer FOAM contract events like Approve can interfere with calculations
            if (log.topics[0] !== constants.FOAM_TOKEN_XFER_METHOD) {
                continue;
            }

            const [sender, receiver] = log.topics.slice(1); 
            if (!(sender in netTransfer)) {
                netTransfer[sender] = 0;
            }
            if (!(receiver in netTransfer)) {
                netTransfer[receiver] = 0;
            }

            let logValue = (parseInt(log.data, 16)) * Math.pow(10, -18);

            // Update net transfers based on sender and receiver
            netTransfer[sender] -= logValue; 
            netTransfer[receiver] += logValue; 
        }

        // Calculating the total amount of FOAM transfered by adding up only recieving numbers
        // This is a very big part of why aggregator transactions have to be handled separately
        // If for example someone used an aggregator and used two exchanges each with 80% of the tx threshold it would be overlooked
        let transferTotal = 0;
        const values = Object.values(netTransfer);
        values.forEach(value => {
            if (value > 0) {
                transferTotal += value;
            }
        });

       
        if (transferTotal >= txMinimum) {
            let formattedTxValue = Math.round(transferTotal);
            reFormattedTxValue = formattedTxValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
            let castMessage = `${reFormattedTxValue} ${messageTemplate}${event.transactionHash}`;
            let newObject = {
                transactionHash: event.transactionHash,
                blockHeight: event.blockNumber,
                value: formattedTxValue,
                cast: castMessage
            };
            resultArray.push(newObject);
        }
    }
}

//After processing all notable events, anything that does not have a txnHash in the cast array is treated as a regular tx
function handleUnfilteredTransfers(transfers, resultArray, messageTemplate, txMinimum){
    for(let transfer of transfers){
        if(resultArray.some(obj => obj.transactionHash === transfer.transactionHash)){
            continue;
        }
        let txValue = ethers.BigNumber.from(Math.round(transfer.args.value * Math.pow(10, -16) / 100))
        if(txValue < txMinimum){
            continue;
        }
        let formattedTxValue = txValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
        let castMessage = `${formattedTxValue} ${messageTemplate}${transfer.transactionHash}`
        let newObject = {
            transactionHash: transfer.transactionHash,
            blockHeight: transfer.blockNumber,
            value: parseInt(ethers.BigNumber.from(txValue).toString()),
            cast: castMessage
        }
        resultArray.push(newObject)
    }

}


module.exports = { 
    filterMintBurns,
    filterAggregatorEvents,
    filterExchangeTransfers,
    handleUnfilteredTransfers,
};

