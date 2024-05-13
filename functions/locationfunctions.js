//get established Zones and new Zones into one array before finding destroyedzones or presence claims
//destroyed zones and presence claims must reference this array for zone info
//make sure if a zone is created and destroyed in the same snapshot period that it is added as active:false
//move database functions into database directory
//integrate everything with app.js
const dotenv = require("dotenv").config()
const { ethers, JsonRpcProvider } = require('ethers');
const crypto = require('crypto');
const geohash = require('ngeohash')
//Byes Parser: 0x8fF139f43fA7C77b38EB524d0960C09572dCcf04
//Localization Store: 0xefeff44D8a20C86C65E68b1Dd673Cd15E24855C1
//CID Manager: 0x2122BCf033A0ff6c36Ac5d45E5ffbFe2F91251Ae
//Gossip Utils: 0xd0D7687C0612A128E907061E919ea44AB0c99b17

const { retryApiCall, accessSecret } = require('../utils/apiutils.js');
const { convertHexToGeohash } = require('../utils/helpers.js')
const { updateZones, getZoneCollection } = require('../database/database.js')
const constants = require('../constants/constants.js');
const testProvider =  new ethers.providers.JsonRpcProvider(`https://devnet-l2.foam.space/api/eth-rpc`)
const testPresenceClaimBountyAddress = '0x0f7d71925A8FAB24666fd7f4d8Ac6AbD53051d42'
const testFoamPresenceClaimAddress = '0x62894DF7e66939e59a20722D713015EBF118B8dA'
let testZoneAddress = '0x2B66f5cB7287C6DEfBaF211dF6F9FC003da78160'
let testLocalizationStoreAddress = '0xefeff44D8a20C86C65E68b1Dd673Cd15E24855C1'
const TEST_PRESENCE_CLAIM_ABI = require('../abi/test-presence-claim.json')
let TEST_ZONE_ABI = require('../abi/test-zone.json')
const TEST_PRESENCE_CLAIM_CONTRACT = new ethers.Contract(testFoamPresenceClaimAddress, TEST_PRESENCE_CLAIM_ABI, testProvider)
let TEST_ZONE_CONTRACT = new ethers.Contract(testZoneAddress, TEST_ZONE_ABI, testProvider)
let TEST_ZONE_CREATE_FILTER = TEST_ZONE_CONTRACT.filters.ZoneCreated()
let TEST_ZONE_DESTROY_FILTER = TEST_ZONE_CONTRACT.filters.ZoneDestroyed()
// let client



async function getTestEvents(fromBlock, toBlock, castArray, claimArray, zoneArray) {
    console.log('test6')
    const presenceClaimEventFilter = TEST_PRESENCE_CLAIM_CONTRACT.filters.Transfer('0x0000000000000000000000000000000000000000')
    const presenceClaimEvents = await TEST_PRESENCE_CLAIM_CONTRACT.queryFilter(presenceClaimEventFilter, fromBlock, toBlock)
    await Promise.all(presenceClaimEvents.map(async function(event) {
        let castObj = {};
        let claimObj = {};
        castObj.blockHeight = claimObj.blockHeight = event.blockNumber;
        castObj.transactionHash = claimObj.transactioNHash = event.transactionHash;
        
        let fpc = BigInt(event.topics[3], 16).toString();
        let toAddress = event.args[1];
        claimObj._id = fpc;
        claimObj.minter = toAddress;
        // console.log(castObj)
        // console.log(claimObj)
        await getFpcData(fpc, castObj, claimObj, toAddress, zoneArray);
        castArray.push(castObj);
        claimArray.push(claimObj);
    }));
}


async function getFpcData(tokenId, castObj, claimObj, toAddress, zoneArray){
    console.log(castObj)
    console.log(claimObj)
    console.log('test7')
    let anchor = await TEST_PRESENCE_CLAIM_CONTRACT.distinctAnchors(tokenId)

    // let zoneId = parseInt((await TEST_PRESENCE_CLAIM_CONTRACT.zone(tokenId))._hex, 16)
    let zoneId = (await TEST_PRESENCE_CLAIM_CONTRACT.zone(tokenId))
    zoneId = parseInt(zoneId._hex, 16)

    let zone = zoneArray.find(obj => obj._id === zoneId);
    let zoneName = zone.zoneName
    let location = await TEST_PRESENCE_CLAIM_CONTRACT.location(tokenId)
    let timestamp = await TEST_PRESENCE_CLAIM_CONTRACT.timestamp(tokenId)
    let algo = await TEST_PRESENCE_CLAIM_CONTRACT.localizationAlgorithm(tokenId)
    let parsedLocation = convertHexToGeohash(location.slice(2))
    let latlon = geohash.decode(parsedLocation);
    let addressFirstEight = toAddress.substring(0, 8);
    let addressLastFour = toAddress.substring(toAddress.length - 4);
    let formattedAddress = addressFirstEight + "..." + addressLastFour;
    let date = new Date(Number(timestamp))
    const originalDate = date;
    const month = originalDate.toLocaleString('en-US', { month: 'short' });
    const day = originalDate.getDate();
    const year = originalDate.getFullYear();
    const hours = originalDate.getUTCHours();
    const minutes = originalDate.getUTCMinutes();
    const formattedDate = `${month} ${day} ${year} ${hours}:${minutes} UTC`;
    claimObj.timestamp = Number(timestamp)
    claimObj.zone = zoneId
    claimObj.zoneName = zoneName
    claimObj.distinctAnchors = anchor
    claimObj.localizationGrade = algo
    claimObj.bytes20Location = location
    claimObj.geoHashLocation = parsedLocation
    claimObj.latlonLocation = {}
    claimObj.latlonLocation.latitude = latlon.latitude
    claimObj.latlonLocation.longitude = latlon.longitude
    castObj.cast = `Grade ${algo} FOAM Presence Claim minted by ${formattedAddress} in Zone #${zoneId} (${zoneName}) on ${formattedDate}`
    castObj.etherUrl = `https://optimistic.etherscan.io/tx/${castObj.transactionHash}`
    castObj.mapsUrl = `https://www.google.com/maps?q=${latlon.latitude},${latlon.longitude}`
}



async function getZoneCreations(fromBlock, toBlock, castArray, zoneCollection, zoneArray, newZones){
    console.log('test8')
    let zones = await TEST_ZONE_CONTRACT.queryFilter(TEST_ZONE_CREATE_FILTER, fromBlock, toBlock)
    
    zones.forEach(function(zone){
        let zoneId = (Number(zone.args.zoneId, 16))
        let zoneName = zone.args.zoneName
        let zoneNumberOfAnchors = (zone.args.zoneAnchors.length)
        let castObj = {}
        let newZone = {}
        castObj.blockHeight = zone.blockNumber
        castObj.transactionHash = zone.transactionHash
        castObj.cast = `Zone #${zoneId} (${zoneName}) created, ${zoneNumberOfAnchors} anchors`
        castObj.etherUrl = `https://optimistic.etherscan.io/tx/${castObj.transactionHash}`
        newZone._id = zoneId
        newZone.zoneName = zoneName
        newZone.blockHeight = zone.blockNumber
        newZone.transactionHash = zone.transactionHash
        newZone.anchors = zone.args.zoneAnchors
        newZone.custodian = zone.args.custodian
        newZone.active = true
        newZones.push(newZone)
        castArray.push(castObj)
    })
    zoneArray.push(...zoneCollection)
    zoneArray.push(...newZones)
    return newZones, zoneArray, castArray
}




async function getZoneDestructions(fromBlock, toBlock, zoneArray, castArray, destroyedArray, newZones){
    console.log('test9')
    const currentBlock = await testProvider.getBlockWithTransactions('latest')
    let zoneDestructions = await TEST_ZONE_CONTRACT.queryFilter(TEST_ZONE_DESTROY_FILTER, fromBlock, toBlock)
    zoneDestructions.forEach(async function(destruction){
        let castObj = {}
        let zoneId = Number(destruction.args.zoneId,16)
        let zone = zoneArray.find(obj => obj._id === zoneId);
        let zoneName = zone.zoneName
        castObj.blockHeight = destruction.blockNumber
        castObj.transactionHash = destruction.transactionHash
        castObj.cast = `Zone #${zoneId} (${zoneName}) destroyed`
        castObj.etherUrl = `https://optimistic.etherscan.io/tx/${castObj.transactionHash}`
        let index = newZones.findIndex(obj => obj._id === zoneId);
        if (index !== -1) {
            newZones[index].active = false;
        }
        destroyedArray.push(zoneId)
        castArray.push(castObj)
    })
 
return destroyedArray, castArray, newZones
}



// async function updateZones(zonesToAdd, destroyedArray, claimsToAdd) {
//     const MongoClient = require('mongodb').MongoClient;
//     const uri = 'mongodb+srv://infurathrowaway:63hfrJgh7pQLUD08@cluster0.hidmtz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // Update with your MongoDB URI
//     try {
//         await client.connect();
//         const database = client.db('Foamcaster-V2'); // Update with your database name
//         const zoneCollection = database.collection('Zones'); // Update with your collection name
//         const claimCollection = database.collection('Presence Claims')
//         // Filter out itemsToAdd that have duplicate _id values
//         const existingZones = await zoneCollection.distinct('_id');
//         const existingClaims = await claimCollection.distinct('_id')
//         zonesToAdd = zonesToAdd.filter(item => !existingZones.includes(item._id));
//         claimsToAdd = claimsToAdd.filter(item => !existingClaims.includes(item._id));

//         if (zonesToAdd.length > 0) {
//             await zoneCollection.insertMany(zonesToAdd);
//         }
//         if (claimsToAdd.length > 0){
//             await claimCollection.insertMany(claimsToAdd)
//         }
//         await zoneCollection.updateMany(
//             { _id: { $in: destroyedArray } },
//             { $set: { active: false } }
//         );

//         const result = await zoneCollection.updateMany(
//             { _id: { $in: destroyedArray } },
//             { $set: { active: false } }
//         );
//         const { modifiedCount } = result;
//         const notFoundCount = destroyedArray.length - modifiedCount;

//         if (notFoundCount > 0) {
//             console.warn(`${notFoundCount} items flagged for deactivation were not found in the collection.`);
//         }
//         console.log("Collection updated successfully.");
//     } catch (error) {
//         console.error("Error updating collection:", error);
//     } finally {
//         await client.close();
//     }
// }

//     async function getZoneCollection() {
//         const DB_URI = 'mongodb+srv://infurathrowaway:63hfrJgh7pQLUD08@cluster0.hidmtz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
//         const MongoClient = require('mongodb').MongoClient;
//         try {
//             if (!client || !client.topology || !client.topology.isConnected()) {
//                 client = new MongoClient(DB_URI);
//                 await retryApiCall(() => client.connect());
//                 console.log("Connected to the database");
//             }
//             const db = client.db('Foamcaster-V2');
//             const collection = db.collection('Zones');
//             const documents = await collection.find({}).toArray();
//             return documents
//         } catch (error) {
//             console.log(DB_URI)
//             console.error('Error fetching Zones:', error);
//             throw error; // Rethrow the error to be caught by the caller
//         }
//     }


    async function main(){
        let zoneArray = []
        let castArray = []
        let claimArray = []
        let newZones = []
        let destroyedArray = []
        let zoneCollection = await getZoneCollection()

        await getZoneCreations(castArray, zoneCollection, zoneArray, newZones) 
        await getZoneDestructions(zoneArray, castArray, destroyedArray, newZones)
        await getTestEvents(castArray, claimArray, zoneArray);
        await updateZones(newZones, destroyedArray, claimArray)
    
        }
        // main()
    
module.exports = { getTestEvents, getZoneCreations, getZoneDestructions }