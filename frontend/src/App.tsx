import { Route, Routes } from 'react-router-dom'
import ConnectPage from './pages/ConnectPage'
import GamePage from './pages/GamePage'
import RankingPage from './pages/RankingPage'
import ResultPage from './pages/ResultPage'
import TitlePage from './pages/TitlePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<TitlePage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route path="/ranking" element={<RankingPage />} />
    </Routes>
  )
}

export default App
