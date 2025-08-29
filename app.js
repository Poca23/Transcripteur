class TranscripteurReunion {
    constructor() {
        this.recognition = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.transcriptionText = '';
        this.isRecording = false;
        this.startTime = null;
        this.timer = null;
        
        this.initElements();
        this.initSpeechRecognition();
        this.bindEvents();
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
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + '. ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                if (finalTranscript) {
                    this.transcriptionText += finalTranscript;
                    this.updateTranscription();
                    this.generateSummary();
                }
                
                this.transcriptionDiv.innerHTML = this.transcriptionText + 
                    '<span class="interim">' + interimTranscript + '</span>';
            };
            
            this.recognition.onerror = (event) => {
                console.error('Erreur reconnaissance vocale:', event.error);
                this.statusText.textContent = 'Erreur: ' + event.error;
            };
        } else {
            alert('Votre navigateur ne supporte pas la reconnaissance vocale');
        }
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start();
            this.recognition.start();
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.startTimer();
            
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusText.textContent = '🔴 Enregistrement en cours...';
            
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
            
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.statusText.textContent = '✅ Enregistrement terminé';
        }
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

    generateSummary() {
        // Résumé simple basé sur des mots-clés et phrases importantes
        const sentences = this.transcriptionText.split('. ');
        const keywords = ['décision', 'action', 'important', 'urgent', 'deadline', 'responsable', 'budget', 'projet'];
        
        let summary = '• Points clés de la réunion:\n\n';
        
        sentences.forEach((sentence, index) => {
            const hasKeyword = keywords.some(keyword => 
                sentence.toLowerCase().includes(keyword));
            
            if (hasKeyword || sentence.length > 50) {
                summary += `• ${sentence.trim()}\n`;
            }
        });
        
        // Ajout d'actions si détectées
        const actionWords = ['faire', 'créer', 'envoyer', 'préparer', 'organiser'];
        const actions = sentences.filter(sentence => 
            actionWords.some(action => sentence.toLowerCase().includes(action)));
        
        if (actions.length > 0) {
            summary += '\n📋 Actions identifiées:\n';
            actions.forEach(action => summary += `• ${action.trim()}\n`);
        }
        
        this.summaryDiv.innerHTML = summary.replace(/\n/g, '<br>');
    }

    clearAll() {
        if (confirm('Effacer tout le contenu ?')) {
            this.transcriptionText = '';
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
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    this.downloadBlob(audioBlob, `reunion-audio-${timestamp}.wav`);
                }
                break;
                
            case 'transcript':
                const transcriptText = this.transcriptionDiv.textContent || this.transcriptionText;
                const transcriptBlob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(transcriptBlob, `transcription-${timestamp}.txt`);
                break;
                
            case 'summary':
                const summaryText = this.summaryDiv.textContent;
                const summaryBlob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
                this.downloadBlob(summaryBlob, `resume-${timestamp}.txt`);
                break;
                
            case 'all':
                this.downloadAll(timestamp);
                break;
        }
    }

    downloadAll(timestamp) {
        // Télécharge tous les fichiers
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
