import type { SVGProps } from 'react'
const mk = (paths: string[], extra?: SVGProps<SVGSVGElement>) => (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`icon ${p.className ?? ''}`} aria-hidden="true" {...extra}>{paths.map((d, i) => <path key={i} d={d} />)}</svg>
)
export const Menu = mk(['M4 6h16M4 12h16M4 18h16'])
export const Plus = mk(['M12 5v14M5 12h14'])
export const Search = mk(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'])
export const Settings = mk(['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'])
export const LogOut = mk(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'])
export const ArrowUp = mk(['M12 19V5M5 12l7-7 7 7'])
export const Stop = (p: { className?: string }) => <svg viewBox="0 0 24 24" className={`icon solid ${p.className ?? ''}`} aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
export const Paperclip = mk(['M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9'])
export const Globe = mk(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'])
export const Mic = mk(['M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v3'])
export const Waves = mk(['M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4'])
export const Copy = mk(['M9 9h11v11H9zM5 15H4V4h11v1'])
export const Check = mk(['M5 12l5 5L20 7'])
export const Edit = mk(['M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4'])
export const Refresh = mk(['M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4'])
export const Trash = mk(['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'])
export const Pin = mk(['M12 17v5M8 3h8l-1 6 3 4H6l3-4-1-6z'])
export const X = mk(['M6 6l12 12M18 6L6 18'])
export const Play = mk(['M7 4l13 8-13 8z'])
export const Pause = mk(['M8 5v14M16 5v14'])
export const Volume = mk(['M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8'])
export const Shield = mk(['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z'])
export const File = mk(['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5'])
export const More = mk(['M5 12h.01M12 12h.01M19 12h.01'], { strokeWidth: 3 })
export const Back = mk(['M15 6l-6 6 6 6'])

export const ImageSearch = mk(['M4 5h16v14H4zM8 9h.01M20 15l-5-5-7 8', 'M16 4v-2M20 8h2']);

export const Home = mk(['M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6'])
export const FileText = mk(['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8 13h8M8 17h8'])
