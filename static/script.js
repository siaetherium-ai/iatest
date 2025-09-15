document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const errorMessage = document.getElementById('error-message');
    const voiceBtn = document.getElementById('voice-btn');
    const languageSelect = document.getElementById('language-select');
    const clearHistoryBtn = document.getElementById('clear-history');
    const chatContainer = document.getElementById('chat-container');
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const closeMenu = document.getElementById('close-menu');

    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    let audioContext, analyser, dataArray, canvas, canvasCtx;

    // Detect API base URL (local or production)
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000"
        : "https://aetherium-gw0r.onrender.com";

    // Initialize waveform canvas with responsive sizing
    canvas = document.createElement('canvas');
    const updateCanvasSize = () => {
        canvas.width = Math.min(window.innerWidth * 0.8, 300);
        canvas.height = Math.min(window.innerWidth * 0.15, 50);
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    canvas.classList.add('mt-4', 'mx-auto', 'rounded');
    canvas.style.display = 'none';
    canvas.style.backgroundColor = '#1f2937';
    chatMessages.appendChild(canvas);
    canvasCtx = canvas.getContext('2d');

    // Load chat history
    let chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    if (chatHistory.length === 0) {
        addMessage('ai', '¡Bienvenido a Aetherium AI! Especializado en leyes e impuestos de RD. ¿En qué puedo ayudarte?', true);
    } else {
        chatHistory.forEach(msg => addMessage(msg.sender, msg.text, false, msg.timestamp));
    }

    // Sidebar toggle for mobile
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('active');
    });

    closeMenu.addEventListener('click', () => {
        sidebar.classList.remove('active');
    });

    // Chat submission with debounce
    let debounceTimer;
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            addMessage('user', message, true);
            messageInput.value = '';
            typingIndicator.classList.remove('hidden');
            errorMessage.classList.add('hidden');

            try {
                const response = await fetch(`${API_BASE}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, language: languageSelect.value })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || `HTTP error: ${response.status}`);
                }
                const data = await response.json();
                addMessage('ai', data.answer, true);
            } catch (error) {
                errorMessage.classList.remove('hidden');
                errorMessage.textContent = error.message || 'Error: No se pudo conectar con el servidor. Intenta de nuevo.';
                console.error('Chat error:', error);
            } finally {
                typingIndicator.classList.add('hidden');
            }
        }, 300);
    });

    // Voice recording
    voiceBtn.addEventListener('click', async () => {
        errorMessage.classList.add('hidden');
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mimeTypes = ['audio/webm', 'audio/mp3', 'audio/wav'];
                let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
                
                mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 2048;
                dataArray = new Uint8Array(analyser.frequencyBinCount);

                mediaRecorder.start();
                isRecording = true;
                voiceBtn.classList.add('recording');
                canvas.style.display = 'block';
                requestAnimationFrame(drawWaveform);

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };
                mediaRecorder.onstop = async () => {
                    canvas.style.display = 'none';
                    if (audioChunks.length === 0) {
                        errorMessage.classList.remove('hidden');
                        errorMessage.textContent = 'Error: No se grabó audio. Intenta de nuevo.';
                        isRecording = false;
                        voiceBtn.classList.remove('recording');
                        stream.getTracks().forEach(track => track.stop());
                        if (audioContext) audioContext.close();
                        return;
                    }

                    const audioBlob = new Blob(audioChunks, { type: selectedMimeType });
                    audioChunks = [];
                    const formData = new FormData();
                    formData.append('file', audioBlob, `voice.${selectedMimeType.split('/')[1]}`);
                    formData.append('language', languageSelect.value);

                    typingIndicator.classList.remove('hidden');
                    try {
                        const response = await fetch(`${API_BASE}/voice`, {
                            method: 'POST',
                            body: formData
                        });
                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(errorText || `HTTP error: ${response.status}`);
                        }
                        const data = await response.json();
                        addMessage('user', data.transcript, true);
                        addMessage('ai', data.answer, true);
                    } catch (error) {
                        errorMessage.classList.remove('hidden');
                        errorMessage.textContent = error.message || 'Error en voz: No se pudo procesar el audio. Intenta de nuevo.';
                        console.error('Voice error:', error);
                    } finally {
                        typingIndicator.classList.add('hidden');
                        stream.getTracks().forEach(track => track.stop());
                        if (audioContext) audioContext.close();
                    }
                };
            } catch (error) {
                errorMessage.classList.remove('hidden');
                errorMessage.textContent = `Error: Permiso de micrófono denegado o no disponible.`;
                console.error('Microphone error:', error);
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.classList.remove('recording');
        }
    });

    // Draw waveform
    function drawWaveform() {
        if (!isRecording) return;
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#3b82f6';
        canvasCtx.beginPath();
        const sliceWidth = canvas.width / dataArray.length;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }
        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
        requestAnimationFrame(drawWaveform);
    }

    // Clear history with confirmation
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres borrar el historial de chat?')) {
            chatHistory = [];
            localStorage.removeItem('chatHistory');
            chatMessages.innerHTML = '';
            addMessage('ai', '¡Bienvenido a Aetherium AI! Especializado en leyes e impuestos de RD. ¿En qué puedo ayudarte?', true);
            errorMessage.classList.add('hidden');
        }
    });

    // Add message to chat with improved scroll, avatar, and timestamp
    function addMessage(sender, text, isNew = true, timestamp = null) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', sender === 'user' ? 'user-msg' : 'ai-msg');
        
        // Avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        const icon = document.createElement('i');
        icon.classList.add('fas', sender === 'user' ? 'fa-user' : 'fa-robot');
        avatarDiv.appendChild(icon);
        msgDiv.appendChild(avatarDiv);
        
        // Content
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        const textDiv = document.createElement('div');
        textDiv.classList.add('prose');
        let parsedText = text
            .replace(/^\*\*(.*?)\*\*\n?/gm, '<strong class="title">$1</strong><br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^\s*- (.*?)$/gm, '<li>$1</li>')
            .replace(/<li>(.*?)<\/li>/g, '<ul><li>$1</li></ul>')
            .replace(/<\/ul>\s*<ul>/g, '');
        parsedText = '<p>' + parsedText + '</p>';
        textDiv.innerHTML = parsedText;
        contentDiv.appendChild(textDiv);
        
        // Timestamp
        const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeDiv = document.createElement('div');
        timeDiv.classList.add('timestamp');
        timeDiv.textContent = time;
        contentDiv.appendChild(timeDiv);
        
        msgDiv.appendChild(contentDiv);
        chatMessages.appendChild(msgDiv);
        
        if (isNew) {
            chatHistory.push({ sender, text, timestamp: time });
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        }
        
        // Improved scroll: Scroll to bottom only if already at bottom
        const isAtBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 100;
        if (isAtBottom) {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        }
    }

    // Prevent form scroll issues and enable smooth touch scrolling
    chatForm.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    chatContainer.addEventListener('touchstart', () => {}, { passive: true }); // Enable passive touch for smooth scrolling
});
