/*
Vanemale:
1. Ava lehe allosas "Vanema seaded".
2. Pane paika pealkiri, munade koguarv ja vihjed.
3. Vajuta "Alusta mängu algusest", et peita seaded ja alustada uuesti esimesest vihjest.

PWA paigaldamine telefoni avakuvale:
1. Ava rakendus telefonis brauseris.
2. Vali menüüst "Lisa avaekraanile" või "Installi rakendus".
3. Pärast esmast avamist töötab rakendus ka võrguühenduseta.
*/

const STORAGE_KEY = "munajaht-pwa-data-v2";
const LEGACY_STORAGE_KEYS = ["munajaht-pwa-data-v1"];
const VOICE_CHECK_DELAY = 200;
const DEFAULT_TITLE = "Robini munajaht 🐰";
const ADMIN_PASSWORD = "Munajaht2026";

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
  eggCount: 3,
  introText: "Tere, Robin! Nii tore, et avasid munajahi rakenduse. Pühadejänkud on jätnud sulle vahvad vihjed. Kuula hoolikalt, leia munad üles ja tunne rõõmu sellest seiklusest!",
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
  heroTitle: document.getElementById("heroTitle"),
  gamePanel: document.getElementById("gamePanel"),
  gameEmptyState: document.getElementById("gameEmptyState"),
  gameView: document.getElementById("gameView"),
  progressChip: document.getElementById("progressChip"),
  eggCountChip: document.getElementById("eggCountChip"),
  clueText: document.getElementById("clueText"),
  clueImageWrap: document.getElementById("clueImageWrap"),
  clueImage: document.getElementById("clueImage"),
  previousButton: document.getElementById("previousButton"),
  endScreen: document.getElementById("endScreen"),
  endTitle: document.querySelector("#endScreen h3"),
  endCopy: document.querySelector("#endScreen .end-copy"),
  toggleAdminButton: document.getElementById("toggleAdminButton"),
  passwordOverlay: document.getElementById("passwordOverlay"),
  passwordInput: document.getElementById("passwordInput"),
  passwordError: document.getElementById("passwordError"),
  passwordSubmitButton: document.getElementById("passwordSubmitButton"),
  passwordCancelButton: document.getElementById("passwordCancelButton"),
  closeAdminButton: document.getElementById("closeAdminButton"),
  adminPanel: document.getElementById("adminPanel"),
  huntTitleInput: document.getElementById("huntTitleInput"),
  eggCountInput: document.getElementById("eggCountInput"),
  introTextInput: document.getElementById("introTextInput"),
  voiceStatus: document.getElementById("voiceStatus"),
  installTools: document.getElementById("installTools"),
  installButton: document.getElementById("installButton"),
  installHint: document.getElementById("installHint"),
  addStepButton: document.getElementById("addStepButton"),
  saveButton: document.getElementById("saveButton"),
  startGameButton: document.getElementById("startGameButton"),
  clearAllButton: document.getElementById("clearAllButton"),
  stepsList: document.getElementById("stepsList"),
  adminEmptyState: document.getElementById("adminEmptyState"),
  saveStatus: document.getElementById("saveStatus"),
  speakButton: document.getElementById("speakButton"),
  foundButton: document.getElementById("foundButton"),
  restartButton: document.getElementById("restartButton"),
  playAgainButton: document.getElementById("playAgainButton"),
  stepCardTemplate: document.getElementById("stepCardTemplate")
};

let estonianVoice = null;
let autoSpeakTimeoutId = null;
let deferredInstallPrompt = null;
let wakeLock = null;
let adminOpen = false;
let hasSpokenOpeningIntro = false;

initialize();

function initialize() {
  bindTopLevelEvents();
  bindInstallPrompt();
  bindSpeechVoices();
  bindWakeLockEvents();
  registerServiceWorker();
  render();
  requestWakeLock();
  queueOpeningIntro();
}

function loadState() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY) || loadLegacyState();

    if (!savedData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
      return cloneData(defaultState);
    }

    return sanitizeState(JSON.parse(savedData));
  } catch (error) {
    console.error("Rakenduse andmete lugemine ebaõnnestus:", error);
    return cloneData(defaultState);
  }
}

function loadLegacyState() {
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacyData = localStorage.getItem(key);

    if (legacyData) {
      return legacyData;
    }
  }

  return "";
}

function sanitizeState(rawState) {
  const steps = Array.isArray(rawState?.steps)
    ? rawState.steps.map(sanitizeStep).filter(Boolean)
    : [];

  const safeState = {
    huntTitle: typeof rawState?.huntTitle === "string" && rawState.huntTitle.trim()
      ? rawState.huntTitle.trim()
      : DEFAULT_TITLE,
    eggCount: normalizeEggCount(rawState?.eggCount, steps.length),
    introText: typeof rawState?.introText === "string" ? rawState.introText : defaultState.introText,
    steps,
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

function normalizeEggCount(value, minimum = 0) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return Math.max(minimum, minimum || 0);
  }

  return Math.max(minimum, parsed);
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
  elements.toggleAdminButton.addEventListener("click", handleParentSettingsTap);
  elements.passwordSubmitButton.addEventListener("click", submitPassword);
  elements.passwordCancelButton.addEventListener("click", closePasswordPrompt);
  elements.passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitPassword();
    }
  });
  elements.closeAdminButton.addEventListener("click", closeAdminPanel);

  elements.huntTitleInput.addEventListener("input", (event) => {
    state.huntTitle = event.target.value.trimStart();
    saveState("Pealkiri salvestati ✨");
    renderHero();
    renderGameView();
  });

  elements.eggCountInput.addEventListener("change", handleEggCountChange);
  elements.eggCountInput.addEventListener("blur", handleEggCountChange);
  elements.introTextInput.addEventListener("input", (event) => {
    state.introText = event.target.value;
    saveState("Tervitusjutt salvestati ✨");
  });

  elements.addStepButton.addEventListener("click", addStep);
  elements.saveButton.addEventListener("click", () => saveState("Kõik muudatused salvestati 🥚"));
  elements.startGameButton.addEventListener("click", startGameFromBeginning);
  elements.clearAllButton.addEventListener("click", clearAllData);
  elements.speakButton.addEventListener("click", () => speakCurrentStep(true));
  elements.foundButton.addEventListener("click", advanceGame);
  elements.restartButton.addEventListener("click", startGameFromBeginning);
  elements.previousButton.addEventListener("click", goToPreviousStep);
  elements.playAgainButton.addEventListener("click", startGameFromBeginning);
  elements.installButton.addEventListener("click", installApp);

  elements.stepsList.addEventListener("input", handleStepInput);
  elements.stepsList.addEventListener("change", handleStepChange);
  elements.stepsList.addEventListener("click", handleStepActions);
}

function bindInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installTools.hidden = false;
    elements.installHint.textContent = "Rakendus on valmis paigaldamiseks avaekraanile.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installTools.hidden = true;
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
    elements.voiceStatus.textContent = "Ettelugemine ei ole selles brauseris saadaval.";
    return;
  }

  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) {
    elements.voiceStatus.textContent = "Otsin sobivat eesti häält...";
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
    elements.voiceStatus.textContent = "Ettelugemine ei ole selles brauseris saadaval.";
    return;
  }

  if (!estonianVoice) {
    elements.voiceStatus.textContent = "Eesti häält ei leitud. Rakendus kasutab lähimat saadaval häält.";
    return;
  }

  if (estonianVoice.lang?.toLowerCase().startsWith("et")) {
    elements.voiceStatus.textContent = `Ettelugemine kasutab eesti häält: ${estonianVoice.name}`;
    return;
  }

  elements.voiceStatus.textContent = `Ettelugemine kasutab varuhäält: ${estonianVoice.name}`;
}

function bindWakeLockEvents() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || adminOpen || state.isCompleted || !state.steps.length) {
    return;
  }

  if (wakeLock) {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (error) {
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
    elements.installHint.textContent = "Paigaldus jäeti praegu vahele.";
  }

  deferredInstallPrompt = null;
  elements.installButton.hidden = true;
}

function render() {
  renderHero();
  renderAdminPanelState();
  closePasswordPrompt();
  renderAdmin();
  renderGameView();
}

function renderHero() {
  elements.heroTitle.textContent = state.huntTitle || DEFAULT_TITLE;
}

function renderAdminPanelState() {
  elements.adminPanel.hidden = !adminOpen;
  elements.toggleAdminButton.setAttribute("aria-expanded", String(adminOpen));
  elements.toggleAdminButton.textContent = adminOpen ? "Peida vanema seaded" : "Vanema seaded";
}

function renderAdmin() {
  elements.huntTitleInput.value = state.huntTitle;
  elements.eggCountInput.value = state.eggCount;
  elements.introTextInput.value = state.introText;
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

    fragment.querySelector(".delete-step-button").dataset.action = "delete";
    elements.stepsList.appendChild(fragment);
  });
}

function renderGameView() {
  const hasSteps = state.steps.length > 0;
  const currentStep = hasSteps ? state.steps[state.currentStepIndex] : null;

  elements.gameEmptyState.hidden = hasSteps;
  elements.gameView.hidden = !hasSteps || state.isCompleted;
  elements.endScreen.hidden = !hasSteps || !state.isCompleted;

  if (!hasSteps) {
    return;
  }

  if (state.isCompleted) {
    elements.endTitle.textContent = `Tubli! Kõik ${state.eggCount} muna on leitud! 🐰🥚🎉`;
    elements.endCopy.textContent = `${state.huntTitle || DEFAULT_TITLE} sai rõõmsalt läbi.`;
    return;
  }

  elements.progressChip.textContent = `Vihje ${state.currentStepIndex + 1} / ${state.steps.length}`;
  elements.eggCountChip.textContent = `Mune kokku ${state.eggCount}`;
  elements.clueText.textContent = currentStep?.hintText.trim() || "Vihje ootab veel kirjutamist. 🌷";
  elements.clueImageWrap.hidden = !(currentStep?.showImage && currentStep.imageDataUrl);

  if (currentStep?.showImage && currentStep.imageDataUrl) {
    elements.clueImage.src = currentStep.imageDataUrl;
    elements.clueImage.alt = `Vihje pilt etapile ${state.currentStepIndex + 1}`;
  } else {
    elements.clueImage.removeAttribute("src");
    elements.clueImage.alt = "";
  }

  elements.previousButton.hidden = state.currentStepIndex === 0;
}

function toggleAdminPanel() {
  if (adminOpen) {
    closeAdminPanel();
  } else {
    openAdminPanel();
  }
}

function handleParentSettingsTap() {
  if (adminOpen) {
    closeAdminPanel();
    return;
  }

  openPasswordPrompt();
}

function openPasswordPrompt() {
  stopSpeaking();
  releaseWakeLock();
  elements.passwordOverlay.hidden = false;
  elements.passwordError.textContent = "";
  elements.passwordInput.value = "";
  window.setTimeout(() => {
    elements.passwordInput.focus();
  }, 30);
}

function closePasswordPrompt(shouldResumeWakeLock = true) {
  elements.passwordOverlay.hidden = true;
  elements.passwordError.textContent = "";
  elements.passwordInput.value = "";

  if (shouldResumeWakeLock && !adminOpen) {
    requestWakeLock();
  }
}

function submitPassword() {
  if (elements.passwordInput.value === ADMIN_PASSWORD) {
    closePasswordPrompt(false);
    openAdminPanel();
    return;
  }

  elements.passwordError.textContent = "Vale parool.";
  elements.passwordInput.focus();
  elements.passwordInput.select();
}

function openAdminPanel() {
  adminOpen = true;
  stopSpeaking();
  releaseWakeLock();
  renderAdminPanelState();
  window.setTimeout(() => {
    elements.adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 20);
}

function closeAdminPanel() {
  adminOpen = false;
  renderAdminPanelState();
  requestWakeLock();
}

function handleEggCountChange(event) {
  const normalizedEggCount = normalizeEggCount(event.target.value, 0);
  state.eggCount = normalizedEggCount;
  event.target.value = normalizedEggCount;
  saveState("Munade arv salvestati 🥚");
  renderGameView();
}

function queueOpeningIntro() {
  if (hasSpokenOpeningIntro || adminOpen || !state.introText.trim() || !elements.passwordOverlay.hidden) {
    return;
  }

  window.setTimeout(() => {
    if (hasSpokenOpeningIntro || adminOpen || document.visibilityState !== "visible" || !elements.passwordOverlay.hidden) {
      return;
    }

    speakOpeningIntro();
  }, 700);
}

function speakOpeningIntro() {
  if (hasSpokenOpeningIntro || !state.introText.trim()) {
    return;
  }

  speakText(state.introText.trim(), {
    onstart: () => {
      hasSpokenOpeningIntro = true;
    }
  });
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
    card.querySelector(".step-heading").textContent = step.title.trim() || "Nimetu vihje";
  }

  saveState("Muudatus salvestati 🌼");
  renderHero();
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
  const stepIndex = state.steps.findIndex((step) => step.id === card?.dataset.stepId);

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
  const shouldClear = window.confirm("Kas soovid pealkirja, munade arvu ja kõik vihjed tühjendada?");

  if (!shouldClear) {
    return;
  }

  state.huntTitle = DEFAULT_TITLE;
  state.eggCount = 0;
  state.introText = "";
  state.steps = [];
  state.currentStepIndex = 0;
  state.isCompleted = false;
  stopSpeaking();
  releaseWakeLock();
  saveState("Kõik andmed tühjendati");
  render();
}

function startGameFromBeginning() {
  state.currentStepIndex = 0;
  state.isCompleted = false;
  saveState("Mäng alustati algusest 🥚");
  closeAdminPanel();
  renderGameView();
  requestWakeLock();
  queueAutoSpeak();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function advanceGame() {
  if (!state.steps.length || state.isCompleted) {
    return;
  }

  stopSpeaking();

  if (state.currentStepIndex >= state.steps.length - 1) {
    state.isCompleted = true;
    releaseWakeLock();
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
  requestWakeLock();
  queueAutoSpeak();
}

function queueAutoSpeak() {
  if (autoSpeakTimeoutId) {
    window.clearTimeout(autoSpeakTimeoutId);
  }

  if (adminOpen || state.isCompleted || !state.steps.length) {
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
  const currentStep = state.steps[state.currentStepIndex];

  if (!currentStep || !currentStep.hintText.trim()) {
    showSaveStatus("Vihje tekst puudub.");
    return;
  }

  speakText(currentStep.hintText, { forceReplay });
}

function speakText(text, options = {}) {
  if (!("speechSynthesis" in window)) {
    showSaveStatus("Selles brauseris ei ole ettelugemine saadaval.");
    return;
  }

  const { forceReplay = false, onstart = null, onend = null, onerror = null } = options;

  if (forceReplay) {
    stopSpeaking();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = estonianVoice?.lang || "et-EE";
  utterance.rate = 0.95;
  utterance.pitch = 1.05;

  if (estonianVoice) {
    utterance.voice = estonianVoice;
  }

  if (typeof onstart === "function") {
    utterance.addEventListener("start", onstart, { once: true });
  }

  if (typeof onend === "function") {
    utterance.addEventListener("end", onend, { once: true });
  }

  if (typeof onerror === "function") {
    utterance.addEventListener("error", onerror, { once: true });
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
