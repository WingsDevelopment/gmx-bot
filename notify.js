// notify.js
const TelegramBot = require("node-telegram-bot-api");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

async function sendTelegramMessage(message) {
  await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: "Markdown" });
}

module.exports = sendTelegramMessage;
