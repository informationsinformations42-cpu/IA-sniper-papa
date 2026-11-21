# 6. État actuel et feuille de route

## État vérifié au 18 novembre 2026

### Déjà présent / testé
- Le dossier `/opt/aegisdesk-sniper` existe.
- Les 17 dossiers d'agents existent.
- Le script historique `agents/overlord/overlord.py` existe et conserve son appel à `llama-cli`.
- Le nouveau lanceur `scripts/overlord_ai.py` charge le registre des agents.
- Le modèle Qwen 2.5 3B Instruct Q4_K_M existe à son emplacement local.
- `llama-cli` charge le modèle et génère une réponse.
- Le nouveau lanceur démarre `llama-server` avec le modèle sur `127.0.0.1:18080` et communique via `/v1/chat/completions`.
- Une requête unique et deux requêtes successives dans une session ont produit des réponses.
- Les deux temps de génération affichés lors du chat de test étaient de 38,7 s et 19,6 s; le temps de chargement initial n'a pas été isolé.
- Le chat affiche une sortie propre, puis arrête le serveur qu'il a lui-même lancé; le port 18080 a été vérifié fermé après la fin du test.
- `--status` et `--list-agents` fonctionnent.
- Une première interface Electron affiche le tableau de bord, la sphère AEGIS simulée, les 17 agents, le journal et les paramètres.
- L'écran Paramètres permet de choisir le binaire llama-server et le modèle GGUF, et de mémoriser les chemins localement.
- L'installateur Windows télécharge les 17 modèles épinglés dans le manifeste, vérifie leurs SHA-256 et les associe automatiquement à leurs agents.
- OVERLORD route automatiquement les intentions reconnues vers un agent selon des règles locales explicites; le nom du spécialiste et le motif apparaissent avec la réponse. Les demandes générales restent à OVERLORD et l'utilisateur peut toujours choisir un agent à la main.
- Les demandes de cybersécurité ne sont routées vers un spécialiste que si elles contiennent un contexte défensif ou une autorisation explicite; les demandes ambiguës restent à OVERLORD.
- Le chat peut choisir directement l'un des agents activés; le moteur charge un modèle à la fois.
- L'historique de conversation est séparé par agent durant l'exécution, mais n'est pas conservé après fermeture.
- Le rendu du tableau de bord a été contrôlé dans Chrome; les scripts JavaScript sont syntaxiquement valides.
- Electron Builder a généré un installateur Windows x64 `.exe` et un AppImage Linux x64 dans `release/`.
- Les fichiers de l'installateur ont été vérifiés; l'installation complète et le téléchargement des 17 modèles n'ont pas encore été exécutés sur Windows.

### Problèmes / éléments à améliorer
- Le lanceur historique utilise toujours `llama-cli`; utiliser `scripts/overlord_ai.py` pour le nouveau chemin serveur.
- L'installateur Windows inclut llama.cpp CPU x64 (b12521), ses DLL/licences et le runtime Microsoft Visual C++ x64; Ollama n'est pas requis. Les modèles GGUF restent téléchargés par l'assistant d'installation.
- Les installateurs ne sont pas signés; l'exécution peut afficher un avertissement de sécurité de l'éditeur.
- Le modèle n'a pas rappelé correctement le premier message lors du test conversationnel; la qualité du contexte reste à valider.
- Les temps et le débit tokens/seconde n'ont pas fait l'objet d'une mesure répétée et contrôlée.
- La réutilisation du cache KV entre requêtes doit être vérifiée et ne doit pas être supposée.
- Les erreurs serveur, délais dépassés, port occupé et redémarrages n'ont pas encore été testés.

### Pas encore validé / à développer
- Mémoire SQLite.
- Gestionnaire de permissions complet.
- Validation de l'application Electron empaquetée en exécution réelle sur Windows et Linux.
- Fourniture/configuration du moteur llama.cpp pour Linux et macOS.
- Fonctions vocales et visuelles intégrées.
- Installateur Windows complet avec moteur llama.cpp inclus; les modèles requièrent toujours une connexion s'ils ne sont pas déjà présents.

## Feuille de route

### Phase A — stabiliser l'inférence locale
**Objectif :** un serveur persistant, local et mesuré.

État : serveur avec modèle, écoute locale, requêtes successives et arrêt normal vérifiés. Les erreurs, redémarrages et mesures reproductibles restent à tester.

### Phase B — connecter OVERLORD
**Objectif :** remplacer l'appel `llama-cli` par un client du serveur, sans perdre les fonctions existantes.

État : le nouveau lanceur est connecté à l'API et produit des réponses sans bannière. Le lanceur historique n'a pas été remplacé; les tests d'erreurs et la validation du rappel conversationnel restent à faire.

### Phase C — construire le système modulaire
**Objectif :** compléter les règles de routage, les permissions et la mémoire par étapes.

État : l'installateur Windows télécharge et vérifie les 17 modèles, puis les associe à leurs agents. OVERLORD route les intentions connues avec des règles locales testées; les demandes générales restent auprès de lui et l'utilisateur peut forcer le choix d'un agent.

Critères de réussite :
- agents activables/désactivables ;
- routeur ne sélectionnant que les agents disponibles ;
- actions contrôlées et confirmées ;
- mémoire locale avec contrôle utilisateur ;
- journaux utiles et protégés ;
- tests unitaires, intégration et sécurité.

### Phase D — interface et distribution
**Objectif :** construire le centre de contrôle et les installateurs.

État : prototype d'interface et paquets de démonstration Windows/Linux générés. L'exécution sur chaque plateforme, la signature, la fourniture des moteurs/modèles et l'installation personnalisée restent à faire.

## Règle de progression

Ne pas commencer la phase suivante tant que les critères de réussite de la phase actuelle ne sont pas vérifiés. Les estimations de durée et de pourcentage doivent rester indicatives et être mises à jour à partir du travail réellement terminé.
