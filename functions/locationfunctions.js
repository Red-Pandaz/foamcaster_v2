//make sure constants are moved to constants.js
//make sure error handling is complete
const dotenv = require("dotenv").config()
const { ethers, JsonRpcProvider } = require('ethers');
const crypto = require('crypto');
const geohash = require('ngeohash')
const { retryApiCall, accessSecret } = require('../utils/apiutils.js');
const { convertHexToGeohash } = require('../utils/helpers.js')
const { updateZones, getZoneCollection } = require('../database/database.js')
const constants = require('../constants/constants.js');
const testProvider =  new ethers.providers.JsonRpcProvider(`https://devnet-l2.foam.space/api/eth-rpc`)

//Localization ABIs
const TEST_PRESENCE_CLAIM_ABI = require('../abi/test-presence-claim.json')
const TEST_ZONE_ABI = require('../abi/test-zone.json')

//Localization Contracts
const TEST_PRESENCE_CLAIM_CONTRACT = new ethers.Contract(constants.TEST_FOAM_PRESENCE_CLAIM_ADDRESS, TEST_PRESENCE_CLAIM_ABI, testProvider)
const TEST_ZONE_CONTRACT = new ethers.Contract(constants.TEST_ZONE_ADDRESS, TEST_ZONE_ABI, testProvider)

//Localization Filters
const PRESENCE_CLAIM_EVENT_FILTER = TEST_PRESENCE_CLAIM_CONTRACT.filters.Transfer(constants.FOAM_MINT_BURN_ADDRESS)
const TEST_ZONE_CREATE_FILTER = TEST_ZONE_CONTRACT.filters.ZoneCreated()
const TEST_ZONE_DESTROY_FILTER = TEST_ZONE_CONTRACT.filters.ZoneDestroyed()


async function getClaimEvents(fromBlock, toBlock, castArray, claimArray, zoneArray) {
    console.log('getting test events')
    const presenceClaimEvents = await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.queryFilter(PRESENCE_CLAIM_EVENT_FILTER, fromBlock, toBlock))
    await Promise.all(presenceClaimEvents.map(async function(event) {
        let castObj = {};
        let claimObj = {};
        castObj.blockHeight = claimObj.blockHeight = event.blockNumber;
        castObj.transactionHash = claimObj.transactionHash = event.transactionHash;
        let fpc = BigInt(event.topics[3], 16).toString();
        let toAddress = event.args[1];
        claimObj._id = fpc;
        claimObj.minter = toAddress;
        await retryApiCall(() => getFpcData(fpc, castObj, claimObj, toAddress, zoneArray));
        castArray.push(castObj);
        claimArray.push(claimObj);
        
    }));
    console.log('done getting test events')
}

async function getFpcData(tokenId, castObj, claimObj, toAddress, zoneArray){
    let anchor = await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.distinctAnchors(tokenId))
    let zoneId = (await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.zone(tokenId)))
    zoneId = parseInt(zoneId._hex, 16)
    let zone = zoneArray.find(obj => obj._id === zoneId);
    let zoneName = zone.zoneName
    let location = await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.location(tokenId))
    let timestamp = await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.timestamp(tokenId))
    let algo = await retryApiCall(() => TEST_PRESENCE_CLAIM_CONTRACT.localizationAlgorithm(tokenId))
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
    castObj.cast = `Grade ${algo} FOAM Presence Claim minted in Zone #${zoneId} (${zoneName}) on ${formattedDate}`
    castObj.etherUrl = `https://optimistic.etherscan.io/tx/${castObj.transactionHash}`
    castObj.mapsUrl = `https://www.google.com/maps?q=${latlon.latitude},${latlon.longitude}`
    castObj.newUrl = `http://localhost:3000/?lat=${latlon.latitude}&lng=${lng=latlon.longitude}&tx=${claimObj.transactionHash.substring(1)}`
}

async function getZoneCreations(fromBlock, toBlock, castArray, zoneCollection, zoneArray, newZones){
    console.log('getting zone creations')
    let zones = await retryApiCall(() => TEST_ZONE_CONTRACT.queryFilter(TEST_ZONE_CREATE_FILTER, fromBlock, toBlock))
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
    console.log('getting zone destructions')
    let zoneDestructions = await retryApiCall(() => TEST_ZONE_CONTRACT.queryFilter(TEST_ZONE_DESTROY_FILTER, fromBlock, toBlock))
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

    async function main(){
        let zoneArray = []
        let castArray = []
        let claimArray = []
        let newZones = []
        let destroyedArray = []
        let zoneCollection = await getZoneCollection()

        await getZoneCreations(castArray, zoneCollection, zoneArray, newZones) 
        await getZoneDestructions(zoneArray, castArray, destroyedArray, newZones)
        await getClaimEvents(castArray, claimArray, zoneArray);
        await updateZones(newZones, destroyedArray, claimArray)
    
        }
        // main()
    
module.exports = { getClaimEvents, getZoneCreations, getZoneDestructions }