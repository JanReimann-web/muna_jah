/*
Vanemale:
1. Vajuta pealkirjakaardil järjest 7 korda, et avada vanema seaded, ja sisesta parool.
2. Lisa munad ning igale munale nii palju vihjeid kui soovid.
3. Vajuta "Alusta mängu algusest", et peita seaded ja alustada lapsega jahti.

PWA paigaldamine telefoni avakuvale:
1. Ava rakendus telefonis brauseris.
2. Vali menüüst "Lisa avaekraanile" või "Installi rakendus".
3. Pärast esmast avamist töötab rakendus ka võrguühenduseta.
*/

const STORAGE_KEY = "munajaht-pwa-data-v3";
const LEGACY_STORAGE_KEYS = ["munajaht-pwa-data-v2", "munajaht-pwa-data-v1"];
const VOICE_CHECK_DELAY = 200;
const NEXT_CLUE_DELAY_MS = 60000;
const EGG_TRANSITION_MS = 1200;
const QUICK_TEST_EGG_TRANSITION_MS = 420;
const DEFAULT_TITLE = "Robini munajaht 🐰";
const ADMIN_PASSWORD = "Munajaht2026";

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createClue(overrides = {}) {
  return {
    id: makeId(),
    title: "",
    hintText: "",
    imageDataUrl: "",
    showImage: false,
    autoSpeak: true,
    ...overrides
  };
}

function createEgg(index = 1, overrides = {}, withStarterClue = true) {
  return {
    id: makeId(),
    title: `Muna ${index}`,
    clues: withStarterClue ? [createClue({ title: "Esimene vihje" })] : [],
    ...overrides
  };
}

const defaultState = {
  huntTitle: DEFAULT_TITLE,
  introText: "Tere, Robin! Nii tore, et avasid munajahi rakenduse. Pühadejänkud on jätnud sulle vahvad vihjed. Kuula hoolikalt, leia munad üles ja tunne rõõmu sellest seiklusest!",
  eggs: [
    createEgg(1, {
      title: "Muna 1",
      clues: [
        createClue({
          title: "Esimene vihje",
          hintText: "Vaata sinna, kus vahel jalanõud puhkavad. 👟",
          autoSpeak: true
        })
      ]
    }),
    createEgg(2, {
      title: "Muna 2",
      clues: [
        createClue({
          title: "Teine vihje",
          hintText: "Proovi otsida koha lähedalt, kus aknast õue vaadatakse. 🪟",
          autoSpeak: true
        })
      ]
    }),
    createEgg(3, {
      title: "Muna 3",
      clues: [
        createClue({
          title: "Viimane vihje",
          hintText: "Viimane üllatus võib olla seal, kus midagi pehmet ja mõnusat ootab. 🛋️",
          autoSpeak: true
        })
      ]
    })
  ],
  currentEggIndex: 0,
  currentClueIndex: 0,
  nextClueUnlockAt: 0,
  isCompleted: false
};

const state = loadState();

const elements = {
  heroCard: document.getElementById("heroCard"),
  heroTitle: document.getElementById("heroTitle"),
  gameEmptyState: document.getElementById("gameEmptyState"),
  gameView: document.getElementById("gameView"),
  introScene: document.getElementById("introScene"),
  introHintText: document.getElementById("introHintText"),
  introTextPreview: document.getElementById("introTextPreview"),
  introReplayButton: document.getElementById("introReplayButton"),
  progressRow: document.getElementById("progressRow"),
  eggFoundBurst: document.getElementById("eggFoundBurst"),
  eggProgressChip: document.getElementById("eggProgressChip"),
  clueProgressChip: document.getElementById("clueProgressChip"),
  gameEggTitle: document.getElementById("gameEggTitle"),
  clueCard: document.getElementById("clueCard"),
  clueText: document.getElementById("clueText"),
  clueImageWrap: document.getElementById("clueImageWrap"),
  clueImage: document.getElementById("clueImage"),
  speakButton: document.getElementById("speakButton"),
  nextButton: document.getElementById("nextButton"),
  foundButton: document.getElementById("foundButton"),
  gameActions: document.getElementById("gameActions"),
  endScreen: document.getElementById("endScreen"),
  endTitle: document.querySelector("#endScreen h3"),
  endCopy: document.querySelector("#endScreen .end-copy"),
  playAgainButton: document.getElementById("playAgainButton"),
  passwordOverlay: document.getElementById("passwordOverlay"),
  passwordInput: document.getElementById("passwordInput"),
  passwordError: document.getElementById("passwordError"),
  passwordSubmitButton: document.getElementById("passwordSubmitButton"),
  passwordCancelButton: document.getElementById("passwordCancelButton"),
  adminPanel: document.getElementById("adminPanel"),
  closeAdminButton: document.getElementById("closeAdminButton"),
  huntTitleInput: document.getElementById("huntTitleInput"),
  introTextInput: document.getElementById("introTextInput"),
  eggSummary: document.getElementById("eggSummary"),
  voiceStatus: document.getElementById("voiceStatus"),
  installTools: document.getElementById("installTools"),
  installButton: document.getElementById("installButton"),
  installHint: document.getElementById("installHint"),
  addEggButton: document.getElementById("addEggButton"),
  eggsList: document.getElementById("eggsList"),
  adminEmptyState: document.getElementById("adminEmptyState"),
  saveButton: document.getElementById("saveButton"),
  quickTestButton: document.getElementById("quickTestButton"),
  startGameButton: document.getElementById("startGameButton"),
  clearAllButton: document.getElementById("clearAllButton"),
  saveStatus: document.getElementById("saveStatus"),
  eggCardTemplate: document.getElementById("eggCardTemplate"),
  clueCardTemplate: document.getElementById("clueCardTemplate")
};

let estonianVoice = null;
let autoSpeakTimeoutId = null;
let deferredInstallPrompt = null;
let wakeLock = null;
let adminOpen = false;
let hasSpokenOpeningIntro = false;
let isOpeningIntroPlaying = false;
let openingIntroQueueTimeoutId = null;
let openingIntroStartWatchdogId = null;
let hasOpeningIntroStarted = false;
let nextClueCountdownInterval = null;
let heroTapCount = 0;
let heroTapResetTimeoutId = null;
let eggAdvanceTimeoutId = null;
let isEggAnimating = false;
let isQuickTestMode = false;
let audioContext = null;

initialize();

function initialize() {
  bindTopLevelEvents();
  bindInstallPrompt();
  bindSpeechVoices();
  bindWakeLockEvents();
  bindOpeningIntroFallback();
  registerServiceWorker();
  primeNextClueCooldown();
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
  const eggs = Array.isArray(rawState?.eggs)
    ? rawState.eggs.map(sanitizeEgg).filter(Boolean)
    : migrateLegacyEggs(rawState);

  const safeState = {
    huntTitle: typeof rawState?.huntTitle === "string" && rawState.huntTitle.trim()
      ? rawState.huntTitle.trim()
      : DEFAULT_TITLE,
    introText: typeof rawState?.introText === "string"
      ? rawState.introText
      : defaultState.introText,
    eggs,
    currentEggIndex: Number.isInteger(rawState?.currentEggIndex)
      ? rawState.currentEggIndex
      : Number.isInteger(rawState?.currentStepIndex) ? rawState.currentStepIndex : 0,
    currentClueIndex: Number.isInteger(rawState?.currentClueIndex) ? rawState.currentClueIndex : 0,
    nextClueUnlockAt: Number.isFinite(rawState?.nextClueUnlockAt) ? rawState.nextClueUnlockAt : 0,
    isCompleted: Boolean(rawState?.isCompleted)
  };

  normalizeProgress(safeState);
  return safeState;
}

function migrateLegacyEggs(rawState) {
  if (!Array.isArray(rawState?.steps) || rawState.steps.length === 0) {
    return cloneData(defaultState.eggs);
  }

  const eggs = rawState.steps
    .map((step, index) => {
      const clue = sanitizeClue(step, index);

      if (!clue) {
        return null;
      }

      return createEgg(index + 1, {
        title: clue.title?.trim() || `Muna ${index + 1}`,
        clues: [clue]
      });
    })
    .filter(Boolean);

  const targetEggCount = normalizeCount(rawState?.eggCount, eggs.length);

  while (eggs.length < targetEggCount) {
    eggs.push(createEgg(eggs.length + 1, {}, false));
  }

  return eggs.length ? eggs : cloneData(defaultState.eggs);
}

function sanitizeEgg(egg, index = 0) {
  if (!egg || typeof egg !== "object") {
    return null;
  }

  const clues = Array.isArray(egg.clues)
    ? egg.clues.map(sanitizeClue).filter(Boolean)
    : [];

  return {
    id: typeof egg.id === "string" && egg.id ? egg.id : makeId(),
    title: typeof egg.title === "string" && egg.title.trim() ? egg.title : `Muna ${index + 1}`,
    clues
  };
}

function sanitizeClue(clue, index = 0) {
  if (!clue || typeof clue !== "object") {
    return null;
  }

  return {
    id: typeof clue.id === "string" && clue.id ? clue.id : makeId(),
    title: typeof clue.title === "string" ? clue.title : `Vihje ${index + 1}`,
    hintText: typeof clue.hintText === "string" ? clue.hintText : "",
    imageDataUrl: typeof clue.imageDataUrl === "string" ? clue.imageDataUrl : "",
    showImage: Boolean(clue.showImage),
    autoSpeak: Boolean(clue.autoSpeak)
  };
}

function normalizeCount(value, minimum = 0) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return minimum;
  }

  return Math.max(minimum, parsed);
}

function normalizeProgress(targetState = state) {
  if (!targetState.eggs.length) {
    targetState.currentEggIndex = 0;
    targetState.currentClueIndex = 0;
    targetState.isCompleted = false;
    return;
  }

  if (targetState.currentEggIndex < 0) {
    targetState.currentEggIndex = 0;
  }

  if (targetState.currentEggIndex >= targetState.eggs.length) {
    targetState.currentEggIndex = targetState.eggs.length - 1;
  }

  const currentEgg = targetState.eggs[targetState.currentEggIndex];

  if (!currentEgg || currentEgg.clues.length === 0) {
    targetState.currentClueIndex = 0;
    targetState.isCompleted = false;
    return;
  }

  if (targetState.currentClueIndex < 0) {
    targetState.currentClueIndex = 0;
  }

  if (targetState.currentClueIndex >= currentEgg.clues.length) {
    targetState.currentClueIndex = currentEgg.clues.length - 1;
  }
}

function saveState(statusText = "Salvestatud 🌷") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSaveStatus(statusText);
}

function persistStateSilently() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function shouldShowOpeningIntroScene() {
  return Boolean(
    state.eggs.length &&
    state.introText.trim() &&
    !hasSpokenOpeningIntro &&
    !state.isCompleted
  );
}

function clearOpeningIntroTimers() {
  if (openingIntroQueueTimeoutId) {
    window.clearTimeout(openingIntroQueueTimeoutId);
    openingIntroQueueTimeoutId = null;
  }

  if (openingIntroStartWatchdogId) {
    window.clearTimeout(openingIntroStartWatchdogId);
    openingIntroStartWatchdogId = null;
  }

  hasOpeningIntroStarted = false;
}

function cancelOpeningIntroPlayback() {
  clearOpeningIntroTimers();
  isOpeningIntroPlaying = false;
}

function completeOpeningIntro() {
  cancelOpeningIntroPlayback();
  hasSpokenOpeningIntro = true;
  renderGameView();
  queueAutoSpeak();
}

function getCurrentClueDelayMs() {
  return isQuickTestMode ? 0 : NEXT_CLUE_DELAY_MS;
}

function getEggTransitionMs() {
  return isQuickTestMode ? QUICK_TEST_EGG_TRANSITION_MS : EGG_TRANSITION_MS;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function primeAudioContext() {
  const context = getAudioContext();

  if (!context || context.state !== "suspended") {
    return;
  }

  context.resume().catch(() => {
    /* Heliefekt jääb vahele, kui brauser seda hetkel ei luba. */
  });
}

function scheduleTone(context, startTime, frequency, duration, volume, type = "triangle") {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.015, 40), startTime + duration);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.04);
}

function playCelebrationSound(kind = "egg") {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const startPlayback = () => {
    const startTime = context.currentTime + 0.03;
    const notes = kind === "finale"
      ? [
          [659.25, 0, 0.14, 0.042, "triangle"],
          [783.99, 0.11, 0.16, 0.05, "triangle"],
          [987.77, 0.23, 0.18, 0.055, "triangle"],
          [1174.66, 0.38, 0.26, 0.06, "sine"],
          [1318.51, 0.54, 0.36, 0.07, "sine"]
        ]
      : [
          [740, 0, 0.12, 0.04, "triangle"],
          [880, 0.09, 0.15, 0.048, "triangle"],
          [988, 0.19, 0.2, 0.055, "sine"]
        ];

    notes.forEach(([frequency, offset, duration, volume, type]) => {
      scheduleTone(context, startTime + offset, frequency, duration, volume, type);
    });
  };

  if (context.state === "suspended") {
    context.resume().then(startPlayback).catch(() => {
      /* Heliefekt jääb vahele, kui brauser seda hetkel ei luba. */
    });
    return;
  }

  startPlayback();
}

function primeNextClueCooldown() {
  if (!state.isCompleted && hasNextClueInCurrentEgg() && state.nextClueUnlockAt === 0) {
    state.nextClueUnlockAt = Date.now() + getCurrentClueDelayMs();
    persistStateSilently();
  }
}

function clearEggAnimationState() {
  if (eggAdvanceTimeoutId) {
    window.clearTimeout(eggAdvanceTimeoutId);
    eggAdvanceTimeoutId = null;
  }

  isEggAnimating = false;
  elements.eggFoundBurst.hidden = true;
  elements.clueCard.classList.remove("is-celebrating");
}

function bindTopLevelEvents() {
  elements.heroCard.addEventListener("pointerdown", handleHeroCardTap);
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
  elements.introTextInput.addEventListener("input", (event) => {
    state.introText = event.target.value;
    saveState("Tervitusjutt salvestati ✨");
  });
  elements.installButton.addEventListener("click", installApp);

  elements.addEggButton.addEventListener("click", addEgg);
  elements.saveButton.addEventListener("click", () => saveState("Kõik muudatused salvestati 🥚"));
  elements.quickTestButton.addEventListener("click", startQuickTestFlow);
  elements.startGameButton.addEventListener("click", () => startGameFromBeginning({ quickTest: false }));
  elements.clearAllButton.addEventListener("click", clearAllData);

  elements.speakButton.addEventListener("click", () => speakCurrentClue(true));
  elements.nextButton.addEventListener("click", goToNextClue);
  elements.foundButton.addEventListener("click", advanceEgg);
  elements.playAgainButton.addEventListener("click", () => startGameFromBeginning({ quickTest: isQuickTestMode }));

  elements.eggsList.addEventListener("input", handleAdminInput);
  elements.eggsList.addEventListener("change", handleAdminChange);
  elements.eggsList.addEventListener("click", handleAdminClick);
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

function bindWakeLockEvents() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
      queueOpeningIntro();
    } else {
      releaseWakeLock();
    }
  });
}

function bindOpeningIntroFallback() {
  const tryStartIntro = () => {
    if (!shouldShowOpeningIntroScene() || adminOpen || isOpeningIntroPlaying) {
      return;
    }

    primeAudioContext();
    speakOpeningIntro();
  };

  elements.introScene.addEventListener("pointerdown", tryStartIntro);
  elements.introReplayButton.addEventListener("click", tryStartIntro);
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

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || adminOpen || state.isCompleted || !state.eggs.length) {
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
  renderAdmin();
  renderGameView();
}

function renderHero() {
  elements.heroTitle.textContent = state.huntTitle || DEFAULT_TITLE;
}

function renderAdminPanelState() {
  elements.adminPanel.hidden = !adminOpen;
}

function renderAdmin() {
  elements.huntTitleInput.value = state.huntTitle;
  elements.introTextInput.value = state.introText;
  elements.eggSummary.textContent = `Mune kokku: ${state.eggs.length}`;
  elements.quickTestButton.textContent = isQuickTestMode ? "Alusta kiirtesti uuesti" : "Alusta kiirtesti";
  elements.eggsList.innerHTML = "";
  elements.adminEmptyState.hidden = state.eggs.length !== 0;

  state.eggs.forEach((egg, eggIndex) => {
    const fragment = elements.eggCardTemplate.content.cloneNode(true);
    const eggCard = fragment.querySelector(".egg-card");
    const cluesList = fragment.querySelector(".clues-list");
    const eggEmptyState = fragment.querySelector(".egg-empty-state");
    const addClueButton = fragment.querySelector(".add-clue-button");

    eggCard.dataset.eggId = egg.id;
    eggCard.dataset.eggIndex = String(eggIndex);
    fragment.querySelector(".egg-badge").textContent = `Muna ${eggIndex + 1}`;
    fragment.querySelector(".egg-heading").textContent = egg.title.trim() || `Muna ${eggIndex + 1}`;

    const eggTitleInput = fragment.querySelector(".egg-title-input");
    eggTitleInput.value = egg.title;
    eggTitleInput.dataset.field = "eggTitle";

    fragment.querySelector(".egg-move-up-button").disabled = eggIndex === 0;
    fragment.querySelector(".egg-move-down-button").disabled = eggIndex === state.eggs.length - 1;

    eggEmptyState.hidden = egg.clues.length !== 0;
    addClueButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addClueToEgg(egg);
    });

    egg.clues.forEach((clue, clueIndex) => {
      const clueFragment = elements.clueCardTemplate.content.cloneNode(true);
      const clueCard = clueFragment.querySelector(".clue-editor");
      const imagePreviewWrap = clueFragment.querySelector(".image-preview-wrap");
      const imagePreview = clueFragment.querySelector(".image-preview");
      const clueImageInput = clueFragment.querySelector(".clue-image-input");
      const removeImageButton = clueFragment.querySelector(".remove-image-button");

      clueCard.dataset.clueId = clue.id;
      clueCard.dataset.clueIndex = String(clueIndex);
      clueFragment.querySelector(".clue-badge").textContent = `Vihje ${clueIndex + 1}`;
      clueFragment.querySelector(".clue-heading").textContent = clue.title.trim() || `Vihje ${clueIndex + 1}`;

      const clueTitleInput = clueFragment.querySelector(".clue-title-input");
      clueTitleInput.value = clue.title;
      clueTitleInput.dataset.field = "clueTitle";

      const clueHintInput = clueFragment.querySelector(".clue-hint-input");
      clueHintInput.value = clue.hintText;
      clueHintInput.dataset.field = "clueHint";

      clueImageInput.dataset.field = "clueImage";

      if (clue.imageDataUrl) {
        imagePreviewWrap.hidden = false;
        imagePreview.src = clue.imageDataUrl;
      } else {
        imagePreviewWrap.hidden = true;
      }

      removeImageButton.hidden = !clue.imageDataUrl;

      const showImageInput = clueFragment.querySelector(".clue-show-image-input");
      showImageInput.checked = clue.showImage;
      showImageInput.dataset.field = "clueShowImage";

      const autoSpeakInput = clueFragment.querySelector(".clue-auto-speak-input");
      autoSpeakInput.checked = clue.autoSpeak;
      autoSpeakInput.dataset.field = "clueAutoSpeak";

      clueFragment.querySelector(".clue-move-up-button").disabled = clueIndex === 0;
      clueFragment.querySelector(".clue-move-down-button").disabled = clueIndex === egg.clues.length - 1;

      clueImageInput.addEventListener("change", (event) => {
        event.stopPropagation();
        handleClueImageSelection(clue, event.target);
      });

      removeImageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clue.imageDataUrl = "";
        clue.showImage = false;
        saveState("Pilt eemaldati");
        renderAdmin();
        renderGameView();
      });

      cluesList.appendChild(clueFragment);
    });

    elements.eggsList.appendChild(fragment);
  });
}

function addClueToEgg(egg) {
  egg.clues.push(createClue({ title: `Vihje ${egg.clues.length + 1}` }));
  saveState("Vihje lisati 🌷");
  renderAdmin();
  renderGameView();
}

function handleClueImageSelection(clue, input) {
  const [file] = input.files || [];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    clue.imageDataUrl = typeof reader.result === "string" ? reader.result : "";
    saveState("Pilt salvestati 📷");
    renderAdmin();
    renderGameView();
  });

  reader.readAsDataURL(file);
}

function renderGameView() {
  const hasEggs = state.eggs.length > 0;
  const currentEgg = getCurrentEgg();
  const currentClue = getCurrentClue();
  const clueCount = currentEgg?.clues.length || 0;
  const showOpeningIntro = hasEggs && shouldShowOpeningIntroScene() && !adminOpen;

  elements.endScreen.classList.toggle("is-grand", state.isCompleted);
  elements.gameEmptyState.hidden = hasEggs;
  elements.gameView.hidden = !hasEggs || state.isCompleted;
  elements.endScreen.hidden = !hasEggs || !state.isCompleted;
  elements.introScene.hidden = !showOpeningIntro;
  elements.progressRow.hidden = showOpeningIntro;
  elements.clueCard.hidden = showOpeningIntro;
  elements.gameActions.hidden = showOpeningIntro;

  if (!hasEggs) {
    updateNextClueButton();
    return;
  }

  if (state.isCompleted) {
    updateNextClueButton();
    elements.endTitle.textContent = `Tubli! Kõik ${state.eggs.length} muna on leitud! 🐰🥚🎉`;
    elements.endCopy.textContent = `${state.huntTitle || DEFAULT_TITLE} sai rõõmsalt läbi.`;
    return;
  }

  elements.introTextPreview.hidden = !state.introText.trim();
  elements.introTextPreview.textContent = state.introText.trim();
  elements.introHintText.textContent = isOpeningIntroPlaying
    ? "Jänkud loevad sulle praegu tervitust ette..."
    : "Kuula väikest tervitust. Kui see läbi saab, ilmub esimene vihje.";
  elements.introReplayButton.textContent = isOpeningIntroPlaying
    ? "✨ Tervitus käib..."
    : "🔊 Kuula tervitust";
  elements.introReplayButton.disabled = isOpeningIntroPlaying;

  if (showOpeningIntro) {
    elements.eggFoundBurst.hidden = true;
    return;
  }

  elements.eggProgressChip.textContent = `Muna ${state.currentEggIndex + 1} / ${state.eggs.length}`;
  elements.clueProgressChip.textContent = `Vihje ${clueCount ? state.currentClueIndex + 1 : 0} / ${clueCount}`;
  elements.gameEggTitle.textContent = currentEgg?.title?.trim() || `Muna ${state.currentEggIndex + 1}`;

  if (!currentClue) {
    elements.clueText.textContent = "Selle muna vihje ootab veel lisamist. 🌷";
    elements.clueImageWrap.hidden = true;
    elements.speakButton.disabled = true;
    elements.nextButton.hidden = true;
    elements.foundButton.disabled = isEggAnimating;
    updateNextClueButton();
    return;
  }

  elements.speakButton.disabled = !currentClue.hintText.trim();
  elements.foundButton.disabled = isEggAnimating;
  elements.clueText.textContent = currentClue.hintText.trim() || "Selle vihje tekst ootab veel kirjutamist. 🌷";
  elements.clueImageWrap.hidden = !(currentClue.showImage && currentClue.imageDataUrl);

  if (currentClue.showImage && currentClue.imageDataUrl) {
    elements.clueImage.src = currentClue.imageDataUrl;
    elements.clueImage.alt = `Vihje pilt munale ${state.currentEggIndex + 1}`;
  } else {
    elements.clueImage.removeAttribute("src");
    elements.clueImage.alt = "";
  }

  elements.nextButton.hidden = state.currentClueIndex >= clueCount - 1;
  updateNextClueButton();
}

function getCurrentEgg() {
  return state.eggs[state.currentEggIndex] || null;
}

function getCurrentClue() {
  const egg = getCurrentEgg();

  if (!egg || egg.clues.length === 0) {
    return null;
  }

  return egg.clues[state.currentClueIndex] || null;
}

function hasNextClueInCurrentEgg() {
  const egg = getCurrentEgg();
  return Boolean(egg && state.currentClueIndex < egg.clues.length - 1);
}

function armNextClueCooldown() {
  state.nextClueUnlockAt = hasNextClueInCurrentEgg() ? Date.now() + getCurrentClueDelayMs() : 0;
  updateNextClueButton();
}

function isNextClueLocked() {
  return getCurrentClueDelayMs() > 0 && hasNextClueInCurrentEgg() && state.nextClueUnlockAt > Date.now();
}

function updateNextClueButton() {
  if (nextClueCountdownInterval) {
    window.clearInterval(nextClueCountdownInterval);
    nextClueCountdownInterval = null;
  }

  if (isEggAnimating) {
    elements.nextButton.textContent = "Järgmine vihje";
    elements.nextButton.disabled = true;
    return;
  }

  if (state.isCompleted || !hasNextClueInCurrentEgg()) {
    elements.nextButton.textContent = "Järgmine vihje";
    elements.nextButton.disabled = false;
    return;
  }

  if (getCurrentClueDelayMs() === 0) {
    elements.nextButton.textContent = "Järgmine vihje";
    elements.nextButton.disabled = false;
    return;
  }

  const refreshLabel = () => {
    const remainingMs = state.nextClueUnlockAt - Date.now();

    if (remainingMs <= 0) {
      elements.nextButton.disabled = false;
      elements.nextButton.textContent = "Järgmine vihje";

      if (nextClueCountdownInterval) {
        window.clearInterval(nextClueCountdownInterval);
        nextClueCountdownInterval = null;
      }

      return;
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    elements.nextButton.disabled = true;
    elements.nextButton.textContent = `Järgmine vihje ${remainingSeconds}s`;
  };

  refreshLabel();

  if (isNextClueLocked()) {
    nextClueCountdownInterval = window.setInterval(refreshLabel, 1000);
  }
}

function handleHeroCardTap() {
  if (adminOpen || !elements.passwordOverlay.hidden) {
    return;
  }

  heroTapCount += 1;

  if (heroTapResetTimeoutId) {
    window.clearTimeout(heroTapResetTimeoutId);
  }

  heroTapResetTimeoutId = window.setTimeout(() => {
    heroTapCount = 0;
    heroTapResetTimeoutId = null;
  }, 1800);

  if (heroTapCount >= 7) {
    heroTapCount = 0;

    if (heroTapResetTimeoutId) {
      window.clearTimeout(heroTapResetTimeoutId);
      heroTapResetTimeoutId = null;
    }

    openPasswordPrompt();
  }
}

function openPasswordPrompt() {
  cancelOpeningIntroPlayback();
  clearEggAnimationState();
  stopSpeaking();
  releaseWakeLock();
  elements.passwordOverlay.hidden = false;
  elements.passwordError.textContent = "";
  elements.passwordInput.value = "";
  window.setTimeout(() => elements.passwordInput.focus(), 20);
}

function closePasswordPrompt(shouldResumeWakeLock = true) {
  elements.passwordOverlay.hidden = true;
  elements.passwordError.textContent = "";
  elements.passwordInput.value = "";
  renderGameView();

  if (shouldResumeWakeLock && !adminOpen) {
    requestWakeLock();
    queueOpeningIntro();
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
  cancelOpeningIntroPlayback();
  clearEggAnimationState();
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
  renderGameView();
  requestWakeLock();
  queueOpeningIntro();
}

function addEgg() {
  state.eggs.push(createEgg(state.eggs.length + 1));
  saveState("Uus muna lisati 🥚");
  renderAdmin();
  renderGameView();
}

function handleAdminInput(event) {
  const egg = getEggFromEvent(event);

  if (!egg) {
    return;
  }

  const field = event.target.dataset.field;

  if (field === "eggTitle") {
    egg.title = event.target.value;
    const heading = event.target.closest(".egg-card")?.querySelector(".egg-heading");

    if (heading) {
      heading.textContent = egg.title.trim() || "Nimetu muna";
    }

    saveState("Muna nimi salvestati 🌼");
    renderGameView();
    return;
  }

  const clue = getClueFromEvent(event, egg);

  if (!clue) {
    return;
  }

  if (field === "clueTitle") {
    clue.title = event.target.value;
    const heading = event.target.closest(".clue-editor")?.querySelector(".clue-heading");

    if (heading) {
      heading.textContent = clue.title.trim() || "Nimetu vihje";
    }
  }

  if (field === "clueHint") {
    clue.hintText = event.target.value;
  }

  saveState("Muudatus salvestati 🌼");
  renderGameView();
}

function handleAdminChange(event) {
  const egg = getEggFromEvent(event);

  if (!egg) {
    return;
  }

  const clue = getClueFromEvent(event, egg);

  if (!clue) {
    return;
  }

  const field = event.target.dataset.field;

  if (field === "clueShowImage") {
    clue.showImage = event.target.checked;
    saveState("Valik salvestati 🐣");
    renderGameView();
    return;
  }

  if (field === "clueAutoSpeak") {
    clue.autoSpeak = event.target.checked;
    saveState("Valik salvestati 🐣");
    return;
  }

  if (field === "clueImage") {
    handleClueImageSelection(clue, event.target);
  }
}

function handleAdminClick(event) {
  const egg = getEggFromEvent(event);

  if (!egg) {
    return;
  }

  const eggIndex = state.eggs.findIndex((item) => item.id === egg.id);

  if (event.target.closest(".egg-move-up-button") && eggIndex > 0) {
    [state.eggs[eggIndex - 1], state.eggs[eggIndex]] = [state.eggs[eggIndex], state.eggs[eggIndex - 1]];
    normalizeProgress();
    saveState("Muna liigutati üles");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".egg-move-down-button") && eggIndex < state.eggs.length - 1) {
    [state.eggs[eggIndex], state.eggs[eggIndex + 1]] = [state.eggs[eggIndex + 1], state.eggs[eggIndex]];
    normalizeProgress();
    saveState("Muna liigutati alla");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".delete-egg-button")) {
    state.eggs.splice(eggIndex, 1);
    normalizeProgress();
    saveState("Muna kustutati");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".add-clue-button")) {
    addClueToEgg(egg);
    return;
  }

  const clue = getClueFromEvent(event, egg);

  if (!clue) {
    return;
  }

  const clueIndex = egg.clues.findIndex((item) => item.id === clue.id);

  if (event.target.closest(".clue-move-up-button") && clueIndex > 0) {
    [egg.clues[clueIndex - 1], egg.clues[clueIndex]] = [egg.clues[clueIndex], egg.clues[clueIndex - 1]];
    normalizeProgress();
    saveState("Vihje liigutati üles");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".clue-move-down-button") && clueIndex < egg.clues.length - 1) {
    [egg.clues[clueIndex], egg.clues[clueIndex + 1]] = [egg.clues[clueIndex + 1], egg.clues[clueIndex]];
    normalizeProgress();
    saveState("Vihje liigutati alla");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".delete-clue-button")) {
    egg.clues.splice(clueIndex, 1);
    normalizeProgress();
    saveState("Vihje kustutati");
    renderAdmin();
    renderGameView();
    return;
  }

  if (event.target.closest(".remove-image-button")) {
    clue.imageDataUrl = "";
    clue.showImage = false;
    saveState("Pilt eemaldati");
    renderAdmin();
    renderGameView();
  }
}

function getEggFromEvent(event) {
  const eggCard = event.target.closest(".egg-card");

  if (!eggCard) {
    return null;
  }

  const eggIndex = Number.parseInt(eggCard.dataset.eggIndex || "", 10);

  if (Number.isInteger(eggIndex) && state.eggs[eggIndex]) {
    return state.eggs[eggIndex];
  }

  return state.eggs.find((egg) => egg.id === eggCard.dataset.eggId) || null;
}

function getClueFromEvent(event, egg) {
  const clueCard = event.target.closest(".clue-editor");

  if (!clueCard || !egg) {
    return null;
  }

  const clueIndex = Number.parseInt(clueCard.dataset.clueIndex || "", 10);

  if (Number.isInteger(clueIndex) && egg.clues[clueIndex]) {
    return egg.clues[clueIndex];
  }

  return egg.clues.find((clue) => clue.id === clueCard.dataset.clueId) || null;
}

function clearAllData() {
  const shouldClear = window.confirm("Kas soovid pealkirja, tervitusjutu, kõik munad ja kõik vihjed tühjendada?");

  if (!shouldClear) {
    return;
  }

  state.huntTitle = DEFAULT_TITLE;
  state.introText = "";
  state.eggs = [];
  state.currentEggIndex = 0;
  state.currentClueIndex = 0;
  state.nextClueUnlockAt = 0;
  state.isCompleted = false;
  isQuickTestMode = false;
  hasSpokenOpeningIntro = false;
  cancelOpeningIntroPlayback();
  clearEggAnimationState();
  stopSpeaking();
  releaseWakeLock();
  saveState("Kõik andmed tühjendati");
  render();
}

function startQuickTestFlow() {
  startGameFromBeginning({
    quickTest: true,
    statusText: "Kiirtest algas 🐣"
  });
}

function startGameFromBeginning(options = {}) {
  const {
    quickTest = isQuickTestMode,
    statusText = "Mäng alustati algusest 🥚"
  } = options;

  isQuickTestMode = Boolean(quickTest);
  cancelOpeningIntroPlayback();
  clearEggAnimationState();
  hasSpokenOpeningIntro = false;
  state.currentEggIndex = 0;
  state.currentClueIndex = 0;
  state.nextClueUnlockAt = 0;
  state.isCompleted = false;
  armNextClueCooldown();
  saveState(statusText);
  closeAdminPanel();
  renderAdmin();
  renderGameView();
  requestWakeLock();
  queueOpeningIntro();
  queueAutoSpeak();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToNextClue() {
  const currentEgg = getCurrentEgg();

  if (!currentEgg || state.currentClueIndex >= currentEgg.clues.length - 1) {
    return;
  }

  if (isNextClueLocked()) {
    return;
  }

  stopSpeaking();
  state.currentClueIndex += 1;
  armNextClueCooldown();
  state.isCompleted = false;
  saveState("Liikusid järgmise vihje juurde");
  renderGameView();
  queueAutoSpeak();
}

function advanceEgg() {
  if (!state.eggs.length || state.isCompleted || isEggAnimating) {
    return;
  }

  const isFinalEgg = state.currentEggIndex >= state.eggs.length - 1;

  clearEggAnimationState();
  isEggAnimating = true;
  stopSpeaking();
  primeAudioContext();
  playCelebrationSound(isFinalEgg ? "finale" : "egg");
  elements.eggFoundBurst.hidden = false;
  elements.clueCard.classList.add("is-celebrating");
  renderGameView();

  eggAdvanceTimeoutId = window.setTimeout(() => {
    clearEggAnimationState();

    if (isFinalEgg) {
      state.isCompleted = true;
      state.nextClueUnlockAt = 0;
      releaseWakeLock();
      saveState("Kõik munad said leitud 🎉");
    } else {
      state.currentEggIndex += 1;
      state.currentClueIndex = 0;
      armNextClueCooldown();
      saveState("Liikusid järgmise muna juurde ✨");
    }

    renderGameView();
    queueAutoSpeak();
  }, getEggTransitionMs());

  if (isFinalEgg) {
    return;
  }

  saveState("Muna leitud 🥚");
  renderGameView();
}

function queueOpeningIntro() {
  clearOpeningIntroTimers();

  if (!shouldShowOpeningIntroScene() || adminOpen || !elements.passwordOverlay.hidden) {
    return;
  }

  renderGameView();

  openingIntroQueueTimeoutId = window.setTimeout(() => {
    if (!shouldShowOpeningIntroScene() || adminOpen || document.visibilityState !== "visible" || !elements.passwordOverlay.hidden) {
      return;
    }

    speakOpeningIntro();
  }, 700);
}

function speakOpeningIntro() {
  if (!shouldShowOpeningIntroScene() || adminOpen) {
    return;
  }

  if (isOpeningIntroPlaying) {
    return;
  }

  stopSpeaking();
  clearOpeningIntroTimers();
  isOpeningIntroPlaying = true;
  hasOpeningIntroStarted = false;
  renderGameView();

  openingIntroStartWatchdogId = window.setTimeout(() => {
    if (!isOpeningIntroPlaying || hasOpeningIntroStarted) {
      return;
    }

    cancelOpeningIntroPlayback();
    renderGameView();
  }, 1800);

  speakText(state.introText.trim(), {
    onstart: () => {
      hasOpeningIntroStarted = true;

      if (openingIntroStartWatchdogId) {
        window.clearTimeout(openingIntroStartWatchdogId);
        openingIntroStartWatchdogId = null;
      }

      renderGameView();
    },
    onend: () => {
      completeOpeningIntro();
    },
    onerror: () => {
      cancelOpeningIntroPlayback();
      renderGameView();
    }
  });
}

function queueAutoSpeak() {
  if (autoSpeakTimeoutId) {
    window.clearTimeout(autoSpeakTimeoutId);
  }

  const currentClue = getCurrentClue();

  if (
    adminOpen ||
    state.isCompleted ||
    shouldShowOpeningIntroScene() ||
    isOpeningIntroPlaying ||
    !currentClue?.autoSpeak ||
    !currentClue.hintText.trim()
  ) {
    return;
  }

  autoSpeakTimeoutId = window.setTimeout(() => {
    speakCurrentClue(false);
  }, 300);
}

function speakCurrentClue(forceReplay) {
  const currentClue = getCurrentClue();

  if (!currentClue || !currentClue.hintText.trim()) {
    showSaveStatus("Vihje tekst puudub.");
    return;
  }

  speakText(currentClue.hintText.trim(), { forceReplay });
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
