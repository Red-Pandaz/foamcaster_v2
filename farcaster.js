const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
 
function sendCasts(castArray){
    let txArray = []
    castArray.sort((a, b) => a.blockHeight - b.blockHeight)
    console.log(castArray)

//     sdk.postCast({ text: string, signer_uuid: process.env.SIGNER_UUID }, { api_key: process.env.NEYNAR_API_KEY })
//         .then(({ data }) => console.log(data))
//         .catch(err => console.error("Error in API call:", err)); // Handle errors from the API call
    }


module.exports = { sendCasts };

