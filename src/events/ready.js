const { Client } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Bot is online as ${client.user.tag}`);
        
        // Initialiser les managers pour chaque serveur
        client.guilds.cache.forEach(guild => {
            if (global.initializeManagersForGuild) {
                global.initializeManagersForGuild(guild.id);
            }
        });
    },
};