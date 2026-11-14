import AberrationImage from "../components/AberrationImage";

export default function About() {
  return (
    <section
      id="about"
      className="flex 768:flex-col gap-[50px]  850:gap-[30px] justify-between items-center 850:px-[16px] px-[40px] mt-[300px] 1024:mt-[135px] scroll-mt-40"
    >
      <div className="max-w-[350px] w-full 768:max-w-[500px] aspect-[350/437]">
        <AberrationImage img="/images/headshot.jpg" />
      </div>

      <p className="body-2xl 1200:text-3xl 968:text-2xl max-w-[900px]">
        As a freelance creative developer, I blend design and technical depth to
        build immersive websites and robust web apps, from expressive interfaces
        to seamless integrations.
        <br />
        <br />I combine fluid motion, striking visuals, and reliable
        functionality, caring equally about how each experience feels and
        performs.
      </p>
    </section>
  );
}
