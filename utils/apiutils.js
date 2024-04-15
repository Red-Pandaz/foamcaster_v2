const ethers = require('ethers')
const constants = require('../constants/constants.js');

async function retryApiCall(apiCall, maxRetries = 5, delayBetweenRetries = 1000) {
    console.log("starting retryApiCall")
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const result = await apiCall();
            return result; // Return the result if the API call is successful
        } catch (error) {
            console.error(`API call failed: ${error.message}`);
            retries++;
            if (retries < maxRetries) {
                console.log(`Retrying API call (${retries}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenRetries)); // Wait before retrying
            } else {
                console.error('Max retries reached, giving up.');
                throw error; // Throw the error if max retries are reached

            }
        }
    }
console.log("ending retryApiCall")
return
}

async function getTransferData(filterConstants, fromBlock, toBlock) {
    console.log("starting getTransferData")
    const results = {};

    for (const { name, filter } of filterConstants) {
        try {
            const apiCall = () => constants.FOAM_TOKEN_CONTRACT.queryFilter(filter, fromBlock, toBlock);
            results[name] = await retryApiCall(apiCall);

        } catch (error) {
            console.error(`Error processing ${name}: ${error}`);
            // Handle the error if needed
        }
    }
    console.log("ending getTransferData")
    return results;
}

      
async function processTransferData(unprocessedTransfers) {
    console.log("starting processTransferData")
    const results = {};

    for (const { name, func, args } of unprocessedTransfers) {
        // Skip processing if args is undefined
        if (!args[0]) {
            console.error(`Error processing ${name}: Arguments are undefined`);
            continue; // Skip to the next iteration
        }
        try {
            results[name] = await retryApiCall(() => func(...args));
        } catch (error) {
            console.error(`Error processing ${name}: ${error}`);
            // Handle the error if needed
        }
    }
    console.log("ending processTransferData")
    return results;
}

async function getBlockWithRetry(provider) {
    const maxRetries = 5; // Set the maximum number of retries
    const delayBetweenRetries = 1000; // Set the delay between retries in milliseconds
  
    try {
      return await retryApiCall(async () => {
        return await provider.getBlockWithTransactions('latest');
      }, maxRetries, delayBetweenRetries);
    } catch (error) {
      console.error('Failed to get block with retries:', error.message);
      // Handle error here (optional)
      throw error; // Re-throw the error for further handling
    }
  }




module.exports = { retryApiCall, getTransferData, processTransferData, getBlockWithRetry }