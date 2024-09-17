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

module.exports = craftMessageForTelegram;
