# 📊 Gestionnaire Commercial Pro

Application React pour la gestion de bases de données commerciales avec enrichissement automatique via APIs gouvernementales françaises.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)

## ✨ Fonctionnalités

### 📥 Import Intelligent
- **Mapping automatique des colonnes** avec détection de synonymes
- **Interface de configuration** pour ajuster le mapping manuellement
- **Support du ré-import** de bases enrichies (conservation des IDs)
- **Détection des doublons** par ID, téléphone ou SIRET
- **3 modes d'import** : nouveaux uniquement, mise à jour, tout importer

### 🔄 Enrichissement API
- **API Recherche d'Entreprises** (gouv.fr) : SIREN/SIRET, effectifs, NAF, dirigeants
- **API Adresse** (gouv.fr) : géocodage des adresses
- **API Navigation IGN** : calcul des temps de trajet en voiture

### 💾 Base de Données Persistante
- Stockage local via **IndexedDB**
- **IDs uniques** au format personnalisable (ex: `Vd_S_00001`)
- **Historique des exports** avec suivi des fiches exportées
- Données conservées entre les sessions

### 🔍 Filtres Avancés
- Par code postal, catégorie, temps de trajet max
- Entreprises **< 20 salariés** (codes INSEE)
- Fiches **nouvelles** vs **déjà exportées**
- Tri par date, nom, distance, ID

### 📤 Export Excel
- Export des données filtrées avec toutes les informations enrichies
- Suivi du nombre d'exports par fiche
- Noms de fichiers horodatés

## 🚀 Installation

```bash
# Cloner le repository
git clone https://github.com/djedjiga-matrix/Gestion_bd.git
cd Gestion_bd

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

L'application sera accessible sur `http://localhost:5173/`

## 🛠️ Technologies

- **React 18** - Interface utilisateur
- **Vite** - Build tool & dev server
- **TailwindCSS** - Styling
- **Lucide React** - Icônes
- **XLSX** - Lecture/écriture fichiers Excel
- **IndexedDB** - Stockage local persistant

## 📋 APIs Utilisées

| API | Usage |
|-----|-------|
| [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr) | Données entreprises |
| [api-adresse.data.gouv.fr](https://api-adresse.data.gouv.fr) | Géocodage |
| [data.geopf.fr](https://data.geopf.fr) | Calcul d'itinéraires |

## 📁 Structure du Projet

```
Data_gestion/
├── src/
│   ├── components/
│   │   └── DatabaseManager.jsx  # Composant principal
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── db-manager.jsx               # Source du composant
├── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## 🎯 Cas d'Usage

- **Prospection commerciale** : filtrer par taille d'entreprise et proximité
- **Qualification de fichiers** : enrichir les données existantes via API
- **Suivi des contacts** : marquer les fiches déjà contactées via l'historique d'export
- **Re-import de bases** : mettre à jour une base exportée/modifiée

## 📜 Licence

MIT License

---

Développé avec ❤️ pour la prospection commerciale efficace.
