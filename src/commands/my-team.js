const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findTeamByMember } = require('../utils/teamManager');
const { getCurrentFestival } = require('../utils/festivalManager');
const { safeReply } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('my-team')
        .setDescription('Affiche les informations de votre équipe actuelle'),
    
    async execute(interaction) {
        try {
            const team = findTeamByMember(interaction.user.id);
            
            if (!team) {
                return await safeReply(interaction, {
                    content: "Vous n'êtes membre d'aucune équipe.",
                    ephemeral: true
                });
            }
            
            // RÉCUPÉRER LA TAILLE REQUISE SELON LE FESTIVAL
            const festival = getCurrentFestival();
            const maxSize = festival?.teamSize || 4;
            const currentSize = team.members.length;
            
            // Obtenir le nom d'affichage du camp
            let campDisplayName = 'Camp inconnu';
            if (team.campDisplayName) {
                campDisplayName = team.campDisplayName;
            } else if (festival && team.camp.startsWith('camp')) {
                const campIndex = parseInt(team.camp.replace('camp', '')) - 1;
                campDisplayName = festival.campNames[campIndex] || 'Camp inconnu';
            }
            
            // Afficher les membres
            const memberList = team.members.map((memberId, index) => {
                const isLeader = team.isLeader(memberId);
                return `${index + 1}. <@${memberId}>${isLeader ? ' 👑 (Chef)' : ''}`;
            }).join('\n');
            
            // Déterminer le statut de l'équipe
            let statusText = '';
            let statusColor = '#0099ff';
            
            if (currentSize === maxSize) {
                statusText = '✅ **Équipe complète et prête pour les matchs !**';
                statusColor = '#00ff00';
            } else {
                const needed = maxSize - currentSize;
                statusText = `⚠️ **Équipe incomplète** - Il manque ${needed} joueur(s)`;
                statusColor = '#ff9900';
            }
            
            const embed = new EmbedBuilder()
                .setColor(statusColor)
                .setTitle(`Équipe: ${team.name}`)
                .setDescription(statusText)
                .addFields(
                    { name: 'Camp', value: campDisplayName, inline: true },
                    { name: 'Type', value: team.isOpen ? '🔓 Ouverte' : '🔒 Fermée', inline: true },
                    { name: `Membres (${currentSize}/${maxSize})`, value: memberList || 'Aucun membre' },
                );
            
            // Ajouter le code d'accès si l'équipe est fermée
            if (!team.isOpen && team.code) {
                embed.addFields({ 
                    name: '🔑 Code d\'accès', 
                    value: `\`${team.code}\`` 
                });
            }
            
            // Ajouter des informations sur le match en cours
            if (team.currentOpponent) {
                embed.addFields({ 
                    name: '🎮 Match en cours', 
                    value: `Contre l'équipe **${team.currentOpponent}**` 
                });
            }
            
            // Ajouter des conseils selon le statut
            if (currentSize === maxSize) {
                embed.addFields({ 
                    name: '🎯 Prochaines étapes', 
                    value: 'Votre équipe peut maintenant chercher des matchs avec `/search-match` !' 
                });
            } else {
                embed.addFields({ 
                    name: '📝 Comment recruter', 
                    value: `Partagez le nom de votre équipe (${team.isOpen ? 'équipe ouverte' : `équipe fermée, code: \`${team.code}\``}) pour que d'autres joueurs puissent vous rejoindre avec \`/join-team\`.` 
                });
            }
            
            await safeReply(interaction, {
                embeds: [embed],
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error in my-team command:', error);
            await safeReply(interaction, {
                content: 'Une erreur est survenue lors de l\'affichage des informations de votre équipe.',
                ephemeral: true
            });
        }
    },
};