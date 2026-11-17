import { useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from '../components/Sidebar'

const G = 6.6743e-11
const C = 299792458
const EARTH_MASS = 5.9722e24

function fmt(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits })
}

export function SimulationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mass, setMass] = useState(1)
  const [radius, setRadius] = useState(6371)
  const [rotation, setRotation] = useState(0.62)
  const [tilt, setTilt] = useState(0.82)
  const [showVectors, setShowVectors] = useState(true)

  const physics = useMemo(() => {
    const kg = mass * EARTH_MASS
    const metres = radius * 1000
    const gravity = G * kg / (metres * metres)
    const escape = Math.sqrt(2 * G * kg / metres)
    const schwarzschildKm = 2 * G * kg / (C * C) / 1000
    return { kg, gravity, escape, schwarzschildKm, earthGravity: gravity / 9.80665 }
  }, [mass, radius])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = rect.width
    const h = rect.height
    ctx.clearRect(0, 0, w, h)
    const cx = w * 0.5
    const cy = h * 0.55
    const scale = Math.min(w, h) * 0.31
    const depth = Math.min(1.25, 0.18 + Math.log10(mass + 1) * 0.2 + (6371 / radius) * 0.12)
    const wellWidth = 0.42 + Math.min(0.25, radius / 50000)
    const project = (x: number, y: number) => {
      const z = -depth * Math.exp(-(x * x + y * y) / (wellWidth * wellWidth))
      const xr = x * Math.cos(rotation) - y * Math.sin(rotation)
      const yr = x * Math.sin(rotation) + y * Math.cos(rotation)
      const y2 = yr * Math.cos(tilt) - z * Math.sin(tilt)
      const z2 = yr * Math.sin(tilt) + z * Math.cos(tilt)
      const perspective = 1.8 / (2.8 + z2 * 0.28)
      return { x: cx + xr * scale * perspective, y: cy + y2 * scale * perspective, z: z2 }
    }

    ctx.fillStyle = '#0b1425'
    ctx.fillRect(0, 0, w, h)
    const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, scale * 1.8)
    glow.addColorStop(0, 'rgba(40,103,190,.16)')
    glow.addColorStop(1, 'rgba(8,15,28,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    const lines = 18
    ctx.lineWidth = 1
    for (let row = 0; row <= lines; row++) {
      const fixed = -1.35 + row * 2.7 / lines
      for (let axis = 0; axis < 2; axis++) {
        ctx.beginPath()
        for (let step = 0; step <= 100; step++) {
          const moving = -1.35 + step * 2.7 / 100
          const p = axis === 0 ? project(moving, fixed) : project(fixed, moving)
          if (step === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = 'rgba(105,174,255,.42)'
        ctx.stroke()
      }
    }

    const center = project(0, 0)
    const planetSize = Math.max(9, Math.min(24, 11 + Math.log10(mass + 1) * 4))
    const planetGlow = ctx.createRadialGradient(center.x, center.y, 2, center.x, center.y, planetSize * 2.8)
    planetGlow.addColorStop(0, 'rgba(255,207,130,.6)')
    planetGlow.addColorStop(1, 'rgba(255,167,74,0)')
    ctx.fillStyle = planetGlow
    ctx.beginPath()
    ctx.arc(center.x, center.y, planetSize * 2.8, 0, Math.PI * 2)
    ctx.fill()
    const sphere = ctx.createRadialGradient(center.x - planetSize * .35, center.y - planetSize * .4, 1, center.x, center.y, planetSize)
    sphere.addColorStop(0, '#ffe0a6')
    sphere.addColorStop(.55, '#d68c48')
    sphere.addColorStop(1, '#683a38')
    ctx.fillStyle = sphere
    ctx.beginPath()
    ctx.arc(center.x, center.y, planetSize, 0, Math.PI * 2)
    ctx.fill()

    if (showVectors) {
      ctx.strokeStyle = 'rgba(255,190,104,.85)'
      ctx.fillStyle = 'rgba(255,190,104,.9)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6
        const start = project(Math.cos(a) * .58, Math.sin(a) * .58)
        const end = project(Math.cos(a) * .82, Math.sin(a) * .82)
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke()
        const angle = Math.atan2(end.y - start.y, end.x - start.x)
        ctx.beginPath(); ctx.moveTo(end.x, end.y)
        ctx.lineTo(end.x - 6 * Math.cos(angle - .45), end.y - 6 * Math.sin(angle - .45))
        ctx.lineTo(end.x - 6 * Math.cos(angle + .45), end.y - 6 * Math.sin(angle + .45))
        ctx.closePath(); ctx.fill()
      }
    }
    ctx.fillStyle = 'rgba(220,232,250,.75)'
    ctx.font = '12px system-ui'
    ctx.fillText('Malla espacial · curvatura visual normalizada', 16, 24)
  }, [mass, radius, rotation, tilt, showVectors])

  return <div className="app"><Sidebar /><main className="simulation-page">
    <header className="simulation-header"><div><span className="studio-kicker">LABORATORIO INTERACTIVO</span><h1>Simulación gravitatoria</h1><p>Explorá cómo cambian el campo gravitatorio y algunos parámetros orbitales al modificar la masa y el radio de un cuerpo.</p></div></header>
    <div className="simulation-layout">
      <section className="simulation-visual">
        <canvas ref={canvasRef} className="gravity-canvas" aria-label="Visualización tridimensional ilustrativa de una malla espacial curvada por un cuerpo masivo" />
        <div className="simulation-visual-controls">
          <label>Rotación <input type="range" min="-1.2" max="1.2" step="0.01" value={rotation} onChange={e => setRotation(Number(e.target.value))} /></label>
          <label>Inclinación <input type="range" min="0.25" max="1.35" step="0.01" value={tilt} onChange={e => setTilt(Number(e.target.value))} /></label>
          <label className="simulation-check"><input type="checkbox" checked={showVectors} onChange={e => setShowVectors(e.target.checked)} /> Mostrar vectores</label>
        </div>
      </section>
      <aside className="simulation-controls">
        <div className="simulation-card"><span className="section-eyebrow">CUERPO CELESTE</span><h2>Parámetros físicos</h2>
          <label className="lbl" htmlFor="sim-mass">Masa · masas terrestres</label><div className="simulation-value">{fmt(mass, 1)} M⊕</div>
          <input id="sim-mass" className="simulation-slider" type="range" min="0.1" max="1000" step="0.1" value={mass} onChange={e => setMass(Number(e.target.value))} />
          <label className="lbl" htmlFor="sim-radius">Radio · kilómetros</label><div className="simulation-value">{fmt(radius, 0)} km</div>
          <input id="sim-radius" className="simulation-slider" type="range" min="1000" max="100000" step="100" value={radius} onChange={e => setRadius(Number(e.target.value))} />
          <div className="simulation-presets"><button className="btn sm" onClick={() => {setMass(1);setRadius(6371)}}>Tierra</button><button className="btn sm" onClick={() => {setMass(317.8);setRadius(69911)}}>Júpiter</button><button className="btn sm" onClick={() => {setMass(0.107);setRadius(3389)}}>Marte</button></div>
        </div>
        <div className="simulation-card"><span className="section-eyebrow">RESULTADOS CALCULADOS</span><h2>Magnitudes</h2>
          <div className="simulation-metric"><span>Gravedad superficial</span><b>{fmt(physics.gravity, 3)} m/s²</b></div>
          <div className="simulation-metric"><span>Respecto a la Tierra</span><b>{fmt(physics.earthGravity, 2)} g</b></div>
          <div className="simulation-metric"><span>Velocidad de escape</span><b>{fmt(physics.escape / 1000, 2)} km/s</b></div>
          <div className="simulation-metric"><span>Radio de Schwarzschild</span><b>{fmt(physics.schwarzschildKm, 6)} km</b></div>
          <p className="simulation-note">Cálculos newtonianos para gravedad superficial y velocidad de escape. El radio de Schwarzschild es una referencia relativista. La curvatura de la malla es una representación visual normalizada, no una solución numérica de las ecuaciones de Einstein.</p>
        </div>
      </aside>
    </div>
  </main></div>
}
