(function exposeConstellationSequence(root, factory) {
  const sequence = factory();
  if (typeof module === "object" && module.exports) module.exports = sequence;
  else root.aegisConstellationSequence = sequence;
})(globalThis, () => {
  function advanceSequence(sequence, progress, agentId) {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      throw new TypeError("La séquence secrète doit contenir au moins un agent.");
    }
    if (!Number.isInteger(progress) || progress < 0 || progress >= sequence.length) {
      throw new RangeError("Progression de séquence invalide.");
    }

    if (agentId === sequence[progress]) {
      const next = progress + 1;
      return { progress: next, unlocked: next === sequence.length };
    }
    return { progress: agentId === sequence[0] ? 1 : 0, unlocked: false };
  }

  return { advanceSequence };
});
