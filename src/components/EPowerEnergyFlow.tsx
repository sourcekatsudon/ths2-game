import { useId } from 'react'
import { BatteryCharging, CircleGauge, Cpu, Gauge } from 'lucide-react'
import { EPOWER, type EPowerSnapshot } from '../simulation/epowerModel'
import type { TFunction } from '../i18n'

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function EPowerEnergyFlow({ snapshot, t }: { snapshot: EPowerSnapshot; t: TFunction }) {
  const id = useId().replace(/:/g, '')
  const genActive = snapshot.flows.genToDcKw > 0.3
  const motDriving = snapshot.flows.motorFromDcKw > 0.3
  const motRegen = snapshot.flows.regenToDcKw > 0.3
  const battOut = snapshot.flows.battToDcKw > 0.3
  const battIn = snapshot.flows.dcToBattKw > 0.3

  const outputPercent = clampPercent((Math.max(0, snapshot.motor.powerKw) / EPOWER.motorMaxPowerKw) * 100)
  const regenPercent = clampPercent((snapshot.regenKw / EPOWER.batteryMaxChargeKw) * 100)

  return (
    <div className="energy-flow-wrap">
      <div className="energy-diagram epower-flow-diagram">
        <svg className="flow-lines" viewBox="0 0 320 126" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id={`${id}-gen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#ff7048" />
            </marker>
            <marker id={`${id}-drive`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#27b896" />
            </marker>
            <marker id={`${id}-regen`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#3b8fd8" />
            </marker>
            <marker id={`${id}-batt-out`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#27b896" />
            </marker>
            <marker id={`${id}-batt-in`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#3b8fd8" />
            </marker>
          </defs>

          {/* Engine + Generator -> DC Bus */}
          <path
            className={genActive ? 'active hot' : ''}
            d="M72 31 C106 31 108 58 134 58"
            markerEnd={genActive ? `url(#${id}-gen)` : undefined}
          />

          {/* DC Bus <-> Drive Motor / Wheels (direction reverses on regen!) */}
          <path
            className={motDriving ? 'active drive' : motRegen ? 'active regen' : ''}
            d={motRegen ? 'M248 31 C214 31 212 58 186 58' : 'M186 58 C212 58 214 31 248 31'}
            markerEnd={motDriving ? `url(#${id}-drive)` : motRegen ? `url(#${id}-regen)` : undefined}
          />

          {/* HV Battery <-> DC Bus (idle during direct Series Cruise!) */}
          <path
            className={battOut ? 'active electric' : battIn ? 'active regen' : ''}
            d={battIn ? 'M134 68 C108 68 106 98 72 98' : 'M72 98 C106 98 108 68 134 68'}
            markerEnd={battOut ? `url(#${id}-batt-out)` : battIn ? `url(#${id}-batt-in)` : undefined}
          />
        </svg>

        <div className={`energy-node engine-node ${genActive ? 'active' : ''}`}>
          <Gauge size={17} />
          <b>{t('epGenNode')}</b>
          <small>{snapshot.flows.genToDcKw.toFixed(1)} kW</small>
        </div>
        <div className={`energy-node psd-node ${genActive || motDriving || motRegen || battOut || battIn ? 'active' : ''}`}>
          <Cpu size={17} />
          <b>{t('epDcBus')}</b>
          <small>5-IN-1</small>
        </div>
        <div className={`energy-node wheel-node ${motDriving || motRegen ? 'active' : ''}`}>
          <CircleGauge size={17} />
          <b>{t('epMotorNode')}</b>
          <small>{motRegen ? `← ${snapshot.flows.regenToDcKw.toFixed(1)}` : snapshot.flows.motorFromDcKw.toFixed(1)} kW</small>
        </div>
        <div className={`energy-node battery-node ${battOut || battIn ? 'active' : ''}`}>
          <BatteryCharging size={17} />
          <b>{t('battery')}</b>
          <small>{battOut ? 'OUT ' : battIn ? 'IN ' : ''}{Math.abs(snapshot.batteryPowerKw).toFixed(1)} kW</small>
        </div>
      </div>

      <div className="power-bars">
        <div className="power-bar-row drive-power">
          <div>
            <span>{t('outputLevel')}</span>
            <small>{t('epSystemBasis')}</small>
            <b>{outputPercent.toFixed(0)}%</b>
          </div>
          <div className="power-bar-track" role="progressbar" aria-label={t('outputLevel')} aria-valuenow={outputPercent}>
            <i style={{ width: `${outputPercent}%` }} />
          </div>
        </div>
        <div className="power-bar-row regen-power">
          <div>
            <span>{t('regenLevel')}</span>
            <small>{t('epRegenBasis')}</small>
            <b>{regenPercent.toFixed(0)}%</b>
          </div>
          <div className="power-bar-track" role="progressbar" aria-label={t('regenLevel')} aria-valuenow={regenPercent}>
            <i style={{ width: `${regenPercent}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
