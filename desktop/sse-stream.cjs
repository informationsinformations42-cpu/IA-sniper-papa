async function consumeSseStream(stream, onEvent) {
  if (!stream || typeof stream.getReader !== "function") {
    throw new TypeError("Le flux de réponse du moteur est absent ou invalide.");
  }
  if (typeof onEvent !== "function") {
    throw new TypeError("Un gestionnaire d’événement SSE est requis.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];

  async function emitEvent() {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    await onEvent(data);
  }

  async function processLine(line) {
    if (line === "") {
      await emitEvent();
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode();

      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() || "";
      for (const line of lines) await processLine(line);

      if (done) {
        if (buffer) await processLine(buffer);
        await emitEvent();
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

module.exports = { consumeSseStream };
