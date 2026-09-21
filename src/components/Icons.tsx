interface P { size?: number }
const s = (n = 18) => ({
  width: n, height: n, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export const Cursor = ({ size }: P) => <svg {...s(size)}><path d="m4 3 7 17 2.5-6.5L20 11z" /></svg>
export const TypeIcon = ({ size }: P) => <svg {...s(size)}><path d="M4 6V4h16v2M12 4v16M9 20h6" /></svg>
export const Square = ({ size }: P) => <svg {...s(size)}><rect x="4" y="5" width="16" height="14" rx="2" /></svg>
export const Circle = ({ size }: P) => <svg {...s(size)}><ellipse cx="12" cy="12" rx="8" ry="7" /></svg>
export const LineIcon = ({ size }: P) => <svg {...s(size)}><path d="M5 19 19 5" /></svg>
export const ArrowIcon = ({ size }: P) => <svg {...s(size)}><path d="M5 19 19 5M19 5h-6M19 5v6" /></svg>
export const Pen = ({ size }: P) => <svg {...s(size)}><path d="M3 21c3 .5 5-1 6-3M5 18c0-6 6-13 11-13 3 0 4 3 1 6-4 4-9 4-12 7Z" /></svg>
export const Marker = ({ size }: P) => <svg {...s(size)}><path d="M4 20h16M6 16l8-10 4 3-8 10z" /></svg>
export const ImageIcon = ({ size }: P) => <svg {...s(size)}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m4 17 5-4 4 3 3-2 4 3" /></svg>
export const SignIcon = ({ size }: P) => <svg {...s(size)}><path d="M3 18c4 0 3-11 6-11s2 8 4 8 2-4 4-4 2 3 4 3" /><path d="M3 21h18" /></svg>
export const CropIcon = ({ size }: P) => <svg {...s(size)}><path d="M6 2v16h16M2 6h16v16" /></svg>
export const Undo = ({ size }: P) => <svg {...s(size)}><path d="M3 8h11a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4" /></svg>
export const Redo = ({ size }: P) => <svg {...s(size)}><path d="M21 8H10a5 5 0 0 0 0 10h6M21 8l-4-4M21 8l-4 4" /></svg>
export const RotateCw = ({ size }: P) => <svg {...s(size)}><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
export const RotateCcw = ({ size }: P) => <svg {...s(size)}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /></svg>
export const Trash = ({ size }: P) => <svg {...s(size)}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
export const Copy = ({ size }: P) => <svg {...s(size)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
export const Plus = ({ size }: P) => <svg {...s(size)}><path d="M12 5v14M5 12h14" /></svg>
export const Download = ({ size }: P) => <svg {...s(size)}><path d="M12 3v12M7 11l5 5 5-5M4 20h16" /></svg>
export const Scissors = ({ size }: P) => <svg {...s(size)}><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M8 7.8 20 18M20 6 8 16.2" /></svg>
export const FilePlus = ({ size }: P) => <svg {...s(size)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></svg>
export const ZoomIn = ({ size }: P) => <svg {...s(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></svg>
export const ZoomOut = ({ size }: P) => <svg {...s(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></svg>
export const Front = ({ size }: P) => <svg {...s(size)}><rect x="3" y="3" width="13" height="13" rx="2" /><path d="M8 21h11a2 2 0 0 0 2-2V8" /></svg>
export const Back = ({ size }: P) => <svg {...s(size)}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 3H5a2 2 0 0 0-2 2v11" /></svg>
export const Lock = ({ size }: P) => <svg {...s(size)}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
export const Sun = ({ size }: P) => <svg {...s(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
export const Moon = ({ size }: P) => <svg {...s(size)}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>
export const Link = ({ size }: P) => <svg {...s(size)}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
export const Unlink = ({ size }: P) => <svg {...s(size)}><path d="M16 8l2-2a5 5 0 0 0-7-7l-2 2" /><path d="M8 16l-2 2a5 5 0 0 0 7 7l2-2" /><path d="M3 3l18 18" /></svg>
export const Reset = ({ size }: P) => <svg {...s(size)}><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5" /></svg>
