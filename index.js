// index.js
const { spawn } = require("child_process");
const path = require("path");
const cron = require("node-cron");
const positionsChanged = require("./positionsChanged");
const craftMessageForTelegram = require("./craftMessageForTelegram");
const sendTelegramMessage = require("./notify");
const {
  CRONE_SCHEDULE,
  MONITOR_URLS,
  IS_DEV_ENV,
  OTHER_TIME_OUTS,
} = require("./config");

let isScraping = false;

// Initialize previousPositionsData in memory
let previousPositionsData = {};

/**
 * Monitors the specified URLs for changes in positions data.
 */
async function monitor() {
  if (isScraping) {
    console.log("Previous scraping still in progress. Skipping this run.");
    return;
  }
  isScraping = true;

  for (const { Url, Description, OurRating, OwnerName } of MONITOR_URLS) {
    try {
      // Prepare input data for the worker
      const inputData = {
        url: Url,
        selectorToGet: 'tr[data-qa^="position-item-"]', // Adjust selector as needed
        timeout: OTHER_TIME_OUTS || 30000, // Use configured timeout or default
      };

      // Convert input data to base64
      const jsonData = JSON.stringify(inputData);
      const b64Data = Buffer.from(jsonData).toString("base64");

      // Spawn the Puppeteer worker
      const worker = spawn(
        "node",
        [path.resolve(__dirname, "puWorker.js"), `--input-data${b64Data}`],
        { shell: false }
      );

      let stdoutData = "";
      let stderrData = "";

      // Collect data from STDOUT
      worker.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      // Collect data from STDERR
      worker.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      // Handle worker exit
      const exitCode = await new Promise((resolve) => {
        worker.on("close", resolve);
      });

      if (exitCode !== 0) {
        // Handle errors reported by the worker
        let errorOutput;
        try {
          errorOutput = JSON.parse(stderrData);
        } catch (parseError) {
          errorOutput = { error: "Unknown error" };
        }
        console.error(`Error processing URL: ${Url}\n`, errorOutput.error);
        continue;
      }

      // Parse the output data
      let output;
      try {
        output = JSON.parse(stdoutData);
      } catch (parseError) {
        console.error(`Failed to parse output for URL: ${Url}\n`, parseError);
        continue;
      }

      const newScrapedData = output.extractedData;

      if (!newScrapedData) {
        console.log(`Scraping failed or no positions found for URL: ${Url}`);
        delete previousPositionsData[Url];

        const message = craftMessageForTelegram({
          url: Url,
          ownerName: OwnerName,
          description: Description,
          ourRating: OurRating,
          positionsData: previousPositionsData[Url] || [],
          statusMessage: "All positions closed",
        });

        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message);
        }
        console.log(`All positions closed for URL: ${Url}`);
        continue;
      }

      if (!previousPositionsData[Url]) {
        // First run: Initialize positions data
        previousPositionsData[Url] = newScrapedData;
        console.log(`First run: Initialized positions for URL: ${Url}`);
        continue;
      }

      const prevPositionsDataForUrl = previousPositionsData[Url] || [];

      // Compare previous and new data
      const posChanged = positionsChanged(
        prevPositionsDataForUrl,
        newScrapedData
      );
      if (posChanged.changed) {
        previousPositionsData[Url] = newScrapedData;

        const message = craftMessageForTelegram({
          url: Url,
          ownerName: OwnerName,
          description: Description,
          ourRating: OurRating,
          positionsData: newScrapedData,
          statusMessage: posChanged.message,
        });

        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message);
        }
        console.log(`Positions data sent for URL: ${Url}`);
      } else {
        console.log(`No significant changes detected for URL: ${Url}`);
      }
    } catch (error) {
      console.error(`Error processing URL: ${Url}\n`, error);
    }
  }

  isScraping = false;
}

/**
 * Handles graceful shutdown of the bot.
 */
function onExit() {
  console.log("Bot is shutting down...");
  // Optionally, perform cleanup tasks here
  process.exit();
}

// Listen for termination signals
process.on("SIGINT", onExit);
process.on("SIGTERM", onExit);

/**
 * Initializes and starts the monitoring process.
 */
function init() {
  // Run the monitor immediately on start
  monitor();

  // Schedule the monitor function based on CRONE_SCHEDULE (e.g., every 5 minutes)
  cron.schedule(CRONE_SCHEDULE, async () => {
    console.log("Scheduled monitor run...");
    await monitor();

    // Invoke Garbage Collector
    if (global.gc) {
      global.gc();
      console.log("Garbage collector invoked.");
      console.log("Current previousPositionsData:", previousPositionsData);
    } else {
      console.warn(
        "Garbage collector is not exposed. Start Node.js with --expose-gc."
      );
    }
  });

  // Optional: Periodically log memory usage for monitoring
  cron.schedule("*/2 * * * *", () => {
    const memoryUsage = process.memoryUsage();
    console.log("Memory Usage:", {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    });
  });
}

// Start the bot
init();
