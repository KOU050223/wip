// credits.ts
// DV(ダース・ベイダー)撃破後に流すエンドロールの文言。
// 1要素 = クレジット1行 = CreditsScene で殴って飛ばせるオブジェクト1個になる。
// ここはまだ仮の文言。実際のスタッフ名・謝辞に自由に差し替えてよい(行数も増減可)。
// 日本語を表示するため CreditsScene の <Text> には JP_FONT_PATH のフォントを渡している。

// troika(<Text> の実体)は woff2 を読めない(ブラウザで "woff2 fonts not supported")ため woff を使う。
export const JP_FONT_PATH = "/fonts/noto-sans-jp-japanese-400.woff";

// 上から順に流れてくる。空文字は入れないこと(殴る対象が消えてしまうため)。
export const CREDIT_LINES: readonly string[] = [
  "DARTH VADER 討伐 完了",
  "── STAFF ──",
  "監督　　　　　（名前）",
  "プログラム　　KOU050223",
  "プログラム　　nakawoon",
  "プログラム　　yukid",
  "3Dモデル　　　（名前）",
  "音楽・効果音　（名前）",
  "レベルデザイン（名前）",
  "── SPECIAL THANKS ──",
  "プレイしてくれて",
  "本当にありがとう！",
];

// クレジット1行を殴って飛ばした瞬間に鳴らす効果音(VR/非VR共通)。未配置なら無音になるだけ。
export const CREDIT_PUNCH_SFX_PATH = "/audio/maou_se_battle01.mp3";
export const CREDIT_PUNCH_SFX_VOLUME = 1;

// 演出の尺・流れる速さまわり。ここをいじれば同時に見える枚数や終了までの時間を調整できる。
// 画面に同時に見える枚数 ≈ (CREDIT_SPAWN_Z から CREDIT_DESPAWN_Z までの距離) ÷ CREDIT_DRIFT_SPEED ÷ (CREDIT_SPAWN_INTERVAL_MS/1000)
// 現状: 約 9.5m ÷ 0.9 ÷ 1.9 ≈ 5〜6枚が常に流れている状態。
export const CREDIT_SPAWN_INTERVAL_MS = 1900; // 次の1行が出てくる間隔(短いほど同時数が増える)
export const CREDIT_DRIFT_SPEED = 0.9; // 奥から手前へ流れてくる速さ(m/秒)
export const CREDIT_SPAWN_Z = -7; // 出現位置の奥行き
export const CREDIT_DESPAWN_Z = 2.5; // これより手前まで流れたら(殴られなくても)消す
export const CREDIT_TAIL_MS = 9000; // 最後の1行を出したあと "THE END" までの余韻
export const CREDIT_END_HOLD_MS = 4500; // "THE END" 表示から結果画面へ移るまで
