const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
const { retryApiCall } = require('../utils/apiutils.js');
 
async function sendCasts(castArray) {
    let sentArray = [];
    // Organize by block height and remove duplicates
    castArray.sort((a, b) => a.blockHeight - b.blockHeight);
    for (let castObject of castArray) {
        if (sentArray.indexOf(castObject.transactionHash) !== -1) {
            continue;
        }
        console.log(castObject);
        setTimeout(async () => {
            try {
                const { data } = await retryApiCall( async () => {
                    await sdk.postCast({ text: castObject.cast, signer_uuid: process.env.SIGNER_UUID }, { api_key: process.env.NEYNAR_API_KEY });
                   
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

