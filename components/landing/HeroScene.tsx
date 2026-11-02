"use client";
/*
 * The hero's 3D scene. Loaded with next/dynamic (ssr: false) only on "/".
 *
 * Shot like a product render, not a logo: a long lens (fov 22), studio light (two strip lights and a
 * softbox baked into an environment map), and real materials. The shield is three machined layers:
 *   front  a glass lens with a lit check under it        → Protect
 *   middle a brushed, anodized body with a coloured edge  → Get Paid
 *   back   a raw titanium plate                           → Resolve
 * Payments are long-exposure light trails that slide past (and refract through the glass). A few
 * accent-coloured ones hit the shield's edge: the trail collapses into the impact, which flashes and
 * briefly lights the anodized rim.
 *
 * Scroll (heroState.progress): the shield moves to the centre and turns to three-quarter view, the
 * layers pull apart into an exploded view with labelled callouts, then click back together
 * ("One set of rules") before the canvas fades out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import { EffectComposer, Bloom, Noise, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { heroState } from "./heroState";

export interface SceneColors { page: string; fg: string; muted: string; accent: string; light: boolean }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const backOut = (t: number, s = 2.2) => { const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ---------------------------------------------------------------- geometry */

/** Heater-shield outline with softened shoulders. Units: about 2 wide, 2.7 tall. */
function shieldShape(scale = 1) {
  const s = new THREE.Shape();
  const P = (x: number, y: number) => [x * scale, y * scale] as const;
  s.moveTo(...P(0, 1.27));
  s.bezierCurveTo(...P(0.34, 1.1), ...P(0.62, 1.04), ...P(0.9, 1.05));
  s.quadraticCurveTo(...P(1.02, 1.055), ...P(1.02, 0.93));
  s.bezierCurveTo(...P(1.03, 0.55), ...P(1.02, 0.3), ...P(1.0, 0.08));
  s.bezierCurveTo(...P(0.95, -0.62), ...P(0.52, -1.05), ...P(0, -1.38));
  s.bezierCurveTo(...P(-0.52, -1.05), ...P(-0.95, -0.62), ...P(-1.0, 0.08));
  s.bezierCurveTo(...P(-1.02, 0.3), ...P(-1.03, 0.55), ...P(-1.02, 0.93));
  s.quadraticCurveTo(...P(-1.02, 1.055), ...P(-0.9, 1.05));
  s.bezierCurveTo(...P(-0.62, 1.04), ...P(-0.34, 1.1), ...P(0, 1.27));
  return s;
}

function extrude(scale: number, depth: number, bevel: number, segs: number) {
  const g = new THREE.ExtrudeGeometry(shieldShape(scale), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 48 });
  g.center();
  return g; // groups: 0 = front/back caps, 1 = sides + bevels
}

/** Brushed-metal roughness map: fine horizontal streaks, drawn once on a canvas. */
function brushedTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgb(150,150,150)";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 110 + Math.random() * 90;
    x.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.35})`;
    x.fillRect(Math.random() * 512 - 100, Math.random() * 512, 60 + Math.random() * 380, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.9, 0.9);
  t.anisotropy = 8;
  return t;
}

/* Layer offsets along the shield's local z when assembled. */
const Z_GLASS = 0.27, Z_BACK = -0.3;

/*
 * Exploded-view callouts. `anchor` is where the leader starts, in the layer's own space; `offset` is where
 * the label sits relative to it, in px at 1440 wide (scaled down on smaller screens), so every label lands
 * in clear space instead of on top of another layer.
 */
export const LAYERS = [
  { key: "glass", label: "Protect", sub: "Scam check · Vault escrow · Guardian", side: "r", anchor: [0.7, 0.62, 0.06], offset: [80, -36] },
  { key: "body", label: "Get Paid", sub: "Collections · FX copilot · Hold explainer", side: "l", anchor: [-0.3, -0.95, 0.2], offset: [-270, 96] },
  { key: "back", label: "Resolve", sub: "Triage · Resolution agent · Human console", side: "l", anchor: [-1.0, 0.86, -0.04], offset: [-80, -36] },
] as const;

type Layers = { glass: THREE.Group | null; body: THREE.Group | null; back: THREE.Group | null };

function Shield({ c, layers, mobile, flash }: { c: SceneColors; layers: React.RefObject<Layers>; mobile: boolean; flash: React.RefObject<THREE.PointLight | null> }) {
  const body = useMemo(() => extrude(1, 0.3, 0.07, 6), []);
  const back = useMemo(() => extrude(1.07, 0.06, 0.03, 4), []);
  const glass = useMemo(() => extrude(0.8, 0.05, 0.06, 6), []);
  // The check is a light guide: a tube along a bent path, with rounded ends.
  const check = useMemo(() => {
    const a = new THREE.Vector3(-0.34, 0.02, 0), b = new THREE.Vector3(-0.1, -0.24, 0), d = new THREE.Vector3(0.38, 0.3, 0);
    const path = new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(a, b)); path.add(new THREE.LineCurve3(b, d));
    return { tube: new THREE.TubeGeometry(path, 64, 0.045, 12, false), ends: [a, d] };
  }, []);
  // A thin polished bezel around the lens, so the glass layer still reads when it stands on its own.
  const bezel = useMemo(() => {
    const pts = shieldShape(0.8 + 0.06).getSpacedPoints(220).map((p) => new THREE.Vector3(p.x, p.y + 0.012, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 300, 0.022, 10, true);
  }, []);
  const brushed = useMemo(() => brushedTexture(), []);
  useEffect(() => () => { body.dispose(); back.dispose(); glass.dispose(); bezel.dispose(); check.tube.dispose(); brushed.dispose(); }, [body, back, glass, bezel, check, brushed]);

  const accent = useMemo(() => new THREE.Color(c.accent), [c.accent]);

  return (
    <group>
      {/* Back plate: raw titanium. */}
      <group ref={(g) => { layers.current.back = g; }} position={[0, 0, Z_BACK]}>
        <mesh geometry={back}>
          <meshPhysicalMaterial attach="material-0" color="#a9afb8" metalness={1} roughness={0.55} roughnessMap={brushed} envMapIntensity={c.light ? 1 : 1.5} />
          <meshPhysicalMaterial attach="material-1" color="#a3a9b1" metalness={1} roughness={0.3} envMapIntensity={c.light ? 1 : 1.4} />
        </mesh>
      </group>

      {/* Body: dark brushed face, anodized accent edge. The impact light lives here so it lights the rim. */}
      <group ref={(g) => { layers.current.body = g; }}>
        <mesh geometry={body}>
          <meshPhysicalMaterial attach="material-0" color={c.light ? "#2b2e34" : "#1d1e22"} metalness={1} roughness={0.72} roughnessMap={brushed} clearcoat={0.35} clearcoatRoughness={0.35} envMapIntensity={1.3} />
          <meshPhysicalMaterial attach="material-1" color={accent} metalness={1} roughness={0.24} clearcoat={0.6} clearcoatRoughness={0.15} envMapIntensity={1.7} />
        </mesh>
        <group position={[0, 0.02, 0.215]}>
          <mesh geometry={check.tube}>
            <meshStandardMaterial color="#000" emissive={accent} emissiveIntensity={c.light ? 1.4 : 2.6} toneMapped={false} />
          </mesh>
          {check.ends.map((p, i) => (
            <mesh key={i} position={p}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#000" emissive={accent} emissiveIntensity={c.light ? 1.4 : 2.6} toneMapped={false} /></mesh>
          ))}
          {/* Light spill from the check onto the brushed face. */}
          <pointLight color={accent} intensity={c.light ? 0.6 : 1.2} distance={1.4} decay={2} position={[0, 0, 0.12]} />
        </group>
        <pointLight ref={flash} color={accent} intensity={0} distance={2.6} decay={2} />
      </group>

      {/* Front: glass lens. Real transmission on desktop; the cheaper built-in one on phones. */}
      <group ref={(g) => { layers.current.glass = g; }} position={[0, 0, Z_GLASS]}>
        <mesh geometry={bezel}>
          <meshPhysicalMaterial color="#d4d8de" metalness={1} roughness={0.16} envMapIntensity={c.light ? 1.2 : 1.8} />
        </mesh>
        <mesh geometry={glass}>
          {mobile ? (
            <meshPhysicalMaterial color="#ffffff" transmission={1} thickness={0.22} roughness={0} ior={1.48} envMapIntensity={1} transparent />
          ) : (
            <MeshTransmissionMaterial samples={6} resolution={1024} thickness={0.22} roughness={0} ior={1.48} chromaticAberration={0.05} anisotropicBlur={0} distortion={0} attenuationColor="#ffffff" color="#ffffff" backside={false} envMapIntensity={1} />
          )}
        </mesh>
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- light trails */

const trailVert = /* glsl */ `
  attribute vec4 aCol;
  uniform float uCopy;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    vUv = uv; vCol = aCol;
    vec4 clip = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    // Dim trails over the headline (left half on wide screens) while the copy is up.
    float sx = clip.x / clip.w;
    vCol.a *= 1.0 - uCopy * 0.8 * (1.0 - smoothstep(-0.35, 0.15, sx));
    gl_Position = clip;
  }
`;
// uv.x: 0 = tail, 1 = head. Long-exposure falloff along the trail, soft across it, a hot head.
const trailFrag = /* glsl */ `
  varying vec2 vUv; varying vec4 vCol;
  uniform float uHot;
  void main() {
    float along = pow(vUv.x, 2.4) * smoothstep(1.0, 0.965, vUv.x);
    float across = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 1.8);
    float a = along * across * vCol.a;
    vec3 col = vCol.rgb * (1.0 + uHot * smoothstep(0.82, 0.99, vUv.x));
    gl_FragColor = vec4(col, a);
  }
`;
// A round glow for impacts (billboarded quad).
const glowFrag = /* glsl */ `
  varying vec2 vUv; uniform vec3 uCol; uniform float uA;
  void main() { float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 3.0) * uA; gl_FragColor = vec4(uCol * (1.0 + 2.0 * pow(max(0.0, 1.0 - d), 8.0)), a); }
`;
const glowVert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SPARKS = 4;

function Trails({ c, count, flash, wide }: { c: SceneColors; count: number; flash: React.RefObject<THREE.PointLight | null>; wide: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  // Each trail is a unit ribbon with its head at x = 0; per-instance colour + alpha in aCol.
  const { geo, colAttr } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1); g.translate(-0.5, 0, 0);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    g.setAttribute("aCol", a);
    return { geo: g, colAttr: a };
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: trailVert, fragmentShader: trailFrag, uniforms: { uHot: { value: c.light ? 0.4 : 2.2 }, uCopy: { value: 0 } },
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    blending: c.light ? THREE.NormalBlending : THREE.AdditiveBlending,
  }), [c.light]);
  const sparkMats = useMemo(() => Array.from({ length: SPARKS }, () => new THREE.ShaderMaterial({
    vertexShader: glowVert, fragmentShader: glowFrag, uniforms: { uCol: { value: new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.6) }, uA: { value: 0 } },
    transparent: true, depthWrite: false, toneMapped: false, blending: c.light ? THREE.NormalBlending : THREE.AdditiveBlending,
  })), [c.accent, c.light]);
  useEffect(() => () => { mat.dispose(); sparkMats.forEach((m) => m.dispose()); }, [mat, sparkMats]);

  const cols = useMemo(() => ({
    pass: new THREE.Color(c.light ? "#3b4352" : "#e9eef7"),
    passWarm: new THREE.Color(c.light ? "#5d6779" : "#c9d2e2"),
    bad: new THREE.Color(c.accent).multiplyScalar(c.light ? 1 : 1.5),
  }), [c]);

  const d = useMemo(() => ({
    x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count),
    speed: new Float32Array(count), len: new Float32Array(count), w: new Float32Array(count), a: new Float32Array(count),
    threat: new Uint8Array(count), hit: new Uint8Array(count),
    spark: Array.from({ length: SPARKS }, () => ({ t: 1, x: 0, y: 0, z: 0 })), nextSpark: 0, nextThreat: 1.2,
  }), [count]);

  const spawn = (i: number, scatter: boolean, threat = false) => {
    d.threat[i] = threat ? 1 : 0; d.hit[i] = 0;
    d.x[i] = scatter ? -12 + Math.random() * 24 : -12 - Math.random() * 5;
    if (threat) {
      d.x[i] = -12; d.y[i] = (Math.random() - 0.5) * 1.2; d.z[i] = (Math.random() - 0.5) * 0.12;
      d.speed[i] = 9 + Math.random() * 2; d.len[i] = 2.4 + Math.random(); d.w[i] = 0.05; d.a[i] = 1;
      return;
    }
    // Most trails pass behind the shield (so the glass bends them); a few skim past in front, clear of its face.
    const behind = Math.random() < 0.72;
    const spread = Math.random() < 0.65 ? 1.6 : 3.6;
    d.y[i] = (Math.random() - 0.5) * 2 * spread;
    d.z[i] = behind ? -0.6 - Math.random() * 3.2 : 0.8 + Math.random() * 1.8;
    if (!behind && Math.abs(d.y[i]) < 1.7) d.y[i] = Math.sign(d.y[i] || 1) * (1.7 + Math.random() * 1.6);
    d.speed[i] = 4.5 + Math.random() * 5;
    d.len[i] = 1.6 + Math.random() * 3.6;
    d.w[i] = 0.014 + Math.random() * 0.03;
    d.a[i] = 0.25 + Math.random() * 0.6;
  };

  useEffect(() => { for (let i = 0; i < count; i++) spawn(i, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [count]);

  const _o = useMemo(() => new THREE.Object3D(), []);
  const _cam = useMemo(() => new THREE.Vector3(), []);
  const _c = useMemo(() => new THREE.Color(), []);

  useFrame(({ camera }, raw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(raw, 0.05);
    const p = heroState.progress;
    const fade = 1 - smooth(0.2, 0.42, p);
    mat.uniforms.uCopy.value = wide ? 1 - smooth(0.05, 0.2, p) : 0;
    // The camera in this group's space, to roll each trail's ribbon toward it.
    _cam.copy(camera.position); m.parent?.worldToLocal(_cam);

    // A threat every couple of seconds, while the trails are visible.
    d.nextThreat -= dt;
    if (d.nextThreat <= 0 && fade > 0.5) {
      d.nextThreat = 1.6 + Math.random() * 1.8;
      let pick = -1;
      for (let i = 0; i < count; i++) if (!d.threat[i] && d.x[i] > 8) { pick = i; break; }
      if (pick >= 0) spawn(pick, false, true);
    }

    for (let i = 0; i < count; i++) {
      if (d.hit[i]) {
        // The head is stopped at the edge; the tail catches up and the trail collapses into the impact.
        d.len[i] -= d.speed[i] * dt * 1.3;
        if (d.len[i] <= 0.02) spawn(i, false);
      } else {
        d.x[i] += d.speed[i] * dt;
        if (d.threat[i] && d.x[i] > -0.94) {
          d.x[i] = -0.94; d.hit[i] = 1;
          const s = d.spark[d.nextSpark]; d.nextSpark = (d.nextSpark + 1) % SPARKS;
          s.t = 0; s.x = d.x[i]; s.y = d.y[i]; s.z = d.z[i] + 0.12;
          if (flash.current) { flash.current.position.set(s.x + 0.15, s.y, 0.25); flash.current.intensity = 9; }
        }
        if (d.x[i] - d.len[i] > 12) spawn(i, false);
      }
      const roll = Math.atan2(-(_cam.y - d.y[i]), _cam.z - d.z[i]);
      _o.position.set(d.x[i], d.y[i], d.z[i]);
      _o.rotation.set(roll, 0, 0);
      _o.scale.set(Math.max(0.001, d.len[i]), d.w[i], 1);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
      _c.copy(d.threat[i] ? cols.bad : i % 3 === 0 ? cols.passWarm : cols.pass);
      colAttr.setXYZW(i, _c.r, _c.g, _c.b, d.a[i] * fade);
    }
    m.instanceMatrix.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (flash.current) flash.current.intensity *= Math.exp(-dt * 7);
    d.spark.forEach((s, k) => {
      const sp = sparks.current[k];
      if (!sp) return;
      s.t = Math.min(1, s.t + dt * 2.4);
      const e = cubicOut(s.t);
      sp.visible = s.t < 1;
      sp.position.set(s.x, s.y, s.z);
      sp.quaternion.copy(camera.quaternion);
      sp.scale.setScalar(0.25 + e * 0.9);
      sparkMats[k].uniforms.uA.value = (1 - e) * fade;
    });
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} />
      {sparkMats.map((sm, k) => (
        <mesh key={k} ref={(el) => { sparks.current[k] = el; }} material={sm} visible={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- rig */

type Callout = { label: HTMLDivElement | null; line: SVGPolylineElement | null; dot: SVGCircleElement | null };
type LabelEls = React.RefObject<Callout[]>;

/** Camera, shield pose and the exploded view, all from heroState (scroll + pointer). */
function Rig({ c, wide, mobile, count, centered, labels }: { c: SceneColors; wide: boolean; mobile: boolean; count: number; centered?: boolean; labels: LabelEls }) {
  const stage = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const layers = useRef<Layers>({ glass: null, body: null, back: null });
  const flash = useRef<THREE.PointLight>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const tilt = useRef({ x: 0, y: 0 });
  const born = useRef<number | null>(null);
  const _v = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Entrance: the shield turns in from the side and settles, like a turntable coming to rest.
    const intro = centered ? 1 : cubicOut(clamp01((t - born.current) / 2.2));
    const p = heroState.progress;

    const center = smooth(0.0, 0.32, p);
    const apart = smooth(0.28, 0.56, p);
    const lock = clamp01((p - 0.7) / 0.13);
    // backOut overshoots, so the layers press together for a moment before settling: a "click".
    const explode = apart * Math.max(-0.05, 1 - backOut(lock));

    const baseX = centered ? 0 : wide ? 2.5 : 0, baseY = centered ? 0 : wide ? -0.05 : -1.35;
    const scale = centered ? 1 : wide ? 0.86 + 0.04 * center : 0.62 - 0.04 * center - 0.17 * apart * (1 - lock);
    if (stage.current) {
      stage.current.position.set(baseX * (1 - center), baseY * (1 - center) + (wide ? 0 : 0.1 * center), 0);
      stage.current.scale.setScalar(scale);
    }

    // Long lens, slow orbit. Pushes in a little as the layers lock.
    const az = -0.1 + p * 0.2;
    const r = 13.6 - 0.8 * center - 1.1 * smooth(0.82, 1, p);
    camera.position.set(Math.sin(az) * r, 0.5 + 1.3 * apart * (1 - lock), Math.cos(az) * r);
    camera.lookAt(0, 0, 0);

    const k = 1 - Math.exp(-dt * 2.6);
    tilt.current.x += (heroState.pointerY * 0.16 - tilt.current.x) * k;
    tilt.current.y += (heroState.pointerX * 0.3 - tilt.current.y) * k;
    if (turn.current) {
      const yaw = -0.42 + 1.32 * smooth(0.22, 0.56, p) - 1.05 * smooth(0.7, 0.9, p) + (1 - intro) * -1.1;
      turn.current.rotation.set(
        tilt.current.x * (1 - apart) + Math.sin(t * 0.45) * 0.025 - 0.08 * apart,
        yaw + tilt.current.y * (1 - apart * 0.7) + Math.sin(t * 0.3) * 0.04,
        0,
      );
      turn.current.position.y = Math.sin(t * 0.7) * 0.04 * (1 - apart) - (1 - intro) * 0.25;
    }
    const L = layers.current;
    if (L.glass) L.glass.position.z = Z_GLASS + 1.15 * explode;
    if (L.back) L.back.position.z = Z_BACK - 1.15 * explode;

    // Callouts: project each anchor to screen space; move the DOM label and redraw its SVG leader.
    const show = smooth(0.42, 0.5, p) * (1 - smooth(0.68, 0.73, p));
    const groups = [L.glass, L.body, L.back];
    const ks = Math.min(1, Math.max(0.36, size.width / 1440));
    LAYERS.forEach((layer, i) => {
      const co = labels.current?.[i];
      const g = groups[i];
      if (!co?.label) return;
      const o = String(show);
      co.label.style.opacity = o;
      if (co.line) co.line.style.opacity = o;
      if (co.dot) co.dot.style.opacity = o;
      if (!g || show <= 0) return;
      g.updateWorldMatrix(true, false);
      _v.set(layer.anchor[0], layer.anchor[1], layer.anchor[2]).applyMatrix4(g.matrixWorld).project(camera);
      const ax = ((_v.x + 1) / 2) * size.width, ay = ((1 - _v.y) / 2) * size.height;
      const w = co.label.offsetWidth, pad = 12, right = layer.side === "r";
      // Keep labels on screen (phones): slide the label in; the leader just gets shorter.
      let lx = ax + layer.offset[0] * ks;
      lx = right ? Math.min(lx, size.width - w - pad) : Math.max(lx, w + pad);
      const ly = ay + layer.offset[1] * ks;
      co.label.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) ${right ? "translate(0, -50%)" : "translate(-100%, -50%)"}`;
      // Leader: from the dot, angle to the label's height, then run flat into it (an engineering-drawing elbow).
      const ex = lx + (right ? -8 : 8), elbow = ex + (right ? -18 : 18) * ks;
      co.line?.setAttribute("points", `${ax.toFixed(1)},${ay.toFixed(1)} ${elbow.toFixed(1)},${ly.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)}`);
      co.dot?.setAttribute("cx", ax.toFixed(1));
      co.dot?.setAttribute("cy", ay.toFixed(1));
    });
  });

  return (
    <group ref={stage}>
      <group ref={turn}><Shield c={c} layers={layers} mobile={mobile} flash={flash} /></group>
      <Trails c={c} count={count} flash={flash} wide={wide && !centered} />
    </group>
  );
}

/** Studio lighting, baked once into an environment map: a top softbox, two strip lights, a low warm kicker. */
function Studio({ c }: { c: SceneColors }) {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={c.light ? 3 : 2.2} position={[0, 5, 1.5]} rotation-x={Math.PI / 2} scale={[7, 5, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={c.light ? 4 : 5} position={[-5, 0.6, 1.5]} rotation-y={Math.PI / 2} scale={[0.5, 9, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={c.light ? 2.5 : 3} position={[5, 0, -0.5]} rotation-y={-Math.PI / 2} scale={[0.4, 9, 1]} color="#dfe8ff" />
      <Lightformer form="rect" intensity={c.light ? 1.2 : 0.12} position={[0, -0.5, 7]} scale={[8, 3, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={c.light ? 1.5 : 2.4} position={[0.5, 1.5, -6]} scale={[7, 1.2, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={c.light ? 0.6 : 1.4} position={[-2.5, -4, -3]} rotation-x={-Math.PI / 3} scale={[5, 1.2, 1]} color={c.accent} />
    </Environment>
  );
}

/*
 * The ACES tone-mapping pass crushes near-black (and dims near-white), so a background set to the page
 * colour would come out darker than the page around the canvas. Invert the curve per channel instead,
 * so the canvas background lands exactly on --page after tone mapping.
 */
function acesFit(v: number) { const x = v / 0.6; return Math.min(1, Math.max(0, (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081))); }
function pageBackground(hex: string) {
  const c = new THREE.Color(hex); // linear after sRGB decode
  const inv = (target: number) => { let lo = 0, hi = 64; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (acesFit(mid) < target) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  return new THREE.Color().setRGB(inv(c.r), inv(c.g), inv(c.b), THREE.LinearSRGBColorSpace);
}

export default function HeroScene({ colors, capture, onReady }: { colors: SceneColors; capture?: boolean; onReady?: () => void }) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [mobile] = useState(() => typeof window !== "undefined" && (window.innerWidth < 768 || matchMedia("(pointer: coarse)").matches));
  const [running, setRunning] = useState(true);
  const labels = useRef<Callout[]>(LAYERS.map(() => ({ label: null, line: null, dot: null })));
  const bg = useMemo(() => pageBackground(colors.page), [colors.page]);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    // Pause rendering when the hero is off-screen (heroState.active is set by the scroll system).
    const id = setInterval(() => setRunning((was) => (was === heroState.active ? was : heroState.active)), 250);
    return () => { window.removeEventListener("resize", onResize); clearInterval(id); };
  }, []);

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={mobile ? [1, 1.25] : [1, 1.75]}
        frameloop={running ? "always" : "never"}
        camera={{ position: [0, 0.5, 13.6], fov: 22, near: 0.1, far: 80 }}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!capture }}
        onCreated={() => onReady?.()}
      >
        <primitive attach="background" object={bg} />
        <ambientLight intensity={colors.light ? 0.35 : 0.04} />
        <Studio c={colors} />
        <Rig c={colors} wide={wide} mobile={mobile} count={capture ? 60 : mobile ? 34 : 64} centered={capture} labels={labels} />
        {/* No composer MSAA: on Intel Iris Xe (D3D11) it renders the whole frame black. */}
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={colors.light ? 1.2 : 0.82} luminanceSmoothing={0.2} intensity={colors.light ? 0 : mobile ? 0.7 : 0.9} radius={0.6} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Noise blendFunction={BlendFunction.OVERLAY} opacity={colors.light ? 0.06 : 0.1} />
        </EffectComposer>
      </Canvas>
      <svg className="layer-leaders pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {LAYERS.map((l, i) => (
          <g key={l.key}>
            <polyline ref={(el) => { labels.current[i].line = el; }} fill="none" />
            <circle ref={(el) => { labels.current[i].dot = el; }} r="3.5" />
          </g>
        ))}
      </svg>
      {LAYERS.map((l, i) => (
        <div key={l.key} ref={(el) => { labels.current[i].label = el; }} data-side={l.side} className="layer-label pointer-events-none absolute left-0 top-0">
          <strong>{l.label}</strong><em>{l.sub}</em>
        </div>
      ))}
    </div>
  );
}
