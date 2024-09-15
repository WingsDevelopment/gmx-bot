// scrape.js
const puppeteer = require("puppeteer");

async function scrapeTable(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  // Handle navigation timeout
  await page.setDefaultNavigationTimeout(60000); // 60 seconds

  await page.goto(url, { waitUntil: "networkidle2" });

  // Wait for positions data to load
  await page.waitForSelector('tr[data-qa^="position-item-"]');

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
}

module.exports = scrapeTable;
