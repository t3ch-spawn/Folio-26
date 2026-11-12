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

const vertexShader = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.02,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.02
    );

    // Split channels vertically along the scroll axis so the fringing
    // reads as motion rather than a generic glitch.
    vec2 dir = vec2(0.0, uAberration);

    float r = texture2D(uTexture, uv + dir).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - dir).b;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

const AberrationMaterial = shaderMaterial(
  {
    uAberration: 0,
    uTexture: null as THREE.Texture | null,
    uImageAspect: 1,
    uPlaneAspect: 1,
  },
  vertexShader,
  fragmentShader,
);

extend({ AberrationMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    aberrationMaterial: ThreeElement<typeof AberrationMaterial>;
  }
}

type AberrationMaterialInstance = InstanceType<typeof AberrationMaterial>;

const PLANE_WIDTH = 4;
const PLANE_HEIGHT = 3;
const PLANE_ASPECT = PLANE_WIDTH / PLANE_HEIGHT;

const ABERRATION_STRENGTH = 0.008;
const MAX_ABERRATION = 0.04;

function ImagePlane({ img }: { img: string }) {
  const [image] = useLoader(THREE.TextureLoader, [img]);
  const materialRef = useRef<AberrationMaterialInstance>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const aberrationTargetRef = useRef(0);
  const aberrationRef = useRef(0);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const isSettledRef = useRef(false);
  const [imageAspect, setImageAspect] = useState(1);

  useEffect(() => {
    if (image?.image) {
      const { width, height } = image.image as HTMLImageElement;
      if (width && height) setImageAspect(width / height);
    }
  }, [image]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      isSettledRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useLenis((lenis) => {
    if (!isSettledRef.current) return;

    // lenis.velocity already carries Lenis's easing, so we only need
    // its magnitude here: the fringe is the same in both directions.
    aberrationTargetRef.current = THREE.MathUtils.clamp(
      Math.abs(lenis.velocity) * ABERRATION_STRENGTH,
      0,
      MAX_ABERRATION,
    );
  });

  useFrame(({ gl, camera }, delta) => {
    if (!materialRef.current || !meshRef.current) return;

    // Light catch-up ease toward the Lenis-driven target.
    const t = 1 - Math.exp(-8 * delta);
    aberrationRef.current +=
      (aberrationTargetRef.current - aberrationRef.current) * t;
    materialRef.current.uAberration = aberrationRef.current;

    // Lenis stops emitting once settled, so decay the target back to 0.
    aberrationTargetRef.current *= Math.exp(-2 * delta);

    const rect = gl.domElement.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    const persp = camera as THREE.PerspectiveCamera;
    const canvasAspect = w / h;

    // Cheap: keep camera aspect in sync every frame.
    if (persp.aspect !== canvasAspect) {
      persp.aspect = canvasAspect;
      persp.updateProjectionMatrix();
    }

    // Expensive: only reallocate the framebuffer when size really changed.
    if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
      lastSizeRef.current = { w, h };
      gl.setSize(w, h, false);
    }

    materialRef.current.uPlaneAspect = canvasAspect;

    // Scale the plane so it fills the visible area of the canvas.
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
      {/* No vertex displacement anymore, so a single quad is enough. */}
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT]} />
      <aberrationMaterial
        ref={materialRef}
        uTexture={image}
        uImageAspect={imageAspect}
        uPlaneAspect={PLANE_ASPECT}
      />
    </mesh>
  );
}

export default function AberrationImage({ img }: { img: string }) {
  return (
    <Canvas
      className="image-canvas !overflow-visible"
      dpr={2}
      camera={{ position: [0, 0, 1.3] }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
    >
      <ImagePlane img={img} />
    </Canvas>
  );
}