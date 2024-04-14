const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const dotenv = require("dotenv").config();

// Connection URI
const uri = `${process.env.DB_URI}`;
const dbName = "Foamcaster-V2";
const collectionName = "Snapshots";

// Create a new MongoClient;
let client = new MongoClient(uri);



function updateTimestamp(blockHeight, castArray){
    let newTimestampObj = {};
    newTimestampObj.timestamp = Date.now();
    newTimestampObj.blockstamp = blockHeight;
    newTimestampObj.casts = castArray;
    console.log(newTimestampObj)
    pushFoamDB(newTimestampObj);
}


async function getLastTimestamp() {
    try {
        if (!client || !client.topology || !client.topology.isConnected()) {
            // Create a new MongoClient instance if not already created or connected
            client = new MongoClient(uri);
            await client.connect();
            console.log("Connected to the database");
        }
        // Get a reference to the database
        const db = client.db(dbName);
        
        // Find and return most recent block height
        const collection = db.collection(collectionName);
        let lastObject = await collection.find().sort({ timestamp: -1 }).limit(1).toArray();
        if (lastObject.length > 0) {
            let lastBlockHeight = lastObject[0].blockstamp; // Access blockstamp property
            let lastTimestamp = lastObject[0].timestamp;
            return [lastBlockHeight, lastTimestamp];
        } else {
            return null; 
        }
    } catch (error) {
        console.error('Error reading documents:', error);
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

// MongoDB pruning function
async function pruneDatabaseAndEmail() {
    try {
        // Connect to MongoDB if not already connected
        if (!client || !client.topology || !client.topology.isConnected()) {
            client = new MongoClient(uri);
            await client.connect();
            console.log('Connected to MongoDB');
        }
        // Get a reference to the database
        const db = client.db(dbName);
        
        // Logic for weekly database pruning
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        await db.collection(collectionName).deleteMany({ timestamp: { $lt: oneWeekAgo } });
        
        // Get the pruned data (optional)
        const prunedData = await db.collection(collectionName).find({ timestamp: { $lt: oneWeekAgo } }).toArray();
        
        // Email the pruned data
        await sendEmail(prunedData);
        
        console.log('Pruning complete');
    } catch (error) {
        console.error('Error pruning database:', error);
    } finally {
        // Close the connection
        if (client && client.topology && client.topology.isConnected()) {
            await client.close();
            console.log("Connection closed");
        }
    }
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

        let minBlockHeight = findMinMaxBlockHeight()
        let maxBlockHeight = findMinMaxBlockHeight()

    
        let mailOptions = {
            from: `${process.env.DB_OUTGOING_EMAIL_ADDRESS}`,
            to: `${process.env.DB_INCOMING_EMAIL_ADDRESS}`,
            subject: `FOAMcaster_V2 Pruned Data From Blocks ${minBlockHeight}-${maxBlockHeight}`,
            text: `Attached is pruned data from blocks ${minBlockHeight}-${maxBlockHeight}`,
            attachments: [
                {
                    filename: `blocks_${minBlockHeight}_${maxBlockHeight}.json`,
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


    let minBlockHeight = prunedData[0].blockstamp;
    let maxBlockHeight = prunedData[0].blockstamp;

    for (let i = 1; i < prunedData.length; i++) {
        let currentBlockHeight = prunedData[i].blockstamp;
        if (currentBlockHeight < minBlockHeight) {
            minBlockHeight = currentBlockHeight;
        }
        if (currentBlockHeight > maxBlockHeight) {
            maxBlockHeight = currentBlockHeight;
        }
    }
    return { min: minBlockHeight, max: maxBlockHeight };
}


module.exports = { updateTimestamp, getLastTimestamp, pruneDatabaseAndEmail };