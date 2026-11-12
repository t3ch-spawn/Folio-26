import { FaReact } from "react-icons/fa";
import { RiTailwindCssFill, RiNextjsLine } from "react-icons/ri";
import {
  SiTypescript,
  SiBlender,
  SiVite,
  SiGsap,
  SiNetlify,
  SiVercel,
  SiGit,
  SiGithub,
} from "react-icons/si";
import { TbBrandFramerMotion } from "react-icons/tb";
import {
  useRef,
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type MouseEvent,
  type ReactNode,
} from "react";
import gsap from "gsap";
import Matter from "matter-js";

const DEFAULT_TOOL_SCALE = 3;

interface ToolDef {
  content: ReactElement;
  top: number; // base position, % of container height — single source of truth
  left: number; // base position, % of container width
  scale?: number; // visual scale of the icon only (the pill is never scaled)
  className?: string;
  toolName: string;
}

// Everything the physics sync needs for one tool, built once on mount.
// Only tools whose element actually rendered end up in here, so loops over
// it never need null checks.
interface ToolItem {
  el: HTMLDivElement;
  body: Matter.Body;
  origin: { x: number; y: number }; // container-relative center, px
}

const TOOL_DEFS: ToolDef[] = [
  { toolName: "React", content: <FaReact />, top: 50, left: 85 },
  {
    toolName: "TailwindCss",
    content: <RiTailwindCssFill />,
    top: 23,
    left: 10,
  },
  { toolName: "Next.js", content: <RiNextjsLine />, top: 76, left: 90 },
  { toolName: "Typescript", content: <SiTypescript />, top: 80, left: 52 },
  { toolName: "Git", content: <SiGit />, top: 77, left: 30 },
  { toolName: "GitHub", content: <SiGithub />, top: 84, left: 10 },
  { toolName: "Blender", content: <SiBlender />, top: 65, left: 65 },
  { toolName: "Vite", content: <SiVite />, top: 27, left: 70 },
  { toolName: "Gsap", content: <SiGsap />, top: 45, left: 50 },
  {
    toolName: "Framer-motion",
    content: <TbBrandFramerMotion />,
    top: 45,
    left: 30,
  },
  { toolName: "Netlify", content: <SiNetlify />, top: 60, left: 15 },
  { toolName: "Vercel", content: <SiVercel />, top: 23, left: 90 },
  {
    toolName: "Lenis",
    content: <p className="select-none">Lenis</p>,
    top: 15,
    left: 33,
    scale: 1,
    className: "font-bold text-2xl leading-[100%] cursor-pointer",
  },
];

export default function Tools() {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itemsRef = useRef<ToolItem[]>([]);

  // Lazy initial state: created once, never null, so no `if (!engine)` guards.
  const [engine] = useState(() => Matter.Engine.create());

  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);
  const syncPositionsRef = useRef<() => void>(() => {});

  const [gravityOn, setGravityOn] = useState(false);
  // Kept separate from gravityOn on purpose — this is what actually drives
  // <Bobber disableBobbing>, and it's flipped a beat before/after gravityOn
  // so bobbing and physics never both own the transform at the same time.
  const [bobbingEnabled, setBobbingEnabled] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    engine.gravity.y = 0; // starts off; toggled via the button

    const width = container.clientWidth;
    const height = container.clientHeight;
    const containerRect = container.getBoundingClientRect();

    const wallThickness = 80;
    const walls = [
      Matter.Bodies.rectangle(
        width / 2,
        height + wallThickness / 2,
        width + wallThickness * 2,
        wallThickness,
        { isStatic: true },
      ), // floor
      Matter.Bodies.rectangle(
        width / 2,
        -wallThickness / 2,
        width + wallThickness * 2,
        wallThickness,
        { isStatic: true },
      ), // ceiling
      Matter.Bodies.rectangle(
        -wallThickness / 2,
        height / 2,
        wallThickness,
        height + wallThickness * 2,
        { isStatic: true },
      ), // left
      Matter.Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height + wallThickness * 2,
        { isStatic: true },
      ), // right
    ];

    const items: ToolItem[] = [];
    itemRefs.current.forEach((el) => {
      if (!el) return;

      // Center: the outer div's layout box. CSS scale and bobbing only
      // move the Bobber inside it, so this is stable and sits at the same
      // center as the scaled icon.
      const rect = el.getBoundingClientRect();
      // Size: the Bobber's *painted* box (children[0]). getBoundingClientRect
      // includes the CSS scale, so the body matches what you actually see
      // instead of the smaller unscaled layout box.
      const painted = el.children[0].getBoundingClientRect();

      const origin = {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      };
      const body = Matter.Bodies.rectangle(
        origin.x,
        origin.y,
        painted.width,
        painted.height,
        { restitution: 0.55, friction: 0.15, frictionAir: 0.012 },
      );
      items.push({ el, body, origin });
    });
    itemsRef.current = items;

    Matter.World.add(engine.world, [...walls, ...items.map((i) => i.body)]);

    const mouse = Matter.Mouse.create(container);
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.2, render: { visible: false } },
    });
    mouseConstraintRef.current = mouseConstraint;
    // not added to the world yet — dragging only kicks in once physics is live

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    const syncPositions = () => {
      itemsRef.current.forEach(({ el, body, origin }) => {
        gsap.set(el, {
          x: body.position.x - origin.x,
          y: body.position.y - origin.y,
          rotation: (body.angle * 180) / Math.PI,
        });
      });
    };
    syncPositionsRef.current = syncPositions;

    return () => {
      Matter.Events.off(engine, "afterUpdate", syncPositions);
      Matter.World.remove(engine.world, mouseConstraint);
      Matter.Runner.stop(runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [engine]);

  const resetBodies = () => {
    itemsRef.current.forEach(({ body, origin }) => {
      Matter.Body.setPosition(body, origin);
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
      Matter.Body.setAngle(body, 0);
    });
  };

  const turnGravityOn = () => {
    setIsAnimating(true);

    // 1. bobbing off first (Bobber's own cleanup effect kills its tween
    // and zeroes its transform), *then* physics takes over — never both
    // driving a transform at once.
    setBobbingEnabled(false);

    requestAnimationFrame(() => {
      resetBodies();

      // 2. only now hand the outer boxes' transform over to physics
      Matter.Events.on(engine, "afterUpdate", syncPositionsRef.current);
      if (mouseConstraintRef.current) {
        Matter.World.add(engine.world, mouseConstraintRef.current);
      }
      engine.gravity.y = 1;

      setGravityOn(true);
      setIsAnimating(false);
    });
  };

  const turnGravityOff = () => {
    setIsAnimating(true);

    // 1. stop physics from driving the transform
    engine.gravity.y = 0;
    Matter.Events.off(engine, "afterUpdate", syncPositionsRef.current);
    if (mouseConstraintRef.current) {
      Matter.World.remove(engine.world, mouseConstraintRef.current);
    }
    setGravityOn(false);

    // 2. tween every box back to its original position
    const tl = gsap.timeline({
      onComplete: () => {
        resetBodies();
        // 3. only once everyone's home does bobbing resume
        setBobbingEnabled(true);
        setIsAnimating(false);
      },
    });

    itemsRef.current.forEach(({ el }) => {
      tl.to(
        el,
        { x: 0, y: 0, rotation: 0, duration: 0.8, ease: "power2.out" },
        0,
      );
    });
  };

  const toggleGravity = () => {
    if (isAnimating) return;
    gravityOn ? turnGravityOff() : turnGravityOn();
  };

  function clearPills() {
    document
      .querySelectorAll(".toolPill")
      .forEach((pill) => pill.classList.remove("active"));
  }

  function revealPill(e: MouseEvent<HTMLDivElement>) {
    clearPills();
    e.currentTarget.querySelector(".toolPill")?.classList.add("active");
  }

  return (
    <section className="flex flex-col items-center justify-center mt-[25vh]">
      <div className="flex w-full justify-between max-w-[700px] items-center gap-4">
        <h2 className="body-xl">Tools I use</h2>
        <button
          onClick={toggleGravity}
          disabled={isAnimating}
          className="cursor-pointer py-1 rounded-full cta-underline"
        >
          Gravity: {gravityOn ? "On" : "Off"}
        </button>
      </div>

      {/* Box of icons */}
      <div
        ref={containerRef}
        className="border-white/40 relative overflow-hidden border-2 rounded-3xl mt-[20px] w-full max-w-[700px] h-[370px]"
      >
        {TOOL_DEFS.map((def, i) => (
          <div
            key={def.toolName}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            // Outer div: positioned, measured by Matter, moved by physics.
            // It stays unscaled and shrink-wraps the Bobber. The scale is
            // exposed as a CSS variable so `.tool` (on the Bobber) can use
            // it and the pill can position itself against the scaled edge.
            className={def.className}
            style={
              {
                position: "absolute",
                top: `${def.top}%`,
                left: `${def.left}%`,
                "--tool-scale": def.scale ?? DEFAULT_TOOL_SCALE,
              } as CSSProperties
            }
            onMouseEnter={revealPill}
            onMouseLeave={clearPills}
          >
            <Bobber className="tool" disableBobbing={!bobbingEnabled}>
              {def.content}
            </Bobber>

            {!gravityOn && <ToolPill name={def.toolName} side="right" />}
          </div>
        ))}
      </div>

      <div
        className={` mt-[30px] duration-[500ms] ${gravityOn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-30px]"} `}
      >
        Flick the icons around :)
      </div>
    </section>
  );
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export type BobberProps = {
  children: ReactNode;
  className?: string;
  disableBobbing?: boolean;
  intensity?: number;
  speed?: [number, number];
};

/**
 * Bobber
 * Wraps `children` in a div and gently animates that div's x/y in a
 * random, yoyo-ing pattern, so the content stays where it was placed but
 * drifts slightly. When `disableBobbing` flips true, the effect's cleanup
 * kills the tween and resets x/y to 0 — so toggling the prop is enough to
 * cleanly start/stop bobbing from outside (used by Tools' gravity toggle
 * to sequence "stop bobbing" strictly before "start physics").
 *
 * Don't put `absolute` on it: the parent's size is measured from this
 * element being in flow.
 */
function Bobber({
  children,
  className,
  disableBobbing = false,
  intensity = 6,
  speed = [1.3, 2.6],
}: BobberProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [minSpeed, maxSpeed] = speed;

  useEffect(() => {
    const el = ref.current;
    if (!el || disableBobbing) return;

    const tween = gsap.to(el, {
      x: () => rand(-intensity, intensity),
      y: () => rand(-intensity, intensity),
      duration: () => rand(minSpeed, maxSpeed),
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      repeatRefresh: true,
    });

    return () => {
      tween.kill();
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [disableBobbing, intensity, minSpeed, maxSpeed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// Pill anchored to a top corner of the *scaled* icon. Offsets are
// percentages of the outer (unscaled) box, so 50% - 50% * scale is exactly
// where the scaled box's edge lands. The pill itself is never scaled.
const SCALED_EDGE = "calc(50% - 10% * var(--tool-scale, 1))";

function ToolPill({
  name,
  side = "right",
}: {
  name: string;
  side?: "left" | "right";
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-white text-[18px] px-2 flex justify-center text-black toolPill opacity-0 !font-normal"
      style={{ top: SCALED_EDGE, [side]: SCALED_EDGE, marginTop: -12 }}
    >
      {name}
    </div>
  );
}
