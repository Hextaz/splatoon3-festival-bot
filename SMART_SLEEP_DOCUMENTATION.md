# Documentation du Système de Veille Intelligente (Smart Sleep)

## Vue d'ensemble

Le système de veille intelligente permet au bot Splatoon 3 Festival de gérer automatiquement son état "keep-alive" sur Render.com en fonction de l'activité des festivals. Cela permet d'économiser les heures de calcul Render (750h/mois gratuit) en permettant au bot de "dormir" quand aucun festival n'est actif.

## Architecture

### 1. SmartSleepManager (`src/utils/smartSleep.js`)

**Responsabilités :**
- Surveille l'état des festivals toutes les minutes
- Active/désactive automatiquement le keep-alive selon les règles
- Fournit une interface pour le debug et les overrides manuels

**Règles d'activation du keep-alive :**
- ✅ **Festival actif** : Keep-alive activé
- ✅ **Festival commence dans < 2h** : Keep-alive activé (pré-activation)
- ✅ **Festival terminé depuis < 30min** : Keep-alive activé (post-activation)
- ✅ **Override manuel actif** : Keep-alive activé
- ❌ **Aucun festival ou festival lointain** : Keep-alive désactivé

**API :**
```javascript
const { SmartSleepManager } = require('./utils/smartSleep');
const manager = new SmartSleepManager();

manager.start();           // Démarre la surveillance
manager.stop();            // Arrête la surveillance
manager.checkFestivalState(); // Force une vérification
manager.getStatus();       // Retourne l'état complet
manager.setManualOverride(minutes); // Override manuel
manager.clearManualOverride(); // Supprime l'override
```

### 2. HealthServer (`src/utils/healthServer.js`)

**Responsabilités :**
- Fournit un endpoint `/health` pour Render.com
- Effectue les pings keep-alive quand activé
- Sert une page d'accueil avec l'état du bot

**Endpoints :**
- `GET /` : Page d'accueil avec statut du bot
- `GET /health` : JSON avec métriques détaillées

**Réponse /health :**
```json
{
  "status": "ok",
  "timestamp": "2025-07-09T17:42:41.743Z",
  "uptime": 44.69,
  "memory": { "rss": 56307712, "heapTotal": 19013632, ... },
  "sleepManager": {
    "isKeepAliveActive": false,
    "currentReason": "",
    "hasFestival": false
  },
  "version": "1.0.0"
}
```

### 3. Commande Debug (`src/commands/debug-sleep.js`)

**Utilisation :** `/debug-sleep <sous-commande>`

**Sous-commandes :**
- `/debug-sleep status` : Affiche l'état complet du système
- `/debug-sleep force-awake <minutes>` : Force le keep-alive pour X minutes
- `/debug-sleep force-sleep` : Force la désactivation du keep-alive
- `/debug-sleep clear-override` : Supprime les overrides manuels

**Permissions :** Administrateur uniquement

## Installation et Configuration

### 1. Intégration dans index.js

```javascript
// Imports
const { SmartSleepManager } = require('./utils/smartSleep');
const { HealthServer } = require('./utils/healthServer');

// Initialisation
const smartSleepManager = new SmartSleepManager();
const healthServer = new HealthServer();

// Rendre global pour debug
global.smartSleepManager = smartSleepManager;
global.healthServer = healthServer;

// Démarrage
healthServer.start();
smartSleepManager.start();

// Arrêt propre
process.on('SIGINT', () => {
    smartSleepManager.stop();
    healthServer.stop();
    process.exit(0);
});
```

### 2. Hooks dans festivalManager.js

```javascript
// Dans activateFestivalNow()
if (global.smartSleepManager) {
    global.smartSleepManager.checkFestivalState();
}

// Dans deactivateFestivalNow()
if (global.smartSleepManager) {
    global.smartSleepManager.checkFestivalState();
}

// Dans deleteFestival()
if (global.smartSleepManager) {
    global.smartSleepManager.checkFestivalState();
}
```

### 3. Configuration Render.com

**Variables d'environnement :**
```
BOT_TOKEN=votre_token_discord
CLIENT_ID=votre_client_id
DATABASE_URL=votre_mongo_uri
```

**Health Check :**
- URL : `https://votre-app.onrender.com/health`
- Méthode : GET
- Intervalle : 5 minutes

## Utilisation

### Démarrage normal
Le système se démarre automatiquement avec le bot. Logs attendus :
```
🛡️ Démarrage du système de veille intelligente...
🧠 Smart Sleep Manager démarré
🏥 Health server running on port 3000
✅ Système de veille intelligente démarré
```

### Surveillance des logs
```
🧠 [Smart Sleep] Vérification état festival...
🧠 [Smart Sleep] Aucun festival actif - Keep-alive DÉSACTIVÉ
```

### Commandes debug
```
/debug-sleep status
→ Affiche l'état complet avec embed Discord

/debug-sleep force-awake 60
→ Force le keep-alive pendant 1 heure

/debug-sleep force-sleep
→ Force l'arrêt du keep-alive (même si festival actif)

/debug-sleep clear-override
→ Revient au mode automatique
```

## Scénarios d'utilisation

### Scénario 1 : Aucun festival
- ❌ Keep-alive désactivé
- ✅ Bot peut dormir sur Render
- ✅ Économise les heures de calcul

### Scénario 2 : Festival dans 1h
- ✅ Keep-alive activé (pré-activation)
- ✅ Bot reste éveillé pour le démarrage
- 📝 Raison : "Festival commence bientôt"

### Scénario 3 : Festival actif
- ✅ Keep-alive activé
- ✅ Bot reste éveillé pour les participants
- 📝 Raison : "Festival en cours"

### Scénario 4 : Festival terminé depuis 15min
- ✅ Keep-alive activé (post-activation)
- ✅ Bot reste éveillé pour le nettoyage
- 📝 Raison : "Festival récemment terminé"

### Scénario 5 : Override manuel
- ✅ Keep-alive forcé
- 🔧 Admin peut debug en forçant l'état
- 📝 Raison : "Override manuel actif"

## Dépannage

### Le bot ne se réveille pas
1. Vérifier les logs de démarrage
2. Vérifier l'endpoint `/health`
3. Utiliser `/debug-sleep status`
4. Forcer avec `/debug-sleep force-awake`

### Keep-alive ne s'active pas
1. Vérifier l'état du festival avec `/current-festival`
2. Vérifier les hooks dans `festivalManager.js`
3. Forcer une vérification : `global.smartSleepManager.checkFestivalState()`

### Erreurs de port
```javascript
❌ Health server error: EADDRINUSE :::3000
```
Solution : Changer le port dans `healthServer.js` ou arrêter le processus existant

### Logs manquants
Vérifier que les imports sont corrects :
```javascript
const { SmartSleepManager } = require('./utils/smartSleep');  // ✅ Correct
const SmartSleepManager = require('./utils/smartSleep');      // ❌ Incorrect
```

## Maintenance

### Tests réguliers
```bash
node test-smart-sleep.js
```

### Monitoring sur Render
1. Surveiller les métriques de temps d'activité
2. Vérifier les logs de santé
3. S'assurer que le bot se réveille pour les festivals

### Mise à jour des règles
Modifier les constantes dans `smartSleep.js` :
```javascript
const PRE_ACTIVATION_HOURS = 2;    // Réveil X heures avant
const POST_ACTIVATION_MINUTES = 30; // Reste éveillé X min après
const CHECK_INTERVAL_MINUTES = 1;   // Vérification toutes les X min
```

## Sécurité

- ✅ Commandes debug limitées aux administrateurs
- ✅ Aucune exposition de données sensibles
- ✅ Validation des entrées utilisateur
- ✅ Logs détaillés pour audit

## Performance

- 📊 Vérification toutes les 1 minute (configurable)
- 📊 Ping keep-alive toutes les 5 minutes quand actif
- 📊 Impact mémoire minimal (< 1MB)
- 📊 Aucun impact sur les performances Discord
