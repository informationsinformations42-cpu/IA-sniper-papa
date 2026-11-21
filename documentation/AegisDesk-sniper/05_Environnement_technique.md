# 5. Environnement technique constaté

Informations communiquées à partir de la VM de développement. Elles peuvent évoluer : les vérifier avant toute décision technique.

## Machine virtuelle

- Nom d'hôte : `mathysvm`
- Système : Ubuntu 26.04.1 LTS
- Noyau : Linux 7.0.0-43-generic
- Virtualisation : KVM/QEMU
- Architecture : x86-64
- CPU virtuel : 16 vCPU (2 sockets × 8 cœurs)
- Instructions CPU observées : SSE, SSE2, SSSE3, SSE4.1, SSE4.2
- AVX, AVX2, FMA et F16C non disponibles dans l'environnement présenté
- RAM : environ 38 Gio
- Swap : 8 Gio
- Disque racine : environ 98 Gio, environ 50 Gio libres lors de l'inventaire
- Pas de GPU dédié détecté ; calcul sur CPU.

## Logiciels observés

- Python : 3.14.4
- Git : 2.53.0
- CMake : 4.2.3
- GCC/G++ : 15.2.0
- llama.cpp compilé en CPU avec SSE4.2 et OpenMP.
- Backend observé : `ggml-cpu`.
- CUDA, Vulkan et BLAS désactivés dans la compilation rapportée.

## Modèle local

Chemin :
`/home/mathys/models/qwen2.5-3b-instruct-q4_k_m.gguf`

Taille approximative : 1,8 Gio.

Le modèle a été chargé et a généré une réponse lors d'un test direct avec `llama-cli`. Ce test confirme que le modèle est utilisable sur cette VM, mais ne fournit pas à lui seul une mesure fiable de débit ou de latence.

## Exécutables llama.cpp

- `/home/mathys/llama.cpp/build/bin/llama-cli`
- `/home/mathys/llama.cpp/build/bin/llama-server`

La commande de serveur testée sans modèle a écouté sur `127.0.0.1:18080` jusqu'à son arrêt par `timeout`. Cela valide le démarrage en mode routeur, pas encore le service complet avec le modèle.

## Dossier du projet

Chemin :
`/opt/aegisdesk-sniper`

Structure observée :
- `agents/` avec 17 dossiers d'agents ;
- `config/`, `core/`, `interface/`, `logs/`, `models/`, `scripts/`.

Lors de l'inventaire, le seul fichier du projet identifié était :
`agents/overlord/overlord.py`

Les dossiers `config/`, `core/` et `models/` étaient vides. Aucun manifeste de dépendances ou configuration de projet n'avait été trouvé.

## Limites connues

- Le `pip` du Python système n'était pas disponible lors de l'inspection (`No module named pip`).
- Ne pas supposer qu'une dépendance Python externe est installée.
- Privilégier une première intégration simple et limitée.
- Ne pas recompiler llama.cpp, télécharger un autre modèle ou modifier l'environnement sans autorisation explicite.
