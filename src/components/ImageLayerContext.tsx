import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

interface ImageLayerContextValue {
  activeView: string | null;
  setActiveView: Dispatch<SetStateAction<string | null>>;
}

const ImageLayerContext = createContext<ImageLayerContextValue | null>(null);

export function ImageLayerProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<string | null>(null);

  const value = useMemo(() => ({ activeView, setActiveView }), [activeView]);

  return (
    <ImageLayerContext.Provider value={value}>
      {children}
    </ImageLayerContext.Provider>
  );
}

export function useImageLayer() {
  const context = useContext(ImageLayerContext);

  if (!context) {
    throw new Error("Image components must be inside ImageLayerProvider.");
  }

  return context;
}
