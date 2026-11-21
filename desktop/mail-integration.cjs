const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const TOKEN_FILE = "mail-accounts.enc";
const CLIENT_FILE = "mail-oauth-clients.json";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_SEARCH_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 20000;
const MAX_AUTO_REPLY_CONVERSATIONS = 20000;

const PROVIDERS = [
  {
    id: "gmail",
    name: "Gmail / Google Workspace",
    keywords: "google workspace gmail",
    supported: true,
    setupUrl: "https://console.cloud.google.com/auth/clients"
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    keywords: "microsoft office hotmail outlook",
    supported: true,
    setupUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    keywords: "yahoo",
    supported: false,
    reason: "Connexion OAuth Yahoo à intégrer."
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    keywords: "apple icloud",
    supported: false,
    reason: "iCloud ne fournit pas ici de connexion OAuth compatible."
  },
  {
    id: "proton",
    name: "Proton Mail",
    keywords: "proton bridge",
    supported: false,
    reason: "Proton Mail nécessite son application Bridge; la connexion directe n'est pas disponible."
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    keywords: "zoho",
    supported: false,
    reason: "Connexion OAuth Zoho à intégrer."
  },
  {
    id: "other",
    name: "Autre fournisseur",
    keywords: "imap smtp personnalisé",
    supported: false,
    reason: "Les autres fournisseurs exigent une configuration OAuth et IMAP/SMTP propre à chacun."
  }
];

const OAUTH_PROVIDERS = {
  gmail: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    apiBase: "https://gmail.googleapis.com/gmail/v1",
    redirectHost: "127.0.0.1",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose"
    ].join(" ")
  },
  outlook: {
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    profileUrl: "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
    apiBase: "https://graph.microsoft.com/v1.0",
    redirectHost: "localhost",
    scope: "openid profile offline_access User.Read Mail.Read Mail.ReadWrite Mail.Send"
  }
};

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function validateClientId(providerId, clientId) {
  if (typeof clientId !== "string" || clientId.length > 300) return false;
  const value = clientId.trim();
  if (providerId === "gmail") {
    return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
  }
  if (providerId === "outlook") {
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  }
  return false;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => decodeEntityCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => decodeEntityCode(Number.parseInt(code, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntityCode(code) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : " ";
}

function findGooglePart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts || []) {
    const match = findGooglePart(child, mimeType);
    if (match) return match;
  }
  return null;
}

function decodeGooglePart(part) {
  const selected = findGooglePart(part, "text/plain") || findGooglePart(part, "text/html");
  if (!selected) return "";
  const decoded = Buffer.from(selected.body.data, "base64url").toString("utf8");
  return selected.mimeType === "text/html" ? stripHtml(decoded) : decoded;
}

function headerValue(headers, name) {
  return (headers || []).find((header) => header.name?.toLowerCase() === name)?.value || "";
}

function extractEmailAddress(value) {
  if (typeof value !== "string") return "";
  const candidate = value.match(/<([^<>]+)>/)?.[1] || value.trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate)
    ? candidate.toLowerCase()
    : "";
}

function isAutomatedMessage(message) {
  const sender = message.fromAddress || extractEmailAddress(message.from);
  const localPart = sender.split("@")[0] || "";
  const autoSubmitted = (message.autoSubmitted || "").trim().toLowerCase();
  const precedence = (message.precedence || "").trim().toLowerCase();
  return Boolean(
    (autoSubmitted && autoSubmitted !== "no")
    || /^(bulk|list|junk)$/i.test(precedence)
    || message.listId
    || message.autoResponseSuppress
    || /(?:^|[-_.])(no-?reply|mailer-daemon|postmaster)(?:$|[-_.])/i.test(localPart)
    || /\b(?:automatic reply|auto.?reply|out of office|absence automatique|réponse automatique)\b/i.test(message.subject || "")
  );
}

function parseGoogleMessage(message) {
  const payload = message.payload || {};
  const headers = payload.headers || [];
  const text = decodeGooglePart(payload) || message.snippet || "";
  return {
    id: message.id,
    threadId: message.threadId || message.id,
    subject: headerValue(headers, "subject") || "(sans objet)",
    from: headerValue(headers, "from") || "Expéditeur inconnu",
    fromAddress: extractEmailAddress(headerValue(headers, "from")),
    receivedAt: headerValue(headers, "date"),
    messageIdHeader: headerValue(headers, "message-id"),
    references: headerValue(headers, "references"),
    autoSubmitted: headerValue(headers, "auto-submitted"),
    precedence: headerValue(headers, "precedence"),
    listId: headerValue(headers, "list-id"),
    autoResponseSuppress: headerValue(headers, "x-auto-response-suppress"),
    preview: stripHtml(message.snippet || text).slice(0, 500),
    body: stripHtml(text).slice(0, MAX_MESSAGE_LENGTH)
  };
}

function parseMicrosoftMessage(message) {
  const rawBody = message.body?.content || "";
  return {
    id: message.id,
    conversationId: message.conversationId || message.id,
    subject: message.subject || "(sans objet)",
    from: message.from?.emailAddress?.address || "Expéditeur inconnu",
    fromAddress: extractEmailAddress(message.from?.emailAddress?.address),
    receivedAt: message.receivedDateTime || "",
    messageIdHeader: headerValue(message.internetMessageHeaders, "message-id"),
    references: headerValue(message.internetMessageHeaders, "references"),
    autoSubmitted: headerValue(message.internetMessageHeaders, "auto-submitted"),
    precedence: headerValue(message.internetMessageHeaders, "precedence"),
    listId: headerValue(message.internetMessageHeaders, "list-id"),
    autoResponseSuppress: headerValue(message.internetMessageHeaders, "x-auto-response-suppress"),
    preview: stripHtml(message.bodyPreview || rawBody).slice(0, 500),
    body: (message.body?.contentType === "html" ? stripHtml(rawBody) : rawBody)
      .slice(0, MAX_MESSAGE_LENGTH)
  };
}

function parseGoogleMetadata(message) {
  const headers = message.payload?.headers || [];
  return {
    id: message.id,
    threadId: message.threadId || message.id,
    subject: headerValue(headers, "subject") || "(sans objet)",
    from: headerValue(headers, "from") || "Expéditeur inconnu",
    fromAddress: extractEmailAddress(headerValue(headers, "from")),
    receivedAt: headerValue(headers, "date"),
    messageIdHeader: headerValue(headers, "message-id"),
    references: headerValue(headers, "references"),
    autoSubmitted: headerValue(headers, "auto-submitted"),
    precedence: headerValue(headers, "precedence"),
    listId: headerValue(headers, "list-id"),
    autoResponseSuppress: headerValue(headers, "x-auto-response-suppress"),
    preview: stripHtml(message.snippet || "").slice(0, 500),
    body: ""
  };
}

function normalizeDraft(input) {
  const recipients = typeof input?.to === "string" && input.to.length <= 2000
    ? input.to.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean)
    : [];
  if (recipients.length === 0 || recipients.length > 5
    || recipients.some((email) => email.length > 320
      || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) {
    throw new Error("Indique une à cinq adresses e-mail valides.");
  }
  if (typeof input.subject !== "string" || !input.subject.trim()) {
    throw new Error("L'objet du message est obligatoire.");
  }
  if (typeof input.body !== "string" || !input.body.trim()) {
    throw new Error("Le corps du message est obligatoire.");
  }
  const subject = input.subject.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200);
  if (!subject) throw new Error("L'objet du message est obligatoire.");
  const body = input.body.replace(/\u0000/g, "").slice(0, MAX_MESSAGE_LENGTH);
  return { recipients, subject, body };
}

function createEncryptedAccountStore({ filePath, safeStorage, fsImpl = fs }) {
  function ensureEncryption() {
    const backend = safeStorage?.getSelectedStorageBackend?.();
    if (!safeStorage || !safeStorage.isEncryptionAvailable() || backend === "basic_text") {
      throw new Error("Le coffre chiffré du système n'est pas disponible; aucun compte n'a été enregistré.");
    }
  }

  function read() {
    let encrypted;
    try {
      encrypted = fsImpl.readFileSync(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new Error(`Impossible de lire le coffre des comptes e-mail : ${error.message}`);
    }
    ensureEncryption();
    try {
      const accounts = JSON.parse(safeStorage.decryptString(encrypted));
      if (!Array.isArray(accounts)) throw new Error("format invalide");
      return accounts;
    } catch (error) {
      throw new Error(`Le coffre des comptes e-mail est illisible : ${error.message}`);
    }
  }

  function write(accounts) {
    ensureEncryption();
    const directory = path.dirname(filePath);
    fsImpl.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      fsImpl.writeFileSync(
        temporaryPath,
        safeStorage.encryptString(JSON.stringify(accounts)),
        { mode: 0o600 }
      );
      fsImpl.renameSync(temporaryPath, filePath);
    } catch (error) {
      try {
        fsImpl.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          throw new Error(`Échec du coffre et du nettoyage du fichier temporaire : ${cleanupError.message}`);
        }
      }
      throw new Error(`Impossible d'enregistrer le coffre e-mail chiffré : ${error.message}`);
    }
  }

  return {
    list: () => read().map(({ id, provider, email, displayName, connectedAt, autoReply }) => ({
      id,
      provider,
      email,
      displayName,
      connectedAt,
      autoReply: {
        enabled: Boolean(autoReply?.enabled),
        approvedSenders: autoReply?.approvedSenders || [],
        instructions: autoReply?.instructions || ""
      }
    })),
    get: (id) => read().find((account) => account.id === id) || null,
    upsert(account) {
      const accounts = read();
      const existing = accounts.find((item) =>
        item.provider === account.provider && item.email.toLowerCase() === account.email.toLowerCase()
      );
      if (existing) {
        Object.assign(existing, account, {
          id: existing.id,
          refreshToken: account.refreshToken || existing.refreshToken
        });
      } else {
        accounts.push(account);
      }
      write(accounts);
      return accounts.find((item) => item.provider === account.provider
        && item.email.toLowerCase() === account.email.toLowerCase());
    },
    update(account) {
      const accounts = read();
      const index = accounts.findIndex((item) => item.id === account.id);
      if (index < 0) throw new Error("Le compte e-mail n'existe plus.");
      accounts[index] = account;
      write(accounts);
    },
    remove(id) {
      const accounts = read();
      const remaining = accounts.filter((account) => account.id !== id);
      if (remaining.length === accounts.length) throw new Error("Le compte e-mail n'existe plus.");
      write(remaining);
    }
  };
}

function createMailIntegration({
  userDataPath,
  safeStorage,
  openExternal,
  confirmSend,
  audit,
  updateAuditStatus,
  fetchImpl = fetch,
  fsImpl = fs,
  now = () => Date.now()
}) {
  const accountStore = createEncryptedAccountStore({
    filePath: path.join(userDataPath, TOKEN_FILE),
    safeStorage,
    fsImpl
  });
  const clientPath = path.join(userDataPath, CLIENT_FILE);
  const refreshPromises = new Map();

  function recordAudit(type, title, detail, extra = {}) {
    if (typeof audit !== "function") return null;
    return audit({ type, title, detail, kind: extra.kind || "cyan", ...extra });
  }

  function readClients() {
    try {
      const clients = JSON.parse(fsImpl.readFileSync(clientPath, "utf8"));
      return clients && typeof clients === "object" ? clients : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error(`Impossible de lire les identifiants OAuth locaux : ${error.message}`);
    }
  }

  function writeClients(clients) {
    fsImpl.mkdirSync(path.dirname(clientPath), { recursive: true });
    fsImpl.writeFileSync(clientPath, `${JSON.stringify(clients, null, 2)}\n`, { mode: 0o600 });
  }

  function getProvider(providerId) {
    return PROVIDERS.find((provider) => provider.id === providerId);
  }

  function getProviders() {
    const clients = readClients();
    return PROVIDERS.map((provider) => ({
      ...provider,
      clientId: provider.supported ? clients[provider.id] || "" : "",
      configured: provider.supported && validateClientId(provider.id, clients[provider.id] || "")
    }));
  }

  function setClientId(providerId, clientId) {
    if (!getProvider(providerId)?.supported || !validateClientId(providerId, clientId)) {
      throw new Error("Identifiant OAuth invalide pour ce fournisseur.");
    }
    const clients = readClients();
    clients[providerId] = clientId.trim();
    writeClients(clients);
    return getProviders();
  }

  async function fetchJson(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Réponse JSON invalide reçue du fournisseur e-mail.");
      }
    }
    if (!response.ok) {
      const code = payload.error || payload.code;
      throw new Error(code
        ? `Le fournisseur e-mail a refusé la demande (${String(code).slice(0, 80)}).`
        : `Le fournisseur e-mail a refusé la demande (HTTP ${response.status}).`);
    }
    return payload;
  }

  function waitForAuthorization(providerId, clientId) {
    const provider = OAUTH_PROVIDERS[providerId];
    const state = crypto.randomBytes(32).toString("base64url");
    const { verifier, challenge } = createPkcePair();

    return new Promise((resolve, reject) => {
      let completed = false;
      let timer;
      const server = http.createServer((request, response) => {
        const callback = new URL(request.url, "http://127.0.0.1");
        if (callback.pathname !== "/") {
          response.writeHead(404);
          response.end();
          return;
        }
        if (callback.searchParams.get("state") !== state) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("État OAuth invalide. Tu peux fermer cette fenêtre.");
          finish(new Error("La vérification OAuth a échoué. Recommence la connexion."));
          return;
        }
        if (callback.searchParams.has("error")) {
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Connexion annulée. Tu peux fermer cette fenêtre.");
          finish(new Error("Connexion annulée par le fournisseur."));
          return;
        }
        const code = callback.searchParams.get("code");
        if (!code) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Code d'autorisation absent. Tu peux fermer cette fenêtre.");
          finish(new Error("Le fournisseur n'a pas renvoyé de code d'autorisation."));
          return;
        }
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"
        });
        response.end("<!doctype html><meta charset=\"utf-8\"><title>Connexion terminée</title><p>Connexion terminée. Tu peux revenir dans AegisDesk.</p>");
        finish(null, { code, verifier, redirectUri });
      });

      const finish = (error, result) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        server.close();
        if (error) reject(error);
        else resolve(result);
      };

      server.once("error", (error) => finish(new Error(`Impossible de démarrer la connexion locale : ${error.message}`)));
      server.listen(0, provider.redirectHost, async () => {
        const address = server.address();
        const redirectUri = `http://${provider.redirectHost}:${address.port}`;
        const authorization = new URL(provider.authorizationUrl);
        authorization.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: provider.scope,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          ...(providerId === "gmail" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" })
        }).toString();
        timer = setTimeout(
          () => finish(new Error("La connexion e-mail a expiré. Réessaie.")),
          5 * 60 * 1000
        );
        try {
          await openExternal(authorization.toString());
        } catch (error) {
          finish(new Error(`Impossible d'ouvrir la page de connexion : ${error.message}`));
        }
      });
    });
  }

  async function exchangeToken(providerId, clientId, code, verifier, redirectUri) {
    const provider = OAUTH_PROVIDERS[providerId];
    const form = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    });
    const token = await fetchJson(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    if (typeof token.access_token !== "string" || typeof token.refresh_token !== "string") {
      throw new Error("Le fournisseur n'a pas fourni les jetons d'accès requis. Vérifie sa configuration OAuth.");
    }
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: now() + Math.max(60, Number(token.expires_in) || 3600) * 1000
    };
  }

  async function connect(providerId) {
    const provider = getProvider(providerId);
    if (!provider?.supported) throw new Error(provider?.reason || "Fournisseur e-mail non reconnu.");
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error("Le coffre chiffré du système n'est pas disponible; la connexion a été annulée.");
    }
    const clientId = readClients()[providerId];
    if (!validateClientId(providerId, clientId || "")) {
      throw new Error("Configure d'abord l'identifiant OAuth public de cette application dans Paramètres.");
    }
    const authorization = await waitForAuthorization(providerId, clientId);
    const token = await exchangeToken(
      providerId,
      clientId,
      authorization.code,
      authorization.verifier,
      authorization.redirectUri
    );
    const oauth = OAUTH_PROVIDERS[providerId];
    const profile = await fetchJson(oauth.profileUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` }
    });
    const email = providerId === "gmail"
      ? profile.email
      : profile.mail || profile.userPrincipalName;
    if (typeof email !== "string"
      || email.length > 320
      || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw new Error("Le fournisseur n'a pas renvoyé d'adresse e-mail valide.");
    }
    const account = accountStore.upsert({
      id: crypto.randomUUID(),
      provider: providerId,
      email,
      displayName: profile.name || profile.displayName || email,
      connectedAt: new Date(now()).toISOString(),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt
    });
    recordAudit(
      "mail.account.connected",
      "Compte e-mail connecté",
      `${provider.name} · ${account.email}.`
    );
    return { id: account.id, provider: account.provider, email: account.email, displayName: account.displayName };
  }

  async function refreshAccessToken(account) {
    const activeRefresh = refreshPromises.get(account.id);
    if (activeRefresh) return activeRefresh;
    const provider = OAUTH_PROVIDERS[account.provider];
    if (!provider) throw new Error("Fournisseur e-mail non pris en charge.");
    const clientId = readClients()[account.provider];
    const refresh = (async () => {
      const fields = {
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: account.refreshToken
      };
      if (account.provider === "outlook") fields.scope = provider.scope;
      const token = await fetchJson(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields)
      });
      if (typeof token.access_token !== "string") {
        throw new Error("Le fournisseur n'a pas renouvelé l'accès. Reconnecte ce compte.");
      }
      account.accessToken = token.access_token;
      account.refreshToken = token.refresh_token || account.refreshToken;
      account.expiresAt = now() + Math.max(60, Number(token.expires_in) || 3600) * 1000;
      accountStore.update(account);
      return account.accessToken;
    })();
    refreshPromises.set(account.id, refresh);
    try {
      return await refresh;
    } finally {
      if (refreshPromises.get(account.id) === refresh) refreshPromises.delete(account.id);
    }
  }

  async function requestAccountApi(account, url, options = {}) {
    if (!account || !OAUTH_PROVIDERS[account.provider]) {
      throw new Error("Compte e-mail introuvable ou non pris en charge.");
    }
    let token = account.accessToken;
    if (!token || account.expiresAt <= now() + 60000) {
      token = await refreshAccessToken(account);
    }
    const send = (accessToken) => fetchImpl(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    let response = await send(token);
    if (response.status === 401) {
      token = await refreshAccessToken(account);
      response = await send(token);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Le fournisseur e-mail a refusé la demande (HTTP ${response.status}).`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Réponse JSON invalide reçue du fournisseur e-mail.");
    }
  }

  function requireAccount(accountId) {
    if (typeof accountId !== "string" || accountId.length > 80) {
      throw new Error("Compte e-mail invalide.");
    }
    const account = accountStore.get(accountId);
    if (!account) throw new Error("Compte e-mail introuvable. Actualise la liste des comptes.");
    return account;
  }

  function getAutoReplyConfig(accountId) {
    const account = requireAccount(accountId);
    const config = account.autoReply || {};
    return {
      enabled: Boolean(config.enabled),
      approvedSenders: config.approvedSenders || [],
      instructions: config.instructions || ""
    };
  }

  function setAutoReplyConfig(accountId, input) {
    const account = requireAccount(accountId);
    if (!input || typeof input.enabled !== "boolean"
      || !Array.isArray(input.approvedSenders)
      || input.approvedSenders.length > 100
      || input.approvedSenders.some((sender) =>
        typeof sender !== "string" || sender.trim().length > 320
          || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender.trim()))) {
      throw new Error("Liste d'expéditeurs autorisés invalide.");
    }
    if (typeof input.instructions !== "string" || input.instructions.length > 2000) {
      throw new Error("Les consignes de réponse sont limitées à 2 000 caractères.");
    }
    const approvedSenders = [...new Set(input.approvedSenders.map((sender) => sender.trim().toLowerCase()))];
    const instructions = input.instructions.trim();
    if (input.enabled && (approvedSenders.length === 0 || instructions.length < 5)) {
      throw new Error("Ajoute au moins un expéditeur approuvé et des consignes avant d'activer les réponses automatiques.");
    }
    const previous = account.autoReply;
    const previousConfig = previous || {};
    account.autoReply = {
      enabled: input.enabled,
      approvedSenders,
      instructions,
      lastCheckedAt: previousConfig.enabled && Number.isFinite(previousConfig.lastCheckedAt)
        ? previousConfig.lastCheckedAt
        : now(),
      processedConversations: previousConfig.processedConversations || []
    };
    accountStore.update(account);
    try {
      recordAudit(
        input.enabled ? "mail.auto_reply.enabled" : "mail.auto_reply.disabled",
        input.enabled ? "Réponse automatique activée" : "Réponse automatique désactivée",
        `${account.email} · ${approvedSenders.length} expéditeur(s) approuvé(s).`
      );
    } catch (error) {
      if (previous) account.autoReply = previous;
      else delete account.autoReply;
      try {
        accountStore.update(account);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "La configuration et son annulation ont échoué.");
      }
      throw error;
    }
    return getAutoReplyConfig(accountId);
  }

  function listAutoReplyAccounts() {
    return accountStore.list()
      .filter((account) => account.autoReply.enabled)
      .map(({ id, provider, email }) => ({ id, provider, email }));
  }

  async function getAutoReplyCandidates(accountId) {
    const account = requireAccount(accountId);
    if (!account.autoReply?.enabled) {
      throw new Error("Les réponses automatiques sont désactivées pour ce compte.");
    }
    const checkedAt = now();
    const since = Number(account.autoReply.lastCheckedAt);
    if (!Number.isFinite(since) || since <= 0) {
      return { checkedAt, messages: [] };
    }
    const processed = new Set((account.autoReply.processedConversations || [])
      .filter((item) => Number.isFinite(Date.parse(item.at)))
      .map((item) => item.conversationId));
    const approved = new Set(account.autoReply.approvedSenders || []);
    const messages = [];
    const seen = new Set();
    const addCandidates = (pageMessages) => {
      for (const message of pageMessages) {
        const conversationId = message.threadId || message.conversationId || message.id;
        if (!conversationId || processed.has(conversationId) || seen.has(conversationId)
          || !message.fromAddress || message.fromAddress === account.email.toLowerCase()
          || !approved.has(message.fromAddress) || isAutomatedMessage(message)) {
          continue;
        }
        seen.add(conversationId);
        messages.push(message);
      }
    };
    let hasMore = false;

    if (account.provider === "gmail") {
      let pageToken = "";
      do {
        const url = new URL(`${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages`);
        url.searchParams.set("q", `in:inbox after:${Math.floor(since / 1000)}`);
        url.searchParams.set("maxResults", "50");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const page = await requestAccountApi(account, url);
        const pageMessages = page.messages || [];
        for (let index = 0; index < pageMessages.length; index += 8) {
          const batch = await Promise.all(pageMessages.slice(index, index + 8).map(async (item) => {
            const detailUrl = new URL(
              `${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages/${encodeURIComponent(item.id)}`
            );
            detailUrl.searchParams.set("format", "metadata");
            for (const header of [
              "Subject", "From", "Date", "Message-ID", "References",
              "Auto-Submitted", "Precedence", "List-Id", "X-Auto-Response-Suppress"
            ]) {
              detailUrl.searchParams.append("metadataHeaders", header);
            }
            return parseGoogleMetadata(await requestAccountApi(account, detailUrl));
          }));
          addCandidates(batch);
        }
        pageToken = page.nextPageToken || "";
        hasMore = Boolean(pageToken && messages.length >= 200);
      } while (pageToken && messages.length < 200);
    } else {
      const base = `${OAUTH_PROVIDERS.outlook.apiBase}/me/mailFolders/inbox/messages`;
      let url = new URL(base);
      url.searchParams.set("$filter", `receivedDateTime ge ${new Date(since).toISOString()}`);
      url.searchParams.set("$select", "id,conversationId,subject,from,receivedDateTime,bodyPreview,internetMessageHeaders");
      url.searchParams.set("$top", "50");
      url.searchParams.set("$orderby", "receivedDateTime asc");
      const visited = new Set();
      while (url && messages.length < 200) {
        if (url.origin !== "https://graph.microsoft.com"
          || !url.pathname.startsWith("/v1.0/me/mailFolders/inbox/messages")
          || visited.has(url.toString())) {
          throw new Error("Le fournisseur a renvoyé un lien de pagination non autorisé.");
        }
        visited.add(url.toString());
        const page = await requestAccountApi(account, url);
        addCandidates((page.value || []).map(parseMicrosoftMessage));
        if (!page["@odata.nextLink"]) {
          url = null;
        } else {
          url = new URL(page["@odata.nextLink"]);
        }
      }
      hasMore = Boolean(url && messages.length >= 200);
    }
    return { checkedAt, messages, hasMore };
  }

  function claimAutoReplyConversation(accountId, conversationId) {
    if (typeof conversationId !== "string" || !conversationId || conversationId.length > 1000) {
      throw new Error("Conversation e-mail invalide.");
    }
    const account = requireAccount(accountId);
    if (!account.autoReply?.enabled) {
      throw new Error("Les réponses automatiques sont désactivées pour ce compte.");
    }
    const processed = (account.autoReply.processedConversations || [])
      .filter((item) => Number.isFinite(Date.parse(item.at)));
    if (processed.some((item) => item.conversationId === conversationId)) return false;
    if (processed.length >= MAX_AUTO_REPLY_CONVERSATIONS) {
      throw new Error("La limite de sécurité de conversations traitées est atteinte; aucune nouvelle réponse automatique ne sera envoyée.");
    }
    processed.push({
      conversationId,
      status: "sending",
      at: new Date(now()).toISOString()
    });
    account.autoReply.processedConversations = processed;
    accountStore.update(account);
    return true;
  }

  function finishAutoReplyConversation(accountId, conversationId, status) {
    if (!["sent", "failed", "skipped"].includes(status)) {
      throw new Error("État de réponse automatique invalide.");
    }
    const account = requireAccount(accountId);
    const entry = account.autoReply?.processedConversations
      ?.find((item) => item.conversationId === conversationId);
    if (!entry) throw new Error("La tentative de réponse automatique n'existe plus.");
    entry.status = status;
    entry.completedAt = new Date(now()).toISOString();
    accountStore.update(account);
  }

  function advanceAutoReplyCursor(accountId, checkedAt) {
    if (!Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > now() + 60000) {
      throw new Error("Curseur de vérification e-mail invalide.");
    }
    const account = requireAccount(accountId);
    if (!account.autoReply?.enabled) return;
    account.autoReply.lastCheckedAt = Math.max(account.autoReply.lastCheckedAt || 0, checkedAt);
    accountStore.update(account);
  }

  async function searchMessages(accountId, rawQuery) {
    if (typeof rawQuery !== "string" || rawQuery.length > MAX_SEARCH_LENGTH) {
      throw new Error(`La recherche est limitée à ${MAX_SEARCH_LENGTH} caractères.`);
    }
    const account = requireAccount(accountId);
    const query = rawQuery.trim();
    if (account.provider === "gmail") {
      const url = new URL(`${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages`);
      url.searchParams.set("q", query || "in:inbox newer_than:30d");
      url.searchParams.set("maxResults", "8");
      const result = await requestAccountApi(account, url);
      const messages = await Promise.all((result.messages || []).slice(0, 8).map(async (item) => {
        const detailUrl = new URL(
          `${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages/${encodeURIComponent(item.id)}`
        );
        detailUrl.searchParams.set("format", "metadata");
        for (const header of ["Subject", "From", "Date"]) {
          detailUrl.searchParams.append("metadataHeaders", header);
        }
        const detail = await requestAccountApi(account, detailUrl);
        return parseGoogleMetadata(detail);
      }));
      recordAudit(
        "mail.search",
        "Recherche e-mail",
        `${account.email} · « ${query || "boîte de réception récente"} » · ${messages.length} résultat(s).`
      );
      return messages;
    }

    const url = new URL(`${OAUTH_PROVIDERS.outlook.apiBase}/me/messages`);
    url.searchParams.set("$select", "id,subject,from,receivedDateTime,bodyPreview");
    url.searchParams.set("$top", "8");
    const headers = {};
    if (query) {
      url.searchParams.set("$search", `"${query.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`);
      headers.ConsistencyLevel = "eventual";
    } else {
      url.searchParams.set("$orderby", "receivedDateTime desc");
    }
    const result = await requestAccountApi(account, url, { headers });
    const messages = (result.value || []).map(parseMicrosoftMessage);
    recordAudit(
      "mail.search",
      "Recherche e-mail",
      `${account.email} · « ${query || "messages récents"} » · ${messages.length} résultat(s).`
    );
    return messages;
  }

  async function getMessage(accountId, messageId) {
    if (typeof messageId !== "string" || messageId.length > 1000) {
      throw new Error("Message e-mail invalide.");
    }
    const account = requireAccount(accountId);
    if (account.provider === "gmail") {
      const detail = await requestAccountApi(
        account,
        `${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages/${encodeURIComponent(messageId)}?format=full`
      );
      const message = parseGoogleMessage(detail);
      recordAudit("mail.read", "E-mail consulté", `${account.email} · ${message.from} · ${message.subject}.`);
      return message;
    }
    const detail = await requestAccountApi(
      account,
      `${OAUTH_PROVIDERS.outlook.apiBase}/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,body,internetMessageHeaders`
    );
    const message = parseMicrosoftMessage(detail);
    recordAudit("mail.read", "E-mail consulté", `${account.email} · ${message.from} · ${message.subject}.`);
    return message;
  }

  function createRawMessage(draft, email, replyHeaders = {}) {
    const encodedSubject = `=?UTF-8?B?${Buffer.from(draft.subject, "utf8").toString("base64")}?=`;
    const encodedBody = Buffer.from(draft.body, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
    const messageIds = (value) => (value.match(/<[^<>\s\r\n]+>/g) || []).slice(0, 20);
    const references = [
      ...messageIds(replyHeaders.references || ""),
      ...messageIds(replyHeaders.messageId || "")
    ].slice(-20);
    return [
      `To: ${draft.recipients.join(", ")}`,
      `From: ${email}`,
      `Subject: ${encodedSubject}`,
      ...(replyHeaders.messageId ? [`In-Reply-To: ${messageIds(replyHeaders.messageId).join(" ")}`] : []),
      ...(references.length ? [`References: ${references.join(" ")}`] : []),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody
    ].join("\r\n");
  }

  async function saveDraft(accountId, input) {
    const account = requireAccount(accountId);
    const draft = normalizeDraft(input);
    if (account.provider === "gmail") {
      await requestAccountApi(account, `${OAUTH_PROVIDERS.gmail.apiBase}/users/me/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { raw: Buffer.from(createRawMessage(draft, account.email)).toString("base64url") } })
      });
    } else {
      await requestAccountApi(account, `${OAUTH_PROVIDERS.outlook.apiBase}/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: draft.subject,
          body: { contentType: "Text", content: draft.body },
          toRecipients: draft.recipients.map((address) => ({ emailAddress: { address } }))
        })
      });
    }
    recordAudit(
      "mail.draft.saved",
      "Brouillon e-mail enregistré",
      `${account.email} · ${draft.recipients.join(", ")} · ${draft.subject}.`
    );
    return { saved: true };
  }

  function requireAuditStatusUpdate(auditEntry) {
    if (auditEntry && typeof updateAuditStatus !== "function") {
      throw new Error("Le journal chiffré ne peut pas suivre l'état de cet envoi.");
    }
  }

  async function sendWithProvider(account, draft, reply = null) {
    if (account.provider === "gmail") {
      const message = {
        raw: Buffer.from(createRawMessage(draft, account.email, reply || {})).toString("base64url")
      };
      if (reply?.threadId) message.threadId = reply.threadId;
      await requestAccountApi(account, `${OAUTH_PROVIDERS.gmail.apiBase}/users/me/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message)
      });
      return;
    }
    if (reply) {
      await requestAccountApi(
        account,
        `${OAUTH_PROVIDERS.outlook.apiBase}/me/messages/${encodeURIComponent(reply.providerMessageId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: draft.body })
        }
      );
      return;
    }
    await requestAccountApi(account, `${OAUTH_PROVIDERS.outlook.apiBase}/me/sendMail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: draft.subject,
          body: { contentType: "Text", content: draft.body },
          toRecipients: draft.recipients.map((address) => ({ emailAddress: { address } }))
        },
        saveToSentItems: true
      })
    });
  }

  async function sendAuditedEmail(account, draft, type, title, reply = null) {
    const email = {
      status: "sending",
      provider: account.provider,
      account: account.email,
      from: account.email,
      to: draft.recipients,
      subject: draft.subject,
      body: draft.body,
      automatic: Boolean(reply)
    };
    const auditEntry = recordAudit(type, title, `${account.email} · ${draft.recipients.join(", ")} · ${draft.subject}.`, {
      kind: reply ? "violet" : "cyan",
      email
    });
    requireAuditStatusUpdate(auditEntry);
    try {
      await sendWithProvider(account, draft, reply);
    } catch (error) {
      if (auditEntry) {
        try {
          updateAuditStatus(auditEntry.id, "uncertain", `${account.email} · Résultat de l'envoi incertain : ${error.message}`);
        } catch (auditError) {
          throw new AggregateError([error, auditError], "L'envoi a échoué et le journal n'a pas pu être actualisé.");
        }
      }
      throw error;
    }
    if (auditEntry) {
      try {
        updateAuditStatus(
          auditEntry.id,
          "sent",
          `${account.email} · ${draft.recipients.join(", ")} · ${draft.subject}.`
        );
      } catch (error) {
        const journalError = new Error(
          "Le fournisseur a accepté l'e-mail, mais le journal n'a pas pu confirmer son enregistrement."
        );
        journalError.emailMayHaveBeenSent = true;
        journalError.cause = error;
        throw journalError;
      }
    }
    return { sent: true };
  }

  async function sendMessage(accountId, input) {
    const account = requireAccount(accountId);
    const draft = normalizeDraft(input);
    if (typeof confirmSend !== "function" || !await confirmSend({
      from: account.email,
      recipients: draft.recipients,
      subject: draft.subject,
      bodyPreview: draft.body.slice(0, 600),
      bodyTruncated: draft.body.length > 600
    })) {
      recordAudit("mail.send.cancelled", "Envoi e-mail annulé", `${account.email} · confirmation refusée.`);
      return { sent: false };
    }
    return sendAuditedEmail(account, draft, "mail.email.sent", "E-mail prêt à être envoyé");
  }

  async function replyToMessage(accountId, messageId, body) {
    const account = requireAccount(accountId);
    const config = account.autoReply;
    if (!config?.enabled) throw new Error("La réponse automatique n'est plus activée.");
    const original = await getMessage(accountId, messageId);
    if (!original.fromAddress
      || !(config.approvedSenders || []).includes(original.fromAddress)
      || original.fromAddress === account.email.toLowerCase()
      || isAutomatedMessage(original)) {
      throw new Error("Le message ne respecte plus les règles de réponse automatique.");
    }
    const subject = /^re\s*:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
    const draft = normalizeDraft({
      to: original.fromAddress,
      subject,
      body
    });
    const currentAccount = requireAccount(accountId);
    if (!currentAccount.autoReply?.enabled
      || !(currentAccount.autoReply.approvedSenders || []).includes(original.fromAddress)) {
      throw new Error("Les règles de réponse automatique ont changé avant l'envoi.");
    }
    return sendAuditedEmail(currentAccount, draft, "mail.auto_reply.sent", "Réponse automatique envoyée", {
      messageId: original.id,
      threadId: original.threadId || original.conversationId || original.id,
      providerMessageId: original.id,
      messageId: original.messageIdHeader || "",
      references: original.references || ""
    });
  }

  return {
    getProviders,
    listAccounts: () => accountStore.list(),
    setClientId,
    connect,
    disconnect(accountId) {
      const account = requireAccount(accountId);
      accountStore.remove(accountId);
      recordAudit("mail.account.disconnected", "Compte e-mail déconnecté", account.email);
    },
    searchMessages,
    getMessage,
    saveDraft,
    sendMessage,
    getAutoReplyConfig,
    setAutoReplyConfig,
    listAutoReplyAccounts,
    getAutoReplyCandidates,
    claimAutoReplyConversation,
    finishAutoReplyConversation,
    advanceAutoReplyCursor,
    replyToMessage
  };
}

module.exports = {
  PROVIDERS,
  createEncryptedAccountStore,
  createMailIntegration,
  createPkcePair,
  decodeGooglePart,
  normalizeDraft,
  parseGoogleMessage,
  parseGoogleMetadata,
  parseMicrosoftMessage,
  stripHtml,
  validateClientId
};
