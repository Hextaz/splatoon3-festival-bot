const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick-member')
        .setDescription('Kick a member from your team (leader only)')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to kick')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const { handleKickMember } = require('../utils/interactionHandlers');
        await handleKickMember(interaction);
    },
};