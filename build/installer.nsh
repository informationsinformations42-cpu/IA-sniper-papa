!macro customInstall
  IfFileExists "$INSTDIR\resources\llama\llama-server.exe" llamaRuntimePresent
    MessageBox MB_OK|MB_ICONSTOP "llama-server.exe manque dans l’installation. Télécharge à nouveau l’installateur complet puis réessaie."
    Abort
  llamaRuntimePresent:
  IfFileExists "$INSTDIR\resources\llama\llama-server-impl.dll" llamaServerDllPresent
    MessageBox MB_OK|MB_ICONSTOP "Une DLL obligatoire de llama.cpp manque dans l’installation. Télécharge à nouveau l’installateur complet puis réessaie."
    Abort
  llamaServerDllPresent:
  IfFileExists "$INSTDIR\resources\vc_redist.x64.exe" vcRuntimeInstallerPresent
    MessageBox MB_OK|MB_ICONSTOP "L’installateur du runtime Visual C++ manque. Télécharge à nouveau l’installateur complet puis réessaie."
    Abort
  vcRuntimeInstallerPresent:

vcRuntimeRetry:
  ClearErrors
  ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /install /quiet /norestart' $0
  ${If} $0 != 0
    ${If} $0 != 3010
      ${If} $0 != 1638
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Le runtime Visual C++ requis par llama-server n’a pas pu être installé (code $0). Choisis Réessayer, ou Annuler pour interrompre l’installation." IDRETRY vcRuntimeRetry
        Abort
      ${EndIf}
    ${EndIf}
  ${EndIf}

llamaVersionRetry:
  ClearErrors
  ExecWait '"$INSTDIR\resources\llama\llama-server.exe" --version' $0
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "llama-server ou une de ses dépendances ne démarre pas (code $0). Vérifie l’installation du runtime Visual C++, puis choisis Réessayer." IDRETRY llamaVersionRetry
    Abort
  ${EndIf}

modelInstallRetry:
  ClearErrors
  ExecWait '"$appExe" --install-models' $0
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "L’installation des 17 modèles n’est pas terminée. Choisis Réessayer pour reprendre les téléchargements, ou Annuler pour interrompre l’installation." IDRETRY modelInstallRetry
    Abort
  ${EndIf}

runtimeVerifyRetry:
  ClearErrors
  ExecWait '"$appExe" --verify-install' $0
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Le test final du moteur et du modèle n’a pas réussi. Vérifie que le PC a assez de mémoire et d’espace disque, puis choisis Réessayer. L’application ne sera pas déclarée prête sans une réponse du modèle." IDRETRY runtimeVerifyRetry
    Abort
  ${EndIf}
!macroend
