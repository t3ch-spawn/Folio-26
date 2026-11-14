import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useLenis } from "lenis/react";
import * as THREE from "three";
import { useImageLayer } from "./ImageLayerContext";

const BEND_STRENGTH = 0.0045;
const BEND_CENTERING = 0.35; // 0 = anchored middle, 0.5 = evenly distributed bend
const MAX_BEND = 0.4;
const BEND_SMOOTHING = 6;
const MAX_DPR = 2;
const IMAGE_SCALE = 1.086;
const BEND_SHRINK = 0.24; // 0 = none, 1 = full fit, 2+ = stronger
const FIT_MARGIN = 0.96;
const PREPAINT_MARGIN = 80;

type Mode = "work" | "aberration";
interface Props {
  img: string;
  mode: Mode;
  isPlaying?: boolean;
  elevated?: boolean;
}
interface Card {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  poster: HTMLImageElement;
  texture?: THREE.Texture;
  mode: Mode;
  playing: boolean;
  shown: boolean;
  near: boolean;
  dirty: boolean;
  width: number;
  height: number;
  time: number;
  wave: number;
  bend: number;
  fringe: number;
}

const cards = new Set<Card>();
const scroll = { input: 0, sample: -Infinity, velocity: 0, bend: 0 };
let wake: () => void = () => {};

const vertexShader = /* glsl */ `
  precision mediump float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uCurves;
  uniform float uScrollBend;
  uniform float uFit;

  void main() {
    vUv = uv;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    modelPosition.z +=
      sin((modelPosition.z + modelPosition.y * 2.0) + uTime * 2.3)
      * uCurves;

    float edge = abs(uv.x - 0.5) * 4.4;
    modelPosition.y += uScrollBend * (edge * edge - 4.84 * ${BEND_CENTERING});

    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    gl_Position.xy *= uFit;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uAberration;


  void main() {
    vec2 ratio = vec2(
      min(uPlaneAspect / uImageAspect, 1.0),
      min(uImageAspect / uPlaneAspect, 1.0)
    );

    // Preserves your original image alignment.
    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.02,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.02
    );

    if (abs(uAberration) < 0.0001) {
      gl_FragColor = texture2D(uTexture, uv);
    } else {
      vec2 dir = vec2(0.0, uAberration);

      float r = texture2D(uTexture, uv + dir).r;
      float g = texture2D(uTexture, uv).g;
      float b = texture2D(uTexture, uv - dir).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }


  }
`;

function startRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setClearColor(0, 0);
  renderer.setScissorTest(true);

  const uniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uImageAspect: { value: 1 }, uPlaneAspect: { value: 1 },
    uTime: { value: 0 }, uCurves: { value: 0 }, uScrollBend: { value: 0 },
    uAberration: { value: 0 }, uFit: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    transparent: true,
  });
  const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);
  const mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  const surface = renderer.domElement;
  const fovFactor = 2 * Math.tan(THREE.MathUtils.degToRad(75 / 2));

  let frame = 0;
  let previous = 0;
  let lost = false;
  function schedule() {
    if (!frame && !lost && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function draw(now: number) {
    frame = 0;
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
    previous = now;
    const decay = Math.exp(-Math.max(0, now - scroll.sample - 100) / 140);
    const target = THREE.MathUtils.clamp(scroll.input * decay, -150, 150);
    scroll.velocity = THREE.MathUtils.damp(scroll.velocity, target, 12, dt);
    scroll.bend = THREE.MathUtils.damp(scroll.bend,
      THREE.MathUtils.clamp(scroll.velocity * BEND_STRENGTH, -MAX_BEND, MAX_BEND),
      BEND_SMOOTHING, dt);
    if (Math.abs(target) + Math.abs(scroll.velocity) < 0.01) scroll.velocity = 0;
    if (!scroll.velocity && Math.abs(scroll.bend) < 0.00001) scroll.bend = 0;

    let waving = false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    for (const card of cards) {
      if (!card.texture || !card.shown || (!card.near && !card.playing)) continue;
      if (card.width <= 0 || card.height <= 0) continue;

      const work = card.mode === "work";
      const bend = work ? scroll.bend : 0;
      const fringe = Math.min(Math.abs(scroll.velocity) * (work ? 0.015 : 0.009), work ? 0.02 : 0.024);
      const oldWave = card.wave;
      const targetWave = work && card.playing ? 0.2 : 0;
      card.wave = THREE.MathUtils.damp(card.wave, targetWave, 4.6, dt);
      if (Math.abs(card.wave - targetWave) < 0.00001) card.wave = targetWave;
      if (card.playing) card.time += dt * 4;
      waving ||= card.playing || card.wave !== targetWave;

      const width = Math.max(1, Math.round(card.width * dpr));
      const height = Math.max(1, Math.round(card.height * dpr));
      const resized = width !== card.canvas.width || height !== card.canvas.height;
      if (!resized && !card.dirty && !card.playing && oldWave === card.wave &&
          bend === card.bend && fringe === card.fringe) continue;

      if (surface.width < width || surface.height < height) {
        renderer.setSize(Math.max(surface.width, width), Math.max(surface.height, height), false);
      }
      if (resized) {
        card.canvas.width = width;
        card.canvas.height = height;
      }
      const aspect = card.width / card.height;
      const distance = work ? 3.3 : 1.3;
      camera.position.z = distance;
      camera.zoom = work ? 0.98 : 1;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const viewHeight = fovFactor * distance / camera.zoom;
      mesh.scale.set(viewHeight * aspect / IMAGE_SCALE, viewHeight / IMAGE_SCALE, 1);
      const expansion = distance / (distance - Math.abs(card.wave));
      const maxBendOffset = Math.abs(bend) * 4.84 * (1 - BEND_CENTERING);
      const halfHeight = (viewHeight / (2 * IMAGE_SCALE) + maxBendOffset) * expansion;
      const source = card.texture.image as HTMLImageElement;
      uniforms.uTexture.value = card.texture;
      uniforms.uImageAspect.value = source.width / source.height;
      uniforms.uPlaneAspect.value = aspect;
      uniforms.uTime.value = card.time;
      uniforms.uCurves.value = card.wave;
      uniforms.uScrollBend.value = bend;
      uniforms.uAberration.value = fringe;
      const fittedScale = Math.min(1, viewHeight * FIT_MARGIN / (2 * halfHeight),
        FIT_MARGIN * IMAGE_SCALE / expansion);
      uniforms.uFit.value = Math.pow(fittedScale, Math.max(0, BEND_SHRINK));

      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.render(scene, camera);
      card.ctx.globalCompositeOperation = "copy";
      card.ctx.drawImage(surface, 0, surface.height - height, width, height, 0, 0, width, height);
      if (card.dirty) card.poster.style.visibility = "hidden";
      card.dirty = false;
      card.bend = bend;
      card.fringe = fringe;
    }
    if (waving || Math.abs(target) >= 0.01 || scroll.velocity || scroll.bend) schedule();
    else previous = 0;
  }

  function onLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function refresh() {
    previous = 0;
    for (const card of cards) card.dirty = true;
    schedule();
  }
  function onRestored() { lost = false; refresh(); }
  wake = schedule;
  surface.addEventListener("webglcontextlost", onLost);
  surface.addEventListener("webglcontextrestored", onRestored);
  document.addEventListener("visibilitychange", refresh);
  refresh();
  return () => {
    wake = () => {};
    cancelAnimationFrame(frame);
    surface.removeEventListener("webglcontextlost", onLost);
    surface.removeEventListener("webglcontextrestored", onRestored);
    document.removeEventListener("visibilitychange", refresh);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

export function ImageEffectsCanvas() {
  useLenis((lenis) => {
    scroll.input = -lenis.velocity;
    scroll.sample = performance.now();
    wake();
  });
  useEffect(() => {
    try { return startRenderer(); }
    catch (error) { console.error("Portfolio renderer unavailable", error); }
  }, []);
  return null;
}

export function ShaderImage({ img, mode, isPlaying = false, elevated = false }: Props) {
  const id = useId();
  const { activeView, setActiveView } = useImageLayer();
  const shown = activeView === null || activeView === id;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const entry = useRef<Card | null>(null);

  useLayoutEffect(() => {
    if (!elevated) return;
    setActiveView(id);
    return () => setActiveView(current => current === id ? null : current);
  }, [elevated, id, setActiveView]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const poster = posterRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !poster || !ctx) return;
    poster.style.visibility = "visible";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const card: Card = {
      canvas, ctx, poster, mode, playing: false, shown: true, near: false, dirty: true,
      width: canvas.clientWidth, height: canvas.clientHeight,
      time: 0, wave: 0, bend: 0, fringe: 0,
    };
    entry.current = card;
    cards.add(card);

    const visibility = new IntersectionObserver(([result]) => {
      card.near = result.isIntersecting;
      if (card.near) { card.dirty = true; wake(); }
    }, { rootMargin: PREPAINT_MARGIN + "px" });
    visibility.observe(canvas);

    const resize = new ResizeObserver(([result]) => {
      card.width = result.contentRect.width;
      card.height = result.contentRect.height;
      card.dirty = true;
      wake();
    });
    resize.observe(canvas);

    let disposed = false;
    const texture = new THREE.TextureLoader().load(img, loaded => {
      if (disposed) return;
      card.texture = loaded;
      card.dirty = true;
      wake();
    }, undefined, error => console.error("Portfolio texture load failed", img, error));

    return () => {
      disposed = true;
      resize.disconnect();
      visibility.disconnect();
      cards.delete(card);
      entry.current = null;
      texture.dispose();
    };
  }, [img, mode]);

  useLayoutEffect(() => {
    if (!entry.current) return;
    entry.current.shown = shown;
    entry.current.playing = isPlaying;
    entry.current.dirty = true;
    wake();
  }, [shown, isPlaying, img, mode]);

  const fallbackSize = Math.min(1 / IMAGE_SCALE, FIT_MARGIN) * 100 + "%";
  return (
    <div className="image-canvas" style={{
      position: "relative", width: "100%", height: "100%", pointerEvents: "none",
      opacity: shown ? 1 : 0, transition: "opacity 200ms ease",
    }}>
      <img ref={posterRef} src={img} alt="" aria-hidden="true" draggable={false}
        style={{ position: "absolute", inset: 0, margin: "auto", width: fallbackSize,
          height: fallbackSize, maxWidth: "none", objectFit: "cover", objectPosition: "2% 2%" }} />
      <canvas ref={canvasRef} aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
