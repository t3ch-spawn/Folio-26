import { useRef, useMemo, useCallback, Suspense } from "react";
import type { MutableRefObject } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = window.innerWidth < 600 ? 4500 : 10000;

const FLOAT_AMPLITUDE = 0.0;
const SPRING_STRENGTH = 1.2;
const MAX_SPEED = 6.4;
const MOUSE_INTENSITY = 0.4;

const CAMERA_Z = 9;
const GROUP_SCALE = 1.5;
const PLANE_OFFSET_FROM_CAMERA = 10;

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

interface Bar {
  a: THREE.Vector3;
  b: THREE.Vector3;
  halfWidth: number;
  halfDepth: number;
}

function buildBrackets(): Bar[] {
  return [
    // Left chevron
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

    // Right chevron
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

    // Center slash
    {
      a: new THREE.Vector3(-1.0, -3.6, 0.55),
      b: new THREE.Vector3(1.6, 3.85, -0.3),
      halfWidth: 0.42,
      halfDepth: 0.4,
    },
  ];
}

function buildBracketTargets(count: number, out: Float32Array) {
  const bars = buildBrackets();
  const lengths = bars.map((bar) => bar.a.distanceTo(bar.b));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);

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

    if (perpA.lengthSq() < 0.001) {
      perpA.set(1, 0, 0);
    }

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
  gradient.addColorStop(0.8, "rgba(255,255,255,1)");
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
  phase: Float32Array;
  freq: Float32Array;
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
  localCameraPos: THREE.Vector3;
  localMousePos: THREE.Vector3;
}

function createSimState(): SimState {
  const targetArray = new Float32Array(PARTICLE_COUNT * 3);

  buildBracketTargets(PARTICLE_COUNT, targetArray);

  const particleArray = targetArray.slice();
  const colorArray = new Float32Array(PARTICLE_COUNT * 3);
  const phase = new Float32Array(PARTICLE_COUNT * 3);
  const freq = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < phase.length; i++) {
    phase[i] = Math.random() * Math.PI * 2;
    freq[i] = 0.25 + Math.random() * 0.5;
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

interface PointerProps {
  mouseRef: MutableRefObject<THREE.Vector3>;
}

function Particles({ mouseRef }: PointerProps) {
  const dotTexture = useMemo(() => makeSoftDotTexture(), []);
  const geometryRef = useRef<THREE.BufferGeometry>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const state = useMemo(() => createSimState(), []);
  const { camera } = useThree();

  useFrame((_, delta) => {
    const s = state;
    const clampedDelta = Math.min(delta, 0.1);

    s.time += clampedDelta;

    if (groupRef.current) {
      groupRef.current.rotation.y += clampedDelta * 0.55;
      groupRef.current.position.y = Math.sin(s.time * 0.95) * 0.9;
      groupRef.current.updateMatrixWorld();
    }

    s.mousePosition.lerp(mouseRef.current, 10.0 * clampedDelta);

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

      s.colorArray[j] = brightness;
      s.colorArray[j + 1] = brightness;
      s.colorArray[j + 2] = brightness;
    }

    s.mouseTravel = clamp(s.mouseTravel - clampedDelta * 0.6, 0.0, 0.5);

    // Reuse the existing attributes instead of allocating them every frame.
    const geo = geometryRef.current;

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={groupRef} scale={GROUP_SCALE} position={[0, 0, -12.0]}>
      <points frustumCulled={false}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[state.particleArray, 3]}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[state.colorArray, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>

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

function PointerPlane({ mouseRef }: PointerProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.quaternion.copy(camera.quaternion);
    mesh.position.z = camera.position.z - PLANE_OFFSET_FROM_CAMERA;
  });

  const handlePointer = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      // Observe the pointer without preventing native page scrolling.
      mouseRef.current.copy(event.point);
    },
    [mouseRef],
  );

  return (
    <mesh
      ref={meshRef}
      position={[0, 0, CAMERA_Z - PLANE_OFFSET_FROM_CAMERA]}
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
    >
      <planeGeometry args={[360, 360]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

export default function ParticleCodeBracket() {
  const mouseRef = useRef(new THREE.Vector3(0.1, 0.1, 0.1));

  return (
    <div
      className="absolute inset-0 left-[-5%] 768:left-0 650:h-[80%] 650:top-[17%] h-full w-full pointer-events-auto z-[1]"
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      <Canvas
        gl={{ antialias: true }}
        dpr={[1, 2]}
        style={{ touchAction: "pan-y pinch-zoom" }}
        onCreated={({ gl }) => {
          gl.domElement.style.touchAction = "pan-y pinch-zoom";
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={[0, 0, CAMERA_Z]}
          fov={75}
          near={1}
        />

        <Suspense fallback={null}>
          <Particles mouseRef={mouseRef} />
        </Suspense>

        <PointerPlane mouseRef={mouseRef} />
      </Canvas>
    </div>
  );
}
