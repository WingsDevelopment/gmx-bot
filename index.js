// index.js
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
const { Cluster } = require("puppeteer-cluster");
// index.js

let isScraping = false;

// Initialize previousPositionsData in memory
let previousPositionsData = {};
let isFirstRun = 0;

/**
 * Handles graceful shutdown of the bot.
 */
function onExit() {
  console.log("Bot is shutting down...");
  process.exit();
}

// Listen for termination signals
process.on("SIGINT", onExit);
process.on("SIGTERM", onExit);

/**
 * Initializes and starts the Puppeteer Cluster.
 */
async function initCluster() {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 5, // Adjust based on system capacity
    puppeteerOptions: {
      headless: true,
      args: [
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
      ],
    },
    timeout: 120 * 1000, // 2 minutes per task
    retryLimit: 2, // Number of retries per task
    retryDelay: 2000, // Delay between retries in ms
  });

  // Define the task function
  await cluster.task(async ({ page, data: urlObj }) => {
    const { Url, Description, OurRating, OwnerName } = urlObj;

    try {
      // Perform the scraping
      await page.goto(Url, {
        waitUntil: "networkidle2",
        timeout: urlObj.timeout || OTHER_TIME_OUTS,
      });

      // Wait for the selector to be available
      await page.waitForSelector('tr[data-qa^="position-item-"]', {
        timeout: urlObj.timeout || OTHER_TIME_OUTS,
      });

      // Extract positions data
      const newScrapedData = await page.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll('tr[data-qa^="position-item-"]')
        );
        return rows.map((row) => {
          const position = {};

          // Token and Leverage
          const tokenCell = row.querySelector('td[data-qa="position-handle"]');
          if (tokenCell) {
            const tokenName =
              tokenCell
                .querySelector(".Exchange-list-title")
                ?.innerText.trim() || "";
            const leverageText =
              tokenCell
                .querySelector(".Exchange-list-info-label")
                ?.innerText.trim() || "";
            position.token = `${tokenName} ${leverageText}`;
          }

          // Other columns
          const cols = Array.from(row.querySelectorAll("td"));
          position.size = cols[1]?.innerText.trim() || "";
          position.netValue = cols[2]?.innerText.trim() || "";
          position.collateral = cols[3]?.innerText.trim() || "";
          position.entryPrice = cols[4]?.innerText.trim() || "";
          position.markPrice = cols[5]?.innerText.trim() || "";
          position.liquidationPrice = cols[6]?.innerText.trim() || "";

          return position;
        });
      });

      if (isFirstRun <= MONITOR_URLS.length - 1) {
        previousPositionsData[Url] = newScrapedData || [];
        console.log(`First run: Initialized positions for URL: ${Url}`);
        isFirstRun++;
        return;
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
        return;
      }

      if (!newScrapedData || newScrapedData.length === 0) {
        console.log(`No new positions found for URL: ${Url}`);
        return;
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
        return;
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
      console.error(`Error scraping URL: ${Url}\n`, error.message);
      throw error; // Let Puppeteer Cluster handle retries
    }
  });

  return cluster;
}

/**
 * Monitors the specified URLs for changes in positions data.
 */
async function monitor(cluster) {
  if (isScraping) {
    console.log("Previous scraping still in progress. Skipping this run.");
    return;
  }
  isScraping = true;

  for (const urlObj of MONITOR_URLS) {
    cluster.queue(urlObj);
  }

  await cluster.idle();
  isScraping = false;
}

/**
 * Initializes and starts the monitoring process.
 */
async function init() {
  const cluster = await initCluster();

  // Schedule the monitor function based on CRONE_SCHEDULE (e.g., every 5 minutes)
  cron.schedule(CRONE_SCHEDULE, async () => {
    console.log("Scheduled monitor run...");
    await monitor(cluster);

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

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Received SIGINT. Shutting down gracefully...");
    await cluster.idle();
    await cluster.close();
    process.exit();
  });

  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM. Shutting down gracefully...");
    await cluster.idle();
    await cluster.close();
    process.exit();
  });
}

// Start the bot
init();
