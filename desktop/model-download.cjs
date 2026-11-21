const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

function getModelUrl(model) {
  const file = encodeURIComponent(model.file);
  return `https://huggingface.co/${model.repository}/resolve/${model.revision}/${file}?download=true`;
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadModel(model, destination, options = {}) {
  const {
    signal,
    onProgress = () => {},
    fetchImpl = fetch,
    sourceUrl = getModelUrl(model)
  } = options;
  if (!Number.isSafeInteger(model.size) || model.size <= 0) {
    throw new Error(`Taille de modèle invalide pour ${model.agentId}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(model.sha256)) {
    throw new Error(`Empreinte SHA-256 invalide pour ${model.agentId}.`);
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    const existing = await fsp.stat(destination);
    if (existing.isFile() && existing.size === model.size) {
      if ((await hashFile(destination)).toLowerCase() === model.sha256.toLowerCase()) {
        onProgress({ bytesDownloaded: model.size, totalBytes: model.size, complete: true, skipped: true });
        return { destination, skipped: true };
      }
    }
    await fsp.rm(destination, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const partialPath = `${destination}.part`;
  let offset = 0;
  try {
    const partial = await fsp.stat(partialPath);
    if (partial.isFile() && partial.size <= model.size) offset = partial.size;
    else await fsp.rm(partialPath, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (offset === model.size) {
    if ((await hashFile(partialPath)).toLowerCase() === model.sha256.toLowerCase()) {
      await fsp.rm(destination, { force: true });
      await fsp.rename(partialPath, destination);
      onProgress({ bytesDownloaded: model.size, totalBytes: model.size, complete: true, skipped: true });
      return { destination, skipped: true };
    }
    await fsp.rm(partialPath, { force: true });
    offset = 0;
  }

  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {};
  const response = await fetchImpl(sourceUrl, { headers, signal });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Téléchargement de ${model.agentId} refusé (HTTP ${response.status}).`);
  }
  if (!response.body) {
    throw new Error(`Réponse de téléchargement vide pour ${model.agentId}.`);
  }

  let append = false;
  if (response.status === 206) {
    const range = response.headers.get("content-range");
    const match = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (!match || Number(match[1]) !== offset || Number(match[3]) !== model.size) {
      throw new Error(`Plage de reprise invalide pour ${model.agentId}.`);
    }
    append = offset > 0;
  } else {
    offset = 0;
  }

  let received = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      onProgress({ bytesDownloaded: offset + received, totalBytes: model.size, complete: false });
      callback(null, chunk);
    }
  });
  await pipeline(
    Readable.fromWeb(response.body),
    progress,
    fs.createWriteStream(partialPath, { flags: append ? "a" : "w" }),
    { signal }
  );

  const downloaded = await fsp.stat(partialPath);
  if (downloaded.size !== model.size) {
    throw new Error(`Téléchargement incomplet pour ${model.agentId} (${downloaded.size}/${model.size} octets).`);
  }
  const digest = await hashFile(partialPath);
  if (digest.toLowerCase() !== model.sha256.toLowerCase()) {
    await fsp.rm(partialPath, { force: true });
    throw new Error(`La vérification SHA-256 a échoué pour ${model.agentId}. Le fichier a été supprimé.`);
  }

  await fsp.rm(destination, { force: true });
  await fsp.rename(partialPath, destination);
  onProgress({ bytesDownloaded: model.size, totalBytes: model.size, complete: true, skipped: false });
  return { destination, skipped: false };
}

module.exports = { downloadModel, getModelUrl };
