import { Route, Routes } from "react-router-dom";
import { JoyConProvider } from "./contexts/JoyConContext";
import ConnectPage from "./pages/ConnectPage";
import GamePage from "./pages/GamePage";
import MatchmakingPage from "./pages/MatchmakingPage";
import MatchRoomPage from "./pages/MatchRoomPage";
import RankingPage from "./pages/RankingPage";
import ResultPage from "./pages/ResultPage";
import TitlePage from "./pages/TitlePage";

function App() {
  return (
    <JoyConProvider>
      <Routes>
        <Route path="/" element={<TitlePage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/matchmaking" element={<MatchmakingPage />} />
        <Route path="/matches/:matchID" element={<MatchRoomPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/ranking" element={<RankingPage />} />
      </Routes>
    </JoyConProvider>
  );
}

export default App;
