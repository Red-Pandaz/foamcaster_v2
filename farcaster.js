const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
 
function sendCasts(castArray){
    let sentArray = []
    castArray.sort((a, b) => a.blockHeight - b.blockHeight)
    for(let cast of castArray){
        if(sentArray.indexOf(cast.transactionHash) != -1 ){
            continue;
        }
        console.log(cast)
        sentArray.push(cast)

    }
    sdk.postCast({ text: string, signer_uuid: process.env.SIGNER_UUID }, { api_key: process.env.NEYNAR_API_KEY })
        .then(({ data }) => console.log(data))
        .catch(err => console.error("Error in API call:", err)); // Handle errors from the API call

    return sentArray

}


module.exports = { sendCasts };

