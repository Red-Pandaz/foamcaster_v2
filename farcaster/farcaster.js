const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
const crypto = require('crypto'); // Import the crypto module
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');

async function sendCasts(castArray) {
    const SIGNER_UUID = await retryApiCall(() => accessSecret('SIGNER_UUID'))
    const NEYNAR_API_KEY = await retryApiCall(() => accessSecret('NEYNAR_API_KEY'))
    // Maintain a map to track sent cast hashes for each transaction hash
    const sentHashesMap = new Map();
    
    let sentArray = [];
    // Organize by block height and remove duplicates
    castArray.sort((a, b) => a.blockHeight - b.blockHeight);
    for (let i = 0; i < castArray.length; i++) {
        const castObject = castArray[i];
    
        // Check if the transaction hash has already been sent
        if (sentHashesMap.has(castObject.transactionHash)) {
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            // If the cast hash for this transaction hash matches, skip
            if (sentHashesMap.get(castObject.transactionHash) === castHash) {
                console.log(`Vote with transaction hash ${castObject.transactionHash} (Cast ${castObject.cast}) has already been sent. Skipping.`);
                continue;
            }
        }
        // Cast the vote and handle the response
        const result = await retryApiCall(async () => {
            return sdk.postCast({
                text: castObject.cast,
                signer_uuid: SIGNER_UUID
            }, { api_key: NEYNAR_API_KEY });
        }); // Close the parenthesis for retryApiCall
        
        // If the vote was successfully cast, add the cast hash to the map
        if (result) {
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            sentHashesMap.set(castObject.transactionHash, castHash);
            console.log("Success! Cast: " + castObject.cast);
            sentArray.push(castObject); // Add the successful cast object to sentArray
        }
    
        // Add a delay of 5 seconds between each iteration
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return sentArray;
}
module.exports = { sendCasts };


