const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave-team')
        .setDescription('Leave your current team'),
    async execute(interaction) {
        // Cette commande sera gérée dans interactionHandlers.js
        await interaction.deferReply({ ephemeral: true });
        const { handleLeaveTeam } = require('../utils/interactionHandlers');
        await handleLeaveTeam(interaction);
    },
};