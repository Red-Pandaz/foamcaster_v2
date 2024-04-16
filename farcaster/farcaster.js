const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
 
function sendCasts(castArray){
    let sentArray = []
    //organize by block height and remove duplicates
    castArray.sort((a, b) => a.blockHeight - b.blockHeight);
    for(let castObject of castArray){
        if(sentArray.indexOf(castObject.transactionHash) != -1 ){
            continue;
        }
        console.log(castObject);
        // sent casts out with a short delay 
        sentArray.push(castObject)
        setTimeout(() => {
            sdk.postCast({ text: castObject.cast, signer_uuid: process.env.SIGNER_UUID }, { api_key: process.env.NEYNAR_API_KEY })
                .then(({ data }) => console.log(data))
                .catch(err => console.error("Error in API call:", err)); // Handle errors from the API call
        }, 5000); // Delay each API call by 5 seconds
        return sentArray;
    }
}
module.exports = { sendCasts };

