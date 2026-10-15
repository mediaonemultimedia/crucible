/* Little flags as inline SVG (emoji flags don't draw on every system). */

const LEAF = 'M0,-9 L1.6,-5.4 L3.8,-6.4 L3,-2.2 L6.2,-3.4 L5.2,-1.2 L7.4,0.6 L3.4,2.2 L4.2,4.2 L0.5,3.6 L0.6,8 L-0.6,8 L-0.5,3.6 L-4.2,4.2 L-3.4,2.2 L-7.4,0.6 L-5.2,-1.2 L-6.2,-3.4 L-3,-2.2 L-3.8,-6.4 L-1.6,-5.4 Z';

export const FLAGS = {
  ca: `<svg viewBox="0 0 40 20" preserveAspectRatio="none" aria-label="Canada"><rect width="40" height="20" fill="#fff"/><rect width="10" height="20" fill="#d52b1e"/><rect x="30" width="10" height="20" fill="#d52b1e"/><path d="${LEAF}" transform="translate(20,10) scale(0.95)" fill="#d52b1e"/></svg>`,
  br: `<svg viewBox="0 0 40 28" preserveAspectRatio="none" aria-label="Brazil"><rect width="40" height="28" fill="#229e45"/><path d="M20,3 L37,14 L20,25 L3,14 Z" fill="#f8e509"/><circle cx="20" cy="14" r="6.6" fill="#2b49a3"/><path d="M13.6,12.6 Q20,10.6 26.4,15.2" stroke="#fff" stroke-width="1.3" fill="none"/></svg>`,
  gb: `<svg viewBox="0 0 60 30" preserveAspectRatio="none" aria-label="United Kingdom"><clipPath id="ukc"><rect width="60" height="30"/></clipPath><g clip-path="url(#ukc)"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" stroke-width="2.4"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#c8102e" stroke-width="6"/></g></svg>`,
};
