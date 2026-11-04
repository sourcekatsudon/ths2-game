import { useId } from 'react'
import type { TFunction } from '../i18n'
import { PRIUS, type SimulationSnapshot } from '../simulation/model'

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(0)}`

export function PowerSplitNomograph({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  const id = useId().replace(/:/g, '')
  const left = 78
  const right = 432
  // nC = (S*nS + R*nR)/(S+R): C sits R/(S+R) of the way from S to R.
  const carrier = left + (right - left) * PRIUS.ringTeeth / (PRIUS.ringTeeth + PRIUS.sunTeeth)
  // Keep the scale fixed across engine starts/stops. The model can exceed
  // 10k MG1 rpm during EV/coasting; 20k covers its full simulated speed range.
  const range = 20000
  const y = (rpm: number) => 155 - rpm / range * 60
  const shafts = [
    { key: 'mg1', label: 'MG1', role: t('sun'), state: snapshot.mg1, x: left, accent: '#6476ef' },
    { key: 'engine', label: 'ENG', role: t('carrier'), state: snapshot.engine, x: carrier, accent: '#eb623e' },
    { key: 'mg2', label: 'MG2', role: t('ring'), state: snapshot.mg2, x: right, accent: '#1caa89' },
  ]
  return (
    <section className="nomograph" aria-label={t('seesawTitle')}>
      <div className="nomograph-head"><b>{t('seesawTitle')}</b><span>{t('seesawScale')}</span></div>
      <svg viewBox="0 0 500 285" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{t('seesawTitle')}</title>
        <desc id={`${id}-desc`}>{t('seesawHelp')} {t('torqueHelp')}</desc>
        <defs>
          {['positive', 'negative'].map((sign) => (
            <marker key={sign} id={`${id}-${sign}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L8 4L0 8Z" fill={sign === 'positive' ? '#d97920' : '#367dc9'} />
            </marker>
          ))}
        </defs>
        {[-1, 0, 1].map((tick) => (
          <g key={tick} className={tick === 0 ? 'nomograph-zero' : 'nomograph-grid'}>
            <line x1="48" x2="465" y1={y(tick * range)} y2={y(tick * range)} />
            <text x="42" y={y(tick * range) + 3} textAnchor="end">{tick === 0 ? '0' : `${tick > 0 ? '+' : '−'}${range / 1000}k`}</text>
          </g>
        ))}
        <text x="12" y="35" className="nomograph-unit">rpm</text>
        <line className="nomograph-beam-shadow" x1={left} y1={y(snapshot.mg1.rpm)} x2={right} y2={y(snapshot.mg2.rpm)} />
        <line className="nomograph-beam" x1={left} y1={y(snapshot.mg1.rpm)} x2={right} y2={y(snapshot.mg2.rpm)} />
        {shafts.map(({ key, label, role, state, x, accent }) => {
          const py = y(state.rpm)
          const active = Math.abs(state.torque) >= 0.05
          const positive = state.torque > 0
          const length = Math.min(87, Math.abs(state.torque) / 400 * 87)
          const end = py + (positive ? -1 : 1) * length
          return (
            <g key={key} data-shaft={key} data-rpm={state.rpm} data-torque={state.torque}>
              <text x={x} y="15" textAnchor="middle" fill={accent} className="nomograph-name">{label}</text>
              <text x={x} y="29" textAnchor="middle" className="nomograph-role">{role}</text>
              <line x1={x} x2={x} y1="43" y2="254" className="nomograph-axis" />
              <circle cx={x} cy={py} r="5" fill="white" stroke={accent} strokeWidth="2.5" />
              {active && <line className={`nomograph-torque ${positive ? 'positive' : 'negative'}`} x1={x + 11} x2={x + 11} y1={py} y2={end} markerEnd={`url(#${id}-${positive ? 'positive' : 'negative'})`} />}
              <text x={x} y="277" textAnchor="middle" className="nomograph-rpm">{signed(state.rpm)}</text>
            </g>
          )
        })}
      </svg>
      <div className="nomograph-torques">
        {shafts.map(({ key, label, state }) => (
          <span key={key} className={Math.abs(state.torque) < 0.05 ? 'neutral' : state.torque > 0 ? 'positive' : 'negative'}>
            <small>{label}</small> <b>{Math.abs(state.torque) < 0.05 ? '·' : state.torque > 0 ? '↑' : '↓'} {signed(state.torque)} <small>Nm</small></b>
          </span>
        ))}
      </div>
      <p className="nomograph-help">{t('seesawHelp')}</p>
      <p className="nomograph-help torque-legend"><span className="positive">↑ +</span> / <span className="negative">↓ −</span> {t('torqueHelp')}</p>
    </section>
  )
}
