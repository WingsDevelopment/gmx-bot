// notify.js
const TelegramBot = require("node-telegram-bot-api");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS } = require("./config");

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

async function sendTelegramMessage(message) {
  try {
    await Promise.all(
      TELEGRAM_CHAT_IDS.map((chatId) =>
        bot.sendMessage(chatId, message, { parse_mode: "Markdown" })
      )
    );
    console.log("Message sent to all chat IDs.");
  } catch (error) {
    console.error("Failed to send message to all chat IDs:", error);
  }
}

module.exports = sendTelegramMessage;
