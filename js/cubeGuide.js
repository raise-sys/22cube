const models = new WeakMap();

const faceAxes = {
    U: [0, -1, 0],
    D: [0, 1, 0],
    R: [1, 0, 0],
    L: [-1, 0, 0],
    F: [0, 0, 1],
    B: [0, 0, -1]
};

const stickerAxes = {
    up: faceAxes.U,
    down: faceAxes.D,
    right: faceAxes.R,
    left: faceAxes.L,
    front: faceAxes.F,
    back: faceAxes.B
};

const visibleFaces = [
    {
        key: "up",
        label: "上面",
        axis: faceAxes.U,
        indexOf: position => (position[2] > 0 ? 2 : 0) + (position[0] > 0 ? 1 : 0)
    },
    {
        key: "front",
        label: "前面",
        axis: faceAxes.F,
        indexOf: position => (position[1] > 0 ? 2 : 0) + (position[0] > 0 ? 1 : 0)
    }
];

const identity = () => [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
];

export function initialize(stage, corners) {
    if (!stage) return;
    stage.replaceChildren();

    const view = document.createElement("div");
    view.className = "guide-two-face-view";
    stage.appendChild(view);

    const faceElements = {};
    for (const definition of visibleFaces) {
        const panel = document.createElement("section");
        panel.className = `guide-flat-face guide-flat-${definition.key}`;

        const label = document.createElement("strong");
        label.className = "guide-flat-label";
        label.textContent = definition.label;
        panel.appendChild(label);

        const grid = document.createElement("div");
        grid.className = "guide-flat-grid";
        const cells = [];
        for (let index = 0; index < 4; index++) {
            const cell = document.createElement("span");
            cell.className = "guide-flat-sticker";
            cell.setAttribute("aria-hidden", "true");
            grid.appendChild(cell);
            cells.push(cell);
        }
        panel.appendChild(grid);
        view.appendChild(panel);
        faceElements[definition.key] = { panel, cells };
    }

    const indicator = document.createElement("span");
    indicator.className = "guide-turn-indicator";
    indicator.setAttribute("aria-hidden", "true");
    stage.appendChild(indicator);

    const cubelets = corners.map(corner => ({
        position: [corner.x, corner.y, corner.z],
        orientation: identity(),
        stickers: { ...corner.stickers }
    }));

    const model = { cubelets, initialCubelets: cloneCubelets(cubelets), faceElements, indicator };
    models.set(stage, model);
    renderVisibleFaces(model);
}

export function showComparison(beforeStage, afterStage, notations, stepIndex, prefixNotations = []) {
    const before = models.get(beforeStage);
    const after = models.get(afterStage);
    if (!before || !after) return;

    resetModel(before);
    for (const notation of prefixNotations ?? []) {
        applyMove(before, notation);
    }

    const safeStep = Math.max(0, Math.min(Number(stepIndex) || 0, Math.max(0, notations.length - 1)));
    for (let index = 0; index < safeStep; index++) {
        applyMove(before, notations[index]);
    }

    setCubelets(after, before.cubelets);
    if (notations.length > 0) {
        applyMove(after, notations[safeStep]);
    }

    renderVisibleFaces(before);
    renderVisibleFaces(after);
}

export async function animateComparison(beforeStage, afterStage, notation, speechText) {
    const before = models.get(beforeStage);
    const after = models.get(afterStage);
    if (!before || !after || !notation) return;

    speak(speechText);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const [stage, model] of [[beforeStage, before], [afterStage, after]]) {
        model.indicator.textContent = notation;
        stage.dataset.turnFace = notation[0];
        stage.classList.add("is-turning");
    }

    await delay(reducedMotion ? 120 : 650);
    for (const stage of [beforeStage, afterStage]) {
        stage.classList.remove("is-turning");
        delete stage.dataset.turnFace;
    }
}

export async function animateMove(stage, notation, speechText) {
    const model = models.get(stage);
    if (!model || !notation) return;

    speak(speechText);
    const face = notation[0];
    if (!faceAxes[face]) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    model.indicator.textContent = notation;
    stage.dataset.turnFace = face;
    stage.classList.add("is-turning");
    await delay(reducedMotion ? 40 : 220);

    applyMove(model, notation);

    renderVisibleFaces(model);
    await delay(reducedMotion ? 80 : 360);
    stage.classList.remove("is-turning");
    delete stage.dataset.turnFace;
}

export function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.92;
    const japaneseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang?.toLowerCase().startsWith("ja"));
    if (japaneseVoice) utterance.voice = japaneseVoice;
    window.speechSynthesis.speak(utterance);
}

export function cancelSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function renderVisibleFaces(model) {
    for (const definition of visibleFaces) {
        const colors = new Array(4).fill("#aab3bb");
        for (const cubelet of model.cubelets) {
            if (dot(cubelet.position, definition.axis) < 0.5) continue;
            const index = definition.indexOf(cubelet.position);
            colors[index] = findStickerColor(cubelet, definition.axis) ?? "#aab3bb";
        }

        colors.forEach((color, index) => {
            model.faceElements[definition.key].cells[index].style.setProperty("--guide-sticker", color);
        });
    }
}

function findStickerColor(cubelet, targetAxis) {
    for (const [face, color] of Object.entries(cubelet.stickers)) {
        const localAxis = stickerAxes[face];
        if (!localAxis) continue;
        const worldAxis = multiplyVector(cubelet.orientation, localAxis).map(roundCoordinate);
        if (worldAxis.every((value, index) => value === targetAxis[index])) {
            return color;
        }
    }
    return null;
}

function applyMove(model, notation) {
    const axis = faceAxes[notation?.[0]];
    if (!axis) return;

    // 外側から面を見た時計回りは、外向き法線に対する正の90度回転。
    const angle = notation.endsWith("'") ? -90 : notation.endsWith("2") ? 180 : 90;
    const rotation = rotationMatrix(axis, angle);
    const moving = model.cubelets.filter(cubelet => dot(cubelet.position, axis) > 0.5);

    for (const cubelet of moving) {
        cubelet.position = multiplyVector(rotation, cubelet.position).map(roundCoordinate);
        cubelet.orientation = multiplyMatrix(rotation, cubelet.orientation);
    }
}

function resetModel(model) {
    setCubelets(model, model.initialCubelets);
}

function setCubelets(model, source) {
    model.cubelets = cloneCubelets(source);
}

function cloneCubelets(cubelets) {
    return cubelets.map(cubelet => ({
        position: [...cubelet.position],
        orientation: cubelet.orientation.map(row => [...row]),
        stickers: { ...cubelet.stickers }
    }));
}

function rotationMatrix(axis, degrees) {
    const radians = degrees * Math.PI / 180;
    const [x, y, z] = axis;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const t = 1 - c;
    return [
        [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
        [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
        [t * x * z - s * y, t * y * z + s * x, t * z * z + c]
    ];
}

function multiplyVector(matrix, vector) {
    return matrix.map(row => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}

function multiplyMatrix(left, right) {
    return left.map((row, i) => right[0].map((_, j) =>
        row[0] * right[0][j] + row[1] * right[1][j] + row[2] * right[2][j]));
}

function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function roundCoordinate(value) {
    return Math.abs(value) < 0.001 ? 0 : Math.round(value);
}

function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}
