import type { ReactNode } from 'react'

interface GaugeProps {
  label: string
  role: string
  value: number
  max: number
  displayDivisor?: number
  accent: string
  detail: ReactNode
  efficiency: number
}

const polar = (cx: number, cy: number, r: number, angle: number) => {
  const a = (angle - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

const arc = (startAngle: number, endAngle: number) => {
  const start = polar(60, 60, 48, endAngle)
  const end = polar(60, 60, 48, startAngle)
  const large = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A 48 48 0 ${large} 0 ${end.x} ${end.y}`
}

export function Gauge({ label, role, value, max, displayDivisor = 1000, accent, detail, efficiency }: GaugeProps) {
  const signed = value < 0
  const normalized = Math.min(1, Math.abs(value) / max)
  const angle = -132 + normalized * 264
  const progressArc = arc(-132, angle)
  const shown = Math.abs(value) / displayDivisor
  const formatted = shown < 10 ? shown.toFixed(1) : shown.toFixed(0)

  return (
    <article className="gauge" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="gauge-heading">
        <span className="gauge-dot" />
        <div><strong>{label}</strong><small>{role}</small></div>
      </div>
      <div className="gauge-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <path className="gauge-track" d={arc(-132, 132)} />
          <path className="gauge-progress" d={progressArc} />
          {[-132, -88, -44, 0, 44, 88, 132].map((tick) => {
            const p1 = polar(60, 60, 42, tick)
            const p2 = polar(60, 60, 46, tick)
            return <line key={tick} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="gauge-tick" />
          })}
          <line className="gauge-needle" x1="60" y1="60" x2={polar(60, 60, 35, signed ? -angle : angle).x} y2={polar(60, 60, 35, signed ? -angle : angle).y} />
          <circle cx="60" cy="60" r="4.2" className="gauge-pin" />
        </svg>
        <div className="gauge-value"><span>{signed ? '−' : ''}{formatted}</span><small>×{displayDivisor === 1000 ? '1000 ' : ''}rpm</small></div>
      </div>
      <div className="gauge-meta">
        <span>{detail}</span>
        <span>η {(efficiency * 100).toFixed(0)}%</span>
      </div>
    </article>
  )
}
