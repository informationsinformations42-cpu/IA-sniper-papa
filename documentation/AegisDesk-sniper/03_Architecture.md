# 3. Architecture cible

## Vue d'ensemble

```text
Interface de bureau
       |
       v
Assistant central OVERLORD
       |
       +--> Constructeur de contexte / prompts
       |
       +--> Routeur d'agents
       |       +--> SENTINEL
       |       +--> PHANTOM
       |       +--> WEBHAWK
       |       +--> BLACKBOX
       |       +--> HUNTER
       |       +--> AEGIS
       |       +--> ARCHIVE
       |       +--> FORGE
       |       +--> PIXEL
       |       +--> ECHO
       |       +--> SPECTRE
       |       +--> ACADEMY
       |       +--> BREACH
       |       +--> ORACLE
       |       +--> ARCHITECT
       |       +--> SNIPER
       |
       +--> Gestion des permissions / confirmations
       |
       +--> Historique et mémoire locale
       |
       v
Client OVERLORD local
       |
       v
Serveur llama.cpp (llama-server)
       |
       v
Modèle GGUF local
```

Cette vue est une cible d'architecture, pas une description de composants déjà tous présents.

L'interface desktop initiale utilise Electron avec HTML/CSS/JavaScript. L'écran Paramètres
permet de choisir les chemins locaux du moteur et du modèle; ceux-ci sont mémorisés dans
le profil de l'utilisateur. Le processus
principal dialogue directement avec `llama-server`; l'interface graphique ne reçoit
pas d'accès Node.js direct. Le serveur reste limité à `127.0.0.1`.

L'installateur Windows télécharge les 17 GGUF depuis des révisions Hugging Face
épinglées, vérifie leur empreinte SHA-256 et associe chaque modèle à son agent.
OVERLORD applique ensuite un routeur local à règles déterministes; les demandes
générales restent auprès de lui, et une demande spécialisée est envoyée au modèle
de l'agent correspondant. L'utilisateur peut aussi sélectionner explicitement un
agent dans le chat. Le même serveur local est redémarré lorsque l'agent change; un
seul modèle est donc chargé à la fois. Les requêtes de cybersécurité ambiguës restent
auprès d'OVERLORD; la délégation cyber spécialisée exige un contexte explicitement
défensif ou autorisé. Les agents ne disposent pas d'outils d'action système.

## Architecture progressive

### Étape 1 — serveur d'inférence persistant
- Implémenté dans `scripts/overlord_ai.py` : démarrer le `llama-server` avec le modèle déjà disponible.
- Écouter uniquement sur `127.0.0.1`.
- Vérifier le point de santé `/health` et appeler l'API OpenAI-compatible `/v1/chat/completions`.
- Le démarrage, une réponse et l'arrêt du serveur lancé par OVERLORD ont été testés.
- Les temps observés pour deux réponses successives étaient de 38,7 s et 19,6 s; le temps de chargement initial n'a pas été mesuré séparément.
- Ne pas supposer que le cache KV est automatiquement réutilisé entre requêtes HTTP.

### Étape 2 — client Python et OVERLORD
- Implémenté avec la bibliothèque standard `urllib` dans `scripts/overlord_ai.py`.
- OVERLORD démarre le serveur avant le chat et le garde chargé entre les requêtes de la session.
- Le contexte des messages précédents est transmis à l'API; la qualité du rappel conversationnel reste à valider.
- La sortie du chat ne contient pas la bannière interactive de `llama-cli`.
- L'arrêt normal a été testé; les scénarios d'erreur réseau et de délai dépassé restent à tester.

### Étape 3 — modules avancés
Après validation des étapes précédentes :
- amélioration progressive des règles du routeur local ;
- profils et configuration des agents ;
- mémoire locale SQLite ;
- contrôle des permissions ;
- journalisation et rapports ;
- finalisation de l'interface graphique et liaison aux états réels ;
- modules voix et visuels selon les priorités validées.

### Distribution desktop
- Electron Builder produit un installateur NSIS Windows x64 (`.exe`) et un AppImage Linux x64.
- La cible macOS (`.dmg`) doit être construite et testée sur macOS.
- L'installateur Windows x64 inclut le moteur llama.cpp CPU `llama-server.exe` (b12521), ses DLL/licences et le runtime Microsoft Visual C++ x64 requis; Ollama n'est pas requis. Il télécharge les modèles pendant l'installation et nécessite Internet ainsi que jusqu'à 27 Go d'espace disque si aucun modèle n'est déjà présent.
- L'AppImage Linux n'exécute pas le programme de téléchargement Windows; les modèles et binaires natifs doivent y être configurés séparément.
- Les paquets Windows ne sont pas signés; une signature de code sera nécessaire pour une distribution publique sans avertissement éditeur.
- Le chat peut utiliser les agents activés avec leurs modèles associés; l'historique reste en mémoire uniquement durant la session.
- Le routeur local associe des intentions reconnues à un seul spécialiste. Les intentions inconnues restent avec OVERLORD. Il n'y a pas d'outils d'exécution ou d'action système.

## Composants logiciels envisagés

| Composant | Responsabilité |
|---|---|
| `LlamaServerManager` | Démarrer, surveiller et arrêter le serveur local. |
| `LlamaClient` | Envoyer les requêtes et gérer les réponses/erreurs. |
| `PromptBuilder` | Construire le contexte de façon contrôlée. |
| `AgentRouter` | Choisir les agents disponibles et autorisés. |
| `PermissionGate` | Vérifier les permissions et demander confirmation. |
| `ConversationDB` | Stocker l'historique et la mémoire locale. |
| Interface | Présenter conversation, agents, états et confirmations. |

Les noms sont des propositions de conception. Ne pas créer tous ces composants d'un seul coup.
