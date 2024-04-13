//IMPORTANT
//BEFORE DEPLOYMENT CHECK DATABASE, FARCASTER AND BLOCK SETTINGS

require('dotenv').config();
const { main } = require('./app.js');
const { pruneDatabaseAndEmail } = require('./database.js');
const schedule = require('node-schedule');

crequire('dotenv').config();
const { main } = require('./app.js');
const { pruneDatabaseAndEmail } = require('./database.js');
const schedule = require('node-schedule');

const mainJob = schedule.scheduleJob('*/30 * * * *', async function(){
  console.log("Running scheduled half-hourly event check");
  try {
    await main();
    console.log("Main function executed successfully");
  } catch (error) {
    console.error("Error running main:", error);
    return;
  }
});

const pruneJob = schedule.scheduleJob('15 0 * * 0', async function(){
  console.log("Running scheduled weekly prune");
  try {
    await pruneDatabaseAndEmail();
    console.log("Pruning complete");
  } catch (error) {
    console.error("Error running prune:", error);
    return;
  }
});