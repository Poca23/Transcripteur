class MeetingTranscriber {
  constructor() {
    // Détection plateforme
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isPWA =
      window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;

    // État de l'application
    this.isRecording = false;
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.transcriptionText = "";
    this.startTime = null;
    this.timer = null;
    this.microphoneActivated = false;

    // Éléments DOM - Overlays
    this.microphoneOverlay = document.getElementById("microphoneActivation");
    this.permissionError = document.getElementById("permissionError");
    this.mainInterface = document.getElementById("mainInterface");
    this.activateMicrophoneBtn = document.getElementById(
      "activateMicrophoneBtn"
    );
    this.retryPermissionBtn = document.getElementById("retryPermissionBtn");
    this.refreshPageBtn = document.getElementById("refreshPageBtn");

    // Éléments DOM - Interface principale
    this.startBtn = document.getElementById("startBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.statusText = document.getElementById("statusText");
    this.timerElement = document.getElementById("timer");
    this.transcriptionElement = document.getElementById("transcription");
    this.summaryElement = document.getElementById("summary");
    this.downloadAudio = document.getElementById("downloadAudio");
    this.downloadTranscript = document.getElementById("downloadTranscript");
    this.downloadSummary = document.getElementById("downloadSummary");
    this.downloadAll = document.getElementById("downloadAll");

    // Dictionnaire de corrections
    this.corrections = {
      heu: "",
      euh: "",
      hum: "",
      hmm: "",
      meeting: "réunion",
      call: "appel",
      email: "e-mail",
      api: "API",
      crm: "CRM",
      kpi: "KPI",
      roi: "ROI",
      virgule: ",",
      point: ".",
      "point virgule": ";",
      "deux points": ":",
      "point d'interrogation": "?",
      "point d'exclamation": "!",
      "ouvrir parenthèse": "(",
      "fermer parenthèse": ")",
      pourcentage: "%",
      euros: "€",
      un: "1",
      deux: "2",
      trois: "3",
      quatre: "4",
      cinq: "5",
      six: "6",
      sept: "7",
      huit: "8",
      neuf: "9",
      dix: "10",
    };

    // Mots-clés business avec scoring
    this.businessKeywords = {
      objectif: 3,
      stratégie: 3,
      budget: 3,
      deadline: 3,
      important: 4,
      urgent: 4,
      priorité: 3,
      décision: 4,
      action: 3,
      tâche: 2,
      responsable: 3,
      équipe: 2,
      client: 3,
      projet: 3,
      résultat: 3,
      performance: 3,
      problème: 3,
      solution: 3,
      risque: 3,
      opportunité: 3,
      plan: 2,
      développement: 2,
      amélioration: 2,
      innovation: 3,
      réunion: 2,
      présentation: 2,
      rapport: 2,
      analyse: 3,
      vente: 3,
      marketing: 3,
      production: 2,
      qualité: 3,
    };

    // Mots de remplissage à supprimer
    this.fillerWords = [
      "euh",
      "heu",
      "hum",
      "hmm",
      "ben",
      "donc voilà",
      "en fait",
      "du coup",
    ];

    this.init();
  }

  // 🔥 NOUVELLE INITIALISATION avec gestion permissions
  init() {
    try {
      this.bindEvents();
      console.log("✅ Application initialisée - Attente activation microphone");
    } catch (error) {
      console.error("❌ Erreur initialisation:", error);
      this.showError("Erreur d'initialisation de l'application");
    }
  }

  // 🔥 NOUVEAUX EVENT LISTENERS pour activation
  bindEvents() {
    // Boutons activation microphone
    this.activateMicrophoneBtn.addEventListener("click", () =>
      this.activateMicrophone()
    );
    this.retryPermissionBtn.addEventListener("click", () =>
      this.activateMicrophone()
    );
    this.refreshPageBtn.addEventListener("click", () => location.reload());

    // Boutons interface principale
    this.startBtn.addEventListener("click", () => this.startRecording());
    this.stopBtn.addEventListener("click", () => this.stopRecording());
    this.clearBtn.addEventListener("click", () => this.clearAll());

    // Téléchargements
    this.downloadAudio.addEventListener("click", () =>
      this.downloadFile("audio")
    );
    this.downloadTranscript.addEventListener("click", () =>
      this.downloadFile("transcript")
    );
    this.downloadSummary.addEventListener("click", () =>
      this.downloadFile("summary")
    );
    this.downloadAll.addEventListener("click", () => {
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, "-");
      this.downloadAllFiles(timestamp);
    });

    // Gestion arrière-plan iOS PWA
    if (this.isIOS && this.isPWA) {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.isRecording) {
          console.log("📱 App en arrière-plan - pause temporaire");
        } else if (!document.hidden && this.isRecording) {
          console.log("📱 App au premier plan - reprise");
          this.restartRecognition();
        }
      });
    }
  }

  // 🔥 NOUVELLE FONCTION d'activation microphone
  async activateMicrophone() {
    try {
      console.log("🎤 Demande d'autorisation microphone...");
      this.activateMicrophoneBtn.textContent = "⏳ ACTIVATION EN COURS...";
      this.activateMicrophoneBtn.disabled = true;

      // Demander permission microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      // Fermer le stream temporaire
      stream.getTracks().forEach((track) => track.stop());

      // ✅ SUCCÈS - Activer l'interface
      this.microphoneActivated = true;
      this.showMainInterface();
      console.log("✅ Microphone activé avec succès");
    } catch (error) {
      console.error("❌ Erreur activation microphone:", error);
      this.showPermissionError();
    }
  }

  // 🔥 NOUVELLES FONCTIONS d'affichage
  showMainInterface() {
    this.microphoneOverlay.style.display = "none";
    this.permissionError.style.display = "none";
    this.mainInterface.style.display = "block";

    // Activer les boutons
    this.startBtn.disabled = false;
    this.clearBtn.disabled = false;
    this.statusText.textContent = "Prêt à enregistrer";

    this.initSpeechRecognition();
  }

  showPermissionError() {
    this.microphoneOverlay.style.display = "none";
    this.permissionError.style.display = "flex";
    this.activateMicrophoneBtn.textContent = "🎤 ACTIVER LE MICROPHONE";
    this.activateMicrophoneBtn.disabled = false;
  }

  showError(message) {
    this.statusText.textContent = message;
    console.error("❌", message);
  }

  // Initialisation reconnaissance vocale (modifiée)
  initSpeechRecognition() {
    if (!this.microphoneActivated) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showError("Reconnaissance vocale non supportée");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "fr-FR";
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      console.log("✅ Reconnaissance vocale démarrée");
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += this.improveTranscript(transcript) + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.transcriptionText += finalTranscript;
        this.updateTranscriptionDisplay();
        this.generateSummary();
      }

      if (interimTranscript) {
        this.showInterimResults(interimTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error("❌ Erreur reconnaissance vocale:", event.error);
      if (event.error === "not-allowed") {
        this.showPermissionError();
      } else if (this.isRecording) {
        setTimeout(() => this.restartRecognition(), 1000);
      }
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        setTimeout(() => this.restartRecognition(), 500);
      }
    };
  }
  // Redémarrage automatique de la reconnaissance vocale
  restartRecognition() {
    if (!this.isRecording || !this.microphoneActivated) return;

    try {
      if (this.recognition) {
        this.recognition.start();
      }
    } catch (error) {
      console.warn("⚠️ Erreur redémarrage reconnaissance:", error);
      setTimeout(() => this.restartRecognition(), 2000);
    }
  }

  // Démarrage de l'enregistrement
  async startRecording() {
    if (!this.microphoneActivated) {
      this.showError("Microphone non activé");
      return;
    }

    try {
      // Obtenir le flux audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      // Configuration MediaRecorder
      const options = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options.mimeType = "audio/mp4";
      }

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.downloadAudio.disabled = false;
      };

      // Démarrer enregistrement
      this.mediaRecorder.start(1000);
      this.recognition.start();

      // Mise à jour état
      this.isRecording = true;
      this.startTime = Date.now();
      this.startTimer();

      // Mise à jour interface
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.statusText.textContent = "🔴 Enregistrement en cours...";
      document.body.classList.add("recording");

      console.log("✅ Enregistrement démarré");
    } catch (error) {
      console.error("❌ Erreur démarrage enregistrement:", error);
      this.showError("Impossible de démarrer l'enregistrement");
    }
  }

  // Arrêt de l'enregistrement
  stopRecording() {
    if (!this.isRecording) return;

    try {
      // Arrêter enregistrement
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
      }

      if (this.recognition) {
        this.recognition.stop();
      }

      // Mise à jour état
      this.isRecording = false;
      this.stopTimer();

      // Mise à jour interface
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
      this.statusText.textContent = "Enregistrement terminé";
      document.body.classList.remove("recording");

      // Activer téléchargements si du contenu existe
      if (this.transcriptionText.trim()) {
        this.downloadTranscript.disabled = false;
        this.downloadAll.disabled = false;
      }
      if (this.summaryElement.textContent.trim()) {
        this.downloadSummary.disabled = false;
      }

      console.log("✅ Enregistrement arrêté");
    } catch (error) {
      console.error("❌ Erreur arrêt enregistrement:", error);
    }
  }

  // Gestion du timer
  startTimer() {
    this.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      this.timerElement.textContent = `${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Amélioration du texte transcrit
  improveTranscript(text) {
    let improvedText = text;

    // Suppression des mots de remplissage
    this.fillerWords.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      improvedText = improvedText.replace(regex, "");
    });

    // Corrections automatiques
    Object.entries(this.corrections).forEach(([wrong, correct]) => {
      const regex = new RegExp(`\\b${wrong}\\b`, "gi");
      improvedText = improvedText.replace(regex, correct);
    });

    return improvedText
      .replace(/\s+/g, " ")
      .replace(/([.!?])\s*([A-Z])/g, "$1 $2")
      .trim();
  }

  // Mise à jour de l'affichage de la transcription
  updateTranscriptionDisplay() {
    const segment = document.createElement("div");
    segment.className = "transcript-segment";
    segment.textContent =
      this.transcriptionText.split(" ").slice(-20).join(" ") + " ";

    this.transcriptionElement.appendChild(segment);
    this.transcriptionElement.scrollTop =
      this.transcriptionElement.scrollHeight;
  }

  // Affichage des résultats intermédiaires
  showInterimResults(text) {
    const interimElement =
      this.transcriptionElement.querySelector(".interim-result");
    if (interimElement) {
      interimElement.remove();
    }

    const interim = document.createElement("div");
    interim.className = "interim-result";
    interim.style.opacity = "0.6";
    interim.style.fontStyle = "italic";
    interim.textContent = text;

    this.transcriptionElement.appendChild(interim);
    this.transcriptionElement.scrollTop =
      this.transcriptionElement.scrollHeight;
  }

  // Génération du résumé intelligent
  generateSummary() {
    if (!this.transcriptionText.trim()) return;

    const sentences = this.transcriptionText
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15)
      .map((s) => ({ text: s, score: 0 }));

    // Scoring des phrases
    sentences.forEach((sentence) => {
      const lowerText = sentence.text.toLowerCase();

      // Score basé sur les mots-clés business
      Object.entries(this.businessKeywords).forEach(([keyword, score]) => {
        if (lowerText.includes(keyword)) {
          sentence.score += score;
        }
      });

      // Bonus pour mots importants
      if (lowerText.includes("important") || lowerText.includes("décision")) {
        sentence.score += 4;
      }
      if (lowerText.includes("action") || lowerText.includes("tâche")) {
        sentence.score += 3;
      }

      // Bonus pour longueur appropriée
      if (sentence.text.length > 50 && sentence.text.length < 150) {
        sentence.score += 2;
      }
    });

    // Sélection des meilleures phrases
    const topSentences = sentences
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((s) => s.text);

    // Formatage du résumé
    if (topSentences.length > 0) {
      let summary = '<div class="summary-title">📋 Résumé de la réunion</div>';
      summary += '<div class="summary-content">';

      topSentences.forEach((sentence, index) => {
        summary += `<div class="summary-item">• ${sentence}.</div>`;
      });

      summary += "</div>";
      summary += `<div class="summary-footer">Généré le ${new Date().toLocaleDateString(
        "fr-FR"
      )} à ${new Date().toLocaleTimeString("fr-FR")}</div>`;

      this.summaryElement.innerHTML = summary;
    }
  }

  // Nettoyage complet
  clearAll() {
    if (this.isRecording) {
      this.stopRecording();
    }

    this.transcriptionText = "";
    this.transcriptionElement.innerHTML = "";
    this.summaryElement.innerHTML = "";
    this.audioChunks = [];
    this.timerElement.textContent = "00:00";
    this.statusText.textContent = "Prêt à enregistrer";

    // Désactiver les boutons de téléchargement
    this.downloadAudio.disabled = true;
    this.downloadTranscript.disabled = true;
    this.downloadSummary.disabled = true;
    this.downloadAll.disabled = true;

    console.log("🗑️ Données effacées");
  }

  // Téléchargement des fichiers
  downloadFile(type) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

    switch (type) {
      case "audio":
        if (this.audioChunks.length === 0) {
          alert("Aucun audio à télécharger");
          return;
        }
        const audioBlob = new Blob(this.audioChunks);
        const extension = this.isIOS ? "m4a" : "webm";
        this.downloadBlob(audioBlob, `reunion_audio_${timestamp}.${extension}`);
        break;

      case "transcript":
        if (!this.transcriptionText.trim()) {
          alert("Aucune transcription à télécharger");
          return;
        }
        const transcriptBlob = new Blob([this.transcriptionText], {
          type: "text/plain",
        });
        this.downloadBlob(
          transcriptBlob,
          `reunion_transcription_${timestamp}.txt`
        );
        break;

      case "summary":
        const summaryText = this.summaryElement.textContent.trim();
        if (!summaryText) {
          alert("Aucun résumé à télécharger");
          return;
        }
        const summaryBlob = new Blob([summaryText], { type: "text/plain" });
        this.downloadBlob(summaryBlob, `reunion_resume_${timestamp}.txt`);
        break;
    }
  }

  // Téléchargement de tous les fichiers
  downloadAllFiles(timestamp) {
    setTimeout(() => this.downloadFile("audio"), 0);
    setTimeout(() => this.downloadFile("transcript"), 500);
    setTimeout(() => this.downloadFile("summary"), 1000);
  }

  // Utilitaire de téléchargement
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`📥 Téléchargement: ${filename}`);
  }
}

// 🔥 INITIALISATION SIMPLIFIÉE
document.addEventListener("DOMContentLoaded", () => {
  try {
    const app = new MeetingTranscriber();
    console.log("✅ Transcripteur initialisé avec succès");
    window.transcriber = app; // Pour debug console
  } catch (error) {
    console.error("❌ Erreur critique initialisation:", error);
    alert(
      "Erreur d'initialisation de l'application. Veuillez recharger la page."
    );
  }
});
