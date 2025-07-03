let isClicking = false;
let clickCount = 0;

const toggleBtn = document.getElementById('toggleBtn');
const intervalInput = document.getElementById('interval');
const intervalDisplay = document.querySelector('.interval-display');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const clickCountDisplay = document.getElementById('clickCount');

intervalInput.addEventListener('input', (e) => {
    const value = e.target.value;
    const seconds = (value / 1000).toFixed(1);
    intervalDisplay.textContent = `${seconds} seconds`;
});

toggleBtn.addEventListener('click', async () => {
    if (!isClicking) {
        startClicking();
    } else {
        stopClicking();
    }
});

async function startClicking() {
    const interval = parseInt(intervalInput.value);
    
    if (interval < 50) {
        alert('Interval must be at least 50ms');
        return;
    }

    isClicking = true;
    toggleBtn.classList.remove('start-btn');
    toggleBtn.classList.add('stop-btn');
    toggleBtn.querySelector('.btn-text').textContent = 'Stop Clicking';
    statusIndicator.classList.add('active');
    statusText.textContent = 'Active';
    intervalInput.disabled = true;

    const started = await window.electronAPI.startClicking(interval);
    if (!started) {
        // Permission was denied, reset UI
        stopClicking();
        return;
    }
}

async function stopClicking() {
    isClicking = false;

    toggleBtn.classList.remove('stop-btn');
    toggleBtn.classList.add('start-btn');
    toggleBtn.querySelector('.btn-text').textContent = 'Start Clicking';
    statusIndicator.classList.remove('active');
    statusText.textContent = 'Idle';
    intervalInput.disabled = false;

    await window.electronAPI.stopClicking();
}

window.electronAPI.onClickPerformed((event, data) => {
    clickCount = data.count;
    clickCountDisplay.textContent = clickCount;
    console.log(`Click performed, total: ${data.count}`);
});

window.electronAPI.onDebugMessage((event, data) => {
    console.log(`[DEBUG] ${data.message}`);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isClicking) {
        stopClicking();
    }
});

// Handle force stop from main process (global ESC key)
window.electronAPI.onForceStop(() => {
    if (isClicking) {
        console.log('Force stopping from global ESC key');
        stopClicking();
    }
});