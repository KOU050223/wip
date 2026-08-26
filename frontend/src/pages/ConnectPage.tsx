import { Link } from 'react-router-dom'
import { useJoyCon } from '../hooks/useJoyCon'

function ConnectPage() {
  const { isSupported, isConnected, state, error, connect } = useJoyCon()

  return (
    <section>
      <h1>Joy-Con接続</h1>

      {!isSupported && <p>このブラウザはWebHIDに対応していません。Chrome / Edgeで開いてください。</p>}

      {isSupported && !isConnected && (
        <button type="button" onClick={connect}>
          Joy-Conを接続する
        </button>
      )}

      {error && <p role="alert">{error}</p>}

      {isConnected && (
        <div>
          <p>接続済み</p>
          {state && (
            <dl>
              <dt>加速度 (G)</dt>
              <dd>
                x: {state.accel.x.toFixed(2)} / y: {state.accel.y.toFixed(2)} / z:{' '}
                {state.accel.z.toFixed(2)}
              </dd>
              <dt>ジャイロ (deg/s)</dt>
              <dd>
                x: {state.gyro.x.toFixed(1)} / y: {state.gyro.y.toFixed(1)} / z:{' '}
                {state.gyro.z.toFixed(1)}
              </dd>
            </dl>
          )}
          <Link to="/game">ゲームへ</Link>
        </div>
      )}
    </section>
  )
}

export default ConnectPage
