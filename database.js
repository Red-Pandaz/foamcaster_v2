const { MongoClient } = require('mongodb');
const dotenv = require("dotenv").config();

// Connection URI
const uri = `${process.env.DB_URI}`;
const dbName = "Foam"
const collectionName ="Timestamps"

// Create a new MongoClient
let client = new MongoClient(uri)



function updateTimestamp(blockHeight, tweetIndex, txArray){
    let newTimestampObj = {}
    newTimestampObj.timestamp = Date.now();
    newTimestampObj.blockstamp = blockHeight;
    newTimestampObj.tweets = tweetIndex;
    newTimestampObj.transactions = txArray
    pushFoamDB(newTimestampObj)
    
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

module.exports = { updateTimestamp, getLastTimestamp };