# Configuration réseau Oracle Cloud

## Security List - Règles à ajouter

### Ingress Rules (Entrées)
```
Port 3000 (TCP)
Source: 0.0.0.0/0
Description: Health Server pour monitoring
```

### Configuration via Oracle Console
1. **Networking → Virtual Cloud Networks**
2. **Sélectionnez votre VCN**
3. **Security Lists → Default Security List**
4. **Add Ingress Rules**
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `3000`
   - Description: `Discord Bot Health Server`

### Configuration via CLI
```bash
# Sur votre VM Oracle
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# Vérification
sudo firewall-cmd --list-ports
```

## Test de connectivité
```bash
# Depuis votre VM
curl http://localhost:3000/health

# Depuis l'extérieur (remplacez YOUR_VM_IP)
curl http://YOUR_VM_IP:3000/health
```
