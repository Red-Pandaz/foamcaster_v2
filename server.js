<<<<<<< HEAD

// require('dotenv').config();
// const { main } = require('./app.js');
// const { pruneDatabaseAndEmail } = require('./database/database.js');


// exports.mainJob = async (req, res) => {
//   console.log("Running scheduled half-hourly event check");
//   try {
//     await main();
//     console.log("Main function executed successfully");
//     res.status(200).send('Job 1 executed successfully');
//   } catch (error) {
//     console.error("Error running main:", error);
//     res.status(500).send('Internal Server Error');
//   }
// };

// exports.pruneDatabaseAndEmailJob = async (req, res) => {
//   console.log("Running scheduled weekly prune");
//   try {
//     await pruneDatabaseAndEmail();
//     console.log("Pruning complete");
//     res.status(200).send('Job 2 executed successfully');
//   } catch (error) {
//     console.error("Error running prune:", error);
//     res.status(500).send('Internal Server Error');
//   }
// };
// exports.mainJob = (req, res) => {
//   console.log("Cloud Function executed");
//   res.status(200).send("Cloud Function executed successfully");
// };
=======
//IMPORTANT
//BEFORE DEPLOYMENT CHECK DATABASE, FARCASTER AND BLOCK SETTINGS

require('dotenv').config();
const { main } = require('./app.js');
const { pruneDatabaseAndEmail } = require('./database/database.js');
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
>>>>>>> parent of b301728 (modify functions and environment variables for cloud function integration)
