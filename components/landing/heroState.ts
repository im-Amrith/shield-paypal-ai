// Shared between the scroll system (GSAP) and the 3D scene (R3F) without React re-renders.
// progress: 0 → 1 across the pinned hero. pointer: -1 → 1. active: hero on screen.
export const heroState = { progress: 0, pointerX: 0, pointerY: 0, active: true };
