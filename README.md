# THS // Power Split Lab · e-POWER (GEN 3) · MX-30 Rotary-EV Lab

トヨタ **THS II（動力分割機構）**、日産 **第3世代 e-POWER（シリーズハイブリッド / 5-in-1）**、マツダ **MX-30 Rotary-EV（e-SKYACTIV R-EV / 8C-PH 1ローター・シリーズ式PHEV）** の3方式を、同じ操作感・同じ白基調計器UIで走らせながら比較理解できる GPU/WebGL 教材です。

ヘッダーの **`THS2 | e-POWER GEN 3 | ROTARY-EV 8C`** セグメント切替から、3つの方式をワンクリックで切り替えられます（既定は THS2）。切替時に車両・3D機構・下部ライブ図・軸テレメトリー・エンジン効率マップ・エネルギーフロー・HVバッテリー・Learn・フッターが切り替わり、3方式のシミュレーション状態・RAF・キーボード処理・WebGLコンテキストは完全に分離されています。

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

## 3. MAZDA MX-30 Rotary-EV（日本仕様 e-SKYACTIV R-EV / 8C-PH 基準）

日本仕様 **MAZDA MX-30 Rotary-EV（e-SKYACTIV R-EV）** の公開諸元およびマツダ技報（No.40 2023 / 2025）を基準とした、8C型1ローター発電エンジン＋大容量17.8 kWh電池のシリーズ式プラグインハイブリッド（PHEV）教材です。

### 公開仕様（公式出典ベース）
- **車重 / 駆動方式**: **1,780 kg** / **FF**（前輪モーター駆動）
- **発電用ロータリーエンジン（8C-PH）**: 水冷1ローター、**830 cc**、圧縮比 **11.9**、筒内直接噴射（DI）、**53 kW / 4,500 rpm**、**112 Nm / 4,500 rpm**、レギュラー **50 L** タンク
- **8C トロコイド基本諸元（マツダ技報 No.40 2023）**: 創成半径 **$R = 120\text{ mm}$**、偏心量 **$e = 17.5\text{ mm}$**、ローター幅 **$b = 76\text{ mm}$**、アペックスシール厚 **$2.5\text{ mm}$**、サイド吸排気ポート
- **駆動モーター**: **125 kW / 9,000 rpm**、**260 Nm / 0–4,481 rpm**、最終減速比 **11.236**（215/55R18）
- **駆動用バッテリー**: **355 V / 17.8 kWh** リチウムイオン電池（公式WLTC EV走行換算距離 **107 km** ※参考諸元であり本シミュレーターの航続距離精度保証ではありません）
- **ドライブモード**: **Normal** / **EV** / **Charge**（目標SOC **20–100%**・**10%刻み**）
- **同軸コンパクト配置・機械独立**: 8Cエンジン・発電機・駆動モーターを同軸上に配置しつつ、発電軸と車輪駆動軸の間には剛体シャフト等の機械直結を一切持たない純シリーズ構造

### 教育用近似・推定パラメータ（明示）
メーカー非公開のECU制御則・実測効率マップ・燃焼CFD・実CAD配置の再現ではありません。以下は教育用近似として明示しています（`src/simulation/rotaryGeometry.ts`, `src/simulation/rotaryModel.ts`）。
- 発電機結合比: 8Cエキセントリックシャフトと発電機を **1:1 同軸直結**（軸受損失1%想定）と仮定
- 空力・タイヤ・回転上限: Cd 0.34、前面投影面積 2.52 m²、タイヤ荷重半径 0.340 m、モーター許容 12,500 rpm（最高速 140 km/h 相当）
- 8C-PH 推定熱効率マップ: 高負荷・中高回転域（約 3,200–4,200 rpm）に高効率島を配置し、推定ピーク **34.5%**（他社e-POWERの42%とは独立に設計）
- バッテリー・外部充電: 内部抵抗 **0.085 Ω**（端子電力 $P_{\text{term}}$ と内部化学電力 $P_{\text{chem}} = P_{\text{term}} + I^2 R$ の差を明示してSOC積算と厳密整合）、放電上限 138 kW / 充電上限 52 kW、外部充電 CHAdeMO **36 kW** 想定、補機負荷 0.65 kW
- 停車中Chargeデモ: 実車の停車発電には所定条件/操作が必要ですが、ロータリー機構を即座に観察できるようChargeモードでの停車発電および明示的な初期化プリセット（`STD 65%` / `LOW 22%` / `CHG 80%`）を用意しています（走行中にSOCを無から増やす操作は不可）

### 8C ロータリー 3D運動学・エネルギー収支の整合
- **正確な偏心公転・3:1自転・エピトロコイド接触**: 連続積分したエキセントリックシャフト角 $\theta$ に対し、ローター中心 $C(\theta) = (e\cos\theta, e\sin\theta)$、ローター姿勢 $\phi = \theta / 3$、3頂点 $A_i = C + R(\cos(\phi+2\pi i/3), \sin(\phi+2\pi i/3))$ が常にハウジング曲線 $H(t) = e(\cos 3t, \sin 3t) + R(\cos t, \sin t)$（$R/e = 120/17.5$）に厳密一致します。表示速度スケールは **1/60**（3:1比を厳守）で、断面表示と分解表示を切替可能です。
- **3燃焼室の1080°サイクル可視化**: ローター各面と壁面の間の3室をリアルタイムに区画し、吸気（青）→圧縮（紫）→点火/燃焼膨張（橙）→排気（赤灰）を色＋位相ラベル/アイコン＋体積バーで表示。各面は軸1080°（ローター1回転）で1周、3室全体で軸1回転あたり1回燃焼し、エンジン停止時は燃焼演出を即停止します。
- **DCバス収支・電池内部抵抗・分離積算**: 毎ステップ $P_{\text{gen}} + P_{\text{ext}} + P_{\text{batt,term}} = P_{\text{motor}} + P_{\text{aux}}$ および $\Delta\text{SOC} = -P_{\text{chem}} \Delta t / (17.8\times 3600)$ を事後クリップなしで成立させます。外部充電（停車・ペダル0時のみ接続、ペダル操作で即切断）・回生制動・エンジン発電充電・有限50 L燃料残量（枯渇時はEV継続）を厳密に分離積算します。

### MX-30 Rotary-EV 公式出典
- [マツダニュースリリース: 「MAZDA MX-30 Rotary-EV」を発売（2023-09-14）](https://newsroom.mazda.com/ja/publicity/release/2023/202309/230914b.html)
- [マツダ公式: MX-30 走行性能（e-SKYACTIV R-EV）](https://www.mazda.co.jp/cars/passenger/mx-30/performance/)
- [マツダ公式: MX-30 主要諸元表（2025年3月 PDF）](https://www.mazda.co.jp/content/dam/mazda/official/mazda-co-jp/cars/passenger/mx-30/catalog_spec/pdf/mx-30_specification_202503.pdf)
- [Mazda Technical Review 2023 (EN, No. 40)](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2023/2023_no011.pdf)
- [マツダ技報 2023（JP, No. 40: 発電用8Cロータリーエンジン）](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/ja/pdf/innovation/monozukuri/technology/tech-review/2023/2023_no012.pdf)
- [マツダ技報 2025（JP: e-SKYACTIV R-EV 関連）](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/ja/pdf/innovation/monozukuri/technology/tech-review/2025/2025_no012.pdf)

---

## 自動テスト（`npm run test`）

Reactから分離した純粋モデル（`src/simulation/epowerModel.ts`, `src/simulation/rotaryGeometry.ts`, `src/simulation/rotaryModel.ts`, `src/simulation/thsStep.ts`）に対し、Node標準 `node:test` で決定的な自動テスト（`tests/epower.test.ts`, `tests/rotary.test.ts`, `tests/ths.test.ts`）を実行します。

- Rotary-EV: 0–1080°全角度のローター中心/3:1角/3頂点エピトロコイド厳密一致・側面内包・3室位相周期と点火頻度、EV/Normal/Chargeモード、低SOC/発電＋電池アシスト、停車充電と目標SOC到達停止、満SOC回生制限と摩擦補完、外部充電インターロック（停車・ペダル切断・別積算）、有限燃料枯渇時のEV継続、回生/外部充電/エンジン充電の厳密分離、DCバス収支と電池内部抵抗 $I^2R$ を含むSOC厳密積算、長時間有限値、軸独立性、初期化リセット
- e-POWER: 既存11件のシリーズ制御・DCバス収支・回生・長時間連続走行テスト
- THS II: 既存2件の遊星歯車拘束・効率/トルク特性回帰テスト

## Vercel

リポジトリを Vercel へ接続すれば、`vercel.json` の設定で `npm run build` → `dist` がそのままデプロイされます。
