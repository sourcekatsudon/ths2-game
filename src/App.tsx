import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Activity, Battery, BookOpen, Box, ChevronRight, CirclePause, CirclePlay, Cpu, Fuel,
  Gauge as GaugeIcon, Info, Languages, RotateCcw, Settings2, Sparkles, Zap,
} from 'lucide-react'
import { EfficiencyMap } from './components/EfficiencyMap'
import { EnergyFlow } from './components/EnergyFlow'
import { Gauge } from './components/Gauge'
import { RoadScene } from './components/RoadScene'
import { PowerSplitNomograph } from './components/PowerSplitNomograph'
import { EPowerDualSystem } from './components/EPowerDualSystem'
import { EPowerEfficiencyMap } from './components/EPowerEfficiencyMap'
import { EPowerEnergyFlow } from './components/EPowerEnergyFlow'
import { EPowerRoadScene } from './components/EPowerRoadScene'
import {
  epowerModeTranslationKey,
  localeLabels,
  modeTranslationKey,
  translate,
  type Locale,
  type TFunction,
} from './i18n'
import { PRIUS } from './simulation/model'
import { useSimulation } from './simulation/useSimulation'
import { EPOWER } from './simulation/epowerModel'
import { useEPowerSimulation } from './simulation/useEPowerSimulation'
import './styles.css'

const PowerSplit3D = lazy(() => import('./components/PowerSplit3D').then((module) => ({ default: module.PowerSplit3D })))
const EPower3D = lazy(() => import('./components/EPower3D').then((module) => ({ default: module.EPower3D })))

type SystemId = 'ths' | 'epower'

const LOCALES: Locale[] = ['EN', 'JP', 'ZH', 'DE', 'FR']
const formatSigned = (value: number, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`

function Metric({ label, value, unit, tone, icon }: { label: string; value: string; unit: string; tone?: string; icon?: React.ReactNode }) {
  return <div className={`metric ${tone ?? ''}`}><div className="metric-label">{icon}{label}</div><div className="metric-value"><b>{value}</b><span>{unit}</span></div></div>
}

function SystemSwitcher({ system, onSwitch, t }: { system: SystemId; onSwitch: (next: SystemId) => void; t: TFunction }) {
  return (
    <div className="system-switcher" role="tablist" aria-label={t('drivetrainSystem')}>
      <button
        type="button"
        role="tab"
        aria-selected={system === 'ths'}
        className={system === 'ths' ? 'active' : ''}
        onClick={() => onSwitch('ths')}
      >
        THS2
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={system === 'epower'}
        className={system === 'epower' ? 'active epower-tab' : 'epower-tab'}
        onClick={() => onSwitch('epower')}
      >
        e-POWER <span>GEN 3</span>
      </button>
    </div>
  )
}

function LearnPanel({ close, t }: { close: () => void; t: TFunction }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="learn-panel" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={close} aria-label={t('close')}>×</button>
        <div className="eyebrow"><Sparkles size={13} /> {t('learningDeck')}</div>
        <h2>{t('learnTitle')}</h2>
        <p className="learn-lead">{t('learnLead')}</p>
        <div className="learn-equation">
          <span><i className="ring-swatch" />78 × n<sub>MG2</sub></span><b>＋</b>
          <span><i className="sun-swatch" />30 × n<sub>MG1</sub></span><b>＝</b>
          <span><i className="carrier-swatch" />108 × n<sub>ENGINE</sub></span>
        </div>
        <div className="learn-grid">
          <article><span>01</span><h3>{t('ringLearnTitle')}</h3><p>{t('ringLearnBody')}</p></article>
          <article><span>02</span><h3>{t('sunLearnTitle')}</h3><p>{t('sunLearnBody')}</p></article>
          <article><span>03</span><h3>{t('carrierLearnTitle')}</h3><p>{t('carrierLearnBody')}</p></article>
        </div>
        <div className="learn-tip"><Info size={16} /><p><b>{t('tryIt')}</b> {t('tryBody')}</p></div>
        <div className="model-note">
          <b>{t('modelBasis')}</b><span>{t('modelSpecs')}</span><small>{t('disclaimer')}</small>
          <div className="source-links">
            <a href="https://global.toyota/jp/detail/17912410" target="_blank" rel="noreferrer">{t('toyotaSpec')}</a>
            <a href="https://info.ornl.gov/sites/publications/Files/Pub57399.pdf" target="_blank" rel="noreferrer">{t('ornlLayout')}</a>
          </div>
        </div>
      </section>
    </div>
  )
}

function EPowerLearnPanel({ close, t }: { close: () => void; t: TFunction }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="learn-panel" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={close} aria-label={t('close')}>×</button>
        <div className="eyebrow"><Sparkles size={13} /> {t('learningDeck')}</div>
        <h2>{t('epLearnTitle')}</h2>
        <p className="learn-lead">{t('epLearnLead')}</p>
        <div className="learn-equation epower-equation">
          <span><i className="carrier-swatch" />n<sub>GEN</sub> = 2.2 × n<sub>ENG</sub></span>
          <b>⚡ DC BUS ⚡</b>
          <span><i className="ring-swatch" />n<sub>MOT</sub> = 8.2 × n<sub>WHL</sub></span>
        </div>
        <div className="learn-grid">
          <article><span>01</span><h3>{t('epLearnCard1Title')}</h3><p>{t('epLearnCard1Body')}</p></article>
          <article><span>02</span><h3>{t('epLearnCard2Title')}</h3><p>{t('epLearnCard2Body')}</p></article>
          <article><span>03</span><h3>{t('epLearnCard3Title')}</h3><p>{t('epLearnCard3Body')}</p></article>
        </div>
        <div className="learn-tip"><Info size={16} /><p><b>{t('tryIt')}</b> {t('epTryBody')}</p></div>
        <div className="model-note">
          <b>{t('epModelBasis')}</b><span>{t('epModelSpecs')}</span><small>{t('epDisclaimer')}</small>
          <div className="source-links">
            <a href="https://www2.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN3/" target="_blank" rel="noreferrer">{t('epSourceTech')}</a>
            <a href="https://global.nissannews.com/ja-JP/releases/250626-01-j" target="_blank" rel="noreferrer">{t('epSourceReleaseJp')}</a>
            <a href="https://global.nissannews.com/en/releases/nissan-launches-3rd-generation-e-power-technology-in-europe" target="_blank" rel="noreferrer">{t('epSourceReleaseEn')}</a>
            <a href="https://www2.nissan-global.com/JP/STORIES/RELEASES/new-e-power-dedicated-engine-breakthroughs/" target="_blank" rel="noreferrer">{t('epSourceEngine')}</a>
          </div>
        </div>
      </section>
    </div>
  )
}

interface WorkspaceProps {
  system: SystemId
  onSwitchSystem: (next: SystemId) => void
  locale: Locale
  setLocale: (next: Locale) => void
  showLearn: boolean
  setShowLearn: (next: boolean) => void
  t: TFunction
}

function ThsWorkspace({ system, onSwitchSystem, locale, setLocale, showLearn, setShowLearn, t }: WorkspaceProps) {
  const { snapshot, input, setInput, reset } = useSimulation()
  const constraintError = PRIUS.ringTeeth * snapshot.mg2.rpm + PRIUS.sunTeeth * snapshot.mg1.rpm - (PRIUS.ringTeeth + PRIUS.sunTeeth) * snapshot.engine.rpm
  const fuelEconomyKmL = snapshot.fuelRateLph > 0.01
    ? Math.min(99.9, snapshot.speedKph / snapshot.fuelRateLph).toFixed(1)
    : snapshot.speedKph > 0.5 ? '∞' : '—'

  return (
    <div className="app-shell" data-locale={locale} data-system="ths">
      <header className="app-header">
        <div className="brand-mark"><div className="brand-orbit"><i /><i /><i /></div></div>
        <div className="brand-copy"><b>THS // POWER SPLIT LAB</b><span>{t('brandSubtitle')}</span></div>
        <SystemSwitcher system={system} onSwitch={onSwitchSystem} t={t} />
        <div className="header-divider" />
        <div className="vehicle-id"><span>{t('simulationVehicle')}</span><b>{PRIUS.model}</b></div>
        <div className="header-status"><i /> {t('gpuRendering')} <span>60 FPS</span></div>
        <div className="language-switch"><Languages size={13} /><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('language')}>{LOCALES.map((code) => <option value={code} key={code}>{localeLabels[code]}</option>)}</select></div>
        <button className="header-button" onClick={() => setShowLearn(true)}><BookOpen size={15} /> {t('learn')}</button>
        <button className="icon-button" title={t('reset')} onClick={reset}><RotateCcw size={17} /></button>
      </header>

      <main>
        <RoadScene snapshot={snapshot} t={t} />
        <div className="dashboard-grid">
          <section className="panel psd-panel">
            <div className="panel-header">
              <div><div className="eyebrow"><Box size={13} /> {t('live3d')}</div><h1>{t('powerSplitDevice')}</h1></div>
              <div className="ratio-badge"><span>{t('gearRatio')}</span><b>78 <i>:</i> 30</b></div>
            </div>
            <div className="psd-stage">
              <Suspense fallback={<div className="three-loading"><i />{t('gpuRendering')}…</div>}><PowerSplit3D snapshot={snapshot} t={t} /></Suspense>
              <div className="axis-legend">
                <span><i className="carrier-swatch" /> {t('carrier')} <b>{t('engine')}</b></span>
                <span><i className="sun-swatch" /> {t('sun')} <b>MG1</b></span>
                <span><i className="ring-swatch" /> {t('ring')} <b>{t('ringOutput')}</b></span>
              </div>
            </div>
            <PowerSplitNomograph snapshot={snapshot} t={t} />
            <div className="constraint-strip">
              <div className="constraint-status"><i /><span>{t('kinematicConstraint')}</span><b>{t('locked')}</b></div>
              <code>78 n<sub>MG2</sub> + 30 n<sub>MG1</sub> = 108 n<sub>ENG</sub></code>
              <span className="constraint-error">Δ {Math.abs(constraintError).toFixed(2)}</span>
            </div>
          </section>

          <section className="panel live-panel">
            <div className="panel-header compact">
              <div><div className="eyebrow"><Activity size={13} /> {t('shaftTelemetry')}</div><h2>{t('liveRotation')}</h2></div>
              <div className={`mode-pill ${snapshot.mode.toLowerCase().replaceAll(' ', '-')}`}><i />{t(modeTranslationKey[snapshot.mode])}</div>
            </div>
            <div className="gauge-grid">
              <Gauge label={t('engine')} role={t('planetCarrier')} value={snapshot.engine.rpm} max={PRIUS.engineMaxRpm} accent="#ff7048" detail={<><b>{snapshot.engine.torque.toFixed(0)}</b> Nm · {snapshot.engine.powerKw.toFixed(1)} kW</>} efficiency={snapshot.engine.efficiency} />
              <Gauge label="MG1" role={t('sunGear')} value={snapshot.mg1.rpm} max={PRIUS.mg1MaxRpm} accent="#6275ef" detail={<><b>{formatSigned(snapshot.mg1.torque, 0)}</b> Nm · {formatSigned(snapshot.mg1.powerKw)} kW</>} efficiency={snapshot.mg1.efficiency} />
              <Gauge label="MG2" role={t('ringGear')} value={snapshot.mg2.rpm} max={PRIUS.mg2MaxRpm} accent="#31b99a" detail={<><b>{formatSigned(snapshot.mg2.torque, 0)}</b> Nm · {formatSigned(snapshot.mg2.powerKw)} kW</>} efficiency={snapshot.mg2.efficiency} />
            </div>
            <div className="metrics-grid">
              <Metric icon={<GaugeIcon size={13} />} label={t('tireTorque')} value={formatSigned(snapshot.tireTorque, 0)} unit="Nm" />
              <Metric icon={<Zap size={13} />} label={t('output')} value={formatSigned(snapshot.wheelPowerKw)} unit="kW" />
              <Metric icon={<Battery size={13} />} label={t('regen')} value={snapshot.regenKw.toFixed(1)} unit="kW" tone="green" />
              <Metric icon={<Fuel size={13} />} label={t('fuelRate')} value={fuelEconomyKmL} unit="km/L" tone="orange" />
            </div>
            <div className="control-deck">
              <div className="control-title"><Settings2 size={14} /><span>{t('driverInput')}</span><small>↑ W / ↓ S / SPACE</small></div>
              <div className="pedal-row accel-row"><label htmlFor="throttle"><span>{t('accel')}</span><b>{Math.round(input.throttle * 100)}%</b></label><input id="throttle" type="range" min="0" max="100" value={input.throttle * 100} onChange={(event) => setInput({ throttle: Number(event.target.value) / 100 })} style={{ '--fill': `${input.throttle * 100}%` } as React.CSSProperties} /></div>
              <div className="pedal-row brake-row"><label htmlFor="brake"><span>{t('brake')}</span><b>{Math.round(input.brake * 100)}%</b></label><input id="brake" type="range" min="0" max="100" value={input.brake * 100} onChange={(event) => setInput({ brake: Number(event.target.value) / 100 })} style={{ '--fill': `${input.brake * 100}%` } as React.CSSProperties} /></div>
              <button className={`run-button ${input.running ? 'running' : ''}`} onClick={() => setInput({ running: !input.running })}>{input.running ? <CirclePause size={18} /> : <CirclePlay size={18} />}<span>{input.running ? t('pause') : t('start')}</span></button>
            </div>
          </section>

          <aside className="side-stack">
            <section className="panel efficiency-panel">
              <div className="mini-header"><div><div className="eyebrow"><Cpu size={12} /> {t('engineModel')}</div><h2>{t('engineEfficiency')}</h2></div><div className="eff-now"><span>{t('now')}</span><b>{(snapshot.engine.efficiency * 100).toFixed(1)}%</b></div></div>
              <EfficiencyMap rpm={snapshot.engine.rpm} torque={snapshot.engine.torque} engineOn={snapshot.engineOn} torqueLabel={t('torqueAxis')} />
              <div className="heat-legend"><span>η 12%</span><i /><span>37%</span></div>
            </section>

            <section className="panel power-panel">
              <div className="mini-header"><div><div className="eyebrow"><Zap size={12} /> {t('powerConversion')}</div><h2>{t('energyFlow')}</h2></div><ChevronRight size={17} /></div>
              <EnergyFlow snapshot={snapshot} t={t} />
            </section>

            <section className="panel battery-panel">
              <div className="battery-head">
                <div className="battery-icon"><Battery size={25} /><i style={{ height: `${snapshot.batterySoc * 100}%` }} /></div>
                <div><div className="eyebrow">NiMH · 201.6 V {t('nominal')}</div><h2>{t('hvBattery')}</h2></div>
                <div className="soc-value"><b>{(snapshot.batterySoc * 100).toFixed(0)}</b><span>% {t('soc')}</span></div>
              </div>
              <div className="battery-bar"><i style={{ width: `${snapshot.batterySoc * 100}%` }} /><span className="soc-window">{t('controlWindow')}</span></div>
              <div className="battery-metrics"><Metric label={t('voltage')} value={snapshot.batteryVoltage.toFixed(1)} unit="V" /><Metric label={t('current')} value={formatSigned(snapshot.batteryCurrent, 1)} unit="A" /><Metric label={t('power')} value={formatSigned(snapshot.batteryPowerKw, 1)} unit="kW" tone={snapshot.batteryPowerKw < 0 ? 'green' : ''} /></div>
              <p className="sign-note"><i /> ＋ {t('discharge')} / − {t('charge')} · {t('regenTotal')} {snapshot.regenEnergyKwh.toFixed(3)} kWh</p>
            </section>
          </aside>
        </div>
      </main>

      <footer className="app-footer">
        <span><i className="footer-live" /> {t('realTimeModel')}</span>
        <span>m 1,325 kg · Cd 0.26 · Final 4.113 · Wheel r 0.285 m</span>
        <button onClick={() => setShowLearn(true)}><Info size={13} /> {t('modelSources')}</button>
      </footer>
      {showLearn && <LearnPanel close={() => setShowLearn(false)} t={t} />}
    </div>
  )
}

function EPowerWorkspace({ system, onSwitchSystem, locale, setLocale, showLearn, setShowLearn, t }: WorkspaceProps) {
  const { snapshot, input, setInput, reset } = useEPowerSimulation()
  const fuelEconomyKmL = snapshot.fuelRateLph > 0.01
    ? Math.min(99.9, snapshot.speedKph / snapshot.fuelRateLph).toFixed(1)
    : snapshot.speedKph > 0.5 ? '∞' : '—'

  return (
    <div className="app-shell epower-shell" data-locale={locale} data-system="epower">
      <header className="app-header">
        <div className="brand-mark epower-mark"><Zap size={18} /></div>
        <div className="brand-copy"><b>e-POWER // GEN 3 LAB</b><span>{t('epBrandSubtitle')}</span></div>
        <SystemSwitcher system={system} onSwitch={onSwitchSystem} t={t} />
        <div className="header-divider" />
        <div className="vehicle-id"><span>{t('simulationVehicle')}</span><b>{EPOWER.model}</b></div>
        <div className="header-status"><i /> {t('gpuRendering')} <span>60 FPS</span></div>
        <div className="language-switch"><Languages size={13} /><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('language')}>{LOCALES.map((code) => <option value={code} key={code}>{localeLabels[code]}</option>)}</select></div>
        <button className="header-button" onClick={() => setShowLearn(true)}><BookOpen size={15} /> {t('learn')}</button>
        <button className="icon-button" title={t('reset')} onClick={reset}><RotateCcw size={17} /></button>
      </header>

      <main>
        <EPowerRoadScene snapshot={snapshot} t={t} />
        <div className="dashboard-grid">
          <section className="panel psd-panel">
            <div className="panel-header">
              <div><div className="eyebrow"><Box size={13} /> {t('epLive3d')}</div><h1>{t('epUnitTitle')}</h1></div>
              <div className="ratio-badge"><span>{t('epLayoutBadge')}</span><b>{t('epSeriesTag')}</b></div>
            </div>
            <div className="psd-stage">
              <Suspense fallback={<div className="three-loading"><i />{t('gpuRendering')}…</div>}><EPower3D snapshot={snapshot} t={t} /></Suspense>
              <div className="axis-legend">
                <span><i className="carrier-swatch" /> {t('epGenLegend')} <b>ENG ×2.2 GEN</b></span>
                <span><i className="sun-swatch" /> {t('epElecLegend')} <b>{t('epDcBus')}</b></span>
                <span><i className="ring-swatch" /> {t('epDriveLegend')} <b>MOT ÷8.2 WHL</b></span>
              </div>
            </div>
            <EPowerDualSystem snapshot={snapshot} t={t} />
            <div className="constraint-strip">
              <div className="constraint-status"><i /><span>{t('epSeriesConstraint')}</span><b>{t('epDecoupled')}</b></div>
              <code>n<sub>GEN</sub>=2.2n<sub>ENG</sub> · n<sub>MOT</sub>=8.2n<sub>WHL</sub></code>
              <span className="constraint-error">ΔDC {Math.abs(snapshot.dcBusBalanceErrorKw).toFixed(2)}</span>
            </div>
          </section>

          <section className="panel live-panel">
            <div className="panel-header compact">
              <div><div className="eyebrow"><Activity size={13} /> {t('shaftTelemetry')}</div><h2>{t('liveRotation')}</h2></div>
              <div className={`mode-pill ${snapshot.mode.toLowerCase().replaceAll(' ', '-')}`}><i />{t(epowerModeTranslationKey[snapshot.mode])}</div>
            </div>
            <div className="gauge-grid">
              <Gauge
                label={t('engine')}
                role={t('epGenRole')}
                value={snapshot.engine.rpm}
                max={EPOWER.engineMaxRpm}
                accent="#ff7048"
                detail={<><b>{snapshot.engine.torque.toFixed(0)}</b> Nm · {snapshot.engine.powerKw.toFixed(1)} kW</>}
                efficiency={snapshot.engine.efficiency}
              />
              <Gauge
                label={t('epGeneratorShort')}
                role={t('epGeneratorRole')}
                value={snapshot.generator.rpm}
                max={EPOWER.generatorMaxRpm}
                accent="#6275ef"
                detail={<><b>{formatSigned(snapshot.generator.torque, 0)}</b> Nm · {snapshot.flows.genToDcKw.toFixed(1)} kW</>}
                efficiency={snapshot.generator.efficiency}
              />
              <Gauge
                label={t('epMotorShort')}
                role={t('epMotorRole')}
                value={snapshot.motor.rpm}
                max={EPOWER.motorMaxRpm}
                accent="#31b99a"
                detail={<><b>{formatSigned(snapshot.motor.torque, 0)}</b> Nm · {formatSigned(snapshot.motor.powerKw)} kW</>}
                efficiency={snapshot.motor.efficiency}
              />
            </div>
            <div className="metrics-grid">
              <Metric icon={<GaugeIcon size={13} />} label={t('tireTorque')} value={formatSigned(snapshot.tireTorque, 0)} unit="Nm" />
              <Metric icon={<Zap size={13} />} label={t('output')} value={formatSigned(snapshot.wheelPowerKw)} unit="kW" />
              <Metric icon={<Battery size={13} />} label={t('regen')} value={snapshot.regenKw.toFixed(1)} unit="kW" tone="green" />
              <Metric icon={<Fuel size={13} />} label={t('fuelRate')} value={fuelEconomyKmL} unit="km/L" tone="orange" />
            </div>
            <div className="control-deck">
              <div className="control-title"><Settings2 size={14} /><span>{t('driverInput')}</span><small>↑ W / ↓ S / SPACE</small></div>
              <div className="pedal-row accel-row"><label htmlFor="ep-throttle"><span>{t('accel')}</span><b>{Math.round(input.throttle * 100)}%</b></label><input id="ep-throttle" type="range" min="0" max="100" value={input.throttle * 100} onChange={(event) => setInput({ throttle: Number(event.target.value) / 100 })} style={{ '--fill': `${input.throttle * 100}%` } as React.CSSProperties} /></div>
              <div className="pedal-row brake-row"><label htmlFor="ep-brake"><span>{t('brake')}</span><b>{Math.round(input.brake * 100)}%</b></label><input id="ep-brake" type="range" min="0" max="100" value={input.brake * 100} onChange={(event) => setInput({ brake: Number(event.target.value) / 100 })} style={{ '--fill': `${input.brake * 100}%` } as React.CSSProperties} /></div>
              <button className={`run-button ${input.running ? 'running' : ''}`} onClick={() => setInput({ running: !input.running })}>{input.running ? <CirclePause size={18} /> : <CirclePlay size={18} />}<span>{input.running ? t('pause') : t('start')}</span></button>
            </div>
          </section>

          <aside className="side-stack">
            <section className="panel efficiency-panel">
              <div className="mini-header"><div><div className="eyebrow"><Cpu size={12} /> {t('epEngineModel')}</div><h2>{t('engineEfficiency')}</h2></div><div className="eff-now"><span>{t('now')}</span><b>{(snapshot.engine.efficiency * 100).toFixed(1)}%</b></div></div>
              <EPowerEfficiencyMap rpm={snapshot.engine.rpm} torque={snapshot.engine.torque} engineOn={snapshot.engineOn} torqueLabel={t('torqueAxis')} />
              <div className="heat-legend"><span>η 16%</span><i /><span>42%</span></div>
            </section>

            <section className="panel power-panel">
              <div className="mini-header"><div><div className="eyebrow"><Zap size={12} /> {t('powerConversion')}</div><h2>{t('energyFlow')}</h2></div><ChevronRight size={17} /></div>
              <EPowerEnergyFlow snapshot={snapshot} t={t} />
            </section>

            <section className="panel battery-panel">
              <div className="battery-head">
                <div className="battery-icon"><Battery size={25} /><i style={{ height: `${snapshot.batterySoc * 100}%` }} /></div>
                <div><div className="eyebrow">{t('epBatteryEyebrow')}</div><h2>{t('hvBattery')}</h2></div>
                <div className="soc-value"><b>{(snapshot.batterySoc * 100).toFixed(0)}</b><span>% {t('soc')}</span></div>
              </div>
              <div className="battery-bar"><i style={{ width: `${snapshot.batterySoc * 100}%` }} /><span className="soc-window">{t('epControlWindow')}</span></div>
              <div className="battery-metrics"><Metric label={t('voltage')} value={snapshot.batteryVoltage.toFixed(1)} unit="V" /><Metric label={t('current')} value={formatSigned(snapshot.batteryCurrent, 1)} unit="A" /><Metric label={t('power')} value={formatSigned(snapshot.batteryPowerKw, 1)} unit="kW" tone={snapshot.batteryPowerKw < 0 ? 'green' : ''} /></div>
              <p className="sign-note"><i /> ＋ {t('discharge')} / − {t('charge')} · {t('regenTotal')} {snapshot.regenEnergyKwh.toFixed(3)} kWh · {t('epFuelTotal')} {snapshot.totalFuelMl.toFixed(1)} mL</p>
            </section>
          </aside>
        </div>
      </main>

      <footer className="app-footer">
        <span><i className="footer-live" /> {t('realTimeModel')}</span>
        <span>Motor 151 kW · Batt 2.1 kWh · ηmax 42% · m 1,640 kg (est.)</span>
        <button onClick={() => setShowLearn(true)}><Info size={13} /> {t('modelSources')}</button>
      </footer>
      {showLearn && <EPowerLearnPanel close={() => setShowLearn(false)} t={t} />}
    </div>
  )
}

export default function App() {
  const [system, setSystem] = useState<SystemId>('ths')
  const [showLearn, setShowLearn] = useState(false)
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = window.localStorage.getItem('ths-locale')
    return LOCALES.includes(saved as Locale) ? saved as Locale : 'EN'
  })
  const t: TFunction = (key) => translate(locale, key)

  const handleSwitchSystem = (next: SystemId) => {
    if (next === system) return
    setShowLearn(false)
    setSystem(next)
  }

  useEffect(() => {
    document.documentElement.lang = ({ EN: 'en', JP: 'ja', ZH: 'zh-CN', DE: 'de', FR: 'fr' } as const)[locale]
    window.localStorage.setItem('ths-locale', locale)
  }, [locale])

  if (system === 'epower') {
    return (
      <EPowerWorkspace
        system={system}
        onSwitchSystem={handleSwitchSystem}
        locale={locale}
        setLocale={setLocaleState}
        showLearn={showLearn}
        setShowLearn={setShowLearn}
        t={t}
      />
    )
  }

  return (
    <ThsWorkspace
      system={system}
      onSwitchSystem={handleSwitchSystem}
      locale={locale}
      setLocale={setLocaleState}
      showLearn={showLearn}
      setShowLearn={setShowLearn}
      t={t}
    />
  )
}
