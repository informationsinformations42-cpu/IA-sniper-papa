# 1. Vision et fonctionnalités

## Objectif

Créer **AegisDesk-sniper**, une application PC de type centre de contrôle futuriste, avec un assistant IA central capable de dialoguer en français, d'expliquer ses décisions et de déléguer des tâches aux agents spécialisés disponibles.

Le projet est orienté vers l'assistance, l'analyse et la protection défensive des systèmes. Les audits doivent être limités aux appareils, applications, réseaux et sites pour lesquels l'utilisateur dispose d'une autorisation explicite.

## Expérience utilisateur

- Interface de bureau professionnelle, futuriste et lisible.
- Thème sombre avec accents lumineux bleu électrique, cyan et violet.
- Panneaux de contrôle, cartes d'état et indicateurs clairement identifiés.
- Sphère holographique animée représentant OVERLORD.
- États visuels distincts : repos, écoute, réflexion, génération et erreur.
- Langue française par défaut.
- Voix configurable et personnalité personnalisable.
- Historique et mémoire configurables par l'utilisateur.

## Fonctionnalités cibles

### Assistant central
- Conversation en français.
- Réponses fondées sur les capacités réellement disponibles.
- Coordination des agents spécialisés.
- Présentation claire des actions proposées et de leurs résultats.
- Gestion des erreurs et des délais d'attente.

### Agents spécialisés
- Activation/désactivation indépendante.
- Ajout/retrait modulaire sans casser les autres agents.
- Présence et état d'un agent visibles dans l'interface.
- Un agent n'est invoqué que si le routeur le sélectionne et que le module est réellement disponible.

### Installation
Deux modes sont souhaités :

**Installation complète**
- Application et interface.
- Les 17 agents et leurs composants.
- Moteur d'inférence local.
- Modèle compatible choisi et composants nécessaires.
- Dépendances requises, sans demander à l'utilisateur d'installer Ollama séparément ni de fournir une clé API obligatoire.

**Installation personnalisée**
- Choix des agents et composants facultatifs.
- Possibilité de compléter l'installation plus tard.

Les exigences exactes de packaging et de licence des composants devront être vérifiées avant distribution.

## Hors périmètre / limites

- Pas de fonctions destinées à attaquer des systèmes.
- Pas d'accès à des appareils ou services sans autorisation.
- Pas d'exécution arbitraire de commandes système par un agent.
- Pas de promesse de fonctionnement hors ligne avant que les modèles et dépendances soient installés.
