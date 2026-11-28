import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, OrbitControls } from '@react-three/drei'
import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { EPowerSnapshot } from '../simulation/epowerModel'
import type { TFunction } from '../i18n'
import {
  EPOWER_3D_LABELS,
  EPOWER_ASSEMBLY_TRANSFORM,
  EPOWER_CAMERA_CONFIG,
  clampEPowerLabelPosition,
  computeEPowerLabelMetrics,
  estimateEPowerLabelDimensions,
  type EPowerLabelId,
} from './epowerLabelLayout'

/**
 * Educational schematic 3D visualization of Nissan 3rd-generation e-POWER.
 * Shows two physically independent mechanical paths bridged strictly by an
 * electrical DC bus / inverter inside a schematic 5-in-1 unit outline:
 *   Path A (Generation): 3-cyl ZR15DDTe cutaway -> Increaser gear -> Generator rotor
 *   Electrical Bridge:   Inverter / DC Bus <-> HV Battery
 *   Path B (Propulsion): Drive Motor rotor -> Reducer gear -> Output axle / wheel hub
 *
 * Visual shaft speed is scaled by 1/42 for readability (consistent with THS 3D view).
 */
const VISUAL_SCALE = 1 / 42

const GEN_TO_DC_POINTS: [number, number, number][] = [
  [0.05, 0.92, 0.77],
  [0.45, 0.84, 0.66],
  [0.65, 0.42, 0.44],
]

const DC_TO_MOTOR_POINTS: [number, number, number][] = [
  [1.02, -0.1, 0.32],
  [1.26, -0.42, 0.22],
  [1.42, -0.82, 0.08],
]

const BATT_TO_DC_POINTS: [number, number, number][] = [
  [-1.12, -1.16, 0.35],
  [-0.25, -0.96, 0.35],
  [0.32, -0.14, 0.34],
]

function gearShape(teeth: number, rootRadius: number, toothDepth: number) {
  const shape = new THREE.Shape()
  const steps = teeth * 4
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const phase = i % 4
    const radius = rootRadius + (phase === 1 || phase === 2 ? toothDepth : 0)
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function SpurGear({
  teeth,
  radius,
  depth,
  width = 0.24,
  color,
  markerColor = '#caff45',
}: {
  teeth: number
  radius: number
  depth: number
  width?: number
  color: string
  markerColor?: string
}) {
  const geometry = useMemo(() => {
    const shape = gearShape(teeth, radius - depth, depth)
    const hole = new THREE.Path()
    hole.absarc(0, 0, radius * 0.22, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.02,
      bevelSegments: 2,
    })
    g.center()
    return g
  }, [teeth, radius, depth, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} metalness={0.58} roughness={0.25} />
      </mesh>
      <mesh position={[radius * 0.62, 0, width * 0.56]}>
        <boxGeometry args={[radius * 0.42, 0.07, 0.05]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.45} />
      </mesh>
    </group>
  )
}

interface PulseConfig {
  points: [number, number, number][]
  powerKw: number
  direction: 1 | -1
  maxPowerKw: number
  color: string
  emissive: string
}

function PowerPulseStream({ points, powerKw, direction, maxPowerKw, color, emissive }: PulseConfig) {
  const pulseCount = 5
  const curve = useMemo(() => {
    const vecs = points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    return new THREE.CatmullRomCurve3(vecs)
  }, [points])

  const tubeGeometry = useMemo(() => new THREE.TubeGeometry(curve, 32, 0.055, 10, false), [curve])
  useEffect(() => () => tubeGeometry.dispose(), [tubeGeometry])
  const meshRefs = useRef<Array<THREE.Mesh | null>>([])
  const phaseRef = useRef(0)
  const upAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])

  const active = powerKw > 0.3
  const intensity = Math.min(1, powerKw / Math.max(1, maxPowerKw))

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (active) {
      const speed = 0.28 + intensity * 1.15
      phaseRef.current = (phaseRef.current + dt * speed * direction + 10) % 1
    }
    for (let i = 0; i < pulseCount; i += 1) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      mesh.visible = active
      if (!active) continue
      const u = (phaseRef.current + i / pulseCount) % 1
      curve.getPointAt(u, pos)
      curve.getTangentAt(u, tangent)
      if (direction < 0) tangent.negate()
      mesh.position.copy(pos)
      quat.setFromUnitVectors(upAxis, tangent.normalize())
      mesh.quaternion.copy(quat)
      const s = 0.8 + intensity * 0.45
      mesh.scale.set(s, s * 1.15, s)
    }
  })

  return (
    <group>
      <mesh geometry={tubeGeometry}>
        <meshStandardMaterial
          color={active ? color : '#b8c5c0'}
          emissive={active ? emissive : '#000000'}
          emissiveIntensity={active ? 0.25 + intensity * 0.55 : 0}
          metalness={0.35}
          roughness={0.35}
          transparent
          opacity={active ? 0.92 : 0.45}
        />
      </mesh>
      {Array.from({ length: pulseCount }).map((_, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            meshRefs.current[idx] = el
          }}
          visible={false}
        >
          <coneGeometry args={[0.11, 0.26, 6]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={0.85}
            metalness={0.2}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  )
}

const HTML_CONTAINER_STYLE: CSSProperties = { pointerEvents: 'none' }
const LABEL_Z_INDEX_RANGE: [number, number] = [10, 1]
const labelProjectionScratch = new THREE.Vector3()

function epowerLabelText(id: EPowerLabelId, t: TFunction): string {
  switch (id) {
    case 'engine':
      return `${t('epEngineShort')} · ZR15DDTe`
    case 'generator':
      return `${t('epGeneratorShort')} · ×2.2`
    case 'dcbus':
      return `5-IN-1 · ${t('epDcBus')}`
    case 'motor':
      return `${t('epMotorShort')} · 151 kW`
    case 'battery':
      return `${t('battery')} · 2.1 kWh`
  }
}

function EPowerFloatingLabels({ t }: { t: TFunction }) {
  const size = useThree((state) => state.size)
  const metrics = useMemo(
    () => computeEPowerLabelMetrics(size.width, size.height),
    [size.width, size.height],
  )
  const labelStyle = useMemo(
    () => ({ '--ep-label-scale': metrics.scale }) as CSSProperties,
    [metrics.scale],
  )
  const engineText = epowerLabelText('engine', t)
  const generatorText = epowerLabelText('generator', t)
  const dcbusText = epowerLabelText('dcbus', t)
  const motorText = epowerLabelText('motor', t)
  const batteryText = epowerLabelText('battery', t)

  const items = useMemo(() => {
    const texts: Record<EPowerLabelId, string> = {
      engine: engineText,
      generator: generatorText,
      dcbus: dcbusText,
      motor: motorText,
      battery: batteryText,
    }
    return EPOWER_3D_LABELS.map((anchor) => {
      const text = texts[anchor.id]
      const bounds = estimateEPowerLabelDimensions(text, metrics)
      const calculatePosition = (
        el: THREE.Object3D,
        camera: THREE.Camera,
        viewport: { width: number; height: number },
      ): [number, number] => {
        labelProjectionScratch.setFromMatrixPosition(el.matrixWorld)
        labelProjectionScratch.project(camera)
        const halfW = viewport.width / 2
        const halfH = viewport.height / 2
        const rawX = labelProjectionScratch.x * halfW + halfW
        const rawY = -(labelProjectionScratch.y * halfH) + halfH
        return clampEPowerLabelPosition(rawX, rawY, viewport.width, viewport.height, bounds)
      }
      return { anchor, text, calculatePosition }
    })
  }, [metrics, engineText, generatorText, dcbusText, motorText, batteryText])

  return (
    <>
      {items.map(({ anchor, text, calculatePosition }) => (
        <Html
          key={anchor.id}
          position={[anchor.position[0], anchor.position[1], anchor.position[2]]}
          center
          wrapperClass="epower-html-wrapper"
          className="epower-html-anchor"
          style={HTML_CONTAINER_STYLE}
          pointerEvents="none"
          zIndexRange={LABEL_Z_INDEX_RANGE}
          calculatePosition={calculatePosition}
        >
          <span
            className={`three-label epower-three-label ${anchor.toneClass}`}
            style={labelStyle}
          >
            {text}
          </span>
        </Html>
      ))}
    </>
  )
}

function EPowerAssembly({ snapshot, t }: { snapshot: EPowerSnapshot; t: TFunction }) {
  const crankRef = useRef<THREE.Group>(null)
  const pistonRefs = useRef<Array<THREE.Mesh | null>>([])
  const rodRefs = useRef<Array<THREE.Mesh | null>>([])
  const sparkRefs = useRef<Array<THREE.Mesh | null>>([])
  const incDriveRef = useRef<THREE.Group>(null)
  const incDrivenRef = useRef<THREE.Group>(null)
  const genRotorRef = useRef<THREE.Group>(null)
  const motorRotorRef = useRef<THREE.Group>(null)
  const redPinionRef = useRef<THREE.Group>(null)
  const redWheelRef = useRef<THREE.Group>(null)
  const wheelHubRef = useRef<THREE.Group>(null)

  const angles = useRef({
    engine: 0,
    generator: 0,
    motor: 0,
    wheel: 0,
  })

  const cylOffsets = [-0.52, 0, 0.52]
  const crankPhases = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  const crankRadius = 0.21
  const rodLength = 0.54

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const engOmega = (snapshot.engine.rpm * Math.PI) / 30 * VISUAL_SCALE
    const genOmega = (snapshot.generator.rpm * Math.PI) / 30 * VISUAL_SCALE
    const motOmega = (snapshot.motor.rpm * Math.PI) / 30 * VISUAL_SCALE
    const whlOmega = (snapshot.wheelRpm * Math.PI) / 30 * VISUAL_SCALE

    angles.current.engine += engOmega * dt
    angles.current.generator += genOmega * dt
    angles.current.motor += motOmega * dt
    angles.current.wheel += whlOmega * dt

    const engA = angles.current.engine
    if (crankRef.current) crankRef.current.rotation.x = engA
    if (incDriveRef.current) incDriveRef.current.rotation.x = engA
    if (incDrivenRef.current) incDrivenRef.current.rotation.x = -angles.current.generator
    if (genRotorRef.current) genRotorRef.current.rotation.x = -angles.current.generator

    if (motorRotorRef.current) motorRotorRef.current.rotation.x = angles.current.motor
    if (redPinionRef.current) redPinionRef.current.rotation.x = angles.current.motor
    if (redWheelRef.current) redWheelRef.current.rotation.x = -angles.current.wheel
    if (wheelHubRef.current) wheelHubRef.current.rotation.x = -angles.current.wheel

    // Exact 3-cylinder slider-crank motion (120-degree firing spacing)
    const firing = snapshot.engineOn && snapshot.engine.torque > 5
    for (let i = 0; i < 3; i += 1) {
      const theta = engA + crankPhases[i]
      const pinY = Math.cos(theta) * crankRadius
      const pinZ = Math.sin(theta) * crankRadius
      const pistonY = pinY + Math.sqrt(Math.max(0.01, rodLength * rodLength - pinZ * pinZ))
      const piston = pistonRefs.current[i]
      if (piston) piston.position.y = pistonY
      const rod = rodRefs.current[i]
      if (rod) {
        rod.position.set(cylOffsets[i], (pinY + pistonY) * 0.5, pinZ * 0.5)
        rod.rotation.x = -Math.atan2(pinZ, pistonY - pinY)
      }
      const spark = sparkRefs.current[i]
      if (spark) {
        const nearTdc = Math.cos(theta) > 0.86
        spark.visible = firing && nearTdc
      }
    }
  })

  const genActive = snapshot.flows.genToDcKw > 0.3
  const motorDriving = snapshot.flows.motorFromDcKw > 0.3
  const motorRegen = snapshot.flows.regenToDcKw > 0.3
  const battDischarging = snapshot.flows.battToDcKw > 0.3
  const battCharging = snapshot.flows.dcToBattKw > 0.3
  const frictionActive = snapshot.frictionBrakeKw > 0.8

  const motorLinePower = motorDriving ? snapshot.flows.motorFromDcKw : motorRegen ? snapshot.flows.regenToDcKw : 0
  const motorLineDir: 1 | -1 = motorRegen ? -1 : 1
  const motorLineColor = motorRegen ? '#3b9be8' : '#25c29d'
  const motorLineEmissive = motorRegen ? '#1c6ab5' : '#0f8c6e'

  const battLinePower = battDischarging ? snapshot.flows.battToDcKw : battCharging ? snapshot.flows.dcToBattKw : 0
  const battLineDir: 1 | -1 = battDischarging ? 1 : -1
  const battLineColor = battDischarging ? '#7ad83b' : '#3896e4'
  const battLineEmissive = battDischarging ? '#3d8f12' : '#1b66b0'

  const socRatio = Math.max(0.05, Math.min(1, snapshot.batterySoc))

  const frameGeometries = useMemo(() => {
    const unitBox = new THREE.BoxGeometry(4.85, 3.15, 2.05)
    const engBox = new THREE.BoxGeometry(1.82, 1.38, 0.98)
    const battBox = new THREE.BoxGeometry(1.62, 0.64, 0.92)
    const edges = {
      unit: new THREE.EdgesGeometry(unitBox),
      engine: new THREE.EdgesGeometry(engBox),
      battery: new THREE.EdgesGeometry(battBox),
    }
    unitBox.dispose()
    engBox.dispose()
    battBox.dispose()
    return edges
  }, [])

  useEffect(() => () => {
    frameGeometries.unit.dispose()
    frameGeometries.engine.dispose()
    frameGeometries.battery.dispose()
  }, [frameGeometries])

  return (
    <group
      position={[
        EPOWER_ASSEMBLY_TRANSFORM.position[0],
        EPOWER_ASSEMBLY_TRANSFORM.position[1],
        EPOWER_ASSEMBLY_TRANSFORM.position[2],
      ]}
      rotation={[
        EPOWER_ASSEMBLY_TRANSFORM.rotation[0],
        EPOWER_ASSEMBLY_TRANSFORM.rotation[1],
        EPOWER_ASSEMBLY_TRANSFORM.rotation[2],
      ]}
    >
      {/* ================= 5-IN-1 SCHEMATIC ENCLOSURE ================= */}
      <group position={[0.92, 0.05, 0]}>
        <mesh>
          <boxGeometry args={[4.85, 3.15, 2.05]} />
          <meshPhysicalMaterial
            color="#d8eee6"
            transparent
            opacity={0.12}
            roughness={0.15}
            metalness={0.1}
            depthWrite={false}
          />
        </mesh>
        <lineSegments geometry={frameGeometries.unit}>
          <lineBasicMaterial color="#7da79a" transparent opacity={0.45} />
        </lineSegments>
      </group>

      {/* ================= PATH A: GENERATION (ENGINE -> INCREASER -> GENERATOR) ================= */}
      {/* 1. Dedicated 3-Cylinder Generator Engine (ZR15DDTe cutaway) */}
      <group position={[-2.95, 0.92, 0]}>
        {/* Translucent engine cylinder block cutaway */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[1.82, 1.38, 0.98]} />
          <meshPhysicalMaterial color="#ffd5c7" transparent opacity={0.22} roughness={0.2} depthWrite={false} />
        </mesh>
        <lineSegments position={[0, 0.48, 0]} geometry={frameGeometries.engine}>
          <lineBasicMaterial color="#e46842" transparent opacity={0.55} />
        </lineSegments>
        {/* Cylinder head cover */}
        <mesh position={[0, 1.24, 0]} castShadow>
          <boxGeometry args={[1.86, 0.16, 1.02]} />
          <meshStandardMaterial color="#e6643d" metalness={0.45} roughness={0.32} />
        </mesh>
        {/* 3 Cylinder liners, pistons, rods & combustion flash */}
        {cylOffsets.map((cx, idx) => (
          <group key={idx}>
            <mesh position={[cx, 0.68, 0]}>
              <cylinderGeometry args={[0.21, 0.21, 0.92, 20, 1, true]} />
              <meshStandardMaterial color="#b3c0bc" transparent opacity={0.24} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              ref={(el) => {
                pistonRefs.current[idx] = el
              }}
              position={[cx, 0.65, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.18, 0.18, 0.22, 20]} />
              <meshStandardMaterial color="#ff7a52" metalness={0.55} roughness={0.25} />
            </mesh>
            <mesh
              ref={(el) => {
                rodRefs.current[idx] = el
              }}
              position={[cx, 0.35, 0]}
            >
              <cylinderGeometry args={[0.04, 0.04, rodLength, 10]} />
              <meshStandardMaterial color="#586764" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh
              ref={(el) => {
                sparkRefs.current[idx] = el
              }}
              position={[cx, 1.05, 0]}
              visible={false}
            >
              <sphereGeometry args={[0.15, 12, 12]} />
              <meshStandardMaterial color="#ffd95e" emissive="#ff6b2b" emissiveIntensity={1.6} transparent opacity={0.9} />
            </mesh>
          </group>
        ))}
        {/* Crankshaft */}
        <group ref={crankRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.085, 0.085, 2.25, 18]} />
            <meshStandardMaterial color="#42504d" metalness={0.75} roughness={0.25} />
          </mesh>
          {cylOffsets.map((cx, idx) => {
            const p = crankPhases[idx]
            return (
              <mesh key={`throw-${idx}`} position={[cx, Math.cos(p) * crankRadius, Math.sin(p) * crankRadius]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.055, 0.16, 12]} />
                <meshStandardMaterial color="#ff855c" metalness={0.6} roughness={0.25} />
              </mesh>
            )
          })}
        </group>
      </group>

      {/* 2. Increaser Gear Pair (Engine -> Generator, 2.2:1 speed-up) */}
      <group position={[-1.5, 0.92, 0]}>
        <group ref={incDriveRef}>
          <SpurGear teeth={22} radius={0.52} depth={0.075} color="#ff7048" markerColor="#fff3b0" />
        </group>
        <group ref={incDrivenRef} position={[0, 0, 0.77]}>
          <SpurGear teeth={11} radius={0.27} depth={0.065} color="#6476ef" markerColor="#caff45" />
        </group>
        {/* Shaft to generator */}
        <mesh position={[0.48, 0, 0.77]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.95, 16]} />
          <meshStandardMaterial color="#5869d4" metalness={0.65} roughness={0.28} />
        </mesh>
      </group>

      {/* 3. Generator Cutaway (Stator + Spinning Rotor) */}
      <group position={[-0.45, 0.92, 0.77]}>
        {/* Cutaway stator housing */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.58, 0.58, 1.05, 28, 1, true, Math.PI * 0.25, Math.PI * 1.4]} />
          <meshStandardMaterial color="#5c6edd" metalness={0.5} roughness={0.28} side={THREE.DoubleSide} />
        </mesh>
        {/* Copper coil accent rings */}
        {[-0.46, 0.46].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.49, 0.065, 12, 32]} />
            <meshStandardMaterial
              color="#d47d42"
              emissive={genActive ? '#7f44ff' : '#000000'}
              emissiveIntensity={genActive ? 0.55 : 0}
              metalness={0.65}
              roughness={0.3}
            />
          </mesh>
        ))}
        {/* Spinning Generator Rotor */}
        <group ref={genRotorRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.35, 0.35, 0.92, 24]} />
            <meshStandardMaterial color="#8796f8" metalness={0.6} roughness={0.22} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[0, Math.cos(a) * 0.36, Math.sin(a) * 0.36]} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.88, 0.055, 0.06]} />
                <meshStandardMaterial
                  color={i === 0 ? '#ff7048' : '#d2ff4d'}
                  emissive={i === 0 ? '#a8290b' : '#4a6b00'}
                  emissiveIntensity={0.5}
                />
              </mesh>
            )
          })}
        </group>
      </group>

      {/* ================= ELECTRICAL BRIDGE: INVERTER / DC BUS ================= */}
      <group position={[0.72, 0.14, 0.32]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.18, 0.56, 0.72]} />
          <meshStandardMaterial color="#1d2f2e" metalness={0.55} roughness={0.32} />
        </mesh>
        {/* Glowing DC Bus Strip */}
        <mesh position={[0, 0, 0.37]}>
          <boxGeometry args={[0.96, 0.12, 0.03]} />
          <meshStandardMaterial
            color={genActive || motorDriving || motorRegen ? '#3ae0b4' : '#7a8e88'}
            emissive={motorRegen ? '#2f89df' : genActive || motorDriving ? '#1bb88e' : '#000000'}
            emissiveIntensity={genActive || motorDriving || motorRegen ? 0.9 : 0}
          />
        </mesh>
        {/* Cooling fins */}
        {[-0.4, -0.2, 0, 0.2, 0.4].map((fx) => (
          <mesh key={fx} position={[fx, 0.3, 0]}>
            <boxGeometry args={[0.05, 0.06, 0.62]} />
            <meshStandardMaterial color="#8fa39d" metalness={0.7} roughness={0.25} />
          </mesh>
        ))}
      </group>

      {/* ================= PATH B: PROPULSION (DRIVE MOTOR -> REDUCER -> AXLE) ================= */}
      {/* 4. 151 kW Drive Motor Cutaway */}
      <group position={[1.45, -0.86, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.68, 0.68, 1.24, 32, 1, true, Math.PI * 0.22, Math.PI * 1.45]} />
          <meshStandardMaterial color="#25ab8d" metalness={0.52} roughness={0.24} side={THREE.DoubleSide} />
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.57, 0.075, 12, 32]} />
            <meshStandardMaterial
              color="#d47d42"
              emissive={motorRegen ? '#2d8be6' : motorDriving ? '#1fd6a3' : '#000000'}
              emissiveIntensity={motorDriving || motorRegen ? 0.6 : 0}
              metalness={0.62}
              roughness={0.28}
            />
          </mesh>
        ))}
        {/* Spinning Drive Motor Rotor */}
        <group ref={motorRotorRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.42, 0.42, 1.08, 24]} />
            <meshStandardMaterial color="#4fd4b5" metalness={0.58} roughness={0.22} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <mesh key={i} position={[0, Math.cos(a) * 0.43, Math.sin(a) * 0.43]} rotation={[a, 0, 0]}>
                <boxGeometry args={[1.02, 0.06, 0.065]} />
                <meshStandardMaterial
                  color={i === 0 ? '#ff643c' : '#caff45'}
                  emissive={i === 0 ? '#9c2309' : '#3d6300'}
                  emissiveIntensity={0.5}
                />
              </mesh>
            )
          })}
        </group>
        {/* Motor output shaft to reducer */}
        <mesh position={[0.82, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.6, 16]} />
          <meshStandardMaterial color="#2ba88c" metalness={0.65} roughness={0.25} />
        </mesh>
      </group>

      {/* 5. Reducer Gear Pair (Drive Motor -> Output Axle, 8.2:1 reduction) */}
      <group position={[2.55, -0.86, 0]}>
        <group ref={redPinionRef}>
          <SpurGear teeth={10} radius={0.25} depth={0.06} color="#27b896" markerColor="#caff45" />
        </group>
        <group ref={redWheelRef} position={[0, 0, -0.86]}>
          <SpurGear teeth={26} radius={0.64} depth={0.075} color="#2c4a45" markerColor="#ff7048" />
        </group>
        {/* Output drive axle */}
        <mesh position={[0.48, 0, -0.86]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 1.05, 18]} />
          <meshStandardMaterial color="#3c5450" metalness={0.72} roughness={0.25} />
        </mesh>
      </group>

      {/* 6. Wheel / Brake Output Disc */}
      <group position={[3.55, -0.86, -0.86]}>
        <group ref={wheelHubRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.74, 0.74, 0.12, 32]} />
            <meshStandardMaterial color="#d4deda" metalness={0.7} roughness={0.22} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.76, 0.12, 14, 36]} />
            <meshStandardMaterial color="#233231" metalness={0.25} roughness={0.72} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            return (
              <mesh key={i} position={[0.07, Math.cos(a) * 0.34, Math.sin(a) * 0.34]} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.04, 0.56, 0.08]} />
                <meshStandardMaterial color={i === 0 ? '#ff7048' : '#506460'} metalness={0.5} roughness={0.3} />
              </mesh>
            )
          })}
        </group>
        {/* Friction brake caliper (glows when friction brake covers regen shortfall) */}
        <mesh position={[0, 0.64, 0.12]}>
          <boxGeometry args={[0.24, 0.24, 0.3]} />
          <meshStandardMaterial
            color={frictionActive ? '#ff5930' : '#4a5a57'}
            emissive={frictionActive ? '#e0340b' : '#000000'}
            emissiveIntensity={frictionActive ? 0.95 : 0}
            metalness={0.45}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* ================= HV BATTERY PACK (2.1 kWh Li-ion) ================= */}
      <group position={[-1.95, -1.25, 0.35]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.62, 0.64, 0.92]} />
          <meshPhysicalMaterial color="#e2f2eb" transparent opacity={0.35} roughness={0.18} />
        </mesh>
        <lineSegments geometry={frameGeometries.battery}>
          <lineBasicMaterial color="#407a68" transparent opacity={0.65} />
        </lineSegments>
        {/* Dynamic SOC Fill Core */}
        <mesh position={[-0.72 + 0.72 * socRatio, 0, 0]}>
          <boxGeometry args={[1.44 * socRatio, 0.44, 0.7]} />
          <meshStandardMaterial
            color={snapshot.batterySoc < 0.35 ? '#ff8b47' : '#33c497'}
            emissive={battDischarging ? '#4da823' : battCharging ? '#1e75c7' : '#125946'}
            emissiveIntensity={battDischarging || battCharging ? 0.55 : 0.2}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* ================= DIRECTIONAL 3D ELECTRICAL POWER FLOW PULSES ================= */}
      {/* Generator -> Inverter / DC Bus */}
      <PowerPulseStream
        points={GEN_TO_DC_POINTS}
        powerKw={snapshot.flows.genToDcKw}
        direction={1}
        maxPowerKw={90}
        color="#816bf5"
        emissive="#5842d9"
      />

      {/* Inverter / DC Bus <-> Drive Motor (bidirectional: teal driving / blue regen) */}
      <PowerPulseStream
        points={DC_TO_MOTOR_POINTS}
        powerKw={motorLinePower}
        direction={motorLineDir}
        maxPowerKw={151}
        color={motorLineColor}
        emissive={motorLineEmissive}
      />

      {/* HV Battery <-> Inverter / DC Bus (bidirectional: lime discharge / blue charge) */}
      <PowerPulseStream
        points={BATT_TO_DC_POINTS}
        powerKw={battLinePower}
        direction={battLineDir}
        maxPowerKw={55}
        color={battLineColor}
        emissive={battLineEmissive}
      />

      {/* ================= FLOATING LABELS ================= */}
      <EPowerFloatingLabels t={t} />
    </group>
  )
}

export function EPower3D({ snapshot, t }: { snapshot: EPowerSnapshot; t: TFunction }) {
  return (
    <div className="three-wrap">
      <Canvas
        key="epower-3d-canvas"
        camera={{
          position: [
            EPOWER_CAMERA_CONFIG.position[0],
            EPOWER_CAMERA_CONFIG.position[1],
            EPOWER_CAMERA_CONFIG.position[2],
          ],
          fov: EPOWER_CAMERA_CONFIG.fov,
        }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.35} />
        <directionalLight position={[4, 6, 8]} intensity={2.1} castShadow />
        <pointLight position={[-6, -2, 5]} intensity={14} color="#d4fff2" />
        <EPowerAssembly snapshot={snapshot} t={t} />
        <ContactShadows position={[0, -2.55, 0]} opacity={0.24} scale={12} blur={2.6} />
        <Environment preset="studio" />
        <OrbitControls
          enablePan={false}
          minDistance={EPOWER_CAMERA_CONFIG.minDistance}
          maxDistance={EPOWER_CAMERA_CONFIG.maxDistance}
          autoRotate={false}
        />
      </Canvas>
      <div className="drag-hint">{t('epVisualScaleHint')} · {t('dragHint')}</div>
    </div>
  )
}
