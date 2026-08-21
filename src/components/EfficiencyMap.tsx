import { useEffect, useRef } from 'react'
import { engineEfficiency, engineMaxTorque } from '../simulation/model'

interface Props { rpm: number; torque: number; engineOn: boolean; torqueLabel?: string }

function heatColor(value: number) {
  const t = Math.max(0, Math.min(1, (value - 0.12) / 0.25))
  const stops = [
    [26, 39, 55], [33, 90, 116], [37, 157, 127], [173, 213, 86], [244, 210, 64], [255, 111, 45],
  ]
  const scaled = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  const f = scaled - i
  const rgb = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f))
  return `rgb(${rgb.join(',')})`
}

export function EfficiencyMap({ rpm, torque, engineOn, torqueLabel = 'TORQUE / Nm' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(10, rect.width * ratio)
    canvas.height = Math.max(10, rect.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    const w = rect.width
    const h = rect.height
    const pad = { l: 34, r: 10, t: 14, b: 25 }
    const pw = w - pad.l - pad.r
    const ph = h - pad.t - pad.b
    ctx.clearRect(0, 0, w, h)

    const cols = 36
    const rows = 22
    for (let x = 0; x < cols; x += 1) {
      const cellRpm = (x + 0.5) / cols * 5200
      const maxTorque = engineMaxTorque(cellRpm)
      for (let y = 0; y < rows; y += 1) {
        const cellTorque = (rows - y - 0.5) / rows * 125
        ctx.fillStyle = cellTorque <= maxTorque ? heatColor(engineEfficiency(cellRpm, cellTorque)) : '#eef0ee'
        ctx.fillRect(pad.l + x / cols * pw, pad.t + y / rows * ph, pw / cols + 0.5, ph / rows + 0.5)
      }
    }

    ctx.strokeStyle = 'rgba(18, 28, 31, .16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.l, pad.t)
    ctx.lineTo(pad.l, pad.t + ph)
    ctx.lineTo(pad.l + pw, pad.t + ph)
    ctx.stroke()
    ctx.font = '10.5px Inter, sans-serif'
    ctx.fillStyle = '#718079'
    ctx.textAlign = 'center'
    for (let x = 0; x <= 5000; x += 1000) {
      const px = pad.l + x / 5200 * pw
      ctx.fillText(String(x / 1000) + 'k', px, h - 7)
    }
    ctx.save()
    ctx.translate(10, pad.t + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(torqueLabel, 0, 0)
    ctx.restore()

    if (engineOn) {
      const px = pad.l + Math.min(5200, rpm) / 5200 * pw
      const py = pad.t + (1 - Math.min(125, torque) / 125) * ph
      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#111a1c'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, py, 2.4, 0, Math.PI * 2)
      ctx.fillStyle = '#ff6a3d'
      ctx.fill()
    }
  }, [rpm, torque, engineOn, torqueLabel])

  return <canvas ref={canvasRef} className="efficiency-canvas" aria-label="エンジン効率マップ" />
}
