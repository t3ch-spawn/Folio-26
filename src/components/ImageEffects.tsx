import { Suspense, useEffect, useRef, useState } from "react";
import {
  Canvas,
  extend,
  useFrame,
  useLoader,
  type ThreeElement,
} from "@react-three/fiber";
import { PerspectiveCamera, View, shaderMaterial } from "@react-three/drei";
import { useLenis } from "lenis/react";
import * as THREE from "three";

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
      sin((modelPosition.z + modelPosition.y * 2.0) + uTime * 2.3)
      * uCurves;

    float edge = abs(uv.x - 0.5) * 4.4;
    modelPosition.y += uScrollBend * edge * edge;

    gl_Position = projectionMatrix * viewMatrix * modelPosition;
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

const PortfolioImageMaterial = shaderMaterial(
  {
    uTexture: null as THREE.Texture | null,
    uTime: 0,
    uCurves: 0,
    uScrollBend: 0,
    uAberration: 0,
    uImageAspect: 1,
    uPlaneAspect: 1,
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
type ImageMode = "work" | "aberration";

interface ImageSceneProps {
  img: string;
  mode: ImageMode;
  isPlaying: boolean;
  container: React.RefObject<HTMLDivElement | null>;
}

const PLANE_WIDTH = 4;
const PLANE_HEIGHT = 3;

function ImageScene({ img, mode, isPlaying, container }: ImageSceneProps) {
  const image = useLoader(THREE.TextureLoader, img);

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<MaterialInstance>(null);

  const elapsedRef = useRef(0);
  const curvesRef = useRef(0);
  const bendRef = useRef(0);
  const bendTargetRef = useRef(0);
  const aberrationRef = useRef(0);
  const aberrationTargetRef = useRef(0);

  const dimensionsRef = useRef({ width: 0, height: 0 });
  const previousSizeRef = useRef({ width: 0, height: 0 });
  const visibleRef = useRef(true);

  const isWork = mode === "work";
  const source = image.image as HTMLImageElement;
  const imageAspect = source.width / source.height || 1;

  useEffect(() => {
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

    // Observes layout size changes without polling the DOM every frame.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { rootMargin: "100px" },
    );

    intersectionObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [container]);

  useLenis((lenis) => {
    if (!visibleRef.current) return;

    const velocity = -lenis.velocity;

    bendTargetRef.current = isWork
      ? THREE.MathUtils.clamp(velocity * 0.0035, -0.4, 0.4)
      : 0;

    aberrationTargetRef.current = THREE.MathUtils.clamp(
      Math.abs(velocity) * (isWork ? 0.015 : 0.008),
      0,
      isWork ? 0.02 : 0.04,
    );
  });

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;

    if (!mesh || !material || !visibleRef.current) return;

    const dt = Math.min(delta, 0.05);

    if (isWork && isPlaying) {
      elapsedRef.current += dt * 4;
    }

    const curveTarget = isWork && isPlaying ? 0.2 : 0;

    curvesRef.current = THREE.MathUtils.lerp(
      curvesRef.current,
      curveTarget,
      1 - Math.exp(-4.6 * dt),
    );

    const smoothing = 1 - Math.exp(-(isWork ? 10 : 8) * dt);

    bendRef.current = THREE.MathUtils.lerp(
      bendRef.current,
      bendTargetRef.current,
      smoothing,
    );

    aberrationRef.current = THREE.MathUtils.lerp(
      aberrationRef.current,
      aberrationTargetRef.current,
      smoothing,
    );

    material.uTime = elapsedRef.current;
    material.uCurves = curvesRef.current;
    material.uScrollBend = bendRef.current;
    material.uAberration = aberrationRef.current;

    bendTargetRef.current *= Math.exp(-5 * dt);
    aberrationTargetRef.current *= Math.exp(-(isWork ? 5 : 2) * dt);

    let { width, height } = dimensionsRef.current;

    // ResizeObserver doesn't see CSS transforms.
    // Keep measuring during your GSAP/Flip animation only.
    if (isPlaying && container.current) {
      const rect = container.current.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dimensionsRef.current = { width, height };
    }

    if (width <= 0 || height <= 0) return;

    const previous = previousSizeRef.current;

    if (width === previous.width && height === previous.height) {
      return;
    }

    previousSizeRef.current = { width, height };

    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = width / height;

    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();

    material.uPlaneAspect = aspect;

    const distance = Math.abs(perspective.position.z - mesh.position.z);

    const visibleHeight =
      (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2) * distance) /
      perspective.zoom;

    const visibleWidth = visibleHeight * aspect;

    mesh.scale.set(
      visibleWidth / PLANE_WIDTH / 1.086,
      visibleHeight / PLANE_HEIGHT / 1.086,
      1,
    );
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
  const isWork = mode === "work";

  const cameraPosition: [number, number, number] = [0, 0, isWork ? 3.3 : 1.3];

  return (
    <div
      ref={containerRef}
      className="image-canvas"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {/* Normal images render through the shared background Canvas. */}
      <View
        visible={!elevated}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {!elevated && (
          <>
            <PerspectiveCamera
              makeDefault
              position={cameraPosition}
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
              />
            </Suspense>
          </>
        )}
      </View>

      {/* Only the selected image gets a local Canvas.
          It follows the wrapper's DOM position and CSS z-index. */}
      {elevated && (
        <Canvas
          dpr={[1, 1.5]}
          camera={{
            position: cameraPosition,
            zoom: isWork ? 0.98 : 1,
            fov: 75,
          }}
          gl={{
            antialias: false,
            alpha: true,
          }}
          resize={{
            scroll: false,
            debounce: { scroll: 0, resize: 0 },
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <Suspense fallback={null}>
            <ImageScene
              key={img}
              img={img}
              mode={mode}
              isPlaying={isPlaying}
              container={containerRef}
            />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

// Mount exactly once, at your application root.
export function ImageEffectsCanvas() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      eventSource={document.body}
      eventPrefix="client"
      gl={{
        antialias: false,
        alpha: true,
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <View.Port />
    </Canvas>
  );
}
