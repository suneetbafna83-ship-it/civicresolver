import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface DimensionalSpecModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function DimensionalSpecModal({
  isOpen,
  onClose,
}: DimensionalSpecModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cad-spec-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:p-6"
    >
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-black bg-white p-4 text-black shadow-2xl sm:p-6">
        {/* Top Modal Close Header */}
        <div className="mb-3 flex items-center justify-between">
          <span
            id="cad-spec-title"
            className="font-mono text-xs font-bold tracking-widest uppercase"
          >
            APPLE-STYLE MONOCHROME DIMENSIONAL DRAWING · UI-CIVIC-CARD-001
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dimensional specification sheet"
            className="press-feedback inline-flex items-center gap-1 rounded-lg border border-black bg-white px-2.5 py-1 text-xs font-bold text-black hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>CLOSE SHEET</span>
          </button>
        </div>

        {/* 1. HTML Title Block (strictly monochrome per dimensional-drawing skill) */}
        <div className="mb-4 overflow-hidden rounded-2xl border-[1.2px] border-black bg-white text-black">
          <div className="grid grid-cols-2 border-b-[0.8px] border-black sm:grid-cols-8">
            <div className="col-span-2 border-b-[0.8px] border-black p-3 sm:col-span-3 sm:border-r-[0.8px] sm:border-b-0">
              <div className="text-[10px] tracking-widest text-neutral-600 uppercase">
                COMPONENT ARCHITECTURE SPECIFICATION
              </div>
              <div className="mt-0.5 text-lg font-light tracking-wider uppercase">
                UI-CIVIC-CARD-001
              </div>
              <div className="text-[11px] text-neutral-700">
                CONCENTRIC CONTAINER, PROGRESS WELL &amp; ACTION SLOTS
              </div>
            </div>
            <div className="border-r-[0.8px] border-black p-2.5">
              <div className="text-[9.5px] text-neutral-500 uppercase">DWG NO.</div>
              <div className="mt-1 font-mono text-xs font-semibold">UI-CARD-001</div>
            </div>
            <div className="border-r-[0.8px] border-black p-2.5">
              <div className="text-[9.5px] text-neutral-500 uppercase">REV</div>
              <div className="mt-1 font-mono text-xs font-semibold">A.01</div>
            </div>
            <div className="border-r-[0.8px] border-black p-2.5">
              <div className="text-[9.5px] text-neutral-500 uppercase">SHEETS</div>
              <div className="mt-1 font-mono text-xs font-semibold">1 OF 1</div>
            </div>
            <div className="border-r-[0.8px] border-black p-2.5">
              <div className="text-[9.5px] text-neutral-500 uppercase">UNITS</div>
              <div className="mt-1 font-mono text-xs font-semibold">CSS PX</div>
            </div>
            <div className="p-2.5">
              <div className="text-[9.5px] text-neutral-500 uppercase">SCALE</div>
              <div className="mt-1 font-mono text-xs font-semibold">1.0 : 1</div>
            </div>
          </div>

          {/* General Notes + Key Variable Formulas */}
          <div className="grid grid-cols-1 border-b-[0.8px] border-black bg-neutral-50 p-3 text-[11px] sm:grid-cols-2 sm:gap-6">
            <div>
              <div className="font-bold tracking-wider uppercase">
                NOTES: (UNLESS OTHERWISE SPECIFIED)
              </div>
              <p className="mt-1 text-neutral-700">
                1. DO NOT SCALE DRAWING; ALL DIMENSIONS DERIVED FROM CSS TOKENS.
                2. SLOTS ARE CONTENT-INDEPENDENT PLACEHOLDERS (HUG / FLEX / FILL).
              </p>
            </div>
            <div>
              <p className="mt-1 text-neutral-700 sm:mt-4">
                3. CONCENTRIC INNER RADIUS FORMULA: R2 = R1 − B − S6 = 16 − 1 − 5 = 10 PX.
                4. HEADER MIN HEIGHT FORMULA: H1 = 2·S1 + H3 = 2·16 + 32 = 64 PX.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x-[0.8px] divide-black font-mono text-[11px] sm:grid-cols-6">
            <div className="p-2">W · card-w 480–740</div>
            <div className="p-2">R1 · r-outer 16</div>
            <div className="p-2">R2 · r-inner r1−b−s6=10</div>
            <div className="p-2">S1 · pad-outer 20</div>
            <div className="p-2">S6 · well-inset 5</div>
            <div className="p-2">H1 · hdr-min 2·s1+h3=64</div>
          </div>
        </div>

        {/* 2. SVG Drawing Sheet (viewBox 0 0 1700 1060) */}
        <div className="overflow-x-auto rounded-2xl border border-black bg-white p-2">
          <svg
            viewBox="0 0 1700 1060"
            className="w-full min-w-[1000px]"
            role="img"
            aria-label="Monochrome dimensional drawing sheet for UI-CIVIC-CARD-001"
          >
            <defs>
              <pattern
                id="cad-hatch-45"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#525252"
                  strokeWidth="0.7"
                />
              </pattern>
            </defs>

            {/* Sheet Outer Frame */}
            <rect
              x="12"
              y="12"
              width="1676"
              height="1036"
              rx="16"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="1.4"
            />

            {/* Top-Left Notes Block */}
            <g transform="translate(45, 50)" fontFamily="monospace" fontSize="11" fill="#171717">
              <text x="0" y="0" fontWeight="bold" fontSize="12" letterSpacing="1">
                ARCHITECTURAL NOTES &amp; CONSTRAINTS
              </text>
              <rect x="0" y="14" width="18" height="18" fill="none" stroke="#000" strokeWidth="0.8" />
              <text x="5" y="27">[1]</text>
              <text x="26" y="27">OUTER SHELL: R1 = 16 PX, BORDER B = 1 PX SOLID.</text>

              <rect x="0" y="40" width="18" height="18" fill="none" stroke="#000" strokeWidth="0.8" />
              <text x="5" y="53">[2]</text>
              <text x="26" y="53">INNER PROGRESS WELL: R2 = R1 - B - S6 = 10 PX.</text>

              <rect x="0" y="66" width="18" height="18" fill="none" stroke="#000" strokeWidth="0.8" />
              <text x="5" y="79">[3]</text>
              <text x="26" y="79">TOUCH TARGET FLOOR: T1 = 36 PX MIN HEIGHT.</text>

              <rect x="0" y="92" width="18" height="18" fill="none" stroke="#000" strokeWidth="0.8" />
              <text x="5" y="105">[4]</text>
              <text x="26" y="105">NUMERIC METRICS: TABULAR-NUMS ALIGNMENT MANDATORY.</text>
            </g>

            {/* Plan View (Top-Center) */}
            <g transform="translate(470, 50)" fontFamily="monospace" fill="#000000">
              <text x="0" y="0" fontWeight="bold" fontSize="12" letterSpacing="1.2">
                PLAN VIEW · UI-CIVIC-CARD-001
              </text>
              <text x="0" y="15" fontSize="9.5" fill="#525252">
                SCALE 1.0:1 · WIREFRAME SLOT ARCHITECTURE
              </text>

              {/* Horizontal Overall Dimension W */}
              <line x1="0" y1="40" x2="680" y2="40" stroke="#000" strokeWidth="0.7" />
              <line x1="0" y1="32" x2="0" y2="55" stroke="#000" strokeWidth="0.55" />
              <line x1="680" y1="32" x2="680" y2="55" stroke="#000" strokeWidth="0.55" />
              <text x="285" y="35" fontSize="11" fontWeight="bold">
                W = 480..740 (FILL)
              </text>

              {/* Outer Card Container */}
              <rect
                x="0"
                y="60"
                width="680"
                height="360"
                rx="16"
                fill="#ffffff"
                stroke="#000000"
                strokeWidth="1.6"
              />

              {/* Top Meta Row Slots */}
              <rect
                x="20"
                y="80"
                width="170"
                height="28"
                rx="6"
                fill="#f5f5f5"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="32" y="98" fontSize="9" letterSpacing="0.8">
                CATEGORY SLOT · HUG
              </text>

              <rect
                x="202"
                y="80"
                width="190"
                height="28"
                rx="14"
                fill="#f5f5f5"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="216" y="98" fontSize="9" letterSpacing="0.8">
                PRIORITY PILL · R4=H/2
              </text>

              <rect
                x="540"
                y="80"
                width="120"
                height="28"
                rx="6"
                fill="#f5f5f5"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="552" y="98" fontSize="9" letterSpacing="0.8">
                SLA SLOT · HUG
              </text>

              {/* Title & Description Slots */}
              <rect
                x="20"
                y="122"
                width="640"
                height="34"
                rx="6"
                fill="none"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="32" y="143" fontSize="9" letterSpacing="0.8">
                TITLE SLOT · FLEX · 16PX BOLD
              </text>

              <rect
                x="20"
                y="166"
                width="640"
                height="54"
                rx="6"
                fill="none"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="32" y="196" fontSize="9" letterSpacing="0.8">
                DESCRIPTION BODY SLOT · FILL · 65-75CH MEASURE
              </text>

              {/* Concentric Inner Progress Well (R2 = 10px) */}
              <rect
                x="20"
                y="236"
                width="640"
                height="112"
                rx="10"
                fill="#fafafa"
                stroke="#000"
                strokeWidth="1.2"
              />
              <text x="36" y="258" fontSize="9" fontWeight="bold" letterSpacing="0.8">
                CONCENTRIC PROGRESS WELL · R2 = R1 − B − S6 = 10 PX [2]
              </text>

              {/* 3-Step Segmented Track Bars */}
              <rect x="36" y="274" width="194" height="10" rx="5" fill="#171717" />
              <rect x="242" y="274" width="194" height="10" rx="5" fill="#737373" />
              <rect x="448" y="274" width="194" height="10" rx="5" fill="#e5e5e5" stroke="#000" strokeWidth="0.6" />

              <text x="36" y="304" fontSize="9">
                STEP 1: REPORTED
              </text>
              <text x="242" y="304" fontSize="9">
                STEP 2: IN PROGRESS
              </text>
              <text x="448" y="304" fontSize="9">
                STEP 3: RESOLVED
              </text>

              {/* Footer Action Bar */}
              <rect
                x="20"
                y="364"
                width="260"
                height="36"
                rx="6"
                fill="none"
                stroke="#000"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <text x="32" y="386" fontSize="9">
                REPORTER META SLOT · FLEX
              </text>

              <rect
                x="510"
                y="364"
                width="150"
                height="36"
                rx="8"
                fill="#ebebeb"
                stroke="#000"
                strokeWidth="1.0"
              />
              <text x="524" y="386" fontSize="9" fontWeight="bold">
                ACTION · T1=36PX [3]
              </text>
            </g>

            {/* Bottom-Left: Nested Corner Detail View (Scale 2.4:1) */}
            <g transform="translate(45, 520)" fontFamily="monospace" fill="#000000">
              <text x="0" y="0" fontWeight="bold" fontSize="12" letterSpacing="1.2">
                DETAIL A · CONCENTRIC CORNER GEOMETRY
              </text>
              <text x="0" y="15" fontSize="9.5" fill="#525252">
                SCALE 2.4:1 · SHARED ARC CENTER · R2 = R1 − B − S6
              </text>

              <rect
                x="0"
                y="30"
                width="360"
                height="240"
                rx="12"
                fill="#ffffff"
                stroke="#000"
                strokeWidth="1.0"
              />
              {/* Outer Corner Arc R1 */}
              <path
                d="M 60 220 L 60 110 A 50 50 0 0 1 110 60 L 290 60"
                fill="none"
                stroke="#000000"
                strokeWidth="2.0"
              />
              {/* Inner Well Corner Arc R2 */}
              <path
                d="M 88 220 L 88 110 A 22 22 0 0 1 110 88 L 290 88"
                fill="none"
                stroke="#000000"
                strokeWidth="1.3"
                strokeDasharray="6 3"
              />
              {/* Shared Arc Center Crosshair */}
              <line x1="102" y1="110" x2="118" y2="110" stroke="#000" strokeWidth="0.7" />
              <line x1="110" y1="102" x2="110" y2="118" stroke="#000" strokeWidth="0.7" />
              <circle cx="110" cy="110" r="2.5" fill="#000" />
              <text x="124" y="114" fontSize="10" fontWeight="bold">
                SHARED ORIGIN (R1=16, R2=10)
              </text>
              <text x="124" y="132" fontSize="10">
                INSET S6 = 5 PX · BORDER B = 1 PX
              </text>
            </g>

            {/* Bottom-Center: Exploded Layer Stack */}
            <g transform="translate(470, 520)" fontFamily="monospace" fill="#000000">
              <text x="0" y="0" fontWeight="bold" fontSize="12" letterSpacing="1.2">
                EXPLODED AXONOMETRIC · SURFACE STACK
              </text>
              <text x="0" y="15" fontSize="9.5" fill="#525252">
                Z-ORDER ELEVATION &amp; TRANSLUCENT HUD LAYERING
              </text>

              {/* Layer 1: Base Canvas */}
              <polygon
                points="40,220 340,180 620,230 320,270"
                fill="url(#cad-hatch-45)"
                stroke="#000"
                strokeWidth="1.0"
              />
              <text x="40" y="292" fontSize="10">
                L0: BASE CANVAS (#F8FAFC LIGHT / #0B0F17 DARK)
              </text>

              {/* Layer 2: Solid Card Surface */}
              <polygon
                points="40,155 340,115 620,165 320,205"
                fill="#ffffff"
                stroke="#000"
                strokeWidth="1.4"
              />
              <text x="40" y="142" fontSize="10" fontWeight="bold">
                L1: CARD CONTAINER (R1=16PX, 1PX HAIRLINE BORDER)
              </text>

              {/* Layer 3: Translucent Glass HUD */}
              <polygon
                points="40,90 340,50 620,100 320,140"
                fill="#f5f5f5"
                fillOpacity="0.82"
                stroke="#000"
                strokeWidth="1.2"
                strokeDasharray="5 3"
              />
              <text x="40" y="75" fontSize="10" fontWeight="bold">
                L2: FROSTED GLASS HUD (BACKDROP-BLUR 14PX, ALPHA 0.82)
              </text>
            </g>

            {/* Right Column: Variable Tables */}
            <g transform="translate(1220, 50)" fontFamily="monospace" fontSize="11" fill="#000000">
              <text x="0" y="0" fontWeight="bold" fontSize="12" letterSpacing="1.2">
                DIMENSION &amp; TOKEN TABLES
              </text>

              <rect x="0" y="16" width="420" height="360" fill="none" stroke="#000" strokeWidth="1.1" />
              <line x1="0" y1="44" x2="420" y2="44" stroke="#000" strokeWidth="0.9" />
              <text x="12" y="34" fontWeight="bold">CODE</text>
              <text x="90" y="34" fontWeight="bold">VARIABLE</text>
              <text x="250" y="34" fontWeight="bold">VALUE / FORMULA</text>

              {[
                ['S1', 'pad-container', '20 px'],
                ['S2', 'pad-inner-well', '14 px'],
                ['S3', 'gap-stack', '14 px'],
                ['S4', 'gap-inline', '8 px'],
                ['S6', 'inset-concentric', '5 px'],
                ['B', 'border-hairline', '1 px'],
                ['R1', 'radius-outer', '16 px'],
                ['R2', 'radius-inner', 'R1 − B − S6 = 10 px'],
                ['R3', 'radius-control', '8 px'],
                ['R4', 'radius-pill', 'H ÷ 2 (9999 px)'],
                ['H1', 'header-min-h', '2·S1 + H3 = 64 px'],
                ['T1', 'touch-target-min', '36 px'],
                ['W', 'card-width', '480–740 px (FILL)'],
              ].map(([code, variable, val], idx) => {
                const y = 68 + idx * 24;
                return (
                  <g key={code}>
                    <text x="12" y={y} fontWeight="bold">
                      {code}
                    </text>
                    <text x="90" y={y}>
                      {variable}
                    </text>
                    <text x="250" y={y}>
                      {val}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Footer Line inside Sheet */}
            <text
              x="45"
              y="1025"
              fontFamily="monospace"
              fontSize="10"
              fill="#525252"
              letterSpacing="1"
            >
              2026-11-21 | UI COMPONENT REFERENCE · MONOCHROME CAD SPECIFICATION
            </text>
            <text
              x="1320"
              y="1025"
              fontFamily="monospace"
              fontSize="10"
              fill="#525252"
              letterSpacing="1"
            >
              UI-CIVIC-CARD-001, ARCHITECTURE | SHEET 1
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
