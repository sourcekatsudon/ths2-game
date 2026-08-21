export type TerrainKind = 'flat' | 'uphill' | 'downhill' | 'rough'

export type DriveMode =
  | 'EV DRIVE'
  | 'HYBRID DRIVE'
  | 'ENGINE CHARGE'
  | 'REGENERATING'
  | 'DESCENT HOLD'
  | 'COASTING'
  | 'READY'

export interface MachineState {
  rpm: number
  torque: number
  powerKw: number
  efficiency: number
}

export interface SimulationSnapshot {
  time: number
  distance: number
  speedKph: number
  acceleration: number
  grade: number
  terrain: TerrainKind
  terrainLabel: string
  nextTerrainLabel: string
  nextTerrainDistance: number
  mode: DriveMode
  engine: MachineState
  mg1: MachineState
  mg2: MachineState
  wheelRpm: number
  tireTorque: number
  wheelPowerKw: number
  regenKw: number
  regenEnergyKwh: number
  frictionBrakeKw: number
  batterySoc: number
  batteryVoltage: number
  batteryCurrent: number
  batteryPowerKw: number
  fuelRateLph: number
  totalFuelMl: number
  engineOn: boolean
  descentAuto: boolean
  energyFlow: 'battery-to-wheel' | 'engine-to-wheel' | 'engine-and-battery' | 'wheel-to-battery' | 'engine-to-battery' | 'idle'
}

export interface DriverInput {
  throttle: number
  brake: number
  running: boolean
}

export const PRIUS = {
  model: 'PRIUS NHW20 / THS II',
  massKg: 1325,
  dragCoefficient: 0.26,
  frontalAreaM2: 2.16,
  wheelRadiusM: 0.285,
  finalDrive: 4.113,
  ringTeeth: 78,
  sunTeeth: 30,
  planetTeeth: 23,
  engineMaxPowerKw: 57,
  engineMaxTorqueNm: 115,
  engineMaxRpm: 5000,
  mg1MaxRpm: 10000,
  mg1MaxPowerKw: 30,
  mg2MaxPowerKw: 50,
  mg2MaxTorqueNm: 400,
  mg2MaxRpm: 6000,
  batteryNominalVoltage: 201.6,
  batteryCapacityKwh: 1.31,
  systemMaxPowerKw: 82,
} as const

const TERRAIN_ORDER: TerrainKind[] = [
  'flat', 'uphill', 'rough', 'downhill', 'flat', 'rough', 'uphill', 'downhill',
  'rough', 'flat', 'downhill', 'uphill',
]
export const ROAD_SEGMENT_M = 145

function hash(index: number) {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function terrainAt(distance: number): TerrainKind {
  const index = Math.max(0, Math.floor(distance / ROAD_SEGMENT_M))
  if (index < TERRAIN_ORDER.length) return TERRAIN_ORDER[index]
  return TERRAIN_ORDER[Math.floor(hash(index) * TERRAIN_ORDER.length)]
}

export const terrainName = (kind: TerrainKind) => ({
  flat: '平坦路', uphill: '上り坂', downhill: '下り坂', rough: 'ラフロード',
})[kind]

export function roadGradeAt(distance: number) {
  const safeDistance = Math.max(0, distance)
  const index = Math.floor(safeDistance / ROAD_SEGMENT_M)
  const phase = (safeDistance % ROAD_SEGMENT_M) / ROAD_SEGMENT_M
  const edge = Math.sin(Math.PI * Math.min(1, Math.max(0, phase))) ** 0.55
  const kind = terrainAt(safeDistance)

  if (kind === 'uphill') return 0.071 * edge + Math.sin(phase * Math.PI * 4) * 0.003
  if (kind === 'downhill') return -0.064 * edge + Math.sin(phase * Math.PI * 3) * 0.002
  if (kind === 'rough') return Math.sin(phase * Math.PI * 10) * 0.026 + Math.sin(phase * Math.PI * 23) * 0.009
  return Math.sin(phase * Math.PI * 2) * 0.003
}

export function engineMaxTorque(rpm: number) {
  const points: [number, number][] = [[0, 0], [800, 50], [1200, 78], [2200, 102], [3200, 110], [4200, 115], [5000, 109], [5300, 0]]
  for (let i = 1; i < points.length; i += 1) {
    if (rpm <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return y0 + (y1 - y0) * (rpm - x0) / (x1 - x0)
    }
  }
  return 0
}

export function engineEfficiency(rpm: number, torque: number) {
  if (rpm < 650 || torque < 4) return 0
  const speedPeak = Math.exp(-(((rpm - 2350) / 1850) ** 2))
  const loadRatio = Math.min(1, torque / Math.max(1, engineMaxTorque(rpm)))
  const loadPeak = Math.exp(-(((loadRatio - 0.72) / 0.43) ** 2))
  return Math.min(0.37, Math.max(0.12, 0.12 + 0.15 * speedPeak + 0.11 * loadPeak * speedPeak))
}

export function motorEfficiency(rpm: number, torque: number, maxRpm: number, maxTorque: number) {
  const speed = Math.min(1, Math.abs(rpm) / maxRpm)
  const load = Math.min(1, Math.abs(torque) / maxTorque)
  if (Math.abs(torque) < 0.5 || Math.abs(rpm) < 5) return 0.82
  return Math.max(0.75, Math.min(0.95, 0.82 + 0.15 * Math.sin(speed * Math.PI) * Math.sqrt(load) - 0.045 * load ** 3))
}

export function mg2TorqueLimit(rpm: number) {
  const omega = Math.max(1, Math.abs(rpm) * Math.PI / 30)
  return Math.min(PRIUS.mg2MaxTorqueNm, PRIUS.mg2MaxPowerKw * 1000 / omega)
}
