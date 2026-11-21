const modelList = document.getElementById("model-list");
const overallProgress = document.getElementById("overall-progress");
const progressStatus = document.getElementById("progress-status");
const progressCount = document.getElementById("progress-count");
const progressDetail = document.getElementById("progress-detail");
const installerError = document.getElementById("installer-error");
const licenseAccepted = document.getElementById("license-accepted");
const downloadButton = document.getElementById("download-button");
const cancelButton = document.getElementById("cancel-button");
const finishButton = document.getElementById("finish-button");
const rowsByAgent = new Map();
let totalBytes = 0;
let modelCount = 0;
let isDownloading = false;
let installButtonLabel = "Vérifier et installer les modèles";

function formatBytes(bytes) {
  return `${(bytes / (1024 ** 3)).toFixed(1)} Go`;
}

function formatPercent(downloaded, total) {
  return total > 0 ? Math.min(100, Math.floor(100 * downloaded / total)) : 0;
}

function setDownloading(value) {
  isDownloading = value;
  downloadButton.hidden = false;
  downloadButton.disabled = value || !licenseAccepted.checked;
  downloadButton.textContent = value ? "Vérification / installation…" : installButtonLabel;
  cancelButton.hidden = !value;
  cancelButton.disabled = false;
  licenseAccepted.disabled = value;
}

function renderModels(models) {
  modelList.replaceChildren();
  rowsByAgent.clear();
  for (const model of models) {
    const row = document.createElement("li");
    row.className = `model-row${model.installed ? " installed" : ""}`;
    const dot = document.createElement("span");
    dot.className = "model-dot";
    const details = document.createElement("span");
    details.className = "model-details";
    const name = document.createElement("strong");
    name.className = "model-name";
    name.textContent = model.agentName;
    const file = document.createElement("small");
    file.className = "model-file";
    file.textContent = `${model.file} · ${formatBytes(model.size)} · ${model.installed ? "Présent · intégrité à vérifier" : "Manquant"}`;
    details.append(name, file);
    const source = document.createElement("button");
    source.type = "button";
    source.className = "model-source";
    source.textContent = "Licence";
    source.title = `Ouvrir la fiche de ${model.sourceRepository}`;
    source.addEventListener("click", async () => {
      try {
        await window.aegis.openModelSource(model.agentId);
      } catch (error) {
        installerError.textContent = `Impossible d’ouvrir la fiche du modèle : ${error.message}`;
      }
    });
    row.append(dot, details, source);
    modelList.append(row);
    rowsByAgent.set(model.agentId, { row, file, model });
  }
}

function updateModelProgress(progress) {
  const entry = rowsByAgent.get(progress.agentId);
  if (entry) {
    if (progress.state === "model-start") {
      entry.file.textContent = `${entry.model.file} · Vérification / téléchargement (${progress.index}/${progress.count})`;
      entry.row.classList.remove("installed");
    } else if (progress.state === "progress") {
      entry.file.textContent =
        `${entry.model.file} · ${formatBytes(progress.modelDownloaded)} / ${formatBytes(progress.modelTotal)}`;
    } else if (progress.state === "model-complete") {
      entry.file.textContent = `${entry.model.file} · ${formatBytes(entry.model.size)} · ${progress.reused ? "Réutilisé après vérification" : "Téléchargé et vérifié"}`;
      entry.row.classList.add("installed");
    }
  }
  if (Number.isFinite(progress.overallDownloaded)) {
    overallProgress.value = formatPercent(progress.overallDownloaded, progress.overallTotal || totalBytes);
    progressCount.textContent = `${formatBytes(progress.overallDownloaded)} / ${formatBytes(progress.overallTotal || totalBytes)}`;
  }
  if (progress.state === "model-start") {
    progressStatus.textContent = `${progress.agentName} — modèle ${progress.index} sur ${progress.count}`;
    progressDetail.textContent = "Vérification du fichier présent; téléchargement et reprise seulement si nécessaire.";
  }
}

async function initialize() {
  if (!window.aegis?.getModelInstallStatus) {
    throw new Error("Cette fenêtre d’installation doit être lancée par l’installateur AegisDesk Sniper.");
  }
  const status = await window.aegis.getModelInstallStatus();
  totalBytes = status.totalBytes;
  modelCount = status.models.length;
  document.getElementById("total-size").textContent =
    `${modelCount} modèles · ${formatBytes(totalBytes)} au total (${formatBytes(status.installedBytes)} déjà présents)`;
  renderModels(status.models);
  progressCount.textContent = `${formatBytes(status.installedBytes)} / ${formatBytes(totalBytes)}`;
  overallProgress.value = formatPercent(status.installedBytes, totalBytes);
  progressStatus.textContent = status.installedBytes === totalBytes
    ? "Les 17 modèles sont déjà installés."
    : "Prêt à vérifier les modèles et télécharger ceux qui manquent.";
  if (status.installedBytes === totalBytes) {
    progressStatus.textContent = "Les 17 fichiers modèles sont présents.";
    progressDetail.textContent = "Leur intégrité sera vérifiée avant réutilisation; seuls les fichiers absents ou invalides seront téléchargés.";
    installButtonLabel = "Vérifier et terminer";
  } else {
    installButtonLabel = status.installedBytes > 0
      ? "Vérifier et compléter l’installation"
      : "Télécharger les modèles manquants";
  }
  downloadButton.textContent = installButtonLabel;
}

licenseAccepted.addEventListener("change", () => {
  downloadButton.disabled = isDownloading || !licenseAccepted.checked;
});

downloadButton.addEventListener("click", async () => {
  if (!licenseAccepted.checked || isDownloading) return;
  installerError.textContent = "";
  finishButton.hidden = true;
  setDownloading(true);
  try {
    const status = await window.aegis.downloadModels(true);
    renderModels(status.models);
    overallProgress.value = 100;
    progressCount.textContent = `${formatBytes(status.totalBytes)} / ${formatBytes(status.totalBytes)}`;
    progressStatus.textContent = "Les 17 modèles sont installés et vérifiés.";
    progressDetail.textContent = "Chaque modèle vérifié est associé automatiquement à son agent; les fichiers déjà valides ont été réutilisés.";
    setDownloading(false);
    downloadButton.hidden = true;
    cancelButton.hidden = true;
    finishButton.hidden = false;
  } catch (error) {
    setDownloading(false);
    installerError.textContent = `Installation incomplète : ${error.message}`;
    progressStatus.textContent = "Tu peux relancer le téléchargement; les fichiers partiels sont conservés pour reprise.";
  }
});

cancelButton.addEventListener("click", async () => {
  cancelButton.disabled = true;
  progressStatus.textContent = "Arrêt du téléchargement…";
  await window.aegis.cancelModelDownload();
});

finishButton.addEventListener("click", () => window.aegis.finishModelInstall());

window.aegis?.onModelInstallProgress((progress) => {
  if (progress.state === "error") {
    installerError.textContent = `Installation incomplète : ${progress.message}`;
    return;
  }
  if (progress.state === "complete") {
    progressStatus.textContent = "Les 17 modèles sont installés et vérifiés.";
    return;
  }
  updateModelProgress(progress);
});

initialize().catch((error) => {
  installerError.textContent = error.message;
  downloadButton.disabled = true;
});
