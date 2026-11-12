import "./App.css";
import { LenisVisibilityFix } from "./components/LenisVisibilityFix";
import Home from "./Home/Home";
import ReactLenis from "lenis/react";

function App() {
  return (
    <>
      <ReactLenis root>
        <Home />
        <LenisVisibilityFix />
      </ReactLenis>
    </>
  );
}

export default App;
