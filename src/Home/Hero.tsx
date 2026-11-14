import ParticleCodeBracket from "../components/ParticleCodeBracket";
import useLiveTime from "../hooks/useLiveTime";

export default function Hero() {
  const time = useLiveTime();

  return (
    <section className="h-[100vh] 768:h-[80vh] px-[40px] 650:px-[16px] flex flex-col relative overflow-hidden">
      <p className="mt-[40px] body-sm">t3ch_spawn</p>

      <h1 className="mt-[12vh] body-h1 relative z-[3]">BOLUWATIFE</h1>

      <ParticleCodeBracket />

      {/* Container for location and time  */}
      <div className="flex justify-between 650:flex-col-reverse items-end mt-auto translate-y-[-25px] 768:translate-y-[-10px] relative z-[3]">
        <p className="body-sm 650:mt-[20px]">
          Ibadan, Nigeria. <span className="ml-[15px]"></span> {time}
        </p>

        <h1 className=" max-w-[704px] text-right body-h1 ml-auto">
          CREATIVE WEB DEVELOPER
        </h1>
      </div>
    </section>
  );
}
