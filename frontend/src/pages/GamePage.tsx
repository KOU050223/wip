import { Link } from "react-router-dom";
import GameScene from "../game/GameScene";
import { useJoyConContext } from "../contexts/JoyConContext";

function GamePage() {
  const { isConnected } = useJoyConContext();

  return (
    <section>
      <h1>ゲーム</h1>

      {!isConnected && <p>Joy-Conが未接続です。先に接続画面で接続してください。</p>}

      <GameScene />

      <Link to="/result">リザルトへ</Link>
    </section>
  );
}

export default GamePage;
