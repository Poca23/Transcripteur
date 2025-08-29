class TranscripteurReunion {
    constructor() {
        this.recognition = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.transcriptionText = '';
        this.rawTranscriptionText = '';
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
            'ai': 'IA', 'api': 'API', 'cdi': 'CDI', 'ses d i': 'CDI', 'ces d i': 'CDI',
            'cdd': 'CDD', 'rh': 'RH', 'k p i': 'KPI', 'roi': 'ROI', 'p d f': 'PDF',
            'u r l': 'URL', 'i p': 'IP', 'seo': 'SEO', 'crm': 'CRM', 'erp': 'ERP',

            // Expressions métier
            'ça fait': 'cela fait', 'y a': 'il y a', 'faut qu\'on': 'il faut que nous',
            'va falloir': 'il va falloir', 'c\'est à dire': 'c\'est-à-dire',

            // Corrections de ponctuation parlée
            'virgule': ',', 'point': '.', 'deux points': ':', 'point virgule': ';',
            'point d\'interrogation': '?', 'point d\'exclamation': '!',

            // Corrections contextuelles business
            'chiffre d\'affaire': 'chiffre d\'affaires', 'ressources humaine': 'ressources humaines',
            'meeting': 'réunion', 'call': 'appel', 'deadline': 'échéance', 'brief': 'briefing',
            'feedback': 'retour', 'business': 'affaires'
        };

        // Mots-clés métier
        this.businessKeywords = [
            'budget', 'planning', 'deadline', 'livrable', 'milestone', 'objectif', 'target',
            'kpi', 'roi', 'revenus', 'coûts', 'client', 'prospect', 'lead', 'conversion',
            'marketing', 'commercial', 'ventes', 'négociation', 'projet', 'équipe'
        ];

        // Expressions à nettoyer
        this.fillerWords = [
            'euh', 'heu', 'hem', 'bon', 'voilà', 'donc euh', 'en fait', 'du coup',
            'genre', 'quoi', 'hein', 'bon ben', 'alors euh', 'et puis euh'
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

            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'fr-FR';
            this.recognition.maxAlternatives = 3;

            this.recognition.onend = () => {
                if (this.isRecording) {
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
                        finalTranscript += this.improveTranscript(transcript) + '. ';
                    } else {
                        interimTranscript += this.quickImprove(transcript);
                    }
                }

                if (finalTranscript) {
                    this.rawTranscriptionText += finalTranscript;
                    this.transcriptionText += finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();
                }

                this.transcriptionDiv.innerHTML = this.formatTranscriptionForDisplay(this.transcriptionText) + 
                    '<span class="interim">' + interimTranscript + '</span>';
            };

            this.recognition.onerror = (event) => {
                console.error('Erreur reconnaissance vocale:', event.error);
                if (event.error === 'network') {
                    this.statusText.textContent = '⚠️ Problème réseau - Reconnexion...';
                }
            };
        } else {
            alert('Votre navigateur ne supporte pas la reconnaissance vocale');
        }
    }

    // 🔥 NOUVEAU : Formatage de la transcription avec paragraphes
    formatTranscriptionForDisplay(text) {
        if (!text) return '';

        // Division en paragraphes logiques (tous les 3-4 phrases)
        const sentences = text.split(/(?<=[.!?])\s+/);
        let formatted = '';
        let sentenceCount = 0;

        sentences.forEach(sentence => {
            if (sentence.trim()) {
                formatted += sentence.trim();
                
                // Ajout d'un saut de ligne après certains mots clés
                if (sentence.toLowerCase().includes('maintenant') || 
                    sentence.toLowerCase().includes('ensuite') ||
                    sentence.toLowerCase().includes('d\'autre part')) {
                    formatted += '<br><br>';
                    sentenceCount = 0;
                } else {
                    formatted += ' ';
                    sentenceCount++;
                    
                    // Nouveau paragraphe tous les 3-4 phrases
                    if (sentenceCount >= 4) {
                        formatted += '<br><br>';
                        sentenceCount = 0;
                    }
                }
            }
        });

        return formatted.trim();
    }

    improveTranscript(text) {
        let improved = text.toLowerCase().trim();

        // Suppression des mots de remplissage
        this.fillerWords.forEach(filler => {
            const regex = new RegExp(`\\b${filler}\\b`, 'gi');
            improved = improved.replace(regex, '');
        });

        // Application des corrections automatiques
        Object.entries(this.corrections).forEach(([wrong, correct]) => {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            improved = improved.replace(regex, correct);
        });

        // Amélioration de la ponctuation et capitalisation
        improved = this.improvePunctuation(improved);
        improved = this.improveCapitalization(improved);
        improved = improved.replace(/\s+/g, ' ').trim();

        return improved;
    }

    quickImprove(text) {
        let improved = text.toLowerCase();
        const quickFixes = {
            'euh': '', 'heu': '', 'bon': '', 'donc euh': 'donc', 'et puis euh': 'et puis'
        };

        Object.entries(quickFixes).forEach(([wrong, correct]) => {
            improved = improved.replace(new RegExp(wrong, 'gi'), correct);
        });

        return improved.trim();
    }

    improvePunctuation(text) {
        text = text.replace(/(\w+)\s+(mais|et|ou|donc|car|ni|or)\s+/gi, '$1, $2 ');
        text = text.replace(/\b(en effet|par exemple|notamment|c\'est-à-dire)\b/gi, ', $1,');
        return text;
    }

    improveCapitalization(text) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
        text = text.replace(/\.\s+([a-z])/g, (match, p1) => '. ' + p1.toUpperCase());

        const alwaysCapital = ['API', 'KPI', 'ROI', 'PDF', 'URL', 'SEO', 'CRM', 'ERP', 'CDI', 'CDD', 'RH'];
        alwaysCapital.forEach(word => {
            const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'gi');
            text = text.replace(regex, word);
        });

        return text;
    }

    // 🔥 NOUVELLE VERSION : Génération de résumé avec formatage parfait
    generateSummary() {
        const sentences = this.transcriptionText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length === 0) return;

        const analysis = this.analyzeTextForSummary(sentences);
        const currentDate = new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // 🎯 RÉSUMÉ HTML AVEC FORMATAGE PROFESSIONNEL
        let summaryHTML = `<div class="summary-header">
            <div class="summary-title">RÉSUMÉ DE RÉUNION</div>
            <div class="summary-date">${currentDate}</div>
        </div>`;

        // Section Points Essentiels
        if (analysis.keyPoints.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">🎯 POINTS ESSENTIELS</div>`;
            analysis.keyPoints.slice(0, 3).forEach(point => {
                const cleanPoint = this.condenseSentence(point);
                summaryHTML += `<div class="summary-item">${cleanPoint}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Actions Prioritaires
        if (analysis.actions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">✅ ACTIONS PRIORITAIRES</div>`;
            analysis.actions.slice(0, 4).forEach(action => {
                const cleanAction = this.condenseSentence(action);
                summaryHTML += `<div class="summary-item">${cleanAction}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Décisions
        if (analysis.decisions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">🎯 DÉCISIONS PRISES</div>`;
            analysis.decisions.slice(0, 3).forEach(decision => {
                const cleanDecision = this.condenseSentence(decision);
                summaryHTML += `<div class="summary-item">${cleanDecision}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Points en Suspens
        if (analysis.questions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">❓ POINTS EN SUSPENS</div>`;
            analysis.questions.slice(0, 3).forEach(question => {
                const cleanQuestion = this.condenseSentence(question);
                summaryHTML += `<div class="summary-item">${cleanQuestion}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Synthèse finale si nécessaire
        if (analysis.totalPoints > 8) {
            const keyInsight = this.extractKeyInsight(sentences);
            if (keyInsight) {
                summaryHTML += `<div class="summary-section">
                    <div class="summary-section-title">💡 SYNTHÈSE GÉNÉRALE</div>
                    <div class="summary-item summary-highlight">${keyInsight}</div>
                </div>`;
            }
        }

        this.summaryDiv.innerHTML = summaryHTML;
    }

    analyzeTextForSummary(sentences) {
        const result = { keyPoints: [], actions: [], decisions: [], questions: [], totalPoints: 0 };

        const actionTriggers = {
            'il faut': 3, 'nous devons': 3, 'il faudra': 3, 'action': 2,
            'faire': 1, 'créer': 2, 'envoyer': 1, 'préparer': 2,
            'organiser': 2, 'contacter': 1, 'planifier': 2, 'livrer': 3
        };

        const decisionTriggers = {
            'décision': 3, 'décidé': 3, 'choix': 2, 'retenu': 2,
            'validé': 3, 'approuvé': 3, 'choisi': 2, 'opté': 2
        };

        const questionTriggers = {
            'question': 2, 'problème': 3, 'comment': 1, 'pourquoi': 1,
            'reste à': 2, 'à clarifier': 3, 'à voir': 2
        };

        const importantTriggers = {
            'important': 3, 'essentiel': 3, 'critique': 3, 'urgent': 3,
            'priorité': 3, 'objectif': 2, 'budget': 2, 'deadline': 3
        };

        sentences.forEach(sentence => {
            const lowerSentence = sentence.toLowerCase().trim();
            if (lowerSentence.length < 15) return;

            let maxScore = 0;
            let category = null;

            const actionScore = this.calculateScore(lowerSentence, actionTriggers);
            const decisionScore = this.calculateScore(lowerSentence, decisionTriggers);
            const questionScore = this.calculateScore(lowerSentence, questionTriggers);
            const importantScore = this.calculateScore(lowerSentence, importantTriggers);

            if (actionScore > maxScore) { maxScore = actionScore; category = 'actions'; }
            if (decisionScore > maxScore) { maxScore = decisionScore; category = 'decisions'; }
            if (questionScore > maxScore) { maxScore = questionScore; category = 'questions'; }
            if (importantScore > maxScore) { maxScore = importantScore; category = 'keyPoints'; }

            if (maxScore >= 2) {
                result[category].push({ sentence: sentence.trim(), score: maxScore });
            } else if (sentence.length > 80) {
                result.keyPoints.push({ sentence: sentence.trim(), score: 1 });
            }
        });

        // Tri et nettoyage
        Object.keys(result).forEach(key => {
            if (Array.isArray(result[key])) {
                result[key] = result[key]
                    .sort((a, b) => b.score - a.score)
                    .map(item => item.sentence)
                    .filter((sentence, index, array) => 
                        !array.slice(0, index).some(prev => 
                            this.sentenceSimilarity(sentence, prev) > 0.7
                        )
                    );
            }
        });

        result.totalPoints = result.keyPoints.length + result.actions.length + 
                           result.decisions.length + result.questions.length;

        return result;
    }

    calculateScore(sentence, triggers) {
        let score = 0;
        Object.entries(triggers).forEach(([trigger, weight]) => {
            if (sentence.includes(trigger)) score += weight;
        });
        return score;
    }

    condenseSentence(sentence) {
        let condensed = sentence.trim();

        const redundantPhrases = [
            'je pense que', 'il me semble que', 'à mon avis',
            'en fait', 'du coup', 'donc voilà', 'bon ben'
        ];

        redundantPhrases.forEach(phrase => {
            condensed = condensed.replace(new RegExp(phrase, 'gi'), '');
        });

        const shortenings = {
            'il faut que nous': 'nous devons',
            'il va falloir que': 'il faut',
            'nous allons devoir': 'nous devons'
        };

        Object.entries(shortenings).forEach(([long, short]) => {
            condensed = condensed.replace(new RegExp(long, 'gi'), short);
        });

        if (condensed.length > 120) {
            condensed = condensed.substring(0, 117) + '...';
        }

        return condensed.trim();
    }

    extractKeyInsight(sentences) {
        const insights = sentences.filter(s => {
            const lower = s.toLowerCase();
            return (lower.includes('résultat') || lower.includes('conclusion') || 
                   lower.includes('important') || lower.includes('essentiel')) && 
                   s.length > 50;
        });

        return insights.length > 0 ? this.condenseSentence(insights[0]) : null;
    }

    sentenceSimilarity(sentence1, sentence2) {
        const words1 = sentence1.toLowerCase().split(' ');
        const words2 = sentence2.toLowerCase().split(' ');
        const commonWords = words1.filter(word => words2.includes(word));

        return commonWords.length / Math.max(words1.length, words2.length);
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

            this.mediaRecorder.start(1000);
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

            this.transcriptionText = this.finalPostProcessing(this.transcriptionText);
            this.updateTranscription();
            this.generateSummary();

            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.statusText.textContent = '✅ Enregistrement terminé - Transcription optimisée';
        }
    }

    finalPostProcessing(text) {
        text = this.removeRepetitions(text);
        text = this.improveStructure(text);
        return text.trim();
    }

    removeRepetitions(text) {
        return text.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
    }

    improveStructure(text) {
        return text
            .replace(/\s*\.\s*\./g, '.')
            .replace(/\s+/g, ' ')
            .replace(/\.\s*([a-z])/g, (match, p1) => '. ' + p1.toUpperCase());
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
        this.transcriptionDiv.innerHTML = this.formatTranscriptionForDisplay(this.transcriptionText);
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
                const transcriptText = this.formatTranscriptionForDownload(this.transcriptionText);
                const transcriptBlob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(transcriptBlob, `transcription-formatee-${timestamp}.txt`);
                break;

            case 'summary':
                const summaryHTML = this.summaryDiv.innerHTML;
                const summaryText = this.convertSummaryToFormattedText(summaryHTML);
                const summaryBlob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(summaryBlob, `resume-professionnel-${timestamp}.txt`);
                break;

            case 'all':
                this.downloadAll(timestamp);
                break;
        }
    }

    // 🔥 NOUVEAU : Formatage de la transcription pour téléchargement
    formatTranscriptionForDownload(text) {
        if (!text) return 'Aucune transcription disponible.';

        const currentDate = new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const sentences = text.split(/(?<=[.!?])\s+/);
        let formatted = `TRANSCRIPTION DE RÉUNION\n${currentDate}\n\n`;
        formatted += '=' .repeat(50) + '\n\n';

        let paragraphSentences = [];
        
        sentences.forEach((sentence, index) => {
            if (sentence.trim()) {
                paragraphSentences.push(sentence.trim());
                
                // Nouveau paragraphe tous les 3-4 phrases ou sur mots-clés
                if (paragraphSentences.length >= 4 || 
                    sentence.toLowerCase().includes('maintenant') ||
                    sentence.toLowerCase().includes('ensuite') ||
                    sentence.toLowerCase().includes('d\'autre part')) {
                    
                    formatted += paragraphSentences.join(' ') + '\n\n';
                    paragraphSentences = [];
                }
            }
        });

        // Ajout des phrases restantes
        if (paragraphSentences.length > 0) {
            formatted += paragraphSentences.join(' ') + '\n\n';
        }

        formatted += '=' .repeat(50) + '\n';
        formatted += `Fin de la transcription - ${new Date().toLocaleTimeString('fr-FR')}`;

        return formatted;
    }

    // 🔥 NOUVEAU : Conversion HTML du résumé vers texte formaté professionnel
    convertSummaryToFormattedText(htmlContent) {
        if (!htmlContent) return 'Aucun résumé disponible.';

        let textContent = htmlContent;

        // Remplacement des balises par formatage texte professionnel
        textContent = textContent
            // En-tête principal
            .replace(/<div class="summary-header">[\s\S]*?<div class="summary-title">(.*?)<\/div>[\s\S]*?<div class="summary-date">(.*?)<\/div>[\s\S]*?<\/div>/g, 
                '$1\n$2\n\n' + '='.repeat(60) + '\n')
            
            // Sections principales
            .replace(/<div class="summary-section-title">(.*?)<\/div>/g, '\n\n$1\n' + '-'.repeat(30))
            
            // Items avec puces
            .replace(/<div class="summary-item">(.*?)<\/div>/g, '\n  • $1')
            
            // Highlights
            .replace(/<div class="summary-item summary-highlight">(.*?)<\/div>/g, '\n  ★ $1')
            
            // Nettoyage des balises restantes
            .replace(/<div class="summary-section">/g, '')
            .replace(/<\/div>/g, '')
            .replace(/<br>/g, '\n')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Formatage final
        textContent = textContent
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Triple saut = double saut
            .replace(/^\n+/, '') // Suppression sauts début
            .replace(/\n+$/, '') // Suppression sauts fin
            + '\n\n' + '='.repeat(60) + '\n'
            + `Résumé généré le ${new Date().toLocaleString('fr-FR')}`;

        return textContent;
    }

    downloadAll(timestamp) {
        if (this.audioChunks.length > 0) {
            setTimeout(() => this.downloadFile('audio'), 100);
        }
        setTimeout(() => this.downloadFile('transcript'), 300);
        setTimeout(() => this.downloadFile('summary'), 500);
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
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
