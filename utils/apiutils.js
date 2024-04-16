const ethers = require('ethers')
const constants = require('../constants/constants.js');

// Here we define several functions that are designed for the sole purpose of handling API errors in other functions

// The main function of this script that is invoked in other other functions
// Allows failed API calls to try up to 5 times before reporting an error
async function retryApiCall(apiCall, maxRetries = 5, delayBetweenRetries = 1000) {
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
                throw error; 

            }
        }
    }
return
}

// Function to protect functions retrieving primary events from Infura
async function getTransferData(filterConstants, fromBlock, toBlock) {
    const results = {};
    for (const { name, filter } of filterConstants) {
        try {
            const apiCall = () => constants.FOAM_TOKEN_CONTRACT.queryFilter(filter, fromBlock, toBlock);
            results[name] = await retryApiCall(apiCall);
        } catch (error) {
            console.error(`Error processing ${name}: ${error}`);
            return;
        }
    }
  
    return results;
}


// Function for protecting functions that make secondary API calls after the initial retrieval
async function processTransferData(unprocessedTransfers) {
    const results = {};
    for (const { name, func, args } of unprocessedTransfers) {
        // Skip processing if args is undefined
        if (!args[0]) {
            console.error(`Error processing ${name}: Arguments are undefined`);
            continue; 
        }
        try {
            results[name] = await retryApiCall(() => func(...args));
        } catch (error) {
            console.error(`Error processing ${name}: ${error}`);
            throw error
        }
    }
    return results;
}

//Function just to protect the current block retrieval in main()
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