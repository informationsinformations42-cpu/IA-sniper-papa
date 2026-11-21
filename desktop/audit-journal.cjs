const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_EVENTS = 20000;

function createAuditJournal({ filePath, safeStorage, fsImpl = fs, now = () => Date.now() }) {
  function ensureEncryption() {
    const backend = safeStorage?.getSelectedStorageBackend?.();
    if (!safeStorage || !safeStorage.isEncryptionAvailable() || backend === "basic_text") {
      throw new Error("Le coffre chiffré du système n'est pas disponible pour le journal.");
    }
  }

  function encode(event) {
    ensureEncryption();
    return safeStorage.encryptString(JSON.stringify(event)).toString("base64");
  }

  function decode(line) {
    try {
      const event = JSON.parse(safeStorage.decryptString(Buffer.from(line, "base64")));
      if (!event || typeof event.id !== "string" || typeof event.at !== "string"
        || !Number.isFinite(Date.parse(event.at)) || typeof event.type !== "string") {
        throw new Error("format invalide");
      }
      return event;
    } catch (error) {
      throw new Error(`Une entrée du journal chiffré est illisible : ${error.message}`);
    }
  }

  function write(events) {
    ensureEncryption();
    const content = events.map(encode).join("\n");
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_FILE_BYTES || events.length > MAX_EVENTS) {
      throw new Error("Le journal chiffré a atteint sa limite; archive ou supprime des entrées avant de continuer.");
    }
    const directory = path.dirname(filePath);
    fsImpl.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      fsImpl.writeFileSync(temporaryPath, content ? `${content}\n` : "", { mode: 0o600 });
      fsImpl.renameSync(temporaryPath, filePath);
    } catch (error) {
      try {
        fsImpl.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          throw new Error(`Échec du journal et du nettoyage du fichier temporaire : ${cleanupError.message}`);
        }
      }
      throw new Error(`Impossible d'enregistrer le journal chiffré : ${error.message}`);
    }
  }

  function read() {
    let content;
    try {
      content = fsImpl.readFileSync(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new Error(`Impossible de lire le journal : ${error.message}`);
    }
    ensureEncryption();
    const nowMs = now();
    const events = content.split(/\r?\n/).filter(Boolean).map(decode);
    const retained = events.filter((event) => nowMs - Date.parse(event.at) < RETENTION_MS);
    if (retained.length !== events.length) write(retained);
    return retained;
  }

  function append(input) {
    if (!input || typeof input.type !== "string" || input.type.length > 80
      || typeof input.title !== "string" || input.title.length > 160
      || typeof input.detail !== "string" || input.detail.length > 2000) {
      throw new Error("Événement de journal invalide.");
    }
    const event = {
      id: crypto.randomUUID(),
      at: new Date(now()).toISOString(),
      type: input.type,
      title: input.title,
      detail: input.detail,
      kind: ["cyan", "violet", "amber"].includes(input.kind) ? input.kind : "cyan"
    };
    if (input.email !== undefined) {
      if (!input.email || typeof input.email !== "object"
        || JSON.stringify(input.email).length > 25000) {
        throw new Error("Détail d'e-mail invalide pour le journal.");
      }
      event.email = input.email;
    }
    const events = read();
    events.push(event);
    write(events);
    return event;
  }

  function updateEmailStatus(id, status, detail) {
    if (typeof id !== "string" || !["sending", "sent", "failed", "uncertain"].includes(status)
      || typeof detail !== "string" || detail.length > 2000) {
      throw new Error("Mise à jour de journal invalide.");
    }
    const events = read();
    const event = events.find((item) => item.id === id && item.email);
    if (!event) throw new Error("L'entrée d'envoi n'existe plus dans le journal.");
    event.email.status = status;
    event.title = status === "sent" ? "E-mail envoyé" : "Tentative d'envoi";
    event.detail = detail;
    write(events);
    return event;
  }

  return {
    append,
    updateEmailStatus,
    list: () => read().sort((left, right) => right.at.localeCompare(left.at)),
    listSentEmails: () => read()
      .filter((event) => event.email?.status === "sent")
      .sort((left, right) => right.at.localeCompare(left.at))
  };
}

module.exports = { createAuditJournal };
