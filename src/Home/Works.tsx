import { useEffect, useRef, useState } from "react";
import WorkImage from "../components/WorkImage";
import { AnimatePresence, motion } from "framer-motion";
import { disableLenis, enableLenis } from "../lib/utils";
import gsap from "gsap";
import { Flip } from "gsap/all";
import ReactLenis from "lenis/react";
import type { Work } from "../lib/types";
import { FiArrowUpRight } from "react-icons/fi";
import { works } from "../lib/works";

gsap.registerPlugin(Flip);

export default function Works() {
  return (
    <section
      id="works"
      className="mt-[300px] 1024:mt-[130px] px-[40px] 650:px-[16px] scroll-mt-40"
    >
      <h2 className="body-xl">Selected Works.</h2>

      {/* Container for Work cards and details */}
      <div className="flex flex-col gap-[200px] 1024:gap-[160px] 650:gap-[100px] mt-[90px] 1024:mt-[40px]">
        {/* Container for One work */}
        {works.map((work) => {
          return <Work {...work} />;
        })}
      </div>
    </section>
  );
}

function Work({ title, siteLink, details, img, summary }: Work) {
  const [open, setOpen] = useState(false);
  const [waveActive, setWaveActive] = useState(false);
  const [elevated, setElevated] = useState(false);
  const workImgParent = useRef<HTMLDivElement>(null);
  const workImgCont = useRef<HTMLDivElement>(null);
  const expandedWorkCont = useRef<HTMLDivElement>(null);

  function moveWorkImg() {
    if (!workImgCont.current) return;

    Flip.fit(workImgCont.current, expandedWorkCont.current, {
      duration: 1,
      ease: "power1.inOut",
      absolute: true,
      overwrite: true,
      onComplete: () => {
        // Now that the animation is done, physically move it
        expandedWorkCont.current?.appendChild(workImgCont.current as Node);
        gsap.set(workImgCont.current, {
          x: 0,
          y: 0,
          scale: 1,
          position: "relative",
          height: "100%",
          width: "100%",
        });

        // Transition has actually finished — stop the wave.
        setWaveActive(false);
      },
    });
  }

  function revertWorkImg() {
    // Capture state from its current (inspect) position
    const currentState = Flip.getState(workImgCont.current);

    // Move it back to original parent
    workImgParent.current?.appendChild(workImgCont.current as Node);

    // Animate FROM the inspect position back to original
    Flip.from(currentState, {
      duration: 1,
      ease: "power1.inOut",
      // scale: true,
      absolute: true,
      overwrite: true,
      onComplete: () => {
        // Clear every inline style Flip/moveWorkImg left behind (position,
        // width, height, x, y, scale, ...) so workImgCont goes back to
        // being fully governed by its Tailwind classes again. Leaving
        // stale inline width:100%/height:100% around was compounding the
        // "flashes to full width" glitch on the *next* open/close cycle.
        gsap.set(workImgCont.current, { clearProps: "all" });

        // Transition has actually finished — stop the wave.
        setWaveActive(false);
      },
    });
  }

  useEffect(() => {
    if (open) {
      // setImgReady(false);
      disableLenis();
      setWaveActive(true);
      moveWorkImg();
    } else {
      // setImgReady(false);
      enableLenis();
      setWaveActive(true);
      revertWorkImg();
      setTimeout(() => {
        setElevated(false);
      }, 200);
    }
  }, [open]);

  return (
    <div className="flex 1024:flex-col-reverse 1024:items-center 1024:gap-[60px] 650:gap-[40px] justify-between items-center">
      <div className="w-full max-w-[590px] flex flex-col 1024:items-center gap-[30px] 1024:gap-[10px]">
        <h2 className="body-h2 650:text-center tracking-tight uppercase">
          {title}
        </h2>

        <p className="body-lg 650:text-lg 1024:text-center mt-[20px] max-w-[80%] 768:max-w-full leading-[120%]">
          {summary}
        </p>

        <div className="flex justify-between items-center max-w-[75%] w-full 1024:mt-[15px]">
          <button
            onClick={() => {
              setOpen(true);
              setElevated(true);
            }}
            className="cursor-pointer cta-underline"
          >
            View more
          </button>

          <a href={siteLink} className="cta-underline" target="_blank">
            Site
          </a>
        </div>
      </div>

      <div
        onClick={() => {
          setOpen(true);
          setElevated(true);
        }}
        className="relative w-full max-w-[500px] max-h-[310px] 650:max-h-[200px] aspect-[1.3/1.1] cursor-pointer"
        ref={workImgParent}
      >
        <div
          ref={workImgCont}
          className={`aspect-[1.3/1] w-full h-full origin-center relative object-cover ${
            elevated ? "!z-[3000]" : "!z-[1]"
          }`}
        >
          <WorkImage
            img={`/images/${img}.png`}
            isPlaying={waveActive}
            elevated={elevated}
          />
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed z-[200] w-full h-full inset-0 flex justify-center"
            initial={{ opacity: 0, pointerEvents: "none" }}
            animate={{ opacity: 1, pointerEvents: "all" }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <button
              onClick={() => {
                setOpen(false);
              }}
              className="absolute right-[30px] top-[30px] z-[3] cursor-pointer"
            >
              Close
            </button>

            {/* Container for content */}
            <ReactLenis className="relative z-[2] flex flex-col justify-center min-h-[100dvh] w-full overflow-y-scroll no-scrollbar">
              <div className=" flex 1100:flex-col 1100:items-center justify-start gap-[2vw] w-full h-full px-[12px] pt-[100px] 1100:pt-0">
                {/* Container for expanded image */}
                <div className="flex flex-col  gap-[4vh] min-h-full 1100:min-h-auto w-full max-w-[900px] 1200:max-w-[500px] 1100:max-w-[700px] pb-[70px] 1100:pb-0">
                  <div
                    ref={expandedWorkCont}
                    className="relative w-full h-[500px] 1200:h-[340px] 1100:h-[400px] 650:h-[200px] my-auto"
                  ></div>
                  {/* <div className="relative w-full border !h-[500px] p-[2vw]"></div>
                  <div className="relative w-full border !h-[500px] p-[2vw]"></div> */}
                </div>

                {/* Container for details about work */}
                <div className="flex flex-col 1100:mx-auto max-w-[600px] 1100:max-w-[680px] w-full gap-[10px] h-full pt-[40px] relative z-[10]">
                  <div className="flex justify-between">
                    <h3 className="text-5xl 650:text-4xl font-medium tracking-tight uppercase ml-[6vw]">
                      {title}
                    </h3>

                    <a
                      href={siteLink}
                      target="_blank"
                      className="flex gap-[4px] justify-center items-center site-arrow"
                    >
                      <p> site</p>
                      <FiArrowUpRight className="arrow-up" />
                    </a>
                  </div>

                  <div className="max-w-[600px] w-full  flex flex-col 768:gap-[20px] gap-[40px] mt-[50px] 768:mt-[30px]">
                    {details.map(({ title, value }) => {
                      return (
                        <div className="flex items-start gap-[3vw]">
                          <p className="font-medium 650:text-sm leading-[100%] min-w-[50px]">
                            {title}
                          </p>
                          <p className="text-[1.3rem] 768:text-base leading-[120%] font-medium">
                            {value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {/* <h3 className="body-xl">Odd gravity</h3>

                <p>A creative website for this and that</p> */}
                </div>
              </div>

              {/* Overlay */}
              <div
                onClick={() => {
                  setOpen(false);
                }}
                className="absolute inset-0 w-full h-full bg-black/90"
              ></div>
            </ReactLenis>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
