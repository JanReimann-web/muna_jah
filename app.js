/*
Vanemale:
1. Ava "Admin", määra pealkiri ja lisa või muuda vihjeid.
2. Soovi korral lisa igale vihjele pilt ning vali, kas pilt kuvatakse ja kas vihje loetakse ette.
3. Vajuta "Salvesta" või "Alusta mängu algusest", et alustada lapsega munajahti.

PWA paigaldamine telefoni avakuvale:
1. Ava rakendus telefonis brauseris.
2. Vali brauseri menüüst "Add to Home Screen", "Lisa avaekraanile" või "Installi rakendus".
3. Pärast esmast avamist töötab rakendus ka võrguühenduseta.
*/

const STORAGE_KEY = "munajaht-pwa-data-v1";
const VOICE_CHECK_DELAY = 200;
const DEFAULT_TITLE = "Robini munajaht 🐰";

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

const defaultState = {
  huntTitle: DEFAULT_TITLE,
  steps: [
    {
      id: makeId(),
      title: "Esimene vihje",
      hintText: "Vaata sinna, kus vahel jalanõud puhkavad. 👟",
      imageDataUrl: "",
      showImage: false,
      autoSpeak: true
    },
    {
      id: makeId(),
      title: "Teine vihje",
      hintText: "Proovi otsida koha lähedalt, kus aknast õue vaadatakse. 🪟",
      imageDataUrl: "",
      showImage: false,
      autoSpeak: true
    },
    {
      id: makeId(),
      title: "Viimane vihje",
      hintText: "Viimane üllatus võib olla seal, kus midagi pehmet ja mõnusat ootab. 🛋️",
      imageDataUrl: "",
      showImage: false,
      autoSpeak: true
    }
  ],
  currentStepIndex: 0,
  isCompleted: false
};

const state = loadState();

const elements = {
  adminPanel: document.getElementById("adminPanel"),
  gamePanel: document.getElementById("gamePanel"),
  installButton: document.getElementById("installButton"),
  installHint: document.getElementById("installHint"),
  huntTitleInput: document.getElementById("huntTitleInput"),
  stepsList: document.getElementById("stepsList"),
  adminEmptyState: document.getElementById("adminEmptyState"),
  gameEmptyState: document.getElementById("gameEmptyState"),
  progressChip: document.getElementById("progressChip"),
  gameView: document.getElementById("gameView"),
  endScreen: document.getElementById("endScreen"),
  gameTitle: document.getElementById("gameTitle"),
  clueText: document.getElementById("clueText"),
  clueImageWrap: document.getElementById("clueImageWrap"),
  clueImage: document.getElementById("clueImage"),
  voiceStatus: document.getElementById("voiceStatus"),
  wakeLockStatus: document.getElementById("wakeLockStatus"),
  saveStatus: document.getElementById("saveStatus"),
  stepCardTemplate: document.getElementById("stepCardTemplate"),
  endTitle: document.querySelector("#endScreen h3"),
  endCopy: document.querySelector("#endScreen .end-copy")
};

let currentMode = "admin";
let estonianVoice = null;
let autoSpeakTimeoutId = null;
let deferredInstallPrompt = null;
let wakeLock = null;

initialize();

function initialize() {
  bindTopLevelEvents();
  bindInstallPrompt();
  bindSpeechVoices();
  bindWakeLockEvents();
  registerServiceWorker();
  render();
}

function loadState() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
      return cloneData(defaultState);
    }

    const parsed = JSON.parse(savedData);
    return sanitizeState(parsed);
  } catch (error) {
    console.error("Rakenduse andmete lugemine ebaõnnestus:", error);
    return cloneData(defaultState);
  }
}

function sanitizeState(rawState) {
  const safeState = {
    huntTitle: typeof rawState?.huntTitle === "string" && rawState.huntTitle.trim()
      ? rawState.huntTitle.trim()
      : DEFAULT_TITLE,
    steps: Array.isArray(rawState?.steps)
      ? rawState.steps.map(sanitizeStep).filter(Boolean)
      : [],
    currentStepIndex: Number.isInteger(rawState?.currentStepIndex) ? rawState.currentStepIndex : 0,
    isCompleted: Boolean(rawState?.isCompleted)
  };

  if (safeState.currentStepIndex < 0) {
    safeState.currentStepIndex = 0;
  }

  if (safeState.currentStepIndex >= safeState.steps.length && safeState.steps.length > 0) {
    safeState.currentStepIndex = safeState.steps.length - 1;
  }

  if (safeState.steps.length === 0) {
    safeState.currentStepIndex = 0;
    safeState.isCompleted = false;
  }

  return safeState;
}

function sanitizeStep(step, index = 0) {
  if (!step || typeof step !== "object") {
    return null;
  }

  return {
    id: typeof step.id === "string" && step.id ? step.id : `step-${Date.now()}-${index}`,
    title: typeof step.title === "string" ? step.title : "",
    hintText: typeof step.hintText === "string" ? step.hintText : "",
    imageDataUrl: typeof step.imageDataUrl === "string" ? step.imageDataUrl : "",
    showImage: Boolean(step.showImage),
    autoSpeak: Boolean(step.autoSpeak)
  };
}

function saveState(statusText = "Salvestatud 🌷") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSaveStatus(statusText);
}

function showSaveStatus(message) {
  elements.saveStatus.textContent = message;

  if (showSaveStatus.timeoutId) {
    window.clearTimeout(showSaveStatus.timeoutId);
  }

  showSaveStatus.timeoutId = window.setTimeout(() => {
    elements.saveStatus.textContent = "";
  }, 2200);
}

function bindTopLevelEvents() {
  document.querySelectorAll("[data-mode-switch]").forEach((button) => {
    button.addEventListener("click", () => switchMode(button.dataset.modeSwitch));
  });

  elements.huntTitleInput.addEventListener("input", (event) => {
    state.huntTitle = event.target.value.trimStart();
    saveState("Pealkiri salvestati ✨");
    renderGameView();
  });

  document.getElementById("addStepButton").addEventListener("click", addStep);
  document.getElementById("saveButton").addEventListener("click", () => saveState("Kõik muudatused salvestati 🥚"));
  document.getElementById("clearAllButton").addEventListener("click", clearAllData);
  document.getElementById("startGameButton").addEventListener("click", startGameFromBeginning);
  document.getElementById("speakButton").addEventListener("click", () => speakCurrentStep(true));
  document.getElementById("foundButton").addEventListener("click", advanceGame);
  document.getElementById("restartButton").addEventListener("click", startGameFromBeginning);
  document.getElementById("previousButton").addEventListener("click", goToPreviousStep);
  document.getElementById("playAgainButton").addEventListener("click", startGameFromBeginning);
  elements.installButton.addEventListener("click", installApp);

  elements.stepsList.addEventListener("input", handleStepInput);
  elements.stepsList.addEventListener("change", handleStepChange);
  elements.stepsList.addEventListener("click", handleStepActions);
}

function bindInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
    elements.installHint.textContent = "Rakendus on valmis paigaldamiseks sinu Androidi avaekraanile.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    elements.installHint.textContent = "Rakendus on paigaldatud. Ava see nüüd avaekraanilt.";
  });
}

function bindSpeechVoices() {
  updatePreferredVoice();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", updatePreferredVoice);
    window.setTimeout(updatePreferredVoice, VOICE_CHECK_DELAY);
  }
}

function updatePreferredVoice() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) {
    updateVoiceStatus();
    return;
  }

  const scoredVoices = voices
    .map((voice) => ({ voice, score: scoreVoice(voice) }))
    .sort((left, right) => right.score - left.score);

  estonianVoice = scoredVoices[0]?.voice || null;
  updateVoiceStatus();
}

function scoreVoice(voice) {
  const lang = voice.lang?.toLowerCase() || "";
  const name = voice.name?.toLowerCase() || "";
  let score = 0;

  if (lang === "et-ee") score += 100;
  if (lang.startsWith("et")) score += 90;
  if (name.includes("eston")) score += 80;
  if (name.includes("eesti")) score += 80;
  if (name.includes("google") && lang.startsWith("et")) score += 35;
  if (name.includes("samsung") && lang.startsWith("et")) score += 30;
  if (lang.startsWith("fi")) score += 10;
  if (voice.default) score += 5;

  return score;
}

function updateVoiceStatus() {
  if (!("speechSynthesis" in window)) {
    elements.voiceStatus.textContent = "🔇 Kõne: selles brauseris pole ettelugemine saadaval";
    return;
  }

  if (!estonianVoice) {
    elements.voiceStatus.textContent = "🔊 Kõne: eesti häält ei leitud, kasutan lähimat saadaval häält";
    return;
  }

  const lang = estonianVoice.lang || "";
  const isEstonian = lang.toLowerCase().startsWith("et");

  if (isEstonian) {
    elements.voiceStatus.textContent = `🔊 Kõne: eesti hääl valmis (${estonianVoice.name})`;
    return;
  }

  elements.voiceStatus.textContent = `🔊 Kõne: kasutan varuhäält (${estonianVoice.name})`;
}

function bindWakeLockEvents() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentMode === "game") {
      requestWakeLock();
    } else if (document.visibilityState !== "visible") {
      releaseWakeLock();
    }
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || currentMode !== "game") {
    elements.wakeLockStatus.hidden = true;
    return;
  }

  if (wakeLock) {
    elements.wakeLockStatus.hidden = false;
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    elements.wakeLockStatus.hidden = false;
    wakeLock.addEventListener("release", () => {
      elements.wakeLockStatus.hidden = true;
    });
  } catch (error) {
    elements.wakeLockStatus.hidden = true;
    console.warn("Wake lock ei õnnestunud:", error);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }

  try {
    await wakeLock.release();
  } catch (error) {
    console.warn("Wake lock vabastamine ebaõnnestus:", error);
  } finally {
    wakeLock = null;
    elements.wakeLockStatus.hidden = true;
  }
}

async function installApp() {
  if (!deferredInstallPrompt) {
    elements.installHint.textContent = "Kui nuppu ei ilmu, ava brauseri menüü ja vali „Lisa avaekraanile”.";
    return;
  }

  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;

  if (outcome === "accepted") {
    elements.installHint.textContent = "Paigaldus käivitatud. Otsi rakendust avaekraanilt.";
  } else {
    elements.installHint.textContent = "Paigaldus jäeti praegu vahele. Saad selle hiljem uuesti teha.";
  }

  deferredInstallPrompt = null;
  elements.installButton.hidden = true;
}

function switchMode(mode) {
  if (mode !== "admin" && mode !== "game") {
    return;
  }

  currentMode = mode;
  stopSpeaking();
  renderMode();

  if (mode === "game") {
    renderGameView();
    requestWakeLock();
    queueAutoSpeak();
  } else {
    releaseWakeLock();
  }
}

function render() {
  renderMode();
  renderAdmin();
  renderGameView();
}

function renderMode() {
  document.querySelectorAll("[data-mode-switch]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeSwitch === currentMode);
  });

  elements.adminPanel.classList.toggle("is-visible", currentMode === "admin");
  elements.gamePanel.classList.toggle("is-visible", currentMode === "game");
}

function renderAdmin() {
  elements.huntTitleInput.value = state.huntTitle;
  elements.stepsList.innerHTML = "";
  elements.adminEmptyState.hidden = state.steps.length !== 0;

  state.steps.forEach((step, index) => {
    const fragment = elements.stepCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".step-card");

    card.dataset.stepId = step.id;

    fragment.querySelector(".step-badge").textContent = `Vihje ${index + 1}`;
    fragment.querySelector(".step-heading").textContent = step.title.trim() || `Samm ${index + 1}`;

    const titleInput = fragment.querySelector(".step-title-input");
    titleInput.value = step.title;
    titleInput.dataset.field = "title";

    const hintInput = fragment.querySelector(".step-hint-input");
    hintInput.value = step.hintText;
    hintInput.dataset.field = "hintText";

    const fileInput = fragment.querySelector(".step-image-input");
    fileInput.dataset.field = "imageDataUrl";

    const previewWrap = fragment.querySelector(".image-preview-wrap");
    const previewImage = fragment.querySelector(".image-preview");

    if (step.imageDataUrl) {
      previewWrap.hidden = false;
      previewImage.src = step.imageDataUrl;
    } else {
      previewWrap.hidden = true;
      previewImage.removeAttribute("src");
    }

    const removeImageButton = fragment.querySelector(".remove-image-button");
    removeImageButton.hidden = !step.imageDataUrl;
    removeImageButton.dataset.action = "remove-image";

    const showImageInput = fragment.querySelector(".step-show-image-input");
    showImageInput.checked = step.showImage;
    showImageInput.dataset.field = "showImage";

    const autoSpeakInput = fragment.querySelector(".step-auto-speak-input");
    autoSpeakInput.checked = step.autoSpeak;
    autoSpeakInput.dataset.field = "autoSpeak";

    const moveUpButton = fragment.querySelector(".move-up-button");
    moveUpButton.dataset.action = "move-up";
    moveUpButton.disabled = index === 0;

    const moveDownButton = fragment.querySelector(".move-down-button");
    moveDownButton.dataset.action = "move-down";
    moveDownButton.disabled = index === state.steps.length - 1;

    const deleteButton = fragment.querySelector(".delete-step-button");
    deleteButton.dataset.action = "delete";

    elements.stepsList.appendChild(fragment);
  });
}

function renderGameView() {
  const hasSteps = state.steps.length > 0;
  const currentStep = hasSteps ? state.steps[state.currentStepIndex] : null;
  const isCompleted = hasSteps && state.isCompleted;

  elements.gameEmptyState.hidden = hasSteps;
  elements.gameView.hidden = !hasSteps || isCompleted;
  elements.endScreen.hidden = !isCompleted;

  if (!hasSteps) {
    return;
  }

  if (isCompleted) {
    elements.endTitle.textContent = "Tubli! Kõik munad on leitud! 🐰🥚🎉";
    elements.endCopy.textContent = `${state.huntTitle || DEFAULT_TITLE} on nüüd rõõmsalt lõpuni mängitud.`;
    return;
  }

  elements.progressChip.textContent = `Vihje ${state.currentStepIndex + 1} / ${state.steps.length}`;
  elements.gameTitle.textContent = state.huntTitle;
  elements.clueText.textContent = currentStep?.hintText.trim() || "Vihje ootab veel kirjutamist. 🌷";
  elements.clueImageWrap.hidden = !(currentStep?.showImage && currentStep.imageDataUrl);

  if (currentStep?.showImage && currentStep.imageDataUrl) {
    elements.clueImage.src = currentStep.imageDataUrl;
    elements.clueImage.alt = `Vihje pilt etapile ${state.currentStepIndex + 1}`;
  } else {
    elements.clueImage.removeAttribute("src");
    elements.clueImage.alt = "";
  }

  document.getElementById("previousButton").hidden = state.currentStepIndex === 0;
}

function handleStepInput(event) {
  const card = event.target.closest(".step-card");

  if (!card) {
    return;
  }

  const field = event.target.dataset.field;
  const step = state.steps.find((item) => item.id === card.dataset.stepId);

  if (!step || !field || field === "imageDataUrl") {
    return;
  }

  step[field] = event.target.value;

  if (field === "title") {
    const heading = card.querySelector(".step-heading");
    heading.textContent = step.title.trim() || "Nimetu vihje";
  }

  saveState("Muudatus salvestati 🌼");
  renderGameView();
}

function handleStepChange(event) {
  const card = event.target.closest(".step-card");

  if (!card) {
    return;
  }

  const field = event.target.dataset.field;
  const step = state.steps.find((item) => item.id === card.dataset.stepId);

  if (!step) {
    return;
  }

  if (field === "showImage" || field === "autoSpeak") {
    step[field] = event.target.checked;
    saveState("Valik salvestati 🐣");
    renderGameView();
    return;
  }

  if (field === "imageDataUrl") {
    const [file] = event.target.files || [];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.addEventListener("load", () => {
      step.imageDataUrl = typeof reader.result === "string" ? reader.result : "";
      saveState("Pilt salvestati 📷");
      renderAdmin();
      renderGameView();
    });

    reader.readAsDataURL(file);
  }
}

function handleStepActions(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".step-card");
  const stepId = card?.dataset.stepId;
  const stepIndex = state.steps.findIndex((step) => step.id === stepId);

  if (stepIndex === -1) {
    return;
  }

  const action = actionButton.dataset.action;

  if (action === "delete") {
    state.steps.splice(stepIndex, 1);
    normalizeCurrentStepIndex();
    saveState("Vihje kustutati");
  }

  if (action === "remove-image") {
    state.steps[stepIndex].imageDataUrl = "";
    state.steps[stepIndex].showImage = false;
    saveState("Pilt eemaldati");
  }

  if (action === "move-up" && stepIndex > 0) {
    [state.steps[stepIndex - 1], state.steps[stepIndex]] = [state.steps[stepIndex], state.steps[stepIndex - 1]];
    normalizeCurrentStepIndex();
    saveState("Vihje liigutati üles");
  }

  if (action === "move-down" && stepIndex < state.steps.length - 1) {
    [state.steps[stepIndex], state.steps[stepIndex + 1]] = [state.steps[stepIndex + 1], state.steps[stepIndex]];
    normalizeCurrentStepIndex();
    saveState("Vihje liigutati alla");
  }

  renderAdmin();
  renderGameView();
}

function addStep() {
  state.steps.push({
    id: makeId(),
    title: `Uus vihje ${state.steps.length + 1}`,
    hintText: "",
    imageDataUrl: "",
    showImage: false,
    autoSpeak: true
  });

  saveState("Uus vihje lisati 🐰");
  renderAdmin();
  renderGameView();
}

function clearAllData() {
  const shouldClear = window.confirm("Kas soovid kõik vihjed ja pealkirja tühjendada?");

  if (!shouldClear) {
    return;
  }

  state.huntTitle = DEFAULT_TITLE;
  state.steps = [];
  state.currentStepIndex = 0;
  state.isCompleted = false;
  stopSpeaking();
  saveState("Kõik andmed tühjendati");
  render();
}

function startGameFromBeginning() {
  state.currentStepIndex = 0;
  state.isCompleted = false;
  saveState("Mäng alustati algusest 🥚");
  switchMode("game");
  renderGameView();
}

function advanceGame() {
  if (!state.steps.length || state.isCompleted) {
    return;
  }

  stopSpeaking();

  if (state.currentStepIndex >= state.steps.length - 1) {
    state.isCompleted = true;
  } else {
    state.currentStepIndex += 1;
  }

  saveState("Järgmine samm avati ✨");
  renderGameView();
  queueAutoSpeak();
}

function goToPreviousStep() {
  if (state.currentStepIndex <= 0) {
    return;
  }

  stopSpeaking();
  state.currentStepIndex -= 1;
  state.isCompleted = false;
  saveState("Liikusid eelmise vihje juurde");
  renderGameView();
  queueAutoSpeak();
}

function queueAutoSpeak() {
  if (autoSpeakTimeoutId) {
    window.clearTimeout(autoSpeakTimeoutId);
  }

  if (currentMode !== "game" || state.isCompleted || !state.steps.length) {
    return;
  }

  const currentStep = state.steps[state.currentStepIndex];

  if (!currentStep?.autoSpeak || !currentStep.hintText.trim()) {
    return;
  }

  autoSpeakTimeoutId = window.setTimeout(() => {
    speakCurrentStep(false);
  }, 300);
}

function speakCurrentStep(forceReplay) {
  if (!("speechSynthesis" in window)) {
    showSaveStatus("Selles brauseris ei ole ettelugemine saadaval.");
    return;
  }

  const currentStep = state.steps[state.currentStepIndex];

  if (!currentStep || !currentStep.hintText.trim()) {
    showSaveStatus("Vihje tekst puudub.");
    return;
  }

  if (forceReplay) {
    stopSpeaking();
  }

  const utterance = new SpeechSynthesisUtterance(currentStep.hintText);
  utterance.lang = estonianVoice?.lang || "et-EE";
  utterance.rate = 0.95;
  utterance.pitch = 1.05;

  if (estonianVoice) {
    utterance.voice = estonianVoice;
  }

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (autoSpeakTimeoutId) {
    window.clearTimeout(autoSpeakTimeoutId);
    autoSpeakTimeoutId = null;
  }
}

function normalizeCurrentStepIndex() {
  if (state.steps.length === 0) {
    state.currentStepIndex = 0;
    state.isCompleted = false;
    return;
  }

  if (state.currentStepIndex >= state.steps.length) {
    state.currentStepIndex = state.steps.length - 1;
  }

  if (state.currentStepIndex < 0) {
    state.currentStepIndex = 0;
  }

  state.isCompleted = false;
}

function extractChildName(title) {
  const cleanTitle = title.replace(/munajaht/gi, "").replace(/[🐰🥚🌷🐣✨🌼🎉]/g, "").trim();
  return cleanTitle || "tubli otsija";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("service-worker.js");
  } catch (error) {
    console.error("Service worker'i registreerimine ebaõnnestus:", error);
  }
}
