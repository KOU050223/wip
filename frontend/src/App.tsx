import { Route, Routes } from "react-router-dom";
import { JoyConProvider } from "./contexts/JoyConContext";
import ConnectPage from "./pages/ConnectPage";
import GamePage from "./pages/GamePage";
import RankingPage from "./pages/RankingPage";
import ResultPage from "./pages/ResultPage";
import TitlePage from "./pages/TitlePage";
import VRPage from "./pages/VRPage";

function App() {
  return (
    <JoyConProvider>
      <Routes>
        <Route path="/" element={<TitlePage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/vr" element={<VRPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/ranking" element={<RankingPage />} />
      </Routes>
    </JoyConProvider>
  );
}

export default App;
