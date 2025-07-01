const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join-team')
        .setDescription('Join an existing team'),
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('joinTeamModal')
            .setTitle('Join a team');

        const teamNameInput = new TextInputBuilder()
            .setCustomId('teamNameInput')
            .setLabel('Team Name')
            .setPlaceholder('Enter the team name you want to join')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const teamCodeInput = new TextInputBuilder()
            .setCustomId('teamCodeInput')
            .setLabel('Team Code (if required)')
            .setPlaceholder('Leave empty for open teams')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const firstRow = new ActionRowBuilder().addComponents(teamNameInput);
        const secondRow = new ActionRowBuilder().addComponents(teamCodeInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
    },
};