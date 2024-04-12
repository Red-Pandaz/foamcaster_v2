//IMPORTANT
//BEFORE DEPLOYMENT CHECK DATABASE, FARCASTER AND BLOCK SETTINGS


require('dotenv').config();
const { findFoamTransactions } = require('./ethereum.js');
const schedule = require('node-schedule')

const foamTransactionsJob = schedule.scheduleJob('*/30 * * * *', function(){
  console.log("Running scheduled half-hourly event check");

  // Wrap the call to findFoamTransactions in a regular function
  function runFoamTransactions() {
      return new Promise((resolve, reject) => {
          try {
              findFoamTransactions();
              resolve();
          } catch (error) {
              reject(error);
          }
      });
  }

  // Immediately Invoked Function Expression (IIFE) to handle asynchronous operations
  (async () => {
      try {
          await runFoamTransactions();
      } catch (error) {
          console.error("Error running foam transactions:", error);
      }
  })();
});