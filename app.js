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
        
        this.iosPermissionRequested = false;
        this.microphonePermissionStatus = 'unknown';
        
        this.lastSpeechTime = null;
        this.pauseTimeout = null;
        this.pauseThreshold = 2000;
        this.transcriptionSegments = [];

        this.initCorrectionDictionaries();
        this.initElements();
        this.initSpeechRecognition();
        this.bindEvents();
        this.showMobileInfo();
        this.checkMicrophonePermissions();
    }

    // 🔥 NOUVEAU : Vérification permissions microphone avancée
    async checkMicrophonePermissions() {
        try {
            if (this.isIOS && this.isPWA) {
                console.log('🍎 iOS PWA détecté - Configuration spéciale...');
                
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
                <li>Ouvrir Safari → votre-site.com</li>
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
            'budget': 3, 'coût': 3, 'prix': 3, 'chiffre d\'affaires': 5, 'bénéfice': 4,
            'planning': 4, 'délai': 4, 'échéance': 4, 'livraison': 3,
            'client': 4, 'prospect': 3, 'vente': 3, 'marketing': 3,
            'équipe': 3, 'ressources': 3, 'recrutement': 4, 'formation': 3,
            'projet': 4, 'objectif': 4, 'stratégie': 4, 'décision': 4
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
            
            if (this.isIOS && this.isPWA) {
                this.recognition.maxAlternatives = 1;
            } else {
                this.recognition.maxAlternatives = 3;
            }

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    this.lastSpeechTime = Date.now();
                    this.rawTranscriptionText += finalTranscript;
                    this.transcriptionText += finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();

                    if (this.pauseTimeout) {
                        clearTimeout(this.pauseTimeout);
                    }
                    this.startPauseTimer();
                }

                this.statusText.textContent = '🎤 En cours de transcription...';
            };

            this.recognition.onerror = (event) => {
                console.error('Erreur reconnaissance vocale:', event.error);
                if (event.error === 'not-allowed') {
                    this.statusText.textContent = '❌ Accès microphone refusé';
                    if (this.isIOS && this.isPWA) {
                        this.showIOSPermissionError();
                    }
                } else if (event.error === 'no-speech') {
                    this.statusText.textContent = '🔇 Aucune parole détectée';
                    this.restartRecognition();
                } else {
                    this.statusText.textContent = '⚠️ Erreur reconnaissance vocale';
                    this.restartRecognition();
                }
            };

            this.recognition.onend = () => {
                if (this.isRecording) {
                    console.log('🔄 Redémarrage automatique reconnaissance vocale...');
                    this.restartRecognition();
                }
            };

        } else {
            alert('❌ Votre navigateur ne supporte pas la reconnaissance vocale');
        }
    }

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
            }, this.isIOS ? 2000 : 1000);
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

    // 🔥 FIX MEDIARECORDER POUR iOS
    async startRecording() {
        try {
            console.log('🎤 Démarrage enregistrement...', {
                isIOS: this.isIOS,
                isPWA: this.isPWA,
                userAgent: navigator.userAgent.substring(0, 50)
            });

            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: this.isIOS ? 16000 : 44100,
                }
            };

            this.statusText.textContent = '🎤 Demande accès microphone...';

            const timeoutDuration = this.isIOS && this.isPWA ? 10000 : 5000;
            const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), timeoutDuration)
            );

            this.audioStream = await Promise.race([streamPromise, timeoutPromise]);
            console.log('✅ Stream audio obtenu:', this.audioStream.getTracks());

            // 🔥 DÉTECTION FORMAT SUPPORTÉ iOS
            let mimeType = 'audio/webm';
            if (this.isIOS) {
                // iOS supporte audio/mp4 et audio/aac
                if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                    mimeType = 'audio/aac';
                } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                    mimeType = 'audio/wav';
                } else {
                    console.warn('⚠️ Format audio par défaut sur iOS');
                    mimeType = undefined; // Laisser le navigateur décider
                }
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            }

            console.log('🎵 Format audio choisi:', mimeType || 'défaut navigateur');

            // Initialiser MediaRecorder avec format adapté
            this.mediaRecorder = new MediaRecorder(this.audioStream, 
                mimeType ? { mimeType } : undefined
            );
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('📊 Chunk audio reçu:', event.data.size, 'bytes');
                }
            };

            this.mediaRecorder.start(1000);

            // Délai avant reconnaissance vocale
            await new Promise(resolve => setTimeout(resolve, this.isIOS && this.isPWA ? 2000 : 500));

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

            if (error.name === 'NotAllowedError' || error.message === 'Permission denied') {
                this.statusText.textContent = '❌ Accès micro refusé';
                if (this.isIOS && this.isPWA) {
                    this.showIOSPermissionError();
                }
            } else if (error.name === 'NotFoundError') {
                this.statusText.textContent = '❌ Microphone non trouvé';
            } else if (error.message === 'timeout') {
                this.statusText.textContent = '⏱️ Timeout - Réessayer';
            } else if (error.name === 'NotSupportedError') {
                this.statusText.textContent = '❌ Format audio non supporté';
                console.error('Format MediaRecorder non supporté sur cet appareil');
            } else {
                this.statusText.textContent = '❌ Erreur microphone';
            }

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

        if (this.recognition) {
            try {
                this.recognition.stop();
                console.log('🎙️ Reconnaissance vocale arrêtée');
            } catch (error) {
                console.log('⚠️ Erreur arrêt reconnaissance:', error);
            }
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            console.log('📹 MediaRecorder arrêté');
        }

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => {
                track.stop();
                console.log('🎵 Track audio fermé:', track.kind);
            });
            this.audioStream = null;
        }

        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
        }

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.statusText.textContent = '✅ Enregistrement terminé';
        document.body.classList.remove('recording');

        if (this.timer) {
            clearInterval(this.timer);
        }

        if (this.transcriptionText.trim()) {
            this.transcriptionText = this.improveTranscript(this.transcriptionText);
            this.updateTranscription();
            this.generateSummary();
        }

        console.log('✅ Enregistrement arrêté avec succès');
    }

    // Méthodes d'amélioration et formatage
    improveTranscript(text) {
        let improvedText = text;
        
        Object.entries(this.corrections).forEach(([wrong, correct]) => {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            improvedText = improvedText.replace(regex, correct);
        });

        return improvedText
            .replace(/\s+/g, ' ')
            .replace(/([.!?])\s*([A-Z])/g, '$1 $2')
            .trim();
    }

    generateSummary() {
        if (!this.transcriptionText.trim()) return;

        const sentences = this.transcriptionText
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 10)
            .map(s => ({ text: s, score: 0 }));

        sentences.forEach(sentence => {
            const lowerText = sentence.text.toLowerCase();
            const keywords = this.extractKeywords(lowerText);
            sentence.score = keywords.reduce((score, keyword) => 
                score + (this.businessKeywords[keyword] || 1), 0
            );
            
            if (lowerText.includes('important') || lowerText.includes('décision')) {
                sentence.score += 3;
            }
            if (sentence.text.length > 50) {
                sentence.score += 1;
            }
        });

        const topSentences = sentences
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.min(8, Math.ceil(sentences.length * 0.3)));

        const themes = {
            finances: [], planning: [], commercial: [], équipe: [], général: []
        };

        topSentences.forEach(sentence => {
            const lowerText = sentence.text.toLowerCase();
            let assigned = false;
            
            if (lowerText.match(/budget|coût|prix|chiffre|bénéfice|financ/)) {
                themes.finances.push(sentence.text);
                assigned = true;
            }
            if (lowerText.match(/planning|délai|échéance|livraison|date|temps/)) {
                themes.planning.push(sentence.text);
                assigned = true;
            }
            if (lowerText.match(/client|prospect|vente|marketing|commercial|marché/)) {
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

        let summaryHTML = '<div class="summary-title">📋 RÉSUMÉ EXÉCUTIF</div>\n\n';

        Object.entries(themes).forEach(([theme, sentences]) => {
            if (sentences.length > 0) {
                const themeIcons = {
                    finances: '💰', planning: '📅', commercial: '🤝',
                    équipe: '👥', général: '📝'
                };

                summaryHTML += `<div class="summary-section-title">${themeIcons[theme]} ${theme.toUpperCase()}</div>\n`;
                sentences.forEach((sentence, index) => {
                    summaryHTML += `<div class="summary-item">${index + 1}. ${sentence}.</div>\n`;
                });
                summaryHTML += '\n';
            }
        });

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
                // 🔥 Extension dynamique selon format
                const audioBlob = new Blob(this.audioChunks);
                const extension = this.isIOS ? 'm4a' : 'webm';
                this.downloadBlob(audioBlob, `reunion_audio_${timestamp}.${extension}`);
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
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
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
                
                const formattedParagraph = sentences
                    .map(sentence => sentence.trim())
                    .filter(sentence => sentence.length > 0)
                    .join('. ') + '.';

                content += formattedParagraph + '\n\n';
                
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
            year: 'numeric', month: 'long', day: 'numeric'
        });

        let content = '='.repeat(80) + '\n';
        content += '                RÉSUMÉ DE RÉUNION\n';
        content += '='.repeat(80) + '\n\n';
        content += `📅 Date : ${currentDate}\n`;
        content += `⏱️  Durée : ${this.timerDisplay.textContent}\n\n`;
        content += '─'.repeat(80) + '\n\n';

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.summaryDiv.innerHTML;
        const summaryText = tempDiv.textContent || tempDiv.innerText || '';
                const lines = summaryText.split('\n').filter(line => line.trim());
        
        let currentSection = '';
        let sectionCount = 0;
        
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            // Détecter les titres de section
            if (trimmedLine.includes('RÉSUMÉ EXÉCUTIF') || 
                trimmedLine.includes('FINANCES') || 
                trimmedLine.includes('PLANNING') || 
                trimmedLine.includes('COMMERCIAL') || 
                trimmedLine.includes('ÉQUIPE') || 
                trimmedLine.includes('GÉNÉRAL') || 
                trimmedLine.includes('MOTS-CLÉS') || 
                trimmedLine.includes('STATISTIQUES')) {
                
                if (currentSection) {
                    content += '\n';
                }
                content += '\n' + trimmedLine + '\n';
                content += '─'.repeat(40) + '\n';
                currentSection = trimmedLine;
                sectionCount = 0;
            } else if (trimmedLine.match(/^\d+\./)) {
                // Points numérotés
                sectionCount++;
                content += `\n${sectionCount}. ${trimmedLine.replace(/^\d+\.\s*/, '')}\n`;
            } else if (trimmedLine.startsWith('•')) {
                // Points avec puces
                content += `${trimmedLine}\n`;
            } else if (trimmedLine.includes('(')) {
                // Mots-clés avec compteurs
                content += `   ${trimmedLine}\n`;
            } else {
                // Texte normal
                content += `${trimmedLine}\n`;
            }
        });

        // Nettoyage final
        content = content
            .replace(/\n\n\n+/g, '\n\n')
            .replace(/^\s+/gm, '')
            .replace(/\s+$/gm, '')
            .trim();

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
        document.body.appendChild(a);
        a.click();
        
        // Nettoyage
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log('📥 Fichier téléchargé:', filename);
    }

    startTimer() {
        this.timer = setInterval(() => {
            if (!this.startTime) return;
            
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            ">
                <h1 style="font-size: 48px; margin-bottom: 30px;">🚫</h1>
                <h2 style="margin-bottom: 20px;">Erreur d'initialisation</h2>
                <p style="margin-bottom: 30px; max-width: 500px; line-height: 1.6;">
                    L'application n'a pas pu démarrer correctement.<br>
                    Cela peut être dû à un problème de compatibilité navigateur.
                </p>
                
                <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 20px; margin: 30px 0;">
                    <h3>💡 Solutions suggérées :</h3>
                    <ul style="text-align: left; margin: 15px 0;">
                        <li><strong>Chrome/Edge :</strong> Recommandé pour toutes les fonctionnalités</li>
                        <li><strong>Firefox/Safari :</strong> Fonctionnalités limitées</li>
                        <li><strong>iOS PWA :</strong> Redémarrer l'application</li>
                        <li><strong>Android :</strong> Vérifier permissions dans Paramètres</li>
                        <li><strong>Desktop :</strong> Autoriser accès microphone</li>
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

