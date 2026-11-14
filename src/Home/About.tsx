import { useEffect } from "react";
import AberrationImage from "../components/AberrationImage";

export default function About() {
  useEffect(() => {
    const API_KEY = "afb7df28d2e372fe11c082bb3bebda05";

    // @ts-ignore
    async function getAddress(latitude: number, longitude: number) {
      const url = new URL("https://api.apilayer.net/positionstack/v1/reverse");

      url.searchParams.set("access_key", API_KEY);
      url.searchParams.set("query", `${latitude},${longitude}`);
      url.searchParams.set("limit", "1");

      try {
        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || result.error) {
          throw new Error(
            result.error?.message ||
              result.error?.info ||
              `HTTP ${response.status}`,
          );
        }

        const location = result.data?.[0];

        console.log("Full Address:", location?.label);

        return location?.label ?? null;
      } catch (error) {
        console.error("Geocoding error:", error);
        return null;
      }
    }

    getAddress(6.441, 3.5357);
  }, []);

  return (
    <section
      id="about"
      className="flex 768:flex-col gap-[50px]  850:gap-[30px] justify-between items-center 850:px-[16px] px-[40px] mt-[300px] 1024:mt-[135px] scroll-mt-40"
    >
      <div className="max-w-[350px] w-full 768:max-w-[500px] aspect-[350/437]">
        <AberrationImage img="/images/headshot.jpg" />
      </div>

      <p className="body-2xl 1200:text-3xl 968:text-2xl max-w-[900px]">
        Struggling to choose between a stunning website and a web app or SaaS
        platform that actually works? As a creative developer, I blend design
        and technical depth to build immersive digital experiences and robust
        applications.
        <br />
        <br />I combine fluid motion, striking visuals, and reliable
        functionality, caring equally about how each interactive space feels,
        scales, and performs.
      </p>
    </section>
  );
}
