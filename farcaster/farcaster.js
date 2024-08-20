const dotenv = require("dotenv").config();
const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');
const fetch = require('node-fetch');
const url = 'https://api.neynar.com/v2/farcaster/cast';

async function sendCastsAndTweets(castArray) {
    const TWITTER_CONSUMER_KEY = await retryApiCall(() => accessSecret('TWITTER_CONSUMER_KEY'));
    const TWITTER_CONSUMER_SECRET = await retryApiCall(() => accessSecret('TWITTER_CONSUMER_SECRET'));
    const TWITTER_ACCESS_TOKEN = await retryApiCall(() => accessSecret('TWITTER_ACCESS_TOKEN'));
    const TWITTER_ACCESS_TOKEN_SECRET = await retryApiCall(() => accessSecret('TWITTER_ACCESS_TOKEN_SECRET'));
    const SIGNER_UUID = await retryApiCall(() => accessSecret('SIGNER_UUID'));
    const NEYNAR_API_KEY = await retryApiCall(() => accessSecret('NEYNAR_API_KEY'));

    const sentHashesMap = new Map();
    let sentArray = [];

    castArray.sort((a, b) => a.timestamp - b.timestamp);

    const twitterClient = new TwitterApi({
        appKey: TWITTER_CONSUMER_KEY,
        appSecret: TWITTER_CONSUMER_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
    });

    for (let i = 0; i < castArray.length; i++) {
        const castObject = castArray[i];
        console.log(castObject.timestamp);

        if (sentHashesMap.has(castObject.transactionHash)) {
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            if (sentHashesMap.get(castObject.transactionHash) === castHash) {
                console.log(`Cast with transaction hash ${castObject.transactionHash} (Cast ${castObject.cast}) has already been sent. Skipping.`);
                continue;
            }
        }

        try {
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
                    embeds: [{ url: castObject.customUrl || castObject.etherUrl }]
                })
            };

            const castPostResponse = await retryApiCall(() => fetch(url, options).then(res => res.json()));
            const castHash = crypto.createHash('sha256').update(castObject.cast).digest('hex');
            sentHashesMap.set(castObject.transactionHash, castHash);
            console.log("Success! Cast: " + castObject.cast);
            sentArray.push(castObject);

            try {
                const tweetResponse = await twitterClient.v2.tweet(`${castObject.cast} ${castObject.customUrl || castObject.etherUrl}`);
                console.log("Tweet sent: " + tweetResponse.data.text);
            } catch (twitterError) {
                console.error(`Failed to send tweet for cast: ${castObject.cast}. Error: ${twitterError.message}`);
            }

        } catch (err) {
            console.error(`Failed to send cast: ${castObject.cast}. Error: ${err.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return sentArray;
}

module.exports = { sendCastsAndTweets };
