/**
 * Utilitaire centralisé pour la gestion du rôle Team Leader
 * Évite la duplication de code et les créations multiples
 */

/**
 * Récupère ou crée le rôle Team Leader pour une guild
 * @param {Guild} guild - L'objet guild Discord
 * @returns {Promise<Role>} Le rôle Team Leader
 */
async function ensureTeamLeaderRole(guild) {
    // D'abord chercher le rôle existant
    let leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
    
    if (leaderRole) {
        console.log(`✅ Rôle Team Leader trouvé: ${leaderRole.id}`);
        return leaderRole;
    }
    
    // Si pas trouvé, le créer
    try {
        leaderRole = await guild.roles.create({
            name: 'Team Leader',
            color: '#FFD700', // Couleur dorée pour les leaders
            permissions: [],
            reason: 'Rôle pour les leaders d\'équipe - créé automatiquement'
        });
        
        console.log(`✅ Rôle Team Leader créé: ${leaderRole.id}`);
        return leaderRole;
        
    } catch (error) {
        console.error('❌ Erreur création rôle Team Leader:', error);
        throw new Error(`Impossible de créer le rôle Team Leader: ${error.message}`);
    }
}

/**
 * Attribue le rôle Team Leader à un membre
 * @param {GuildMember} member - Le membre à qui attribuer le rôle
 * @param {Guild} guild - L'objet guild Discord
 * @returns {Promise<boolean>} True si succès
 */
async function assignTeamLeaderRole(member, guild) {
    try {
        const leaderRole = await ensureTeamLeaderRole(guild);
        
        if (!member.roles.cache.has(leaderRole.id)) {
            await member.roles.add(leaderRole);
            console.log(`👑 Rôle Team Leader attribué à ${member.user.username}`);
        } else {
            console.log(`👑 ${member.user.username} a déjà le rôle Team Leader`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Erreur attribution rôle Team Leader à ${member.user.username}:`, error);
        return false;
    }
}

/**
 * Retire le rôle Team Leader d'un membre
 * @param {GuildMember} member - Le membre à qui retirer le rôle
 * @param {Guild} guild - L'objet guild Discord
 * @returns {Promise<boolean>} True si succès
 */
async function removeTeamLeaderRole(member, guild) {
    try {
        const leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
        
        if (leaderRole && member.roles.cache.has(leaderRole.id)) {
            await member.roles.remove(leaderRole);
            console.log(`👑 Rôle Team Leader retiré de ${member.user.username}`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Erreur retrait rôle Team Leader de ${member.user.username}:`, error);
        return false;
    }
}

/**
 * Nettoie complètement le rôle Team Leader (retire de tous les membres et supprime le rôle)
 * @param {Guild} guild - L'objet guild Discord
 * @returns {Promise<boolean>} True si succès
 */
async function cleanupTeamLeaderRole(guild) {
    try {
        console.log('🧹 Nettoyage du rôle Team Leader...');
        const leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
        
        if (!leaderRole) {
            console.log('ℹ️ Aucun rôle Team Leader à nettoyer');
            return true;
        }
        
        // Retirer le rôle de tous les membres
        const membersWithLeaderRole = guild.members.cache.filter(member => 
            member.roles.cache.has(leaderRole.id)
        );
        
        console.log(`👥 ${membersWithLeaderRole.size} membre(s) avec le rôle Team Leader`);
        
        for (const [memberId, member] of membersWithLeaderRole) {
            try {
                await member.roles.remove(leaderRole);
                console.log(`👑 Rôle Team Leader retiré de ${member.user.username}`);
            } catch (e) {
                console.error(`❌ Erreur retrait rôle Team Leader pour ${member.user.username}:`, e);
            }
            
            // Pause pour éviter le rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Supprimer le rôle complètement
        try {
            await leaderRole.delete('Nettoyage du rôle Team Leader');
            console.log('🗑️ Rôle Team Leader supprimé complètement');
        } catch (e) {
            console.error('❌ Erreur suppression rôle Team Leader:', e);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Erreur générale nettoyage rôle Team Leader:', error);
        return false;
    }
}

module.exports = {
    ensureTeamLeaderRole,
    assignTeamLeaderRole,
    removeTeamLeaderRole,
    cleanupTeamLeaderRole
};