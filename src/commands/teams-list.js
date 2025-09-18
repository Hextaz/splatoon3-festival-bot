const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('teams-list')
        .setDescription('View all teams and their members'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const { handleTeamsList } = require('../utils/interactionHandlers');
        await handleTeamsList(interaction);
    },
};