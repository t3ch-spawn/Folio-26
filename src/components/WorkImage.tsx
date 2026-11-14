import { ShaderImage } from "./ImageEffects";

interface WorkImageProps {
  img: string;
  isPlaying?: boolean;
  elevated?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

export default function WorkImage({
  img,
  isPlaying = false,
  elevated = false,
}: WorkImageProps) {
  return (
    <ShaderImage
      img={img}
      mode="work"
      isPlaying={isPlaying}
      elevated={elevated}
    />
  );
}