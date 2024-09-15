// api/monitor.js
const scrapeTable = require("../scrape");
const sendTelegramMessage = require("../notify");
const { MONITOR_URLS } = require("../config");

module.exports = async (req, res) => {
  for (const url of MONITOR_URLS) {
    try {
      const tableData = await scrapeTable(url);
      if (tableData.length === 0) {
        console.log(`No data found for URL: ${url}`);
        continue;
      }

      // Format the message
      let message = `*Table Data for URL:*\n${url}\n\n`;
      tableData.forEach((row, index) => {
        message += `*Row ${index + 1}:*\n`;
        row.forEach((col, colIndex) => {
          message += `- *Column ${colIndex + 1}:* ${col}\n`;
        });
        message += "\n";
      });

      // Send the message via Telegram
      await sendTelegramMessage(message);
      console.log(`Data sent for URL: ${url}`);
    } catch (error) {
      console.error(`Error processing URL: ${url}\n`, error);
    }
  }

  res.status(200).send("Monitoring complete");
};
