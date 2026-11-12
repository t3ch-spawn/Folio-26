import AberrationImage from "../components/AberrationImage";

export default function About() {
  return (
    <section className="flex justify-between items-center px-[40px] mt-[40vh]">
      <div className="max-w-[350px] aspect-[350/437]">
        <AberrationImage img="/images/headshot.jpg" />
      </div>

      <p className="body-2xl max-w-[900px]">
        As a freelance creative developer, I bridge design and code to turn
        ambitious concepts into living digital experiences. I treat the web as
        an expressive canvas, moving beyond static layouts to create moments of
        genuine immersion.
        <br />
        <br />
        Driven by visual aesthetics and striking color interplay, I shape fluid,
        tactile interfaces that captivate at first glance and linger long after.
      </p>
    </section>
  );
}
