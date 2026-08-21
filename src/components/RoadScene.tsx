import { useEffect, useRef, useState } from 'react'
import { CloudSun, Flag, MapPin, Mountain, Route } from 'lucide-react'
import { roadGradeAt, type SimulationSnapshot, terrainAt, ROAD_SEGMENT_M } from '../simulation/model'
import { modeTranslationKey, terrainTranslationKey, type TFunction } from '../i18n'

const PX_PER_M = 4.1
const Y_PER_M = 6.2

interface RoadPoint { x: number; y: number; distance: number }

function buildRoad(distance: number, viewWidth: number, carX: number) {
  const startDistance = distance - carX / PX_PER_M
  const points: RoadPoint[] = []
  let y = 112
  const stepM = 3
  for (let d = startDistance, x = 0; x <= viewWidth + 20; d += stepM, x += stepM * PX_PER_M) {
    points.push({ x, y, distance: d })
    y -= roadGradeAt(d) * stepM * Y_PER_M
  }
  const carIndex = points.reduce((best, point, i) => Math.abs(point.distance - distance) < Math.abs(points[best].distance - distance) ? i : best, 0)
  const offset = 123 - points[carIndex].y
  points.forEach((point) => { point.y += offset })
  return points
}

function PriusCar({ x, y, angle, wheelAngle }: { x: number; y: number; angle: number; wheelAngle: number }) {
  return (
    <g className="road-car" transform={`translate(${x - 76} ${y - 61}) rotate(${-angle} 76 61)`}>
      <ellipse cx="75" cy="64" rx="75" ry="8" fill="rgba(11,23,24,.13)" />
      <path d="M13 40 C27 36 34 21 51 14 C67 8 99 9 115 20 L132 36 C143 38 150 43 151 51 L148 57 L7 57 C5 50 6 43 13 40Z" fill="#f8faf8" stroke="#122022" strokeWidth="2.3" />
      <path d="M48 17 C61 12 91 12 105 19 L117 34 L32 34 C36 27 40 21 48 17Z" fill="#263c42" />
      <path d="M76 14 L76 34" stroke="#95aaa7" strokeWidth="1.5" />
      <path d="M77 14 C90 14 100 16 106 20 L116 33 L79 33Z" fill="#a7e0d4" opacity=".62" />
      <path d="M49 17 C57 14 65 14 73 14 L73 33 L34 33 C39 25 42 20 49 17Z" fill="#c6ebe3" opacity=".7" />
      <path d="M14 40 L32 35 L128 35 L140 40" fill="none" stroke="#c8d4d1" strokeWidth="1.2" />
      <path d="M8 50 L24 48" stroke="#d0ff47" strokeWidth="4" />
      <path d="M136 43 L149 45" stroke="#ff6a47" strokeWidth="4" />
      <path d="M60 38 L83 38" stroke="#b7c5c1" strokeWidth="1" />
      {[35, 119].map((cx) => (
        <g key={cx} transform={`translate(${cx} 57) rotate(${wheelAngle})`}>
          <circle r="13" fill="#162426" stroke="#fff" strokeWidth="3" />
          <circle r="7" fill="#879794" />
          <path d="M0-6V6M-6 0H6M-4-4L4 4M4-4L-4 4" stroke="#dbe3e1" strokeWidth="1" />
        </g>
      ))}
      <rect x="61" y="43" width="32" height="8" rx="4" fill="#c7ff45" />
      <text x="77" y="49.5" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#1a2827">THS LAB</text>
    </g>
  )
}

export function RoadScene({ snapshot, t }: { snapshot: SimulationSnapshot; t: TFunction }) {
  const stageRef = useRef<HTMLElement>(null)
  const [viewWidth, setViewWidth] = useState(1200)
  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setViewWidth(Math.max(420, rect.width / Math.max(1, rect.height) * 220))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const carX = viewWidth * 0.23
  const points = buildRoad(snapshot.distance, viewWidth, carX)
  const roadLine = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const ground = `M ${points[0].x},${points[0].y} L ${points.slice(1).map((point) => `${point.x},${point.y}`).join(' L ')} L ${viewWidth},220 L 0,220 Z`
  const carPoint = points.reduce((best, point) => Math.abs(point.x - carX) < Math.abs(points[best].x - carX) ? points.indexOf(point) : best, 0)
  const carY = points[carPoint]?.y ?? 123
  const roadAngle = Math.atan(snapshot.grade) * 180 / Math.PI
  const wheelAngle = (snapshot.distance / (2 * Math.PI * 0.285) * 360) % 360
  const currentSegment = Math.floor(snapshot.distance / ROAD_SEGMENT_M)
  const boundaryDistance = (currentSegment + 1) * ROAD_SEGMENT_M
  const boundaryX = carX + (boundaryDistance - snapshot.distance) * PX_PER_M
  const boundaryPoint = points.reduce((best, point) => Math.abs(point.x - boundaryX) < Math.abs(points[best].x - boundaryX) ? points.indexOf(point) : best, 0)
  const boundaryY = points[boundaryPoint]?.y ?? 100
  const nextKind = terrainAt(boundaryDistance + 0.1)

  return (
    <section ref={stageRef} className="road-stage" aria-label="走行シミュレーション">
      <div className="stage-chrome">
        <div className="drive-mode"><span className={`status-pulse ${snapshot.engineOn ? 'hot' : ''}`} />{t(modeTranslationKey[snapshot.mode])}</div>
        <div className="terrain-chip"><Mountain size={13} /> {t(terrainTranslationKey[snapshot.terrain])} <b>{snapshot.grade >= 0 ? '+' : ''}{(snapshot.grade * 100).toFixed(1)}%</b></div>
      </div>
      <svg className="road-svg" viewBox={`0 0 ${viewWidth} 220`} preserveAspectRatio="none" role="img" aria-label={t(terrainTranslationKey[snapshot.terrain])}>
        <defs>
          <linearGradient id="groundFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d8e3dd" />
            <stop offset="1" stopColor="#a9bbb2" />
          </linearGradient>
          <pattern id="roughPattern" width="16" height="12" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="3" r="1" fill="#71847b" opacity=".25" />
            <circle cx="12" cy="8" r="1.4" fill="#71847b" opacity=".2" />
          </pattern>
        </defs>
        <path d={`M0 78 C${viewWidth * .14} 25 ${viewWidth * .23} 70 ${viewWidth * .35} 47 S${viewWidth * .6} 74 ${viewWidth * .72} 40 S${viewWidth * .9} 55 ${viewWidth} 24 L${viewWidth} 160 L0 160Z`} fill="#d8e6df" opacity=".58" />
        <path d={`M0 92 C${viewWidth * .16} 55 ${viewWidth * .3} 89 ${viewWidth * .44} 60 S${viewWidth * .72} 100 ${viewWidth} 54 L${viewWidth} 180 L0 180Z`} fill="#c2d2ca" opacity=".75" />
        <path d={ground} fill="url(#groundFill)" />
        <path d={ground} fill="url(#roughPattern)" />
        <polyline points={roadLine} fill="none" stroke="#243536" strokeWidth="14" strokeLinejoin="round" />
        <polyline points={roadLine} fill="none" stroke="#f7f9f7" strokeWidth="8" strokeLinejoin="round" />
        <polyline points={roadLine} fill="none" stroke="#bcc9c4" strokeWidth="1.2" strokeDasharray="18 15" />
        {boundaryX > carX + 80 && boundaryX < viewWidth - 45 && (
          <g transform={`translate(${boundaryX} ${boundaryY - 31})`}>
            <line y1="0" y2="29" stroke="#364745" strokeWidth="1" strokeDasharray="3 3" />
            <rect x="-34" y="-18" width="68" height="19" rx="9.5" fill="#172727" />
            <text x="0" y="-5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">{t(terrainTranslationKey[nextKind])}</text>
          </g>
        )}
        <PriusCar x={carX} y={carY} angle={roadAngle} wheelAngle={wheelAngle} />
      </svg>
      <div className="speed-readout">
        <span>{snapshot.speedKph.toFixed(0)}</span><small>km/h</small>
        <div className="speed-bar"><i style={{ width: `${Math.min(100, snapshot.speedKph / 1.6)}%` }} /></div>
      </div>
      <div className="route-readout">
        <div><Route size={15} /><span><b>{(snapshot.distance / 1000).toFixed(2)}</b> km</span></div>
        <div><Flag size={15} /><span>{t('nextSurfaceIn')} <b>{snapshot.nextTerrainDistance.toFixed(0)}</b> m</span></div>
      </div>
      <div className="weather-mark"><CloudSun size={17} /><span>{t('dry')} · 22°C</span></div>
      <div className="location-mark"><MapPin size={12} /> {t('testCourse')}</div>
    </section>
  )
}
