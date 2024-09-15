// index.js
const scrapeTable = require("./scrape");
const sendTelegramMessage = require("./notify");
const { SIZE_CHANGE_THRESHOLD } = require("./config");
const { MONITOR_URLS } = require("./config");

let previousPositionsData = {}; // In-memory store

function positionsChanged(prevPositions, currentPositions) {
  const prevPositionsMap = {};
  prevPositions.forEach((pos) => {
    prevPositionsMap[pos.token] = pos;
  });

  const currentPositionsMap = {};
  currentPositions.forEach((pos) => {
    currentPositionsMap[pos.token] = pos;
  });

  // Check for added or removed positions
  const allTokens = new Set([
    ...Object.keys(prevPositionsMap),
    ...Object.keys(currentPositionsMap),
  ]);
  for (const token of allTokens) {
    const prevPos = prevPositionsMap[token];
    const currentPos = currentPositionsMap[token];

    if (!prevPos) {
      // New position added
      console.log(`New position added: ${token}`);
      return true;
    } else if (!currentPos) {
      // Position closed
      console.log(`Position closed: ${token}`);
      return true;
    } else {
      // Compare size or other significant fields
      const prevSizeStr = prevPos.size.replace(/[^0-9.-]+/g, "");
      const currentSizeStr = currentPos.size.replace(/[^0-9.-]+/g, "");

      const prevSize = parseFloat(prevSizeStr);
      const currentSize = parseFloat(currentSizeStr);

      if (isNaN(prevSize) || isNaN(currentSize) || prevSize === 0) {
        // Cannot parse sizes or previous size is zero, consider as changed
        console.log(`Cannot parse sizes for ${token}`);
        return true;
      }

      const sizeChangePercent =
        (Math.abs(currentSize - prevSize) / prevSize) * 100;

      if (sizeChangePercent >= SIZE_CHANGE_THRESHOLD) {
        // Set threshold as 5%
        console.log(
          `Position size changed for ${token}: ${prevSize} -> ${currentSize} (${sizeChangePercent.toFixed(
            2
          )}%)`
        );
        return true;
      }

      // Add more comparisons if needed
    }
  }

  // If no significant changes detected
  return false;
}

async function monitor() {
  for (const url of MONITOR_URLS) {
    try {
      const positionsData = await scrapeTable(url);

      if (!positionsData || positionsData.length === 0) {
        console.log(`No positions found for URL: ${url}`);
        continue;
      }

      const prevPositionsData = previousPositionsData[url];

      if (!prevPositionsData) {
        // First time, store the data and send message
        previousPositionsData[url] = positionsData;

        // Format the message
        let message = `*Positions Data for URL:*\n${url}\n\n`;
        positionsData.forEach((position, index) => {
          message += `*Position ${index + 1}:* ${position.token}\n`;
          message += `- *Collateral:* ${position.collateral}\n`;
          message += `- *Entry Price:* ${position.entryPrice}\n`;
          message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
          message += "\n";
        });

        // Send the message via Telegram
        await sendTelegramMessage(message);
        console.log(`Positions data sent for URL: ${url}`);
      } else {
        // Compare positions
        if (positionsChanged(prevPositionsData, positionsData)) {
          // Positions have changed, update and send message
          previousPositionsData[url] = positionsData;

          // Format the message
          let message = `*Updated Positions Data for URL:*\n${url}\n\n`;
          positionsData.forEach((position, index) => {
            message += `*Position ${index + 1}:* ${position.token}\n`;
            message += `- *Collateral:* ${position.collateral}\n`;
            message += `- *Entry Price:* ${position.entryPrice}\n`;
            message += `- *Liquidation Price:* ${position.liquidationPrice}\n`;
            message += "\n";
          });

          // Send the message via Telegram
          await sendTelegramMessage(message);
          console.log(`Positions data sent for URL: ${url}`);
        } else {
          // No significant changes
          console.log(`No significant changes detected for URL: ${url}`);
        }
      }
    } catch (error) {
      console.error(`Error processing URL: ${url}\n`, error);
    }
  }
}

// Handle process exit
process.on("SIGINT", () => {
  console.log("Bot is shutting down...");
  process.exit();
});

// Schedule the monitor function to run every 15 seconds
setInterval(monitor, 15000); // 15000 milliseconds = 15 seconds

// Run the monitor function immediately on startup
monitor();
