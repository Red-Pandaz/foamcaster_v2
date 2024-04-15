const ethers = require('ethers')
const provider = new ethers.providers.JsonRpcProvider(`https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API}`)
const constants = require('../constants/constants.js');

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





async function filterExchangeTransfers(eventArray, contractAddress, contractABI, resultArray, messageTemplate, contractMethod, txMinimum) {
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
}





async function filterAggregatorEvents(events, resultArray, messageTemplate, txMinimum) {
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
        console.log(logs.length);

        // Filter logs for the specified address
        logs = logs.filter(log => log.address === constants.FOAM_ADDRESS);

        console.log(logs);

        const addresses = event.topics.slice(1); 
        addresses.forEach(address => {
            console.log(address);
            if (!(address in netTransfer)) {
                netTransfer[address] = 0;
            }
            if (address === event.topics[1]) {
                netTransfer[address] -= parseInt(event.data, 16) / 10**18; // Assuming data is hexadecimal
            } else {
                netTransfer[address] += parseInt(event.data, 16) / 10**18; // Assuming data is hexadecimal
            }
        });
       
    }
   console.log(netTransfer)
    let transferTotal = 0;
    const values = Object.values(netTransfer);
    values.forEach(value => {
    
        if (value > 0) {
            transferTotal += value;
        }
    }); 

    if (transferTotal >= txMinimum) {
        let formattedTxValue = Math.round(transferTotal)
        let castMessage = `${formattedTxValue} ${messageTemplate}${events[0].transactionHash}`;
        let newObject = {
            transactionHash: events[0].transactionHash,
            blockHeight: events[0].blockNumber,
            value: formattedTxValue,
            cast: castMessage
        };
        resultArray.push(newObject);
        console.log(newObject)
    }

}



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

