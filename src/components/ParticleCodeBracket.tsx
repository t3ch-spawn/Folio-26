// Floating particle "</>" code-bracket
// Same architecture as the Lorenz/Rössler morph: per-particle target chasing,
// mouse-ray displacement with spring-back, EXCEPT the target shape is a
// static point cloud sampled along the code-bracket glyph instead of a
// live-evolving attractor, and drift is gentle sinusoidal floating rather
// than a trail-fill.

import React, { useRef, useMemo, useCallback, Suspense } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = window.innerWidth < 600 ? 2500 : 10000;

// How far particles wander from their "home" position on the glyph.
const FLOAT_AMPLITUDE = 0.0;
// How hard particles get pulled back toward their home position.
const SPRING_STRENGTH = 1.2;
// Cap on return speed so the reform doesn't look snappy/robotic.
const MAX_SPEED = 6.4;
// How strongly the mouse ray pushes nearby particles apart.
const MOUSE_INTENSITY = 0.4;

// Tune the glyph's on-screen size via scale, not by moving the camera closer —
// scaling the group keeps the camera/plane relationship (and therefore the
// mouse interaction) intact no matter what size you land on.
const CAMERA_Z = 9;
const GROUP_SCALE = 1.5;
// How far in front of the camera the invisible mouse-plane sits. Must always
// resolve to a smaller z than the camera (camera looks down -z), so it's
// derived from CAMERA_Z instead of a hardcoded absolute world position.
const PLANE_OFFSET_FROM_CAMERA = 10;

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

/**
 * One thick "bar" segment, sampled as a rounded tube between a and b.
 * Three bars (two chevrons + one diagonal) compose the "</>" glyph.
 */
interface Bar {
  a: THREE.Vector3;
  b: THREE.Vector3;
  halfWidth: number;
  halfDepth: number;
}

function buildBrackets(): Bar[] {
  return [
    // "<" — left chevron, two strokes meeting at a left-pointing vertex
    {
      a: new THREE.Vector3(-2.1, 3.0, 0.1),
      b: new THREE.Vector3(-4.6, 0.35, 0.4),
      halfWidth: 0.5,
      halfDepth: 0.45,
    },
    {
      a: new THREE.Vector3(-4.6, 0.35, 0.4),
      b: new THREE.Vector3(-2.0, -2.35, 0.7),
      halfWidth: 0.5,
      halfDepth: 0.45,
    },

    // ">" — right chevron, mirrored and slightly larger to match the glyph
    {
      a: new THREE.Vector3(0.55, 3.6, -0.2),
      b: new THREE.Vector3(3.65, 0.55, 0.45),
      halfWidth: 0.5,
      halfDepth: 0.45,
    },
    {
      a: new THREE.Vector3(3.65, 0.55, 0.45),
      b: new THREE.Vector3(0.15, -3.35, 0.9),
      halfWidth: 0.5,
      halfDepth: 0.45,
    },

    // "/" — the diagonal slash through the middle
    {
      a: new THREE.Vector3(-1.0, -3.6, 0.55),
      b: new THREE.Vector3(1.6, 3.85, -0.3),
      halfWidth: 0.42,
      halfDepth: 0.4,
    },
  ];
}

/** Fills `out` (length count*3) with points sampled along the glyph bars. */
function buildBracketTargets(count: number, out: Float32Array) {
  const bars = buildBrackets();
  const lengths = bars.map((bar) => bar.a.distanceTo(bar.b));
  const totalLength = lengths.reduce((sum, l) => sum + l, 0);

  const dir = new THREE.Vector3();
  const perpA = new THREE.Vector3();
  const perpB = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const point = new THREE.Vector3();

  let written = 0;
  for (let barIndex = 0; barIndex < bars.length; barIndex++) {
    const bar = bars[barIndex];
    const isLast = barIndex === bars.length - 1;
    const share = isLast
      ? count - written
      : Math.round((lengths[barIndex] / totalLength) * count);

    dir.copy(bar.b).sub(bar.a).normalize();
    perpA.crossVectors(dir, up).normalize();
    if (perpA.lengthSq() < 0.001) perpA.set(1, 0, 0);
    perpB.crossVectors(dir, perpA).normalize();

    for (let n = 0; n < share; n++) {
      const t = Math.random();
      point.copy(bar.a).lerp(bar.b, t);

      const w = (Math.random() * 2 - 1) * bar.halfWidth;
      const d = (Math.random() * 2 - 1) * bar.halfDepth;
      point.addScaledVector(perpA, w).addScaledVector(perpB, d);

      const j = (written + n) * 3;
      out[j] = point.x;
      out[j + 1] = point.y;
      out[j + 2] = point.z;
    }
    written += share;
  }
}

function makeSoftDotTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.7, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface SimState {
  particleArray: Float32Array;
  targetArray: Float32Array;
  colorArray: Float32Array;
  phase: Float32Array; // per-axis phase offset, length count*3
  freq: Float32Array; // per-axis frequency, length count*3
  mousePosition: THREE.Vector3;
  lastMousePoint: THREE.Vector3;
  mouseTravel: number;
  time: number;
  particlePos: THREE.Vector3;
  tempVec: THREE.Vector3;
  tempVec2: THREE.Vector3;
  rayDirection: THREE.Vector3;
  closestPointOnRay: THREE.Vector3;
  direction: THREE.Vector3;
  // Camera + mouse re-expressed in the (rotating/bobbing) group's local
  // space each frame, so the mouse ray lines up with the particle positions
  // (which are stored in local space). Without this, the ray math is done
  // in world space against local-space particle coordinates, and the
  // influence drifts off the actual cursor position as the group rotates.
  localCameraPos: THREE.Vector3;
  localMousePos: THREE.Vector3;
}

function createSimState(): SimState {
  const targetArray = new Float32Array(PARTICLE_COUNT * 3);
  buildBracketTargets(PARTICLE_COUNT, targetArray);

  // Particles start already formed (compact + distinct from frame one),
  // then the floating drift + mouse interaction take over.
  const particleArray = targetArray.slice();
  const colorArray = new Float32Array(PARTICLE_COUNT * 3);

  const phase = new Float32Array(PARTICLE_COUNT * 3);
  const freq = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < phase.length; i++) {
    phase[i] = Math.random() * Math.PI * 2;
    freq[i] = 0.25 + Math.random() * 0.5; // slow, varied drift speeds
  }

  for (let i = 0; i < colorArray.length; i += 3) {
    colorArray[i] = 0.4;
    colorArray[i + 1] = 0.78;
    colorArray[i + 2] = 1.0;
  }

  return {
    particleArray,
    targetArray,
    colorArray,
    phase,
    freq,
    mousePosition: new THREE.Vector3(0.1, 0.1, 0.1),
    lastMousePoint: new THREE.Vector3(),
    mouseTravel: 0,
    time: 0,
    particlePos: new THREE.Vector3(),
    tempVec: new THREE.Vector3(),
    tempVec2: new THREE.Vector3(),
    rayDirection: new THREE.Vector3(0, 0, 1),
    closestPointOnRay: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 1),
    localCameraPos: new THREE.Vector3(),
    localMousePos: new THREE.Vector3(),
  };
}

interface ParticlesProps {
  mouseRef: React.MutableRefObject<THREE.Vector3>;
}

function Particles({ mouseRef }: ParticlesProps) {
  const dotTexture = useMemo(() => makeSoftDotTexture(), []);
  const geometryRef = useRef<THREE.BufferGeometry>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const state = useMemo(() => createSimState(), []);
  const { camera } = useThree();

  useFrame((_, delta) => {
    const s = state;
    const clampedDelta = Math.min(delta, 0.1);
    s.time += clampedDelta;

    // Update the group's rotation/position FIRST, then refresh its world
    // matrix so the local-space camera/mouse conversion below matches what
    // is actually rendered this frame.
    if (groupRef.current) {
      groupRef.current.rotation.y += clampedDelta * 0.55;
      groupRef.current.position.y = Math.sin(s.time * 0.95) * 0.9;
      groupRef.current.updateMatrixWorld();
    }

    s.mousePosition.lerp(mouseRef.current, 10.0 * clampedDelta);

    // Bring camera + mouse into the group's LOCAL space so the ray math
    // stays consistent with the particle positions (which are stored in
    // local space) as the group rotates and bobs.
    let cameraPos = camera.position;
    let mouseWorld: THREE.Vector3 = s.mousePosition;
    if (groupRef.current) {
      s.localCameraPos.copy(camera.position);
      groupRef.current.worldToLocal(s.localCameraPos);
      s.localMousePos.copy(s.mousePosition);
      groupRef.current.worldToLocal(s.localMousePos);
      cameraPos = s.localCameraPos;
      mouseWorld = s.localMousePos;
    }

    s.rayDirection.copy(mouseWorld).sub(cameraPos).normalize();

    const mouseDelta = mouseRef.current.distanceTo(s.lastMousePoint);
    s.mouseTravel += mouseDelta * 8.0 * clampedDelta;
    s.lastMousePoint.copy(mouseRef.current);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const j = i * 3;

      // Gentle floating drift around the "home" position on the glyph.
      const floatX =
        Math.sin(s.time * s.freq[j] + s.phase[j]) * FLOAT_AMPLITUDE;
      const floatY =
        Math.sin(s.time * s.freq[j + 1] + s.phase[j + 1]) * FLOAT_AMPLITUDE;
      const floatZ =
        Math.sin(s.time * s.freq[j + 2] + s.phase[j + 2]) * FLOAT_AMPLITUDE;

      const targetX = s.targetArray[j] + floatX;
      const targetY = s.targetArray[j + 1] + floatY;
      const targetZ = s.targetArray[j + 2] + floatZ;

      const x = s.particleArray[j];
      const y = s.particleArray[j + 1];
      const z = s.particleArray[j + 2];

      s.particlePos.set(x, y, z);

      const vectorV = s.tempVec.copy(s.particlePos).sub(cameraPos);
      const projectionLength = vectorV.dot(s.rayDirection);
      s.closestPointOnRay
        .copy(cameraPos)
        .add(s.tempVec2.copy(s.rayDirection).multiplyScalar(projectionLength));

      const distanceToRay = s.particlePos.distanceTo(s.closestPointOnRay);
      const influence = Math.min(
        (1 / Math.max(distanceToRay, 0.001)) * MOUSE_INTENSITY * s.mouseTravel,
        4.0,
      );
      s.direction.copy(s.particlePos).sub(s.closestPointOnRay).normalize();

      // Pull back toward the (floating) target, spring-style.
      const dx = targetX - x;
      const dy = targetY - y;
      const dz = targetZ - z;
      const vx = clamp(dx * SPRING_STRENGTH, -MAX_SPEED, MAX_SPEED);
      const vy = clamp(dy * SPRING_STRENGTH, -MAX_SPEED, MAX_SPEED);
      const vz = clamp(dz * SPRING_STRENGTH, -MAX_SPEED, MAX_SPEED);

      s.particleArray[j] =
        x + vx * clampedDelta + s.direction.x * influence * clampedDelta * 6.0;
      s.particleArray[j + 1] =
        y + vy * clampedDelta + s.direction.y * influence * clampedDelta * 6.0;
      s.particleArray[j + 2] =
        z + vz * clampedDelta + s.direction.z * influence * clampedDelta * 6.0;

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const brightness = clamp(1.0 - dist * 0.12, 0.35, 1.0);
      s.colorArray[j] = 1.0 * brightness;
      s.colorArray[j + 1] = 1.0 * brightness;
      s.colorArray[j + 2] = brightness;
    }

    s.mouseTravel -= clampedDelta * 0.6;
    s.mouseTravel = clamp(s.mouseTravel, 0.0, 0.5);

    const geo = geometryRef.current;
    geo.setAttribute("position", new THREE.BufferAttribute(s.particleArray, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(s.colorArray, 3));
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={groupRef} scale={GROUP_SCALE} position={[0, 0, -12.0]}>
      <points frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <pointsMaterial
          size={window.innerWidth < 600 ? 0.16 : 0.1}
          map={dotTexture}
          transparent
          vertexColors
          depthWrite={false}
        />
      </points>
    </group>
  );
}

interface PointerPlaneProps {
  mouseRef: React.MutableRefObject<THREE.Vector3>;
}

function PointerPlane({ mouseRef }: PointerPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();

  useFrame(() => {
    meshRef.current?.quaternion.copy(camera.quaternion);
    // Keep the plane in front of the camera even if camera.position.z changes.
    meshRef.current.position.z = camera.position.z - PLANE_OFFSET_FROM_CAMERA;
  });

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent> | ThreeEvent<WheelEvent>) => {
      event.stopPropagation();
      if (event.point) {
        mouseRef.current.copy(event.point);
      }
    },
    [mouseRef],
  );

  return (
    <mesh
      ref={meshRef}
      position={[0, 0, CAMERA_Z - PLANE_OFFSET_FROM_CAMERA]}
      onPointerMove={handlePointerMove}
      onWheel={handlePointerMove}
    >
      <planeGeometry args={[360, 360]} />
      <meshStandardMaterial color="#001122" visible={false} />
    </mesh>
  );
}

export default function ParticleCodeBracket() {
  const mouseRef = useRef(new THREE.Vector3(0.1, 0.1, 0.1));

  return (
    <div className="absolute inset-0 left-[-5%] 600:h-[60%] 600:top-[-5%] h-full w-full pointer-events-auto z-[1]">
      <Canvas gl={{ antialias: true }} dpr={[1, 2]}>
        <PerspectiveCamera
          makeDefault
          position={[0, 0, CAMERA_Z]}
          fov={75}
          near={1}
        />
        <OrbitControls
          enablePan={false}
          enableRotate={false}
          enableDamping={false}
          enableZoom={false}
        />
        <Suspense fallback={null}>
          <Particles mouseRef={mouseRef} />
        </Suspense>
        <PointerPlane mouseRef={mouseRef} />
      </Canvas>
    </div>
  );
}