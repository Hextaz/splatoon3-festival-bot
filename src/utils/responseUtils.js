const { InteractionResponseType, MessageFlags } = require('discord.js');

/**
 * Utility functions for handling Discord interactions safely
 */

/**
 * Safely reply to an interaction with proper error handling
 * @param {CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Reply options
 * @param {boolean} options.ephemeral - Whether the reply should be ephemeral
 * @param {string} options.content - Message content
 * @param {Array} options.embeds - Message embeds
 * @param {Array} options.components - Message components
 */
async function safeReply(interaction, options) {
    try {
        // Convert ephemeral to flags format
        const replyOptions = { ...options };
        if (options.ephemeral) {
            delete replyOptions.ephemeral;
            replyOptions.flags = MessageFlags.Ephemeral;
        }

        // Check if interaction is still valid
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp(replyOptions);
        } else {
            return await interaction.reply(replyOptions);
        }
    } catch (error) {
        console.error('Error in safeReply:', error);
        // If the interaction has expired, we can't do anything
        if (error.code === 10062) {
            console.log('Interaction expired, cannot respond');
            return null;
        }
        // If the interaction has already been acknowledged, don't throw
        if (error.code === 40060) {
            console.log('Interaction already acknowledged, skipping response');
            return null;
        }
        throw error;
    }
}

/**
 * Safely defer an interaction reply
 * @param {CommandInteraction} interaction - The Discord interaction
 * @param {boolean} ephemeral - Whether the deferred reply should be ephemeral
 */
async function safeDefer(interaction, ephemeral = false) {
    try {
        if (interaction.deferred || interaction.replied) {
            return;
        }

        const options = ephemeral ? { flags: MessageFlags.Ephemeral } : {};
        return await interaction.deferReply(options);
    } catch (error) {
        console.error('Error in safeDefer:', error);
        if (error.code === 10062) {
            console.log('Interaction expired, cannot defer');
            return null;
        }
        if (error.code === 40060) {
            console.log('Interaction already acknowledged, skipping defer');
            return null;
        }
        throw error;
    }
}

/**
 * Safely follow up to an interaction
 * @param {CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Follow up options
 * @param {boolean} options.ephemeral - Whether the follow up should be ephemeral
 */
async function safeFollowUp(interaction, options) {
    try {
        const followUpOptions = { ...options };
        if (options.ephemeral) {
            delete followUpOptions.ephemeral;
            followUpOptions.flags = MessageFlags.Ephemeral;
        }

        return await interaction.followUp(followUpOptions);
    } catch (error) {
        console.error('Error in safeFollowUp:', error);
        if (error.code === 10062) {
            console.log('Interaction expired, cannot follow up');
            return null;
        }
        if (error.code === 40060) {
            console.log('Interaction already acknowledged, skipping follow up');
            return null;
        }
        if (error.code === 'InteractionNotReplied') {
            console.log('Interaction not replied/deferred, cannot follow up');
            return null;
        }
        throw error;
    }
}

/**
 * Safely edit an interaction reply
 * @param {CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Edit options
 */
async function safeEdit(interaction, options) {
    try {
        return await interaction.editReply(options);
    } catch (error) {
        console.error('Error in safeEdit:', error);
        if (error.code === 10062) {
            console.log('Interaction expired, cannot edit');
            return null;
        }
        if (error.code === 40060) {
            console.log('Interaction already acknowledged, skipping edit');
            return null;
        }
        throw error;
    }
}

/**
 * Smart response function that automatically chooses the best method
 * @param {CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Response options
 * @param {boolean} preferFollowUp - Whether to prefer followUp over reply
 */
async function smartReply(interaction, options, preferFollowUp = false) {
    try {
        // Check the actual state of the interaction
        const canUseFollowUp = interaction.replied || interaction.deferred;
        const canUseReply = !interaction.replied;
        
        if (preferFollowUp && canUseFollowUp) {
            // Try followUp first if preferred and interaction is in the right state
            const result = await safeFollowUp(interaction, options);
            if (result !== null) return result;
        }
        
        // Fall back to safeReply if we can use it
        if (canUseReply) {
            return await safeReply(interaction, options);
        }
        
        // If we can't use reply, try followUp as last resort
        if (canUseFollowUp) {
            return await safeFollowUp(interaction, options);
        }
        
        // If we get here, the interaction is in an invalid state
        console.warn('Interaction is in invalid state for response');
        return null;
    } catch (error) {
        console.error('Error in smartReply:', error);
        // Last resort: try the other method
        try {
            if (preferFollowUp && !interaction.replied) {
                return await safeReply(interaction, options);
            } else if (interaction.replied || interaction.deferred) {
                return await safeFollowUp(interaction, options);
            }
        } catch (fallbackError) {
            console.error('Fallback method also failed:', fallbackError);
            return null;
        }
    }
}

module.exports = {
    safeReply,
    safeDefer,
    safeFollowUp,
    safeEdit,
    smartReply
};
