const ethers = require('ethers')
const constants = require('./constants/constants.js');

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
                throw error; // Throw the error if max retries are reached
            }
        }
    }
}

async function getTransferData(filterConstants, fromBlock, toBlock) {
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

    return results;
}

      
async function processTransferData(unprocessedTransfers) {
    const results = {};

    for (const { name, func, args } of unprocessedTransfers) {
        try {
            results[name] = await retryApiCall(() => func(...args));
        } catch (error) {
            console.error(`Error processing ${name}: ${error}`);
            // Handle the error if needed
        }
    }
    return results;
}



module.exports = { retryApiCall, getTransferData, processTransferData }