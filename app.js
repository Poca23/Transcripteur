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
        this.audioStream = null;
        
        // 🔥 DÉTECTION PRÉCISE MOBILE/PWA/iOS
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           window.navigator.standalone === true;
        this.isPWA = this.isStandalone;
        
        // 🔥 NOUVEAU : Gestion spécifique iOS PWA
        this.iosPermissionRequested = false;
        this.microphonePermissionStatus = 'unknown';
        
        // Gestion des pauses
        this.lastSpeechTime = null;
        this.pauseTimeout = null;
        this.pauseThreshold = 2000;
        this.transcriptionSegments = [];

        this.initCorrectionDictionaries();
        this.initElements();
        this.initSpeechRecognition();
        this.bindEvents();
        this.showMobileInfo();
        
        // 🔥 NOUVEAU : Test permissions au démarrage
        this.checkMicrophonePermissions();
    }

    // 🔥 NOUVEAU : Vérification permissions microphone avancée
    async checkMicrophonePermissions() {
        try {
            // Test pour iOS PWA
            if (this.isIOS && this.isPWA) {
                console.log('🍎 iOS PWA détecté - Configuration spéciale...');
                
                // Vérifier si Navigator.permissions est disponible
                if ('permissions' in navigator) {
                    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                    this.microphonePermissionStatus = permissionStatus.state;
                    console.log('📱 Permission micro:', permissionStatus.state);
                    
                    if (permissionStatus.state === 'denied') {
                        this.showIOSPermissionError();
                    }
                } else {
                    console.log('⚠️ API Permissions non disponible sur iOS PWA');
                }
            }
        } catch (error) {
            console.log('⚠️ Impossible de vérifier les permissions:', error);
        }
    }

    // 🔥 NOUVEAU : Message d'erreur spécifique iOS PWA
    showIOSPermissionError() {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background: #ffebee; 
            border: 2px solid #f44336; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 10px;
            text-align: center;
            color: #d32f2f;
        `;
        errorDiv.innerHTML = `
            <h3>🚫 Microphone bloqué sur iOS PWA</h3>
            <p><strong>Solution obligatoire :</strong></p>
            <ol style="text-align: left; margin: 10px 0;">
                <li>Supprimer l'app de l'écran d'accueil</li>
                <li>Ouvrir Safari → poc23.github.io/transcripteur</li>
                <li>Autoriser le micro dans Safari</li>
                <li>Réinstaller l'app (Partager → Sur l'écran d'accueil)</li>
            </ol>
            <button onclick="this.parentElement.remove()" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-top: 10px;">
                J'ai compris
            </button>
        `;
        document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.controls'));
    }

    initCorrectionDictionaries() {
        this.corrections = {
            'ai': 'IA', 'api': 'API', 'cdi': 'CDI', 'ses d i': 'CDI', 'ces d i': 'CDI',
            'cdd': 'CDD', 'rh': 'RH', 'k p i': 'KPI', 'roi': 'ROI', 'p d f': 'PDF',
            'u r l': 'URL', 'i p': 'IP', 'seo': 'SEO', 'crm': 'CRM', 'erp': 'ERP',
            'ça fait': 'cela fait', 'y a': 'il y a', 'faut qu\'on': 'il faut que nous',
            'va falloir': 'il va falloir', 'c\'est à dire': 'c\'est-à-dire',
            'virgule': ',', 'point': '.', 'deux points': ':', 'point virgule': ';',
            'point d\'interrogation': '?', 'point d\'exclamation': '!',
            'chiffre d\'affaire': 'chiffre d\'affaires', 'ressources humaine': 'ressources humaines',
            'meeting': 'réunion', 'call': 'appel', 'deadline': 'échéance', 'brief': 'briefing',
            'feedback': 'retour', 'business': 'affaires'
        };

        this.businessKeywords = {
            'budget': 3, 'planning': 2, 'deadline': 3, 'livrable': 2, 'milestone': 2,
            'objectif': 3, 'target': 2, 'kpi': 3, 'roi': 3, 'revenus': 3, 'coûts': 2,
            'client': 2, 'prospect': 2, 'lead': 2, 'conversion': 2, 'marketing': 2,
            'commercial': 2, 'ventes': 2, 'négociation': 2, 'projet': 2, 'équipe': 1
        };

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

            // 🔥 CONFIGURATION OPTIMISÉE iOS PWA
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'fr-FR';
            
            // iOS PWA : Paramètres plus conservateurs
            if (this.isIOS && this.isPWA) {
                this.recognition.maxAlternatives = 1;
            } else {
                this.recognition.maxAlternatives = 3;
            }

            let finalTranscript = '';
            let interimTranscript = '';

            this.recognition.onresult = (event) => {
                interimTranscript = '';
                finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    this.transcriptionText += ' ' + finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();
                    this.lastSpeechTime = Date.now();
                }
            };

            // 🔥 GESTION D'ERREURS SPÉCIFIQUE iOS PWA
            this.recognition.onerror = (event) => {
                console.error('❌ Erreur reconnaissance vocale:', event.error);
                
                if (this.isIOS && this.isPWA) {
                    switch (event.error) {
                        case 'not-allowed':
                            this.statusText.textContent = '❌ Microphone refusé - Voir instructions ci-dessus';
                            this.showIOSPermissionError();
                            break;
                        case 'audio-capture':
                            this.statusText.textContent = '❌ Problème audio - Redémarrer l\'app';
                            break;
                        case 'network':
                            this.statusText.textContent = '⚠️ Problème réseau - Reconnexion...';
                            this.restartRecognition();
                            break;
                        default:
                            this.statusText.textContent = `⚠️ Erreur: ${event.error}`;
                    }
                } else {
                    if (event.error === 'network') {
                        this.statusText.textContent = '⚠️ Problème réseau - Reconnexion...';
                        this.restartRecognition();
                    }
                }
            };

            this.recognition.onend = () => {
                if (this.isRecording) {
                    console.log('🔄 Redémarrage automatique reconnaissance vocale...');
                    setTimeout(() => {
                        if (this.isRecording) {
                            this.recognition.start();
                        }
                    }, 1000);
                }
            };

        } else {
            alert('❌ Votre navigateur ne supporte pas la reconnaissance vocale');
        }
    }

    // 🔥 NOUVEAU : Redémarrage sécurisé pour iOS PWA
    restartRecognition() {
        if (this.isRecording && this.recognition) {
            setTimeout(() => {
                try {
                    if (this.isRecording) {
                        this.recognition.start();
                        console.log('🔄 Reconnaissance vocale redémarrée');
                    }
                } catch (error) {
                    console.log('⚠️ Impossible de redémarrer:', error);
                }
            }, this.isIOS ? 2000 : 1000); // Délai plus long sur iOS
        }
    }

    showMobileInfo() {
        if (this.isPWA && (this.isIOS || this.isMobile)) {
            const info = document.createElement('div');
            info.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px;
                margin: 15px 0;
                border-radius: 20px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.2);
            `;
            
            if (this.isIOS && this.isPWA) {
                info.innerHTML = `
                    <h3>🔧 Solutions micro PWA:</h3>
                    <div style="text-align: left; margin: 10px 0; font-size: 14px;">
                        <div>1️⃣ Redémarrer l'application</div>
                        <div>2️⃣ Ouvrir dans le navigateur</div>
                        <div>3️⃣ Vérifier permissions dans Paramètres</div>
                        <div>4️⃣ Activer le micro dans les paramètres système</div>
                    </div>
                `;
            } else {
                info.innerHTML = `
                    <div>💡 <strong>PWA Mobile:</strong> Si le micro ne fonctionne pas, essayez d'ouvrir dans le navigateur</div>
                `;
            }
            
            document.querySelector('.container').insertBefore(info, document.querySelector('.controls'));
        }
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearAll());

        this.downloadAudio.addEventListener('click', () => this.downloadFile('audio'));
        this.downloadTranscript.addEventListener('click', () => this.downloadFile('transcript'));
        this.downloadSummary.addEventListener('click', () => this.downloadFile('summary'));
        this.downloadAll.addEventListener('click', () => {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            this.downloadAllFiles(timestamp);
        });

        // 🔥 NOUVEAU : Gestion spéciale focus/blur pour iOS PWA
        if (this.isIOS && this.isPWA) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.isRecording) {
                    console.log('📱 App en arrière-plan - pause temporaire');
                } else if (!document.hidden && this.isRecording) {
                    console.log('📱 App au premier plan - reprise');
                    this.restartRecognition();
                }
            });
        }
    }

    // 🔥 MÉTHODE STARTRECORDING OPTIMISÉE iOS PWA
    async startRecording() {
        try {
            console.log('🎤 Démarrage enregistrement...', {
                isIOS: this.isIOS,
                isPWA: this.isPWA,
                userAgent: navigator.userAgent.substring(0, 50)
            });

            // 🔥 DEMANDE PERMISSION EXPLICITE POUR iOS PWA
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: this.isIOS ? 16000 : 44100, // Fréquence réduite sur iOS
                }
            };

            this.statusText.textContent = '🎤 Demande accès microphone...';

            // Attendre plus longtemps sur iOS PWA
            const timeoutDuration = this.isIOS && this.isPWA ? 10000 : 5000;
            const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), timeoutDuration)
            );

            this.audioStream = await Promise.race([streamPromise, timeoutPromise]);
            console.log('✅ Stream audio obtenu:', this.audioStream.getTracks());

            // Initialiser MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
            });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('📊 Chunk audio reçu:', event.data.size, 'bytes');
                }
            };

            this.mediaRecorder.start(1000); // Chunks de 1 seconde

            // 🔥 DÉLAI SPÉCIAL iOS PWA AVANT RECONNAISSANCE VOCALE
            await new Promise(resolve => setTimeout(resolve, this.isIOS && this.isPWA ? 2000 : 500));

            // Démarrer reconnaissance vocale
            this.recognition.start();
            console.log('🎙️ Reconnaissance vocale démarrée');

            // Mise à jour interface
            this.isRecording = true;
            this.startTime = Date.now();
            this.lastSpeechTime = Date.now();
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusText.textContent = '🔴 Enregistrement en cours...';
            document.body.classList.add('recording');

            this.startTimer();
            console.log('✅ Enregistrement démarré avec succès');

            // 🔥 NOTIFICATION SUCCÈS POUR iOS PWA
            if (this.isIOS && this.isPWA) {
                this.statusText.textContent = '✅ Micro reconnecté - Redémarrage...';
                setTimeout(() => {
                    this.statusText.textContent = '🔴 Enregistrement en cours...';
                }, 2000);
            }

        } catch (error) {
            console.error('❌ Erreur démarrage enregistrement:', error);
            
            this.isRecording = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;

            // Messages d'erreur spécifiques
            if (error.name === 'NotAllowedError' || error.message === 'Permission denied') {
                this.statusText.textContent = '❌ Accès micro refusé';
                if (this.isIOS && this.isPWA) {
                    this.showIOSPermissionError();
                }
            } else if (error.name === 'NotFoundError') {
                this.statusText.textContent = '❌ Microphone non trouvé';
            } else if (error.message === 'timeout') {
                this.statusText.textContent = '⏱️ Timeout - Réessayer';
            } else {
                this.statusText.textContent = '❌ Erreur microphone';
            }

            // 🔥 SUGGESTION AUTOMATIQUE POUR iOS PWA
            if (this.isIOS && this.isPWA) {
                setTimeout(() => {
                    alert('💡 Suggestion iOS PWA:\n\n1. Fermer complètement l\'app\n2. Ouvrir Safari\n3. Aller sur le site web\n4. Tester le micro\n5. Réinstaller l\'app');
                }, 2000);
            }
        }
    }

    stopRecording() {
        console.log('⏹️ Arrêt enregistrement...');
        this.isRecording = false;

        // Arrêter reconnaissance vocale
        if (this.recognition) {
            try {
                this.recognition.stop();
                console.log('🎙️ Reconnaissance vocale arrêtée');
            } catch (error) {
                console.log('⚠️ Erreur arrêt reconnaissance:', error);
            }
        }

        // Arrêter enregistrement audio
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            console.log('📹 MediaRecorder arrêté');
        }

        // Fermer stream audio
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => {
                track.stop();
                console.log('🎵 Track audio fermé:', track.kind);
            });
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

    // Méthodes restantes identiques...
    startPauseTimer() {
        this.pauseTimeout = setTimeout(() => {
            if (this.isRecording) {
                this.transcriptionText += '\n\n';
                this.updateTranscription();
                console.log('Pause détectée - Saut de ligne ajouté');
            }
        }, this.pauseThreshold);
    }

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

    generateSubtitle(segment) {
        const keywords = segment.keywords;
        if (keywords.length === 0) return 'Discussion Générale';
        
        if (keywords.includes('budget') || keywords.includes('coûts') || keywords.includes('revenus')) {
            return 'Finances & Budget';
        }
        if (keywords.includes('planning') || keywords.includes('deadline') || keywords.includes('milestone')) {
            return 'Planning & Échéances';
        }
        if (keywords.includes('client') || keywords.includes('commercial') || keywords.includes('ventes')) {
            return 'Commercial & Clients';
        }
        if (keywords.includes('équipe') || keywords.includes('projet')) {
            return 'Gestion d\'Équipe';
        }
        
        return keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1);
    }

    improveTranscript(text) {
        let improved = text;

        Object.entries(this.corrections).forEach(([wrong, correct]) => {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            improved = improved.replace(regex, correct);
        });

        improved = this.removeFiller(improved);
        improved = this.improvePunctuation(improved);
        improved = this.improveCapitalization(improved);

        return improved;
    }

    removeFiller(text) {
        this.fillerWords.forEach(filler => {
            const regex = new RegExp(`\\b${filler}\\b`, 'gi');
            text = text.replace(regex, '');
        });

        text = text.replace(/\s{2,}/g, ' ').trim();
        return text;
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

    generateSummary() {
        const sentences = this.transcriptionText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length === 0) return;

        // Analyser et scorer les phrases
        const scoredSentences = sentences.map(sentence => {
            let score = 0;
            const lowerSentence = sentence.toLowerCase();

            Object.entries(this.businessKeywords).forEach(([keyword, weight]) => {
                if (lowerSentence.includes(keyword)) {
                    score += weight;
                }
            });

            return { text: sentence.trim(), score };
        });

        // Sélectionner les meilleures phrases
        const importantSentences = scoredSentences
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.min(5, Math.ceil(sentences.length * 0.3)));

        // Grouper par thème
        const themes = {
            finances: [],
            planning: [],
            commercial: [],
            équipe: [],
            général: []
        };

        importantSentences.forEach(sentence => {
            const lowerText = sentence.text.toLowerCase();
            let assigned = false;

            if (lowerText.match(/budget|coût|prix|argent|financ|revenus|dépens/)) {
                themes.finances.push(sentence.text);
                assigned = true;
            }
            if (lowerText.match(/planning|date|délai|échéance|livraison|deadline|timing/)) {
                themes.planning.push(sentence.text);
                assigned = true;
            }
            if (lowerText.match(/client|commercial|vente|prospect|marché|négociation/)) {
                themes.commercial.push(sentence.text);
                assigned = true;
            }
            if (lowerText.match(/équipe|team|ressource|personne|collaborateur|rôle/)) {
                themes.équipe.push(sentence.text);
                assigned = true;
            }
            if (!assigned) {
                themes.général.push(sentence.text);
            }
        });

        // Générer le résumé HTML
        let summaryHTML = '<div class="summary-title">📋 RÉSUMÉ EXÉCUTIF</div>\n\n';

        Object.entries(themes).forEach(([theme, sentences]) => {
            if (sentences.length > 0) {
                const themeIcons = {
                    finances: '💰',
                    planning: '📅',
                    commercial: '🤝',
                    équipe: '👥',
                    général: '📝'
                };

                summaryHTML += `<div class="summary-section-title">${themeIcons[theme]} ${theme.toUpperCase()}</div>\n`;
                sentences.forEach((sentence, index) => {
                    summaryHTML += `<div class="summary-item">${index + 1}. ${sentence}.</div>\n`;
                });
                summaryHTML += '\n';
            }
        });

        // Extraire mots-clés principaux
        const keywordCounts = {};
        Object.keys(this.businessKeywords).forEach(keyword => {
            const count = (this.transcriptionText.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
            if (count > 0) {
                keywordCounts[keyword] = count;
            }
        });

        const topKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([keyword, count]) => `${keyword} (${count})`);

        if (topKeywords.length > 0) {
            summaryHTML += `<div class="summary-section-title">🏷️ MOTS-CLÉS PRINCIPAUX</div>\n`;
            summaryHTML += `<div class="summary-item">${topKeywords.join(' • ')}</div>\n\n`;
        }

        // Statistiques
        const wordCount = this.transcriptionText.split(/\s+/).length;
        const sentenceCount = sentences.length;
        
        summaryHTML += `<div class="summary-section-title">📊 STATISTIQUES</div>\n`;
        summaryHTML += `<div class="summary-item">• Mots: ${wordCount}</div>\n`;
        summaryHTML += `<div class="summary-item">• Phrases: ${sentenceCount}</div>\n`;
        summaryHTML += `<div class="summary-item">• Durée: ${this.timerDisplay.textContent}</div>\n`;
        
        this.summaryDiv.innerHTML = summaryHTML;
    }

    formatTranscriptionForDisplay(text) {
        return text.split('\n\n').map(paragraph => {
            if (paragraph.trim()) {
                return `<div class="transcript-segment">${paragraph.trim()}</div>`;
            }
            return '';
        }).join('');
    }

    updateTranscription() {
        this.transcriptionDiv.innerHTML = this.formatTranscriptionForDisplay(this.transcriptionText);
        this.transcriptionDiv.scrollTop = this.transcriptionDiv.scrollHeight;
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

        // Formatage avec paragraphes préservés
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
                    content += '─'.repeat(50) + '\n';
                }
                // Détecter les sous-titres de thème
                else if (trimmedLine.includes('💰') || trimmedLine.includes('📅') || 
                         trimmedLine.includes('🤝') || trimmedLine.includes('👥') || 
                         trimmedLine.includes('📝') || trimmedLine.includes('🏷️')) {
                    content += '\n' + trimmedLine + '\n';
                }
                // Points de contenu
                else if (trimmedLine.match(/^\d+\./)) {
                    content += '  ' + trimmedLine + '\n';
                }
                // Statistiques et autres infos
                else if (trimmedLine.includes('•') || trimmedLine.includes(':')) {
                    content += '  ' + trimmedLine + '\n';
                }
                // Texte général
                else if (trimmedLine.length > 3) {
                    content += trimmedLine + '\n';
                }
            }
        });

        // Nettoyage final
        content = content
            .replace(/\n\n\n+/g, '\n\n') // Nettoyer excès sauts
            .replace(/^\s+/gm, '') // Nettoyer espaces début ligne
            .replace(/\s+$/gm, '') // Nettoyer espaces fin ligne
            .trim(); // Suppression sauts fin

        content += '\n\n' + '='.repeat(80) + '\n';
        content += `Résumé généré automatiquement le ${new Date().toLocaleString('fr-FR')}`;

        return content;
    }

    downloadAllFiles(timestamp) {
        // Téléchargements échelonnés pour éviter les conflits
        if (this.audioChunks.length > 0) {
            setTimeout(() => this.downloadFile('audio'), 100);
        }
        if (this.transcriptionText.trim()) {
            setTimeout(() => this.downloadFile('transcript'), 300);
        }
        if (this.summaryDiv.innerHTML.trim()) {
            setTimeout(() => this.downloadFile('summary'), 500);
        }
        
        // Message de confirmation
        setTimeout(() => {
            let fileCount = 0;
            if (this.audioChunks.length > 0) fileCount++;
            if (this.transcriptionText.trim()) fileCount++;
            if (this.summaryDiv.innerHTML.trim()) fileCount++;
            
            if (fileCount === 0) {
                alert('Aucun fichier à télécharger');
            } else {
                console.log(`✅ ${fileCount} fichier(s) téléchargé(s)`);
            }
        }, 1000);
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

// 🔥 INITIALISATION SÉCURISÉE AVEC GESTION D'ERREURS
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new TranscripteurReunion();
        console.log('✅ Transcripteur initialisé avec succès');
        
        // 🔥 NOUVEAU : Test microphone au chargement pour iOS PWA
        if (app.isIOS && app.isPWA) {
            console.log('🍎 iOS PWA détecté - Tests supplémentaires...');
            
            // Test rapide permissions
            navigator.mediaDevices.enumerateDevices()
                .then(devices => {
                    const audioInputs = devices.filter(device => device.kind === 'audioinput');
                    console.log('🎤 Micros détectés:', audioInputs.length);
                    
                    if (audioInputs.length === 0) {
                        console.warn('⚠️ Aucun micro détecté');
                        app.statusText.textContent = '⚠️ Aucun microphone détecté';
                    }
                })
                .catch(error => {
                    console.warn('⚠️ Impossible de lister les appareils:', error);
                });
        }
        
    } catch (error) {
        console.error('❌ Erreur critique initialisation:', error);
        
        // Interface de fallback d'urgence
        document.body.innerHTML = `
            <div style="
                text-align: center; 
                padding: 50px; 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                max-width: 600px;
                margin: 0 auto;
                background: #f8f9fa;
                border-radius: 20px;
                margin-top: 50px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            ">
                <h2 style="color: #e74c3c; margin-bottom: 20px;">❌ Erreur d'initialisation</h2>
                <p style="color: #666; margin-bottom: 30px; line-height: 1.6;">
                    L'application n'a pas pu se lancer correctement.<br>
                    Cela peut être dû à un problème de compatibilité navigateur.
                </p>
                
                <div style="background: #fff; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #3498db;">
                    <h4 style="margin: 0 0 10px 0; color: #2c3e50;">💡 Solutions recommandées :</h4>
                    <ul style="text-align: left; color: #555; line-height: 1.8;">
                        <li><strong>Chrome/Edge :</strong> Navigateurs optimaux</li>
                        <li><strong>Firefox :</strong> Fonctionnalité limitée</li>
                        <li><strong>Safari :</strong> Utiliser la version web uniquement</li>
                        <li><strong>iOS PWA :</strong> Réinstaller depuis Safari</li>
                    </ul>
                </div>
                
                <div style="margin: 30px 0;">
                    <button onclick="location.reload()" style="
                        background: linear-gradient(135deg, #3498db, #2980b9); 
                        color: white; 
                        border: none; 
                        padding: 15px 30px; 
                        border-radius: 25px; 
                        font-size: 16px;
                        cursor: pointer;
                        margin: 5px;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        🔄 Recharger la page
                    </button>
                    
                    <button onclick="window.history.back()" style="
                        background: #95a5a6; 
                        color: white; 
                        border: none; 
                        padding: 15px 30px; 
                        border-radius: 25px; 
                        font-size: 16px;
                        cursor: pointer;
                        margin: 5px;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        ← Retour
                    </button>
                </div>
                
                <small style="color: #999; display: block; margin-top: 20px;">
                    Erreur technique : ${error.message || 'Erreur inconnue'}<br>
                    Navigateur : ${navigator.userAgent.substring(0, 50)}...
                </small>
            </div>
        `;
    }
});

