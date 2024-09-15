// index.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer"); // Import puppeteer here
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const {
  SIZE_CHANGE_THRESHOLD,
  TIME_OUT_MS,
  MONITOR_URLS,
} = require("./config");

const DATA_FILE = path.join(__dirname, "previousPositionsData.json");

console.log("Starting the bot...");

// Initialize previousPositionsData from the file
let previousPositionsData = {};

// Check if the data file exists
if (fs.existsSync(DATA_FILE)) {
  try {
    const rawData = fs.readFileSync(DATA_FILE);
    previousPositionsData = JSON.parse(rawData);
    console.log("Loaded previous positions data from file.");
  } catch (error) {
    console.error("Error reading previous positions data file:", error);
    previousPositionsData = {};
  }
} else {
  console.log("No previous positions data file found. Starting fresh.");
}

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

function positionsChanged(prevPositions, currentPositions) {
  const prevPositionsMap = {};
  prevPositions.forEach((pos) => {
    prevPositionsMap[pos.token] = pos;
  });

  const currentPositionsMap = {};
  currentPositions.forEach((pos) => {
    currentPositionsMap[pos.token] = pos;
  });

  // Check for added or removed positions
  const allTokens = new Set([
    ...Object.keys(prevPositionsMap),
    ...Object.keys(currentPositionsMap),
  ]);

  for (const token of allTokens) {
    const prevPos = prevPositionsMap[token];
    const currentPos = currentPositionsMap[token];

    if (!prevPos) {
      // New position added
      console.log(`New position added: ${token}`);
      return true;
    } else if (!currentPos) {
      // Position closed
      console.log(`Position closed: ${token}`);
      return true;
    } else {
      // Compare size or other significant fields
      const prevSizeStr = prevPos.size.replace(/[^0-9.-]+/g, "");
      const currentSizeStr = currentPos.size.replace(/[^0-9.-]+/g, "");

      const prevSize = parseFloat(prevSizeStr);
      const currentSize = parseFloat(currentSizeStr);

      if (isNaN(prevSize) || isNaN(currentSize) || prevSize === 0) {
        // Cannot parse sizes or previous size is zero, consider as changed
        console.log(`Cannot parse sizes for ${token}`);
        return true;
      }

      const sizeChangePercent =
        (Math.abs(currentSize - prevSize) / prevSize) * 100;

      if (sizeChangePercent >= SIZE_CHANGE_THRESHOLD) {
        // Size change exceeds threshold
        console.log(
          `Position size changed for ${token}: ${prevSize} -> ${currentSize} (${sizeChangePercent.toFixed(
            2
          )}%)`
        );
        return true;
      }
    }
  }

  // No significant changes detected
  return false;
}

async function monitor() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser", // Adjust if necessary
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    for (const url of MONITOR_URLS) {
      try {
        const positionsData = await scrapeTable(url, browser);

        if (!positionsData || positionsData.length === 0) {
          console.log(`No positions found for URL: ${url}`);
          continue;
        }

        const prevPositionsDataForUrl = previousPositionsData[url];

        if (!prevPositionsDataForUrl) {
          // First time, store the data and send message
          previousPositionsData[url] = positionsData;

          // Write updated data to file
          fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(previousPositionsData, null, 2)
          );

          // Format the message
          let message = `*Positions Data for URL:*\n${url}\n\n`;
          positionsData.forEach((position, index) => {
            message += `*Position ${index + 1}:* ${position.token}\n`;
            message += `- *Collateral:* ${position.collateral}\n`;
            message += `- *Entry Price:* ${position.entryPrice}\n`;
            message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
            message += "\n";
          });

          // Send the message via Telegram
          await sendTelegramMessage(message);
          console.log(`Positions data sent for URL: ${url}`);
        } else {
          // Compare positions
          if (positionsChanged(prevPositionsDataForUrl, positionsData)) {
            // Positions have changed, update and send message
            previousPositionsData[url] = positionsData;

            // Write updated data to file
            fs.writeFileSync(
              DATA_FILE,
              JSON.stringify(previousPositionsData, null, 2)
            );

            // Format the message
            let message = `*Updated Positions Data for URL:*\n${url}\n\n`;
            positionsData.forEach((position, index) => {
              message += `*Position ${index + 1}:* ${position.token}\n`;
              message += `- *Collateral:* ${position.collateral}\n`;
              message += `- *Entry Price:* ${position.entryPrice}\n`;
              message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
              message += "\n";
            });

            // Send the message via Telegram
            await sendTelegramMessage(message);
            console.log(`Positions data sent for URL: ${url}`);
          } else {
            // No significant changes
            console.log(`No significant changes detected for URL: ${url}`);
          }
        }
      } catch (error) {
        console.error(`Error processing URL: ${url}\n`, error);
      }
    }
  } catch (error) {
    console.error("Error in monitor function:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function startMonitoring() {
  while (true) {
    try {
      await monitor();
    } catch (error) {
      console.error("Error in monitoring loop:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, TIME_OUT_MS));
  }
}

process.on("SIGINT", () => {
  console.log("Bot is shutting down...");
  process.exit();
});

startMonitoring();
