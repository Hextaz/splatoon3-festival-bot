// src/commands/force-vote-change.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');
const { castVote } = require('../utils/vote');
const { safeReply } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-vote-change')
        .setDescription('Forcer le changement de camp d\'un utilisateur (Admin uniquement)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('L\'utilisateur dont le vote doit être changé')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('new_camp')
                .setDescription('Le nouveau camp')
                .setRequired(true)
                .addChoices(
                    { name: 'Camp 1', value: 'camp1' },
                    { name: 'Camp 2', value: 'camp2' },
                    { name: 'Camp 3', value: 'camp3' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const newCampId = interaction.options.getString('new_camp');
        
        const festival = getCurrentFestival();
        if (!festival) {
            return await safeReply(interaction, {
                content: 'Aucun festival actif.',
                ephemeral: true
            });
        }

        try {
            const guild = interaction.guild;
            const member = await guild.members.fetch(targetUser.id);
            
            // 1. Retirer tous les anciens rôles de camp
            const oldCampRoles = festival.campNames.map((name, index) => {
                const role = guild.roles.cache.find(role => role.name === `Camp ${name}`);
                return { role, index: index + 1 };
            }).filter(item => item.role && member.roles.cache.has(item.role.id));
            
            for (const { role } of oldCampRoles) {
                await member.roles.remove(role);
                console.log(`Ancien rôle ${role.name} retiré de ${targetUser.username}`);
            }
            
            // 2. Ajouter le nouveau rôle de camp
            const campIndex = parseInt(newCampId.replace('camp', '')) - 1;
            const newCampName = festival.campNames[campIndex];
            
            let newCampRole = guild.roles.cache.find(role => role.name === `Camp ${newCampName}`);
            if (!newCampRole) {
                // Créer le rôle s'il n'existe pas
                const colors = ['#FF0000', '#00FF00', '#0000FF'];
                newCampRole = await guild.roles.create({
                    name: `Camp ${newCampName}`,
                    color: colors[campIndex],
                    mentionable: true,
                    reason: `Changement forcé de camp pour ${targetUser.username}`
                });
            }
            
            await member.roles.add(newCampRole);
            
            // 3. Mettre à jour le vote dans le système
            castVote(newCampId, targetUser.id);
            
            // 4. Vérifier si l'utilisateur était dans une équipe incompatible
            const { findTeamByMember } = require('../utils/teamManager');
            const userTeam = findTeamByMember(targetUser.id);
            
            let teamWarning = '';
            if (userTeam && userTeam.camp !== newCampId) {
                teamWarning = `\n⚠️ **ATTENTION**: ${targetUser.username} était dans l'équipe "${userTeam.name}" du camp ${userTeam.camp}, mais est maintenant dans le ${newCampId}. Vous devrez peut-être gérer cette incohérence.`;
            }
            
            await safeReply(interaction, {
                content: `✅ **Changement de camp effectué avec succès !**\n\n` +
                        `👤 **Utilisateur**: ${targetUser.username}\n` +
                        `🏕️ **Ancien camp**: ${oldCampRoles.length > 0 ? oldCampRoles[0].role.name : 'Aucun'}\n` +
                        `🏕️ **Nouveau camp**: Camp ${newCampName}\n` +
                        `🗳️ **Vote mis à jour**: Oui${teamWarning}`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Erreur lors du changement forcé de camp:', error);
            await safeReply(interaction, {
                content: `Erreur: ${error.message}`,
                ephemeral: true
            });
        }
    }
};