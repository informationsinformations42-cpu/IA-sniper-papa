# 7. Installation, maintenance et tests

## Installation cible

### Démarrage actuel du prototype

Depuis `/opt/aegisdesk-sniper` :

```bash
python3 scripts/overlord_ai.py
```

Le lanceur vérifie le modèle et `llama-server`, puis démarre le moteur sur
`127.0.0.1:18080`. Cette commande ne lance pas les agents spécialisés.

### Interface desktop actuelle

Prérequis de développement : Node.js 22+ et npm.

```bash
npm install
npm start
```

L'installateur Windows vérifie d'abord les 17 modèles GGUF dans les données locales
de l'application. Après acceptation des conditions, il réutilise les fichiers
conformes à leur empreinte SHA-256 et ne télécharge que les fichiers absents ou
invalides. Les modèles vérifiés sont associés automatiquement à leurs agents; leur
rôle est appliqué par le prompt système à chaque demande, sans réentraîner le modèle.
Une connexion Internet est requise uniquement pour les fichiers manquants ou invalides;
jusqu'à 27 Go d'espace libre peuvent être nécessaires si aucun modèle n'est présent.
Les fichiers partiels sont conservés pour permettre la reprise après une interruption.

Le moteur llama.cpp CPU x64 `llama-server.exe` (b12521), ses DLL et le programme
officiel Microsoft Visual C++ Redistributable x64 requis sont inclus dans
l'installateur Windows; Ollama n'est pas nécessaire. Le runtime C++ est installé
automatiquement avant les modèles, avec une demande UAC éventuelle selon Windows.
Un ancien chemin Linux
enregistré est ignoré au profit du moteur inclus. Un seul modèle est chargé en
mémoire à la fois. OVERLORD route les intentions connues vers un seul agent;
les demandes générales restent auprès de lui. L'utilisateur peut aussi sélectionner
un agent directement. Le serveur est lancé avec un contexte de 4 096 tokens et un
seul calcul parallèle pour limiter la mémoire utilisée. Il transmet les réponses
au fur et à mesure et réserve au plus huit threads CPU (75 % des processeurs logiques)
pour laisser des ressources à l'interface et au reste du système. La génération est
plafonnée à 256 tokens par réponse pour limiter l'attente sur CPU; le modèle, la
quantification et le processeur restent les principaux facteurs de débit. La sphère indique
visuellement l'analyse, la génération, l'agent effectivement employé et les erreurs;
elle ne sert pas au calcul du modèle. Son animation se suspend lorsqu'elle est hors
écran ou que la fenêtre est masquée. Les clics suivent aussi une séquence de nœuds
indiquée par un indice visuel pour activer un effet de constellation décoratif.

### Comptes e-mail

Les connexions actuellement prises en charge sont Gmail/Google Workspace et
Outlook/Microsoft 365. La recherche de fournisseurs affiche aussi Yahoo, iCloud,
Proton, Zoho et un profil générique, mais ceux-ci ne sont pas connectables dans cette
version. Chaque service demande une intégration OAuth/API propre; il n'existe pas de
connexion universelle sûre à tous les fournisseurs.

Pour activer Gmail, crée un identifiant OAuth de type application de bureau dans
Google Cloud, active Gmail API et configure l'écran de consentement avec ton compte
comme utilisateur de test si nécessaire. Pour Outlook, crée une inscription
d'application publique dans Microsoft Entra, autorise les flux mobiles/bureau et les
permissions déléguées `User.Read`, `Mail.Read`, `Mail.ReadWrite` et `Mail.Send`.
Colle uniquement l'identifiant d'application public dans Paramètres; aucun secret
client ni mot de passe de compte ne doit être saisi. Le fournisseur ouvre sa page
officielle de connexion et demande son propre consentement.

Les jetons d'accès, les réglages de réponse automatique et le journal d'activité sont
chiffrés par `safeStorage` dans le coffre du système d'exploitation. Si le coffre sûr
n'est pas disponible, la connexion ou l'écriture du journal chiffré est refusée.
L'IA ne lit les e-mails qu'après une recherche explicite ou lorsque la surveillance
des réponses automatiques est activée. Les messages sont traités comme des données
non fiables et ne sont jamais rendus en HTML.

Les réponses automatiques sont désactivées par défaut et demandent une activation
explicite dans Paramètres, une liste d'adresses approuvées et des consignes. Elles
ne répondent qu'à ces adresses, une seule fois par conversation, ignorent les listes
de diffusion et messages automatiques, et ne fonctionnent que lorsque l'application
est ouverte. À son démarrage, l'application reprend la surveillance à partir de
l'heure courante et ne traite pas les messages reçus pendant sa fermeture. La
réponse est produite par le modèle local; aucun envoi automatique n'a lieu si le
modèle, le fournisseur ou le journal chiffré échoue. Il n'y a pas de plafond journalier; chaque vérification
traite au plus 200 messages candidats et reprend aux vérifications suivantes.
Pour éviter les doublons, les identifiants de conversations traitées sont conservés
chiffrés; à la limite de sécurité de 20 000 conversations, les nouveaux envois sont
bloqués plutôt que de risquer une réponse en double.

L'enregistrement d'un brouillon reste explicite. Tout envoi manuel exige une
confirmation dans une fenêtre système. Les envois manuels confirmés et les réponses
automatiques sont inscrits avec leur contenu complet dans la rubrique « E-mails
envoyés » du journal chiffré; l'activité est conservée 90 jours. Les mots de passe
et jetons ne figurent jamais dans ce journal. Le journal de diagnostic distinct
consigne les erreurs techniques sans contenu de conversation ou d'e-mail.
« Déconnecter » efface le jeton local; pour révoquer également le consentement chez
Google ou Microsoft, retire l'application dans les paramètres de sécurité du compte
concerné.

Après l'installation des modèles, l'installateur vérifie que le runtime llama.cpp
démarre, charge le modèle OVERLORD et produit une réponse réelle. En cas d'échec,
l'installation propose de réessayer et ne présente pas le test comme réussi.
L'acceptation des licences des modèles reste manuelle; les fichiers manquants ou
invalides sont ensuite téléchargés et vérifiés automatiquement.

Sous Windows, le chemin du moteur personnalisé doit désigner `llama-server.exe`.
Un fichier tel que `llama-connect.exe` est ignoré; si un serveur personnalisé
échoue au démarrage, l'application réessaie avec le moteur inclus. Les dernières
lignes de sortie du moteur sont affichées si tous les serveurs échouent.
Le journal tournant `logs/diagnostics.jsonl` est accessible depuis Paramètres; il
consigne les démarrages et erreurs du moteur sans enregistrer les conversations.

La désinstallation Windows retire l'application, mais les modèles téléchargés
restent dans le dossier de données de l'application sous `%APPDATA%`. Une mise à
jour réutilise les modèles intacts; ils doivent être supprimés séparément si
l'utilisateur veut récupérer l'espace disque.

### Ouvrir l'application sur Ubuntu

Sur l'ordinateur Ubuntu, dans une session de bureau graphique, ouvre un terminal et
lance le projet depuis son dossier :

```bash
cd /opt/aegisdesk-sniper
npm install
npm start
```

Le moteur et un modèle GGUF doivent être installés séparément sur Linux. Si le
chemin enregistré dans `config/ai_registry.json` ne correspond pas à cet ordinateur,
choisis le binaire `llama-server` et le modèle `.gguf` dans Paramètres. Ne lance pas
le fichier `.exe` Windows sous Ubuntu.

Génération depuis le projet :

```bash
npm run dist:win
npm run dist:linux
```

Le résultat est un installateur Windows x64 (`.exe`) et un AppImage Linux x64
dans `release/`. `npm run dist:mac` doit être exécuté sur macOS. L'installateur
Windows installe aussi son moteur llama.cpp local et télécharge les modèles pendant
l'installation; l'AppImage Linux nécessite
une configuration séparée des modèles et du moteur. En alternative aux paramètres
de l'interface, définir `AEGIS_LLAMA_SERVER` et `AEGIS_MODEL_PATH`. Les installateurs
actuels ne sont pas signés.

## Runtime Windows inclus

La version Windows embarque le runtime CPU x64 llama.cpp b12521, le Visual C++
Redistributable x64 Microsoft 14.44.35211.0 et les licences llama.cpp et
LLVM/OpenMP. La provenance du paquet llama.cpp est le dépôt officiel
`ggml-org/llama.cpp`, archive `llama-b12521-bin-win-cpu-x64.zip`, SHA-256
`bd4e093bce292452248c318d4b176fbfebe1ca43a7f3779ebb3846fe7753653e`. Le moteur
et le runtime Visual C++ sont installés avec l'application; l'installateur
Microsoft est conservé sans modification (SHA-256
`cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b`). Les
modèles restent téléchargés séparément si absents et leur accord de licence
reste manuel.

### Mode personnalisé
Permettre de choisir les agents et composants optionnels, tout en offrant l'ajout ultérieur de modules.

## Précautions de développement

- Faire une sauvegarde avant une migration importante.
- Ne pas supprimer de fichier existant sans accord explicite.
- Présenter les changements prévus avant de les appliquer.
- Limiter les téléchargements automatiques au manifeste versionné et vérifier les empreintes des fichiers.
- Documenter les commandes et leur emplacement d'exécution.
- Distinguer commandes de lecture seule et commandes qui modifient le système.

## Stratégie de tests

### Tests du moteur
- Démarrage avec le modèle existant.
- Vérification de l'adresse d'écoute.
- Requête simple et réponse attendue.
- Plusieurs requêtes consécutives.
- Mesure du temps de première réponse et des suivantes.
- Gestion d'un modèle absent, d'un port occupé et d'un serveur arrêté.

### Tests d'OVERLORD
- Conversation normale en français.
- Réponse longue et limite de génération.
- Erreur HTTP et délai dépassé.
- Redémarrage du serveur.
- Vérification que l'agent ne prétend pas qu'un spécialiste a été exécuté s'il ne l'a pas été.

### Tests des agents
- Agent activé / désactivé.
- Agent absent ou indisponible.
- Routage vers le bon agent.
- Respect du périmètre et des permissions.
- Résultat documenté et traçable.

### Tests de sécurité
- Refus d'une cible non autorisée.
- Confirmation avant opération sensible.
- Absence d'exécution arbitraire.
- Protection des secrets.
- Journaux sans données sensibles inutiles.
- Serveur d'inférence non exposé au réseau.

### Tests de l'interface et de l'installateur
- États visuels de l'assistant.
- Navigation et accessibilité.
- Installation complète sur environnement propre.
- Installation personnalisée.
- Désinstallation et mise à jour.
- Vérification des modules optionnels.

## Définition de « terminé »

Une fonctionnalité n'est terminée que lorsque :
1. son comportement attendu est écrit ;
2. les tests pertinents passent ;
3. les erreurs principales sont gérées ;
4. les permissions sont vérifiées ;
5. le résultat est documenté ;
6. aucun effet secondaire non prévu n'a été observé.
