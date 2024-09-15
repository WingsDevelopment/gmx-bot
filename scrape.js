// scrape.js
const puppeteer = require("puppeteer");

async function scrapeTable(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  // Handle navigation timeout
  await page.setDefaultNavigationTimeout(0);

  await page.goto(url, { waitUntil: "networkidle2" });

  // Wait for the positions table to load
  await page.waitForSelector('tr[data-qa^="position-item-"]');

  // Extract positions data
  const positionsData = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('tr[data-qa^="position-item-"]')
    );
    return rows.map((row) => {
      const cols = Array.from(row.querySelectorAll("td"));
      const position = {};

      // Extract relevant data
      position.token = cols[0]?.innerText.trim() || "";
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
