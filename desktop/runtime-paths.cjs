const path = require("node:path");

function resolvePlatformPath(candidate, fallback, platform = process.platform) {
  const incompatible = typeof candidate === "string"
    && (platform === "win32"
      ? candidate.startsWith("/")
      : /^[A-Za-z]:[\\/]|^\\\\/.test(candidate));
  const selected = incompatible
    ? fallback
    : typeof candidate === "string" && candidate.length > 0
      ? candidate
      : fallback;
  return {
    path: typeof selected === "string" ? selected : "",
    incompatible
  };
}

function resolveExistingPath(candidate, fallback, platform, existsSync) {
  const resolved = resolvePlatformPath(candidate, fallback, platform);
  if (resolved.path && existsSync(resolved.path)) return resolved;
  if (fallback && existsSync(fallback)) {
    return { path: fallback, incompatible: resolved.incompatible };
  }
  return resolved;
}

function resolveServerPaths(candidate, fallback, platform, existsSync) {
  const invalidName = platform === "win32"
    && typeof candidate === "string"
    && candidate.length > 0
    && path.win32.basename(candidate).toLowerCase() !== "llama-server.exe";
  const resolution = resolveExistingPath(
    invalidName ? "" : candidate,
    fallback,
    platform,
    existsSync
  );
  const candidates = [resolution.path];
  if (fallback && fallback !== resolution.path && existsSync(fallback)) {
    candidates.push(fallback);
  }
  return { ...resolution, candidates, invalidName };
}

module.exports = {
  resolveExistingPath,
  resolvePlatformPath,
  resolveServerPaths
};
