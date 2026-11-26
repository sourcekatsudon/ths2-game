import { useId } from 'react'
import type { TFunction } from '../i18n'
import { EPOWER, type EPowerSnapshot } from '../simulation/epowerModel'

const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`

export function EPowerDualSystem({ snapshot, t }: { snapshot: EPowerSnapshot; t: TFunction }) {
  const id = useId().replace(/:/g, '')

  // Normalized bar heights (0..1) inside each mechanical system
  const engNorm = Math.min(1, Math.abs(snapshot.engine.rpm) / EPOWER.engineMaxRpm)
  const genNorm = Math.min(1, Math.abs(snapshot.generator.rpm) / EPOWER.generatorMaxRpm)
  const motNorm = Math.min(1, Math.abs(snapshot.motor.rpm) / EPOWER.motorMaxRpm)
  const maxWheelRpm = EPOWER.motorMaxRpm / EPOWER.reducerRatio
  const whlNorm = Math.min(1, Math.abs(snapshot.wheelRpm) / maxWheelRpm)

  const topY = 58
  const botY = 186
  const spanY = botY - topY
  const yFromNorm = (norm: number) => botY - norm * spanY

  const engY = yFromNorm(engNorm)
  const genY = yFromNorm(genNorm)
  const motY = yFromNorm(motNorm)
  const whlY = yFromNorm(whlNorm)

  const genActive = snapshot.flows.genToDcKw > 0.3
  const motDriving = snapshot.flows.motorFromDcKw > 0.3
  const motRegen = snapshot.flows.regenToDcKw > 0.3
  const battDischarging = snapshot.flows.battToDcKw > 0.3
  const battCharging = snapshot.flows.dcToBattKw > 0.3

  return (
    <section className="nomograph dual-system" aria-label={t('epDualTitle')}>
      <div className="nomograph-head">
        <b>{t('epDualTitle')}</b>
        <span>{t('epDualNoMechLink')}</span>
      </div>
      <svg viewBox="0 0 500 264" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{t('epDualTitle')}</title>
        <desc id={`${id}-desc`}>{t('epDualHelp')}</desc>
        <defs>
          <marker id={`${id}-gen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#6476ef" />
          </marker>
          <marker id={`${id}-drive`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#1caa89" />
          </marker>
          <marker id={`${id}-regen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#367dc9" />
          </marker>
          <marker id={`${id}-batt-out`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#2da867" />
          </marker>
          <marker id={`${id}-batt-in`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
            <path d="M0 0L8 4L0 8Z" fill="#367dc9" />
          </marker>
        </defs>

        {/* System A box: Mechanical Generation Path */}
        <rect x="12" y="10" width="168" height="242" rx="10" className="dual-box gen-box" />
        <text x="96" y="27" textAnchor="middle" className="dual-box-title gen-title">{t('epGenSystem')}</text>
        <text x="96" y="40" textAnchor="middle" className="dual-box-sub">n_GEN = 2.2 × n_ENG</text>

        {/* System B box: Mechanical Drive Path */}
        <rect x="320" y="10" width="168" height="242" rx="10" className="dual-box drive-box" />
        <text x="404" y="27" textAnchor="middle" className="dual-box-title drive-title">{t('epDriveSystem')}</text>
        <text x="404" y="40" textAnchor="middle" className="dual-box-sub">n_MOT = 8.2 × n_WHL</text>

        {/* Zero baselines & subtle horizontal reference lines inside each box */}
        <line x1="26" x2="166" y1={botY} y2={botY} className="nomograph-zero-line" />
        <line x1="26" x2="166" y1={topY} y2={topY} className="nomograph-top-line" />
        <line x1="334" x2="474" y1={botY} y2={botY} className="nomograph-zero-line" />
        <line x1="334" x2="474" y1={topY} y2={topY} className="nomograph-top-line" />

        {/* System A: Rigid mechanical link between Engine & Generator */}
        <line x1="58" x2="58" y1={topY} y2={botY} className="nomograph-axis" />
        <line x1="134" x2="134" y1={topY} y2={botY} className="nomograph-axis" />
        {/* Rigid bar moves horizontally at identical normalized height (since genMax = 2.2 * engMax) */}
        <line x1="58" y1={engY} x2="134" y2={genY} className={`dual-mech-link ${snapshot.engine.rpm > 10 ? 'active-gen' : ''}`} />
        <rect x="78" y={engY - 9} width="36" height="17" rx="8.5" className="dual-ratio-pill" />
        <text x="96" y={engY + 3} textAnchor="middle" className="dual-ratio-text">×2.2</text>

        {/* Engine bar & node */}
        <line x1="58" y1={botY} x2="58" y2={engY} stroke="#eb623e" strokeWidth="6" strokeLinecap="round" opacity={0.28} />
        <circle cx="58" cy={engY} r="5.5" fill="#fff" stroke="#eb623e" strokeWidth="2.8" />
        <text x="58" y="205" textAnchor="middle" fill="#eb623e" className="dual-shaft-name">ENG</text>
        <text x="58" y="220" textAnchor="middle" className="nomograph-rpm">{snapshot.engine.rpm.toFixed(0)}</text>
        <text x="58" y="233" textAnchor="middle" className="dual-shaft-sub">rpm · {snapshot.engine.powerKw.toFixed(0)}kW</text>

        {/* Generator bar & node */}
        <line x1="134" y1={botY} x2="134" y2={genY} stroke="#6476ef" strokeWidth="6" strokeLinecap="round" opacity={0.28} />
        <circle cx="134" cy={genY} r="5.5" fill="#fff" stroke="#6476ef" strokeWidth="2.8" />
        <text x="134" y="205" textAnchor="middle" fill="#6476ef" className="dual-shaft-name">GEN</text>
        <text x="134" y="220" textAnchor="middle" className="nomograph-rpm">{snapshot.generator.rpm.toFixed(0)}</text>
        <text x="134" y="233" textAnchor="middle" className="dual-shaft-sub">rpm · {snapshot.flows.genToDcKw.toFixed(0)}kW</text>

        {/* System B: Rigid mechanical link between Drive Motor & Wheels */}
        <line x1="366" x2="366" y1={topY} y2={botY} className="nomograph-axis" />
        <line x1="442" x2="442" y1={topY} y2={botY} className="nomograph-axis" />
        <line x1="366" y1={motY} x2="442" y2={whlY} className={`dual-mech-link ${snapshot.motor.rpm > 10 ? 'active-drive' : ''}`} />
        <rect x="386" y={motY - 9} width="36" height="17" rx="8.5" className="dual-ratio-pill" />
        <text x="404" y={motY + 3} textAnchor="middle" className="dual-ratio-text">÷8.2</text>

        {/* Drive Motor bar & node */}
        <line x1="366" y1={botY} x2="366" y2={motY} stroke="#1caa89" strokeWidth="6" strokeLinecap="round" opacity={0.28} />
        <circle cx="366" cy={motY} r="5.5" fill="#fff" stroke="#1caa89" strokeWidth="2.8" />
        <text x="366" y="205" textAnchor="middle" fill="#1caa89" className="dual-shaft-name">MOT</text>
        <text x="366" y="220" textAnchor="middle" className="nomograph-rpm">{snapshot.motor.rpm.toFixed(0)}</text>
        <text x="366" y="233" textAnchor="middle" className="dual-shaft-sub">rpm · {signed(snapshot.motor.powerKw, 0)}kW</text>

        {/* Wheel bar & node */}
        <line x1="442" y1={botY} x2="442" y2={whlY} stroke="#2d4d42" strokeWidth="6" strokeLinecap="round" opacity={0.25} />
        <circle cx="442" cy={whlY} r="5.5" fill="#fff" stroke="#2d4d42" strokeWidth="2.8" />
        <text x="442" y="205" textAnchor="middle" fill="#2d4d42" className="dual-shaft-name">WHL</text>
        <text x="442" y="220" textAnchor="middle" className="nomograph-rpm">{snapshot.wheelRpm.toFixed(0)}</text>
        <text x="442" y="233" textAnchor="middle" className="dual-shaft-sub">{snapshot.speedKph.toFixed(0)} km/h</text>

        {/* ================= CENTER: ELECTRICAL-ONLY DC BUS BRIDGE ================= */}
        {/* Vertical dashed mechanical isolation indicators */}
        <line x1="189" x2="189" y1="18" y2="246" className="dual-isolation" />
        <line x1="311" x2="311" y1="18" y2="246" className="dual-isolation" />
        <text x="250" y="27" textAnchor="middle" className="dual-elec-badge">{t('epElecOnly')}</text>

        {/* DC Bus hub box */}
        <rect x="214" y="88" width="72" height="44" rx="8" className="dual-dcbus-box" />
        <text x="250" y="106" textAnchor="middle" className="dual-dcbus-title">⚡ DC BUS</text>
        <text x="250" y="121" textAnchor="middle" className="dual-dcbus-sub">{snapshot.batteryVoltage.toFixed(0)} V</text>

        {/* Arrow 1: GEN -> DC BUS */}
        <line
          x1="180"
          y1="110"
          x2="210"
          y2="110"
          className={`dual-flow-arrow ${genActive ? 'active-gen' : ''}`}
          markerEnd={genActive ? `url(#${id}-gen)` : undefined}
        />
        <text x="195" y="100" textAnchor="middle" className={`dual-kw ${genActive ? 'gen' : ''}`}>
          {snapshot.flows.genToDcKw.toFixed(1)}
        </text>

        {/* Arrow 2: DC BUS <-> MOTOR (flips direction for regen!) */}
        <line
          x1={motRegen ? 318 : 288}
          y1="110"
          x2={motRegen ? 290 : 316}
          y2="110"
          className={`dual-flow-arrow ${motDriving ? 'active-drive' : motRegen ? 'active-regen' : ''}`}
          markerEnd={motDriving ? `url(#${id}-drive)` : motRegen ? `url(#${id}-regen)` : undefined}
        />
        <text x="303" y="100" textAnchor="middle" className={`dual-kw ${motDriving ? 'drive' : motRegen ? 'regen' : ''}`}>
          {motRegen ? `←${snapshot.flows.regenToDcKw.toFixed(1)}` : snapshot.flows.motorFromDcKw.toFixed(1)}
        </text>

        {/* Arrow 3: BATTERY <-> DC BUS */}
        <line
          x1="250"
          y1={battDischarging ? 182 : 134}
          x2="250"
          y2={battDischarging ? 136 : 180}
          className={`dual-flow-arrow ${battDischarging ? 'active-batt-out' : battCharging ? 'active-batt-in' : ''}`}
          markerEnd={battDischarging ? `url(#${id}-batt-out)` : battCharging ? `url(#${id}-batt-in)` : undefined}
        />
        {/* Battery chip below DC Bus */}
        <rect x="206" y="185" width="88" height="48" rx="8" className={`dual-batt-box ${battDischarging || battCharging ? 'active' : ''}`} />
        <text x="250" y="202" textAnchor="middle" className="dual-batt-title">{t('battery')} {(snapshot.batterySoc * 100).toFixed(0)}%</text>
        <text x="250" y="218" textAnchor="middle" className={`dual-batt-kw ${battDischarging ? 'out' : battCharging ? 'in' : ''}`}>
          {battDischarging ? `↑ +${snapshot.flows.battToDcKw.toFixed(1)} kW` : battCharging ? `↓ −${snapshot.flows.dcToBattKw.toFixed(1)} kW` : '0.0 kW'}
        </text>
      </svg>

      <div className="nomograph-torques">
        <span className={snapshot.engine.torque > 0.5 ? 'positive' : 'neutral'}>
          <small>ENG</small> <b>{snapshot.engine.torque.toFixed(0)} <small>Nm</small></b>
        </span>
        <span className={snapshot.generator.torque < -0.5 ? 'negative' : 'neutral'}>
          <small>GEN</small> <b>{signed(snapshot.generator.torque)} <small>Nm</small></b>
        </span>
        <span className={Math.abs(snapshot.motor.torque) < 0.5 ? 'neutral' : snapshot.motor.torque > 0 ? 'positive' : 'negative'}>
          <small>MOT</small> <b>{Math.abs(snapshot.motor.torque) < 0.5 ? '·' : snapshot.motor.torque > 0 ? '↑' : '↓'} {signed(snapshot.motor.torque)} <small>Nm</small></b>
        </span>
      </div>
      <p className="nomograph-help torque-legend">{t('epDualHelp')}</p>
    </section>
  )
}
