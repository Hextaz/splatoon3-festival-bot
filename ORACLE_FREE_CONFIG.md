# Oracle Cloud Always Free - Configuration EXACTE

## ✅ CONFIGURATION CORRECTE (0€)

### Image and Shape
```
Image: Oracle Linux 8 (latest)
Shape Family: Specialty and previous generation
Shape: VM.Standard.E2.1.Micro
- Memory: 1 GB
- OCPUs: 1/8 OCPU  
- Price: $0.00/hour (Always Free eligible) ✅
```

### Networking
```
VCN: Create new (ou existant)
Subnet: Public subnet
Assign public IP: Yes
```

### Storage
```
Boot Volume Size: 47 GB (MAX pour Always Free)
Performance: Balanced
```

### SSH Keys
```
Generate SSH key pair
Download private key (.key file)
```

## ❌ ERREURS COMMUNES (qui causent des frais)

### Shape incorrecte
```
❌ VM.Standard.E2.1 (payant)
❌ VM.Standard.A1.Flex (ARM, mais peut être payant)
✅ VM.Standard.E2.1.Micro SEULEMENT
```

### Storage trop important
```
❌ Boot Volume > 47GB
❌ Additional Block Storage
✅ 47GB Boot Volume maximum
```

### Options payantes
```
❌ Dedicated Virtual Machine Hosts
❌ Shielded Instance
❌ Additional features
✅ Configuration minimale seulement
```

## 🔍 VÉRIFICATION AVANT CRÉATION

AVANT de cliquer "Create", vérifiez:
```
📊 Cost Estimate: $0.00/month
💰 Always Free eligible: ✅ 
⚠️ Si vous voyez un coût > 0 → STOP et corrigez
```
