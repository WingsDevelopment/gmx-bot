// puWorker.js
const puppeteer = require("puppeteer");

/**
 * Parses the input data from command-line arguments.
 * Expects an argument in the format --input-data<base64-encoded-json>
 */
function parseInputData() {
  const inputDataArg = process.argv.find((arg) =>
    arg.startsWith("--input-data")
  );
  if (!inputDataArg) {
    throw new Error("No input data provided. Use --input-data flag.");
  }
  const b64Data = inputDataArg.replace("--input-data", "");
  const jsonData = Buffer.from(b64Data, "base64").toString();
  return JSON.parse(jsonData);
}

/**
 * Performs the scraping task.
 * @param {string} url - The URL to scrape.
 * @param {string} selectorToGet - The CSS selector to extract data from.
 * @param {number} timeout - Navigation timeout in milliseconds.
 * @returns {Array|null} - The scraped data or null if failed.
 */
async function scrapeTable(url, selectorToGet, timeout, browser) {
  const page = await browser.newPage();

  // Enable request interception before adding the event listener
  await page.setRequestInterception(true);

  // Handle request interception
  page.on("request", (request) => {
    const resourceType = request.resourceType();
    if (resourceType === "image" || resourceType === "font") {
      request.abort();
    } else {
      request.continue();
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    // Wait for the selector to be available
    await page.waitForSelector(selectorToGet, { timeout });

    // Extract positions data
    const scrapedData = await page.evaluate((selector) => {
      const rows = Array.from(document.querySelectorAll(selector));
      return rows.map((row) => {
        const position = {};

        // Token and Leverage
        const tokenCell = row.querySelector('td[data-qa="position-handle"]');
        if (tokenCell) {
          const tokenName =
            tokenCell.querySelector(".Exchange-list-title")?.innerText.trim() ||
            "";
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
    }, selectorToGet);

    await browser.close();

    // Output the result as JSON string to STDOUT
    console.log(JSON.stringify({ extractedData: scrapedData }));
  } catch (error) {
    await browser.close();
    // Output the error message as JSON string to STDERR
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1); // Exit with failure code
  }
}

// Main execution
(async () => {
  try {
    const inputData = parseInputData();
    const { url, selectorToGet, timeout = 30000 } = inputData;

    if (!url || !selectorToGet) {
      throw new Error(
        'Both "url" and "selectorToGet" must be provided in input data.'
      );
    }

    const browser = await puppeteer.launch({
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
    });

    await scrapeTable(url, selectorToGet, timeout, browser);
  } catch (error) {
    // Output the error message as JSON string to STDERR
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1); // Exit with failure code
  }
})();
