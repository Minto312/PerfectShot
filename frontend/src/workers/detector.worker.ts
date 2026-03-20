/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'

// SharedArrayBuffer不要にするためシングルスレッド
ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'

// --- 定数（Rust実装と同一値） ---
const MODEL_INPUT_W = 640
const MODEL_INPUT_H = 480
const CONFIDENCE_THRESHOLD = 0.7
const NMS_THRESHOLD = 0.3
const BBOX_SMOOTH_ALPHA = 0.4
const SCORE_EMA_ALPHA = 0.5
const TRACK_IOU_THRESHOLD = 0.3
const FACE_MESH_SIZE = 192

const EAR_OPEN = 0.28
const EAR_CLOSED = 0.12

// MediaPipe 468点メッシュの目の輪郭インデックス（EAR計算用6点）
const RIGHT_EYE = [33, 160, 158, 133, 153, 144]
const LEFT_EYE = [362, 385, 387, 263, 373, 380]

// --- 型定義 ---
interface TrackedFace {
  bbox: [number, number, number, number]
  eyeScoreEma: number
}

interface FaceDetection {
  x: number
  y: number
  width: number
  height: number
  eye_open_score: number
}

interface DetectionResult {
  faces: FaceDetection[]
  overall_score: number
}

// --- 状態 ---
let faceSession: ort.InferenceSession | null = null
let meshSession: ort.InferenceSession | null = null
let tracker: TrackedFace[] = []

// --- 初期化 ---
async function init() {
  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
  }
  // 顔検出は必須、ランドマーク(FaceMesh)は失敗してもフォールバック可能
  faceSession = await ort.InferenceSession.create('/models/ultraface_640.onnx', opts)
  try {
    meshSession = await ort.InferenceSession.create('/models/face_mesh_192x192.onnx', opts)
  } catch (err) {
    console.warn('FaceMesh model load failed, eye score will default to 0.5:', err)
  }
}

// --- 前処理: UltraFace ---
function preprocessUltraFace(rgba: Uint8Array, w: number, h: number): ort.Tensor {
  const data = new Float32Array(3 * MODEL_INPUT_H * MODEL_INPUT_W)
  const sx = w / MODEL_INPUT_W
  const sy = h / MODEL_INPUT_H
  const planeSize = MODEL_INPUT_H * MODEL_INPUT_W

  for (let dy = 0; dy < MODEL_INPUT_H; dy++) {
    for (let dx = 0; dx < MODEL_INPUT_W; dx++) {
      const srcX = Math.min(Math.floor(dx * sx), w - 1)
      const srcY = Math.min(Math.floor(dy * sy), h - 1)
      const idx = (srcY * w + srcX) * 4
      if (idx + 2 < rgba.length) {
        const off = dy * MODEL_INPUT_W + dx
        data[off] = (rgba[idx] - 127) / 128
        data[planeSize + off] = (rgba[idx + 1] - 127) / 128
        data[2 * planeSize + off] = (rgba[idx + 2] - 127) / 128
      }
    }
  }
  return new ort.Tensor('float32', data, [1, 3, MODEL_INPUT_H, MODEL_INPUT_W])
}

// --- 前処理: FaceMesh ---
function preprocessFaceMesh(
  rgba: Uint8Array, imgW: number, imgH: number,
  faceX: number, faceY: number, faceW: number, faceH: number,
): ort.Tensor {
  const S = FACE_MESH_SIZE
  const data = new Float32Array(3 * S * S)
  const cropX = Math.floor(faceX * imgW)
  const cropY = Math.floor(faceY * imgH)
  const cropW = Math.max(Math.floor(faceW * imgW), 1)
  const cropH = Math.max(Math.floor(faceH * imgH), 1)
  const sx = cropW / S
  const sy = cropH / S
  const planeSize = S * S

  for (let dy = 0; dy < S; dy++) {
    for (let dx = 0; dx < S; dx++) {
      const srcX = Math.min(cropX + Math.floor(dx * sx), imgW - 1)
      const srcY = Math.min(cropY + Math.floor(dy * sy), imgH - 1)
      const idx = (srcY * imgW + srcX) * 4
      if (idx + 2 < rgba.length) {
        const off = dy * S + dx
        data[off] = rgba[idx] / 255
        data[planeSize + off] = rgba[idx + 1] / 255
        data[2 * planeSize + off] = rgba[idx + 2] / 255
      }
    }
  }
  return new ort.Tensor('float32', data, [1, 3, S, S])
}

// --- NMS ---
function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const inter = Math.max(x2 - x1, 0) * Math.max(y2 - y1, 0)
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return union <= 0 ? 0 : inter / union
}

function nms(dets: [number, number[]][], threshold: number): [number, number[]][] {
  const result: [number, number[]][] = []
  const suppressed = new Uint8Array(dets.length)
  for (let i = 0; i < dets.length; i++) {
    if (suppressed[i]) continue
    result.push(dets[i])
    for (let j = i + 1; j < dets.length; j++) {
      if (!suppressed[j] && iou(dets[i][1], dets[j][1]) > threshold) {
        suppressed[j] = 1
      }
    }
  }
  return result
}

// --- EAR計算 ---
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

function computeEar(lm: Float32Array, indices: number[]): number {
  const p = (i: number) => [lm[indices[i] * 3] / FACE_MESH_SIZE, lm[indices[i] * 3 + 1] / FACE_MESH_SIZE] as const
  const [p1x, p1y] = p(0)
  const [p2x, p2y] = p(1)
  const [p3x, p3y] = p(2)
  const [p4x, p4y] = p(3)
  const [p5x, p5y] = p(4)
  const [p6x, p6y] = p(5)
  const h = dist(p1x, p1y, p4x, p4y)
  if (h < 1e-6) return 0
  return (dist(p2x, p2y, p6x, p6y) + dist(p3x, p3y, p5x, p5y)) / (2 * h)
}

function earToScore(ear: number): number {
  if (ear >= EAR_OPEN) return 1.0
  if (ear <= EAR_CLOSED) return 0.0
  return (ear - EAR_CLOSED) / (EAR_OPEN - EAR_CLOSED)
}

// --- 目のスコア推定 ---
async function estimateEyeScore(
  rgba: Uint8Array, imgW: number, imgH: number,
  faceX: number, faceY: number, faceW: number, faceH: number,
): Promise<number> {
  if (!meshSession) return 0.5

  const input = preprocessFaceMesh(rgba, imgW, imgH, faceX, faceY, faceW, faceH)
  const results = await meshSession.run({ [meshSession.inputNames[0]]: input })
  const lmData = results[meshSession.outputNames[0]].data as Float32Array

  if (lmData.length < 468 * 3) return 0.5

  const leftEar = computeEar(lmData, LEFT_EYE)
  const rightEar = computeEar(lmData, RIGHT_EYE)
  return earToScore((leftEar + rightEar) / 2)
}

// --- メイン検出 ---
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

async function detect(rgba: Uint8Array, width: number, height: number): Promise<DetectionResult> {
  if (!faceSession) return { faces: [], overall_score: 0 }

  // UltraFace推論
  const input = preprocessUltraFace(rgba, width, height)
  const outputs = await faceSession.run({ [faceSession.inputNames[0]]: input })
  const names = faceSession.outputNames
  const scoresData = outputs[names[0]].data as Float32Array
  const boxesData = outputs[names[1]].data as Float32Array
  const numBoxes = outputs[names[0]].dims[1]

  let dets: [number, number[]][] = []
  for (let i = 0; i < numBoxes; i++) {
    const conf = scoresData[i * 2 + 1]
    if (conf < CONFIDENCE_THRESHOLD) continue
    const b = i * 4
    dets.push([conf, [boxesData[b], boxesData[b + 1], boxesData[b + 2], boxesData[b + 3]]])
  }
  dets.sort((a, b) => b[0] - a[0])
  dets = nms(dets, NMS_THRESHOLD)

  // トラッキング＆スムージング
  const newTracked: TrackedFace[] = []
  const usedPrev = new Uint8Array(tracker.length)
  const faces: FaceDetection[] = []

  for (const [, bbox] of dets) {
    const raw: [number, number, number, number] = [
      Math.max(0, Math.min(1, bbox[0])),
      Math.max(0, Math.min(1, bbox[1])),
      Math.max(0, Math.min(1, bbox[2])),
      Math.max(0, Math.min(1, bbox[3])),
    ]

    let matchIdx = -1
    let bestIoU = TRACK_IOU_THRESHOLD
    for (let i = 0; i < tracker.length; i++) {
      if (usedPrev[i]) continue
      const v = iou(raw, tracker[i].bbox)
      if (v > bestIoU) { bestIoU = v; matchIdx = i }
    }

    let smoothed: [number, number, number, number]
    if (matchIdx >= 0) {
      usedPrev[matchIdx] = 1
      const prev = tracker[matchIdx]
      smoothed = [
        lerp(prev.bbox[0], raw[0], BBOX_SMOOTH_ALPHA),
        lerp(prev.bbox[1], raw[1], BBOX_SMOOTH_ALPHA),
        lerp(prev.bbox[2], raw[2], BBOX_SMOOTH_ALPHA),
        lerp(prev.bbox[3], raw[3], BBOX_SMOOTH_ALPHA),
      ]
    } else {
      smoothed = raw
    }

    const x = smoothed[0], y = smoothed[1]
    const w = smoothed[2] - smoothed[0], h = smoothed[3] - smoothed[1]
    const rawScore = await estimateEyeScore(rgba, width, height, x, y, w, h)
    const eyeScore = matchIdx >= 0
      ? lerp(tracker[matchIdx].eyeScoreEma, rawScore, SCORE_EMA_ALPHA)
      : rawScore

    newTracked.push({ bbox: smoothed, eyeScoreEma: eyeScore })
    faces.push({ x, y, width: w, height: h, eye_open_score: eyeScore })
  }

  tracker = newTracked
  const overall_score = faces.length === 0
    ? 0
    : faces.reduce((s, f) => s + f.eye_open_score, 0) / faces.length

  return { faces, overall_score }
}

// --- Worker メッセージハンドラ ---
self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'init') {
    try {
      await init()
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) })
    }
    return
  }

  if (type === 'detect') {
    try {
      const rgba = new Uint8Array(e.data.frameData)
      const result = await detect(rgba, e.data.width, e.data.height)
      self.postMessage({ type: 'result', result })
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) })
    }
  }
}
