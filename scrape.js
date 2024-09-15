// scrape.js
const puppeteer = require("puppeteer");
const { OTHER_TIME_OUTS } = require("./config");

async function scrapeTable(url) {
  try {
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();

    // Handle navigation timeout
    await page.setDefaultNavigationTimeout(OTHER_TIME_OUTS);

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: OTHER_TIME_OUTS,
    });

    // Wait for positions data to load
    await page.waitForSelector('tr[data-qa^="position-item-"]', {
      timeout: OTHER_TIME_OUTS,
    });

    // Check if the table with positions is available
    const tableExists =
      (await page.$('tr[data-qa^="position-item-"]')) !== null;

    if (!tableExists) {
      console.log(`No positions found for URL: ${url}`);
      await browser.close();
      return [];
    }

    // Extract positions data
    const positionsData = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('tr[data-qa^="position-item-"]')
      );
      return rows.map((row) => {
        const position = {};

        // Token and Leverage
        const tokenCell = row.querySelector('td[data-qa="position-handle"]');
        const tokenName = tokenCell
          .querySelector(".Exchange-list-title")
          .innerText.trim();
        const leverageText = tokenCell
          .querySelector(".Exchange-list-info-label")
          .innerText.trim();

        position.token = `${tokenName} ${leverageText}`;

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

    await browser.close();
    return positionsData;
  } catch (error) {
    console.error(`Error scraping table: ${url}\n`, error);
    return null;
  }
}

module.exports = scrapeTable;
