function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => (
    text === phrase
    || text.startsWith(`${phrase} `)
    || text.includes(` ${phrase} `)
    || text.endsWith(` ${phrase}`)
  ));
}

const CYBER_TOPICS = [
  "securite",
  "audit autorise",
  "audit de securite",
  "test de penetration",
  "cybersecurite",
  "cyber",
  "reseau",
  "wifi",
  "routeur",
  "pare feu",
  "antivirus",
  "proteger mon site",
  "securiser mon site",
  "proteger mon application",
  "securiser mon application",
  "mon compte",
  "mes comptes",
  "mot de passe",
  "proteger mon serveur",
  "securiser mon serveur",
  "mon pc",
  "mon ordinateur",
  "mon systeme",
  "windows",
  "linux",
  "vulnerabilite",
  "vulnerable",
  "exploit",
  "pirat",
  "hack",
  "attaque",
  "intrusion",
  "malware",
  "ransomware",
  "virus",
  "pare feu",
  "firewall",
  "menace",
  "phishing",
  "hameconnage"
];

const DEFENSIVE_INTENTS = [
  "defendre",
  "defensif",
  "defensive",
  "proteger",
  "protection",
  "securiser",
  "securisation",
  "prevention",
  "detecter",
  "detection",
  "surveiller",
  "surveillance",
  "analyser les journaux",
  "analyse les journaux",
  "analyse des journaux",
  "mes logs",
  "mon pc",
  "mon ordinateur",
  "mon reseau",
  "mon site",
  "mon application",
  "mon code",
  "dont j ai l autorisation",
  "autorise",
  "autorisee",
  "audit autorise",
  "test autorise",
  "laboratoire de test",
  "ctf"
];

const HIGH_RISK_CYBER_TOPICS = [
  "vulnerabilite",
  "vulnerable",
  "exploit",
  "pirat",
  "hack",
  "attaque",
  "intrusion",
  "malware",
  "ransomware",
  "virus",
  "menace",
  "phishing",
  "hameconnage"
];

function routeMessage(message) {
  if (typeof message !== "string" || !message.trim()) return null;
  const text = normalizeText(message);
  const hasCyberTopic = hasAny(text, CYBER_TOPICS);
  const hasDefensiveIntent = hasAny(text, DEFENSIVE_INTENTS);

  if (hasCyberTopic && !hasDefensiveIntent) {
    if (hasAny(text, HIGH_RISK_CYBER_TOPICS)) return null;
    if (hasAny(text, ["explique", "apprendre", "cours", "formation", "tutoriel", "apprentissage", "enseigne"])) {
      return { agentId: "academy", reason: "explication ou apprentissage général" };
    }
    return null;
  }

  if (hasCyberTopic) {
    if (hasAny(text, ["site web", "site internet", "application web", "api web", "mon site"])) {
      return { agentId: "webhawk", reason: "analyse défensive de site web" };
    }
    if (hasAny(text, ["reseau", "wifi", "routeur", "pare feu", "firewall"])) {
      return { agentId: "phantom", reason: "protection ou analyse défensive du réseau" };
    }
    if (hasAny(text, ["journal", "journaux", "logs", "incident", "menace", "malware", "virus", "suspicious", "suspect", "phishing", "hameconnage"])) {
      return { agentId: "hunter", reason: "analyse défensive de menaces ou de journaux" };
    }
    if (hasAny(text, ["mon pc", "mon ordinateur", "windows", "linux", "systeme", "pare feu", "antivirus"])) {
      return { agentId: "sentinel", reason: "protection du système" };
    }
    if (hasAny(text, ["application", "api", "code source", "logiciel"])) {
      return { agentId: "blackbox", reason: "analyse défensive d’application" };
    }
    if (hasAny(text, ["conseil", "conseils", "bonne pratique", "bonnes pratiques", "compte", "comptes", "mot de passe", "proteger"])) {
      return { agentId: "aegis", reason: "conseils de défense et de protection" };
    }
    if (hasAny(text, ["vulnerabilite", "pentest", "test de penetration", "audit autorise"])) {
      return { agentId: "breach", reason: "analyse de vulnérabilités explicitement autorisée" };
    }
    if (hasAny(text, ["audit", "analyse", "evaluer", "evaluation"])) {
      return { agentId: "sniper", reason: "analyse de sécurité défensive" };
    }
    return { agentId: "spectre", reason: "analyse défensive" };
  }

  if (hasAny(text, ["architecture logicielle", "architecture technique", "architecture de l application", "concevoir l architecture", "structure du logiciel"])) {
    return { agentId: "architect", reason: "conception d’architecture logicielle" };
  }
  if (hasAny(text, ["programmer", "programmation", "coder", "code", "script", "python", "javascript", "typescript", "fonction", "bug", "debug", "compiler", "developper", "developpement logiciel", "ecris un programme", "ecrire un programme"])) {
    return { agentId: "forge", reason: "programmation ou débogage" };
  }
  if (hasAny(text, ["expliquer", "explique moi", "apprendre", "cours", "formation", "tutoriel", "apprentissage", "enseigne"])) {
    return { agentId: "academy", reason: "explication ou apprentissage" };
  }
  if (hasAny(text, ["rapport", "resumer", "resume", "historique", "compte rendu", "documentation", "notes"])) {
    return { agentId: "archive", reason: "résumé, rapport ou documentation" };
  }
  if (hasAny(text, ["voix", "audio", "parler", "prononciation", "dictee", "transcription"])) {
    return { agentId: "echo", reason: "communication ou sujet vocal" };
  }
  if (hasAny(text, ["image", "logo", "couleur", "palette graphique", "composition visuelle", "design graphique", "illustration", "prompt visuel"])) {
    return { agentId: "pixel", reason: "conception visuelle ou graphique" };
  }
  if (hasAny(text, ["recherche", "rechercher", "comparer", "comparaison", "sources", "analyser ces informations"])) {
    return { agentId: "oracle", reason: "recherche ou analyse d’informations" };
  }

  return null;
}

module.exports = { routeMessage };
