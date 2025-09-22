const { Client } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`Bot is online as ${client.user.tag}`);
        
        // Initialiser les managers pour chaque serveur
        for (const guild of client.guilds.cache.values()) {
            if (global.initializeManagersForGuild) {
                await global.initializeManagersForGuild(guild.id, guild);
            }
        }
    },
};