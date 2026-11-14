import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Canvas,
  extend,
  useFrame,
  useLoader,
  useThree,
  type ThreeElement,
} from "@react-three/fiber";
import { PerspectiveCamera, View, shaderMaterial } from "@react-three/drei";
import { useLenis } from "lenis/react";
import * as THREE from "three";

import { useImageLayer } from "./ImageLayerContext";

// --------------------------------------------------
// Animation settings
// --------------------------------------------------

const BEND_STRENGTH = 0.0065; // Increase for more bend.
const MAX_BEND = 0.4; // Increase if the bend reaches its limit.
const BEND_SMOOTHING = 12; // Lower = softer/slower response.

const VELOCITY_SMOOTHING = 7;

// Don't decay between individual scroll events.
// Only release the velocity after events actually stop.
const SCROLL_IDLE_DELAY_MS = 100;
const SCROLL_RELEASE_MS = 140;

const BASE_CURVES = 0.2;
const CURVE_SMOOTHING = 4.6;

const PLANE_WIDTH = 4;
const PLANE_HEIGHT = 3;
const IMAGE_SCALE_DIVISOR = 1.086;

// Start preparing canvases before they enter the screen.
const PRELOAD_MARGIN = 300;

// Avoid repeatedly recreating a Canvas near the viewport boundary.
const OFFSCREEN_RELEASE_DELAY_MS = 1500;

type ImageMode = "work" | "aberration";

interface ScrollSample {
  velocity: number;
  updatedAt: number;
}

interface AnimationState {
  time: number;
  velocity: number;
  curves: number;
  bend: number;
  aberration: number;
}

function useInlineCanvas() {
  const [inline, setInline] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(any-pointer: coarse)").matches
      : false,
  );

  useEffect(() => {
    const query = window.matchMedia("(any-pointer: coarse)");

    const update = () => {
      setInline(query.matches);
    };

    update();

    query.addEventListener("change", update);

    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  return inline;
}

const vertexShader = /* glsl */ `
  precision mediump float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uCurves;
  uniform float uScrollBend;

  void main() {
    vUv = uv;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    modelPosition.z +=
      sin(
        (modelPosition.z + modelPosition.y * 2.0)
        + uTime * 2.3
      ) * uCurves;

    float edge = abs(uv.x - 0.5) * 4.4;
    modelPosition.y += uScrollBend * edge * edge;

    gl_Position =
      projectionMatrix * viewMatrix * modelPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uAberration;
  uniform float uOpacity;

  void main() {
    vec2 ratio = vec2(
      min(uPlaneAspect / uImageAspect, 1.0),
      min(uImageAspect / uPlaneAspect, 1.0)
    );

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

    gl_FragColor.a *= uOpacity;
  }
`;

const PortfolioImageMaterial = shaderMaterial(
  {
    uTexture: null as THREE.Texture | null,
    uTime: 0,
    uCurves: 0,
    uScrollBend: 0,
    uAberration: 0,
    uImageAspect: 1,
    uPlaneAspect: 1,
    uOpacity: 1,
  },
  vertexShader,
  fragmentShader,
);

extend({ PortfolioImageMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    portfolioImageMaterial: ThreeElement<typeof PortfolioImageMaterial>;
  }
}

type MaterialInstance = InstanceType<typeof PortfolioImageMaterial>;

interface ImageSceneProps {
  img: string;
  mode: ImageMode;
  isPlaying: boolean;
  container: RefObject<HTMLDivElement | null>;
  opacity: number;
  inline: boolean;
  scrollSample: RefObject<ScrollSample>;
  animation: RefObject<AnimationState>;
  onReady?: () => void;
  onNotReady?: () => void;
}

function ImageScene({
  img,
  mode,
  isPlaying,
  container,
  opacity,
  inline,
  scrollSample,
  animation,
  onReady,
  onNotReady,
}: ImageSceneProps) {
  const image = useLoader(THREE.TextureLoader, img);
  const gl = useThree((state) => state.gl);

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<MaterialInstance>(null);

  const dimensionsRef = useRef({ width: 0, height: 0 });
  const readyFramesRef = useRef(0);
  const notifiedRef = useRef(false);
  const readyRafRef = useRef<number | null>(null);

  const isWork = mode === "work";

  const source = image.image as HTMLImageElement;
  const imageAspect = source.width / source.height || 1;

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();

      dimensionsRef.current = {
        width: rect.width,
        height: rect.height,
      };
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [container]);

  useEffect(() => {
    const canvas = gl.domElement;

    const resetReadiness = () => {
      readyFramesRef.current = 0;
      notifiedRef.current = false;

      if (readyRafRef.current !== null) {
        cancelAnimationFrame(readyRafRef.current);
        readyRafRef.current = null;
      }

      onNotReady?.();
    };

    canvas.addEventListener("webglcontextlost", resetReadiness);

    canvas.addEventListener("webglcontextrestored", resetReadiness);

    return () => {
      canvas.removeEventListener("webglcontextlost", resetReadiness);

      canvas.removeEventListener("webglcontextrestored", resetReadiness);

      if (readyRafRef.current !== null) {
        cancelAnimationFrame(readyRafRef.current);
      }
    };
  }, [gl, onNotReady]);

  useFrame(({ camera, size }, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;

    if (!mesh || !material || gl.getContext().isContextLost()) {
      return;
    }

    const dt = Math.min(delta, 0.05);
    const state = animation.current;

    // Capture scroll events outside the Canvas, then consume their
    // latest sample here. Do not reset/decay targets between events.
    const sample = scrollSample.current;
    const age = performance.now() - sample.updatedAt;

    const release =
      age <= SCROLL_IDLE_DELAY_MS
        ? 1
        : Math.exp(-(age - SCROLL_IDLE_DELAY_MS) / SCROLL_RELEASE_MS);

    const velocityTarget = THREE.MathUtils.clamp(
      sample.velocity * release,
      -150,
      150,
    );

    state.velocity = THREE.MathUtils.damp(
      state.velocity,
      velocityTarget,
      VELOCITY_SMOOTHING,
      dt,
    );

    const bendTarget = isWork
      ? THREE.MathUtils.clamp(
          state.velocity * BEND_STRENGTH,
          -MAX_BEND,
          MAX_BEND,
        )
      : 0;

    state.bend = THREE.MathUtils.damp(
      state.bend,
      bendTarget,
      BEND_SMOOTHING,
      dt,
    );

    const aberrationTarget = THREE.MathUtils.clamp(
      Math.abs(state.velocity) * (isWork ? 0.015 : 0.008),
      0,
      isWork ? 0.02 : 0.04,
    );

    state.aberration = THREE.MathUtils.damp(
      state.aberration,
      aberrationTarget,
      10,
      dt,
    );

    if (isWork && isPlaying) {
      state.time += dt * 4;
    }

    state.curves = THREE.MathUtils.damp(
      state.curves,
      isWork && isPlaying ? BASE_CURVES : 0,
      CURVE_SMOOTHING,
      dt,
    );

    material.uTime = state.time;
    material.uCurves = state.curves;
    material.uScrollBend = state.bend;
    material.uAberration = state.aberration;

    material.uOpacity = THREE.MathUtils.damp(
      material.uOpacity,
      opacity,
      10,
      dt,
    );

    let width: number;
    let height: number;

    if (inline) {
      // The real Canvas travels with its DOM container.
      // R3F owns its framebuffer and camera sizing.
      width = size.width;
      height = size.height;
    } else {
      ({ width, height } = dimensionsRef.current);

      // CSS transforms aren't reported by ResizeObserver.
      if (isPlaying && container.current) {
        const rect = container.current.getBoundingClientRect();

        width = rect.width;
        height = rect.height;

        dimensionsRef.current = { width, height };
      }
    }

    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    const perspective = camera as THREE.PerspectiveCamera;

    if (!inline && perspective.aspect !== aspect) {
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
    }

    material.uPlaneAspect = aspect;

    const distance = Math.abs(perspective.position.z - mesh.position.z);

    const visibleHeight =
      (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2) * distance) /
      perspective.zoom;

    mesh.scale.set(
      (visibleHeight * aspect) / PLANE_WIDTH / IMAGE_SCALE_DIVISOR,
      visibleHeight / PLANE_HEIGHT / IMAGE_SCALE_DIVISOR,
      1,
    );

    // Let the texture upload and several frames render before
    // fading from the static fallback to the mobile Canvas.
    if (onReady && !notifiedRef.current) {
      readyFramesRef.current += 1;

      if (readyFramesRef.current >= 3) {
        notifiedRef.current = true;

        readyRafRef.current = requestAnimationFrame(() => {
          readyRafRef.current = null;
          onReady();
        });
      }
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <planeGeometry
        args={[PLANE_WIDTH, PLANE_HEIGHT, isWork ? 32 : 1, isWork ? 32 : 1]}
      />

      <portfolioImageMaterial
        ref={materialRef}
        uTexture={image}
        uImageAspect={imageAspect}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

interface ShaderImageProps {
  img: string;
  mode: ImageMode;
  isPlaying?: boolean;
  elevated?: boolean;
}

export function ShaderImage({
  img,
  mode,
  isPlaying = false,
  elevated = false,
}: ShaderImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewId = useId();
  const inline = useInlineCanvas();

  const { activeView, setActiveView } = useImageLayer();

  const [retainCanvas, setRetainCanvas] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const scrollSample = useRef<ScrollSample>({
    velocity: 0,
    updatedAt: 0,
  });

  // These survive an offscreen Canvas being released/recreated.
  const animation = useRef<AnimationState>({
    time: 0,
    velocity: 0,
    curves: 0,
    bend: 0,
    aberration: 0,
  });

  const isWork = mode === "work";

  // Subscribe in the DOM component, outside the separate Canvas root.
  useLenis((lenis) => {
    scrollSample.current.velocity = -lenis.velocity;
    scrollSample.current.updatedAt = performance.now();
  });

  useLayoutEffect(() => {
    if (!elevated) return;

    setActiveView(viewId);

    return () => {
      setActiveView((current) => (current === viewId ? null : current));
    };
  }, [elevated, viewId, setActiveView]);

  useLayoutEffect(() => {
    if (!inline) return;

    const element = containerRef.current;
    if (!element) return;

    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReleaseTimer = () => {
      if (releaseTimer !== null) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    };

    const update = (near: boolean) => {
      clearReleaseTimer();

      if (near) {
        setRetainCanvas(true);
      } else {
        releaseTimer = setTimeout(() => {
          setRetainCanvas(false);
        }, OFFSCREEN_RELEASE_DELAY_MS);
      }
    };

    const rect = element.getBoundingClientRect();

    update(
      rect.bottom >= -PRELOAD_MARGIN &&
        rect.top <= window.innerHeight + PRELOAD_MARGIN,
    );

    const observer = new IntersectionObserver(
      ([entry]) => {
        update(entry.isIntersecting);
      },
      { rootMargin: `${PRELOAD_MARGIN}px` },
    );

    observer.observe(element);

    return () => {
      clearReleaseTimer();
      observer.disconnect();
    };
  }, [inline]);

  const mountCanvas = retainCanvas || elevated || isPlaying;

  useLayoutEffect(() => {
    if (!mountCanvas) {
      setCanvasReady(false);
    }
  }, [mountCanvas]);

  useLayoutEffect(() => {
    setCanvasReady(false);
  }, [img]);

  const handleReady = useCallback(() => {
    setCanvasReady(true);
  }, []);

  const handleNotReady = useCallback(() => {
    setCanvasReady(false);
  }, []);

  const opacity = activeView === null || activeView === viewId ? 1 : 0;

  const position: [number, number, number] = [0, 0, isWork ? 3.3 : 1.3];

  const showCanvas = mountCanvas && canvasReady;

  return (
    <div
      ref={containerRef}
      className="image-canvas"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: inline ? opacity : 1,
        transition: inline ? "opacity 200ms ease" : undefined,
      }}
    >
      {inline ? (
        <>
          {/* Matches the resting shader's scale and image alignment.
              Remains available while WebGL loads or restores. */}
          <img
            src={img}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${100 / IMAGE_SCALE_DIVISOR}%`,
              height: `${100 / IMAGE_SCALE_DIVISOR}%`,
              maxWidth: "none",
              transform: "translate(-50%, -50%)",
              objectFit: "cover",
              objectPosition: "2% 2%",
              pointerEvents: "none",
              opacity: showCanvas ? 0 : 1,
              transition: "opacity 180ms ease",
            }}
          />

          {mountCanvas && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: showCanvas ? 1 : 0,
                transition: "opacity 180ms ease",
                pointerEvents: "none",
              }}
            >
              <Canvas
                dpr={[1, 2]}
                camera={{
                  position,
                  zoom: isWork ? 0.98 : 1,
                  fov: 75,
                }}
                gl={{
                  antialias: false,
                  alpha: true,
                }}
                resize={{
                  scroll: false,
                  debounce: {
                    scroll: 0,
                    resize: 0,
                  },
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  touchAction: "pan-y pinch-zoom",
                }}
                onCreated={({ gl }) => {
                  gl.domElement.style.touchAction = "pan-y pinch-zoom";
                }}
              >
                <Suspense fallback={null}>
                  <ImageScene
                    key={img}
                    img={img}
                    mode={mode}
                    isPlaying={isPlaying}
                    container={containerRef}
                    opacity={1}
                    inline
                    scrollSample={scrollSample}
                    animation={animation}
                    onReady={handleReady}
                    onNotReady={handleNotReady}
                  />
                </Suspense>
              </Canvas>
            </div>
          )}
        </>
      ) : (
        <View
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <PerspectiveCamera
            makeDefault
            position={position}
            zoom={isWork ? 0.98 : 1}
            fov={75}
          />

          <Suspense fallback={null}>
            <ImageScene
              key={img}
              img={img}
              mode={mode}
              isPlaying={isPlaying}
              container={containerRef}
              opacity={opacity}
              inline={false}
              scrollSample={scrollSample}
              animation={animation}
            />
          </Suspense>
        </View>
      )}
    </div>
  );
}

function ClearCanvas() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
  }, -1);

  return null;
}

export function ImageEffectsCanvas() {
  const inline = useInlineCanvas();
  const { activeView } = useImageLayer();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || inline) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      eventSource={document.body}
      eventPrefix="client"
      gl={{
        antialias: false,
        alpha: true,
      }}
      resize={{
        scroll: false,
        debounce: {
          scroll: 0,
          resize: 0,
        },
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: activeView === null ? 10 : 3000,
      }}
    >
      <ClearCanvas />
      <View.Port />
    </Canvas>
  );
}
