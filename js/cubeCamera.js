// 上面・前面だけを中央へ大きく配置する、4枚撮影用の専用座標。
const twoFaceSamplePoints = [
    { face: "up", index: 0, x: 0.43, y: 0.27 },
    { face: "up", index: 1, x: 0.57, y: 0.27 },
    { face: "up", index: 2, x: 0.41, y: 0.39 },
    { face: "up", index: 3, x: 0.59, y: 0.39 },

    { face: "front", index: 0, x: 0.40, y: 0.55 },
    { face: "front", index: 1, x: 0.60, y: 0.55 },
    { face: "front", index: 2, x: 0.40, y: 0.74 },
    { face: "front", index: 3, x: 0.60, y: 0.74 }
];

// 初期プロトタイプの3面撮影を再利用する場合の互換座標。
const threeFaceSamplePoints = [
    { face: "up", index: 0, x: 0.40, y: 0.27 },
    { face: "up", index: 1, x: 0.54, y: 0.25 },
    { face: "up", index: 2, x: 0.43, y: 0.35 },
    { face: "up", index: 3, x: 0.56, y: 0.33 },

    { face: "front", index: 0, x: 0.36, y: 0.43 },
    { face: "front", index: 1, x: 0.45, y: 0.48 },
    { face: "front", index: 2, x: 0.36, y: 0.56 },
    { face: "front", index: 3, x: 0.45, y: 0.61 },

    { face: "right", index: 0, x: 0.54, y: 0.47 },
    { face: "right", index: 1, x: 0.64, y: 0.42 },
    { face: "right", index: 2, x: 0.54, y: 0.61 },
    { face: "right", index: 3, x: 0.64, y: 0.56 }
];

const maxFileBytes = 20 * 1024 * 1024;
const maxCanvasDimension = 1600;
const supportedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif"
]);
const supportedExtension = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

export function getSamplePoints(includedFaces) {
    return selectSamplePoints(includedFaces).map(point => ({ ...point }));
}

export async function loadImageAndSample(fileInput, canvas, includedFaces) {
    if (!fileInput?.files?.length) {
        throw new Error("画像が選択されていません。写真を撮影または選択してください。");
    }

    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Canvasを初期化できませんでした。ページを再読み込みしてください。");
    }

    const file = fileInput.files[0];
    validateFile(file);

    const imageUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(imageUrl);
        drawImageToCanvas(image, canvas);
        return sampleCanvas(canvas, includedFaces);
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

export function sampleCanvas(canvas, includedFaces) {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
        throw new Error("Canvasのサイズを取得できません。先に画像を選択してください。");
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        throw new Error("Canvasの画像データを取得できませんでした。");
    }

    // 短辺の約1.5%。1000px画像なら約15pxの正方形になります。
    let sampleSize = Math.max(5, Math.round(Math.min(canvas.width, canvas.height) * 0.015));
    if (sampleSize % 2 === 0) {
        sampleSize += 1;
    }

    return selectSamplePoints(includedFaces)
        .map(point => samplePoint(context, canvas, point, sampleSize));
}

function selectSamplePoints(includedFaces) {
    const faces = normalizeIncludedFaces(includedFaces);
    const isTwoFaceCapture = faces.size === 2 && faces.has("up") && faces.has("front");
    const source = isTwoFaceCapture ? twoFaceSamplePoints : threeFaceSamplePoints;
    return source.filter(point => faces.has(point.face));
}

function normalizeIncludedFaces(includedFaces) {
    const values = Array.isArray(includedFaces) && includedFaces.length > 0
        ? includedFaces
        : ["up", "front", "right"];
    return new Set(values.map(face => String(face).toLowerCase()));
}

function validateFile(file) {
    if (!file) {
        throw new Error("画像が選択されていません。");
    }

    const mimeIsSupported = supportedMimeTypes.has((file.type || "").toLowerCase());
    const extensionIsSupported = supportedExtension.test(file.name || "");
    if (!mimeIsSupported && !extensionIsSupported) {
        throw new Error("未対応の画像形式です。JPEG、PNG、WebP、HEIC、HEIF、AVIFを選択してください。");
    }

    if (file.size > maxFileBytes) {
        throw new Error("画像サイズが大きすぎます。20MB以下の画像を選択してください。");
    }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("画像の読み込みに失敗しました。画像形式がブラウザーで表示できるか確認してください。"));
        image.src = url;
    });
}

function drawImageToCanvas(image, canvas) {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
        throw new Error("画像の幅または高さを取得できませんでした。");
    }

    const scale = Math.min(1, maxCanvasDimension / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        throw new Error("Canvasを初期化できませんでした。");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function samplePoint(context, canvas, point, sampleSize) {
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        throw new Error(`サンプリング座標が画像範囲外です: ${point.face}[${point.index}]`);
    }

    const centerX = Math.round(point.x * (canvas.width - 1));
    const centerY = Math.round(point.y * (canvas.height - 1));
    if (centerX < 0 || centerX >= canvas.width || centerY < 0 || centerY >= canvas.height) {
        throw new Error(`サンプリング座標が画像範囲外です: ${point.face}[${point.index}]`);
    }

    const half = Math.floor(sampleSize / 2);
    const left = Math.max(0, centerX - half);
    const top = Math.max(0, centerY - half);
    const right = Math.min(canvas.width, centerX + half + 1);
    const bottom = Math.min(canvas.height, centerY + half + 1);
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        throw new Error(`サンプリング範囲が画像範囲外です: ${point.face}[${point.index}]`);
    }

    let pixels;
    try {
        pixels = context.getImageData(left, top, width, height).data;
    } catch {
        throw new Error(`画像データの取得に失敗しました: ${point.face}[${point.index}]`);
    }

    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
            continue;
        }

        red += pixels[i];
        green += pixels[i + 1];
        blue += pixels[i + 2];
        count++;
    }

    if (count === 0) {
        throw new Error(`サンプリング範囲に有効な画素がありません: ${point.face}[${point.index}]`);
    }

    return {
        face: point.face,
        index: point.index,
        r: Math.round(red / count),
        g: Math.round(green / count),
        b: Math.round(blue / count)
    };
}
