// --- Game Constants & Variables ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreValueSpan = document.getElementById('scoreValue');
const linesValueSpan = document.getElementById('linesValue');
const holdCanvas = document.getElementById('holdCanvas');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvas1 = document.getElementById('nextCanvas1');
const nextCtx1 = nextCanvas1.getContext('2d');
const nextCanvas2 = document.getElementById('nextCanvas2');
const nextCtx2 = nextCanvas2.getContext('2d');
// const pauseDiv = document.getElementById('pauseMessage'); // No longer used
const gameStatusContainer = document.getElementById('gameStatusContainer'); // Kept for layout structure

// High Score Elements
const highScoreValueSpan = document.getElementById('highScoreValue');
const highLinesValueSpan = document.getElementById('highLinesValue');

// +++ NEW References for Layout +++
const uiContainer = document.getElementById('uiContainer');
const infoPanel = document.getElementById('info');
const controlsContainer = document.getElementById('controlsContainer');
// ++++++++++++++++++++++++++++++++

// Default settings
let defaultSettings = {
    controls: {
        moveClockwise: 'ArrowLeft',
        moveCounterClockwise: 'ArrowRight',
        rotate180: 'ArrowUp',
        softDrop: 'ArrowDown',
        rotateCounterClockwise: 'T',
        rotateClockwise: 'Z',
        holdPiece: 'U',
        hardDrop: ' ', // Space
        pause: 'Escape',
        restart: 'R',
        quickMotion: '6'
    },
    gameplay: {
        das: 60, // Delayed Auto Shift (ms)
        arr: 80,  // Auto Repeat Rate (ms)
        softDropSpeed: 15, // Soft drop speed multiplier
        initialSpeed: 400, // Initial falling speed (ms per step)
        speedIncrease: 80, // Speed increase rate (%)
        initialLockDelay: 1500, // Initial lock delay (ms)
        lockDelayDecrease: 80, // Lock delay decrease rate (%)
        quickMotionMultiplier: 3 // ARR multiplier when Quick Motion is held
    },
    movement: {
        comboTime: 120  // <<< New combo time setting (ms)
    },
    grid: {
        phiSegments: 24,
        rSegments: 18
    },
    visuals: {
        centralHoleColor: '#3333',
        outerSpaceColor: '#3333',
        lineClearDuration: 30, // ms per flash toggle
        mobiusGridOpacity: 0.8,
        rectBackgroundColor: '#000000',
        dropPathOpacity: 0.25
    },
    // +++ NEW: Game Mode +++
    mode: 'circular' // 'circular' | 'rectangular' | 'mobius'
    // +++++++++++++++++++++
};
let settings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy

// Grid dimensions (dynamically set later)
let R_SEGMENTS = settings.grid.rSegments;
let PHI_SEGMENTS = settings.grid.phiSegments;

// Visuals (dynamically set by JS based on canvas size)
let CANVAS_WIDTH = 600; // Initial placeholder, will be overwritten
let CANVAS_HEIGHT = 600; // Initial placeholder, will be overwritten
let BLOCK_R_SIZE = 20; // Will be recalculated
let INNER_RADIUS = 60; // Will be recalculated (or kept fixed relative to canvas size)
let OUTER_RADIUS = INNER_RADIUS + R_SEGMENTS * BLOCK_R_SIZE; // Will be recalculated
let CENTER_X = CANVAS_WIDTH / 2; // Will be recalculated
let CENTER_Y = CANVAS_HEIGHT / 2; // Will be recalculated
const TAU = 2 * Math.PI; // Full circle angle
let PHI_INCREMENT = TAU / PHI_SEGMENTS; // Will be recalculated
// --- Combo Variables ---
let lastSoftDropPressTime = 0;

// --- Color Utility Functions ---
function hexToRgb(hex) {
    if (typeof hex !== 'string') { return null; }
    const sanitizedHex = hex.startsWith('#') ? hex.slice(1) : hex;
    if (sanitizedHex.length !== 6 && sanitizedHex.length !== 3) { return null; }
    let fullHex = sanitizedHex;
    if (sanitizedHex.length === 3) {
        fullHex = sanitizedHex[0].repeat(2) + sanitizedHex[1].repeat(2) + sanitizedHex[2].repeat(2);
    }
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    const r_c = Math.max(0, Math.min(255, Math.round(r)));
    const g_c = Math.max(0, Math.min(255, Math.round(g)));
    const b_c = Math.max(0, Math.min(255, Math.round(b)));
    const r_hex = r_c.toString(16).padStart(2, '0');
    const g_hex = g_c.toString(16).padStart(2, '0');
    const b_hex = b_c.toString(16).padStart(2, '0');
    return `#${r_hex}${g_hex}${b_hex}`.toUpperCase();
}

function tintWithWhite(hexColor, whiteRatio = 0.85) {
    const baseRgb = hexToRgb(hexColor);
    if (!baseRgb) {
        console.warn(`tintWithWhite: hexToRgb failed for input "${hexColor}". Returning #FFFFFF.`);
        return '#FFFFFF';
    }
    const mixRatio = Math.max(0, Math.min(1, whiteRatio));
    const r = Math.round(baseRgb.r * (1 - mixRatio) + 255 * mixRatio);
    const g = Math.round(baseRgb.g * (1 - mixRatio) + 255 * mixRatio);
    const b = Math.round(baseRgb.b * (1 - mixRatio) + 255 * mixRatio);
    return rgbToHex(r, g, b);
}

function darkenColor(hexColor, factor = 0.3) {
    const baseRgb = hexToRgb(hexColor);
    if (!baseRgb) {
        console.warn(`darkenColor: hexToRgb failed for input "${hexColor}". Returning default '#000000'.`);
        return '#000000';
    }
    const darkFactor = Math.max(0, Math.min(1, factor));
    const r = Math.round(baseRgb.r * darkFactor);
    const g = Math.round(baseRgb.g * darkFactor);
    const b = Math.round(baseRgb.b * darkFactor);
    return rgbToHex(r, g, b);
}

// --- Game State ---
let grid = [];
let currentPiece = null;
let gameSpeed = settings.gameplay.initialSpeed;
let lockDelay = settings.gameplay.initialLockDelay;
let lastUpdateTime = 0;
let isGameOver = false;
let isPaused = false;
let pauseStartTime = 0;
let animationFrameId = null;
let spawnR = 1; // Will be recalculated
let score = 0;
let linesCleared = 0;
let level = 1;
let heldPieceType = null;
let canHold = true;
let nextPieceTypes = [];
const PREVIEW_COUNT = 2;
let linesClearingAnimation = false;
let lineClearFlashTimer = null;
let lineClearCompletionTimer = null;

// --- High Score Tracking ---
let highScore = 0;
let highLines = 0;

// --- DAS/ARR State ---
let moveKeyDown = { clockwise: false, counterClockwise: false };
let dasTimer = null;
let arrInterval = null;
let lastMoveDirection = 0;
let lastMoveSourceKey = null;

// --- Soft Drop State ---
let softDropKeyDown = false;
let softDropInterval = null;
const maxRBaseOffsets = {};

function getMaxRBaseOffset(type) {
    if (maxRBaseOffsets[type] !== undefined) { return maxRBaseOffsets[type]; }
    const baseShape = BASE_SHAPES[type];
    if (!baseShape || !baseShape.blocks || baseShape.blocks.length === 0) {
        console.warn(`No base shape or blocks found for type ${type} when calculating max R offset.`);
        maxRBaseOffsets[type] = 0;
        return 0;
    }
    let maxR = -Infinity;
    baseShape.blocks.forEach(offset => { maxR = Math.max(maxR, offset.r); });
    if (!isFinite(maxR)) { maxR = 0; }
    maxRBaseOffsets[type] = maxR;
    return maxR;
}

// --- Piece Class ---
class Piece {
    constructor(type, r, phi, rotation) {
        this.type = type; this.r = r; this.phi = phi; this.rotation = rotation; this.colorIndex = type;
    }
    getBlocks() { return this.getBlocksForState(this.r, this.phi, this.rotation); }
    getBlocksForState(r, phi, rotation) {
        const blockOffsets = getBlockOffsets(this.type, rotation);
        if (!blockOffsets) { console.error(`Failed to get block offsets for type ${this.type} rotation ${rotation}`); return []; }

        const blocks = [];
        const centerPhi = phi;

        blockOffsets.forEach(offset => {
          const blockR_exact = r + offset.r;
          // Keep the inverted phi offset so pieces aren't mirrored
          const blockPhi_exact = centerPhi - offset.phi;
          const blockPhi_index = Math.round(blockPhi_exact);

          // For rectangular, allow unwrapped columns; for circular and mobius, wrap normally
          const wrappedPhi = ((blockPhi_index % PHI_SEGMENTS) + PHI_SEGMENTS) % PHI_SEGMENTS;
          const finalPhi = (settings?.mode === 'rectangular') ? blockPhi_index : wrappedPhi;
          blocks.push({ r: blockR_exact, phi: finalPhi, colorIndex: this.colorIndex });
        });

        return blocks;
      }
}

// --- Settings Management ---
const settingsModal = document.getElementById('settingsModal');
const settingsToggleButton = document.getElementById('settingsToggleButton');
const settingsCloseButton = settingsModal.querySelector('.modal-close-button');
const settingsSaveButton = document.getElementById('settings-save');
const settingsCancelButton = document.getElementById('settings-cancel');
const settingsExportButton = document.getElementById('settings-export');
const settingsImportButton = document.getElementById('settings-import');
const settingsResetButton = document.getElementById('settings-reset');
const settingsFileInput = document.getElementById('settings-file-input');
const controlsRemapGrid = document.getElementById('controls-remap-grid');

function toggleSettingsModal() {
    if (settingsModal.style.display === 'flex') {
        settingsModal.style.display = 'none';
        if (isPaused && !isGameOver) { togglePause(false); }
    } else {
        loadSettingsToUI();
        settingsModal.style.display = 'flex';
        if (!isPaused && !isGameOver) { togglePause(false); }
    }
}

function getKeyDisplayName(key) {
    if (!key) return 'NONE';
    let displayKey = key.toUpperCase();
    switch(displayKey) {
        case ' ': return 'SPACE';
        case 'ARROWLEFT': return '← LEFT';
        case 'ARROWRIGHT': return '→ RIGHT';
        case 'ARROWUP': return '↑ UP';
        case 'ARROWDOWN': return '↓ DOWN';
        case 'ESCAPE': return 'ESC';
        default: return displayKey;
    }
}

function populateControlSettings() {
    controlsRemapGrid.innerHTML = '';
    const controlMappings = [
        { key: 'moveClockwise', label: 'Move Clockwise' }, { key: 'moveCounterClockwise', label: 'Move Anti-Clockwise' },
        { key: 'rotateClockwise', label: 'Rotate Clockwise' }, { key: 'rotateCounterClockwise', label: 'Rotate Anti-Clockwise' },
        { key: 'rotate180', label: 'Rotate 180°' }, { key: 'softDrop', label: 'Soft Drop' },
        { key: 'hardDrop', label: 'Hard Drop' }, { key: 'holdPiece', label: 'Hold Piece' },
        { key: 'pause', label: 'Pause Game' }, { key: 'restart', label: 'Restart Game' },
        { key: 'quickMotion', label: 'Quick Motion Hotkey' }
    ];
    controlMappings.forEach(mapping => {
        const itemDiv = document.createElement('div'); itemDiv.className = 'settings-item';
        const label = document.createElement('label'); label.textContent = mapping.label;
        const input = document.createElement('input'); input.type = 'text'; input.readOnly = true;
        input.value = getKeyDisplayName(settings.controls[mapping.key]); input.dataset.action = mapping.key;
        input.onclick = function() {
            document.querySelectorAll('#controls-remap-grid input[type="text"]').forEach(inp => {
                inp.classList.remove('listening'); inp.value = getKeyDisplayName(settings.controls[inp.dataset.action]);
            });
            this.value = 'Press a key...'; this.classList.add('listening');
            const keyListener = function(e) {
                e.preventDefault(); const newKey = e.key; const action = input.dataset.action;
                for (const otherAction in settings.controls) {
                    if (otherAction !== action && settings.controls[otherAction] === newKey) {
                        alert(`Key "${getKeyDisplayName(newKey)}" is already assigned to "${controlMappings.find(m => m.key === otherAction)?.label}".\nPlease choose a different key.`);
                        input.value = getKeyDisplayName(settings.controls[action]); input.classList.remove('listening');
                        document.removeEventListener('keydown', keyListener, true); return;
                    }
                }
                settings.controls[action] = newKey; input.value = getKeyDisplayName(newKey);
                input.classList.remove('listening'); document.removeEventListener('keydown', keyListener, true);
                updateControlsInfoPanel();
            };
            document.addEventListener('keydown', keyListener, true);
        };
        itemDiv.appendChild(label); itemDiv.appendChild(input); controlsRemapGrid.appendChild(itemDiv);
    });
}

function loadSettingsToUI() {
    // Gameplay
    document.getElementById('setting-das').value = settings.gameplay.das;
    document.getElementById('setting-arr').value = settings.gameplay.arr;
    const qmmEl = document.getElementById('setting-quickMotionMultiplier');
    if (qmmEl) qmmEl.value = settings.gameplay?.quickMotionMultiplier ?? 3;
    // Controls remapping grid also includes Quick Motion Hotkey via populateControlSettings
    document.getElementById('setting-softDrop').value = settings.gameplay.softDropSpeed;
    // New: Load Combo Time from settings.movement.comboTime (fallback to 150)
    document.getElementById('setting-comboTime').value = settings.movement?.comboTime || 150;
    document.getElementById('setting-initialSpeed').value = settings.gameplay.initialSpeed;
    document.getElementById('setting-speedIncrease').value = settings.gameplay.speedIncrease;
    document.getElementById('setting-initialLockDelay').value = settings.gameplay.initialLockDelay;
    document.getElementById('setting-lockDelayDecrease').value = settings.gameplay.lockDelayDecrease;
    // Grid & Visuals
    document.getElementById('setting-phiSegments').value = settings.grid.phiSegments;
    document.getElementById('setting-rSegments').value = settings.grid.rSegments;
    document.getElementById('setting-holeColor').value = settings.visuals.centralHoleColor;
    document.getElementById('setting-outerColor').value = settings.visuals.outerSpaceColor;
    document.getElementById('setting-lineClearDuration').value = settings.visuals.lineClearDuration;
    const mobiusOpEl = document.getElementById('setting-mobiusGridOpacity');
    const mobiusOpItem = document.getElementById('setting-mobiusGridOpacity-item');
    if (mobiusOpEl) mobiusOpEl.value = (settings.visuals.mobiusGridOpacity ?? 0.8);
    const rectBgEl = document.getElementById('setting-rectBgColor'); if (rectBgEl) rectBgEl.value = (settings.visuals.rectBackgroundColor ?? '#000000');
    const dropPathEl = document.getElementById('setting-dropPathOpacity'); if (dropPathEl) dropPathEl.value = (settings.visuals.dropPathOpacity ?? 0.25);
    // Mode select
    const modeSelect = document.getElementById('setting-mode');
    if (modeSelect) {
        modeSelect.value = settings.mode || 'circular';
        // Show/hide color controls based on mode
        const holeItem = document.getElementById('setting-holeColor')?.closest('.settings-item');
        const outerItem = document.getElementById('setting-outerColor')?.closest('.settings-item');
        const mobiusOpItem = document.getElementById('setting-mobiusGridOpacity-item');
        const setVisibility = (m) => {
            if (m === 'circular') {
                if (holeItem) holeItem.style.display = '';
                if (outerItem) outerItem.style.display = '';
                if (mobiusOpItem) mobiusOpItem.style.display = 'none';
                const rectBgItem = document.getElementById('setting-rectBgColor')?.closest('.settings-item'); if (rectBgItem) rectBgItem.style.display = 'none';
            } else if (m === 'mobius') {
                if (holeItem) holeItem.style.display = 'none';
                if (outerItem) outerItem.style.display = '';
                if (mobiusOpItem) mobiusOpItem.style.display = '';
                const rectBgItem = document.getElementById('setting-rectBgColor')?.closest('.settings-item'); if (rectBgItem) rectBgItem.style.display = 'none';
            } else { // rectangular
                if (holeItem) holeItem.style.display = 'none';
                if (outerItem) outerItem.style.display = 'none';
                if (mobiusOpItem) mobiusOpItem.style.display = 'none';
                const rectBgItem = document.getElementById('setting-rectBgColor')?.closest('.settings-item'); if (rectBgItem) rectBgItem.style.display = '';
            }
        };
        setVisibility(settings.mode);
        // Also update on change without saving yet
        modeSelect.onchange = () => setVisibility(modeSelect.value);
    }
    // Controls
    populateControlSettings();
}

function applySettingsFromUI() {
    const requiresRestart =
        settings.grid.phiSegments !== parseInt(document.getElementById('setting-phiSegments').value) ||
        settings.grid.rSegments !== parseInt(document.getElementById('setting-rSegments').value);
    // Gameplay
    settings.gameplay.das = parseInt(document.getElementById('setting-das').value);
    settings.gameplay.arr = parseInt(document.getElementById('setting-arr').value);
    const qmmEl = document.getElementById('setting-quickMotionMultiplier');
    if (qmmEl) settings.gameplay.quickMotionMultiplier = parseFloat(qmmEl.value) || 1;
    settings.gameplay.softDropSpeed = parseInt(document.getElementById('setting-softDrop').value);
    settings.gameplay.initialSpeed = parseInt(document.getElementById('setting-initialSpeed').value);
    settings.gameplay.speedIncrease = parseInt(document.getElementById('setting-speedIncrease').value);
    settings.gameplay.initialLockDelay = parseInt(document.getElementById('setting-initialLockDelay').value);
    settings.gameplay.lockDelayDecrease = parseInt(document.getElementById('setting-lockDelayDecrease').value);
    // New: Update movement setting for combo time
    settings.movement = settings.movement || {};
    settings.movement.comboTime = parseInt(document.getElementById('setting-comboTime').value);
    // Grid & Visuals
    settings.grid.phiSegments = parseInt(document.getElementById('setting-phiSegments').value);
    settings.grid.rSegments = parseInt(document.getElementById('setting-rSegments').value);
    // Mode selection drives color behavior
    const modeSelect = document.getElementById('setting-mode');
    if (modeSelect && modeSelect.value) { settings.mode = modeSelect.value; }
    if (settings.mode === 'circular') {
        settings.visuals.centralHoleColor = document.getElementById('setting-holeColor').value;
        settings.visuals.outerSpaceColor = document.getElementById('setting-outerColor').value;
    } else if (settings.mode === 'mobius') {
        // Only use a single background color in mobius mode
        settings.visuals.outerSpaceColor = document.getElementById('setting-outerColor').value;
        const mobiusOpEl = document.getElementById('setting-mobiusGridOpacity');
        if (mobiusOpEl) settings.visuals.mobiusGridOpacity = parseFloat(mobiusOpEl.value);
    }
    settings.visuals.lineClearDuration = parseInt(document.getElementById('setting-lineClearDuration').value);
    const rectBgEl = document.getElementById('setting-rectBgColor');
    const dropPathEl = document.getElementById('setting-dropPathOpacity');
    if (rectBgEl) settings.visuals.rectBackgroundColor = rectBgEl.value;
    if (dropPathEl) settings.visuals.dropPathOpacity = parseFloat(dropPathEl.value);
    // Apply immediate changes IF NO RESTART NEEDED
    if (!requiresRestart) {
        applyVisualSettings();
        resizeAndPositionElements();
        drawGame();
    }
    updateControlsInfoPanel();
    saveSettingsToStorage();
    // Reload highscores for possibly new mode so the UI reflects mode-specific records
    loadHighScores();
    if (requiresRestart) {
        alert("Grid dimensions changed. Please restart the game (press R) for these changes to take effect.");
    } else {
        gameSpeed = settings.gameplay.initialSpeed;
        lockDelay = settings.gameplay.initialLockDelay;
    }
    return requiresRestart;
}

function applyVisualSettings() {
    // Only applies settings that don't require a grid rebuild or resize (colors)
     if (!isGameOver && !isPaused) { drawGame(); }
}

function saveSettingsToStorage() {
    try { localStorage.setItem('circularTetrisSettings', JSON.stringify(settings)); }
    catch (e) { console.error('Error saving settings to localStorage:', e); }
}


function loadSettingsFromStorage() {
    try {
        const savedSettings = localStorage.getItem('circularTetrisSettings');
        if (savedSettings) { settings = JSON.parse(savedSettings); }
        else { settings = JSON.parse(JSON.stringify(defaultSettings)); }
        // +++ ensure mode default for old saves +++
        if (!settings.mode) { settings.mode = 'circular'; }
        // ensure defaults exist for new settings
        settings.controls = settings.controls || JSON.parse(JSON.stringify(defaultSettings.controls));
        settings.gameplay = settings.gameplay || JSON.parse(JSON.stringify(defaultSettings.gameplay));
        settings.visuals = settings.visuals || {};
        if (typeof settings.controls.quickMotion !== 'string') settings.controls.quickMotion = defaultSettings.controls.quickMotion;
        if (typeof settings.gameplay.quickMotionMultiplier !== 'number') settings.gameplay.quickMotionMultiplier = defaultSettings.gameplay.quickMotionMultiplier;
        if (typeof settings.visuals.mobiusGridOpacity !== 'number') { settings.visuals.mobiusGridOpacity = (defaultSettings.visuals?.mobiusGridOpacity ?? 0.8); }
        if (typeof settings.visuals.rectBackgroundColor !== 'string') { settings.visuals.rectBackgroundColor = (defaultSettings.visuals?.rectBackgroundColor ?? '#000000'); }
        if (typeof settings.visuals.dropPathOpacity !== 'number') { settings.visuals.dropPathOpacity = (defaultSettings.visuals?.dropPathOpacity ?? 0.25); }
        // ++++++++++++++++++++++++++++++++++++++
    } catch (e) {
        console.error('Error loading settings from localStorage:', e);
        settings = JSON.parse(JSON.stringify(defaultSettings));
    }
}

function resetSettingsToDefault() {
     if (confirm('Reset all settings to defaults? This will overwrite your current settings.')) {
        settings = JSON.parse(JSON.stringify(defaultSettings));
        loadSettingsToUI(); saveSettingsToStorage(); applyVisualSettings(); updateControlsInfoPanel();
        alert("Settings reset to defaults. Grid changes require restart.");
     }
}

function exportSettingsToFile() {
    try {
        const settingsString = JSON.stringify(settings, null, 2); const blob = new Blob([settingsString], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'circular-tetris-settings.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error('Error exporting settings:', e); alert('Failed to export settings.'); }
}

function importSettingsFromFile() { settingsFileInput.click(); }

settingsFileInput.onchange = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedSettings = JSON.parse(e.target.result);
            if (importedSettings.controls && importedSettings.gameplay && importedSettings.grid && importedSettings.visuals) {
                settings = importedSettings; loadSettingsToUI(); saveSettingsToStorage(); applyVisualSettings(); updateControlsInfoPanel();
                alert('Settings imported successfully! Grid changes require restart.');
            } else { alert('Invalid settings file format.'); }
        } catch (error) { console.error('Error importing settings:', error); alert('Failed to import settings. File might be corrupted or invalid.'); }
        finally { settingsFileInput.value = null; }
    };
    reader.onerror = () => { alert('Error reading settings file.'); settingsFileInput.value = null; };
    reader.readAsText(file);
};

// Settings Modal Event Listeners
settingsToggleButton.onclick = toggleSettingsModal;
settingsCloseButton.onclick = toggleSettingsModal;
settingsCancelButton.onclick = toggleSettingsModal;
settingsSaveButton.onclick = () => { applySettingsFromUI(); toggleSettingsModal(); };
settingsResetButton.onclick = resetSettingsToDefault;
settingsExportButton.onclick = exportSettingsToFile;
settingsImportButton.onclick = importSettingsFromFile;
settingsModal.onclick = (e) => { if (e.target === settingsModal) { toggleSettingsModal(); } };

// --- High Score Management ---
function loadHighScores() {
    try {
        const modeKey = settings?.mode || 'circular';
        const highScoreKey = `circularTetrisHighScore_${modeKey}_${settings.gameplay.initialSpeed}_${settings.gameplay.speedIncrease}_${settings.gameplay.initialLockDelay}_${settings.gameplay.lockDelayDecrease}_${settings.grid.phiSegments}_${settings.grid.rSegments}`;
        const highLinesKey = `circularTetrisHighLines_${modeKey}_${settings.gameplay.initialSpeed}_${settings.gameplay.speedIncrease}_${settings.gameplay.initialLockDelay}_${settings.gameplay.lockDelayDecrease}_${settings.grid.phiSegments}_${settings.grid.rSegments}`;
        highScore = parseInt(localStorage.getItem(highScoreKey) || '0', 10);
        highLines = parseInt(localStorage.getItem(highLinesKey) || '0', 10);
    } catch (e) {
        console.error("Error loading high scores:", e);
        highScore = 0;
        highLines = 0;
    }
    updateHighScoreDisplay();
}
function saveHighScoresToStorage() {
    try {
        const modeKey = settings?.mode || 'circular';
        const highScoreKey = `circularTetrisHighScore_${modeKey}_${settings.gameplay.initialSpeed}_${settings.gameplay.speedIncrease}_${settings.gameplay.initialLockDelay}_${settings.gameplay.lockDelayDecrease}_${settings.grid.phiSegments}_${settings.grid.rSegments}`;
        const highLinesKey = `circularTetrisHighLines_${modeKey}_${settings.gameplay.initialSpeed}_${settings.gameplay.speedIncrease}_${settings.gameplay.initialLockDelay}_${settings.gameplay.lockDelayDecrease}_${settings.grid.phiSegments}_${settings.grid.rSegments}`;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem(highScoreKey, highScore.toString());
        }
        if (linesCleared > highLines) {
            highLines = linesCleared;
            localStorage.setItem(highLinesKey, highLines.toString());
        }
    } catch (e) {
        console.error("Error saving high scores to storage:", e);
    }
    updateHighScoreDisplay();
}
function updateHighScoreDisplay() {
    if (highScoreValueSpan) highScoreValueSpan.textContent = highScore;
    if (highLinesValueSpan) highLinesValueSpan.textContent = highLines;
}

// --- Preview Drawing ---
function drawPiecePreview(targetCtx, pieceType) {
    // This function remains unchanged from the provided code.
    // It calculates scaled block sizes and centers the piece preview.
    if (!targetCtx) return;
    const canvas = targetCtx.canvas; const canvasWidth = canvas.width; const canvasHeight = canvas.height;
    targetCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (pieceType === null || pieceType === 0) return;
    const baseShape = BASE_SHAPES[pieceType];
    if (!baseShape || !baseShape.blocks || baseShape.blocks.length === 0) return;
    const offsets = baseShape.blocks; const color = COLORS[pieceType] || '#CCCCCC';
    const UNIVERSAL_MAX_DIM = 4; const paddingPercent = 0.15; const canvasMinDim = Math.min(canvasWidth, canvasHeight);
    const padding = paddingPercent * canvasMinDim; const availableWidth = canvasWidth - (padding * 2); const availableHeight = canvasHeight - (padding * 2);
    const baseBlockSize = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight) / UNIVERSAL_MAX_DIM));
    const scaleX = 2.55; const scaleY = 1.4;
    const scaledBlockWidth = Math.max(1, Math.floor(baseBlockSize * scaleX)); const scaledBlockHeight = Math.max(1, Math.floor(baseBlockSize * scaleY));
    let minR = Infinity, maxR = -Infinity, minPhi = Infinity, maxPhi = -Infinity;
    offsets.forEach(o => { minR = Math.min(minR, o.r); maxR = Math.max(maxR, o.r); minPhi = Math.min(minPhi, o.phi); maxPhi = Math.max(maxPhi, o.phi); });
    minR = isFinite(minR) ? minR : 0; maxR = isFinite(maxR) ? maxR : 0; minPhi = isFinite(minPhi) ? minPhi : 0; maxPhi = isFinite(maxPhi) ? maxPhi : 0;
    const pieceBlockHeight = maxR - minR + 1; const pieceBlockWidth = maxPhi - minPhi + 1;
    const totalPieceWidthPixels = pieceBlockWidth * scaledBlockWidth; const totalPieceHeightPixels = pieceBlockHeight * scaledBlockHeight;
    const offsetX = padding + (availableWidth - totalPieceWidthPixels) / 2; const offsetY = padding + (availableHeight - totalPieceHeightPixels) / 2;
    targetCtx.fillStyle = color; targetCtx.strokeStyle = darkenColor(color, 0.5); targetCtx.lineWidth = 1;
    offsets.forEach(o => {
        const drawX = offsetX + (o.phi - minPhi) * scaledBlockWidth; const drawY = offsetY + (o.r - minR) * scaledBlockHeight;
        const floorX = Math.floor(drawX); const floorY = Math.floor(drawY);
        targetCtx.fillRect(floorX, floorY, scaledBlockWidth, scaledBlockHeight);
        targetCtx.strokeRect(floorX + 0.5, floorY + 0.5, scaledBlockWidth - 1, scaledBlockHeight - 1);
    });
}
function updateHoldPreview() { drawPiecePreview(holdCtx, heldPieceType); }
function updateNextPreviews() {
    drawPiecePreview(nextCtx1, nextPieceTypes[0] ?? null); drawPiecePreview(nextCtx2, nextPieceTypes[1] ?? null);
}

// --- Piece Queue & Spawning ---
function fillQueue() {
    let pieceBag = [1, 2, 3, 4, 5, 6, 7];
    for (let i = pieceBag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pieceBag[i], pieceBag[j]] = [pieceBag[j], pieceBag[i]]; }
    nextPieceTypes = nextPieceTypes.concat(pieceBag);
}
function getNextPieceType() {
    if (nextPieceTypes.length < 7) { fillQueue(); }
    const nextType = nextPieceTypes.shift(); updateNextPreviews(); return nextType;
}
function calculateSpawnR() { // Kept for potential future use, but not called by default
    let globalMinR = 0;
    for (let type = 1; type <= 7; type++) { const baseShape = BASE_SHAPES[type]; if (!baseShape) continue; baseShape.blocks.forEach(offset => { globalMinR = Math.min(globalMinR, offset.r); }); }
    spawnR = -globalMinR;
}
function spawnPiece(pieceType = null) {
    if (isGameOver) return;
    const type = pieceType ?? getNextPieceType();
    const maxBaseR = getMaxRBaseOffset(type);
    const initialR = -maxBaseR;
    const initialPhi = Math.floor(PHI_SEGMENTS / 2);
    const initialRotation = 0;
    const pieceToSpawn = new Piece(type, initialR, initialPhi, initialRotation);
    if (!isValidMove(pieceToSpawn, initialR, initialPhi, initialRotation)) {
        console.error(`Initial spawn position check failed for type ${type} at R=${initialR}, Phi=${initialPhi}.`);
        // Don't game over here, let lockPiece handle it
    } else {
         console.log(`Spawn position validated for type ${type}`);
    }
    currentPiece = pieceToSpawn;
}

// --- Layout and Resizing Logic ---
function positionControlsTable() {
    if (!canvas || !infoPanel || !controlsContainer || !uiContainer) return;
    try { // Add try-catch for robustness during resize/reflow
        // Force reflow to get current dimensions
        canvas.offsetHeight; infoPanel.offsetHeight; controlsContainer.offsetHeight; uiContainer.offsetHeight;

        const canvasRect = canvas.getBoundingClientRect();
        const infoRect = infoPanel.getBoundingClientRect();
        const controlsRect = controlsContainer.getBoundingClientRect();
        const containerRect = uiContainer.getBoundingClientRect();

        if (canvasRect.width === 0 || infoRect.width === 0 || containerRect.width === 0 || controlsRect.height === 0 ) {
            // console.warn("Cannot position controls table, elements might not be ready or have zero dimensions.");
            // Schedule a retry after a short delay
            // setTimeout(positionControlsTable, 50);
            return;
        }

        const targetLeft = infoRect.left;
        const targetTop = canvasRect.bottom - controlsRect.height;
        const finalLeft = targetLeft - containerRect.left;
        const finalTop = targetTop - containerRect.top;

        controlsContainer.style.left = `${Math.max(0, finalLeft)}px`; // Prevent negative left
        controlsContainer.style.top = `${Math.max(0, finalTop)}px`;   // Prevent negative top
    } catch (e) {
        console.error("Error positioning controls table:", e);
    }
}

let resizeTimeout;
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        console.log("Window resized, recalculating layout...");
        resizeAndPositionElements();
        drawGame();
    }, 150);
}

function resizeAndPositionElements() {
    if (!canvas || !ctx || !uiContainer) return;

    // Calculate Canvas Size
    const viewportHeight = window.innerHeight;
    const verticalMargin = 40;
    const availableHeight = Math.max(100, viewportHeight - verticalMargin); // Min height 100px
    const canvasSize = Math.floor(availableHeight);

    canvas.width = canvasSize; canvas.height = canvasSize;
    CANVAS_WIDTH = canvasSize; CANVAS_HEIGHT = canvasSize;

    // Recalculate Dependent Visual Parameters
    R_SEGMENTS = settings.grid.rSegments;
    PHI_SEGMENTS = settings.grid.phiSegments;

    // Scale INNER_RADIUS - simple proportional scaling with min/max
    const innerRadiusRatio = 0.15; // e.g., 15% of canvas radius
    const minInnerRadius = 30;
    const maxInnerRadius = canvasSize * 0.4; // Don't let hole get too big
    INNER_RADIUS = Math.max(minInnerRadius, Math.min(canvasSize / 2 * innerRadiusRatio, maxInnerRadius));

    const radialSpace = (canvasSize / 2) - INNER_RADIUS;
    BLOCK_R_SIZE = Math.max(1, radialSpace / R_SEGMENTS); // Prevent zero/negative size

    OUTER_RADIUS = INNER_RADIUS + R_SEGMENTS * BLOCK_R_SIZE;
    CENTER_X = canvasSize / 2; CENTER_Y = canvasSize / 2;
    PHI_INCREMENT = TAU / PHI_SEGMENTS;

    // Position Controls Table (defer slightly)
    setTimeout(positionControlsTable, 0);

    // Redraw Previews
    updateHoldPreview(); updateNextPreviews();
}

// --- Grid Initialization ---
function initGrid() {
    // Calls the resize function which sets up dimensions based on viewport/settings
    resizeAndPositionElements();

    // Initialize grid array using the dynamically calculated dimensions
    grid = [];
    for (let r = 0; r < R_SEGMENTS; r++) {
        grid[r] = new Array(PHI_SEGMENTS).fill(0);
    }
    // calculateSpawnR(); // Optional: Recalculate if needed based on dynamic INNER_RADIUS
}

// --- Collision & Movement ---
function checkCollision(blocks) {
    for (const block of blocks) {
        const r_exact = block.r; const r_grid = Math.floor(r_exact); const phi_grid = block.phi;
        if (r_grid >= R_SEGMENTS) return false; // Outer Boundary
        if (r_grid >= 0) { // Grid Occupancy (only check within r>=0)
            if (grid[r_grid] === undefined || grid[r_grid][phi_grid] === undefined) return false; // Undefined cell
            if (grid[r_grid][phi_grid] !== 0) return false; // Occupied cell
        }
    }
    return true; // No collision
}
function isValidMove(piece, newR, newPhi, newRotation) {
    if (!piece || typeof piece.getBlocksForState !== 'function') { console.error('isValidMove invalid piece:', piece); return false; }
    const testBlocks = piece.getBlocksForState(newR, newPhi, newRotation);
    return checkCollision(testBlocks);
}
function movePiece(dr, dphi) {
    if (isGameOver || isPaused || !currentPiece || linesClearingAnimation) return false;

    const newR = currentPiece.r + dr;
    let newPhi;

    if (settings?.mode === 'rectangular') {
        newPhi = currentPiece.phi + dphi;
        if (newPhi < 0 || newPhi >= PHI_SEGMENTS) return false;
    } else {
        // circular and mobius: identical mechanics
        newPhi = (currentPiece.phi + (dphi % PHI_SEGMENTS) + PHI_SEGMENTS) % PHI_SEGMENTS;
    }

    if (isValidMove(currentPiece, newR, newPhi, currentPiece.rotation)) {
        currentPiece.r = newR;
        currentPiece.phi = newPhi;
        return true;
    }
    return false;
}

function rotatePiece(rotationAmount) {
    if (isGameOver || isPaused || !currentPiece || currentPiece.type === 2 || linesClearingAnimation) return false;
    const currentR = currentPiece.r; const currentPhi = currentPiece.phi; const currentRotation = currentPiece.rotation;
    const newRotation = (currentRotation + rotationAmount + 4) % 4;
    const kicks = [ { r: 0, phi: 0 }, { r: 0, phi: rotationAmount }, { r: 0, phi: -rotationAmount }, { r: 1, phi: 0 }, { r: -1, phi: 0 }, { r: 0, phi: 2 * rotationAmount } ];
    let kickAttempts = kicks;
    if (Math.abs(rotationAmount) === 2) { kickAttempts = [ { r: 0, phi: 0 }, { r: 1, phi: 0 }, { r: -1, phi: 0 }, { r: 0, phi: 1 }, { r: 0, phi: -1 } ]; }
    for (const kick of kickAttempts) {
        const testR = currentR + kick.r;
        let testPhi;
        if (settings?.mode === 'rectangular') {
            testPhi = currentPhi + kick.phi;
            if (testPhi < 0 || testPhi >= PHI_SEGMENTS) { continue; }
        } else {
            // circular and mobius: identical mechanics
            testPhi = (currentPhi + (kick.phi % PHI_SEGMENTS) + PHI_SEGMENTS) % PHI_SEGMENTS;
        }
        if (isValidMove(currentPiece, testR, testPhi, newRotation)) {
            currentPiece.r = testR; currentPiece.phi = testPhi; currentPiece.rotation = newRotation;
            // resetLockDelayTimer(); // If implementing lock delay reset
            return true;
        }
    }
    return false;
}
function findGhostPosition(piece) {
    if (!piece) return 0; let ghostR = piece.r; let iterations = 0; const maxIterations = R_SEGMENTS * 2;
    while (iterations < maxIterations) { const nextR = ghostR + 1; if (isValidMove(piece, nextR, piece.phi, piece.rotation)) { ghostR = nextR; } else { break; } iterations++; }
    if(iterations >= maxIterations) console.warn("findGhostPosition exceeded max iterations!");
    return ghostR;
}
function hardDrop() {
    if (isGameOver || isPaused || !currentPiece || linesClearingAnimation) return;
    const ghostR = findGhostPosition(currentPiece); const dropDistance = ghostR - currentPiece.r;
    if (dropDistance > 0) { currentPiece.r = ghostR; }
    // Score for hard drop could be added here
    drawGame(); // Redraw immediately
    lockPiece(); // Lock immediately
}

// --- Locking and Line Clearing ---
function lockPiece() {
    if (!currentPiece || linesClearingAnimation) { if (!currentPiece) console.warn("lockPiece called with no currentPiece."); return; }
    const blocksToLock = currentPiece.getBlocks(); const pieceColorIndex = currentPiece.colorIndex;
    const pieceToCheck = currentPiece; // Keep ref for check
    currentPiece = null;

    let isLockGameOver = false;
    for (const block of blocksToLock) {
        const r_grid = Math.floor(block.r); const phi_grid = block.phi;
        if (r_grid >= 0 && r_grid < R_SEGMENTS && phi_grid >= 0 && phi_grid < PHI_SEGMENTS) {
            if (grid[r_grid]?.[phi_grid] !== 0) { // Check using optional chaining for safety
                console.error(`GAME OVER: Lock collision at [${r_grid}][${phi_grid}]`); isLockGameOver = true; break;
            }
        } else { // Block is outside valid grid range
            if (r_grid < 0 && block.r < -0.01) { // Only game over if significantly inside hole
                 console.error(`GAME OVER: Block lock inside hole r_grid=${r_grid}, r_exact=${block.r.toFixed(2)}`); isLockGameOver = true; break;
            }
             if (r_grid >= R_SEGMENTS) { // Locking past the outer edge
                  console.error(`GAME OVER: Block lock outside bounds r_grid=${r_grid}`); isLockGameOver = true; break;
             }
             // Allow blocks slightly negative (e.g., -0.5) to lock if their floor is -1, as long as they don't cause overlap check failure
        }
    }
    if (isLockGameOver) {
        // Draw the piece that failed to lock for visual feedback before game over screen
        if (pieceToCheck) drawPiece(pieceToCheck);
        gameOver(); return;
    }
    blocksToLock.forEach(block => {
        const r_grid = Math.floor(block.r); const phi_grid = block.phi;
        if (r_grid >= 0 && r_grid < R_SEGMENTS && phi_grid >= 0 && phi_grid < PHI_SEGMENTS) {
            grid[r_grid][phi_grid] = pieceColorIndex;
        } else {
             // console.log(`Skipped locking block outside grid: r=${r_grid}, phi=${phi_grid}`);
        }
    });
    animatedClearFullCircles();
}

function animatedClearFullCircles() {
    if (isGameOver) return;
    // For mobius, use exactly the same line clear logic as circular: per ring r
    const fullCircles = [];
    for (let r = 0; r < R_SEGMENTS; r++) {
        let isFull = true;
        for (let phi = 0; phi < PHI_SEGMENTS; phi++) { if (!grid[r] || grid[r][phi] === 0 || grid[r][phi] === undefined) { isFull = false; break; } }
        if (isFull) { fullCircles.push(r); }
    }
    if (fullCircles.length === 0) { completeLineClearing(0); return; }

    linesClearingAnimation = true; const originalColors = {};
    fullCircles.forEach(r => { if (grid[r]) originalColors[r] = [...grid[r]]; });
    let flashCount = 0; const totalFlashes = 4;
    const flashSpeed = Math.max(20, settings.visuals.lineClearDuration);

    if (lineClearFlashTimer) clearInterval(lineClearFlashTimer); if (lineClearCompletionTimer) clearTimeout(lineClearCompletionTimer);

    lineClearFlashTimer = setInterval(() => {
        fullCircles.forEach(r => { if (!grid[r]) return; for (let phi = 0; phi < PHI_SEGMENTS; phi++) { grid[r][phi] = (flashCount % 2 === 0) ? 8 : (originalColors[r] ? originalColors[r][phi] : 0); } });
        drawGame(); flashCount++;
        if (flashCount >= totalFlashes) {
            clearInterval(lineClearFlashTimer); lineClearFlashTimer = null;
            // Actual Clearing Logic
            fullCircles.sort((a, b) => b - a); let rowsDropped = 0;
            for (let rDest = R_SEGMENTS - 1; rDest >= 0; rDest--) {
                let rSrc = rDest - rowsDropped;
                while (rSrc >= 0 && fullCircles.includes(rSrc)) { rowsDropped++; rSrc--; }
                grid[rDest] = (rSrc < 0) ? new Array(PHI_SEGMENTS).fill(0) : (grid[rSrc] ? [...grid[rSrc]] : new Array(PHI_SEGMENTS).fill(0));
            }
            for (let r = 0; r < rowsDropped; r++) { grid[r] = new Array(PHI_SEGMENTS).fill(0); }
            drawGame(); // Final redraw
            lineClearCompletionTimer = setTimeout(() => { completeLineClearing(fullCircles.length); }, flashSpeed); // Delay using same speed
        }
    }, flashSpeed);
}

function animatedClearMobiusRows() {
    // Determine which radial rings are full
    const isFull = new Array(R_SEGMENTS).fill(false);
    for (let r = 0; r < R_SEGMENTS; r++) {
        let ok = true;
        for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
            if (!grid[r] || grid[r][phi] === 0 || grid[r][phi] === undefined) { ok = false; break; }
        }
        isFull[r] = ok;
    }

    // Build list of Möbius row pairs to clear: (r, r')
    const pairs = [];
    const toClearSet = new Set();

    for (let r = 0; r < R_SEGMENTS; r++) {
        const rComp = R_SEGMENTS - 1 - r;
        if (rComp < r) continue; // already considered
        if (r === rComp) {
            // middle row when R_SEGMENTS is odd; self-complement
            if (isFull[r]) {
                pairs.push([r]); toClearSet.add(r);
            }
        } else {
            if (isFull[r] && isFull[rComp]) {
                pairs.push([r, rComp]);
                toClearSet.add(r); toClearSet.add(rComp);
            }
        }
    }

    if (pairs.length === 0) {
        completeLineClearing(0);
        return;
    }

    // Flash effect on all rings in toClearSet
    linesClearingAnimation = true;
    const toClear = Array.from(toClearSet).sort((a, b) => b - a);
    const original = {};
    toClear.forEach(r => { if (grid[r]) original[r] = [...grid[r]]; });

    let flashCount = 0; const totalFlashes = 4;
    const flashSpeed = Math.max(20, settings.visuals.lineClearDuration);

    if (lineClearFlashTimer) clearInterval(lineClearFlashTimer);
    if (lineClearCompletionTimer) clearTimeout(lineClearCompletionTimer);

    lineClearFlashTimer = setInterval(() => {
        toClear.forEach(r => {
            if (!grid[r]) return;
            for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
                grid[r][phi] = (flashCount % 2 === 0) ? 8 : (original[r] ? original[r][phi] : 0);
            }
        });
        drawGame(); flashCount++;

        if (flashCount >= totalFlashes) {
            clearInterval(lineClearFlashTimer); lineClearFlashTimer = null;

            // Drop everything above, same as circular clear but for the union of rows
            let rowsDropped = 0;
            for (let rDest = R_SEGMENTS - 1; rDest >= 0; rDest--) {
                let rSrc = rDest - rowsDropped;
                while (rSrc >= 0 && toClearSet.has(rSrc)) { rowsDropped++; rSrc--; }
                grid[rDest] = (rSrc < 0) ? new Array(PHI_SEGMENTS).fill(0) : (grid[rSrc] ? [...grid[rSrc]] : new Array(PHI_SEGMENTS).fill(0));
            }
            for (let r = 0; r < rowsDropped; r++) { grid[r] = new Array(PHI_SEGMENTS).fill(0); }

            drawGame();
            // Count Möbius rows (pairs) cleared, not physical rings
            lineClearCompletionTimer = setTimeout(() => { completeLineClearing(pairs.length); }, flashSpeed);
        }
    }, flashSpeed);
}
function completeLineClearing(clearedCount) {
    linesClearingAnimation = false; lineClearCompletionTimer = null;
    if (clearedCount > 0) {
        linesCleared += clearedCount;
        const points = [0, 100, 300, 500, 800]; score += points[Math.min(clearedCount, 4)] || points[4];
        level = Math.floor(linesCleared / 10) + 1;
        gameSpeed = settings.gameplay.initialSpeed * Math.pow(settings.gameplay.speedIncrease / 100, level - 1);
        lockDelay = settings.gameplay.initialLockDelay * Math.pow(settings.gameplay.lockDelayDecrease / 100, level - 1);
        gameSpeed = Math.max(gameSpeed, 50); lockDelay = Math.max(lockDelay, 100);
        updateScoreDisplay(); updateLinesDisplay(); saveHighScoresToStorage();
    }
    canHold = true;
    if (!isGameOver) { spawnPiece(); if (!isGameOver) { lastUpdateTime = performance.now(); } }
}
function updateScoreDisplay() { if (scoreValueSpan) scoreValueSpan.textContent = score; }
function updateLinesDisplay() { if (linesValueSpan) linesValueSpan.textContent = linesCleared; }

// --- Hold ---
function holdPieceAction() {
    if (isGameOver || isPaused || !canHold || linesClearingAnimation) return;
    const currentType = currentPiece ? currentPiece.type : null; if (!currentPiece) return; // Can't hold nothing
    let typeToSpawn;
    if (heldPieceType === null) { heldPieceType = currentType; typeToSpawn = getNextPieceType(); }
    else { typeToSpawn = heldPieceType; heldPieceType = currentType; }
    canHold = false; updateHoldPreview(); currentPiece = null;
    spawnPiece(typeToSpawn);
    if (!isGameOver) { drawGame(); }
}

// --- Pause / Game Over / Restart ---
function togglePause(adjustTime = true) {
    if (isGameOver) return; isPaused = !isPaused;
    if (isPaused) {
        if (adjustTime) { pauseStartTime = performance.now(); }
        console.log("Game Paused");
        if (lineClearFlashTimer) clearInterval(lineClearFlashTimer); if (lineClearCompletionTimer) clearTimeout(lineClearCompletionTimer);
        clearTimeout(dasTimer); clearInterval(arrInterval); clearInterval(softDropInterval);
    } else {
        if (adjustTime && pauseStartTime > 0) { const pauseDuration = performance.now() - pauseStartTime; lastUpdateTime += pauseDuration; }
        pauseStartTime = 0; console.log("Game Resumed");
        lastUpdateTime = performance.now(); // Always reset time on resume
        if (!animationFrameId) { animationFrameId = requestAnimationFrame(gameLoop); } // Restart loop if stopped
    }
}
function gameOver() {
    // Prevent multiple calls
    if (isGameOver) return;
    isGameOver = true;
    console.log("Game Over!"); // Log the event

    // --- Stop Game Logic Timers (Keep these active) ---
    // Stop line clear animation timers if they are running
    if (lineClearFlashTimer) clearInterval(lineClearFlashTimer);
    if (lineClearCompletionTimer) clearTimeout(lineClearCompletionTimer);
    linesClearingAnimation = false; // Ensure animation flag is reset

    // Stop DAS/ARR Timers
    clearTimeout(dasTimer);
    clearInterval(arrInterval);
    dasTimer = null; arrInterval = null; lastMoveDirection = 0;

    // Stop Soft Drop Timer
    clearInterval(softDropInterval);
    softDropInterval = null;
    softDropKeyDown = false;

    saveHighScoresToStorage(); // Save scores immediately

} // --- End corrected gameOver ---

// --- Input Handling ---
function handleKeyUp(e) {
    const key = e.key;
    const lowerKey = key.toLowerCase();
    const controls = settings?.controls;
    if (!controls) return;
    if (typeof window.__quickMotionDown !== 'boolean') window.__quickMotionDown = false;
    if (lowerKey === controls.moveClockwise.toLowerCase()) {
        moveKeyDown.clockwise = false;
        if (lastMoveSourceKey === 'clockwise') {
            clearTimeout(dasTimer);
            clearInterval(arrInterval);
            dasTimer = null;
            arrInterval = null;
            lastMoveDirection = 0;
            lastMoveSourceKey = null;
        }
    }
    else if (lowerKey === controls.moveCounterClockwise.toLowerCase()) {
        moveKeyDown.counterClockwise = false;
        if (lastMoveSourceKey === 'counterClockwise') {
            clearTimeout(dasTimer);
            clearInterval(arrInterval);
            dasTimer = null;
            arrInterval = null;
            lastMoveDirection = 0;
            lastMoveSourceKey = null;
        }
    }
    else if (lowerKey === controls.quickMotion?.toLowerCase()) {
        const wasDown = window.__quickMotionDown;
        window.__quickMotionDown = false;
        // If it was down and we are moving, restart the ARR interval to restore normal ARR immediately
        if (wasDown && arrInterval && lastMoveDirection !== 0) {
            restartArrIntervalForCurrentMovement();
        }
    }
    else if (lowerKey === controls.softDrop.toLowerCase()) {
        if (softDropKeyDown) {
            softDropKeyDown = false;
            clearInterval(softDropInterval);
            softDropInterval = null;
            lastSoftDropPressTime = 0;  // <--- Added so that combo is cancelled when soft drop is released
            softDropRelease();
        }
      }
}
function handleKeyDown(e) {
    const key = e.key;
    const lowerKey = key.toLowerCase();
    const controls = settings?.controls;
    if (!controls) return;
    if (typeof window.__quickMotionDown !== 'boolean') window.__quickMotionDown = false;

    if (lowerKey === 'escape' && settingsModal?.style.display === 'flex') {
        toggleSettingsModal();
        e.preventDefault();
        return;
    }
    if (lowerKey === controls.pause.toLowerCase() && settingsModal?.style.display !== 'flex') {
        if (!isGameOver) { togglePause(); }
        e.preventDefault();
        return;
    }
    if (lowerKey === controls.restart.toLowerCase() && settingsModal?.style.display !== 'flex') {
        startGame();
        e.preventDefault();
        return;
    }
    // Quick Motion Hotkey (only sets state; used by ARR timing)
    if (lowerKey === controls.quickMotion?.toLowerCase()) {
        window.__quickMotionDown = true;
        e.preventDefault();
        return;
    }
    if (isGameOver || isPaused || linesClearingAnimation || !currentPiece || settingsModal?.style.display === 'flex') return;

    // --- Quick Motion Toggle Handling ---
    if (lowerKey === controls.quickMotion?.toLowerCase()) {
        window.__quickMotionDown = true;
        e.preventDefault();
        return; // Only sets state; movement loops will pick this up on next key repeat
    }

    // --- Combo Check: If a non-soft-drop key is pressed within DAS time after soft drop ---
    if (
        lastSoftDropPressTime > 0 &&
        lowerKey !== controls.softDrop.toLowerCase() &&
        (performance.now() - lastSoftDropPressTime < settings.movement.comboTime)
    ) {
        // Teleport the tetromino to the ghost position (combo effect)
        const ghostR = findGhostPosition(currentPiece);
        if (ghostR > currentPiece.r) {
            currentPiece.r = ghostR;
            drawGame();
            lastUpdateTime = performance.now();
        }
        lastSoftDropPressTime = 0;
        if (softDropInterval) {
            clearInterval(softDropInterval);
            softDropInterval = null;
        }
        softDropKeyDown = false;
    }

    // --- Track Quick Motion hotkey pressed state ---
    if (!window.__quickMotionDown) window.__quickMotionDown = false;
    if (lowerKey === controls.quickMotion?.toLowerCase()) {
        window.__quickMotionDown = true;
        e.preventDefault();
        return; // Only sets state; movement loops will pick this up on next key repeat
    }

    // --- Continue with existing key handling ---
    let preventDefault = true;
    let direction = 0;
    // Flip directions for rectangular and mobius modes
    const flipDir = (settings?.mode === 'rectangular' || settings?.mode === 'mobius') ? -1 : 1;
    if (lowerKey === controls.moveClockwise.toLowerCase()) { direction = 1 * flipDir; if (!moveKeyDown.clockwise) { moveKeyDown.clockwise = true; lastMoveSourceKey = 'clockwise'; handleMovement(direction, 'clockwise'); } }
    else if (lowerKey === controls.moveCounterClockwise.toLowerCase()) { direction = -1 * flipDir; if (!moveKeyDown.counterClockwise) { moveKeyDown.counterClockwise = true; lastMoveSourceKey = 'counterClockwise'; handleMovement(direction, 'counterClockwise'); } }
    else if (lowerKey === controls.rotateCounterClockwise.toLowerCase()) { if (rotatePiece((settings?.mode === 'rectangular' || settings?.mode === 'mobius') ? 1 : -1)) drawGame(); }
    else if (lowerKey === controls.rotateClockwise.toLowerCase()) { if (rotatePiece((settings?.mode === 'rectangular' || settings?.mode === 'mobius') ? -1 : 1)) drawGame(); }
    else if (lowerKey === controls.rotate180.toLowerCase()) { if (rotatePiece(2)) drawGame(); }
    else if (lowerKey === controls.softDrop.toLowerCase()) {
        if (!softDropKeyDown) {
            softDropKeyDown = true;
            lastSoftDropPressTime = performance.now();  // <--- Added to mark soft drop press for the combo
            clearInterval(softDropInterval);
            let moved = movePiece(1, 0);
            if (moved) {
                score += 1;
                updateScoreDisplay();
                lastUpdateTime = performance.now();
                drawGame();
            } else {
                softDropKeyDown = false;
                return;
            }
            const multiplier = Math.max(1, settings.gameplay.softDropSpeed || 1);
            const minInterval = 1;
            const intervalTime = Math.max(minInterval, gameSpeed / multiplier);
            softDropInterval = setInterval(() => {
                if (isGameOver || isPaused || linesClearingAnimation || !currentPiece || !softDropKeyDown) {
                    clearInterval(softDropInterval);
                    softDropInterval = null;
                    softDropKeyDown = false;
                    return;
                }
                if (movePiece(1, 0)) {
                    score += 1;
                    updateScoreDisplay();
                    lastUpdateTime = performance.now();
                    drawGame();
                } else {
                    clearInterval(softDropInterval);
                    softDropInterval = null;
                    softDropKeyDown = false;
                }
            }, intervalTime);
        }
    }
    else if (lowerKey === controls.hardDrop.toLowerCase()) { hardDrop(); return; }
    else if (lowerKey === controls.holdPiece.toLowerCase()) { holdPieceAction(); return; }
    else { preventDefault = false; }
    if (preventDefault) { e.preventDefault(); }
}

function restartArrIntervalForCurrentMovement() {
    try {
        clearInterval(arrInterval);
        arrInterval = null;
        if (lastMoveDirection === 0 || !currentPiece) return;
        const currentArr = settings.gameplay.arr || 30;
        const minArrInterval = 5;
        const qmm = Math.max(1, Number(settings?.gameplay?.quickMotionMultiplier) || 1);
        const appliedArr = window.__quickMotionDown ? (currentArr / qmm) : currentArr;
        const intervalTime = Math.max(minArrInterval, appliedArr);
        // Immediately attempt a move to feel responsive
        if (movePiece(0, lastMoveDirection)) { drawGame(); }
        arrInterval = setInterval(() => {
            if (isGameOver || isPaused || linesClearingAnimation || !currentPiece) {
                clearInterval(arrInterval);
                arrInterval = null;
                lastMoveDirection = 0;
                lastMoveSourceKey = null;
                return;
            }
            const stillHeldArr = (lastMoveSourceKey === 'clockwise' && moveKeyDown.clockwise) ||
                                 (lastMoveSourceKey === 'counterClockwise' && moveKeyDown.counterClockwise);
            if (stillHeldArr) {
                if (movePiece(0, lastMoveDirection)) { drawGame(); }
            } else {
                clearInterval(arrInterval);
                arrInterval = null;
                lastMoveDirection = 0;
                lastMoveSourceKey = null;
            }
        }, intervalTime);
    } catch (e) { console.error('Error restarting ARR interval:', e); }
}

function handleMovement(direction, sourceKey) {
    if (isGameOver || isPaused || linesClearingAnimation || !currentPiece) return;
    // Always attempt to move—even if unsuccessful—so that our timers get set.
    movePiece(0, direction);
    drawGame();
    clearTimeout(dasTimer);
    clearInterval(arrInterval);
    dasTimer = null;
    arrInterval = null;
    lastMoveDirection = direction;
    lastMoveSourceKey = sourceKey;
    const currentDas = settings.gameplay.das || 150;

    // Helper to start/restart ARR interval for the current move direction
    function startArrInterval() {
        const currentArr = settings.gameplay.arr || 30;
        const minArrInterval = 5;
        const qmm = Math.max(1, Number(settings?.gameplay?.quickMotionMultiplier) || 1);
        const appliedArr = window.__quickMotionDown ? (currentArr / qmm) : currentArr;
        const intervalTime = Math.max(minArrInterval, appliedArr);

        arrInterval = setInterval(() => {
            if (isGameOver || isPaused || linesClearingAnimation || !currentPiece) {
                clearInterval(arrInterval);
                arrInterval = null;
                lastMoveDirection = 0;
                lastMoveSourceKey = null;
                return;
            }
            const stillHeldArr = (lastMoveSourceKey === 'clockwise' && moveKeyDown.clockwise) ||
                                 (lastMoveSourceKey === 'counterClockwise' && moveKeyDown.counterClockwise);
            if (stillHeldArr) {
                // Always try to move—even if movePiece returns false.
                if (movePiece(0, direction)) {
                    drawGame();
                }
                // Do not cancel the interval if the move is blocked.
            } else {
                clearInterval(arrInterval);
                arrInterval = null;
                lastMoveDirection = 0;
                lastMoveSourceKey = null;
            }
        }, intervalTime);
    }

    dasTimer = setTimeout(() => {
      if (isGameOver || isPaused || linesClearingAnimation || !currentPiece) {
        dasTimer = null;
        lastMoveDirection = 0;
        lastMoveSourceKey = null;
        return;
      }
      const stillHeld = (lastMoveSourceKey === 'clockwise' && moveKeyDown.clockwise) ||
                        (lastMoveSourceKey === 'counterClockwise' && moveKeyDown.counterClockwise);
      if (stillHeld) {
        dasTimer = null;
        // Try the lateral move unconditionally here:
        movePiece(0, direction);
        drawGame();
        startArrInterval();
      } else {
        dasTimer = null;
        lastMoveDirection = 0;
        lastMoveSourceKey = null;
      }
    }, currentDas);

    // Attach helper function to global scope so other code can restart ARR on quickMotion toggle
    window.restartArrIntervalForCurrentMovement = restartArrIntervalForCurrentMovement;
}

// --- Drawing ---
function drawBlock(r_grid, phi_grid, colorIndex, fillColor = null, strokeColor = '#555', lineWidth = 1) {
    if (settings?.mode === 'rectangular') {
        return drawBlockRectangular(r_grid, phi_grid, colorIndex, fillColor, strokeColor, lineWidth);
    } else if (settings?.mode === 'mobius') {
        return drawBlockMobius(r_grid, phi_grid, colorIndex, fillColor, strokeColor, lineWidth);
    }

    // Default polar mode
    if (r_grid < 0 || r_grid >= R_SEGMENTS) return;
    let finalFillColor = fillColor;
    if (!finalFillColor) {
        if (colorIndex === 8) {
            finalFillColor = '#FFFFFF';
        } else if (colorIndex > 0 && colorIndex < COLORS.length) {
            finalFillColor = COLORS[colorIndex];
        } else {
            return;
        }
    }

    const startAngle = phi_grid * PHI_INCREMENT - Math.PI / 2;
    const endAngle = (phi_grid + 1) * PHI_INCREMENT - Math.PI / 2;
    const innerR = INNER_RADIUS + r_grid * BLOCK_R_SIZE;
    const outerR = INNER_RADIUS + (r_grid + 1) * BLOCK_R_SIZE;

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, outerR, startAngle, endAngle, false);
    ctx.arc(CENTER_X, CENTER_Y, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = finalFillColor;
    ctx.fill();
    if (strokeColor && lineWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

function drawBlockRectangular(r_grid, phi_grid, colorIndex, fillColor = null, strokeColor = '#555', lineWidth = 1) {
    if (r_grid < 0 || r_grid >= R_SEGMENTS || phi_grid < 0 || phi_grid >= PHI_SEGMENTS) return;
    let finalFillColor = fillColor;
    if (!finalFillColor) {
        if (colorIndex === 8) {
            finalFillColor = '#FFFFFF';
        } else if (colorIndex > 0 && colorIndex < COLORS.length) {
            finalFillColor = COLORS[colorIndex];
        } else {
            return;
        }
    }

    // Square cells: choose cell size by min dimension
    const cellSize = Math.floor(Math.min(CANVAS_WIDTH / PHI_SEGMENTS, CANVAS_HEIGHT / R_SEGMENTS));
    const gridW = cellSize * PHI_SEGMENTS; const gridH = cellSize * R_SEGMENTS;
    const offsetX = Math.floor((CANVAS_WIDTH - gridW) / 2);
    const offsetY = Math.floor((CANVAS_HEIGHT - gridH) / 2);

    const x = offsetX + phi_grid * cellSize;
    const y = offsetY + r_grid * cellSize;

    ctx.fillStyle = finalFillColor;
    ctx.fillRect(x, y, cellSize, cellSize);
    if (strokeColor && lineWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    }
}

let MOBIUS_OFFSET_U = 0; // radians; applied to all mobius u parameters to keep current piece in view
let LAST_MOBIUS_PIECE_U = null; // track last u of current piece to update offset incrementally
function getMobiusU(u) { return u + MOBIUS_OFFSET_U; }
function shortestAngleDelta(a, b) {
    // returns a-b wrapped to (-PI, PI]
    let d = a - b;
    while (d <= -Math.PI) d += TAU;
    while (d > Math.PI) d -= TAU;
    return d;
}

// Rotate a 3D point around the Z axis by an angle (in radians) to reorient the strip on screen
const MOBIUS_SCREEN_ROT = -Math.PI / 2; // rotate so falling appears generally downward on screen
function rotateXY(pt, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: pt.x * c - pt.y * s, y: pt.x * s + pt.y * c, z: pt.z };
}

function mobiusMap(u, v, R = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.36) {
    // Display-only parameterization: double the u traversal so each field spans twice the length,
    // eliminating the visual branch cut while keeping the same u range and grid counts.
    const uAdj = getMobiusU(u);
    const uEff = 2 * uAdj;
    const x = (R + v * Math.cos(uEff / 2)) * Math.cos(uEff);
    const y = (R + v * Math.cos(uEff / 2)) * Math.sin(uEff);
    const z = v * Math.sin(uEff / 2);
    return { x, y, z };
}

function project3D(pt, cameraZ, f) {
    const z = pt.z + cameraZ;
    const invZ = 1 / Math.max(1e-3, z);
    return {
        x: CENTER_X + pt.x * f * invZ,
        y: CENTER_Y - pt.y * f * invZ,
        z: z
    };
}


function drawBlockMobius(r_grid, phi_grid, colorIndex, fillColor = null, strokeColor = '#333', lineWidth = 0.5) {
    if (r_grid < 0 || r_grid >= R_SEGMENTS || phi_grid < 0 || phi_grid >= PHI_SEGMENTS) return;
    let finalFillColor = fillColor;
    if (!finalFillColor) {
        if (colorIndex === 8) {
            finalFillColor = '#FFFFFF';
        } else if (colorIndex > 0 && colorIndex < COLORS.length) {
            finalFillColor = COLORS[colorIndex];
        } else {
            return;
        }
    }

    const u0 = (phi_grid / PHI_SEGMENTS) * TAU;
    const u1 = ((phi_grid + 1) / PHI_SEGMENTS) * TAU;
    const vHalfWidth = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.12;
    const v0 = ((r_grid) / R_SEGMENTS) * 2 - 1; // [-1,1]
    const v1 = ((r_grid + 1) / R_SEGMENTS) * 2 - 1;
    const v0s = v0 * vHalfWidth;
    const v1s = v1 * vHalfWidth;

    const camZ = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 1.2;
    const focal = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 1.2;

    const m00 = mobiusMap(u0, v0s);
    const m10 = mobiusMap(u1, v0s);
    const m11 = mobiusMap(u1, v1s);
    const m01 = mobiusMap(u0, v1s);

    const p00 = project3D(rotateXY(m00, MOBIUS_SCREEN_ROT), camZ, focal);
    const p10 = project3D(rotateXY(m10, MOBIUS_SCREEN_ROT), camZ, focal);
    const p11 = project3D(rotateXY(m11, MOBIUS_SCREEN_ROT), camZ, focal);
    const p01 = project3D(rotateXY(m01, MOBIUS_SCREEN_ROT), camZ, focal);

    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fillStyle = finalFillColor;
    ctx.fill();
    if (strokeColor && lineWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

// Helper functions for Möbius field fill and back/front classification

function drawMobiusFieldCell(r_grid, phi_grid) {
    const op = (typeof settings?.visuals?.mobiusGridOpacity === 'number') ? settings.visuals.mobiusGridOpacity : 0;
    const clamped = Math.max(0, Math.min(1, op));
    const fill = `rgba(0,0,0,${clamped})`;
    drawBlockMobius(r_grid, phi_grid, 0, fill, null, 0);
}

function mobiusCellCenterZ(r_grid, phi_grid) {
    // Use analytic sign of the surface normal (with doubled-u mapping) to classify front/back once per column.
    const uMid = ((phi_grid + 0.5) / PHI_SEGMENTS) * TAU;
    const uAdj = getMobiusU(uMid);
    // For r(2u,v), nz sign depends on cos(uAdj): front if cos(uAdj) < 0
    return (Math.cos(uAdj) < 0) ? 1 : -1;
}

function isMobiusBack(r_grid, phi_grid) {
    return mobiusCellCenterZ(r_grid, phi_grid) < 0;
}
function drawGrid() {
    ctx.globalAlpha = 1.0;
    if (settings?.mode === 'mobius') {
        // Three-layer sandwich: FRONT blocks -> film -> BACK blocks
        // Front side blocks first so film overlays them appropriately
        for (let r = 0; r < R_SEGMENTS; r++) {
            for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
                const val = grid[r]?.[phi] || 0;
                if (!val) continue;
                if (!isMobiusBack(r, phi)) drawBlock(r, phi, val);
            }
        }
        // Film layer covering all cells
        for (let r = 0; r < R_SEGMENTS; r++) {
            for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
                drawMobiusFieldCell(r, phi);
            }
        }
        // Back side blocks last
        for (let r = 0; r < R_SEGMENTS; r++) {
            for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
                const val = grid[r]?.[phi] || 0;
                if (!val) continue;
                if (isMobiusBack(r, phi)) drawBlock(r, phi, val);
            }
        }
        return;
    }
    for (let r = 0; r < R_SEGMENTS; r++) { for (let phi = 0; phi < PHI_SEGMENTS; phi++) { if (grid[r]?.[phi] !== 0) { drawBlock(r, phi, grid[r][phi]); } } }
}
function drawGhostPiece(piece, ghostR) {
    if (!piece || ghostR <= piece.r) return;
    const ghostBlocks = piece.getBlocksForState(ghostR, piece.phi, piece.rotation);
    const colorIndex = piece.colorIndex;
    const baseColor = COLORS[colorIndex] || '#CCCCCC';
    const outlineColor = tintWithWhite(baseColor, 0.85);
    if (settings?.mode === 'mobius') {
        // draw ghost with back/front passes and lower alpha
        ctx.globalAlpha = 0.3;
        ghostBlocks.forEach(block => { const r_draw = Math.floor(block.r); if (r_draw >= 0 && r_draw < R_SEGMENTS && isMobiusBack(r_draw, block.phi)) { drawBlock(r_draw, block.phi, colorIndex, null, null, 0); } });
        // outlines on top for front only
        ctx.globalAlpha = 0.7;
        ghostBlocks.forEach(block => { const r_draw = Math.floor(block.r); if (r_draw >= 0 && r_draw < R_SEGMENTS && !isMobiusBack(r_draw, block.phi)) { drawBlock(r_draw, block.phi, 0, null, outlineColor, 1.5); } });
        ctx.globalAlpha = 1.0;
        return;
    }
    // original non-mobius
    ctx.globalAlpha = 0.3;
    ghostBlocks.forEach(block => { const r_draw = Math.floor(block.r); if (r_draw >= 0 && r_draw < R_SEGMENTS) { drawBlock(r_draw, block.phi, colorIndex, null, null, 0); } });
    ctx.globalAlpha = 0.7;
    ghostBlocks.forEach(block => { const r_draw = Math.floor(block.r); if (r_draw >= 0 && r_draw < R_SEGMENTS) { drawBlock(r_draw, block.phi, 0, null, outlineColor, 1.5); } });
    ctx.globalAlpha = 1.0;
}
function drawDropPath(piece, ghostR) {
    if (!piece || ghostR <= piece.r) return;
    const currentBlocks = piece.getBlocks(); const ghostBlocks = piece.getBlocksForState(ghostR, piece.phi, piece.rotation); const baseColor = COLORS[piece.colorIndex] || '#CCCCCC'; const pathColor = darkenColor(baseColor, 0.3); if (!pathColor) return;
    const currentLowestR = new Map(); currentBlocks.forEach(block => { const r_grid = Math.floor(block.r); if (r_grid >= 0) currentLowestR.set(block.phi, Math.max(currentLowestR.get(block.phi) ?? -1, r_grid)); });
    const ghostHighestR = new Map(); ghostBlocks.forEach(block => { const r_grid = Math.floor(block.r); if (r_grid >= 0) ghostHighestR.set(block.phi, Math.min(ghostHighestR.get(block.phi) ?? R_SEGMENTS, r_grid)); });
    const op = Math.max(0, Math.min(1, settings?.visuals?.dropPathOpacity ?? 0.25));
    ctx.globalAlpha = op; const relevantPhis = new Set([...currentLowestR.keys(), ...ghostHighestR.keys()]);
    relevantPhis.forEach(phi => {
        const maxCurrentR = currentLowestR.get(phi); const minGhostR = ghostHighestR.get(phi);
        if (maxCurrentR !== undefined && minGhostR !== undefined) { const startR = maxCurrentR + 1; const endR = minGhostR; if (startR < endR) { for (let r = startR; r < endR; r++) { if (r >= 0 && r < R_SEGMENTS && grid[r]?.[phi] === 0) { drawBlock(r, phi, 0, pathColor, null, 0); } } } }
    });
    ctx.globalAlpha = 1.0;
}
function drawPiece(piece) {
    if (!piece) return; ctx.globalAlpha = 1.0;
    if (settings?.mode === 'mobius') {
        // Draw piece with back/front separation to avoid visual overlap
        const blocks = piece.getBlocks();
        // Back pass
        blocks.forEach(block => {
            const r_draw = Math.floor(block.r);
            if (r_draw >= -1 && r_draw < R_SEGMENTS) {
                if (isMobiusBack(r_draw, block.phi)) drawBlock(r_draw, block.phi, block.colorIndex);
            }
        });
        // Front pass
        blocks.forEach(block => {
            const r_draw = Math.floor(block.r);
            if (r_draw >= -1 && r_draw < R_SEGMENTS) {
                if (!isMobiusBack(r_draw, block.phi)) drawBlock(r_draw, block.phi, block.colorIndex);
            }
        });
        return;
    }
    const blocks = piece.getBlocks(); blocks.forEach(block => { const r_draw = Math.floor(block.r); if (r_draw >= -1 && r_draw < R_SEGMENTS) { drawBlock(r_draw, block.phi, block.colorIndex); } }); // Allow drawing at r=-1
}
function drawGridLines() {
    if (settings?.mode === 'rectangular') {
        return drawGridLinesRectangular();
    }

    if (settings?.mode === 'mobius') {
        // Draw grid lines on the Möbius manifold with adjustable opacity
        const op = (typeof settings.visuals.mobiusGridOpacity === 'number') ? settings.visuals.mobiusGridOpacity : 0.8;
        ctx.strokeStyle = `rgba(200,200,200,${Math.min(1, Math.max(0, op))})`;
        ctx.lineWidth = 0.7;
        const camZ = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 1.2;
        const focal = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 1.2;
        const vHalfWidth = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.12;
        // r-constant lines (v varies)
        for (let r = 0; r <= R_SEGMENTS; r++) {
            const v = (r / R_SEGMENTS) * 2 - 1; // [-1,1]
            const vScaled = v * vHalfWidth;
            ctx.beginPath();
            for (let phi = 0; phi <= PHI_SEGMENTS; phi++) {
                const u = (phi / PHI_SEGMENTS) * TAU;
                const m = mobiusMap(u, vScaled);
                const p = project3D(rotateXY(m, MOBIUS_SCREEN_ROT), camZ, focal);
                if (phi === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        // phi-constant lines (u varies)
        for (let phi = 0; phi <= PHI_SEGMENTS; phi++) {
            ctx.beginPath();
            for (let r = 0; r <= R_SEGMENTS; r++) {
                const v = (r / R_SEGMENTS) * 2 - 1;
                const vScaled = v * vHalfWidth;
                const u = (phi / PHI_SEGMENTS) * TAU;
                const m = mobiusMap(u, vScaled);
                const p = project3D(rotateXY(m, MOBIUS_SCREEN_ROT), camZ, focal);
                if (r === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        return;
    }

    // circular grid lines ...
    ctx.strokeStyle = '#444444'; ctx.lineWidth = 0.5;
    const innerR = Math.max(0, Math.min(INNER_RADIUS, OUTER_RADIUS - 2));
    for (let r = 0; r <= R_SEGMENTS; r++) {
        const radius = innerR + (r / R_SEGMENTS) * (OUTER_RADIUS - innerR);
        ctx.beginPath(); ctx.arc(CENTER_X, CENTER_Y, radius, 0, TAU); ctx.stroke();
    }
    const outerDrawRadius = Math.max(INNER_RADIUS, OUTER_RADIUS); // Use larger radius for spoke length
    for (let phi = 0; phi < PHI_SEGMENTS; phi++) {
        const angle = phi * PHI_INCREMENT - Math.PI / 2; const cosA = Math.cos(angle); const sinA = Math.sin(angle);
        const startX = CENTER_X + INNER_RADIUS * cosA; const startY = CENTER_Y + INNER_RADIUS * sinA;
        const endX = CENTER_X + outerDrawRadius * cosA; const endY = CENTER_Y + outerDrawRadius * sinA;
        if (INNER_RADIUS > 0) { // Only draw if there's a hole
           ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
        }
    }
}

function drawGridLinesRectangular() {
    ctx.strokeStyle = '#444444'; ctx.lineWidth = 0.5;
    const cellSize = Math.floor(Math.min(CANVAS_WIDTH / PHI_SEGMENTS, CANVAS_HEIGHT / R_SEGMENTS));
    const gridW = cellSize * PHI_SEGMENTS; const gridH = cellSize * R_SEGMENTS;
    const offsetX = Math.floor((CANVAS_WIDTH - gridW) / 2);
    const offsetY = Math.floor((CANVAS_HEIGHT - gridH) / 2);

    for (let r = 0; r <= R_SEGMENTS; r++) {
        const y = Math.floor(offsetY + r * cellSize) + 0.5; ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + gridW, y); ctx.stroke();
    }
    for (let c = 0; c <= PHI_SEGMENTS; c++) {
        const x = Math.floor(offsetX + c * cellSize) + 0.5; ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + gridH); ctx.stroke();
    }
}
function drawGame() {
    if (!ctx) return;
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // Background elements
    // Update Möbius camera alignment to keep current piece near the front BEFORE drawing anything that uses mobiusMap
    if (settings?.mode === 'mobius') {
        if (currentPiece) {
            const uCenter = (currentPiece.phi / PHI_SEGMENTS) * TAU;
            if (LAST_MOBIUS_PIECE_U == null) {
                MOBIUS_OFFSET_U = -uCenter;
            } else {
                const delta = shortestAngleDelta(uCenter, LAST_MOBIUS_PIECE_U);
                MOBIUS_OFFSET_U -= delta;
            }
            LAST_MOBIUS_PIECE_U = uCenter;
        } else {
            LAST_MOBIUS_PIECE_U = null;
        }
    }
    if (settings?.mode === 'circular') {
        ctx.fillStyle = settings.visuals.outerSpaceColor;
        ctx.beginPath();
        ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.arc(CENTER_X, CENTER_Y, Math.max(0, OUTER_RADIUS), 0, TAU, true);
        ctx.fill(); // Ensure radius >= 0
        if (INNER_RADIUS > 0) {
            ctx.fillStyle = settings.visuals.centralHoleColor;
            ctx.beginPath();
            ctx.arc(CENTER_X, CENTER_Y, INNER_RADIUS, 0, TAU);
            ctx.fill();
        }
    } else if (settings?.mode === 'mobius') {
        // Single background color only for mobius
        ctx.fillStyle = settings.visuals.outerSpaceColor;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else if (settings?.mode === 'mobius') {
        // Single background color only for mobius
        ctx.fillStyle = settings.visuals.outerSpaceColor;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        // rectangular: custom background color behind the grid area only
        ctx.fillStyle = settings?.visuals?.rectBackgroundColor || '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Paint the grid area back to black so fields remain black as before
        const cellSize = Math.floor(Math.min(CANVAS_WIDTH / PHI_SEGMENTS, CANVAS_HEIGHT / R_SEGMENTS));
        const gridW = cellSize * PHI_SEGMENTS; const gridH = cellSize * R_SEGMENTS;
        const offsetX = Math.floor((CANVAS_WIDTH - gridW) / 2);
        const offsetY = Math.floor((CANVAS_HEIGHT - gridH) / 2);
        ctx.fillStyle = '#000000';
        ctx.fillRect(offsetX, offsetY, gridW, gridH);
    }
    // Grid lines
    drawGridLines();
    // Placed pieces
    drawGrid();
    // Ghost & Path
    if (currentPiece && !isPaused && !isGameOver && !linesClearingAnimation) {
        const ghostR = findGhostPosition(currentPiece);
        if (ghostR > currentPiece.r) {
            // Draw colorful drop path for all modes, including mobius
            drawDropPath(currentPiece, ghostR);
            drawGhostPiece(currentPiece, ghostR);
        }
    }
    // Current piece
    if (currentPiece && !linesClearingAnimation) {
        drawPiece(currentPiece);
    }
    // UI Overlays are drawn in gameLoop
}

// --- Game Loop ---
function update(timestamp) {
    if (isGameOver || isPaused || linesClearingAnimation) return;
    const isSoftDropping = softDropKeyDown;
    if (currentPiece && !isSoftDropping) {
        const deltaTime = timestamp - lastUpdateTime;
        if (deltaTime >= gameSpeed) {
            if (!movePiece(1, 0)) { lockPiece(); } // Gravity failed, lock
            else { lastUpdateTime = timestamp; /* resetLockDelayTimer(); */ } // Gravity succeeded
        }
    }
}
function gameLoop(timestamp) {
    animationFrameId = requestAnimationFrame(gameLoop);
    if (!isPaused && !isGameOver && !linesClearingAnimation) { update(timestamp); }
    drawGame();
    // --- Draw UI Overlays ---
    if (isGameOver) {
        const overlayRectY = CANVAS_HEIGHT / 2 - 30; const overlayRectHeight = 60; const textY = CENTER_Y;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, overlayRectY, CANVAS_WIDTH, overlayRectHeight);
        ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'red'; const restartKeyName = getKeyDisplayName(settings.controls.restart);
        ctx.fillText(`GAME OVER (${restartKeyName})`, CENTER_X, textY);
    } else if (isPaused) {
        const overlayRectY = CANVAS_HEIGHT / 2 - 30; const overlayRectHeight = 60; const textY = CENTER_Y;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, overlayRectY, CANVAS_WIDTH, overlayRectHeight);
        ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'yellow'; const pauseKeyName = getKeyDisplayName(settings.controls.pause);
        ctx.fillText(`PAUSED (${pauseKeyName})`, CENTER_X, textY);
    }
}

// --- Initialization ---
function updateControlsInfoPanel() {
    try {
       if (!controlsContainer) { console.error("Controls container not found"); return; }
       const headingP = controlsContainer.querySelector('p');
       const existingTables = controlsContainer.querySelectorAll('table');
       if (existingTables && existingTables.length) existingTables.forEach(t => t.remove()); // Remove all tables to avoid duplicates
       if (headingP) { headingP.textContent = "CONTROLS (Remapable In Settings)"; } // Update text
       else { const newP = document.createElement('p'); newP.textContent = "CONTROLS (Remapable In Settings)"; controlsContainer.insertBefore(newP, controlsContainer.firstChild); }

       const table = document.createElement('table');
       const controlMappings = [
           { key: 'moveClockwise', action: 'Move Clockwise' }, { key: 'moveCounterClockwise', action: 'Move Anti-Clockwise' },
           { key: 'rotateClockwise', action: 'Rotate Clockwise' }, { key: 'rotateCounterClockwise', action: 'Rotate Anti-Clockwise' },
           { key: 'rotate180', action: 'Rotate 180°' }, { key: 'softDrop', action: 'Soft Drop' },
           { key: 'hardDrop', action: 'Hard Drop' }, { key: 'holdPiece', action: 'Hold Piece' },
           { key: 'pause', action: 'Pause / Resume' }, { key: 'restart', action: 'Restart Game' },
           { key: 'quickMotion', action: 'Quick Motion (ARR x Multiplier while held)' }
       ];
       controlMappings.forEach(mapping => {
           const row = table.insertRow(); const keyCell = row.insertCell(); const actionCell = row.insertCell();
           keyCell.textContent = getKeyDisplayName(settings.controls[mapping.key]); actionCell.textContent = mapping.action;
       });
       controlsContainer.appendChild(table);
   } catch (error) { console.error("Error updating controls info panel:", error); }
}

function startGame() {
    console.log("Starting/Restarting game...");
    // Stop Existing Processes
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (lineClearFlashTimer) clearInterval(lineClearFlashTimer); if (lineClearCompletionTimer) clearTimeout(lineClearCompletionTimer);
    lineClearFlashTimer = null; lineClearCompletionTimer = null; clearTimeout(dasTimer); clearInterval(arrInterval); clearInterval(softDropInterval);
    dasTimer = null; arrInterval = null; softDropInterval = null; lastMoveDirection = 0; moveKeyDown = { clockwise: false, counterClockwise: false }; softDropKeyDown = false;
    // Reset Game State
    isGameOver = false; isPaused = false; linesClearingAnimation = false; currentPiece = null;
    score = 0; linesCleared = 0; level = 1; heldPieceType = null; canHold = true; nextPieceTypes = [];
    // Load Settings, Init Grid/Layout
    loadSettingsFromStorage();
    initGrid(); // This now handles resizing and positioning
    gameSpeed = settings.gameplay.initialSpeed; lockDelay = settings.gameplay.initialLockDelay;
    // Load High Scores
    loadHighScores();
    // Reset UI Elements (Minimal now)
    if (gameStatusContainer) gameStatusContainer.style.display = 'block'; // Keep for spacing
    // Init Queue & Update Displays
    fillQueue(); fillQueue();
    updateScoreDisplay(); updateLinesDisplay(); updateHighScoreDisplay();
    updateHoldPreview(); updateNextPreviews(); updateControlsInfoPanel();
    // Spawn First Piece
    spawnPiece();
    // Start Loop & Input
    if (!isGameOver) {
        lastUpdateTime = performance.now();
        document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('keyup', handleKeyUp);
        document.addEventListener('keydown', handleKeyDown); document.addEventListener('keyup', handleKeyUp);
        animationFrameId = requestAnimationFrame(gameLoop);
        console.log("Game loop started.");
    } else {
        console.log("Game ended immediately on start.");
        drawGame(); // Draw final state
    }
}

// --- Window Load ---
window.onload = () => {
    console.log("Window loaded.");
    // DOM Element Check
    const essentialElements = [canvas, holdCanvas, nextCanvas1, nextCanvas2, scoreValueSpan, linesValueSpan, highScoreValueSpan, highLinesValueSpan, uiContainer, infoPanel, controlsContainer];
    if (essentialElements.some(el => !el)) {
        console.error("CRITICAL ERROR: Essential DOM elements not found. Cannot start game. Missing:", essentialElements.filter(el => !el).map(el => el?.id || 'unknown'));
        alert("Error: Could not find essential game elements on the page. Check the HTML structure and IDs.");
        return;
    }
    // Asset Check
    if (typeof BASE_SHAPES === 'undefined' || typeof getBlockOffsets !== 'function' || typeof COLORS === 'undefined') {
         console.error("Error: tetrominoes.js or required variables not loaded correctly.");
         alert("Error loading game assets (tetrominoes.js). Please check console.");
         return;
    }
    // Add resize listener
    window.addEventListener('resize', handleResize);
    // Start Game
    startGame();
};