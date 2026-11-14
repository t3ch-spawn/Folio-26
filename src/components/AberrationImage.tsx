import { ShaderImage } from "./ImageEffects";

export default function AberrationImage({ img }: { img: string }) {
  return <ShaderImage img={img} mode="aberration" />;
}
