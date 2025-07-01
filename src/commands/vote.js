const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote pour un camp et rejoins-le pour le festival'),
    
    async execute(interaction) {
        // Vérifier si un festival existe
        const festival = getCurrentFestival();
        if (!festival) {
            return await interaction.reply({
                content: 'Aucun festival actif actuellement. Veuillez attendre la création d\'un festival.',
                ephemeral: true
            });
        }
        
        // Vérifier si le joueur a déjà voté (a déjà un rôle de camp)
        const member = interaction.member;
        
        // Vérifier les rôles de camp existants
        const campRoles = [
            member.roles.cache.find(role => role.name === `Camp ${festival.campNames[0]}`),
            member.roles.cache.find(role => role.name === `Camp ${festival.campNames[1]}`),
            member.roles.cache.find(role => role.name === `Camp ${festival.campNames[2]}`)
        ];
        
        if (campRoles.some(role => role)) {
            const existingRole = campRoles.find(role => role);
            return await interaction.reply({
                content: `Vous avez déjà rejoint le camp ${existingRole.name.replace('Camp ', '')}. Vous ne pouvez pas changer de camp pendant le festival.`,
                ephemeral: true
            });
        }
        
        // Créer un embed avec les options de camp
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Votez pour un camp: ${festival.title}`)
            .setDescription('Choisissez votre camp pour ce festival. **Attention**: ce choix est définitif!')
            .addFields(
                { name: 'Camp 1', value: festival.campNames[0], inline: true },
                { name: 'Camp 2', value: festival.campNames[1], inline: true },
                { name: 'Camp 3', value: festival.campNames[2], inline: true }
            );
        
        // Créer les boutons pour chaque camp
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_camp1_${festival.campNames[0]}`)
                    .setLabel(festival.campNames[0])
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`vote_camp2_${festival.campNames[1]}`)
                    .setLabel(festival.campNames[1])
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`vote_camp3_${festival.campNames[2]}`)
                    .setLabel(festival.campNames[2])
                    .setStyle(ButtonStyle.Primary)
            );
        
        await interaction.reply({
            embeds: [embed],
            components: [buttonRow],
            ephemeral: true
        });
    },
};