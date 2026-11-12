import { useRef } from "react";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import type { ThreeElement } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useInView } from "framer-motion";

// ─── Shaders ────────────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;
uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;

// smooth-min: blends two distance fields together with a gooey neck
// where they get close, instead of a hard boundary
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv;
  p.x *= u_resolution.x / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;

  float t = u_time * 0.4;

  vec3 black     = vec3(0.015, 0.015, 0.017);
  vec3 darkGray  = vec3(0.16, 0.16, 0.17);
  vec3 lightGray = vec3(0.30, 0.30, 0.31);

  // angle drifts via three incommensurate frequencies so it never retraces
  float angle = 0.6
    + 1.3 * sin(t * 0.8)
    + 0.6 * sin(t * 0.317 + 1.1)
    + 0.35 * sin(t * 0.129 + 3.4);
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 center = vec2(0.5 * aspect, 0.5);
  float g = clamp(dot(p - center, dir) + 0.5, 0.0, 1.0);
  vec3 col = mix(black, darkGray, g);

  // ── dark blob pair ──
  vec2 blob1 = vec2(
    0.30 + 0.22 * sin(t * 1.8) + 0.10 * sin(t * 0.53 + 4.1) + 0.06 * sin(t * 0.211 + 2.6),
    0.65 + 0.18 * cos(t * 1.5 + 1.0) + 0.10 * cos(t * 0.71 + 2.2) + 0.06 * cos(t * 0.193 + 5.0)
  ) * vec2(aspect, 1.0);
  float r1 = 0.92;
  float d1 = length(p - blob1);

  vec2 blob2 = vec2(
    0.78 + 0.18 * sin(t * 1.4 + 2.3) + 0.09 * sin(t * 0.61 + 0.7) + 0.05 * sin(t * 0.243 + 4.8),
    0.30 + 0.22 * cos(t * 1.7 + 0.6) + 0.09 * cos(t * 0.44 + 3.5) + 0.05 * cos(t * 0.177 + 1.3)
  ) * vec2(aspect, 1.0);
  float r2 = 0.66;
  float d2 = length(p - blob2);

  float dDark = smin(d1, d2, 0.16);
  float rDark = mix(r1, r2, 0.5);
  float mDark = exp(-(dDark * dDark) / (rDark * rDark));
  col = mix(col, black, mDark * 0.55);

  // ── light blob pair (main + small) ──
  vec2 blob3 = vec2(
    0.5 + 0.34 * cos(t * 1.1) + 0.12 * cos(t * 0.37 + 1.7) + 0.07 * cos(t * 0.157 + 3.9),
    0.5 + 0.30 * sin(t * 1.35) + 0.12 * sin(t * 0.29 + 2.9) + 0.07 * sin(t * 0.223 + 0.4)
  ) * vec2(aspect, 1.0);
  float r3 = 0.50;
  float d3 = length(p - blob3);

  vec2 blob4 = vec2(
    0.62 + 0.24 * sin(t * 1.05 + 3.2) + 0.09 * sin(t * 0.41 + 1.4) + 0.05 * sin(t * 0.189 + 5.5),
    0.72 + 0.20 * cos(t * 1.25 + 0.9) + 0.09 * cos(t * 0.33 + 4.6) + 0.05 * cos(t * 0.201 + 2.1)
  ) * vec2(aspect, 1.0);
  float r4 = 0.56;
  float d4 = length(p - blob4);

  float dLight = smin(d3, d4, 0.14);
  float rLight = mix(r3, r4, 0.5);
  float mLight = exp(-(dLight * dLight) / (rLight * rLight));
  col = mix(col, lightGray, mLight * 0.42);

  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time) * 43758.5453) - 0.5) / 255.0;
  col += dither;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Custom shader material, registered once as a JSX intrinsic ───────────

const ShaderBackgroundMaterialGray = shaderMaterial(
  { u_time: 0, u_resolution: { x: 0.0, y: 0.0 } },

  vertexShader,
  fragmentShader,
);

extend({ ShaderBackgroundMaterialGray });

declare module "@react-three/fiber" {
  interface ThreeElements {
    shaderBackgroundMaterialGray: ThreeElement<
      typeof ShaderBackgroundMaterialGray
    >;
  }
}

type ShaderBackgroundMaterialGrayInstance = InstanceType<
  typeof ShaderBackgroundMaterialGray
>;

// ─── Plane ──────────────────────────────────────────────────────────────────

function ShaderPlane() {
  const materialRef = useRef<ShaderBackgroundMaterialGrayInstance>(null);

  useFrame(({ clock, gl }) => {
    // 🧊 HARD STOP when not visible
    if (!materialRef.current) return;
    materialRef.current.u_time = clock.getElapsedTime();
    materialRef.current.u_resolution = {
      x: gl.domElement.width,
      y: gl.domElement.height,
    };
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderBackgroundMaterialGray
        ref={materialRef}
        key={ShaderBackgroundMaterialGray.key}
      />
    </mesh>
  );
}

// ─── Background ─────────────────────────────────────────────────────────────

export default function ShaderBackgroundGray({
  //   top,
  //   bottom,
  endTrigger,
  //   hasTop,
  //   hasBottom,
  //   spacerIssue,
}: {
  endTrigger?: string;
  top?: number;
  bottom?: number;
  hasTop?: boolean;
  hasBottom?: boolean;
  spacerIssue?: boolean;
}) {
  const canvasWrapper = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.to(canvasWrapper.current, {
      scrollTrigger: {
        trigger: canvasWrapper.current,
        pin: true,
        // markers: true,
        pinSpacing: false,
        start: "top top",
        endTrigger: endTrigger || ".gray-shader-cont",
        end: "bottom bottom",
      },
    });
  });

  const isInView = useInView(canvasWrapper, {
    margin: "-2% 0px -2% 0px",
  });

  return (
    <div
      ref={canvasWrapper}
      className="max-h-[100vh] w-full h-full bg-[#0A0A0A] pointer-events-none"
      style={{ position: "absolute", inset: 0, zIndex: -1 }}
    >
      {/* Overlayed noise */}
      <img
        src="/images/noise.png"
        className="absolute inset-0 w-full h-full z-[2]"
        alt="noise"
      />
      <Canvas
        orthographic
        camera={{ left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 10 }}
        dpr={1}
        gl={{ antialias: false }}
        frameloop={isInView ? "always" : "never"}
        style={{
          opacity: isInView ? 1 : 0,
          transition: "opacity 0.6s ease",
        }}
      >
        <ShaderPlane />
      </Canvas>
    </div>
  );
}
