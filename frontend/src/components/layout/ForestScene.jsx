import React from "react";

// Pine trees along the bottom: x position and height (fixed numbers, so the scene never "jumps")
const TREES = Array.from({ length: 52 }, (_, i) => ({
  x: i * 28 + (i % 4) * 6,
  height: 34 + ((i * 37) % 30),
}));

// Decorative hills, mist and pine trees drawn with SVG - no image files needed.
// Used behind the top bar, at the bottom of the sidebar and in the dashboard footer.
export default function ForestScene({ className = "" }) {
  return (
    <svg
      className={`forest-scene ${className}`}
      viewBox="0 0 1440 220"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* far and near hills */}
      <path d="M0 110 C 160 60 300 105 460 72 S 760 50 900 88 S 1200 60 1440 92 V220 H0Z" fill="#3c8a66" opacity="0.45" />
      <path d="M0 140 C 200 100 360 142 540 112 S 860 96 1040 132 S 1300 106 1440 126 V220 H0Z" fill="#2a7254" opacity="0.7" />
      {/* soft mist */}
      <path d="M0 160 C 240 140 480 170 720 152 S 1200 140 1440 158 V180 H0Z" fill="#ffffff" opacity="0.08" />
      <path d="M0 172 C 300 156 600 182 900 166 S 1300 160 1440 170 V220 H0Z" fill="#185a40" opacity="0.9" />
      {/* pine trees: two stacked triangles each */}
      {TREES.map(({ x, height }) => (
        <g key={x} fill="#0c3a29">
          <path d={`M${x} 220 L${x + 12} ${220 - height} L${x + 24} 220 Z`} />
          <path d={`M${x + 3} ${220 - height * 0.45} L${x + 12} ${220 - height - 10} L${x + 21} ${220 - height * 0.45} Z`} />
        </g>
      ))}
    </svg>
  );
}
