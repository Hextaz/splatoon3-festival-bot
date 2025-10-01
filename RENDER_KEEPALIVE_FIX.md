# 🔧 GUIDE DE CONFIGURATION RENDER KEEP-ALIVE

## Problème identifié
Après analyse, le système keep-alive peut échouer après 1-2 jours pour plusieurs raisons :

1. **Variable RENDER_EXTERNAL_URL manquante**
2. **Timeouts sur les requêtes keep-alive**  
3. **Erreurs réseau intermittentes**
4. **Pas de monitoring des échecs**

## ✅ Solution recommandée

### 1. Configuration des variables d'environnement sur Render

Dans votre service Render, ajoutez ces variables d'environnement :

```bash
# OBLIGATOIRE - URL de votre service Render
RENDER_EXTERNAL_URL=https://votre-service-name.onrender.com

# OPTIONNEL - Pour la détection automatique
RENDER_SERVICE_NAME=votre-service-name

# OPTIONNEL - URL alternative
APP_URL=https://votre-service-name.onrender.com

# Environnement de production
NODE_ENV=production
```

### 2. Upgrade vers le système amélioré

Le nouveau `EnhancedKeepAlive` inclut :
- ✅ Détection automatique de l'URL de santé
- ✅ Retry avec intervalle réduit en cas d'échec  
- ✅ Monitoring des échecs consécutifs
- ✅ Timeouts plus longs pour Render (45s)
- ✅ Logs détaillés pour le debug

### 3. Application du correctif

Modifiez `src/index.js` pour utiliser le système amélioré :

```javascript
// Remplacer cette ligne :
const { SimpleKeepAlive } = require('./utils/simpleKeepAlive');

// Par :
const { EnhancedKeepAlive } = require('./utils/enhancedKeepAlive');

// Et remplacer :
const simpleKeepAlive = new SimpleKeepAlive();

// Par :
const enhancedKeepAlive = new EnhancedKeepAlive();
```

### 4. Service externe de monitoring (Recommandé)

Pour une fiabilité maximale, utilisez un service externe :

#### UptimeRobot (Gratuit)
1. Créez un compte sur [uptimerobot.com](https://uptimerobot.com)
2. Ajoutez un monitor HTTP(S) 
3. URL : `https://votre-service-name.onrender.com/health`
4. Intervalle : 5 minutes
5. Alertes : Email/Discord/Slack

#### Ping externe simple
Utilisez un cron job sur un autre serveur :
```bash
# Crontab : ping toutes les 10 minutes
*/10 * * * * curl -s https://votre-service-name.onrender.com/health > /dev/null
```

## 🔍 Diagnostic

Exécutez le script de diagnostic :
```bash
node diagnose-keepalive.js
```

Ce script vérifie :
- ✅ Variables d'environnement
- ✅ Serveur de santé fonctionnel  
- ✅ Test de ping keep-alive
- ✅ Analyse des problèmes potentiels

## 📊 Monitoring

Le nouveau système fournit des logs détaillés :

```
[KEEP-ALIVE] 2024-01-15T10:30:00.000Z - Ping en cours...
[KEEP-ALIVE] ✅ Succès (200) en 1250ms
[KEEP-ALIVE] 📊 Uptime: 24h
```

En cas de problème :
```  
[KEEP-ALIVE] ❌ Échec 3/3 en 45000ms: Timeout (45s)
[KEEP-ALIVE] 🚨 ALERTE: 3 échecs consécutifs!
[KEEP-ALIVE] 🚨 Le bot pourrait être hors ligne!
```

## 🚀 Déploiement

1. **Appliquer les modifications au code**
2. **Configurer les variables d'environnement sur Render**  
3. **Redéployer le service**
4. **Vérifier les logs de démarrage**
5. **Optionnel : Configurer un service externe**

## 🔧 Troubleshooting

### Le bot s'endort encore après 1-2 jours

1. Vérifiez que `RENDER_EXTERNAL_URL` est bien défini
2. Consultez les logs Render pour des erreurs
3. Vérifiez que l'endpoint `/health` répond bien
4. Considérez l'ajout d'UptimeRobot

### Erreurs de timeout

- Le nouveau système utilise 45s de timeout (vs 30s avant)
- Les échecs déclenchent des pings plus fréquents (5min au lieu de 10min)

### URL de santé introuvable

Le système essaie automatiquement :
1. `RENDER_EXTERNAL_URL`
2. `APP_URL`  
3. Construction avec `RENDER_SERVICE_NAME`

Au moins une de ces variables doit être définie.