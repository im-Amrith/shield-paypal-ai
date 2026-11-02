"use client";
/*
 * The hero's 3D scene. Loaded with next/dynamic (ssr: false) only on "/".
 * A faceted metal shield with an accent rim; a stream of small "payments" flowing through it.
 * Most pass and turn bright; a few accent-coloured ones are deflected with a short flash.
 * Scroll (heroState.progress) dollies the camera and splits the shield into three rings.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { heroState } from "./heroState";

export interface SceneColors { page: string; fg: string; muted: string; accent: string; light: boolean }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function shieldShape(scale = 1) {
  const s = new THREE.Shape();
  const p = (x: number, y: number) => [x * scale, y * scale] as const;
  s.moveTo(...p(0, 1.3));
  s.bezierCurveTo(...p(0.35, 1.12), ...p(0.75, 1.05), ...p(1.05, 1.05));
  s.lineTo(...p(1.0, 0.15));
  s.bezierCurveTo(...p(0.95, -0.6), ...p(0.5, -1.05), ...p(0, -1.42));
  s.bezierCurveTo(...p(-0.5, -1.05), ...p(-0.95, -0.6), ...p(-1.0, 0.15));
  s.lineTo(...p(-1.05, 1.05));
  s.bezierCurveTo(...p(-0.75, 1.05), ...p(-0.35, 1.12), ...p(0, 1.3));
  return s;
}

function checkShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.46, 0.02); s.lineTo(-0.12, -0.32); s.lineTo(0.5, 0.36); s.lineTo(0.38, 0.47);
  s.lineTo(-0.12, -0.08); s.lineTo(-0.34, 0.14); s.closePath();
  return s;
}

/** The shield: body, inset face, glowing check, and a rim plate behind that blooms. */
function Shield({ c }: { c: SceneColors }) {
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.26, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 2, curveSegments: 7 });
    g.center();
    return g;
  }, []);
  const face = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shieldShape(0.76), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1, curveSegments: 7 });
    g.center();
    return g;
  }, []);
  const check = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(checkShape(), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 1 });
    g.center();
    return g;
  }, []);
  // Glowing rim: a thin tube traced around the shield's outline.
  const rim = useMemo(() => {
    const pts = shieldShape(1.13).getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, p.y + 0.055, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, 0.018, 6, true);
  }, []);
  const glow = useMemo(() => new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.35), [c.accent, c.light]);
  const checkGlow = useMemo(() => new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.3), [c.accent, c.light]);

  return (
    <group>
      <mesh geometry={rim} position={[0, 0, -0.02]}>
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      <mesh geometry={body}>
        <meshPhysicalMaterial color={c.light ? "#dfe5ee" : "#34343a"} metalness={0.9} roughness={0.3} clearcoat={1} clearcoatRoughness={0.2} flatShading envMapIntensity={c.light ? 1.1 : 2.2} />
      </mesh>
      <mesh geometry={face} position={[0, 0, 0.27]}>
        <meshPhysicalMaterial color={c.light ? "#c9d3e2" : "#151518"} metalness={0.9} roughness={0.16} clearcoat={1} flatShading envMapIntensity={1.2} />
      </mesh>
      <mesh geometry={check} position={[0, 0.02, 0.39]}>
        <meshBasicMaterial color={checkGlow} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Instanced "payments" streaming left → right through the shield. */
function Payments({ c, count }: { c: SceneColors; count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3);
    const threat = new Uint8Array(count), state = new Uint8Array(count), flash = new Float32Array(count);
    return { pos, vel, threat, state, flash };
  }, [count]);
  const _m = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => ({
    in: new THREE.Color(c.muted).multiplyScalar(c.light ? 1 : 0.8),
    out: new THREE.Color(c.light ? c.fg : "#ffffff").multiplyScalar(c.light ? 1 : 0.85),
    bad: new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.3),
  }), [c]);

  const spawn = (i: number, scatter: boolean) => {
    const { pos, vel, threat, state, flash } = data;
    const lane = (Math.floor(Math.random() * 5) - 2) * 0.75;
    const x = scatter ? -11 + Math.random() * 20 : -10 - Math.random() * 4;
    const y = lane * 1.6 + (Math.random() - 0.5) * 1.1;
    const z = (Math.random() - 0.5) * 3;
    pos.set([x, y, z], i * 3);
    const speed = 2.1 + Math.random() * 1.2;
    // Aim at a point near the shield's centre so the streams converge on it.
    const tx = 0, ty = (Math.random() - 0.5) * 0.9, tz = (Math.random() - 0.5) * 0.4;
    const dx = tx - x, dy = ty - y, dz = tz - z, len = Math.hypot(dx, dy, dz) || 1;
    vel.set([dx / len * speed, dy / len * speed, dz / len * speed], i * 3);
    threat[i] = Math.random() < 0.09 ? 1 : 0;
    state[i] = scatter && x > 0 ? 1 : 0;
    flash[i] = 0;
    if (state[i] === 1) { vel[i * 3 + 1] = y * 0.25; }
  };

  useEffect(() => {
    for (let i = 0; i < count; i++) spawn(i, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 0.05);
    const { pos, vel, threat, state, flash } = data;
    const fade = 1 - smooth(0.25, 0.5, heroState.progress); // streams thin out as the shield splits
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      if (state[i] === 0 && pos[k] > -0.45 && Math.abs(pos[k + 1]) < 1.4) {
        if (threat[i]) {
          // Deflected: bounce back and away, with a short flash.
          state[i] = 2; flash[i] = 1;
          const up = pos[k + 1] >= 0 ? 1 : -1;
          vel[k] = -1.2 - Math.random(); vel[k + 1] = up * (1.8 + Math.random() * 1.4); vel[k + 2] = 0.6 + Math.random() * 1.4;
        } else {
          state[i] = 1;
          vel[k + 1] += pos[k + 1] * 0.9 + (Math.random() - 0.5) * 0.6; // fan out after passing
        }
      }
      if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 2.6);
      if (pos[k] > 11 || pos[k] < -15 || Math.abs(pos[k + 1]) > 8) spawn(i, false);

      const bad = threat[i] === 1;
      const s = (bad ? 1.35 : 1) * (1 + flash[i] * 3.2) * (state[i] === 2 ? 0.4 + 0.6 * flash[i] + 0.4 : 1) * (0.15 + 0.85 * fade);
      _m.position.set(pos[k], pos[k + 1], pos[k + 2]);
      _m.scale.setScalar(s);
      _m.updateMatrix();
      m.setMatrixAt(i, _m.matrix);
      m.setColorAt(i, bad ? col.bad : state[i] === 1 ? col.out : col.in);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.032, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

const PILLAR_RINGS = [
  { label: "Protect", r: 1.55, tilt: [1.2, 0.2, 0], speed: 0.35 },
  { label: "Get Paid", r: 1.95, tilt: [0.5, -0.9, 0.3], speed: -0.27 },
  { label: "Resolve", r: 2.35, tilt: [1.6, 0.8, -0.4], speed: 0.21 },
] as const;

/** Three orbiting rings that the shield splits into on scroll. */
function Rings({ c }: { c: SceneColors }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const nodes = useRef<(THREE.Group | null)[]>([]);
  const wrap = useRef<THREE.Group>(null);
  const label = useRef<(HTMLSpanElement | null)[]>([]);
  const ringCol = useMemo(() => new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.1), [c.accent, c.light]);
  const nodeCol = useMemo(() => new THREE.Color(c.light ? c.fg : "#ffffff"), [c.fg, c.light]);
  useFrame(({ clock }) => {
    const p = smooth(0.28, 0.62, heroState.progress);
    if (wrap.current) { wrap.current.visible = p > 0.001; wrap.current.scale.setScalar(0.35 + 0.65 * p); }
    PILLAR_RINGS.forEach((r, i) => {
      const g = groups.current[i];
      if (g) { g.rotation.set(r.tilt[0] * p + Math.PI / 2 * (1 - p), r.tilt[1] * p, r.tilt[2] * p + clock.elapsedTime * r.speed * 0.3); }
      const n = nodes.current[i];
      if (n) { const a = clock.elapsedTime * r.speed * 1.6 + i * 2; n.position.set(Math.cos(a) * r.r, Math.sin(a) * r.r, 0); }
      const l = label.current[i];
      if (l) l.style.opacity = String(smooth(0.45, 0.62, heroState.progress) * (1 - smooth(0.88, 0.98, heroState.progress)));
    });
  });
  return (
    <group ref={wrap} visible={false}>
      {PILLAR_RINGS.map((r, i) => (
        <group key={r.label} ref={(el) => { groups.current[i] = el; }}>
          <mesh>
            <torusGeometry args={[r.r, 0.012, 8, 160]} />
            <meshBasicMaterial color={ringCol} toneMapped={false} />
          </mesh>
          <group ref={(el) => { nodes.current[i] = el; }}>
            <mesh><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color={nodeCol} toneMapped={false} /></mesh>
            <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
              <span ref={(el) => { label.current[i] = el; }} className="ring-label">{r.label}</span>
            </Html>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Camera dolly + pointer tilt + the shield → rings handoff, all driven from heroState. */
function Rig({ c, wide, count, centered }: { c: SceneColors; wide: boolean; count: number; centered?: boolean }) {
  const stage = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const look = useMemo(() => new THREE.Vector3(), []);
  const tilt = useRef({ x: 0, y: 0 });

  useFrame(({ clock }, dt) => {
    const p = heroState.progress;
    const center = smooth(0.0, 0.35, p);
    // Shield sits right of the headline on wide screens, below it on phones; moves to centre on scroll.
    const baseX = centered ? 0 : wide ? 2.55 : 0, baseY = centered ? 0 : wide ? 0 : -1.4;
    // Phones get a smaller shield (and smaller rings, so they stay inside the narrow frame).
    const scale = centered ? 1 : wide ? 0.82 + 0.18 * center : 0.6 - 0.1 * center;
    if (stage.current) { stage.current.position.set(baseX * (1 - center), baseY * (1 - center), 0); stage.current.scale.setScalar(scale); }

    const a = -0.35 + p * 1.05;
    const r = 8.6 + p * 1.6;
    camera.position.set(Math.sin(a) * r, 0.35 + p * 1.2, Math.cos(a) * r);
    look.set(0, 0, 0);
    camera.lookAt(look);

    const k = 1 - Math.exp(-dt * 3);
    tilt.current.x += (heroState.pointerY * 0.22 - tilt.current.x) * k;
    tilt.current.y += (heroState.pointerX * 0.38 - tilt.current.y) * k;
    if (shield.current) {
      const split = smooth(0.28, 0.6, p);
      shield.current.rotation.set(tilt.current.x + Math.sin(clock.elapsedTime * 0.5) * 0.03, -0.42 + tilt.current.y + split * 1.4, 0);
      shield.current.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.05;
      shield.current.scale.setScalar(Math.max(0.0001, 1 - split));
      shield.current.visible = split < 0.999;
    }
  });

  return (
    <group ref={stage}>
      <group ref={shield}><Shield c={c} /></group>
      <Rings c={c} />
      <Payments c={c} count={count} />
    </group>
  );
}

export default function HeroScene({ colors, capture, onReady }: { colors: SceneColors; capture?: boolean; onReady?: () => void }) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [mobile] = useState(() => typeof window !== "undefined" && (window.innerWidth < 768 || matchMedia("(pointer: coarse)").matches));
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    // Pause rendering when the hero is off-screen (heroState.active is set by the scroll system).
    const id = setInterval(() => setRunning((was) => (was === heroState.active ? was : heroState.active)), 250);
    return () => { window.removeEventListener("resize", onResize); clearInterval(id); };
  }, []);

  return (
    <Canvas
      dpr={mobile ? 1 : [1, 1.5]}
      frameloop={running ? "always" : "never"}
      camera={{ position: [0, 0.35, 8.6], fov: 34, near: 0.1, far: 60 }}
      gl={{ antialias: !mobile, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!capture }}
      onCreated={() => onReady?.()}
    >
      <color attach="background" args={[colors.page]} />
      <ambientLight intensity={colors.light ? 0.7 : 0.15} />
      <pointLight position={[-2.5, 1.5, -2]} intensity={colors.light ? 6 : 14} color={colors.accent} distance={8} />
      <pointLight position={[3, 2, 4]} intensity={colors.light ? 10 : 5} color="#ffffff" distance={14} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 2, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.4} position={[3, -2, 4]} rotation-y={-0.6} scale={[3, 6, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.2} position={[-5, 0, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} color={colors.accent} />
        <Lightformer form="ring" intensity={0.8} position={[4, -1, 2]} scale={2} color="#ffffff" />
      </Environment>
      <Rig c={colors} wide={wide} count={capture ? 160 : mobile ? 80 : 170} centered={capture} />
      {!colors.light && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.25} intensity={mobile ? 1.1 : 1.45} radius={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
