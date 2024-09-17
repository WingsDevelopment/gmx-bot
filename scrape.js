// scrape.js
const { OTHER_TIME_OUTS } = require("./config");

async function scrapeTable(url, page) {
  try {
    // Handle navigation timeout
    await page.setDefaultNavigationTimeout(OTHER_TIME_OUTS);

    page.on("request", (request) => {
      const resourceType = request.resourceType();

      // Simple hook to remove any images or fonts
      if (resourceType === "image" || resourceType === "font") {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: OTHER_TIME_OUTS,
    });

    // Wait for positions data to load
    await page.waitForSelector('tr[data-qa^="position-item-"]', {
      timeout: OTHER_TIME_OUTS,
    });

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

    return positionsData;
  } catch (error) {
    // console.error(`Error scraping table: ${url}\n`, error);
    return null;
  }
}

module.exports = scrapeTable;
