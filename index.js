const puppeteer = require("puppeteer");
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const cron = require("node-cron");
const { CRONE_SCHEDULE, MONITOR_URLS, IS_DEV_ENV } = require("./config");

let isScraping = false;
let initializingBrowser = false;
let isFirstRun = 0; // Changed to boolean for clarity

console.log("Starting the bot...");

// Initialize previousPositionsData in memory
let previousPositionsData = {};
let runCounter = 1;

/**
 * Determines if there are changes between previous and current positions.
 * @param {Array} prevPositions - The previous positions data.
 * @param {Array} currentPositions - The current scraped positions data.
 * @returns {Object} - An object indicating if there's a change and the corresponding message.
 */
function positionsChanged(prevPositions, currentPositions) {
  const prevEntries = prevPositions.map((pos) =>
    parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2)
  );
  const currentEntries = currentPositions.map((pos) =>
    parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2)
  );

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
        (pos) =>
          parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2) ===
          entryPrice
      );
      return {
        changed: true,
        message: `*New position added*: ${newPosition.token} at entry price ${entryPrice}`,
      };
    } else if (inPrev && !inCurrent) {
      // Position closed
      console.log(`Position closed with entryPrice: ${entryPrice}`);
      const closedPosition = prevPositions.find(
        (pos) =>
          parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2) ===
          entryPrice
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

/**
 * Crafts a message for Telegram based on the provided data.
 * @param {Object} params - The parameters for crafting the message.
 * @returns {string} - The formatted Telegram message.
 */
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

/**
 * Retries scraping the table data with specified attempts.
 * @param {string} url - The URL to scrape.
 * @param {Object} page - The Puppeteer page instance.
 * @param {number} retries - Number of retry attempts.
 * @returns {Array|null} - The scraped data or null if all attempts fail.
 */
async function retryScrapeTable(url, page, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const scrapedData = await scrapeTable(url, page);
      if (scrapedData) {
        return scrapedData; // If successful, return the scraped data
      }
      console.log(`Attempt ${attempt} failed for URL: ${url}, retrying...`);
    } catch (error) {
      console.error(
        `Attempt ${attempt} resulted in an error for URL: ${url}`,
        error
      );
    }
    if (attempt === retries) {
      console.error(`All ${retries} attempts failed for URL: ${url}`);
      return null; // If all attempts fail, return null
    }
  }
  return null;
}

/**
 * Monitors the specified URLs for changes in positions data.
 */
async function monitor(_browser, page) {
  if (isScraping || initializingBrowser) return;
  isScraping = true;

  for (const { Url, Description, OurRating, OwnerName } of MONITOR_URLS) {
    try {
      const newScrapedData = await retryScrapeTable(Url, page);

      if (isFirstRun <= MONITOR_URLS.length - 1) {
        previousPositionsData[Url] = newScrapedData || [];
        console.log(`First run: Initialized positions for URL: ${Url}`);
        isFirstRun++;
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
          statusMessage: "First-time positions detected",
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

/**
 * Initializes the Puppeteer browser and page.
 */
async function initializeBrowser() {
  let browser;
  let page;
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-accelerated-2d-canvas",
    "--no-zygote",
    "--single-process",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-extensions-with-background-pages",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--force-color-profile=srgb",
  ];

  try {
    if (!browser) {
      initializingBrowser = true;
      browser = await puppeteer.launch({
        headless: true,
        args,
      });

      page = await browser.newPage();

      await page.setDefaultNavigationTimeout(OTHER_TIME_OUTS);

      await page.setRequestInterception(true);

      page.on("request", (request) => {
        const resourceType = request.resourceType();

        // Simple hook to remove any images or fonts
        if (resourceType === "image" || resourceType === "font") {
          request.abort();
        } else {
          request.continue();
        }
      });
    }
  } catch (error) {
    try {
      if (!browser) {
        initializingBrowser = true;
        browser = await puppeteer.launch({
          executablePath: "/usr/bin/chromium-browser",
          headless: true,
          args,
        });
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(OTHER_TIME_OUTS);

        await page.setRequestInterception(true);

        page.on("request", (request) => {
          const resourceType = request.resourceType();

          // Simple hook to remove any images or fonts
          if (resourceType === "image" || resourceType === "font") {
            request.abort();
          } else {
            request.continue();
          }
        });
      }
    } catch (error) {
      console.error("Failed to launch browser:", error);
    } finally {
      initializingBrowser = false;
    }
  } finally {
    initializingBrowser = false;
  }

  console.log("Browser launched.");

  return {
    browser,
    page,
  };
}

/**
 * Handles graceful shutdown of the bot.
 */
function onExit() {
  console.log("Bot is shutting down...");
  // No need to write data to file since we're keeping state in memory
  process.exit();
}

// Listen for termination signals
process.on("SIGINT", onExit);
process.on("SIGTERM", onExit);

/**
 * Initializes and starts the monitoring process.
 */
async function init() {
  const { browser, page } = await initializeBrowser();

  cronJob = cron.schedule(CRONE_SCHEDULE, async () => {
    console.log("Scheduled monitor run...");
    runCounter++;

    if (runCounter > 23) {
      console.log(
        "Run limit reached, stopping cron job and closing browser..."
      );

      // Stop the cron job
      cronJob.stop();

      // Close the browser and page
      await page.close();
      await browser.close();

      runCounter = 1;

      console.log("Cron job stopped, browser closed.");
      return; // Exit the cron job gracefully
    }
    await monitor(browser, page);

    if (global.gc) {
      global.gc();
      console.log("Garbage collector invoked.");
      console.log(
        "Current previousPositionsData:",
        previousPositionsData?.test
      );
    } else {
      console.warn(
        "Garbage collector is not exposed. Start Node.js with --expose-gc."
      );
    }
  });
}

// Start the bot
init();
