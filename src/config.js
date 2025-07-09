const config = {
    botToken: process.env.BOT_TOKEN,
    prefix: '/',
    databaseUrl: process.env.DATABASE_URL,
    voteTimeout: 300, // Time in seconds for voting
    matchTimeout: 600, // Time in seconds for matches
    allowedGuildId: process.env.ALLOWED_GUILD_ID, // ID du serveur Discord autorisé (optionnel)
    maxGuilds: 1, // Limite le bot à 1 serveur maximum
};

module.exports = config;