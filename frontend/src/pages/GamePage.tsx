import { Link } from 'react-router-dom'

function GamePage() {
  return (
    <section>
      <h1>ゲーム</h1>
      <Link to="/result">リザルトへ</Link>
    </section>
  )
}

export default GamePage
