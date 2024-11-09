document.addEventListener('DOMContentLoaded', function() {
    const settingsBtn = document.getElementById('settingsBtn');
    const toggleBtn = document.getElementById('toggleBtn');
    const settingsPanel = document.getElementById('settingsModal');
    const mainContent = document.getElementById('mainContent');
    const saveBtn = document.getElementById('saveBtn');
    const credentialInputs = document.querySelectorAll('.credential-input');
    const toggleVisibilityBtns = document.querySelectorAll('.toggle-visibility');

    loadCredentials();

    toggleBtn.addEventListener('click', function() {
        const isRunning = toggleBtn.textContent === 'Stop';
        toggleBtn.textContent = isRunning ? 'Start' : 'Stop';
        toggleBtn.classList.toggle('active');
        
        chrome.runtime.sendMessage({
            action: isRunning ? 'stop' : 'start'
        }, function(response) {
            if (response && response.success) {
                showMessage(isRunning ? 'Stopped' : 'Started');
            } else {
                showMessage(response.error || 'Operation failed', true);
                // Restore button state
                toggleBtn.textContent = isRunning ? 'Stop' : 'Start';
                toggleBtn.classList.toggle('active');
            }
        });
    });

    settingsBtn.addEventListener('click', function() {
        mainContent.style.display = 'none';
        settingsPanel.style.display = 'block';
    });

    saveBtn.addEventListener('click', function() {
        chrome.storage.local.get(null, function(existingCredentials) {
            const updatedCredentials = {};
            let hasChanges = false;

            credentialInputs.forEach(input => {
                if (input.value && input.value !== '••••••••') {
                    updatedCredentials[input.id] = input.value;
                    hasChanges = true;
                } else if (existingCredentials[input.id]) {
                    updatedCredentials[input.id] = existingCredentials[input.id];
                }
            });

            if (hasChanges) {
                chrome.storage.local.set(updatedCredentials, function() {
                    if (chrome.runtime.lastError) {
                        showMessage('Save failed: ' + chrome.runtime.lastError.message, true);
                    } else {
                        showMessage('Save successful!');
                        mainContent.style.display = 'block';
                        settingsPanel.style.display = 'none';
                        credentialInputs.forEach(input => {
                            if (updatedCredentials[input.id]) {
                                input.type = 'password';
                                input.value = '••••••••';
                            }
                        });
                    }
                });
            } else {
                mainContent.style.display = 'block';
                settingsPanel.style.display = 'none';
            }
        });
    });

    toggleVisibilityBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const input = this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.textContent = '🔒';
            } else {
                input.type = 'password';
                this.textContent = '👁️';
            }
        });
    });

    function loadCredentials() {
        chrome.storage.local.get(null, function(items) {
            credentialInputs.forEach(input => {
                if (items[input.id]) {
                    input.type = 'password';
                    input.value = '••••••••';
                }
            });
        });

        chrome.runtime.sendMessage({ action: 'getStatus' }, function(response) {
            if (response && response.isRunning) {
                toggleBtn.textContent = 'Stop';
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.textContent = 'Start';
                toggleBtn.classList.remove('active');
            }
        });
    }

    function showMessage(message, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.padding = '8px';
        messageDiv.style.marginTop = '8px';
        messageDiv.style.borderRadius = '4px';
        messageDiv.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
        messageDiv.style.color = isError ? '#c62828' : '#2e7d32';
        
        const container = document.querySelector('.container');
        container.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
});