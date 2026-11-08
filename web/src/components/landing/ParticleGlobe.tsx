import { useEffect, useRef, useState } from 'react'

/** Decorative 3D projection. No market data or trading signals are simulated. */
export default function ParticleGlobe({ zh }: { zh: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0,
      width = 0,
      height = 0,
      time = 0,
      last = 0,
      visible = true
    let pointerX = 0,
      pointerY = 0,
      x = 0,
      y = 0
    const points = Array.from({ length: 760 }, (_, i) => {
      const z = 1 - (2 * (i + 0.5)) / 760
      const r = Math.sqrt(1 - z * z),
        a = i * 2.3999632297
      return [Math.cos(a) * r, z, Math.sin(a) * r]
    })
    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      const radius = Math.min(width, height) * 0.295
      const cx = width / 2,
        cy = height / 2
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.7)
      glow.addColorStop(0, '#49e6ab18')
      glow.addColorStop(0.6, '#1bb48409')
      glow.addColorStop(1, '#0a111000')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
      const angle = time * 0.00013 + x * 0.28
      const tilt = -0.25 + y * 0.2
      const project = (px: number, py: number, pz: number) => {
        const a = px * Math.cos(angle) + pz * Math.sin(angle)
        const b = pz * Math.cos(angle) - px * Math.sin(angle)
        const c = py * Math.cos(tilt) - b * Math.sin(tilt)
        const d = b * Math.cos(tilt) + py * Math.sin(tilt)
        const scale = 3 / (3 - d)
        return {
          x: cx + a * radius * scale,
          y: cy + c * radius * scale,
          z: d,
          scale,
        }
      }
      // Orbital paths tilted in three dimensions.
      for (let orbit = 0; orbit < 3; orbit++) {
        ctx.beginPath()
        for (let j = 0; j <= 160; j++) {
          const a = (j / 160) * Math.PI * 2
          const p = project(
            Math.cos(a) * 1.5,
            Math.sin(a) * (0.22 + orbit * 0.3),
            Math.sin(a) * (1.4 - orbit * 0.35)
          )
          if (j === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = `rgba(105,221,180,${0.12 + orbit * 0.025})`
        ctx.lineWidth = 0.7
        ctx.stroke()
        const a = time * 0.00024 + orbit * 2.1
        const p = project(
          Math.cos(a) * 1.5,
          Math.sin(a) * (0.22 + orbit * 0.3),
          Math.sin(a) * (1.4 - orbit * 0.35)
        )
        ctx.shadowColor = '#8fffd4'
        ctx.shadowBlur = 15
        ctx.fillStyle = '#b2fadd'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      const count = width < 450 ? 430 : points.length
      points
        .slice(0, count)
        .map(([a, b, c], i) => {
          // Preserve full spherical coverage on small screens.
          const point = points[Math.floor((i * points.length) / count)]
          return project(point?.[0] ?? a, point?.[1] ?? b, point?.[2] ?? c)
        })
        .sort((a, b) => a.z - b.z)
        .forEach((p) => {
          ctx.fillStyle = `rgba(137,243,198,${0.18 + (p.z + 1) * 0.32})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.5, p.scale * 1.15), 0, Math.PI * 2)
          ctx.fill()
        })
      // Quiet distant particles add depth outside the sphere.
      for (let i = 0; i < 28; i++) {
        const px = (((i * 137.51) % 100) / 100) * width
        const py =
          ((((i * 73.7) % 100) / 100) * height + time * 0.002 * (1 + (i % 3))) %
          height
        ctx.fillStyle = `rgba(156,230,209,${0.12 + (i % 4) * 0.07})`
        ctx.fillRect(px, py, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1)
      }
    }
    const animate = (now: number) => {
      if (now - last >= 32) {
        time += Math.min(now - (last || now), 64)
        last = now
        x += (pointerX - x) * 0.05
        y += (pointerY - y) * 0.05
        draw()
      }
      frame = requestAnimationFrame(animate)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      last = 0
      draw()
      if (!paused && !reduced.matches && visible && !document.hidden)
        frame = requestAnimationFrame(animate)
    }
    const resize = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sync()
    })
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || reduced.matches || paused) return
      const r = canvas.getBoundingClientRect()
      pointerX = (e.clientX - r.left) / r.width - 0.5
      pointerY = (e.clientY - r.top) / r.height - 0.5
    }
    const leave = () => {
      pointerX = 0
      pointerY = 0
    }
    resize.observe(canvas)
    observer.observe(canvas)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    reduced.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      observer.disconnect()
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      reduced.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [paused])
  return (
    <div className={`guanlan-universe${paused ? ' is-paused' : ''}`}>
      <div className="universe-coordinate" aria-hidden="true">
        GUANLAN / MARKET UNIVERSE
      </div>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="universe-label universe-label-top" aria-hidden="true">
        <i />
        {zh ? '洞察市场脉动' : 'READ THE MOMENTUM'}
      </div>
      <div className="universe-label universe-label-bottom" aria-hidden="true">
        <span>◈</span>
        {zh ? '连接信号 · 看清趋势' : 'SIGNALS INTO PERSPECTIVE'}
      </div>
      <div className="universe-caption">
        <span>{zh ? '观澜 · 粒子视界' : 'GUANLAN · PARTICLE FIELD'}</span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
        >
          {paused
            ? zh
              ? '播放动效'
              : 'Play motion'
            : zh
              ? '暂停动效'
              : 'Pause motion'}
        </button>
      </div>
    </div>
  )
}
