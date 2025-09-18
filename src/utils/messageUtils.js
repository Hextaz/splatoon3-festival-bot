// Dans n'importe quel fichier de commande ou d'événement
const { sendDirectMessage } = require('../utils/messageUtils');

// Exemple d'envoi d'un texte simple
await sendDirectMessage(interaction.client, userId, "Voici un message privé!");

// Exemple d'envoi d'un embed
const embed = new EmbedBuilder()
    .setTitle('Notification')
    .setDescription('Votre match va bientôt commencer!')
    .setColor('#0099ff');

await sendDirectMessage(interaction.client, userId, { embeds: [embed] });