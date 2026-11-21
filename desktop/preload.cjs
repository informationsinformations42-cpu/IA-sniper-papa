const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aegis", {
  getAgents: () => ipcRenderer.invoke("aegis:get-agents"),
  setAgentEnabled: (id, enabled) => ipcRenderer.invoke("aegis:set-agent-enabled", { id, enabled }),
  getStatus: () => ipcRenderer.invoke("aegis:get-status"),
  openDiagnosticsLog: () => ipcRenderer.invoke("aegis:open-diagnostics-log"),
  getSystemStats: () => ipcRenderer.invoke("aegis:get-system-stats"),
  getModelInstallStatus: () => ipcRenderer.invoke("aegis:get-model-install-status"),
  getMailProviders: () => ipcRenderer.invoke("aegis:mail:get-providers"),
  getMailAccounts: () => ipcRenderer.invoke("aegis:mail:get-accounts"),
  setMailClientId: (providerId, clientId) =>
    ipcRenderer.invoke("aegis:mail:set-client-id", providerId, clientId),
  openMailSetup: (providerId) => ipcRenderer.invoke("aegis:mail:open-setup", providerId),
  connectMail: (providerId) => ipcRenderer.invoke("aegis:mail:connect", providerId),
  disconnectMail: (accountId) => ipcRenderer.invoke("aegis:mail:disconnect", accountId),
  searchMail: (accountId, query) => ipcRenderer.invoke("aegis:mail:search", accountId, query),
  getMailMessage: (accountId, messageId) =>
    ipcRenderer.invoke("aegis:mail:get-message", accountId, messageId),
  saveMailDraft: (accountId, draft) =>
    ipcRenderer.invoke("aegis:mail:save-draft", accountId, draft),
  sendMail: (accountId, draft) => ipcRenderer.invoke("aegis:mail:send", accountId, draft),
  getMailAutoReplyConfig: (accountId) =>
    ipcRenderer.invoke("aegis:mail:get-auto-reply-config", accountId),
  setMailAutoReplyConfig: (accountId, config) =>
    ipcRenderer.invoke("aegis:mail:set-auto-reply-config", accountId, config),
  getActivityJournal: () => ipcRenderer.invoke("aegis:journal:list"),
  getSentMailJournal: () => ipcRenderer.invoke("aegis:journal:sent"),
  recordActivity: (event) => ipcRenderer.invoke("aegis:journal:record", event),
  downloadModels: (acceptedLicenses) => ipcRenderer.invoke("aegis:download-models", acceptedLicenses),
  cancelModelDownload: () => ipcRenderer.invoke("aegis:cancel-model-download"),
  finishModelInstall: () => ipcRenderer.invoke("aegis:finish-model-install"),
  openModelSource: (agentId) => ipcRenderer.invoke("aegis:open-model-source", agentId),
  onModelInstallProgress: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Un rappel de progression est requis.");
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("aegis:model-install-progress", listener);
    return () => ipcRenderer.removeListener("aegis:model-install-progress", listener);
  },
  onResponseChunk: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Un rappel de réponse est requis.");
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on("aegis:response-chunk", listener);
    return () => ipcRenderer.removeListener("aegis:response-chunk", listener);
  },
  onNotice: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Un rappel de notification est requis.");
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("aegis:notice", listener);
    return () => ipcRenderer.removeListener("aegis:notice", listener);
  },
  chooseAgentModel: (id) => ipcRenderer.invoke("aegis:choose-agent-model", id),
  chooseRuntimeFile: (kind) => ipcRenderer.invoke("aegis:choose-runtime-file", kind),
  ask: (agentId, message, requestId) => ipcRenderer.invoke("aegis:ask", { agentId, message, requestId })
});
