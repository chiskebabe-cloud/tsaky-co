# TSAKY & CO — Version locale uniquement

Cette version fonctionne sans Supabase, sans compte externe et sans clé API. Les commandes sont enregistrées dans `data/orders.json`. Elle peut être utilisée sur les appareils autorisés de votre réseau Tailscale.

## Prérequis

- Installer Node.js LTS depuis https://nodejs.org/
- Décompresser le dossier du projet.

## Démarrage

Ouvrez un terminal dans le dossier `tsaky-co`, puis exécutez :

```bash
npm install
npm start
```

Ouvrez ensuite dans le navigateur :

- Sur le serveur : `http://localhost:3000/` et `http://localhost:3000/dashboard`
- Depuis un autre appareil connecté au même réseau Tailscale : remplacez `localhost` par l’adresse IPv4 Tailscale du PC qui exécute le serveur, par exemple `http://100.x.y.z:3000/` et `http://100.x.y.z:3000/dashboard`. Pour trouver cette adresse sur le PC serveur, exécutez `tailscale ip -4`.

## Stockage des commandes

Les commandes sont enregistrées dans `data/orders.json`. Faites régulièrement une copie de sauvegarde de ce fichier. Si vous supprimez ce fichier, le serveur le recrée vide au prochain démarrage.

## Réseau Tailscale et sécurité

Le serveur écoute sur les interfaces réseau pour permettre aux appareils autorisés du réseau Tailscale d’y accéder. Connectez le PC serveur et les appareils clients au même tailnet, puis utilisez l’adresse Tailscale IPv4 du PC avec le port `3000`. Si le pare-feu Windows le demande, autorisez Node.js uniquement sur les réseaux nécessaires.

**Attention :** le tableau de bord n’a pas de connexion administrateur. Limitez donc l’accès à votre tailnet aux personnes et appareils de confiance. Tailscale donne un accès privé aux membres autorisés de votre réseau ; pour rendre le site accessible à tout Internet, il faudrait configurer séparément Tailscale Funnel et renforcer la sécurité avant de l’exposer.

Après validation, la commande est enregistrée et la page se rafraîchit automatiquement après deux secondes. Aucun message WhatsApp n’est envoyé ni ouvert.


## Connexion administrateur

- Ouvrir `http://localhost:3000/dashboard` redirige vers la page de connexion si l’administrateur n’est pas connecté.
- Mot de passe initial : `12345678`.
- Pour remplacer ce mot de passe, définir la variable d’environnement `ADMIN_PASSWORD` avant de lancer le serveur. Exemple PowerShell : `$env:ADMIN_PASSWORD="VotreMotDePasseLong"; npm start`.
- La session est conservée dans un cookie HttpOnly pendant au maximum 8 heures. Les consultations et modifications des commandes via l’API sont protégées. La création d’une commande depuis la page publique reste accessible sans compte.


## Gestion du catalogue

Depuis le tableau de bord administrateur (`/dashboard`), la section « Gestion des produits » permet d’ajouter, modifier et supprimer les produits du menu client. Le catalogue est enregistré dans `data/products.json`. Ces opérations nécessitent une session administrateur. Les prix des commandes sont recalculés côté serveur à partir du catalogue.


### Espace administrateur séparé
- Tableau de bord des commandes : `/dashboard`
- Gestion du catalogue produits : `/products`
Les deux pages nécessitent une connexion administrateur.
