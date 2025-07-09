#!/bin/bash
# Script d'installation automatique pour Oracle Cloud

set -e

echo "🚀 Déploiement Splatoon 3 Festival Bot sur Oracle Cloud Always Free"
echo "=================================================================="

# Variables
REPO_URL="https://github.com/votre-username/splatoon3-festival-bot.git"
APP_DIR="/home/opc/splatoon3-festival-bot"
LOG_DIR="/var/log/splatoon-bot"

# Fonction de log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 1. Mise à jour du système
log "Mise à jour du système..."
sudo dnf update -y

# 2. Installation Node.js 20.x
log "Installation Node.js..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git

# 3. Vérification versions
log "Versions installées:"
node --version
npm --version

# 4. Installation PM2
log "Installation PM2..."
sudo npm install -g pm2

# 5. Création utilisateur et dossiers
log "Configuration utilisateur..."
sudo mkdir -p $LOG_DIR
sudo chown opc:opc $LOG_DIR

# 6. Clone du repository
log "Clone du repository..."
if [ -d "$APP_DIR" ]; then
    log "Dossier existant trouvé, mise à jour..."
    cd $APP_DIR
    git pull origin main
else
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# 7. Installation des dépendances
log "Installation des dépendances..."
npm install --production

# 8. Configuration du firewall
log "Configuration du firewall..."
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 9. Configuration des variables d'environnement
log "Configuration des variables d'environnement..."
if [ ! -f ".env" ]; then
    log "⚠️  Fichier .env non trouvé. Création du template..."
    cat > .env << 'EOF'
# IMPORTANT: Remplacez ces valeurs par vos vraies données
BOT_TOKEN=votre_bot_token_discord
CLIENT_ID=votre_client_id
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/splatoon3-bot
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/splatoon3-bot
ALLOWED_GUILD_ID=832335212419219506
NODE_ENV=production
PORT=3000
EOF
    log "❌ ARRÊT: Configurez le fichier .env avant de continuer!"
    log "Éditez $APP_DIR/.env avec vos vraies valeurs"
    exit 1
fi

# 10. Test de configuration
log "Test de la configuration..."
if npm run test-config 2>/dev/null; then
    log "✅ Configuration valide"
else
    log "⚠️  Tests de configuration non disponibles"
fi

# 11. Démarrage avec PM2
log "Démarrage du bot avec PM2..."
pm2 delete splatoon-bot 2>/dev/null || true
pm2 start ecosystem.config.json

# 12. Configuration auto-start
log "Configuration du démarrage automatique..."
pm2 startup systemd -u opc --hp /home/opc
pm2 save

# 13. Vérification du statut
log "Vérification du statut..."
sleep 5
pm2 status

# 14. Test du Health Server
log "Test du Health Server..."
sleep 10
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    log "✅ Health Server OK"
else
    log "❌ Health Server non accessible"
fi

log "🎉 Déploiement terminé!"
log "📊 Monitoring: pm2 status"
log "📝 Logs: pm2 logs splatoon-bot"
log "🌐 Health: http://$(curl -s ifconfig.me):3000/health"
log "🛡️ Smart Sleep: Actif et fonctionnel"
