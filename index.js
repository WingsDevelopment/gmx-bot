// index.js
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const { TIME_OUT_MS, MONITOR_URLS, IS_DEV_ENV } = require("./config");

let browser;
let page;
let isScraping = false;
let initializingBrowser = false;
let isFirstRun = 0;

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
        message: `*New position added*: ${token}`,
      };
    } else if (inPrev && !inCurrent) {
      // Position closed
      console.log(`Position closed: ${token}`);
      return {
        changed: true,
        message: `*Position closed*: ${token}`,
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
  if (isScraping || initializingBrowser) return;
  isScraping = true;

  for (const url of MONITOR_URLS) {
    try {
      const newScrapedData = await scrapeTable(url, page);
      // todo remove this hack :)
      if (isFirstRun <= MONITOR_URLS.length) {
        isFirstRun++;
        continue;
      }

      const prevPositionsDataForUrl = previousPositionsData[url];

      if (!prevPositionsDataForUrl && newScrapedData) {
        // First time, store the data and send message
        previousPositionsData[url] = newScrapedData;

        // Write updated data to file
        fs.writeFileSync(
          DATA_FILE,
          JSON.stringify(previousPositionsData, null, 2)
        );

        // Format the message
        let message = `*Positions Data for URL:*\n${url}\n\n`;
        newScrapedData.forEach((position, index) => {
          message += `*Position ${index + 1}:* ${position.token}\n`;
          message += `- *Collateral:* ${position.collateral}\n`;
          message += `- *Entry Price:* ${position.entryPrice}\n`;
          message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
          message += "\n";
        });

        // Send the message via Telegram
        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message);
        }
        console.log(`Positions data sent for URL: ${url}`);
        continue;
      }

      if (
        !newScrapedData ||
        (newScrapedData.length === 0 && prevPositionsDataForUrl)
      ) {
        delete previousPositionsData[url];
        // Write updated data to file
        fs.writeFileSync(
          DATA_FILE,
          JSON.stringify(previousPositionsData, null, 2)
        );

        // Send a message to the user
        let message = `*All positions closed for URL:*\n${url}\n\n*Previously held positions:*\n\n`;
        prevPositionsDataForUrl.forEach((position, index) => {
          message += `*Position ${index + 1}:* ${position.token}\n`;
          message += `- *Collateral:* ${position.collateral}\n`;
          message += `- *Entry Price:* ${position.entryPrice}\n`;
          message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
          message += "\n";
        });

        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message + "\n\nAll positions closed.");
        }
        console.log(`All positions closed for URL: ${url}`);
        continue;
      }
      if (newScrapedData) {
        // Compare positions
        const posChanged = positionsChanged(
          prevPositionsDataForUrl,
          newScrapedData
        );
        if (posChanged.changed) {
          // Positions have changed, update and send message
          previousPositionsData[url] = newScrapedData;

          // Write updated data to file
          fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(previousPositionsData, null, 2)
          );

          // Format the message
          let message = `*Updated Positions Data for URL:*\n${url}\n\n`;
          newScrapedData.forEach((position, index) => {
            message += `*Position ${index + 1}:* ${position.token}\n`;
            message += `- *Collateral:* ${position.collateral}\n`;
            message += `- *Entry Price:* ${position.entryPrice}\n`;
            message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
            message += "\n";
          });

          // Send the message via Telegram
          if (!IS_DEV_ENV) {
            await sendTelegramMessage(posChanged.message + "\n" + message);
          }
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

  isScraping = false;
}

async function initializeBrowser() {
  try {
    if (!browser) {
      initializingBrowser = true;
      // Launch the browser only once when the bot starts
      browser = await puppeteer.launch({
        executablePath: IS_DEV_ENV ? undefined : "/usr/bin/chromium-browser",
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
  } finally {
    initializingBrowser = false;
  }
}

process.on("SIGINT", async () => {
  console.log("Bot is shutting down...");
  await browser.close();
  process.exit();
});

setInterval(monitor, TIME_OUT_MS); // TIME_OUT_MS milliseconds interval
initializeBrowser();
