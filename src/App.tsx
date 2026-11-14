import "./App.css";
import { LenisVisibilityFix } from "./components/LenisVisibilityFix";
import Home from "./Home/Home";
import ReactLenis from "lenis/react";
import { BrowserRouter } from "react-router-dom";

function App() {
  return (
    <>
      <BrowserRouter>
        <ReactLenis root>
          <Home />
          <LenisVisibilityFix />
        </ReactLenis>
      </BrowserRouter>
    </>
  );
}

export default App;
