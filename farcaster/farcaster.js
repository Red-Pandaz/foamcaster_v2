const dotenv = require("dotenv").config();
const sdk = require('api')('@neynar/v2.0#79zo2aluds8jrx');
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');
// npm i @neynar/nodejs-sdk
const { NeynarAPIClient, CastParamType } = require("@neynar/nodejs-sdk");

// make sure to set your NEYNAR_API_KEY .env
// don't have an API key yet? get one at neynar.com



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
                    await dk.postCast({
                        embeds: [{url: `https://optimistic.etherscan.io/tx/${castObject.transactionHash}`}],
                        text: castObject.cast,
                        signer_uuid: SIGNER_UUID
                    }, 
                    {api_key: NEYNAR_API_KEY})
                   
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

    // async function sendCast(){
        
    //     const NEYNAR_API_KEY = process.env.OP_GOVERNANCE_NEYNAR_API_KEY;
    //     const client = new NeynarAPIClient(NEYNAR_API_KEY);


    //     const SIGNER_UUID = process.env.OP_GOVERNANCE_SIGNER_UUID;
    //     // @dwr.eth AMA with @balajis.eth on Farcaster
    //     const url = "warpcast.com/optimism-bot/0x5191f977";
    //     const cast = await client.lookUpCastByHashOrWarpcastUrl(url, CastParamType.Url);
    //     console.log(cast.cast.embeds);
    //     // sdk.cast({
    //     //   identifier: '0x9288c1',
    //     //   type: 'hash',
    //     //   api_key: 'NEYNAR_API_DOCS'
    //     // })
    //     //   .then(({ data }) => console.log(data))
    //     //   .catch(err => console.error(err));
    //     // try {
    //     //     const response = await retryApiCall(async () => {
    //     //         return sdk.postCast({ text: "Testing", signer_uuid: SIGNER_UUID }, { api_key: NEYNAR_API_KEY });
    //     //     });
    //     //     console.log(response.data); // Access the data property of the response
    //     // } catch (err) {
    //     //     console.error("Error in API call:", err);
    //     //     // Handle the error as needed
    //     // }
    // }
    // sendCast();

module.exports = { sendCasts };

