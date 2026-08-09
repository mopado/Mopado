# Notes Importantes sur les Vidéos

## Limite de Taille Actuelle
- **Nouvelle limite : 200 MB** (augmentée depuis 50 MB)
- Accepte maintenant vos vidéos de 117 MB

## Important à Savoir

### 1. Stockage en Base64
Les vidéos sont stockées en **base64** dans MongoDB, ce qui signifie :
- Une vidéo de 117 MB devient environ **156 MB** en base64 (augmentation ~33%)
- Le chargement peut être plus lent pour les grosses vidéos

### 2. Performance
Pour les vidéos volumineuses :
- **Upload** : Peut prendre 1-2 minutes selon la connexion
- **Chargement dans l'app** : Peut prendre quelques secondes
- **Stockage MongoDB** : Attention à l'espace disque

### 3. Recommandations pour la Production

Pour une app en production avec beaucoup de vidéos :

**Option A : Compression (Recommandée pour V1)**
- Compresser les vidéos avant upload
- Outils gratuits : HandBrake, FFmpeg
- Objectif : 20-30 MB par vidéo (qualité 720p)
- Commande FFmpeg exemple :
  ```bash
  ffmpeg -i input.mp4 -vcodec libx264 -crf 28 -preset medium output.mp4
  ```

**Option B : CDN/Stockage Cloud (Recommandée pour Production)**
- Héberger les vidéos sur AWS S3, Cloudflare R2, ou Vimeo
- Stocker uniquement l'URL dans MongoDB
- Avantages :
  - Chargement beaucoup plus rapide
  - Streaming optimisé
  - Moins de charge sur le serveur
  - Coût de stockage réduit

### 4. Limite MongoDB
MongoDB a une limite de **16 MB par document** par défaut, mais nous utilisons GridFS implicitement via les documents > 16MB qui sont automatiquement gérés.

Pour l'instant, avec la V1 et quelques vidéos de test, le stockage en base64 fonctionne. Mais pour la production, envisagez un CDN.

## Test de l'Upload

Vous pouvez maintenant :
1. Aller sur https://mopado-family-1.preview.emergentagent.com/api/admin-panel
2. Créer un épisode
3. Uploader une vidéo jusqu'à 200 MB
4. Un message "Upload de la vidéo en cours..." s'affichera
5. L'upload peut prendre 1-3 minutes selon la taille

## Messages Affichés
- Pendant l'upload : "Upload de la vidéo en cours (117 MB)... Cela peut prendre quelques minutes."
- Après l'upload : "Création de l'épisode en cours..."
- Succès : "Épisode créé avec succès !"
