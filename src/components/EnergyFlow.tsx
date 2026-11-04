import { BatteryCharging, CircleGauge, Disc3, Gauge } from 'lucide-react'
import type { SimulationSnapshot } from '../simulation/model'
import { PRIUS } from '../simulation/model'
import type { TFunction } from '../i18n'

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function EnergyFlow({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  const engineActive = snapshot.engineOn
  const batteryOut = snapshot.batteryPowerKw > 0.6
  const batteryIn = snapshot.batteryPowerKw < -0.6
  const wheelDrive = snapshot.wheelPowerKw > 0.3
  const wheelRegen = snapshot.wheelPowerKw < -0.3
  const outputPercent = clampPercent(Math.max(0, snapshot.wheelPowerKw) / PRIUS.systemMaxPowerKw * 100)
  const regenPercent = clampPercent(snapshot.regenKw / 25 * 100)
  return (
    <div className="energy-flow-wrap">
      <div className="energy-diagram">
        <svg className="flow-lines" viewBox="0 0 320 126" preserveAspectRatio="none" aria-hidden="true">
          <path className={engineActive ? 'active hot' : ''} d="M52 31 C100 31 104 62 151 62" />
          <path className={wheelDrive || engineActive ? 'active drive' : ''} d="M169 62 C216 62 218 31 270 31" />
          <path className={batteryOut ? 'active electric' : ''} d="M52 100 C101 100 103 68 151 68" />
          <path className={batteryIn || wheelRegen ? 'active regen' : ''} d="M270 38 C220 78 109 104 52 104" />
        </svg>
        <div className={`energy-node engine-node ${engineActive ? 'active' : ''}`}><Gauge size={18} /><b>{t('engine')}</b><small>{snapshot.engine.powerKw.toFixed(1)} kW</small></div>
        <div className="energy-node psd-node active"><Disc3 size={18} /><b>PSD</b><small>78 : 30</small></div>
        <div className={`energy-node wheel-node ${wheelDrive || wheelRegen ? 'active' : ''}`}><CircleGauge size={18} /><b>{t('wheels')}</b><small>{snapshot.tireTorque.toFixed(0)} Nm</small></div>
        <div className={`energy-node battery-node ${batteryOut || batteryIn ? 'active' : ''}`}><BatteryCharging size={18} /><b>{t('battery')}</b><small>{snapshot.batteryPowerKw > 0 ? 'OUT ' : 'IN '}{Math.abs(snapshot.batteryPowerKw).toFixed(1)} kW</small></div>
      </div>
      <div className="power-bars">
        <div className="power-bar-row drive-power">
          <div><span>{t('outputLevel')}</span><small>{t('systemBasis')}</small><b>{outputPercent.toFixed(0)}%</b></div>
          <div className="power-bar-track" role="progressbar" aria-label={t('outputLevel')} aria-valuenow={outputPercent}><i style={{ width: `${outputPercent}%` }} /></div>
        </div>
        <div className="power-bar-row regen-power">
          <div><span>{t('regenLevel')}</span><small>{t('regenBasis')}</small><b>{regenPercent.toFixed(0)}%</b></div>
          <div className="power-bar-track" role="progressbar" aria-label={t('regenLevel')} aria-valuenow={regenPercent}><i style={{ width: `${regenPercent}%` }} /></div>
        </div>
      </div>
    </div>
  )
}
