const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const dotenv = require("dotenv").config();
const { retryApiCall, getTransferData, processTransferData } = require('../utils/apiutils.js');

// Connection URI
const uri = `${process.env.DB_URI}`;
const dbName = "Foamcaster-V2";
const collectionName = "Snapshots";

// Create a new MongoClient;
let client = new MongoClient(uri);


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
        return await retryApiCall(getLastTimestampInternal);
    } catch (error) {
        console.error('Error getting last timestamp:', error);
        // Handle the error if needed
    }
}

async function getLastTimestampInternal() {
    if (!client || !client.topology || !client.topology.isConnected()) {
        client = new MongoClient(uri);
        await client.connect();
        console.log("Connected to the database");
    }

    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    let lastObject = await collection.find().sort({ timestamp: -1 }).limit(1).toArray();

    if (lastObject.length > 0) {
        let lastBlockHeight = lastObject[0].blockstamp;
        let lastTimestamp = lastObject[0].timestamp;
        return [lastBlockHeight, lastTimestamp];
    } else {
        return null;
    }
}

async function pushFoamDB(timestamp) {
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            // Create a new MongoClient instance if not already created or connected
            client = new MongoClient(uri);
            await client.connect();
            console.log("Connected to the database");
        }

        // Get a reference to the database
        const db = client.db(dbName);
        
        // Get a reference to the collection
        const collection = db.collection(collectionName);
        
        // Insert the document into the collection
        const result = await collection.insertOne(timestamp);
        console.log(`Document inserted with _id: ${result.insertedId}`);
    } catch (error) {
        console.error('Error inserting document:', error);
    } finally {
        // Close the connection
        if (client && client.topology && client.topology.isConnected()) {
            await client.close();
            console.log("Connection closed");
        }
    }
}

async function pruneDatabaseAndEmail() {
    try {
        await retryApiCall(pruneDatabaseAndEmailInternal);
    } catch (error) {
        console.error('Error pruning database and sending email:', error);
        // Handle the error if needed
    }
}

async function pruneDatabaseAndEmailInternal() {
    if (!client || !client.topology || !client.topology.isConnected()) {
        client = new MongoClient(uri);
        await client.connect();
        console.log('Connected to MongoDB');
    }

    const db = client.db(dbName);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await db.collection(collectionName).deleteMany({ timestamp: { $lt: oneWeekAgo } });

    const prunedData = await db.collection(collectionName).find({ timestamp: { $lt: oneWeekAgo } }).toArray();
    await sendEmail(prunedData);

    console.log('Pruning complete');
}



async function sendEmail(prunedData) {
    try{
        let transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: `${process.env.DB_OUTGOING_EMAIL_ADDRESS}`,
                pass: `${process.env.DB_OUTGOING_EMAIL_PASSWORD}`
            },

        });
        let { min, max } = findMinMaxBlockHeight(prunedData);


    
        let mailOptions = {
            from: `${process.env.DB_OUTGOING_EMAIL_ADDRESS}`,
            to: `${process.env.DB_INCOMING_EMAIL_ADDRESS}`,
            subject: `FOAMcaster_V2 Pruned Data From Blocks ${min}-${max}`,
            text: `Attached is pruned data from blocks ${min}-${max}`,
            attachments: [
                {
                    filename: `blocks_${min}_${max}.json`,
                    content: JSON.stringify(prunedData, null, 2)
                }
            ]
        };

        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
    }catch(err){
        console.log(err)
    }
}

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
    return { min: min, max: max };
}


module.exports = { updateTimestamp, getLastTimestamp, pruneDatabaseAndEmail };