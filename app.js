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
        this.audioStream = null; // 🔥 NOUVEAU : Stream audio
        
        // Détection mobile et PWA
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           window.navigator.standalone === true;
        
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
        
        // 🔥 NOUVEAU : Affichage info PWA mobile
        this.showMobileInfo();
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
            this.recognition.maxAlternatives = 1; // 🔥 CHANGÉ : Plus simple pour mobile

            // 🔥 NOUVEAU : Configuration optimisée mobile/PWA
            if (this.isMobile) {
                // Paramètres spécifiques mobile
                this.recognition.interimResults = false; // Plus stable sur mobile
            }

            let finalTranscript = '';

            this.recognition.onstart = () => {
                console.log('🎤 Reconnaissance vocale démarrée');
                this.statusText.textContent = '🎤 Écoute en cours...';
                this.lastSpeechTime = Date.now();
            };

            this.recognition.onresult = (event) => {
                this.lastSpeechTime = Date.now();
                
                if (this.pauseTimeout) {
                    clearTimeout(this.pauseTimeout);
                    this.pauseTimeout = null;
                }

                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        const improvedText = this.quickImprove(transcript);
                        finalTranscript += improvedText + ' ';
                        this.transcriptionText = finalTranscript;
                        this.updateTranscription();
                        this.generateSummary();
                        this.startPauseTimer();
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Affichage en temps réel (seulement si pas mobile PWA)
                if (!this.isMobile || !this.isStandalone) {
                    this.transcriptionDiv.textContent = finalTranscript + interimTranscript;
                }
            };

            this.recognition.onerror = (event) => {
                console.error('❌ Erreur reconnaissance vocale:', event.error);
                
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.statusText.textContent = '❌ Accès micro refusé';
                    // 🔥 NOUVEAU : Tentative de récupération pour PWA mobile
                    if (this.isStandalone && this.isMobile) {
                        setTimeout(() => {
                            this.requestMicrophonePermission();
                        }, 2000);
                    }
                } else if (event.error === 'no-speech') {
                    this.statusText.textContent = '⚠️ Aucune parole détectée';
                    // Redémarrage automatique
                    if (this.isRecording) {
                        setTimeout(() => {
                            this.restartRecognition();
                        }, 1000);
                    }
                } else if (event.error === 'network') {
                    this.statusText.textContent = '⚠️ Problème réseau - Mode local';
                    // Continuer en mode local
                } else {
                    this.statusText.textContent = `⚠️ Erreur: ${event.error}`;
                }
            };

            this.recognition.onend = () => {
                console.log('🛑 Reconnaissance terminée');
                if (this.isRecording) {
                    // Redémarrage automatique
                    setTimeout(() => {
                        this.restartRecognition();
                    }, 100);
                }
            };
        } else {
            alert('❌ Votre navigateur ne supporte pas la reconnaissance vocale');
        }
    }

    // 🔥 NOUVEAU : Demande explicite permission micro
    async requestMicrophonePermission() {
        try {
            console.log('🔄 Nouvelle tentative d\'accès micro...');
            
            // Fermer le précédent stream
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            // Nouvelle demande avec contraintes optimales
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000 // 🔥 Optimisé pour reconnaissance vocale
                }
            });

            console.log('✅ Accès micro rétabli');
            this.statusText.textContent = '✅ Micro reconnecté - Redémarrage...';
            
            // Redémarrer la reconnaissance
            setTimeout(() => {
                if (this.isRecording && this.recognition) {
                    this.restartRecognition();
                }
            }, 500);

        } catch (error) {
            console.error('❌ Impossible d\'accéder au micro:', error);
            this.statusText.textContent = '❌ Micro inaccessible';
            
            // 🔥 NOUVEAU : Instructions spécifiques PWA mobile
            if (this.isStandalone && this.isMobile) {
                this.showMobileTroubleshooting();
            }
        }
    }

    // 🔥 NOUVEAU : Redémarrage intelligent de la reconnaissance
    restartRecognition() {
        if (!this.recognition || !this.isRecording) return;

        try {
            this.recognition.stop();
            setTimeout(() => {
                if (this.isRecording) {
                    this.recognition.start();
                    console.log('🔄 Reconnaissance redémarrée');
                }
            }, 300);
        } catch (error) {
            console.log('⚠️ Erreur redémarrage:', error);
            // Tentative après délai plus long
            setTimeout(() => {
                if (this.isRecording) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.log('❌ Impossible de redémarrer la reconnaissance');
                        this.requestMicrophonePermission();
                    }
                }
            }, 1500);
        }
    }

    // 🔥 NOUVEAU : Affichage info PWA mobile
    showMobileInfo() {
        if (this.isMobile && this.isStandalone) {
            const info = document.createElement('div');
            info.style.cssText = `
                background: linear-gradient(135deg, #fff3cd, #ffeaa7); 
                border: 1px solid #f0ad4e; 
                padding: 12px; 
                margin: 15px 0; 
                border-radius: 8px; 
                font-size: 13px;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;
            info.innerHTML = '📱 <strong>PWA Mobile:</strong> Si le micro ne fonctionne pas, <a href="#" onclick="this.parentElement.nextElementSibling.style.display=\'block\';this.parentElement.style.display=\'none\'">voir solutions</a>';
            
            const solutions = document.createElement('div');
            solutions.style.cssText = `
                display: none;
                background: #e8f4f8;
                border: 1px solid #bee5eb;
                padding: 15px;
                margin: 10px 0;
                border-radius: 8px;
                font-size: 12px;
            `;
            solutions.innerHTML = `
                <strong>🔧 Solutions micro PWA:</strong><br>
                1️⃣ Redémarrer l'application<br>
                2️⃣ Ouvrir dans le navigateur<br>
                3️⃣ Vérifier permissions dans Paramètres<br>
                4️⃣ Activer le micro dans les paramètres système
            `;
            
            const container = document.querySelector('.container');
            container.insertBefore(info, document.querySelector('.controls'));
            container.insertBefore(solutions, document.querySelector('.controls'));
        }
    }

    // 🔥 NOUVEAU : Dépannage mobile
    showMobileTroubleshooting() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 25px; border-radius: 12px; max-width: 350px; text-align: center;">
                <h3 style="color: #e74c3c; margin-top: 0;">🎤 Problème Microphone</h3>
                <p><strong>Solutions PWA Mobile:</strong></p>
                <div style="text-align: left; margin: 15px 0;">
                    <p>📱 <strong>Méthode 1:</strong> Fermer et relancer l'app</p>
                    <p>🌐 <strong>Méthode 2:</strong> Ouvrir dans le navigateur</p>
                    <p>⚙️ <strong>Méthode 3:</strong> Paramètres téléphone → Apps → Transcripteur → Permissions → Microphone</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 6px;">
                    Compris
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // 🔥 NOUVEAU : Gestion des pauses avec saut de ligne automatique
    startPauseTimer() {
        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
        }
        
        this.pauseTimeout = setTimeout(() => {
            if (this.isRecording) {
                this.transcriptionText += '\n\n';
                this.updateTranscription();
                console.log('⏸️ Pause détectée - Saut de ligne ajouté');
            }
        }, this.pauseThreshold);
    }

    updateTranscription() {
        this.transcriptionDiv.innerHTML = this.formatTranscriptionForDisplay(this.transcriptionText);
        this.transcriptionDiv.scrollTop = this.transcriptionDiv.scrollHeight;
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
        
        if (keywords.some(k => ['budget', 'roi', 'revenus', 'coûts'].includes(k))) return 'Aspects Financiers';
        if (keywords.some(k => ['planning', 'deadline', 'milestone'].includes(k))) return 'Planning & Échéances';
        if (keywords.some(k => ['équipe', 'ressources', 'commercial'].includes(k))) return 'Ressources Humaines';
        if (keywords.some(k => ['client', 'prospect', 'marketing'].includes(k))) return 'Commercial & Marketing';
        
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

        const keywordCount = {};
        const importantSentences = [];

        sentences.forEach(sentence => {
            let score = 0;
            const lowerSentence = sentence.toLowerCase();
            
            Object.entries(this.businessKeywords).forEach(([keyword, weight]) => {
                if (lowerSentence.includes(keyword)) {
                    score += weight;
                    keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
                }
            });

            if (score >= 2) {
                importantSentences.push({ sentence: sentence.trim(), score });
            }
        });

        importantSentences.sort((a, b) => b.score - a.score);
        const topSentences = importantSentences.slice(0, 5);

        let summary = '<div class="summary-title">📋 Résumé Automatique</div>\n\n';
        
        if (Object.keys(keywordCount).length > 0) {
            summary += '<div class="summary-subtitle">🎯 Mots-clés principaux</div>\n';
            Object.entries(keywordCount)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 6)
                .forEach(([keyword, count]) => {
                    summary += `<span class="keyword-tag">${keyword} (${count})</span> `;
                });
            summary += '\n\n';
        }

        if (topSentences.length > 0) {
            summary += '<div class="summary-subtitle">💡 Points Importants</div>\n';
            topSentences.forEach((item, index) => {
                summary += `${index + 1}. ${item.sentence}\n\n`;
            });
        }

        summary += '<div class="summary-subtitle">📊 Statistiques</div>\n';
        summary += `• Nombre total de phrases : ${sentences.length}\n`;
        summary += `• Points importants identifiés : ${topSentences.length}\n`;
        summary += `• Durée : ${this.timerDisplay.textContent}\n`;

        this.summaryDiv.innerHTML = summary;
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
            this.downloadAllFiles(timestamp);
        });
    }

    async startRecording() {
        try {
            console.log('🎬 Démarrage enregistrement...');
            
            // 🔥 NOUVEAU : Demande permission explicite avec options optimales
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.isMobile ? 16000 : 44100 // Optimisé mobile
                }
            };

            // Fermer précédent stream s'il existe
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
            }

            this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Accès micro obtenu');

            // Démarrer l'enregistrement audio
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: this.isMobile ? 'audio/webm' : 'audio/wav'
            });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            console.log('✅ Enregistrement audio démarré');

            // Démarrer la reconnaissance vocale avec délai de sécurité
            setTimeout(() => {
                if (this.recognition && this.isRecording) {
                    try {
                        this.recognition.start();
                        console.log('✅ Reconnaissance vocale démarrée');
                    } catch (error) {
                        console.error('❌ Erreur démarrage reconnaissance:', error);
                        // Réessayer après délai
                        setTimeout(() => {
                            if (this.isRecording) {
                                this.restartRecognition();
                            }
                        }, 1000);
                    }
                }
            }, this.isMobile ? 1000 : 500); // Délai plus long sur mobile

            // Mise à jour de l'interface
            this.isRecording = true;
            this.startTime = Date.now();
            this.lastSpeechTime = Date.now();
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusText.textContent = '🔴 Enregistrement en cours...';
            document.body.classList.add('recording');

            // Démarrer le timer
            this.startTimer();

        } catch (error) {
            console.error('❌ Erreur startRecording:', error);
            this.statusText.textContent = '❌ Erreur d\'accès au microphone';
            this.isRecording = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            
            // 🔥 NOUVEAU : Message spécifique PWA mobile
            if (this.isMobile && this.isStandalone) {
                setTimeout(() => {
                    this.showMobileTroubleshooting();
                }, 1000);
            } else {
                alert('❌ Impossible d\'accéder au microphone. Vérifiez les permissions.');
            }
        }
    }

    stopRecording() {
        console.log('🛑 Arrêt enregistrement...');
        
        this.isRecording = false;
        
        // Arrêter reconnaissance vocale
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.log('⚠️ Erreur arrêt reconnaissance:', error);
            }
        }

        // Arrêter enregistrement audio
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }

        // Fermer stream audio
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        // Nettoyer timeouts
        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
        }

        // Mise à jour interface
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.statusText.textContent = '✅ Enregistrement terminé';
        document.body.classList.remove('recording');

        // Arrêter timer
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Améliorer transcription finale
        if (this.transcriptionText.trim()) {
            this.transcriptionText = this.improveTranscript(this.transcriptionText);
            this.updateTranscription();
            this.generateSummary();
        }

        console.log('✅ Enregistrement arrêté avec succès');
    }

    clearAll() {
        this.transcriptionText = '';
        this.rawTranscriptionText = '';
        this.transcriptionDiv.innerHTML = '';
        this.summaryDiv.innerHTML = '';
        this.audioChunks = [];
        this.transcriptionSegments = [];
        this.timerDisplay.textContent = '00:00';
        this.statusText.textContent = 'Prêt à enregistrer';
        
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    downloadFile(type) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        switch (type) {
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

        let content = '='.repeat(80) + '\n';
        content += '                RÉSUMÉ DE RÉUNION\n';
        content += '='.repeat(80) + '\n\n';
        content += `📅 Date : ${currentDate}\n`;
        content += `⏱️  Durée : ${this.timerDisplay.textContent}\n\n`;
        content += '─'.repeat(80) + '\n\n';

        // Extraire le contenu texte du résumé HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.summaryDiv.innerHTML;
        
        // Convertir en texte propre
        const summaryText = tempDiv.textContent || tempDiv.innerText || '';
        
        // Nettoyer et structurer
        const lines = summaryText.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                // Détecter les titres de section
                if (trimmedLine.includes('📋') || trimmedLine.includes('🎯') || 
                    trimmedLine.includes('💡') || trimmedLine.includes('📊')) {
                    content += '\n' + trimmedLine.toUpperCase() + '\n';
                    content += '─'.repeat(40) + '\n';
                }
                // Points numérotés
                else if (/^\d+\./.test(trimmedLine)) {
                    content += '  ' + trimmedLine + '\n\n';
                }
                // Points avec puces
                else if (trimmedLine.startsWith('•')) {
                    content += '  ' + trimmedLine + '\n';
                }
                // Texte normal
                else {
                    content += trimmedLine + '\n';
                }
            }
        });

        content += '\n' + '='.repeat(80) + '\n';
        content += `Résumé généré automatiquement le ${new Date().toLocaleString('fr-FR')}`;

        return content;
    }

    downloadAllFiles(timestamp) {
        // Télécharger tous les fichiers avec un délai entre chaque
        const downloads = [];
        
        if (this.audioChunks.length > 0) {
            downloads.push(() => this.downloadFile('audio'));
        }
        
        if (this.transcriptionText.trim()) {
            downloads.push(() => this.downloadFile('transcript'));
        }
        
        if (this.summaryDiv.innerHTML.trim()) {
            downloads.push(() => this.downloadFile('summary'));
        }

        // Exécuter les téléchargements avec délai
        downloads.forEach((download, index) => {
            setTimeout(download, index * 500);
        });

        if (downloads.length === 0) {
            alert('Aucun fichier à télécharger');
        }
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

    startTimer() {
        this.timer = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            this.timerDisplay.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
}

// 🔥 NOUVEAU : Initialisation avec gestion d'erreurs et fallback
document.addEventListener('DOMContentLoaded', () => {
    try {
        new TranscripteurReunion();
        console.log('✅ Transcripteur initialisé avec succès');
    } catch (error) {
        console.error('❌ Erreur initialisation:', error);
        
        // Fallback simple en cas d'erreur
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: Arial;">
                <h2>❌ Erreur d'initialisation</h2>
                <p>Veuillez recharger la page ou utiliser un navigateur compatible.</p>
                <button onclick="location.reload()" style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 10px;">
                    🔄 Recharger
                </button>
                <br><br>
                <small>Navigateurs recommandés : Chrome, Edge, Firefox récent</small>
            </div>
        `;
    }
});

