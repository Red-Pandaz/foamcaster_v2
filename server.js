//IMPORTANT
//BEFORE DEPLOYMENT CHECK DATABASE, FARCASTER AND BLOCK SETTINGS

require('dotenv').config();
const { main } = require('./app.js');
const { pruneDatabaseAndEmail } = require('./database.js')
const schedule = require('node-schedule')

const mainJob = schedule.scheduleJob('*/30 * * * *', function(){
  console.log("Running scheduled half-hourly event check");

  // Wrap the call to main in a regular function
  function runMain() {
      return new Promise((resolve, reject) => {
          try {
              main();
              resolve();
          } catch (error) {
              reject(error);
          }
      });
  }

  // Immediately Invoked Function Expression (IIFE) to handle asynchronous operations
  (async () => {
      try {
          await runMain();
      } catch (error) {
          console.error("Error running main:", error);
      }
  })();
});



const pruneJob = schedule.scheduleJob('15 0 * * 0', function(){
    console.log("Running scheduled weekly prune");
 
    function runPrune() {
        return new Promise((resolve, reject) => {
            try {
                pruneDatabaseAndEmail();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }
  
    // Immediately Invoked Function Expression (IIFE) to handle asynchronous operations
    (async () => {
        try {
            await runPrune();
        } catch (error) {
            console.error("Error running prune:", error);
        }
    })();
  });
