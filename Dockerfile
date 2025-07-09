# Dockerfile pour Oracle Cloud (optionnel)
FROM node:20-alpine

# Métadonnées
LABEL maintainer="votre-email@example.com"
LABEL description="Splatoon 3 Festival Bot avec Smart Sleep"
LABEL version="1.0.0"

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000

# Création utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S splatoon -u 1001

# Répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances
RUN npm ci --only=production && npm cache clean --force

# Copie du code source
COPY --chown=splatoon:nodejs . .

# Changement d'utilisateur
USER splatoon

# Exposition du port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Commande de démarrage
CMD ["node", "src/index.js"]
