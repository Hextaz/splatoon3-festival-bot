require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Vérifier si la commande est celle qu'on souhaite ignorer (matchup)
    if (file !== 'matchup.js') {
        if (!command || !command.data) {
            console.warn(`⚠️ Commande ignorée - ${file}: command.data manquant`);
            continue;
        }
        commands.push(command.data.toJSON());
    }
}

// Déploiement des commandes
async function deployCommands() {
    if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
        console.error('Please set BOT_TOKEN and CLIENT_ID in your .env file');
        process.exit(1);
    }

    const rest = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
    
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
    
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}
    
module.exports = deployCommands;