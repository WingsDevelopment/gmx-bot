// index.js
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const {
  SIZE_CHANGE_THRESHOLD,
  TIME_OUT_MS,
  MONITOR_URLS,
} = require("./config");

let browser;
let page;

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

function positionsChanged(prevPositions, currentPositions) {
  const prevTokens = prevPositions.map((pos) => pos.token);
  const currentTokens = currentPositions.map((pos) => pos.token);

  // Create sets of tokens for easier comparison
  const prevTokenSet = new Set(prevTokens);
  const currentTokenSet = new Set(currentTokens);

  // Check for added or removed positions by comparing token sets
  const allTokens = new Set([...prevTokenSet, ...currentTokenSet]);

  for (const token of allTokens) {
    const inPrev = prevTokenSet.has(token);
    const inCurrent = currentTokenSet.has(token);

    if (!inPrev && inCurrent) {
      // New position added
      console.log(`New position added: ${token}`);
      return {
        changed: true,
        message: `New position added: ${token}`,
      };
    } else if (inPrev && !inCurrent) {
      // Position closed
      console.log(`Position closed: ${token}`);
      return {
        changed: true,
        message: `Position closed: ${token}`,
      };
    }
  }

  // No changes detected in token set
  return {
    changed: false,
    message: "",
  };
}

async function monitor() {
  try {
    if (!browser) {
      // Launch the browser only once when the bot starts
      browser = await puppeteer.launch({
        // executablePath: "/usr/bin/chromium-browser",
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      });
      console.log("Browser launched.");

      page = await browser.newPage();
      console.log("Page created.");
    }
  } catch (error) {
    console.error("Failed to launch browser:", error);
    return;
  }
  for (const url of MONITOR_URLS) {
    try {
      const positionsData = await scrapeTable(url, page);

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
        const posChanged = positionsChanged(
          prevPositionsDataForUrl,
          positionsData
        );
        if (posChanged.changed) {
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
          await sendTelegramMessage(message + "\n\n" + posChanged.message);
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
}

process.on("SIGINT", async () => {
  console.log("Bot is shutting down...");
  await browser.close();
  process.exit();
});

setInterval(monitor, TIME_OUT_MS); // TIME_OUT_MS milliseconds interval
