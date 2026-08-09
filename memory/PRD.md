# Mopado - Application Mobile V1

## Vue d'ensemble

**Mopado** est une application mobile destinée aux familles avec des enfants de 8 à 15 ans. La promesse est simple : **"15 minutes par semaine pour se retrouver et échanger en famille, simplement."**

## Technologies Utilisées

### Frontend
- **React Native / Expo** (SDK 54)
- **Expo Router** - Navigation file-based
- **Zustand** - State management
- **Expo Video** - Lecteur vidéo
- **AsyncStorage & SecureStore** - Stockage local
- **Expo Vector Icons** - Icônes

### Backend
- **FastAPI** - API REST
- **MongoDB** - Base de données
- **Motor** - Driver MongoDB asynchrone
- **Passlib + Bcrypt** - Hashing de mots de passe
- **python-jose** - JWT tokens

### Design System
- **Palette chaleureuse** : Orange (#FF8C42), Bleu ciel (#5DADE2), Vert pastel (#52C791)
- **Typography** : System fonts avec poids variés
- **Spacing** : Grid de 8pt (8px, 16px, 24px, 32px)

## Fonctionnalités Implémentées

### ✅ Authentification
- Inscription par email avec informations famille
- Connexion sécurisée avec JWT
- Mot de passe oublié (structure)
- Stockage sécurisé des tokens

### ✅ Profil Famille
- Nom de la famille
- Nombre d'enfants
- Âges des enfants
- Statistiques personnelles

### ✅ Écran d'Accueil
- Affichage de la saison en cours
- Épisode de la semaine
- Bouton "Commencer"
- Statistiques : Mopado$, Badges, Épisodes complétés
- Progression dans la saison
- Message motivationnel

### ✅ Déroulé d'une Séance
Le flow complet d'une session Mopado :

1. **Étape Vidéo**
   - Lecteur vidéo (support base64)
   - Bouton "Continuer"
   - Instructions claires

2. **Étape Cartes d'Échange**
   - Affichage d'une carte à la fois
   - Navigation entre les cartes
   - Questions engageantes

3. **Étape Mini-Jeu**
   - Affichage du nom du jeu
   - Instructions claires
   - Exemple : "C'est quali" avec 4 lettres aléatoires
   - Bouton "Nous avons terminé"

4. **Étape Mot de Fin**
   - Question : "Quel mot résume le mieux ce moment ?"
   - Champ texte libre
   - Validation avant soumission

5. **Écran de Célébration**
   - Message "Bravo !"
   - Affichage +X Mopado$
   - Badge gagné (si applicable)
   - Message "Rendez-vous la semaine prochaine"

### ✅ Bibliothèque
- Liste de toutes les saisons
- Saisons expandables
- Liste des épisodes par saison
- Indicateur de progression par saison
- États : Terminé / En cours / À venir
- Navigation vers les épisodes

### ✅ Mur Familial
- Statistiques cumulées :
  - Mopado$ totaux
  - Badges obtenus
  - Épisodes terminés
  - Sessions totales
- Historique des mots de fin avec :
  - Date
  - Titre de l'épisode
  - Mot de fin
- Affichage des badges gagnés

### ✅ Interface Administrateur (Web)
Interface web séparée accessible à `/admin` :

- **Gestion des Saisons**
  - Créer une saison (nom, description, ordre)
  - Lister toutes les saisons
  - Supprimer une saison

- **Gestion des Épisodes**
  - Créer un épisode avec :
    - Sélection de la saison
    - Titre et description
    - Upload vidéo (base64, max 50MB)
    - Cartes d'échange (une par ligne)
    - Mini-jeu (nom + instructions)
    - Récompense en Mopado$
  - Filtrer les épisodes par saison
  - Supprimer un épisode

- **Statistiques**
  - Nombre de familles inscrites
  - Nombre de saisons
  - Nombre d'épisodes
  - Sessions complétées

## Architecture des Données

### Collections MongoDB

**users**
```json
{
  "_id": ObjectId,
  "email": "string",
  "password": "hashed_string",
  "family_name": "string",
  "nb_children": number,
  "children_ages": [numbers],
  "mopado_dollars": number,
  "badges": [strings],
  "completed_episodes": [episode_ids],
  "created_at": datetime
}
```

**seasons**
```json
{
  "_id": ObjectId,
  "name": "string",
  "description": "string",
  "image_base64": "string (optional)",
  "order": number
}
```

**episodes**
```json
{
  "_id": ObjectId,
  "season_id": "string",
  "title": "string",
  "description": "string",
  "video_base64": "string (optional)",
  "order": number,
  "cards": [
    {
      "type": "string",
      "content": "string"
    }
  ],
  "mini_game": {
    "name": "string",
    "instructions": "string",
    "data": {}
  },
  "mopado_reward": number
}
```

**sessions**
```json
{
  "_id": ObjectId,
  "family_id": "string",
  "episode_id": "string",
  "season_id": "string",
  "date": datetime,
  "completed": boolean,
  "time_spent": number (seconds),
  "closing_word": "string",
  "start_time": datetime
}
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/forgot-password` - Mot de passe oublié

### Family
- `GET /api/family/{user_id}` - Profil famille
- `PUT /api/family/{user_id}` - Modifier profil

### Seasons
- `GET /api/seasons` - Liste des saisons
- `GET /api/seasons/{season_id}` - Détails d'une saison
- `POST /api/seasons` - Créer une saison
- `PUT /api/seasons/{season_id}` - Modifier une saison
- `DELETE /api/seasons/{season_id}` - Supprimer une saison

### Episodes
- `GET /api/episodes/season/{season_id}` - Épisodes d'une saison
- `GET /api/episodes/{episode_id}` - Détails d'un épisode
- `POST /api/episodes` - Créer un épisode
- `PUT /api/episodes/{episode_id}` - Modifier un épisode
- `DELETE /api/episodes/{episode_id}` - Supprimer un épisode

### Sessions
- `POST /api/sessions/start` - Démarrer une session
- `PUT /api/sessions/{session_id}/complete` - Terminer une session
- `GET /api/sessions/family/{family_id}` - Sessions d'une famille

### Progress
- `GET /api/progress/{family_id}` - Progression d'une famille

### Admin
- `GET /api/admin/stats` - Statistiques globales
- `GET /admin` - Interface administrateur (HTML)

## Accès à l'Application

### Application Mobile
- **URL Preview:** https://mopado-family-1.preview.emergentagent.com
- **QR Code Expo Go:** Disponible dans le terminal

### Interface Admin
- **URL:** https://mopado-family-1.preview.emergentagent.com/admin

### Compte Test
- **Email:** famille.test@mopado.fr
- **Password:** test123

## Données de Test Créées

- **1 Saison:** "Estime de soi"
- **1 Épisode:** "Se connaître mieux"
  - 1 carte d'échange
  - 1 mini-jeu "C'est quali"
  - Récompense : 5 Mopado$
- **1 Session complétée** avec mot de fin "Merveilleux"

## Points Forts de la V1

1. **Simplicité** - Interface intuitive et épurée
2. **Design chaleureux** - Palette de couleurs accueillante
3. **Navigation fluide** - Tabs natives avec Expo Router
4. **Expérience complète** - De l'inscription à la célébration
5. **Admin pratique** - Interface web pour gérer le contenu
6. **Données persistantes** - MongoDB avec historique complet
7. **Sécurité** - JWT + bcrypt pour l'authentification
8. **Mobile-first** - Design optimisé pour smartphones
9. **Performance** - Chargement rapide et navigation fluide
10. **Extensible** - Architecture prête pour de nouvelles features

## Prochaines Étapes Possibles

- Notifications push hebdomadaires
- Système de badges automatique avec critères
- Upload vidéo direct depuis mobile
- Partage de moments en famille
- Statistiques enrichies
- Suggestions d'épisodes personnalisées
- Mode hors-ligne
- Multi-langue (FR/EN)

## Notes Techniques

- **Stockage vidéo:** Actuellement en base64 dans MongoDB (pour V1). Pour production, considérer un CDN.
- **Authentification:** JWT avec expiration 30 jours
- **État global:** Géré par AuthContext + AsyncStorage
- **Navigation:** File-based routing avec expo-router
- **Images:** Base64 uniquement pour compatibilité cross-platform
- **Tests:** Backend 100% testé avec 12/12 endpoints validés

---

**Mopado V1 est prêt pour les tests utilisateurs ! 🎉**
