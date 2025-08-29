class TranscripteurReunion {
    constructor() {
        this.recognition = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.transcriptionText = '';
        this.rawTranscriptionText = ''; // Nouvelle propriété pour le texte brut
        this.isRecording = false;
        this.startTime = null;
        this.timer = null;
        
        // Dictionnaires d'amélioration
        this.initCorrectionDictionaries();
        
        this.initElements();
        this.initSpeechRecognition();
        this.bindEvents();
    }

    initCorrectionDictionaries() {
        // Corrections automatiques des erreurs courantes
        this.corrections = {
            // Mots techniques souvent mal transcrits
            'ai': 'IA',
            'api': 'API',
            'cdi': 'CDI',
            'ses d i': 'CDI',
            'ces d i': 'CDI',
            'cdd': 'CDD',
            'rh': 'RH',
            'k p i': 'KPI',
            'roi': 'ROI',
            'p d f': 'PDF',
            'u r l': 'URL',
            'i p': 'IP',
            'seo': 'SEO',
            'crm': 'CRM',
            'erp': 'ERP',
            
            // Expressions métier
            'ça fait': 'cela fait',
            'y a': 'il y a',
            'faut qu\'on': 'il faut que nous',
            'va falloir': 'il va falloir',
            'c\'est à dire': 'c\'est-à-dire',
            
            // Corrections de ponctuation parlée
            'virgule': ',',
            'point': '.',
            'deux points': ':',
            'point virgule': ';',
            'point d\'interrogation': '?',
            'point d\'exclamation': '!',
            
            // Nombres souvent mal transcrits
            'un': '1',
            'deux': '2', 
            'trois': '3',
            'quatre': '4',
            'cinq': '5',
            'six': '6',
            'sept': '7',
            'huit': '8',
            'neuf': '9',
            'dix': '10',
            
            // Corrections contextuelles business
            'chiffre d\'affaire': 'chiffre d\'affaires',
            'ressources humaine': 'ressources humaines',
            'meeting': 'réunion',
            'call': 'appel',
            'deadline': 'échéance',
            'brief': 'briefing',
            'feedback': 'retour',
            'business': 'affaires'
        };

        // Mots-clés métier pour améliorer la contextualisation
        this.businessKeywords = [
            'budget', 'planning', 'deadline', 'livrable', 'milestone',
            'objectif', 'target', 'kpi', 'roi', 'revenus', 'coûts',
            'client', 'prospect', 'lead', 'conversion', 'acquisition',
            'marketing', 'commercial', 'ventes', 'négociation',
            'projet', 'équipe', 'ressource', 'compétence', 'formation',
            'stratégie', 'analyse', 'performance', 'résultat', 'impact',
            'réunion', 'présentation', 'rapport', 'dashboard', 'suivi'
        ];

        // Expressions à nettoyer (hésitations, tics de langage)
        this.fillerWords = [
            'euh', 'heu', 'hem', 'bon', 'voilà', 'donc euh',
            'en fait', 'du coup', 'genre', 'quoi', 'hein',
            'bon ben', 'alors euh', 'et puis euh'
        ];
    }

    initElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.statusText = document.getElementById('statusText');
        this.timerDisplay = document.getElementById('timer');
        this.transcriptionDiv = document.getElementById('transcription');
        this.summaryDiv = document.getElementById('summary');
        this.downloadAudio = document.getElementById('downloadAudio');
        this.downloadTranscript = document.getElementById('downloadTranscript');
        this.downloadSummary = document.getElementById('downloadSummary');
        this.downloadAll = document.getElementById('downloadAll');
    }

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            // Configuration optimisée
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'fr-FR';
            this.recognition.maxAlternatives = 3; // Améliore la précision
            
            // Redémarrage automatique en cas d'arrêt
            this.recognition.onend = () => {
                if (this.isRecording) {
                    console.log('Redémarrage automatique de la reconnaissance vocale');
                    setTimeout(() => {
                        if (this.isRecording) {
                            this.recognition.start();
                        }
                    }, 100);
                }
            };
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    
                    if (event.results[i].isFinal) {
                        // Post-processing intelligent du texte final
                        finalTranscript += this.improveTranscript(transcript) + '. ';
                    } else {
                        // Amélioration en temps réel pour l'affichage interim
                        interimTranscript += this.quickImprove(transcript);
                    }
                }
                
                if (finalTranscript) {
                    this.rawTranscriptionText += finalTranscript;
                    this.transcriptionText += finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();
                }
                
                // Affichage avec texte interim amélioré
                this.transcriptionDiv.innerHTML = this.transcriptionText + 
                    '<span class="interim">' + interimTranscript + '</span>';
            };
            
            this.recognition.onerror = (event) => {
                console.error('Erreur reconnaissance vocale:', event.error);
                
                // Gestion d'erreurs améliorée
                if (event.error === 'network') {
                    this.statusText.textContent = '⚠️ Problème réseau - Reconnexion...';
                    setTimeout(() => {
                        if (this.isRecording) {
                            this.recognition.start();
                        }
                    }, 1000);
                } else if (event.error === 'no-speech') {
                    this.statusText.textContent = '🔴 En attente de parole...';
                } else {
                    this.statusText.textContent = 'Erreur: ' + event.error;
                }
            };
        } else {
            alert('Votre navigateur ne supporte pas la reconnaissance vocale');
        }
    }

    // 🔥 NOUVELLE MÉTHODE : Amélioration intelligente du transcript
    improveTranscript(text) {
        let improved = text.toLowerCase().trim();
        
        // 1. Suppression des mots de remplissage
        this.fillerWords.forEach(filler => {
            const regex = new RegExp(`\\b${filler}\\b`, 'gi');
            improved = improved.replace(regex, '');
        });
        
        // 2. Application des corrections automatiques
        Object.entries(this.corrections).forEach(([wrong, correct]) => {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            improved = improved.replace(regex, correct);
        });
        
        // 3. Amélioration de la ponctuation
        improved = this.improvePunctuation(improved);
        
        // 4. Capitalisation intelligente
        improved = this.improveCapitalization(improved);
        
        // 5. Nettoyage des espaces multiples
        improved = improved.replace(/\s+/g, ' ').trim();
        
        return improved;
    }

    // Amélioration rapide pour l'affichage interim
    quickImprove(text) {
        let improved = text.toLowerCase();
        
        // Corrections rapides les plus courantes
        const quickFixes = {
            'euh': '',
            'heu': '',
            'bon': '',
            'donc euh': 'donc',
            'et puis euh': 'et puis'
        };
        
        Object.entries(quickFixes).forEach(([wrong, correct]) => {
            improved = improved.replace(new RegExp(wrong, 'gi'), correct);
        });
        
        return improved.trim();
    }

    // 🔥 NOUVELLE MÉTHODE : Amélioration de la ponctuation
    improvePunctuation(text) {
        // Ajout de virgules avant certains mots
        text = text.replace(/(\w+)\s+(mais|et|ou|donc|car|ni|or)\s+/gi, '$1, $2 ');
        
        // Ponctuation après certaines expressions
        text = text.replace(/\b(en effet|par exemple|notamment|c\'est-à-dire)\b/gi, ', $1,');
        
        // Points après les abréviations courantes
        text = text.replace(/\b(etc|cf|ex)\b/gi, '$1.');
        
        return text;
    }

    // 🔥 NOUVELLE MÉTHODE : Capitalisation intelligente
    improveCapitalization(text) {
        // Première lettre de phrase
        text = text.charAt(0).toUpperCase() + text.slice(1);
        
        // Après les points
        text = text.replace(/\.\s+([a-z])/g, '. $1'.toUpperCase());
        
        // Mots toujours en majuscules
        const alwaysCapital = ['API', 'KPI', 'ROI', 'PDF', 'URL', 'SEO', 'CRM', 'ERP', 'CDI', 'CDD', 'RH'];
        alwaysCapital.forEach(word => {
            const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'gi');
            text = text.replace(regex, word);
        });
        
        // Noms propres courants (vous pouvez ajouter votre entreprise, vos clients, etc.)
        const properNouns = ['Google', 'Microsoft', 'Apple', 'Adobe', 'Salesforce', 'LinkedIn'];
        properNouns.forEach(name => {
            const regex = new RegExp(`\\b${name.toLowerCase()}\\b`, 'gi');
            text = text.replace(regex, name);
        });
        
        return text;
    }

    // 🔥 MÉTHODE AMÉLIORÉE : Génération de résumé plus intelligente
    generateSummary() {
        const sentences = this.transcriptionText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const paragraphs = this.analyzeText(sentences);
        
        let summary = '📋 **RÉSUMÉ DE RÉUNION**\n\n';
        
        if (paragraphs.keyPoints.length > 0) {
            summary += '🎯 **POINTS CLÉS :**\n';
            paragraphs.keyPoints.forEach(point => {
                summary += `• ${point.trim()}\n`;
            });
            summary += '\n';
        }
        
        if (paragraphs.actions.length > 0) {
            summary += '✅ **ACTIONS À FAIRE :**\n';
            paragraphs.actions.forEach(action => {
                summary += `• ${action.trim()}\n`;
            });
            summary += '\n';
        }
        
        if (paragraphs.decisions.length > 0) {
            summary += '🎯 **DÉCISIONS PRISES :**\n';
            paragraphs.decisions.forEach(decision => {
                summary += `• ${decision.trim()}\n`;
            });
            summary += '\n';
        }
        
        if (paragraphs.questions.length > 0) {
            summary += '❓ **QUESTIONS/POINTS EN SUSPENS :**\n';
            paragraphs.questions.forEach(question => {
                summary += `• ${question.trim()}\n`;
            });
        }
        
        this.summaryDiv.innerHTML = summary.replace(/\n/g, '<br>');
    }

    // 🔥 NOUVELLE MÉTHODE : Analyse intelligente du texte
    analyzeText(sentences) {
        const result = {
            keyPoints: [],
            actions: [],
            decisions: [],
            questions: []
        };
        
        const actionTriggers = ['il faut', 'nous devons', 'il faudra', 'action', 'faire', 'créer', 'envoyer', 'préparer', 'organiser', 'contacter', 'planifier'];
        const decisionTriggers = ['décision', 'décidé', 'choix', 'retenu', 'validé', 'approuvé'];
        const questionTriggers = ['question', 'problème', 'comment', 'pourquoi', 'quand', 'qui', 'où'];
        const importantTriggers = ['important', 'essentiel', 'critique', 'urgent', 'priorité', 'objectif', 'budget', 'deadline', 'livrable'];
        
        sentences.forEach(sentence => {
            const lowerSentence = sentence.toLowerCase();
            
            // Classification des phrases
            if (actionTriggers.some(trigger => lowerSentence.includes(trigger))) {
                result.actions.push(sentence);
            } else if (decisionTriggers.some(trigger => lowerSentence.includes(trigger))) {
                result.decisions.push(sentence);
            } else if (questionTriggers.some(trigger => lowerSentence.includes(trigger))) {
                result.questions.push(sentence);
            } else if (importantTriggers.some(trigger => lowerSentence.includes(trigger)) || sentence.length > 50) {
                result.keyPoints.push(sentence);
            }
        });
        
        return result;
    }

    async bindEvents() {
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.downloadAudio.addEventListener('click', () => this.downloadFile('audio'));
        this.downloadTranscript.addEventListener('click', () => this.downloadFile('transcript'));
        this.downloadSummary.addEventListener('click', () => this.downloadFile('summary'));
        this.downloadAll.addEventListener('click', () => this.downloadFile('all'));
    }

    async startRecording() {
        try {
            // Configuration audio optimisée
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                    ? 'audio/webm;codecs=opus' 
                    : 'audio/webm'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(1000); // Enregistrement par chunks de 1s pour de meilleures performances
            this.recognition.start();
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.startTimer();
            
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusText.textContent = '🔴 Enregistrement en cours - Qualité optimisée';
            
        } catch (error) {
            console.error('Erreur démarrage:', error);
            alert('Erreur: Impossible d\'accéder au microphone');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.recognition.stop();
            
            this.isRecording = false;
            this.stopTimer();
            
            // Post-processing final de toute la transcription
            this.transcriptionText = this.finalPostProcessing(this.transcriptionText);
            this.updateTranscription();
            this.generateSummary();
            
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.statusText.textContent = '✅ Enregistrement terminé - Transcription optimisée';
        }
    }

    // 🔥 NOUVELLE MÉTHODE : Post-processing final
    finalPostProcessing(text) {
        // Suppression des répétitions
        text = this.removeRepetitions(text);
        
        // Amélioration de la structure des phrases
        text = this.improveStructure(text);
        
        return text.trim();
    }

    removeRepetitions(text) {
        // Supprime les mots répétés consécutivement
        return text.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
    }

    improveStructure(text) {
        // Améliore la structure générale du texte
        return text
            .replace(/\s*\.\s*\./g, '.') // Double points
            .replace(/\s+/g, ' ') // Espaces multiples
            .replace(/\.\s*([a-z])/g, (match, p1) => '. ' + p1.toUpperCase()); // Majuscule après point
    }

    startTimer() {
        this.timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.timerDisplay.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateTranscription() {
        this.transcriptionDiv.innerHTML = this.transcriptionText.replace(/\n/g, '<br>');
    }

    clearAll() {
        if (confirm('Effacer tout le contenu ?')) {
            this.transcriptionText = '';
            this.rawTranscriptionText = '';
            this.transcriptionDiv.innerHTML = '';
            this.summaryDiv.innerHTML = '';
            this.audioChunks = [];
            this.timerDisplay.textContent = '00:00';
            this.statusText.textContent = 'Prêt à enregistrer';
        }
    }

    downloadFile(type) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        switch(type) {
            case 'audio':
                if (this.audioChunks.length > 0) {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    this.downloadBlob(audioBlob, `reunion-audio-${timestamp}.webm`);
                }
                break;
                
            case 'transcript':
                const transcriptText = this.transcriptionDiv.textContent || this.transcriptionText;
                const transcriptBlob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(transcriptBlob, `transcription-optimisee-${timestamp}.txt`);
                break;
                
            case 'summary':
                const summaryText = this.summaryDiv.textContent;
                const summaryBlob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(summaryBlob, `resume-intelligent-${timestamp}.txt`);
                break;
                
            case 'all':
                this.downloadAll(timestamp);
                break;
        }
    }

    downloadAll(timestamp) {
        if (this.audioChunks.length > 0) {
            setTimeout(() => this.downloadFile('audio'), 100);
        }
        setTimeout(() => this.downloadFile('transcript'), 200);
        setTimeout(() => this.downloadFile('summary'), 300);
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    new TranscripteurReunion();
});
