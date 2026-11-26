/* The HUD's item icons and a few marks, as inline SVG (no emoji: the
   page must look the same on every machine, fonts or not).              */

const S = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const FEATHER = S(`<g transform="rotate(32 32 32)"><path d="M32 4C46 14 46 40 32 60C18 40 18 14 32 4Z" fill="#fff"/><path d="M32 6V62" stroke="#c9bfe0" stroke-width="2.5"/><path d="M32 18l-9 7M32 26l-10 7M32 34l-9 7M32 18l9 7M32 26l10 7M32 34l9 7" stroke="#d8cfee" stroke-width="1.6"/></g>`);

// Common sticker outline. The silhouette, then the colour, identifies the item.
const sticker = (body) => S(`<g stroke="#241730" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);

export const ICONS = {
  slick: sticker(`<path fill="#53c8e7" d="M5 46q3-10 14-7 4-8 13-4 9-4 14 2 11 0 13 8 4 10-24 10-29 0-30-9Z"/><path fill="#fff8ed" d="M17 36Q23 7 52 7q3 21-24 34l-8-1-7 10 0-6Z"/><path d="m20 40 22-23" stroke="#71a6cd" stroke-width="2"/><path d="M37 46h10" stroke="#cff9ff" stroke-width="2"/>`),
  missile: sticker(`<g transform="rotate(-21 32 32)"><path fill="#fff0d3" d="M12 17q20 5 36 0l6 4-1 23-6 4q-17-4-35 0l-5-6 1-20Z"/><path fill="#ff5865" d="M26 19h11v27H26Z"/><path d="M16 35h30" stroke="#f44467" stroke-width="7"/><path d="M14 25q6 1 9 0" stroke="#fff" stroke-width="2.6"/></g><path d="M5 52h9M6 59h11" stroke="#ffbc43" stroke-width="3.5"/>`),
  espresso: sticker(`<path fill="#ffb644" d="M45 26h6a8 8 0 0 1 0 16h-8V34h6a2 2 0 0 0 0-4h-4Z"/><path fill="#ffa33f" d="M11 23h35l-3 22q-1 9-14 9t-15-9Z"/><ellipse cx="28.6" cy="24" rx="17.5" ry="5.5" fill="#773726"/><path d="M22 16q4-6 0-11m11 11q4-6 0-11" fill="none" stroke="#fff0d3" stroke-width="4"/><path d="m28 33-5 8h7l-3 6 10-10h-7l3-4Z" fill="#fff4b3" stroke="none"/>`),
  cuffs: sticker(`<path fill="#ffd1e6" d="M27 28h10v12H27z"/><circle cx="18" cy="33" r="13" fill="#ff80bf"/><circle cx="46" cy="33" r="13" fill="#ff80bf"/><circle cx="18" cy="33" r="5" fill="#5e345b"/><circle cx="46" cy="33" r="5" fill="#5e345b"/><path d="M10 28q2-4 6-4m22 4q2-4 6-4" stroke="#ffe5f1" fill="none" stroke-width="2.5"/>`),
  case: sticker(`<path fill="#a38ae6" d="M11 12q22 5 42 0l-4 35q-1 8-17 8t-18-8Z"/><path fill="#f5ebff" d="M10 12q22 4 44 0l-1 10q-21 4-42 0Z"/><path d="M21 40q3-5 7 0m7 0q3-5 7 0M29 47h6" fill="none" stroke-width="2.5"/><path d="M19 28v6" stroke="#e2ceff" stroke-width="3"/>`),
  alarm: sticker(`<path fill="#ffc957" d="M7 21Q6 8 20 8l6 8m31 5Q58 8 44 8l-6 8M15 54l7-8m27 8-7-8"/><circle cx="32" cy="34" r="21" fill="#f06458"/><circle cx="32" cy="34" r="14" fill="#fff6d6"/><path d="M32 25v10l7 4" fill="none"/><circle cx="32" cy="34" r="1.6" fill="#242033" stroke="none"/>`),
  sugar: sticker(`<path d="m32 37 9 20q2 6-3 6l-10-23Z" fill="#fff5d4"/><circle cx="27" cy="25" r="20" fill="#ff6bae"/><path d="M12 23c3-14 25-15 29 0 3 11-14 17-20 8-4-7 8-12 10-5" fill="none" stroke="#fff3db" stroke-width="4.5"/><path d="M53 9v10m-5-5h10" stroke="#ffc958" stroke-width="3"/>`),
  plane: sticker(`<path fill="#eefaff" d="M5 27 58 9 36 55 26 36Z"/><path fill="#70bcf4" d="m26 36 32-27-40 23Z"/><path fill="#aad7f5" d="M26 36l10 19-3-18 25-28Z"/><path d="M8 43h9M11 51h10" stroke="#9ddcff" stroke-width="3"/>`),
  wash: sticker(`<path fill="#37bde2" d="M13 17h38l-4 35q-15 7-30 0Z"/><path fill="#9ceafd" d="M11 13h42v10H11Z"/><path fill="#e9ffff" d="M32 30q-9 8-9 13a9 9 0 0 0 18 0q0-5-9-13Z"/><path d="m17 9 4-5m27 5-4-5" stroke="#b4f9ff" stroke-width="3"/>`),
  spring: sticker(`<path fill="#cfc4f1" d="M20 32h24l-14 7 16 4-17 7h16v7H18v-7l14-6-15-4 12-6H20Z"/><path fill="#ffc65a" d="M11 18q21-9 42 0l3 10-4 6H12l-4-6Z"/><path d="M16 23q16-6 31 0" stroke="#fff4b8" fill="none" stroke-width="3"/><path d="M13 58h38" stroke="#92574c" stroke-width="5"/>`),
};

export const CLOCK_SCARE = S(`<circle cx="32" cy="36" r="22" fill="#e2463f"/><circle cx="32" cy="36" r="17" fill="#fff7e0"/><ellipse cx="25" cy="33" rx="3" ry="4.5" fill="#222"/><ellipse cx="39" cy="33" rx="3" ry="4.5" fill="#222"/><path d="M20 26l8 3M44 26l-8 3" stroke="#222" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="32" cy="44" rx="7" ry="5" fill="#7a1010"/><path d="M8 16a10 10 0 0 1 16-6M56 16a10 10 0 0 0-16-6" fill="#e9c349" stroke="#e9c349" stroke-width="3"/>`);
