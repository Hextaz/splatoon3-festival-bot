const config = {
    botToken: process.env.BOT_TOKEN,
    prefix: '/',
    databaseUrl: process.env.DATABASE_URL,
    voteTimeout: 300, // Time in seconds for voting
    matchTimeout: 600, // Time in seconds for matches
    allowedGuildId: process.env.ALLOWED_GUILD_ID, // ID du serveur Discord autorisé (optionnel)
    maxGuilds: process.env.MAX_GUILDS ? parseInt(process.env.MAX_GUILDS) : 10, // Limite configurable
    multiServerEnabled: process.env.MULTI_SERVER_ENABLED !== 'false', // Activé par défaut
};

module.exports = config;