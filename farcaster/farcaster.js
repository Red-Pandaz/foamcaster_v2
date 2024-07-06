const dotenv = require("dotenv").config();
const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto'); // Import the crypto module
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');
const fetch = require('node-fetch');
const url = 'https://api.neynar.com/v2/farcaster/cast';

async function sendCastsAndTweets(castArray) {
    const TWITTER_CONSUMER_KEY = await retryApiCall(() => accessSecret('TWITTER_CONSUMER_KEY'))
    const TWITTER_CONSUMER_SECRET = await retryApiCall(() => accessSecret('TWITTER_CONSUMER_SECRET'))
    const TWITTER_ACCESS_TOKEN = await retryApiCall(() => accessSecret('TWITTER_ACCESS_TOKEN'))
    const TWITTER_ACCESS_TOKEN_SECRET = await retryApiCall(() => accessSecret('TWITTER_ACCESS_TOKEN_SECRET'))
    const SIGNER_UUID = await retryApiCall(() => accessSecret('SIGNER_UUID'))
    const NEYNAR_API_KEY = await retryApiCall(() => accessSecret('NEYNAR_API_KEY'))
    // Maintain a map to track sent cast hashes for each transaction hash
    const sentHashesMap = new Map();
    
    let sentArray = [];
    // Organize by block height and remove duplicates
    castArray.sort((a, b) => a.timestamp - b.timestamp);

    const twitterClient = new TwitterApi({
        appKey: TWITTER_CONSUMER_KEY,
        appSecret: TWITTER_CONSUMER_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
        });
        
    for (let i = 0; i < castArray.length; i++) {
        const castObject = castArray[i];
        console.log(castObject.timestamp)
    
        // Check if the transaction hash has already been sent
        if (sentHashesMap.has(castObject.transactionHash)) {
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            // If the cast hash for this transaction hash matches, skip
            if (sentHashesMap.get(castObject.transactionHash) === castHash) {
                console.log(`Cast with transaction hash ${castObject.transactionHash} (Cast ${castObject.cast}) has already been sent. Skipping.`);
                continue;
            }
        }

        const result = await retryApiCall(async () => {
            try{
                if (castObject.customUrl) {
                    const options = {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            api_key: NEYNAR_API_KEY,
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({
                            parent_author_fid: 420154,
                            signer_uuid: SIGNER_UUID,
                            text: castObject.cast,
                            embeds: [{url: castObject.customUrl}]
                        })
                        };
                        const [castPostResponse, tweetResponse] = await Promise.all([
                            fetch(url, options).then(res => res.json()),
                            twitterClient.v2.tweet(`${castObject.cast} ${castObject.customUrl}`)
                        ]);
        
                        return [castPostResponse, tweetResponse];
                } else {
                    const options = {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            api_key: NEYNAR_API_KEY,
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({
                            parent_author_fid: 420154,
                            signer_uuid: SIGNER_UUID,
                            text: castObject.cast,
                            embeds: [{url: castObject.etherUrl}]
                        })
                        };
                        const [castPostResponse, tweetResponse] = await Promise.all([
                            fetch(url, options).then(res => res.json()),
                            twitterClient.v2.tweet(`${castObject.cast} ${castObject.etherUrl}`)
                        ]);
        
                        return [castPostResponse, tweetResponse];
                }
            } catch(err){
                console.log(err)
            }
        });

        // If the message was successfully cast, add the cast hash to the map
        if (result) {
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            sentHashesMap.set(castObject.transactionHash, castHash);
            console.log("Success! Cast: " + castObject.cast);
            sentArray.push(castObject); // Add the successful cast object to sentArray
        }
        // Add a delay of 5 seconds between each iteration
        await new Promise(resolve => setTimeout(resolve, 5000));

    }
    return(sentArray)
}


module.exports = { sendCastsAndTweets }