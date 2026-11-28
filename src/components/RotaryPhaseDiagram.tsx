import { useId, useMemo } from 'react'
import type { TFunction } from '../i18n'
import {
  epitrochoidPoint,
  rotorApex,
  rotorCenter,
  rotorFlankPoint,
  type RotaryStrokePhase,
} from '../simulation/rotaryGeometry'
import type { RotarySnapshot } from '../simulation/rotaryModel'

const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`

const STROKE_STYLE: Record<RotaryStrokePhase, { fill: string; stroke: string; badge: string; glyph: string }> = {
  INTAKE: { fill: 'rgba(52, 168, 245, 0.34)', stroke: '#258ce0', badge: 'IN', glyph: '↓' },
  COMPRESSION: { fill: 'rgba(127, 94, 245, 0.36)', stroke: '#6946e6', badge: 'CMP', glyph: '▲' },
  COMBUSTION: { fill: 'rgba(255, 118, 41, 0.52)', stroke: '#e85116', badge: 'PWR', glyph: '✦' },
  EXHAUST: { fill: 'rgba(196, 92, 82, 0.32)', stroke: '#b54c43', badge: 'EXH', glyph: '↑' },
}

const SVG_SCALE = 0.42
const CX = 98
const CY = 114

function toSvg(xMm: number, yMm: number) {
  return { x: CX + xMm * SVG_SCALE, y: CY - yMm * SVG_SCALE }
}

export function RotaryPhaseDiagram({ snapshot, t }: { snapshot: RotarySnapshot; t: TFunction }) {
  const id = useId().replace(/:/g, '')
  const theta = snapshot.visualShaftAngleRad
  const firing = snapshot.engineFiring

  const housingPath = useMemo(() => {
    const pts: string[] = []
    const steps = 72
    for (let i = 0; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI * 2
      const p = epitrochoidPoint(a, 1)
      const s = toSvg(p.x, p.y)
      pts.push(`${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`)
    }
    return `${pts.join(' ')} Z`
  }, [])

  // Build exact rotor outline & 3 chamber polygons from current visual shaft angle
  const rotorPath = (() => {
    const pts: string[] = []
    const perFace = 10
    for (let face = 0; face < 3; face += 1) {
      for (let j = 0; j < perFace; j += 1) {
        const p = rotorFlankPoint(theta, face as 0 | 1 | 2, j / perFace, 1)
        const s = toSvg(p.x, p.y)
        pts.push(`${face === 0 && j === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`)
      }
    }
    return `${pts.join(' ')} Z`
  })()

  const chamberPaths = snapshot.chambers.map((ch) => {
    const pts: string[] = []
    const steps = 12
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps
      const p = epitrochoidPoint(ch.startParamT + u * ((Math.PI * 2) / 3), 1)
      const s = toSvg(p.x, p.y)
      pts.push(`${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`)
    }
    for (let i = steps; i >= 0; i -= 1) {
      const u = i / steps
      const p = rotorFlankPoint(theta, ch.index, u, 1)
      const s = toSvg(p.x, p.y)
      pts.push(`L${s.x.toFixed(1)},${s.y.toFixed(1)}`)
    }
    return `${pts.join(' ')} Z`
  })

  const centerSvg = (() => {
    const c = rotorCenter(theta, 1)
    return toSvg(c.x, c.y)
  })()

  const apexesSvg = ([0, 1, 2] as const).map((i) => {
    const a = rotorApex(theta, i, 1)
    return toSvg(a.x, a.y)
  })

  const shaftCycleDeg = ((snapshot.chambers[0].cycleDeg % 1080) + 1080) % 1080
  const sparkNow = snapshot.chambers.some((c) => c.sparkActive)

  const genActive = snapshot.flows.genToDcKw > 0.3
  const motDriving = snapshot.flows.motorFromDcKw > 0.3
  const motRegen = snapshot.flows.regenToDcKw > 0.3
  const battOut = snapshot.flows.battToDcKw > 0.3
  const battIn = snapshot.flows.dcToBattKw > 0.3
  const extActive = snapshot.externalCharging

  const phaseLabel = (phase: RotaryStrokePhase) => {
    if (phase === 'INTAKE') return t('rotPhaseIntake')
    if (phase === 'COMPRESSION') return t('rotPhaseCompression')
    if (phase === 'COMBUSTION') return t('rotPhaseCombustion')
    return t('rotPhaseExhaust')
  }

  return (
    <section className="nomograph rotary-phase-diagram" aria-label={t('rotDiagramTitle')}>
      <div className="nomograph-head">
        <b>{t('rotDiagramTitle')}</b>
        <span>{t('rotRatioNote')}</span>
      </div>
      <svg viewBox="0 0 500 258" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{t('rotDiagramTitle')}</title>
        <desc id={`${id}-desc`}>{t('rotDiagramHelp')}</desc>
        <defs>
          <marker id={`${id}-gen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#6476ef" />
          </marker>
          <marker id={`${id}-drive`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#1caa89" />
          </marker>
          <marker id={`${id}-regen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#367dc9" />
          </marker>
          <marker id={`${id}-ext`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#12a8c8" />
          </marker>
        </defs>

        {/* LEFT CARD: Live 8C 2D Epitrochoid + 3-Chamber 1080 deg Cycle */}
        <rect x="10" y="8" width="234" height="242" rx="10" className="rotary-card-box" />
        <text x="24" y="25" className="dual-box-title gen-title">8C-PH · 1080° CYCLE</text>
        <text x="232" y="25" textAnchor="end" className="dual-box-sub">
          {snapshot.engine.rpm.toFixed(0)} / {snapshot.rotorRpm.toFixed(0)} rpm
        </text>

        {/* Chamber gas fills */}
        {snapshot.chambers.map((ch, idx) => {
          const st = STROKE_STYLE[ch.phase]
          return (
            <path
              key={idx}
              d={chamberPaths[idx]}
              fill={firing || snapshot.engine.rpm > 80 ? st.fill : 'rgba(182, 198, 193, 0.25)'}
              stroke="none"
            />
          )
        })}

        {/* Epitrochoid wall */}
        <path d={housingPath} fill="none" stroke="#3b4d4a" strokeWidth="2.4" />
        {/* Port & TDC markers */}
        <circle cx={CX} cy={CY - 45} r={sparkNow ? 6 : 3.2} fill={sparkNow ? '#ff8b1f' : '#9aa8a4'} />
        <text x={CX} y={CY - 55} textAnchor="middle" className="rotary-mini-tag">⚡ TDC</text>
        <text x={CX + 57} y={CY + 44} textAnchor="middle" className="rotary-mini-tag intake">IN</text>
        <text x={CX - 57} y={CY + 44} textAnchor="middle" className="rotary-mini-tag exhaust">EXH</text>

        {/* Eccentric orbit circle & orbiting rotor */}
        <circle cx={CX} cy={CY} r={17.5 * SVG_SCALE} fill="none" stroke="#ff7048" strokeWidth="1" strokeDasharray="2 2" />
        <path d={rotorPath} fill="#2f3f3d" stroke="#162322" strokeWidth="1.6" />
        <line x1={CX} y1={CY} x2={centerSvg.x} y2={centerSvg.y} stroke="#ff7048" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="2.5" fill="#fff" stroke="#ff7048" strokeWidth="1.5" />
        <circle cx={centerSvg.x} cy={centerSvg.y} r="3.4" fill="#ff7048" />
        {apexesSvg.map((ap, i) => (
          <circle key={i} cx={ap.x} cy={ap.y} r="2.8" fill={i === 0 ? '#caff45' : '#ff8c42'} stroke="#162322" strokeWidth="0.9" />
        ))}

        {/* 3 Chamber Live Status Pills (Non-color-only: badge + glyph + label + volume bar) */}
        {snapshot.chambers.map((ch, idx) => {
          const st = STROKE_STYLE[ch.phase]
          const y = 184 + idx * 20
          return (
            <g key={idx}>
              <rect x="20" y={y} width="214" height="16" rx="4" fill="#f2f6f4" stroke="#dce4e0" strokeWidth="0.8" />
              <rect x="22" y={y + 2} width="30" height="12" rx="3" fill={firing || snapshot.engine.rpm > 80 ? st.stroke : '#9aa8a4'} />
              <text x="37" y={y + 11} textAnchor="middle" fill="#fff" fontSize="7.5" fontWeight="800" fontFamily="JetBrains Mono, monospace">
                #{idx + 1}
              </text>
              <text x="58" y={y + 11} fontSize="8" fontWeight="700" fill={firing || snapshot.engine.rpm > 80 ? st.stroke : '#6e7e78'}>
                {st.glyph} {phaseLabel(ch.phase)}
              </text>
              {/* Volume bar */}
              <rect x="164" y={y + 5} width="42" height="6" rx="3" fill="#dce5e1" />
              <rect
                x="164"
                y={y + 5}
                width={Math.max(3, 42 * ch.volumeRatio)}
                height="6"
                rx="3"
                fill={firing || snapshot.engine.rpm > 80 ? st.stroke : '#9aa8a4'}
              />
              <text x="228" y={y + 11} textAnchor="end" fontSize="7.5" fontFamily="JetBrains Mono, monospace" fill="#5b6d67">
                {ch.volumeCc.toFixed(0)}cc
              </text>
            </g>
          )
        })}

        {/* Shaft angle readout */}
        <text x="195" y="106" textAnchor="middle" className="rotary-angle-num">{shaftCycleDeg.toFixed(0)}°</text>
        <text x="195" y="118" textAnchor="middle" className="rotary-angle-sub">/ 1080°</text>
        <text x="195" y="136" textAnchor="middle" className="rotary-angle-sub">
          {firing ? '● FIRING' : snapshot.engine.rpm > 50 ? '○ SPIN' : '○ STOP'}
        </text>

        {/* RIGHT CARD: Coaxial yet Mechanically Independent Series PHEV Flow */}
        <rect x="256" y="8" width="234" height="242" rx="10" className="rotary-series-box" />
        <text x="373" y="25" textAnchor="middle" className="dual-box-title drive-title">{t('rotIndepTitle')}</text>
        <text x="373" y="38" textAnchor="middle" className="dual-box-sub">{t('rotCoaxialNoLink')}</text>

        {/* Generation side block */}
        <rect x="268" y="50" width="84" height="58" rx="8" fill="#fff7f4" stroke="#f0cec2" strokeWidth="1.2" />
        <text x="310" y="66" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#c94f2b">8C → GEN</text>
        <text x="310" y="81" textAnchor="middle" className="nomograph-rpm">{snapshot.engine.rpm.toFixed(0)}</text>
        <text x="310" y="95" textAnchor="middle" className="dual-shaft-sub">1:1 · {snapshot.flows.genToDcKw.toFixed(1)}kW</text>

        {/* Dashed isolation line */}
        <line x1="364" y1="48" x2="364" y2="112" className="dual-isolation" />
        <text x="373" y="84" textAnchor="middle" fontSize="11" fontWeight="800" fill="#5c6edd">⚡</text>
        <line x1="382" y1="48" x2="382" y2="112" className="dual-isolation" />

        {/* Drive side block */}
        <rect x="394" y="50" width="84" height="58" rx="8" fill="#f1fbf7" stroke="#bee3d6" strokeWidth="1.2" />
        <text x="436" y="66" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#178c6f">MOT ÷11.2</text>
        <text x="436" y="81" textAnchor="middle" className="nomograph-rpm">{snapshot.motor.rpm.toFixed(0)}</text>
        <text x="436" y="95" textAnchor="middle" className="dual-shaft-sub">{snapshot.speedKph.toFixed(0)} km/h</text>

        {/* DC Bus Bar */}
        <rect x="322" y="132" width="102" height="36" rx="8" className="dual-dcbus-box" />
        <text x="373" y="148" textAnchor="middle" className="dual-dcbus-title">⚡ DC BUS</text>
        <text x="373" y="161" textAnchor="middle" className="dual-dcbus-sub">{snapshot.batteryVoltage.toFixed(0)} V</text>

        {/* Arrows into/out of DC Bus */}
        <path
          d="M310 108 L310 148 L320 148"
          fill="none"
          className={`dual-flow-arrow ${genActive ? 'active-gen' : ''}`}
          markerEnd={genActive ? `url(#${id}-gen)` : undefined}
        />
        <path
          d={motRegen ? 'M436 108 L436 148 L426 148' : 'M424 148 L436 148 L436 110'}
          fill="none"
          className={`dual-flow-arrow ${motDriving ? 'active-drive' : motRegen ? 'active-regen' : ''}`}
          markerEnd={motDriving ? `url(#${id}-drive)` : motRegen ? `url(#${id}-regen)` : undefined}
        />

        {/* Battery box */}
        <rect x="314" y="190" width="118" height="48" rx="8" className={`dual-batt-box ${battOut || battIn ? 'active' : ''}`} />
        <text x="373" y="207" textAnchor="middle" className="dual-batt-title">
          17.8 kWh · {(snapshot.batterySoc * 100).toFixed(1)}%
        </text>
        <text x="373" y="224" textAnchor="middle" className={`dual-batt-kw ${battOut ? 'out' : battIn ? 'in' : ''}`}>
          {battOut ? `↑ +${snapshot.flows.battToDcKw.toFixed(1)} kW` : battIn ? `↓ −${snapshot.flows.dcToBattKw.toFixed(1)} kW` : '0.0 kW'}
        </text>
        <line
          x1="373"
          y1={battOut ? 188 : 170}
          x2="373"
          y2={battOut ? 170 : 188}
          className={`dual-flow-arrow ${battOut ? 'active-batt-out' : battIn ? 'active-batt-in' : ''}`}
        />

        {/* External plug-in indicator on bottom left of right card */}
        <rect
          x="264"
          y="196"
          width="44"
          height="36"
          rx="6"
          fill={extActive ? '#e4faff' : '#f4f7f6'}
          stroke={extActive ? '#12a8c8' : '#d2dcd8'}
          strokeWidth="1.2"
        />
        <text x="286" y="212" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={extActive ? '#0a7f99' : '#899892'}>
          PLUG
        </text>
        <text x="286" y="224" textAnchor="middle" fontSize="7.5" fontWeight="700" fontFamily="JetBrains Mono, monospace" fill={extActive ? '#0a7f99' : '#9aa8a3'}>
          {extActive ? `${snapshot.externalChargeKw.toFixed(0)}kW` : 'OFF'}
        </text>
        {extActive && (
          <line
            x1="308"
            y1="214"
            x2="314"
            y2="214"
            stroke="#12a8c8"
            strokeWidth="2.5"
            markerEnd={`url(#${id}-ext)`}
          />
        )}
      </svg>

      <div className="nomograph-torques">
        <span className={snapshot.engine.torque > 0.5 ? 'positive' : 'neutral'}>
          <small>8C ENG</small> <b>{snapshot.engine.torque.toFixed(0)} <small>Nm</small></b>
        </span>
        <span className={snapshot.generator.torque < -0.5 ? 'negative' : 'neutral'}>
          <small>GEN</small> <b>{signed(snapshot.generator.torque)} <small>Nm</small></b>
        </span>
        <span className={Math.abs(snapshot.motor.torque) < 0.5 ? 'neutral' : snapshot.motor.torque > 0 ? 'positive' : 'negative'}>
          <small>MOT</small> <b>{Math.abs(snapshot.motor.torque) < 0.5 ? '·' : snapshot.motor.torque > 0 ? '↑' : '↓'} {signed(snapshot.motor.torque)} <small>Nm</small></b>
        </span>
      </div>
      <p className="nomograph-help torque-legend">{t('rotDiagramHelp')}</p>
    </section>
  )
}
