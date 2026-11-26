# THS // Power Split Lab & e-POWER (GEN 3) Lab

トヨタ **THS II（動力分割機構）** と 日産 **第3世代 e-POWER（シリーズハイブリッド / 5-in-1）** を、同じ操作感・同じ計器UIで走らせながら比較理解できる GPU/WebGL 教材です。

ヘッダーの **`THS2 | e-POWER GEN 3`** セグメント切替から、2つの方式をワンクリックで切り替えられます（既定は THS2）。切替時に車両・3D機構・下部構造図・軸テレメトリー・エンジン効率マップ・エネルギーフロー・HVバッテリー・Learn・フッターが切り替わり、両方式のシミュレーション状態・RAF・キーボード処理・WebGLコンテキストは完全に分離されています。

画面右上から英語（EN）、日本語（JP）、中国語（ZH）、ドイツ語（DE）、フランス語（FR）の5言語へ即時切り替えでき、選択言語はブラウザに保存されます。

---

## 起動・ビルド・テスト

```bash
npm ci
npm run dev     # 開発サーバー
npm run build   # 型チェック + 本番ビルド (dist/)
npm run test    # モデル・物理収支・回帰の自動テスト
```

macOS / Linuxでは `./run.sh` でビルド・プレビュー起動も可能です。

## 操作

- 画面の `ACCEL` / `BRAKE` スライダー
- `W` / `↑`: アクセルを増やす
- `S` / `↓`: ブレーキを増やす
- `Space`: 一時停止 / 再開
- 3D画面をドラッグ: 視点回転、ホイール: ズーム

---

## 1. THS II（2代目プリウス NHW20 基準）

2代目プリウス（NHW20）相当の公開仕様を基準に、遊星歯車、車両縦運動、モーター／発電機、バッテリーの電力収支をリアルタイム計算します。

- 遊星歯車の回転数はリング78歯・サン30歯として次式で拘束しています。
  ```text
  78 × n(MG2) + 30 × n(MG1) = 108 × n(Engine)
  ```
- 3D画面直下は MG1（サン）・ENG（キャリア）・MG2（リング）の共線図です。縦位置は正負つきの実回転数（±20,000 rpm 固定目盛り）、横の軸間隔は 78:30 で3点が常に一直線になります。
- Energy Flow のパワーバーは駆動出力をシステム最大 82 kW、回生をバッテリー側上限 25 kW に対する割合として表示します。
- 共線図の読み方は [トヨタTHS-II技術資料（NHTSA公開、TH-13）](https://static.nhtsa.gov/odi/inv/2011/INRD-PE11005-45763P.pdf) も参照してください。

### THS II 仕様の出典
- [トヨタ自動車: 2代目プリウス 2003–2009](https://global.toyota/jp/detail/17912410)
- [ORNL: Evaluation of the 2004 Toyota Prius Hybrid Electric Drive System](https://info.ornl.gov/sites/publications/Files/Pub57399.pdf)

---

## 2. 日産 第3世代 e-POWER（欧州 Qashqai 公開仕様基準）

欧州向け **Nissan Qashqai（第3世代 e-POWER、2025年発表）** の公開仕様を基準とした、純シリーズハイブリッドの教育用準物理モデルです（※日本向け2026年 Kicks 等の1.4L別仕様とは区別しています）。

### 公開仕様（公式出典ベース）
- **発電専用エンジン**: 1.5L 3気筒ターボ `ZR15DDTe`（STARC 燃焼コンセプト、**最大熱効率 42%**）
- **駆動モーター最大出力**: **151 kW**（100%モーター駆動）
- **HVバッテリー容量**: **2.1 kWh**（リチウムイオン）
- **5-in-1 ユニット**: 駆動モーター・発電機・インバーター・減速機・増速機を一体化

### 教育用近似・推定パラメータ（明示）
メーカー非公開のECU制御則・実測マップ・実CAD内部配置の再現ではありません。以下は教育用近似として明示的に設定しています（`src/simulation/epowerModel.ts`）。
- 車両諸元: 車重 1,640 kg、Cd 0.32、前面投影面積 2.48 m²、タイヤ有効半径 0.355 m
- ギヤ比: エンジン→発電機 増速比 **2.2:1**、駆動モーター→車輪 減速比 **8.2:1**
- 回転・トルク上限: エンジン 100 kW / 215 Nm / 5,000 rpm、発電機 11,000 rpm、駆動モーター 330 Nm / 13,500 rpm
- バッテリー・電力系: 公称 350 V（内部抵抗 0.18 Ω）、放電上限 55 kW、充電/回生上限 45 kW、制御範囲 30–80%（ハード保護 20–85%）、補機負荷 0.6 kW、インバーター効率 97%
- 制御近似: 最適動作線（OOL）による42%効率島付近での発電、始動/停止ヒステリシス・最小稼働時間（4秒）、悪路/高速時の路面騒音を利用した定性的な発電優先

### 物理・エネルギー収支の整合
- **独立した二系統の拘束**: エンジンと発電機は `n_GEN = 2.2 × n_ENG`、駆動モーターと車輪は `n_MOT = 8.2 × n_WHL` でそれぞれ内部のみ機械結合し、両系統の間に機械直結や遊星歯車は一切ありません。
- **DCバス電力収支と非クリップ積算**: 毎ステップ `P_gen_dc + P_batt_dc = P_motor_dc + P_aux_dc` を厳密に満たします。電池の充放電上限・SOC上限/下限はモーター出力・発電出力側を事前制限することで守り、電力を事後クリップしてエネルギーが消滅/生成される不整合を起こしません。
- **発電・回生・摩擦ブレーキの区別**: 巡航時は発電電力がDCバス経由で直接モーターへ流れ（バッテリー経由を強制しない）、満充電付近の回生制限時は不足制動力を摩擦ブレーキへ配分します。回生累計（`regenEnergyKwh`）には駆動モーターからの電気回生のみを積算し、停車中エンジン発電による充電は加算しません。
- **3D模式ビュー（表示速度 1/42）**: 3気筒エンジンのピストン/クランク、増速ギヤ、発電機ローター、5-in-1外枠とインバーター/DCバス、駆動モーター断面・ローター、減速ギヤ・出力軸を2つの独立経路として描画し、電力方向を3Dコーン矢印と色で連動表示します（出力ゼロ時は流れを停止）。実物CADや実内部配置の忠実再現ではなく教育用模式図です。

### 第3世代 e-POWER 公式出典
- [日産自動車: 第3世代 e-POWER 技術アーカイブ](https://www2.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN3/)
- [日産ニュースルーム（日本語）: 第3世代e-POWERを欧州キャッシュカイに初搭載（2025-06-26）](https://global.nissannews.com/ja-JP/releases/250626-01-j)
- [Nissan Newsroom (English): Nissan launches 3rd-generation e-POWER technology in Europe](https://global.nissannews.com/en/releases/nissan-launches-3rd-generation-e-power-technology-in-europe)
- [日産ストーリーズ: 新型e-POWER専用エンジンのブレイクスルー](https://www2.nissan-global.com/JP/STORIES/RELEASES/new-e-power-dedicated-engine-breakthroughs/)

---

## 自動テスト（`npm run test`）

Reactから分離した純粋モデル（`src/simulation/epowerModel.ts`, `src/simulation/thsStep.ts`）に対し、Node標準 `node:test` で決定的な自動テスト（`tests/epower.test.ts`, `tests/ths.test.ts`）を実行します。

- e-POWER: EV走行、低SOC停車発電（回生非加算）、発電巡航の直接給電と効率島、低速全開の電池アシスト、回生制動、満SOC付近の回生制限と摩擦ブレーキ補完、登坂/下り一定速、ヒステリシス、軸回転拘束と非直結、25分間連続走行の有限値およびDCバス収支/SOC積算の厳密一致
- THS II: 遊星歯車拘束・効率/トルク特性の回帰テスト

## Vercel

リポジトリを Vercel へ接続すれば、`vercel.json` の設定で `npm run build` → `dist` がそのままデプロイされます。
