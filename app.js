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
        
        // 🔥 NOUVEAU : Gestion des pauses
        this.lastSpeechTime = null;
        this.pauseTimeout = null;
        this.pauseThreshold = 2000; // 2 secondes
        this.transcriptionSegments = []; // Pour créer des sous-titres

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

        // Mots-clés métier avec scoring
        this.businessKeywords = {
            'budget': 3, 'planning': 2, 'deadline': 3, 'livrable': 2, 'milestone': 2,
            'objectif': 3, 'target': 2, 'kpi': 3, 'roi': 3, 'revenus': 3, 'coûts': 2,
            'client': 2, 'prospect': 2, 'lead': 2, 'conversion': 2, 'marketing': 2,
            'commercial': 2, 'ventes': 2, 'négociation': 2, 'projet': 2, 'équipe': 1
        };

        // Expressions à nettoyer
        this.fillerWords = [
            'euh', 'heu', 'hem', 'bon', 'voilà', 'donc euh', 'en fait', 'du coup',
            'genre', 'quoi', 'hein', 'bon ben', 'alors euh', 'et puis euh'
        ];

        // 🔥 NOUVEAU : Mots-clés pour sous-titres automatiques
        this.subtitleKeywords = {
            'budget': ['Budget', 'Finances', 'Économie'],
            'planning': ['Planning', 'Organisation', 'Calendrier'],
            'objectif': ['Objectifs', 'Cibles', 'Ambitions'],
            'problème': ['Problématiques', 'Difficultés', 'Enjeux'],
            'solution': ['Solutions', 'Propositions', 'Résolutions'],
            'équipe': ['Équipe', 'Ressources', 'Personnel'],
            'client': ['Clients', 'Relations', 'Commercial'],
            'projet': ['Projet', 'Développement', 'Réalisation'],
            'décision': ['Décisions', 'Choix', 'Validations'],
            'action': ['Actions', 'Tâches', 'Missions']
        };
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

            // 🔥 NOUVEAU : Gestion des pauses et sauts de ligne
            this.recognition.onresult = (event) => {
                this.lastSpeechTime = Date.now();
                
                // Annuler le timeout de pause précédent
                if (this.pauseTimeout) {
                    clearTimeout(this.pauseTimeout);
                }

                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;

                    if (event.results[i].isFinal) {
                        const improvedText = this.improveTranscript(transcript);
                        finalTranscript += improvedText + '. ';
                        
                        // 🔥 NOUVEAU : Stockage pour sous-titres
                        this.transcriptionSegments.push({
                            text: improvedText,
                            timestamp: Date.now(),
                            keywords: this.extractKeywords(improvedText)
                        });
                    } else {
                        interimTranscript += this.quickImprove(transcript);
                    }
                }

                if (finalTranscript) {
                    this.rawTranscriptionText += finalTranscript;
                    this.transcriptionText += finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();

                    // 🔥 Démarrer le timer pour détecter les pauses
                    this.startPauseTimer();
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

    // 🔥 NOUVEAU : Gestion des pauses avec saut de ligne automatique
    startPauseTimer() {
        this.pauseTimeout = setTimeout(() => {
            if (this.isRecording) {
                this.transcriptionText += '\n\n';
                this.updateTranscription();
                console.log('Pause détectée - Saut de ligne ajouté');
            }
        }, this.pauseThreshold);
    }

    // 🔥 NOUVEAU : Extraction des mots-clés pour sous-titres
    extractKeywords(text) {
        const lowerText = text.toLowerCase();
        const foundKeywords = [];

        Object.keys(this.businessKeywords).forEach(keyword => {
            if (lowerText.includes(keyword)) {
                foundKeywords.push(keyword);
            }
        });

        return foundKeywords;
    }

    // 🔥 NOUVEAU : Génération de sous-titres intelligents
    generateSubtitle(segment) {
        const keywords = segment.keywords;
        if (keywords.length === 0) return 'Discussion Générale';

        // Prioriser par ordre d'importance
        const priorities = ['budget', 'objectif', 'projet', 'client', 'planning', 'équipe'];
        for (let priority of priorities) {
            if (keywords.includes(priority) && this.subtitleKeywords[priority]) {
                return this.subtitleKeywords[priority][0];
            }
        }

        // Fallback avec le premier mot-clé trouvé
        const firstKeyword = keywords[0];
        if (this.subtitleKeywords[firstKeyword]) {
            return this.subtitleKeywords[firstKeyword][0];
        }

        return 'Points Importants';
    }

    // 🔥 NOUVEAU : Génération de sous-titre principal intelligent
    generateMainSubtitle(analysis) {
        const allSegments = this.transcriptionSegments;
        const keywordCounts = {};

        // Compter les occurrences des mots-clés
        allSegments.forEach(segment => {
            segment.keywords.forEach(keyword => {
                keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
            });
        });

        // Trouver le thème dominant
        const sortedKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);

        if (sortedKeywords.length === 0) return 'Réunion de Travail';

        const [dominantKeyword] = sortedKeywords[0];
        if (this.subtitleKeywords[dominantKeyword]) {
            return this.subtitleKeywords[dominantKeyword][0] + ' & Stratégie';
        }

        return 'Points Stratégiques';
    }

    formatTranscriptionForDisplay(text) {
        const paragraphs = text.split(/\n\n+/);
        let formatted = '';

        paragraphs.forEach((paragraph, index) => {
            if (paragraph.trim()) {
                formatted += `<div class="transcript-segment">
                    <div class="transcript-timestamp">Segment ${index + 1}</div>
                    ${paragraph.trim()}
                </div>`;
            }
        });

        return formatted;
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

    // 🔥 VERSION AMÉLIORÉE : Résumé avec sous-titres dynamiques
    generateSummary() {
        const sentences = this.transcriptionText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length === 0) return;

        const analysis = this.analyzeTextForSummary(sentences);
        const currentDate = new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // 🔥 NOUVEAU : Génération de sous-titre principal intelligent
        const mainSubtitle = this.generateMainSubtitle(analysis);

        // 🎯 RÉSUMÉ HTML AVEC SOUS-TITRE DYNAMIQUE
        let summaryHTML = `<div class="summary-header">
            <div class="summary-title">RÉSUMÉ DE RÉUNION</div>
            <div class="summary-subtitle">${mainSubtitle}</div>
            <div class="summary-date">${currentDate}</div>
        </div>`;

        // Section Points Essentiels
        if (analysis.keyPoints.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">🎯 POINTS ESSENTIELS</div>`;
            analysis.keyPoints.slice(0, 3).forEach(point => {
                const cleanPoint = this.ensureCompleteSentence(point);
                summaryHTML += `<div class="summary-item">${cleanPoint}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Actions Prioritaires
        if (analysis.actions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">✅ ACTIONS PRIORITAIRES</div>`;
            analysis.actions.slice(0, 4).forEach(action => {
                const cleanAction = this.ensureCompleteSentence(action);
                summaryHTML += `<div class="summary-item">${cleanAction}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Décisions
        if (analysis.decisions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">🎯 DÉCISIONS PRISES</div>`;
            analysis.decisions.slice(0, 3).forEach(decision => {
                const cleanDecision = this.ensureCompleteSentence(decision);
                summaryHTML += `<div class="summary-item">${cleanDecision}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Section Questions
        if (analysis.questions.length > 0) {
            summaryHTML += `<div class="summary-section">
                <div class="summary-section-title">❓ QUESTIONS EN SUSPENS</div>`;
            analysis.questions.slice(0, 3).forEach(question => {
                const cleanQuestion = this.ensureCompleteSentence(question);
                summaryHTML += `<div class="summary-item">${cleanQuestion}</div>`;
            });
            summaryHTML += `</div>`;
        }

        // Insight principal si disponible
        const keyInsight = this.extractKeyInsight(sentences);
        if (keyInsight) {
            summaryHTML += `<div class="summary-highlight">
                ${this.ensureCompleteSentence(keyInsight)}
            </div>`;
        }

        this.summaryDiv.innerHTML = summaryHTML;
    }

    // 🔥 NOUVEAU : Fonction pour s'assurer que les phrases sont complètes
    ensureCompleteSentence(sentence) {
        let cleaned = sentence.trim();
        
        // Supprimer les "..." en fin
        cleaned = cleaned.replace(/\.\.\.+$/g, '');
        
        // Nettoyer les expressions redondantes
        const redundantPhrases = [
            'je pense que', 'il me semble que', 'à mon avis',
            'en fait', 'du coup', 'donc voilà', 'bon ben'
        ];

        redundantPhrases.forEach(phrase => {
            cleaned = cleaned.replace(new RegExp(`^${phrase}\\s+`, 'gi'), '');
            cleaned = cleaned.replace(new RegExp(`\\s+${phrase}\\s+`, 'gi'), ' ');
        });

        // Raccourcir intelligemment les phrases trop longues sans couper
        if (cleaned.length > 150) {
            // Chercher une virgule ou un point-virgule proche de 120 caractères
            const cutPoints = [',', ';', ' et ', ' mais ', ' car '];
            let bestCut = -1;
            
            for (let cutPoint of cutPoints) {
                const index = cleaned.lastIndexOf(cutPoint, 120);
                if (index > 80) {
                    bestCut = index + cutPoint.length;
                    break;
                }
            }
            
            if (bestCut > 0) {
                cleaned = cleaned.substring(0, bestCut).trim();
            } else if (cleaned.length > 140) {
                // En dernier recours, couper au mot le plus proche
                const words = cleaned.substring(0, 120).split(' ');
                words.pop(); // Supprimer le dernier mot potentiellement coupé
                cleaned = words.join(' ');
            }
        }

        // S'assurer que la phrase finit par un point
        if (cleaned && !cleaned.match(/[.!?]$/)) {
            cleaned += '.';
        }

        return cleaned;
    }

    analyzeTextForSummary(sentences) {
        const result = {
            keyPoints: [],
            actions: [],
            decisions: [],
            questions: [],
            totalPoints: 0
        };

        const actionTriggers = {
            'il faut': 3, 'nous devons': 3, 'il faudra': 3, 'on doit': 3,
            'action': 2, 'tâche': 2, 'faire': 1, 'réaliser': 2
        };

        const questionTriggers = {
            'question': 3, 'problème': 2, 'comment': 2, 'pourquoi': 2,
            'qu\'est-ce': 2, 'est-ce que': 2
        };

        const decisionTriggers = {
            'décision': 3, 'choix': 2, 'opter': 2, 'retenir': 2,
            'valider': 2, 'approuver': 2, 'décider': 3
        };

        sentences.forEach(sentence => {
            sentence = sentence.trim();
            const lowerSentence = sentence.toLowerCase();
            
            if (sentence.length < 15) return;

            const actionScore = this.calculateScore(lowerSentence, actionTriggers);
            const questionScore = this.calculateScore(lowerSentence, questionTriggers);
            const decisionScore = this.calculateScore(lowerSentence, decisionTriggers);

            // Calcul score importance basé sur mots-clés métier
            let importantScore = 0;
            Object.entries(this.businessKeywords).forEach(([keyword, weight]) => {
                if (lowerSentence.includes(keyword)) {
                    importantScore += weight;
                }
            });

            // Classification
            let maxScore = Math.max(actionScore, questionScore, decisionScore, importantScore);
            let category = 'keyPoints';

            if (actionScore > maxScore * 0.8) category = 'actions';
            if (decisionScore > maxScore * 0.8) category = 'decisions';
            if (questionScore > maxScore * 0.8) category = 'questions';

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

    extractKeyInsight(sentences) {
        const insights = sentences.filter(s => {
            const lower = s.toLowerCase();
            return (lower.includes('résultat') || lower.includes('conclusion') ||
                   lower.includes('impact') || lower.includes('bilan') ||
                   lower.includes('principal') || lower.includes('essentiel'));
        });

        if (insights.length > 0) {
            return this.ensureCompleteSentence(insights[0]);
        }

        // Fallback: prendre la phrase la plus longue avec des mots-clés importants
        const importantSentences = sentences.filter(s => {
            const lower = s.toLowerCase();
            return (lower.includes('objectif') || lower.includes('projet') ||
                   lower.includes('équipe') || lower.includes('client'));
        });

        if (importantSentences.length > 0) {
            const longest = importantSentences.reduce((a, b) => a.length > b.length ? a : b);
            return this.ensureCompleteSentence(longest);
        }

        return null;
    }

    sentenceSimilarity(sentence1, sentence2) {
        const words1 = sentence1.toLowerCase().split(' ').filter(w => w.length > 3);
        const words2 = sentence2.toLowerCase().split(' ').filter(w => w.length > 3);
        
        if (words1.length === 0 || words2.length === 0) return 0;
        
        const intersection = words1.filter(word => words2.includes(word));
        return intersection.length / Math.max(words1.length, words2.length);
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearAll());

        // Téléchargements
        this.downloadAudio.addEventListener('click', () => this.downloadFile('audio'));
        this.downloadTranscript.addEventListener('click', () => this.downloadFile('transcript'));
        this.downloadSummary.addEventListener('click', () => this.downloadFile('summary'));
        this.downloadAll.addEventListener('click', () => {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            this.downloadAll(timestamp);
        });
    }

    async startRecording() {
        try {
            // Démarrer l'enregistrement audio
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();

            // Démarrer la reconnaissance vocale
            this.recognition.start();

            // Mise à jour de l'interface
            this.isRecording = true;
            this.startTime = Date.now();
            this.lastSpeechTime = Date.now(); // 🔥 NOUVEAU
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusText.textContent = '🔴 Enregistrement en cours...';
            document.body.classList.add('recording');

            this.startTimer();

        } catch (error) {
            console.error('Erreur accès microphone:', error);
            alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
        }
    }

    stopRecording() {
        // Arrêter tous les processus
        this.isRecording = false;
        
        if (this.recognition) {
            this.recognition.stop();
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
        }

        // Mise à jour interface
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.statusText.textContent = '⏹️ Enregistrement terminé';
        document.body.classList.remove('recording');

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    clearAll() {
        // Réinitialiser toutes les données
        this.transcriptionText = '';
        this.rawTranscriptionText = '';
        this.transcriptionSegments = []; // 🔥 NOUVEAU
        this.audioChunks = [];
        this.transcriptionDiv.innerHTML = '';
        this.summaryDiv.innerHTML = '';
        this.timerDisplay.textContent = '00:00';
        this.statusText.textContent = 'Prêt à enregistrer';

        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
        }
    }

    updateTranscription() {
        this.transcriptionDiv.innerHTML = this.formatTranscriptionForDisplay(this.transcriptionText);
        this.transcriptionDiv.scrollTop = this.transcriptionDiv.scrollHeight;
    }

    downloadFile(type) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        switch(type) {
            case 'audio':
                if (this.audioChunks.length === 0) {
                    alert('Aucun audio à télécharger');
                    return;
                }
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.downloadBlob(audioBlob, `reunion_audio_${timestamp}.wav`);
                break;

            case 'transcript':
                if (!this.transcriptionText.trim()) {
                    alert('Aucune transcription à télécharger');
                    return;
                }
                const transcriptContent = this.formatTranscriptForDownload();
                const transcriptBlob = new Blob([transcriptContent], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(transcriptBlob, `reunion_transcription_${timestamp}.txt`);
                break;

            case 'summary':
                if (!this.summaryDiv.innerHTML.trim()) {
                    alert('Aucun résumé à télécharger');
                    return;
                }
                const summaryContent = this.formatSummaryForDownload();
                const summaryBlob = new Blob([summaryContent], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(summaryBlob, `reunion_resume_${timestamp}.txt`);
                break;
        }
    }

    // 🔥 AMÉLIORÉ : Format transcription avec paragraphes préservés
    formatTranscriptForDownload() {
        const currentDate = new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let content = '='.repeat(80) + '\n';
        content += '             TRANSCRIPTION DE RÉUNION\n';
        content += '='.repeat(80) + '\n\n';
        content += `📅 Date : ${currentDate}\n`;
        content += `⏱️  Durée : ${this.timerDisplay.textContent}\n\n`;
        content += '─'.repeat(80) + '\n\n';

        // 🔥 FORMATAGE AVEC PARAGRAPHES PRÉSERVÉS
        const paragraphs = this.transcriptionText.split(/\n\n+/);
        
        paragraphs.forEach((paragraph, index) => {
            if (paragraph.trim()) {
                const cleanParagraph = paragraph.trim().replace(/\n/g, ' ');
                const sentences = cleanParagraph.split(/[.!?]+/).filter(s => s.trim());
                
                // Reformater en paragraphe lisible
                const formattedParagraph = sentences
                    .map(sentence => sentence.trim())
                    .filter(sentence => sentence.length > 0)
                    .join('. ') + '.';

                                content += formattedParagraph + '\n\n';
                
                // Ajout séparateur visuel entre sections importantes
                if (index < paragraphs.length - 1 && formattedParagraph.length > 100) {
                    content += '• • •\n\n';
                }
            }
        });

        content += '\n' + '='.repeat(80) + '\n';
        content += `Transcription générée automatiquement le ${new Date().toLocaleString('fr-FR')}`;

        return content;
    }

    // 🔥 AMÉLIORÉ : Format résumé sans traces HTML/Markdown - PHRASES COMPLÈTES
    formatSummaryForDownload() {
        const currentDate = new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Extraction du contenu HTML proprement
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.summaryDiv.innerHTML;

        let textContent = '='.repeat(65) + '\n';
        textContent += '        📋 RÉSUMÉ EXÉCUTIF DE RÉUNION\n';
        textContent += '='.repeat(65) + '\n\n';

        // Extraction du sous-titre
        const subtitleEl = tempDiv.querySelector('.summary-subtitle');
        if (subtitleEl) {
            textContent += `🎯 ${subtitleEl.textContent}\n`;
        }
        
        textContent += `📅 ${currentDate}\n\n`;
        textContent += '─'.repeat(65) + '\n\n';

        // Extraction des sections avec formatage propre
        const sections = tempDiv.querySelectorAll('.summary-section');
        sections.forEach((section, index) => {
            const titleEl = section.querySelector('.summary-section-title');
            const items = section.querySelectorAll('.summary-item');

            if (titleEl) {
                // Nettoyage du titre (enlever émojis pour version texte)
                const cleanTitle = titleEl.textContent
                    .replace(/[🎯✅❓💡]/g, '')
                    .trim()
                    .toUpperCase();
                
                textContent += `${cleanTitle}\n`;
                textContent += '─'.repeat(cleanTitle.length) + '\n';
            }

            items.forEach(item => {
                // 🔥 NETTOYAGE COMPLET - PHRASES FINIES
                let itemText = item.textContent.trim();
                
                // Éliminer les artifacts HTML et "..."
                itemText = itemText
                    .replace(/★/g, '')
                    .replace(/\.\.\.+$/g, '')
                    .trim();
                
                // S'assurer que la phrase finit correctement
                if (itemText && !itemText.match(/[.!?]$/)) {
                    itemText += '.';
                }
                
                if (itemText) {
                    textContent += `• ${itemText}\n`;
                }
            });

            // Espacement entre sections
            if (index < sections.length - 1) {
                textContent += '\n';
            }
        });

        // 🔥 NOUVEAU : Ajout highlight s'il existe
        const highlightEl = tempDiv.querySelector('.summary-highlight');
        if (highlightEl) {
            let highlightText = highlightEl.textContent.trim();
            highlightText = highlightText.replace(/\.\.\.+$/g, '');
            if (highlightText && !highlightText.match(/[.!?]$/)) {
                highlightText += '.';
            }
            if (highlightText) {
                textContent += '\n💡 POINT CLÉ\n';
                textContent += '─'.repeat(12) + '\n';
                textContent += `${highlightText}\n`;
            }
        }

        // Nettoyage final
        textContent = textContent
            .replace(/\n\n\n+/g, '\n\n') // Nettoyer excès sauts
            .replace(/^\s+/gm, '') // Nettoyer espaces début ligne
            .replace(/\s+$/gm, '') // Nettoyer espaces fin ligne
            .trim(); // Suppression sauts fin

        textContent += '\n\n' + '='.repeat(65) + '\n';
        textContent += `Résumé généré le ${new Date().toLocaleString('fr-FR')}`;

        return textContent;
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

