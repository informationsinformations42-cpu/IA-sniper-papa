# 4. Sécurité et autorisations

La sécurité est une exigence centrale du projet.

## Principes obligatoires

1. **Moindre privilège :** chaque composant ne reçoit que les permissions nécessaires.
2. **Périmètre autorisé :** toute analyse réseau, web ou applicative doit viser des ressources appartenant à l'utilisateur ou explicitement autorisées.
3. **Confirmation :** demander une validation claire avant toute action sensible ou modification.
4. **Pas de commandes arbitraires :** un agent ne doit pas transformer librement une demande en commande système exécutable.
5. **Liste d'actions autorisées :** les opérations possibles doivent être définies, validées et contrôlées.
6. **Traçabilité :** journaliser les actions proposées, confirmées, exécutées et échouées.
7. **Séparation des rôles :** les agents spécialisés ne peuvent pas élargir leurs propres permissions.
8. **État honnête :** distinguer une suggestion, une simulation, une action réellement effectuée et un résultat vérifié.
9. **Protection des données :** conserver les données localement autant que possible et éviter d'enregistrer les secrets.
10. **Arrêt sûr :** si le serveur ou un module échoue, l'application doit signaler l'échec et ne pas prétendre que la tâche a réussi.

## Actions sensibles

Une action sensible peut inclure, selon le contexte :
- modification de fichiers ou de paramètres système ;
- installation ou suppression de logiciels ;
- changement de configuration réseau ;
- arrêt ou redémarrage de services ;
- analyse d'une ressource externe.

Avant une action, l'application doit présenter ce qui va être fait, sur quelle cible, avec quelles conséquences possibles, puis demander une confirmation appropriée.

## Réseau local du moteur IA

- Le serveur d'inférence doit écouter sur `127.0.0.1` pendant le développement.
- Ne pas l'exposer directement sur le réseau local ou Internet.
- Vérifier l'authentification, CORS et les routes réellement activées avant tout changement d'exposition.
- Ne pas placer de clé ou secret dans le code source.
