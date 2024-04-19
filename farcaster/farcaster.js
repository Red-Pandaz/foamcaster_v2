const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');


async function sendCasts(castArray) {
    const SIGNER_UUID = await retryApiCall(() => accessSecret('SIGNER_UUID'))
    const NEYNAR_API_KEY = await retryApiCall(() => accessSecret('NEYNAR_API_KEY'))
    let sentArray = [];
    // Organize by block height and remove duplicates
    castArray.sort((a, b) => a.blockHeight - b.blockHeight);
    for (let castObject of castArray) {
        if (sentArray.indexOf(castObject.transactionHash) !== -1) {
            continue;
        }
        console.log(castObject);
        //Sets 5 second delay between casts and calls retryApiCall to ensure casts are sent out in correct order
        
        setTimeout(async () => {
            try {
                const { data } = await retryApiCall( async () => {
                    await sdk.postCast({ text: castObject.cast, signer_uuid: SIGNER_UUID }, { api_key: NEYNAR_API_KEY });
                   
                });
                console.log(data)
                sentArray.push(castObject);
            } catch (err) {
                console.error("Error in API call:", err);
                // Handle the error as needed
            }
        }, 5000); // Delay each API call by 5 seconds
    }   
    return sentArray;
}
module.exports = { sendCasts };

