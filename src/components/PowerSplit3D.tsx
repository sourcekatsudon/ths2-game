import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Html, OrbitControls } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { SimulationSnapshot } from '../simulation/model'
import { PRIUS } from '../simulation/model'
import type { TFunction } from '../i18n'

function gearShape(teeth: number, rootRadius: number, toothDepth: number) {
  const shape = new THREE.Shape()
  const steps = teeth * 4
  for (let i = 0; i <= steps; i += 1) {
    const angle = i / steps * Math.PI * 2
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

function Gear({ teeth, radius, depth, color, position = [0, 0, 0] }: { teeth: number; radius: number; depth: number; color: string; position?: [number, number, number] }) {
  const geometry = useMemo(() => {
    const shape = gearShape(teeth, radius - depth, depth)
    const hole = new THREE.Path()
    hole.absarc(0, 0, radius * 0.2, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.04, bevelSegments: 2 })
    g.center()
    return g
  }, [teeth, radius, depth])
  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={0.58} roughness={0.23} />
    </mesh>
  )
}

function RingGear({ ringRef }: { ringRef: React.RefObject<THREE.Group | null> }) {
  const teeth = useMemo(() => Array.from({ length: PRIUS.ringTeeth }), [])
  const stripes = useMemo(() => Array.from({ length: 12 }), [])
  return (
    <group ref={ringRef}>
      <mesh castShadow receiveShadow>
        <torusGeometry args={[3.0, 0.32, 12, 100]} />
        <meshStandardMaterial color="#99e4d0" metalness={0.48} roughness={0.2} transparent opacity={0.88} />
      </mesh>
      {teeth.map((_, i) => {
        const angle = i / PRIUS.ringTeeth * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(angle) * 2.66, Math.sin(angle) * 2.66, 0]} rotation={[0, 0, angle]} castShadow>
            <boxGeometry args={[0.19, 0.25, 0.5]} />
            <meshStandardMaterial
              color={i === 0 ? '#ff7048' : i % 6 === 0 ? '#caff45' : '#51c9ad'}
              emissive={i === 0 ? '#7a1608' : i % 6 === 0 ? '#365500' : '#000000'}
              emissiveIntensity={i === 0 || i % 6 === 0 ? 0.48 : 0}
              metalness={0.55}
              roughness={0.23}
            />
          </mesh>
        )
      })}
      {stripes.map((_, i) => {
        const angle = i / stripes.length * Math.PI * 2
        const primary = i === 0
        return (
          <mesh key={`stripe-${i}`} position={[Math.cos(angle) * 3.01, Math.sin(angle) * 3.01, 0.31]} rotation={[0, 0, angle]} castShadow>
            <boxGeometry args={[primary ? 0.18 : 0.09, primary ? 0.82 : 0.48, primary ? 0.16 : 0.1]} />
            <meshStandardMaterial
              color={primary ? '#ff5a34' : '#d4ff48'}
              emissive={primary ? '#9a2109' : '#456700'}
              emissiveIntensity={0.7}
              metalness={0.22}
              roughness={0.3}
            />
          </mesh>
        )
      })}
      <mesh position={[3.01, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.18, 0.42, 3]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff7048" emissiveIntensity={0.85} />
      </mesh>
    </group>
  )
}

function PlanetaryAssembly({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  const sun = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Group>(null)
  const carrier = useRef<THREE.Group>(null)
  const angleRef = useRef({ sun: 0, ring: 0, carrier: 0, planet: 0 })

  useFrame((_, delta) => {
    const maxDt = Math.min(delta, 0.05)
    const visualScale = 1 / 42
    const c = snapshot.engine.rpm * Math.PI / 30 * visualScale
    const s = snapshot.mg1.rpm * Math.PI / 30 * visualScale
    const r = snapshot.mg2.rpm * Math.PI / 30 * visualScale
    const localPlanet = -(PRIUS.sunTeeth / PRIUS.planetTeeth) * (s - c)
    angleRef.current.carrier += c * maxDt
    angleRef.current.sun += s * maxDt
    angleRef.current.ring += r * maxDt
    angleRef.current.planet += localPlanet * maxDt
    // Positive shaft speed is presented as clockwise in both the 3D view and the 2D comparator.
    if (carrier.current) carrier.current.rotation.z = -angleRef.current.carrier
    if (sun.current) sun.current.rotation.z = -angleRef.current.sun
    if (ring.current) ring.current.rotation.z = -angleRef.current.ring
    if (carrier.current) {
      carrier.current.children.forEach((child) => {
        if (child.userData.planet) child.rotation.z = -angleRef.current.planet
      })
    }
  })

  return (
    <group rotation={[-0.12, 0.18, -0.18]}>
      <RingGear ringRef={ring} />
      <group ref={sun}>
        <Gear teeth={PRIUS.sunTeeth} radius={1.02} depth={0.17} color="#6476ef" />
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.15]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 2.5, 24]} />
          <meshStandardMaterial color="#6476ef" metalness={0.5} roughness={0.25} />
        </mesh>
      </group>
      <group ref={carrier}>
        {[0, 1, 2].map((index) => {
          const a = index / 3 * Math.PI * 2
          return (
            <group key={index} position={[Math.cos(a) * 1.82, Math.sin(a) * 1.82, 0.02]} userData={{ planet: true }}>
              <Gear teeth={PRIUS.planetTeeth} radius={0.79} depth={0.16} color="#ff865f" />
              <mesh position={[0, 0, 0.32]}>
                <cylinderGeometry args={[0.16, 0.16, 0.72, 20]} />
                <meshStandardMaterial color="#f2a082" metalness={0.5} roughness={0.3} />
              </mesh>
            </group>
          )
        })}
        {[0, 1, 2].map((index) => {
          const a = index / 3 * Math.PI * 2
          return (
            <mesh key={'arm-' + index} position={[Math.cos(a) * 0.94, Math.sin(a) * 0.94, 0.52]} rotation={[0, 0, a]}>
              <boxGeometry args={[2.05, 0.18, 0.16]} />
              <meshStandardMaterial color="#e8a58e" metalness={0.45} roughness={0.3} />
            </mesh>
          )
        })}
        <mesh position={[0, 0, 1.23]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 2.5, 24]} />
          <meshStandardMaterial color="#ff7048" metalness={0.5} roughness={0.25} />
        </mesh>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.55]}>
        <cylinderGeometry args={[3.4, 3.4, 0.09, 96]} />
        <meshPhysicalMaterial color="#c6f2e7" transmission={0.25} transparent opacity={0.13} roughness={0.1} />
      </mesh>
      <Html position={[-1.1, 3.35, 0]} center distanceFactor={10}><span className="three-label mg2-label">{t('ring')} · MG2 / {t('outputShort')}</span></Html>
      <Html position={[-0.1, 0.3, 1.3]} center distanceFactor={10}><span className="three-label mg1-label">{t('sun')} · MG1</span></Html>
      <Html position={[2.1, -2.2, 1.2]} center distanceFactor={10}><span className="three-label engine-label">{t('carrier')} · {t('engine')}</span></Html>
    </group>
  )
}

export function PowerSplit3D({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  return (
    <div className="three-wrap">
      <Canvas camera={{ position: [1.8, -1.8, 10.8], fov: 40 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[4, 5, 8]} intensity={2.1} castShadow />
        <pointLight position={[-6, -2, 5]} intensity={14} color="#d4fff2" />
        <PlanetaryAssembly snapshot={snapshot} t={t} />
        <ContactShadows position={[0, -4.3, -0.7]} opacity={0.25} scale={10} blur={2.8} />
        <Environment preset="studio" />
        <OrbitControls enablePan={false} minDistance={7.5} maxDistance={13} autoRotate={false} />
      </Canvas>
      <div className="drag-hint">{t('dragHint')}</div>
    </div>
  )
}
