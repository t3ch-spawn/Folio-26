import gsap from "gsap";
import Navbar from "../components/Navbar";
import ShaderBackgroundGray from "../components/ShaderBackground";
import Hero from "./Hero";
import { ScrollTrigger } from "gsap/all";
import About from "./About";
import Tools from "./Tools";
import Works from "./Works";
import Contact from "./Contact";
import { ImageEffectsCanvas } from "../components/ImageEffects";

export default function Home() {
  gsap.registerPlugin(ScrollTrigger);

  return (
    <main className="relative gray-shader-cont">
      <ShaderBackgroundGray />
      <Navbar />
      <Hero />
      <About />
      <Tools />
      <Works />
      <Contact />
      <ImageEffectsCanvas />
    </main>
  );
}
