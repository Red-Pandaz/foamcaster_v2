const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const dotenv = require("dotenv").config();
const { retryApiCall, getTransferData, processTransferData, accessSecret } = require('../utils/apiutils.js');
const dbName = 'Foamcaster-V2'
const timestampCollectionName = 'Snapshots'
const zoneCollectionName = 'Zones'
const claimCollectionName ='Presence Claims'
// const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
let client


async function updateZonesAndClaims(zonesToAdd, destroyedArray, claimsToAdd) {
    const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
   
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(DB_URI);
            await retryApiCall(() => client.connect());
            console.log("Connected to the database");
        }
        const database = client.db(dbName); 
        const zoneCollection = database.collection(zoneCollectionName); 
        const claimCollection = database.collection(claimCollectionName)

        // Filter out itemsToAdd that have duplicate _id values
        const existingZones = await retryApiCall(() =>zoneCollection.distinct('_id'));
        const existingClaims = await retryApiCall(() => claimCollection.distinct('_id'))
        zonesToAdd = zonesToAdd.filter(item => !existingZones.includes(item._id));
        claimsToAdd = claimsToAdd.filter(item => !existingClaims.includes(item._id));

        if (zonesToAdd.length > 0) {
            await retryApiCall(() =>zoneCollection.insertMany(zonesToAdd));
        }
        if (claimsToAdd.length > 0){
            await retryApiCall(() =>claimCollection.insertMany(claimsToAdd))
        }
        await zoneCollection.updateMany(
            { _id: { $in: destroyedArray } },
            { $set: { active: false } }
        );

        const result = await retryApiCall(() => zoneCollection.updateMany(
            { _id: { $in: destroyedArray } },
            { $set: { active: false } }
        ));
        const { modifiedCount } = result;
        const notFoundCount = destroyedArray.length - modifiedCount;

        if (notFoundCount > 0) {
            console.warn(`${notFoundCount} items flagged for deactivation were not found in the collection.`);
        }
        console.log("Collection updated successfully.");
    } catch (error) {
        console.error("Error updating collection:", error);
    }
}

async function getZoneCollection() {
    const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(DB_URI);
            await retryApiCall(() => client.connect());
            console.log("Connected to the database");
        }
        const db = client.db(dbName);
        const collection = db.collection(zoneCollectionName);
        const documents = await retryApiCall(() => collection.find({}).toArray());
        return documents
    } catch (error) {
        console.error('Error fetching Zones:', error);
        throw error; // Rethrow the error to be caught by the caller
    }
}

async function updateTimestamp(blockHeight, castArray) {
    let newTimestampObj = {
        timestamp: Date.now(),
        blockstamp: blockHeight,
        casts: castArray
    };

    try {
        await retryApiCall(() => pushFoamDB(newTimestampObj));
    } catch (error) {
        console.error('Error updating timestamp:', error);
        // Handle the error if needed
    }
}

async function getLastTimestamp() {
    try {
        return await retryApiCall(() => getLastTimestampInternal())
    } catch (error) {
        console.error('Error getting last timestamp:', error);
        // Handle the error if needed
    }
}

async function getLastTimestampInternal() {
    const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(DB_URI);
            await retryApiCall(() => client.connect());
            console.log("Connected to the database");
        }
        const db = client.db(dbName); // Assuming dbName is defined globally or passed as a parameter
        const collection = db.collection(timestampCollectionName); // Assuming collectionName is defined globally or passed as a parameter
        const lastObject = await retryApiCall(() => collection.find().sort({ timestamp: -1 }).limit(1).toArray());
        console.log("Last Object: " + lastObject)

        if (lastObject.length > 0) {
            const lastBlockHeight = lastObject[0].blockstamp;
            const lastTimestamp = lastObject[0].timestamp;
            return [lastBlockHeight, lastTimestamp];
        } else {
            return null;
        }
    } catch (error) {
        console.log(DB_URI)
        console.error('Error fetching last timestamp:', error);
        throw error; // Rethrow the error to be caught by the caller
    }
}

async function pushFoamDB(timestamp) {
    const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
 
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(DB_URI);
            await retryApiCall(() => client.connect());
            console.log("Connected to the database");
        }
        // Get a reference to the database
        const db = client.db(dbName);
        
        // Get a reference to the collection
        const collection = db.collection(timestampCollectionName);
        
        // Insert the document into the collection
        const result = await retryApiCall(() => collection.insertOne(timestamp));
        console.log(`Document inserted with _id: ${result.insertedId}`);
    } catch (error) {
        console.error('Error inserting document:', error);
    } finally {
        // Close the connection
        if (client && client.topology && client.topology.isConnected()) {
            await retryApiCall(() => client.close());
            console.log("Connection closed");
        }
    }
}

//wraps pruneDatabaseAndEmailInternal in an additional error handler
async function pruneDatabaseAndEmail(){
    try {
        await retryApiCall(pruneDatabaseAndEmailInternal);
    } catch (error) {
        console.error('Error pruning database and sending email:', error);
        // Handle the error if needed
    }
}
//Prunes database and calls sendEmail
async function pruneDatabaseAndEmailInternal() {
    const DB_URI = await retryApiCall(() => accessSecret('DB_URI'));
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(DB_URI);
            await retryApiCall(() => client.connect());
            console.log("Connected to the database");
        }

    const db = client.db(dbName);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await retryApiCall(() => db.collection(timestampCollectionName).deleteMany({ timestamp: { $lt: oneWeekAgo } }));

    const prunedData = await retryApiCall(() => db.collection(timestampCollectionName).find({ timestamp: { $lt: oneWeekAgo } }).toArray());
    await retryApiCall(() => sendEmail(prunedData));

    console.log('Pruning complete');
    }catch(err){
    console.log(err)
    }

}

//emails pruned data
async function sendEmail(prunedData) {
    try{
        const DB_OUTGOING_EMAIL_ADDRESS = await retryApiCall(() => accessSecret('DB_OUTGOING_EMAIL_ADDRESS'))
        const DB_OUTGOING_EMAIL_PASSWORD = await retryApiCall(() => accessSecret('DB_OUTGOING_EMAIL_PASSWORD'))
        const DB_INCOMING_EMAIL_ADDRESS = await retryApiCall(() => accessSecret('DB_OUTGOING_EMAIL_PASSWORD'))
        let transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: `${DB_OUTGOING_EMAIL_ADDRESS}`,
                pass: `${DB_OUTGOING_EMAIL_PASSWORD}`
            },

        });
        let { min, max } = findMinMaxBlockHeight(prunedData);


    
        let mailOptions = {
            from: `${DB_OUTGOING_EMAIL_ADDRESS}`,
            to: `${DB_INCOMING_EMAIL_ADDRESS}`,
            subject: `FOAMcaster_V2 Pruned Data From Blocks ${min}-${max}`,
            text: `Attached is pruned data from blocks ${min}-${max}`,
            attachments: [
                {
                    filename: `blocks_${min}_${max}.json`,
                    content: JSON.stringify(prunedData, null, 2)
                }
            ]
        };
        let info = await retryApiCall(() => transporter.sendMail(mailOptions));
        console.log('Email sent:', info.messageId);
    }catch(err){
        console.log(err)
    }
}

//helper function for determining the block-range that pruned data contains
function findMinMaxBlockHeight(prunedData) {
    if (!prunedData || !Array.isArray(prunedData) || prunedData.length === 0) {
        console.log("No data to email.");
        return;
    }
    let { min, max } = findMinMaxBlockHeight(prunedData);
    
    for (let i = 1; i < prunedData.length; i++) {
        let currentBlockHeight = prunedData[i].blockstamp;
        if (currentBlockHeight < minBlockHeight) {
            minBlockHeight = currentBlockHeight;
        }
        if (currentBlockHeight > maxBlockHeight) {
            maxBlockHeight = currentBlockHeight;
        }
    }
    console.log("Main job function executed");
    res.status(200).send("Main job executed successfully");
    return { min: min, max: max };
}





module.exports = { updateTimestamp, getLastTimestamp, pruneDatabaseAndEmail, updateZonesAndClaims, getZoneCollection };