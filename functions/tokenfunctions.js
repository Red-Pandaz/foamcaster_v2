const ethers = require('ethers')
const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API}`)
const constants = require('../constants/constants.js');

function filterMintBurns(eventArray1, eventArray2, resultArray, messageTemplate, txMinimum) {
    console.log("starting filterMintBurns")
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
    console.log("ending filterMintBurns")
    return filteredEvents;
}





async function filterExchangeTransfers(eventArray, contractAddress, contractABI, resultArray, messageTemplate, contractMethod, txMinimum) {
    console.log("starting filterExchangeTransfers")
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
        if (resultArray.some(obj => obj.transactionHash === event.transactionHash)) {
            continue outerLoop;
        }
        let blockMatch = await newContract.queryFilter(newContractFilter, event.blockNumber, event.blockNumber);
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
console.log("ending filterExchangeTransfers")
}





async function filterAggregatorEvents(events, resultArray, messageTemplate, txMinimum) {
    console.log("starting filterAggregatorEvents")
    if (!events) {
        return;
    }
    
    let netTransfer = {};
    for (let event of events) {
        if (resultArray.some(obj => obj.transactionHash === event.transactionHash)) {
            continue;
        }
      
        
        let receipt = await provider.getTransactionReceipt(event.transactionHash);
        let logs = receipt.logs;
   
  

        // Filter logs for the specified address
        logs = logs.filter(log => log.address === constants.FOAM_ADDRESS);

        // Iterate over filtered logs
        for (let log of logs) {
          
               //disregarding methods that aren't Transfer 
            if (log.topics[0] !== constants.FOAM_TOKEN_XFER_METHOD){
                continue;
            }
            const [sender, receiver] = log.topics.slice(1); // Extract sender and receiver addresses

            // Initialize net transfers for sender and receiver if not already present
            if (!(sender in netTransfer)) {
                netTransfer[sender] = 0;
            }
            if (!(receiver in netTransfer)) {
                netTransfer[receiver] = 0;
            }
        
            let logValue = (parseInt(log.data, 16)) * Math.pow(10, -18)
            console.log(log)
            console.log(logValue)
            // Update net transfers based on sender and receiver
            netTransfer[sender] -= logValue; // Subtract from sender
            netTransfer[receiver] += logValue; // Add to receiver
            console.log(netTransfer[sender])
            console.log(netTransfer[receiver])
        }
    }

    let transferTotal = 0;
    const values = Object.values(netTransfer);
    
    values.forEach(value => {
    
        if (value > 0) {
            transferTotal += value;
        }
    }); 
    console.log(transferTotal)
    if (transferTotal >= txMinimum) {
        let formattedTxValue = Math.round(transferTotal)
        console.log(formattedTxValue)
      
        let castMessage = `${formattedTxValue} ${messageTemplate}${events[0].transactionHash}`;
        let newObject = {
            transactionHash: events[0].transactionHash,
            blockHeight: events[0].blockNumber,
            value: formattedTxValue,
            cast: castMessage
        };
        resultArray.push(newObject);

    }
console.log("ending filterAggregatorEvents")
}



function handleUnfilteredTransfers(transfers, resultArray, messageTemplate, txMinimum){
    console.log("starting handleUnfilteredTransfers")
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
console.log("ending handleUnfilteredTransfers")
}


module.exports = { 
    filterMintBurns,
    filterAggregatorEvents,
    filterExchangeTransfers,
    handleUnfilteredTransfers,
};

