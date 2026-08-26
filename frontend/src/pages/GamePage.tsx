import { Link } from 'react-router-dom'
import LightsaberScene from '../components/three/LightsaberScene'
import { useJoyConContext } from '../contexts/JoyConContext'

function GamePage() {
  const { isConnected, state } = useJoyConContext()

  return (
    <section>
      <h1>ゲーム</h1>

      {!isConnected && <p>Joy-Conが未接続です。先に接続画面で接続してください。</p>}

      <LightsaberScene gyro={state?.gyro ?? null} />

      <Link to="/result">リザルトへ</Link>
    </section>
  )
}

export default GamePage
