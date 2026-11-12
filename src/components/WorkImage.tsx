import { shaderMaterial } from "@react-three/drei";
import {
  Canvas,
  extend,
  useFrame,
  useLoader,
  type ThreeElement,
} from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useLenis } from "lenis/react";

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform float uTime;
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

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.02,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.02
    );

    // Split channels vertically along the scroll axis — matches
    // the direction the plane is actually moving through, so the
    // fringing reads as motion rather than a generic glitch.
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

const vertexShader = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCurves;
  uniform float uScrollBend;

  void main(){
    vUv = uv;
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    modelPosition.z += sin((modelPosition.z + modelPosition.y * 2.0) + uTime * 2.3) * uCurves;

    // Edge factor: 0 at vertical center, 1 at top/bottom edges.
    // Squaring keeps it always positive, so both edges bend the
    // same direction (sign comes from uScrollBend itself).
    float edge = abs(uv.x - 0.5) * 4.4;
    modelPosition.y += uScrollBend * edge * edge;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;
  }
`;

const ShaderBackgroundMaterialImg = shaderMaterial(
  {
    uTime: 100,
    uCurves: 0.2,
    uScrollBend: 0,
    uAberration: 0,
    uTexture: null as THREE.Texture | null,
    uImageAspect: 1,
    uPlaneAspect: 1,
  },
  vertexShader,
  fragmentShader,
);

extend({ ShaderBackgroundMaterialImg });

declare module "@react-three/fiber" {
  interface ThreeElements {
    shaderBackgroundMaterialImg: ThreeElement<
      typeof ShaderBackgroundMaterialImg
    >;
  }
}

type ShaderBackgroundMaterialImgInstance = InstanceType<
  typeof ShaderBackgroundMaterialImg
>;

const BASE_CURVES = 0.2;
const EASE_SPEED = 4.6;
const PLANE_WIDTH = 4;
const PLANE_HEIGHT = 3;
const PLANE_ASPECT = PLANE_WIDTH / PLANE_HEIGHT;

function ImagePlane({ img, isPlaying }: { img: string; isPlaying: boolean }) {
  const [image] = useLoader(THREE.TextureLoader, [img]);
  const materialRef = useRef<ShaderBackgroundMaterialImgInstance>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);
  const curvesRef = useRef(0);
  const scrollBendTargetRef = useRef(0);
  const scrollBendRef = useRef(0);
  const aberrationTargetRef = useRef(0);
  const aberrationRef = useRef(0);
  const [imageAspect, setImageAspect] = useState(1);
  const lastSizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    if (image?.image) {
      const { width, height } = image.image as HTMLImageElement;
      if (width && height) setImageAspect(width / height);
    }
  }, [image]);

  const BEND_STRENGTH = 0.0035;
  const MAX_BEND = 0.4;
  const ABERRATION_STRENGTH = 0.015;
  const MAX_ABERRATION = 0.02;

  const isSettledRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      isSettledRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useLenis((lenis) => {
    if (!isSettledRef.current) return;

    // lenis.velocity is signed (+ scrolling down, − scrolling up) and
    // is itself derived from Lenis's own eased scroll position, so we
    // inherit Lenis's easing curve for free instead of reconstructing
    // our own spring from raw scrollY deltas.
    const v = lenis.velocity;

    scrollBendTargetRef.current = THREE.MathUtils.clamp(
      v * BEND_STRENGTH,
      -MAX_BEND,
      MAX_BEND,
    );

    aberrationTargetRef.current = THREE.MathUtils.clamp(
      Math.abs(v) * ABERRATION_STRENGTH,
      0,
      MAX_ABERRATION,
    );
  });

  useFrame(({ gl, camera }, delta) => {
    if (!materialRef.current || !meshRef.current) return;

    if (isPlaying) {
      elapsedRef.current += delta * 4;
      materialRef.current.uTime = elapsedRef.current;
    }

    const target = isPlaying ? BASE_CURVES : 0;
    const t = 1 - Math.exp(-EASE_SPEED * delta);
    curvesRef.current += (target - curvesRef.current) * t;
    materialRef.current.uCurves = curvesRef.current;

    // Light catch-up ease toward the Lenis-driven targets — kept fast
    // (10 vs. EASE_SPEED's 4.6) since Lenis has already done the heavy
    // smoothing; this just removes per-frame jitter, not lag.
    const scrollT = 1 - Math.exp(-10 * delta);
    scrollBendRef.current +=
      (scrollBendTargetRef.current - scrollBendRef.current) * scrollT;
    materialRef.current.uScrollBend = scrollBendRef.current;

    aberrationRef.current +=
      (aberrationTargetRef.current - aberrationRef.current) * scrollT;
    materialRef.current.uAberration = aberrationRef.current;

    // Lenis stops emitting scroll events once fully settled, so the
    // targets need their own decay back to 0 or they'd freeze at
    // whatever velocity was last reported.
    scrollBendTargetRef.current *= Math.exp(-5 * delta);
    aberrationTargetRef.current *= Math.exp(-5 * delta);

    const rect = gl.domElement.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    const persp = camera as THREE.PerspectiveCamera;
    const canvasAspect = w / h;

    // 🔁 Cheap — just matrix math, no GPU realloc. Keep this in sync with
    // the measured aspect on EVERY frame, not just frames where the
    // rounded pixel size happened to change. Previously this only ran
    // inside the `gl.setSize` change-check below, so on frames where the
    // rounded w/h stayed the same as last frame but sub-pixel drift kept
    // moving, `canvasAspect` (used for the mesh scale below) and
    // `camera.aspect` (used by the actual projection matrix) briefly
    // disagreed — that mismatch is what produced the overshoot/snap-back
    // "glitch" right as the transition settled.
    if (persp.aspect !== canvasAspect) {
      persp.aspect = canvasAspect;
      persp.updateProjectionMatrix();
    }

    // 🔁 Expensive — only reallocate the framebuffer when the size
    // genuinely changed.
    if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
      lastSizeRef.current = { w, h };
      gl.setSize(w, h, false);
    }

    materialRef.current.uPlaneAspect = canvasAspect;

    const distance = persp.position.z - meshRef.current.position.z;
    const vFov = (persp.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * canvasAspect;

    meshRef.current.scale.set(
      visibleWidth / PLANE_WIDTH / 1.086,
      visibleHeight / PLANE_HEIGHT / 1.086,
      1,
    );
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT, 32, 32]} />
      <shaderBackgroundMaterialImg
        ref={materialRef}
        uTexture={image}
        uImageAspect={imageAspect}
        uPlaneAspect={PLANE_ASPECT}
      />
    </mesh>
  );
}

export default function WorkImage({
  img,
  isPlaying: controlledIsPlaying,
  onPlayingChange,
}: {
  img: string;
  isPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const isControlled = controlledIsPlaying !== undefined;
  const isPlaying = isControlled ? controlledIsPlaying : internalIsPlaying;

  // @ts-ignore
  const togglePlaying = () => {
    const next = !isPlaying;
    if (isControlled) {
      onPlayingChange?.(next);
    } else {
      setInternalIsPlaying(next);
    }
  };

  return (
    <>
      <Canvas
        className="image-canvas !overflow-visible"
        // 🔁 3 at rest (open, settled / closed, settled), dropped to 0.6
        // only while a GSAP transition is actively running (isPlaying is
        // driven by Works.tsx's open/close effect + Flip onComplete
        // callbacks). Lower dpr during the tween measurably reduces the
        // visible resize-glitching, and since the wave animation is
        // playing during that window anyway, the drop in sharpness isn't
        // something the user is meant to be scrutinizing.
        dpr={isPlaying ? 0.7 : 2}
        camera={{ position: [0, 0, 3.3], zoom: 0.98 }}
        gl={{ antialias: false }}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
      >
        <ImagePlane img={img} isPlaying={isPlaying} />
      </Canvas>

      {/* <button
        onClick={togglePlaying}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 14px",
          borderRadius: 6,
          border: "none",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        {isPlaying ? "Pause" : "Play"}
      </button> */}
    </>
  );
}
