module.exports = {
  TELEGRAM_BOT_TOKEN: "7139586985:AAHRApECA0hfDlxfFZnU_3vcJ22OM0QF48E",
  TELEGRAM_CHAT_IDS: ["6416507389", "6233329129", "6879271962"], //""
  SIZE_CHANGE_THRESHOLD: 5,
  MONITOR_URLS: [
    {
      OwnerName: "/",
      Description: "Top 1 Avalanche account (seems experienced)",
      Url: "https://app.gmx.io/#/accounts/0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F?network=avalanche&v=2",
      OurRating: "/",
    },
    {
      OwnerName: "/",
      Description: "Eth long, entered at right price",
      Url: "https://app.gmx.io/#/accounts/0xf9a6eAB21B54196dDF7E9BAf79Be2188f32681db?network=arbitrum&v=2",
      OurRating: "/",
    },
    {
      OwnerName: "/",
      Description: "Eth long, copycat, high win percentage",
      Url: "https://app.gmx.io/#/accounts/0x5dCD4b840CBC72408316E0a43cBB2a6B5812E929?network=arbitrum&v=2",
      OurRating: "4/5",
    },
    {
      OwnerName: "/",
      Description: "Very high win%, no loses",
      Url: "https://app.gmx.io/#/accounts/0x5CE6f3798B9ca0797E1027E9b86E7dF0Ba61E593?network=arbitrum&v=2",
      OurRating: "/",
    },
    {
      OwnerName: "/",
      Description: "Waiting to long btc",
      Url: "https://app.gmx.io/#/accounts/0xB6860393Ade5CD3766E47e0B031A0F4C33FD48a4?network=arbitrum&v=2",
      OurRating: "/",
    },
    {
      OwnerName: "Cowboy",
      Description: "Bot owner",
      Url: "https://app.gmx.io/#/accounts/0x7b555e1981893F35A10Ef5A7B9688207B805CA33?network=arbitrum&v=2",
      OurRating: "5/5",
    },
  ],
  CRONE_SCHEDULE: "*/5 * * * *",
  OTHER_TIME_OUTS: 15 * 1000,
  IS_DEV_ENV: false,
  // CRONE_SCHEDULE: "*/1 * * * *",
  // OTHER_TIME_OUTS: 5000,
  // IS_DEV_ENV: true,
};
