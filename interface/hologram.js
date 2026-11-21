(() => {
  const canvas = document.getElementById("holo-canvas");
  const stage = document.getElementById("holo-stage");
  if (!canvas || !stage) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const engineState = document.getElementById("holo-engine-state");
  const engineDetail = document.getElementById("holo-engine-detail");
  const agentReady = document.getElementById("holo-agent-ready");
  const selectedAgent = document.getElementById("holo-selected-agent");
  const selectedRole = document.getElementById("holo-selected-role");
  const modelName = document.getElementById("holo-model-name");
  const routeStatus = document.getElementById("holo-route-status");
  const tooltip = document.getElementById("holo-tooltip");
  const pauseButton = document.getElementById("holo-pause");
  const resetButton = document.getElementById("holo-reset");
  const pulseButton = document.getElementById("holo-pulse");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const secretHint = document.getElementById("holo-secret-hint");
  const secretSequence = ["overlord", "archive", "oracle", "pixel"];
  const sequenceApi = window.aegisConstellationSequence;
  if (!sequenceApi) throw new Error("Le module de séquence secrète est absent.");

  const state = {
    width: 0,
    height: 0,
    yaw: -0.5,
    pitch: 0.13,
    dragging: false,
    dragDistance: 0,
    lastX: 0,
    lastY: 0,
    paused: reducedMotion.matches,
    pulseUntil: 0,
    agents: [],
    visibleNodes: [],
    hoveredAgentId: null,
    selectedAgentId: "overlord",
    activity: "idle",
    inViewport: true,
    secretProgress: 0,
    constellationUnlocked: false,
    engineReady: false,
    serverPresent: false,
    modelPresent: false,
    currentModel: "",
    stars: [],
    onSelectAgent: null,
    animationFrameId: 0,
    lastAnimationTime: 0
  };

  function makeStars() {
    const seed = 7242026;
    let value = seed;
    const random = () => {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
    const count = Math.max(50, Math.round(state.width * state.height / 6000));
    state.stars = Array.from({ length: count }, () => ({
      x: random(),
      y: random(),
      size: .35 + random() * 1.15,
      phase: random() * Math.PI * 2,
      alpha: .13 + random() * .42
    }));
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    state.width = bounds.width;
    state.height = bounds.height;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    makeStars();
    draw(performance.now());
  }

  function project(point, centerX, centerY, radius) {
    const cosYaw = Math.cos(state.yaw);
    const sinYaw = Math.sin(state.yaw);
    const cosPitch = Math.cos(state.pitch);
    const sinPitch = Math.sin(state.pitch);
    const rotatedX = point.x * cosYaw + point.z * sinYaw;
    const rotatedZ = point.z * cosYaw - point.x * sinYaw;
    const rotatedY = point.y * cosPitch - rotatedZ * sinPitch;
    const depth = point.y * sinPitch + rotatedZ * cosPitch;
    return {
      x: centerX + rotatedX * radius,
      y: centerY - rotatedY * radius,
      z: depth
    };
  }

  function drawVisibleLine(points, front, color, lineWidth, dash = []) {
    context.beginPath();
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.setLineDash(dash);
    let drawing = false;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const visible = front ? point.z >= -.015 : point.z < -.015;
      if (visible) {
        if (!drawing) {
          context.moveTo(point.x, point.y);
          drawing = true;
        } else {
          context.lineTo(point.x, point.y);
        }
      } else {
        drawing = false;
      }
    }
    context.stroke();
    context.setLineDash([]);
  }

  function unitPoint(latitude, longitude) {
    const cosLatitude = Math.cos(latitude);
    return {
      x: cosLatitude * Math.sin(longitude),
      y: Math.sin(latitude),
      z: cosLatitude * Math.cos(longitude)
    };
  }

  function drawOrbitalRing(centerX, centerY, radius, time, phase, color, width) {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(phase + time * .000035);
    context.beginPath();
    context.ellipse(0, 0, radius * 1.43, radius * .37, -.11, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.stroke();
    context.beginPath();
    context.ellipse(0, 0, radius * 1.48, radius * .4, -.11, Math.PI * .07, Math.PI * .23);
    context.strokeStyle = "rgba(162,244,255,.9)";
    context.lineWidth = width * .8;
    context.stroke();
    context.restore();
  }

  function buildAgentNodes(centerX, centerY, radius) {
    const agents = state.agents.length ? state.agents : [{ id: "overlord", name: "OVERLORD", enabled: true }];
    const count = agents.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    return agents.map((agent, index) => {
      const y = 1 - (2 * (index + .5)) / count;
      const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * goldenAngle;
      return {
        agent,
        ...project({
          x: Math.cos(angle) * ringRadius,
          y,
          z: Math.sin(angle) * ringRadius
        }, centerX, centerY, radius * .91)
      };
    });
  }

  function draw(time) {
    if (!state.width || !state.height) return;
    const { width, height } = state;
    const centerX = width * .5;
    const centerY = height * .465;
    const radius = Math.min(width * .218, height * .405, 205);
    const transientPulse = Math.min(1, Math.max(0, (state.pulseUntil - time) / 950));
    const activityPulse = state.activity === "thinking"
      ? .18 + .12 * ((Math.sin(time * .008) + 1) / 2)
      : state.activity === "responding"
        ? .3 + .15 * ((Math.sin(time * .012) + 1) / 2)
        : 0;
    const pulse = Math.max(transientPulse, activityPulse);

    context.clearRect(0, 0, width, height);

    const ambient = context.createRadialGradient(centerX, centerY, radius * .3, centerX, centerY, radius * 1.8);
    ambient.addColorStop(0, `rgba(0,111,255,${.08 + pulse * .13})`);
    ambient.addColorStop(.52, "rgba(0,76,194,.08)");
    ambient.addColorStop(1, "rgba(0,25,74,0)");
    context.fillStyle = ambient;
    context.fillRect(0, 0, width, height);

    for (const star of state.stars) {
      const twinkle = .7 + .3 * Math.sin(time * .001 + star.phase);
      context.globalAlpha = star.alpha * twinkle;
      context.fillStyle = "#70dfff";
      context.beginPath();
      context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    drawOrbitalRing(centerX, centerY, radius, time, -.24, "rgba(15,159,255,.66)", 1.25);
    drawOrbitalRing(centerX, centerY, radius, time, .68, "rgba(59,95,255,.58)", .9);

    const aura = context.createRadialGradient(centerX, centerY, radius * .7, centerX, centerY, radius * 1.18);
    aura.addColorStop(0, "rgba(18,166,255,0)");
    aura.addColorStop(.78, `rgba(12,157,255,${.14 + pulse * .22})`);
    aura.addColorStop(.91, `rgba(89,238,255,${.31 + pulse * .35})`);
    aura.addColorStop(1, "rgba(32,121,255,0)");
    context.fillStyle = aura;
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.18, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();

    const globe = context.createRadialGradient(
      centerX - radius * .36,
      centerY - radius * .44,
      radius * .06,
      centerX + radius * .12,
      centerY + radius * .1,
      radius * 1.2
    );
    globe.addColorStop(0, "rgba(11,84,171,.2)");
    globe.addColorStop(.45, "rgba(2,34,90,.5)");
    globe.addColorStop(1, "rgba(1,8,31,.92)");
    context.fillStyle = globe;
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

    const meridianSteps = 70;
    const parallelSteps = 100;
    for (let index = -3; index <= 3; index += 1) {
      const latitude = (index * Math.PI) / 8;
      const points = [];
      for (let step = 0; step <= parallelSteps; step += 1) {
        points.push(project(unitPoint(latitude, (step / parallelSteps) * Math.PI * 2), centerX, centerY, radius));
      }
      drawVisibleLine(points, false, "rgba(50,142,255,.13)", .75, [2, 5]);
      drawVisibleLine(points, true, "rgba(66,192,255,.42)", .85);
    }
    for (let index = 0; index < 12; index += 1) {
      const longitude = (index * Math.PI) / 12;
      const points = [];
      for (let step = 0; step <= meridianSteps; step += 1) {
        points.push(project(unitPoint(-Math.PI / 2 + (step / meridianSteps) * Math.PI, longitude), centerX, centerY, radius));
      }
      drawVisibleLine(points, false, "rgba(54,130,255,.12)", .7, [2, 5]);
      drawVisibleLine(points, true, "rgba(63,189,255,.36)", .8);
    }

    state.visibleNodes = buildAgentNodes(centerX, centerY, radius);
    const frontNodes = state.visibleNodes.filter((node) => node.z > .02);
    if (state.constellationUnlocked) {
      const nodesById = new Map(state.visibleNodes.map((node) => [node.agent.id, node]));
      const constellationNodes = secretSequence
        .map((id) => nodesById.get(id))
        .filter(Boolean);
      if (constellationNodes.length > 1) {
        context.save();
        context.beginPath();
        constellationNodes.forEach((node, index) => {
          if (index === 0) context.moveTo(node.x, node.y);
          else context.lineTo(node.x, node.y);
        });
        context.strokeStyle = "rgba(198,166,255,.88)";
        context.lineWidth = 2;
        context.shadowColor = "#b891ff";
        context.shadowBlur = 18;
        context.setLineDash([5, 5]);
        context.stroke();
        context.setLineDash([]);
        context.restore();
      }
    }
    context.lineWidth = .65;
    for (let index = 0; index < frontNodes.length; index += 1) {
      const node = frontNodes[index];
      const neighbors = frontNodes
        .filter((other) => other !== node && Math.hypot(other.x - node.x, other.y - node.y) < radius * .48)
        .slice(0, 3);
      for (const neighbor of neighbors) {
        context.beginPath();
        context.moveTo(node.x, node.y);
        context.lineTo(neighbor.x, neighbor.y);
        context.strokeStyle = `rgba(44,168,255,${.12 + Math.max(node.z, neighbor.z) * .17})`;
        context.stroke();
      }
    }

    for (const node of state.visibleNodes) {
      const isSelected = node.agent.id === state.selectedAgentId;
      const isHovered = node.agent.id === state.hoveredAgentId;
      const dotRadius = isHovered ? 4.5 : isSelected ? 3.8 : 2 + Math.max(0, node.z) * 1.2;
      const isConstellationNode = state.constellationUnlocked
        && secretSequence.includes(node.agent.id);
      if (node.z <= .02) {
        context.beginPath();
        context.arc(node.x, node.y, 1.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(62,157,255,.23)";
        context.fill();
        continue;
      }
      context.beginPath();
      context.arc(node.x, node.y, dotRadius + (isConstellationNode ? 8 : isSelected ? 5 : isHovered ? 4 : 0), 0, Math.PI * 2);
      context.strokeStyle = isConstellationNode
        ? "rgba(213,190,255,.95)"
        : isSelected ? "rgba(124,239,255,.72)" : "rgba(63,190,255,.34)";
      context.lineWidth = .8;
      context.stroke();
      context.beginPath();
      context.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
      context.fillStyle = isConstellationNode ? "#e5d6ff" : isSelected || isHovered ? "#d9ffff" : "#4bc8ff";
      context.shadowColor = isConstellationNode ? "#b891ff" : "#1cbeff";
      context.shadowBlur = isConstellationNode ? 20 : isSelected || isHovered ? 15 : 8;
      context.fill();
      context.shadowBlur = 0;
    }

    const shine = context.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    shine.addColorStop(0, "rgba(113,225,255,.1)");
    shine.addColorStop(.27, "rgba(32,121,255,0)");
    shine.addColorStop(.7, "rgba(1,8,30,.08)");
    shine.addColorStop(1, "rgba(0,4,20,.36)");
    context.fillStyle = shine;
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    context.restore();

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(107,230,255,${.78 + pulse * .22})`;
    context.lineWidth = 1.5 + pulse * 1.8;
    context.shadowColor = "#17aeff";
    context.shadowBlur = 22 + pulse * 35;
    context.stroke();
    context.shadowBlur = 0;

    drawOrbitalRing(centerX, centerY, radius, time, .2, "rgba(31,218,255,.9)", 1.8);
    const beam = context.createLinearGradient(centerX, centerY - radius * 1.45, centerX, centerY + radius * .7);
    beam.addColorStop(0, "rgba(27,148,255,0)");
    beam.addColorStop(.48, `rgba(55,195,255,${.055 + pulse * .1})`);
    beam.addColorStop(1, "rgba(27,148,255,0)");
    context.fillStyle = beam;
    context.fillRect(centerX - radius * 1.35, centerY - radius * 1.45, radius * 2.7, radius * 2.15);
  }

  function animate(time) {
    state.animationFrameId = 0;
    if (state.paused || reducedMotion.matches) return;
    const elapsed = state.lastAnimationTime
      ? Math.min(time - state.lastAnimationTime, 50)
      : 1000 / 60;
    const activitySpeed = state.activity === "thinking"
      ? 1.8
      : state.activity === "responding"
        ? 1.35
        : 1;
    if (!state.dragging) state.yaw += .0013 * (elapsed / (1000 / 60)) * activitySpeed;
    state.lastAnimationTime = time;
    draw(time);
    state.animationFrameId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (!state.paused && state.inViewport && !document.hidden
      && !reducedMotion.matches && !state.animationFrameId) {
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function stopAnimation() {
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
    state.lastAnimationTime = 0;
  }

  function renderOnce() {
    draw(performance.now());
  }

  function updateAgentReadout(agent) {
    if (!agent) return;
    selectedAgent.textContent = agent.name;
    selectedRole.textContent = agent.id === "overlord" ? "Assistant central" : agent.role;
    modelName.textContent = agent.modelPresent
      ? agent.modelPath?.split(/[\\/]/).pop() || state.currentModel || "Modèle installé"
      : "Aucun modèle associé";
    routeStatus.textContent = agent.id === "overlord" ? "Routage automatique" : "Agent sélectionné";
  }

  function setPaused(paused) {
    state.paused = paused;
    stage.classList.toggle("is-paused", paused);
    pauseButton.textContent = paused ? "Reprendre" : "Pause";
    if (paused) {
      stopAnimation();
      renderOnce();
    } else {
      startAnimation();
    }
  }

  function pulse() {
    state.pulseUntil = performance.now() + 950;
    stage.classList.remove("is-pulsing");
    void stage.offsetWidth;
    stage.classList.add("is-pulsing");
    setTimeout(() => stage.classList.remove("is-pulsing"), 520);
    renderOnce();
  }

  function setActivity(activity, agentId) {
    const labels = {
      idle: "EN ATTENTE",
      thinking: "ANALYSE EN COURS",
      responding: "RÉPONSE EN DIRECT",
      error: "ERREUR MOTEUR"
    };
    if (!Object.hasOwn(labels, activity)) {
      throw new Error(`État de sphère inconnu : ${activity}`);
    }
    state.activity = activity;
    stage.dataset.activity = activity;
    document.getElementById("holo-activity-label").textContent = labels[activity];
    if (agentId) {
      const agent = state.agents.find((item) => item.id === agentId && item.enabled);
      if (agent) {
        state.selectedAgentId = agent.id;
        updateAgentReadout(agent);
      }
    }
    if (activity === "idle") renderOnce();
    else pulse();
  }

  function findNode(x, y) {
    let nearest = null;
    let nearestDistance = 15;
    for (const node of state.visibleNodes) {
      if (node.z <= .02 || !node.agent.enabled) continue;
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function updateHover(x, y) {
    const node = findNode(x, y);
    state.hoveredAgentId = node?.agent.id || null;
    canvas.style.cursor = node ? "pointer" : state.dragging ? "grabbing" : "grab";
    if (!node) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = `${node.agent.name} · ${node.agent.role}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(10, Math.min(state.width - 210, x + 12))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(state.height - 44, y + 12))}px`;
  }

  function chooseNode(node) {
    if (!node) {
      pulse();
      return;
    }
    if (!state.constellationUnlocked) {
      const activeSequence = secretSequence.filter((id) =>
        state.agents.some((agent) => agent.id === id && agent.enabled)
      );
      if (activeSequence.length === secretSequence.length) {
        if (state.secretProgress >= activeSequence.length) state.secretProgress = 0;
        const progressState = sequenceApi.advanceSequence(
          activeSequence,
          state.secretProgress,
          node.agent.id
        );
        state.secretProgress = progressState.progress;
        if (progressState.unlocked) {
          state.constellationUnlocked = true;
          stage.classList.add("is-constellation");
          secretHint.textContent = "CONSTELLATION RÉVÉLÉE · le réseau caché est actif";
          setActivity("idle");
          pulse();
        } else if (state.secretProgress > 0) {
          secretHint.textContent = `Le signal répond… ${state.secretProgress}/${activeSequence.length}`;
        } else {
          secretHint.textContent = "Indice : cœur → mémoire → vision → lumière";
        }
      } else {
        secretHint.textContent = "Active OVERLORD, ARCHIVE, ORACLE et PIXEL pour révéler la constellation.";
      }
    }
    state.selectedAgentId = node.agent.id;
    updateAgentReadout(node.agent);
    if (typeof state.onSelectAgent === "function") state.onSelectAgent(node.agent.id);
    renderOnce();
  }

  canvas.addEventListener("pointerdown", (event) => {
    const bounds = canvas.getBoundingClientRect();
    state.dragging = true;
    state.dragDistance = 0;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.pointerX = String(event.clientX - bounds.left);
    canvas.dataset.pointerY = String(event.clientY - bounds.top);
    tooltip.hidden = true;
  });

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (state.dragging) {
      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;
      state.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      state.yaw += deltaX * .008;
      state.pitch = Math.max(-1.05, Math.min(1.05, state.pitch + deltaY * .006));
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      renderOnce();
      return;
    }
    updateHover(x, y);
    renderOnce();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!state.dragging) return;
    state.dragging = false;
    if (state.dragDistance < 7) {
      const x = Number(canvas.dataset.pointerX);
      const y = Number(canvas.dataset.pointerY);
      chooseNode(findNode(x, y));
    }
    startAnimation();
  });

  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
    startAnimation();
  });

  canvas.addEventListener("pointerleave", () => {
    if (!state.dragging) {
      state.hoveredAgentId = null;
      tooltip.hidden = true;
      renderOnce();
    }
  });

  canvas.addEventListener("keydown", (event) => {
    const rotationStep = .12;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      state.yaw += event.key === "ArrowLeft" ? -rotationStep : rotationStep;
      renderOnce();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      state.pitch = Math.max(-1.05, Math.min(1.05, state.pitch + (event.key === "ArrowUp" ? -rotationStep : rotationStep)));
      renderOnce();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pulse();
    } else if (event.key === "Home") {
      event.preventDefault();
      state.yaw = -.5;
      state.pitch = .13;
      renderOnce();
    }
  });

  pauseButton.addEventListener("click", () => setPaused(!state.paused));
  resetButton.addEventListener("click", () => {
    state.yaw = -.5;
    state.pitch = .13;
    setPaused(false);
    renderOnce();
  });
  pulseButton.addEventListener("click", pulse);

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    state.inViewport = entry.isIntersecting;
    if (state.inViewport) startAnimation();
    else stopAnimation();
  });
  visibilityObserver.observe(stage);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });
  reducedMotion.addEventListener("change", (event) => setPaused(event.matches));

  window.aegisHologram = {
    setAgents(agents) {
      state.agents = agents.filter((agent) => agent.enabled);
      const readyCount = agents.filter((agent) => agent.modelPresent).length;
      agentReady.textContent = `${readyCount} / ${agents.length}`;
      if (!state.agents.some((agent) => agent.id === state.selectedAgentId)) {
        state.selectedAgentId = "overlord";
      }
      updateAgentReadout(state.agents.find((agent) => agent.id === state.selectedAgentId));
      renderOnce();
    },
    setActiveAgent(agent) {
      if (!agent) return;
      state.selectedAgentId = agent.id;
      updateAgentReadout(agent);
      renderOnce();
    },
    setActivity,
    setEngineStatus(status) {
      state.engineReady = status.engineReady;
      state.serverPresent = status.serverPresent;
      state.modelPresent = status.modelPresent;
      state.currentModel = status.modelName || "";
      const installed = state.serverPresent && state.modelPresent;
      engineState.textContent = state.engineReady ? "ACTIF" : installed ? "EN ATTENTE" : "À CONFIGURER";
      engineDetail.textContent = state.engineReady
        ? "Moteur prêt à répondre"
        : status.serverConfigurationWarning && !installed
          ? "Sélectionne llama-server.exe dans Paramètres"
          : installed
            ? status.serverConfigurationWarning ? "Moteur de secours utilisé" : "Démarrage à la demande"
            : "Moteur ou modèle manquant";
      if (state.selectedAgentId === "overlord") {
        modelName.textContent = state.currentModel || "En attente";
        routeStatus.textContent = "Routage automatique";
      }
      renderOnce();
    },
    onSelectAgent(callback) {
      state.onSelectAgent = callback;
    }
  };

  resize();
  startAnimation();
})();
