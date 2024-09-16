const puppeteer = require("puppeteer");
const fs = require("fs"); // Use async file operations
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

function loadPreviousData() {
  try {
    const rawData = fs.readFileSync(DATA_FILE, "utf8");
    previousPositionsData = JSON.parse(rawData);
    console.log("Loaded previous positions data from file.");
  } catch (error) {
    console.log(
      "No previous positions data file found or error reading it. Starting fresh."
    );
  }
}

function positionsChanged(prevPositions, currentPositions) {
  const prevEntries = prevPositions.map((pos) => pos.entryPrice);
  const currentEntries = currentPositions.map((pos) => pos.entryPrice);

  const prevEntrySet = new Set(prevEntries);
  const currentEntrySet = new Set(currentEntries);
  const allEntries = new Set([...prevEntrySet, ...currentEntrySet]);

  for (const entryPrice of allEntries) {
    const inPrev = prevEntrySet.has(entryPrice);
    const inCurrent = currentEntrySet.has(entryPrice);

    if (!inPrev && inCurrent) {
      // New position added
      console.log(`New position added with entryPrice: ${entryPrice}`);
      const newPosition = currentPositions.find(
        (pos) => pos.entryPrice === entryPrice
      );
      return {
        changed: true,
        message: `*New position added*: ${newPosition.token} at entry price ${entryPrice}`,
      };
    } else if (inPrev && !inCurrent) {
      // Position closed
      console.log(`Position closed with entryPrice: ${entryPrice}`);
      const closedPosition = prevPositions.find(
        (pos) => pos.entryPrice === entryPrice
      );
      return {
        changed: true,
        message: `*Position closed*: ${closedPosition.token} at entry price ${entryPrice}`,
      };
    }
  }

  // No changes detected in entry prices
  return { changed: false, message: "" };
}

function craftMessageForTelegram({
  url,
  ownerName,
  description,
  ourRating,
  positionsData = [],
  statusMessage = "",
}) {
  let message = `*Owner*: ${ownerName}\n*Description*: ${description}\n*Our Rating*: ${ourRating}\n\n`;
  message += statusMessage ? `*Status*: ${statusMessage}\n\n` : "";
  message += `*Positions Data for URL:*\n${url}\n\n`;

  positionsData.forEach((position, index) => {
    message += `*Position ${index + 1}:* ${position.token}\n`;
    message += `- *Collateral:* ${position.collateral}\n`;
    message += `- *Entry Price:* ${position.entryPrice}\n`;
    message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
    message += "\n";
  });

  return message;
}

async function monitor() {
  if (isScraping || initializingBrowser) return;
  isScraping = true;

  for (const { Url, Description, OurRating, OwnerName } of MONITOR_URLS) {
    try {
      const newScrapedData = await scrapeTable(Url, page);
      if (isFirstRun <= MONITOR_URLS.length - 1) {
        isFirstRun++;
        console.log({ isFirstRun });
        continue;
      }

      const prevPositionsDataForUrl = previousPositionsData[Url] || [];

      if (!newScrapedData && prevPositionsDataForUrl.length > 0) {
        console.log(`Scraping failed or no positions found for URL: ${Url}`);
        delete previousPositionsData[Url];

        const message = craftMessageForTelegram({
          url: Url,
          ownerName: OwnerName,
          description: Description,
          ourRating: OurRating,
          positionsData: prevPositionsDataForUrl,
          statusMessage: "All positions closed",
        });

        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message);
        }
        console.log(`All positions closed for URL: ${Url}`);
        continue;
      }

      if (!newScrapedData || newScrapedData.length === 0) {
        console.log(`No new positions found for URL: ${Url}`);
        continue;
      }

      if (prevPositionsDataForUrl.length === 0) {
        console.log(`First-time positions detected for URL: ${Url}`);
        previousPositionsData[Url] = newScrapedData;

        const message = craftMessageForTelegram({
          url: Url,
          ownerName: OwnerName,
          description: Description,
          ourRating: OurRating,
          positionsData: newScrapedData,
        });

        if (!IS_DEV_ENV) {
          await sendTelegramMessage(message);
        }
        console.log(`Positions data sent for URL: ${Url}`);
        continue;
      }

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

async function initializeBrowser() {
  try {
    if (!browser) {
      initializingBrowser = true;
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
  } finally {
    initializingBrowser = false;
  }
}

function writeDataToFile() {
  console.log({ previousPositionsData });
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(previousPositionsData, null, 2),
      "utf8"
    );
    console.log("Data successfully written to file.");
  } catch (error) {
    console.error("Error writing data to file:", error);
  }
}

process.on("SIGINT", onExit);

function onExit() {
  console.log("Bot is shutting down...");
  writeDataToFile();
  browser.close().then(() => {
    console.log("Browser closed.");
    console.log({ browser });
  });

  process.exit();
}

async function init() {
  loadPreviousData();
  await initializeBrowser();
  await monitor();
  setInterval(monitor, TIME_OUT_MS); // TIME_OUT_MS milliseconds interval
}

init();
