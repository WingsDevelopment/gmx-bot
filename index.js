// index.js
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const { MONITOR_URLS } = require("./config");

async function monitor() {
  for (const url of MONITOR_URLS) {
    try {
      const positionsData = await scrapeTable(url);
      if (positionsData.length === 0) {
        console.log(`No positions found for URL: ${url}`);
        continue;
      }

      // Format the message
      let message = `*Positions Data for URL:*\n${url}\n\n`;
      positionsData.forEach((position, index) => {
        message += `*Position ${index + 1}:*\n`;
        message += `- *Token:* ${position.token}\n`;
        message += `- *Size:* ${position.size}\n`;
        message += `- *Net Value:* ${position.netValue}\n`;
        message += `- *Collateral:* ${position.collateral}\n`;
        message += `- *Entry Price:* ${position.entryPrice}\n`;
        message += `- *Mark Price:* ${position.markPrice}\n`;
        message += `- *Liq. Price:* ${position.liquidationPrice}\n`;
        message += "\n";
      });

      // Send the message via Telegram
      await sendTelegramMessage(message);
      console.log(`Positions data sent for URL: ${url}`);
    } catch (error) {
      console.error(`Error processing URL: ${url}\n`, error);
    }
  }
}

// Run the monitor function
monitor();
