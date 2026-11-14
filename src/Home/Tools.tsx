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
  top: number;
  left: number;
  scale?: number;
  className?: string;
  toolName: string;
}

interface ToolItem {
  el: HTMLDivElement;
  body: Matter.Body;
  origin: { x: number; y: number };
}

const TOOL_DEFS: ToolDef[] = [
  { toolName: "React", content: <FaReact />, top: 50, left: 85 },
  {
    toolName: "TailwindCss",
    content: <RiTailwindCssFill />,
    top: 23,
    left: 10,
    className: "650:!left-[16%] 650:!top-[30%]",
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
    className:
      "font-bold text-2xl 768:text-[12px] leading-[100%] cursor-pointer",
  },
];

export default function Tools() {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itemsRef = useRef<ToolItem[]>([]);

  const [engine] = useState(() => Matter.Engine.create());

  const syncPositionsRef = useRef<() => void>(() => {});
  const releaseDragRef = useRef<() => void>(() => {});
  const gravityEnabledRef = useRef(false);
  const animatingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const resetTimelineRef = useRef<gsap.core.Timeline | null>(null);

  const [gravityOn, setGravityOn] = useState(false);
  const [bobbingEnabled, setBobbingEnabled] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    engine.gravity.y = 0;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const containerRect = container.getBoundingClientRect();

    // Account for the container's border when measuring body positions.
    const contentLeft = containerRect.left + container.clientLeft;
    const contentTop = containerRect.top + container.clientTop;

    const wallThickness = 80;

    const walls = [
      // Floor
      Matter.Bodies.rectangle(
        width / 2,
        height + wallThickness / 2,
        width + wallThickness * 2,
        wallThickness,
        { isStatic: true },
      ),
      // Ceiling
      Matter.Bodies.rectangle(
        width / 2,
        -wallThickness / 2,
        width + wallThickness * 2,
        wallThickness,
        { isStatic: true },
      ),
      // Left wall
      Matter.Bodies.rectangle(
        -wallThickness / 2,
        height / 2,
        wallThickness,
        height + wallThickness * 2,
        { isStatic: true },
      ),
      // Right wall
      Matter.Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height + wallThickness * 2,
        { isStatic: true },
      ),
    ];

    const items: ToolItem[] = [];

    itemRefs.current.forEach((el) => {
      if (!el || !el.children[0]) return;

      const rect = el.getBoundingClientRect();
      const painted = el.children[0].getBoundingClientRect();

      const origin = {
        x: rect.left - contentLeft + rect.width / 2,
        y: rect.top - contentTop + rect.height / 2,
      };

      const body = Matter.Bodies.rectangle(
        origin.x,
        origin.y,
        painted.width,
        painted.height,
        {
          restitution: 0.55,
          friction: 0.15,
          frictionAir: 0.012,
        },
      );

      items.push({ el, body, origin });
    });

    itemsRef.current = items;

    Matter.World.add(engine.world, [
      ...walls,
      ...items.map((item) => item.body),
    ]);

    // A regular constraint replaces Matter.MouseConstraint.
    // No Matter mouse/touch/wheel listeners are installed.
    const dragConstraint = Matter.Constraint.create({
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 0.2,
      damping: 0.1,
      render: { visible: false },
    });

    Matter.World.add(engine.world, dragConstraint);

    let activePointerId: number | null = null;

    const getPointerPosition = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();

      return {
        x: event.clientX - rect.left - container.clientLeft,
        y: event.clientY - rect.top - container.clientTop,
      };
    };

    const releaseDrag = () => {
      const pointerId = activePointerId;
      activePointerId = null;

      dragConstraint.bodyB = null;
      dragConstraint.pointB = { x: 0, y: 0 };

      if (pointerId !== null && container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
    };

    releaseDragRef.current = releaseDrag;

    const handlePointerDown = (event: PointerEvent) => {
      if (!gravityEnabledRef.current) return;
      if (activePointerId !== null || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const position = getPointerPosition(event);

      const hits = Matter.Query.point(
        items.map((item) => item.body),
        position,
      );

      const body = hits[hits.length - 1];
      if (!body) return;

      activePointerId = event.pointerId;

      dragConstraint.pointA.x = position.x;
      dragConstraint.pointA.y = position.y;

      // Matter's constraint anchor is relative to the body's center,
      // in its current orientation.
      dragConstraint.pointB = {
        x: position.x - body.position.x,
        y: position.y - body.position.y,
      };

      // @ts-ignore
      dragConstraint.angleB = body.angle;
      dragConstraint.bodyB = body;

      Matter.Sleeping.set(body, false);

      // Pointer capture keeps mouse dragging reliable outside the box.
      // Touch gestures remain subject to native pan-y scrolling.
      container.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;

      const position = getPointerPosition(event);

      dragConstraint.pointA.x = position.x;
      dragConstraint.pointA.y = position.y;
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      releaseDrag();
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerEnd);

    // When a vertical swipe becomes page scrolling, release the icon.
    container.addEventListener("pointercancel", handlePointerEnd);
    container.addEventListener("lostpointercapture", handlePointerEnd);
    window.addEventListener("blur", releaseDrag);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    const syncPositions = () => {
      items.forEach(({ el, body, origin }) => {
        gsap.set(el, {
          x: body.position.x - origin.x,
          y: body.position.y - origin.y,
          rotation: (body.angle * 180) / Math.PI,
        });
      });
    };

    syncPositionsRef.current = syncPositions;

    return () => {
      gravityEnabledRef.current = false;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      resetTimelineRef.current?.kill();
      resetTimelineRef.current = null;

      releaseDrag();

      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerEnd);
      container.removeEventListener("pointercancel", handlePointerEnd);
      container.removeEventListener("lostpointercapture", handlePointerEnd);

      window.removeEventListener("blur", releaseDrag);

      Matter.Events.off(engine, "afterUpdate", syncPositions);
      Matter.Runner.stop(runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);

      items.forEach(({ el }) => {
        gsap.set(el, { x: 0, y: 0, rotation: 0 });
      });

      itemsRef.current = [];
      releaseDragRef.current = () => {};
      syncPositionsRef.current = () => {};
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
    animatingRef.current = true;
    setIsAnimating(true);
    setBobbingEnabled(false);

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;

      resetBodies();

      Matter.Events.on(engine, "afterUpdate", syncPositionsRef.current);

      engine.gravity.y = 1;
      gravityEnabledRef.current = true;

      setGravityOn(true);
      animatingRef.current = false;
      setIsAnimating(false);
    });
  };

  const turnGravityOff = () => {
    animatingRef.current = true;
    setIsAnimating(true);

    gravityEnabledRef.current = false;
    releaseDragRef.current();

    engine.gravity.y = 0;

    Matter.Events.off(engine, "afterUpdate", syncPositionsRef.current);

    setGravityOn(false);

    const timeline = gsap.timeline({
      onComplete: () => {
        resetBodies();
        setBobbingEnabled(true);
        animatingRef.current = false;
        setIsAnimating(false);
        resetTimelineRef.current = null;
      },
    });

    resetTimelineRef.current = timeline;

    itemsRef.current.forEach(({ el }) => {
      timeline.to(
        el,
        {
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.8,
          ease: "power2.out",
        },
        0,
      );
    });
  };

  const toggleGravity = () => {
    if (animatingRef.current) return;

    gravityOn ? turnGravityOff() : turnGravityOn();
  };

  function clearPills() {
    containerRef.current
      ?.querySelectorAll(".toolPill")
      .forEach((pill) => pill.classList.remove("active"));
  }

  function revealPill(event: MouseEvent<HTMLDivElement>) {
    clearPills();

    event.currentTarget.querySelector(".toolPill")?.classList.add("active");
  }

  return (
    <section className="flex flex-col items-center justify-center mt-[200px] 768:mt-[140px] px-[16px]">
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

      <div
        ref={containerRef}
        className="border-white/40 relative overflow-hidden border-2 rounded-3xl mt-[20px] w-full max-w-[700px] h-[370px] select-none"
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        {TOOL_DEFS.map((def, index) => (
          <div
            key={def.toolName}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={def.className}
            style={
              {
                position: "absolute",
                top: `${def.top}%`,
                left: `${def.left}%`,
                "--tool-scale": def.scale ?? DEFAULT_TOOL_SCALE,
                touchAction: "pan-y pinch-zoom",
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
        className={`mt-[30px] duration-[500ms] ${
          gravityOn
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-[-30px]"
        }`}
      >
        Drag sideways to flick the icons :)
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
    <div
      ref={ref}
      className={className}
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      {children}
    </div>
  );
}

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
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-white text-[18px] 650:text-[13px] px-2 650:py-[2px] 650:mr-3 flex justify-center text-black toolPill opacity-0 !font-normal"
      style={{
        top: SCALED_EDGE,
        [side]: SCALED_EDGE,
        marginTop: -12,
      }}
    >
      {name}
    </div>
  );
}
