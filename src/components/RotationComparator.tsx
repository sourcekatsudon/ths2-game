import { useRef } from 'react'
import type { TFunction } from '../i18n'
import type { SimulationSnapshot } from '../simulation/model'

const VISUAL_DIVISOR = 240

interface DialProps {
  label: string
  role: string
  rpm: number
  ratio: number
  time: number
  accent: string
  t: TFunction
}

function RotationDial({ label, role, rpm, ratio, time, accent, t }: DialProps) {
  const phase = useRef({ angle: 0, time })
  const dt = Math.max(0, Math.min(0.2, time - phase.current.time))
  phase.current.angle += rpm * dt * 6 / VISUAL_DIVISOR
  phase.current.time = time
  const stopped = Math.abs(rpm) < 2
  const direction = stopped ? t('stopped') : rpm > 0 ? t('clockwise') : t('counterClockwise')

  return (
    <article className="rotation-dial" style={{ '--dial-accent': accent } as React.CSSProperties}>
      <div className="rotation-id"><i /><span><b>{label}</b><small>{role}</small></span></div>
      <div className="rotor-shell">
        <svg className="rotor-face" viewBox="0 0 100 100" style={{ transform: `rotate(${phase.current.angle}deg)` }} aria-hidden="true">
          <circle cx="50" cy="50" r="42" className="rotor-track" />
          <circle cx="50" cy="50" r="35" className="rotor-inner" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <line key={angle} x1="50" y1="13" x2="50" y2={angle % 90 === 0 ? 24 : 20} transform={`rotate(${angle} 50 50)`} className="rotor-tick" />
          ))}
          <path d="M50 18 L54 28 L50 25 L46 28 Z" className="rotor-arrow" />
          <path d="M50 30V44M30 50H44M56 50H70M50 56V70" className="rotor-spokes" />
          <circle cx="50" cy="50" r="6" className="rotor-hub" />
          <circle cx="50" cy="10" r="4.2" className="rotor-marker" />
        </svg>
      </div>
      <div className={`rotation-direction ${rpm < -2 ? 'reverse' : ''} ${stopped ? 'stopped' : ''}`}>
        <b>{stopped ? '•' : rpm > 0 ? '↻' : '↺'} {direction}</b>
        <span>{rpm > 0 ? '+' : rpm < 0 ? '−' : ''}{ratio.toFixed(2)}×</span>
        <small className="actual-rpm"><i>{t('actualSpeed')}</i><strong>{Math.abs(rpm).toFixed(0)}</strong> rpm</small>
      </div>
    </article>
  )
}

export function RotationComparator({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  const maxRpm = Math.max(1, Math.abs(snapshot.engine.rpm), Math.abs(snapshot.mg1.rpm), Math.abs(snapshot.mg2.rpm))
  return (
    <section className="rotation-comparator" aria-label={t('rotationComparison')}>
      <div className="rotation-comparator-head">
        <b>{t('rotationComparison')}</b>
        <span>{t('relativeToMax')} · {t('visualScale')}</span>
      </div>
      <div className="rotation-dials">
        <RotationDial label={t('engine')} role={t('carrier')} rpm={snapshot.engine.rpm} ratio={Math.abs(snapshot.engine.rpm) / maxRpm} time={snapshot.time} accent="#ff7048" t={t} />
        <RotationDial label="MG1" role={t('sun')} rpm={snapshot.mg1.rpm} ratio={Math.abs(snapshot.mg1.rpm) / maxRpm} time={snapshot.time} accent="#6476ef" t={t} />
        <RotationDial label="MG2" role={t('ring')} rpm={snapshot.mg2.rpm} ratio={Math.abs(snapshot.mg2.rpm) / maxRpm} time={snapshot.time} accent="#27b896" t={t} />
      </div>
    </section>
  )
}
