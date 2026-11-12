import ParticleCodeBracket from "../components/ParticleCodeBracket";
import useLiveTime from "../hooks/useLiveTime";

export default function Hero() {
  const time = useLiveTime();

  return (
    <section className="h-[100vh] px-[40px] relative overflow-hidden">

      <p className="mt-[40px] body-sm">t3ch_spawn</p>

      <h1 className="mt-[12vh] body-h1 relative z-[3]">BOLUWATIFE</h1>

      <ParticleCodeBracket />

      {/* Container for location and time  */}
      <div className="flex justify-between items-end mt-[40.3vh] relative z-[3]">
        <p className="body-sm">
          Ibadan, Nigeria. <span className="ml-[15px]"></span> {time}
        </p>

        <h1 className=" max-w-[684px] body-h1  ml-auto">
          CREATIVE WEB DEVELOPER
        </h1>
      </div>
    </section>
  );
}
