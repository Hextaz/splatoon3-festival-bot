const config = {
    botToken: process.env.BOT_TOKEN,
    prefix: '/',
    databaseUrl: process.env.DATABASE_URL,
    voteTimeout: 300, // Time in seconds for voting
    matchTimeout: 600, // Time in seconds for matches
};

module.exports = config;