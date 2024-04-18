const ethers = require('ethers')
const constants = require('../constants/constants.js');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Here we define several functions that are designed for the sole purpose of handling API errors in other functions

// The main function of this script that is invoked in other other functions
// Allows failed API calls to try up to 5 times before reporting an error

// Utility function used solely to wrap other functions in event handling
async function retryApiCall(apiCall, maxRetries = 5, delayBetweenRetries = 1000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const result = await apiCall();
            return result; 
        } catch (error) {
            console.error(`API call failed: ${error.message}`);
            retries++;
            if (retries < maxRetries) {
                console.log(`Retrying API call (${retries}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenRetries)); 
            } else {
                console.error('Max retries reached, giving up.');
                throw error; 

            }
        }
    }
return
}

// Utility function made to wrap initial event scanning into error handling
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
  console.log("UNPROCESSED TRANSFERS: " + unprocessedTransfers)
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
    const maxRetries = 5; 
    const delayBetweenRetries = 1000; 
  
    try {
      return await retryApiCall(async () => {
        return await provider.getBlockWithTransactions('latest');
      }, maxRetries, delayBetweenRetries);
    } catch (error) {
      console.error('Failed to get block with retries:', error.message);
      throw error; 
    }
  }

//This latest update is intended to make the project compatible with Google Clound Functions. That means integrating Google Secrets instead of using .env
 async function accessSecret(secretName) {
  const client = new SecretManagerServiceClient();

  try {
    const name = client.secretVersionPath('foamcaster-2', secretName, 'latest'); // Replace with your project ID
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload.data.toString('utf8');
    return payload;
  } catch (error) {
    console.error('Error accessing secret:', error);
    throw error;
  }
}


module.exports = { retryApiCall, getTransferData, processTransferData, getBlockWithRetry, accessSecret }