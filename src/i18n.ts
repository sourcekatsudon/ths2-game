import type { DriveMode, TerrainKind } from './simulation/model'

export type Locale = 'EN' | 'JP' | 'ZH' | 'DE' | 'FR'

const en = {
  brandSubtitle: 'INTERACTIVE HYBRID DRIVETRAIN', simulationVehicle: 'SIMULATION VEHICLE', gpuRendering: 'GPU RENDERING', learn: 'LEARN', reset: 'Reset simulation', language: 'Language',
  dry: 'DRY', testCourse: 'TEST COURSE 01', nextSurfaceIn: 'Next surface in', distance: 'DISTANCE',
  flat: 'Flat road', uphill: 'Uphill', downhill: 'Downhill', rough: 'Rough road',
  ready: 'READY', evDrive: 'EV DRIVE', hybridDrive: 'HYBRID DRIVE', engineCharge: 'ENGINE CHARGE', regenerating: 'REGENERATING', descentHold: 'DESCENT HOLD', coasting: 'COASTING',
  live3d: 'LIVE 3D ASSEMBLY', powerSplitDevice: 'POWER SPLIT DEVICE', gearRatio: 'GEAR RATIO', dragHint: 'DRAG TO ORBIT · SCROLL TO ZOOM',
  carrier: 'CARRIER', engine: 'ENGINE', sun: 'SUN', ring: 'RING', outputShort: 'OUT', ringOutput: 'MG2 / OUTPUT', kinematicConstraint: 'KINEMATIC CONSTRAINT', locked: 'LOCKED',
  rotationComparison: 'SHAFT SPEED COMPARISON', visualScale: 'VISUAL SPEED 1/240', relativeToMax: 'RELATIVE TO FASTEST SHAFT', clockwise: 'CW', counterClockwise: 'CCW', stopped: 'STOP', actualSpeed: 'ACTUAL',
  shaftTelemetry: 'SHAFT TELEMETRY', liveRotation: 'LIVE ROTATION', planetCarrier: 'PLANET CARRIER', sunGear: 'SUN GEAR', ringGear: 'RING GEAR',
  tireTorque: 'TIRE TORQUE', output: 'OUTPUT', regen: 'REGEN', fuelRate: 'FUEL ECONOMY', driverInput: 'DRIVER INPUT', accel: 'ACCEL', brake: 'BRAKE', pause: 'PAUSE', start: 'START',
  engineModel: '1NZ-FXE MODEL', engineEfficiency: 'ENGINE EFFICIENCY', now: 'NOW', torqueAxis: 'TORQUE / Nm', powerConversion: 'POWER CONVERSION', energyFlow: 'ENERGY FLOW',
  wheels: 'WHEELS', battery: 'BATTERY', power: 'POWER', nominal: 'NOMINAL', hvBattery: 'HV BATTERY', soc: 'SOC', controlWindow: 'CONTROL WINDOW 40–80%', voltage: 'VOLTAGE', current: 'CURRENT',
  discharge: 'discharge', charge: 'charge', regenTotal: 'Regen total', realTimeModel: 'REAL-TIME QUASI-PHYSICAL MODEL', modelSources: 'MODEL & SOURCES',
  outputLevel: 'DRIVE OUTPUT', regenLevel: 'REGEN CAPTURE', systemBasis: 'of 82 kW system', regenBasis: 'of 25 kW limit',
  learningDeck: 'LEARNING DECK', learnTitle: 'Three shafts. Only two can be chosen freely.',
  learnLead: 'THS II uses a planetary gearset as both a transmission and a power junction. The three shaft speeds are always bound by one equation set by the tooth counts.',
  ringLearnTitle: 'Ring → MG2 / wheels', ringLearnBody: 'The outer ring gear connects to MG2 and the final drive. Once vehicle speed is set, MG2 speed is set too.',
  sunLearnTitle: 'Sun → MG1', sunLearnBody: 'The center sun gear connects to MG1. Controlling MG1 speed and generating torque creates the desired engine operating point.',
  carrierLearnTitle: 'Carrier → engine', carrierLearnBody: 'The carrier holding the three pinions is the engine shaft. Engine output divides into mechanical and electrical paths.',
  tryIt: 'TRY IT:', tryBody: 'Release the accelerator while moving. MG2 pulls MG1 into reverse rotation. On a descent, regeneration enters automatically to hold speed.',
  modelBasis: 'MODEL BASIS · NHW20 (2003–2009)', modelSpecs: 'Mass 1,325 kg · Engine 57 kW / 115 Nm · MG2 50 kW / 400 Nm · System 82 kW · NiMH 201.6 V',
  disclaimer: 'This is an educational quasi-physical model. Published maximum specifications are used; undisclosed control laws and detailed efficiency values are approximated.', toyotaSpec: 'TOYOTA · THS II SPEC ↗', ornlLayout: 'ORNL · PSD TEETH / LAYOUT ↗', close: 'Close',
}

export type TranslationKey = keyof typeof en
export type TFunction = (key: TranslationKey) => string
type Dictionary = Record<TranslationKey, string>

const jp: Dictionary = {
  brandSubtitle: '対話型ハイブリッド駆動教材', simulationVehicle: '模擬車両', gpuRendering: 'GPU描画', learn: '学ぶ', reset: 'シミュレーションをリセット', language: '言語',
  dry: 'ドライ', testCourse: 'テストコース 01', nextSurfaceIn: '次の路面まで', distance: '走行距離',
  flat: '平坦路', uphill: '上り坂', downhill: '下り坂', rough: '悪路',
  ready: '走行準備', evDrive: 'EV走行', hybridDrive: 'ハイブリッド走行', engineCharge: 'エンジン充電', regenerating: '回生中', descentHold: '下り一定速', coasting: '惰性走行',
  live3d: 'リアルタイム3D機構', powerSplitDevice: '動力分割機構', gearRatio: '歯数比', dragHint: 'ドラッグ：視点回転 · ホイール：ズーム',
  carrier: 'キャリア', engine: 'エンジン', sun: 'サン', ring: 'リング', outputShort: '出力', ringOutput: 'MG2 / 出力', kinematicConstraint: '回転数拘束', locked: '成立',
  rotationComparison: '3軸回転比較', visualScale: '表示速度 1/240', relativeToMax: '最大回転軸との比率', clockwise: '右回転', counterClockwise: '左回転', stopped: '停止', actualSpeed: '実回転数',
  shaftTelemetry: '軸テレメトリー', liveRotation: 'リアルタイム回転', planetCarrier: 'プラネットキャリア', sunGear: 'サンギヤ', ringGear: 'リングギヤ',
  tireTorque: 'タイヤトルク', output: '駆動出力', regen: '回生電力', fuelRate: '瞬間燃費', driverInput: 'ドライバー操作', accel: 'アクセル', brake: 'ブレーキ', pause: '一時停止', start: '開始',
  engineModel: '1NZ-FXE 模擬モデル', engineEfficiency: 'エンジン効率', now: '現在', torqueAxis: 'トルク / Nm', powerConversion: '動力変換', energyFlow: 'エネルギーフロー',
  wheels: 'タイヤ', battery: 'バッテリー', power: '電力', nominal: '公称', hvBattery: 'HVバッテリー', soc: '充電率', controlWindow: '制御範囲 40–80%', voltage: '電圧', current: '電流',
  discharge: '放電', charge: '充電', regenTotal: '回生累計', realTimeModel: 'リアルタイム準物理モデル', modelSources: 'モデルと出典',
  outputLevel: '駆動出力率', regenLevel: '回生率', systemBasis: 'システム82 kW基準', regenBasis: '回生上限25 kW基準',
  learningDeck: '学習デッキ', learnTitle: '3本の軸。でも自由に決まるのは、2本だけ。',
  learnLead: 'THS IIは遊星歯車を「変速機」と「動力の分岐点」に使います。3軸の回転数は、歯数で決まる1本の式に常に拘束されています。',
  ringLearnTitle: 'リング → MG2 / 車輪', ringLearnBody: '外周のリングギヤはMG2と最終減速機につながります。車速が決まると、MG2の回転数も決まります。',
  sunLearnTitle: 'サン → MG1', sunLearnBody: '中心のサンギヤはMG1へ。MG1の回転数と発電トルクを制御することで、エンジン動作点を作ります。',
  carrierLearnTitle: 'キャリア → エンジン', carrierLearnBody: '3個のピニオンを支えるキャリアがエンジン軸。エンジン出力は機械経路と電気経路へ分かれます。',
  tryIt: '試してみよう：', tryBody: '走行中にアクセルをゼロへ。MG2に引かれてMG1が逆回転します。下り坂では回生が自動的に入り、車速を保とうとします。',
  modelBasis: 'モデル基準 · NHW20（2003–2009）', modelSpecs: '車重 1,325 kg · エンジン 57 kW / 115 Nm · MG2 50 kW / 400 Nm · システム 82 kW · NiMH 201.6 V',
  disclaimer: '教育用の準物理モデルです。公開された最大仕様を使用し、非公開の制御則・詳細効率値は近似しています。', toyotaSpec: 'TOYOTA · THS II 仕様 ↗', ornlLayout: 'ORNL · PSD歯数 / 構造 ↗', close: '閉じる',
}

const zh: Dictionary = {
  brandSubtitle: '交互式混合动力传动系统', simulationVehicle: '模拟车辆', gpuRendering: 'GPU渲染', learn: '学习', reset: '重置模拟', language: '语言',
  dry: '干燥', testCourse: '测试路线 01', nextSurfaceIn: '距下一路面', distance: '行驶距离', flat: '平路', uphill: '上坡', downhill: '下坡', rough: '颠簸路',
  ready: '就绪', evDrive: '纯电行驶', hybridDrive: '混合动力', engineCharge: '发动机充电', regenerating: '能量回收', descentHold: '下坡定速', coasting: '滑行',
  live3d: '实时3D总成', powerSplitDevice: '动力分配机构', gearRatio: '齿数比', dragHint: '拖动旋转 · 滚轮缩放', carrier: '行星架', engine: '发动机', sun: '太阳轮', ring: '齿圈', outputShort: '输出', ringOutput: 'MG2 / 输出', kinematicConstraint: '运动学约束', locked: '成立', rotationComparison: '三轴转速对比', visualScale: '显示速度 1/240', relativeToMax: '相对最快轴', clockwise: '顺时针', counterClockwise: '逆时针', stopped: '停止', actualSpeed: '实际转速',
  shaftTelemetry: '轴系遥测', liveRotation: '实时转速', planetCarrier: '行星架', sunGear: '太阳轮', ringGear: '齿圈', tireTorque: '轮胎扭矩', output: '驱动输出', regen: '回收功率', fuelRate: '瞬时油耗', driverInput: '驾驶输入', accel: '加速', brake: '制动', pause: '暂停', start: '开始',
  engineModel: '1NZ-FXE 模型', engineEfficiency: '发动机效率', now: '当前', torqueAxis: '扭矩 / Nm', powerConversion: '功率转换', energyFlow: '能量流', wheels: '车轮', battery: '电池', power: '功率', nominal: '标称', hvBattery: '高压电池', soc: '荷电状态', controlWindow: '控制范围 40–80%', voltage: '电压', current: '电流',
  discharge: '放电', charge: '充电', regenTotal: '累计回收', realTimeModel: '实时准物理模型', modelSources: '模型与来源', outputLevel: '驱动输出率', regenLevel: '能量回收率', systemBasis: '以系统82 kW为基准', regenBasis: '以回收上限25 kW为基准',
  learningDeck: '学习卡片', learnTitle: '三根轴，但只有两根可以自由决定。', learnLead: 'THS II使用行星齿轮组同时充当变速器和动力分流点。三根轴的转速始终受齿数决定的同一个方程约束。',
  ringLearnTitle: '齿圈 → MG2 / 车轮', ringLearnBody: '外齿圈连接MG2和主减速器。因此车速确定后，MG2转速也随之确定。', sunLearnTitle: '太阳轮 → MG1', sunLearnBody: '中央太阳轮连接MG1。控制MG1的转速和发电扭矩，就能建立所需的发动机工作点。', carrierLearnTitle: '行星架 → 发动机', carrierLearnBody: '支撑三个行星轮的行星架连接发动机轴。发动机输出分为机械和电气两条路径。',
  tryIt: '试一试：', tryBody: '行驶中松开加速踏板。MG2会带动MG1反转。下坡时，系统自动进行能量回收以保持车速。', modelBasis: '模型基准 · NHW20（2003–2009）', modelSpecs: '质量 1,325 kg · 发动机 57 kW / 115 Nm · MG2 50 kW / 400 Nm · 系统 82 kW · NiMH 201.6 V', disclaimer: '这是教学用准物理模型。采用公开的最大规格；未公开的控制逻辑和详细效率数据为近似值。', toyotaSpec: 'TOYOTA · THS II 规格 ↗', ornlLayout: 'ORNL · PSD齿数 / 结构 ↗', close: '关闭',
}

const de: Dictionary = {
  brandSubtitle: 'INTERAKTIVER HYBRIDANTRIEB', simulationVehicle: 'SIMULATIONSFAHRZEUG', gpuRendering: 'GPU-DARSTELLUNG', learn: 'LERNEN', reset: 'Simulation zurücksetzen', language: 'Sprache', dry: 'TROCKEN', testCourse: 'TESTSTRECKE 01', nextSurfaceIn: 'Nächster Belag in', distance: 'STRECKE', flat: 'Ebene', uphill: 'Steigung', downhill: 'Gefälle', rough: 'Schlechtweg',
  ready: 'BEREIT', evDrive: 'EV-FAHRT', hybridDrive: 'HYBRIDFAHRT', engineCharge: 'MOTOR LÄDT', regenerating: 'REKUPERATION', descentHold: 'GEFÄLLEHALT', coasting: 'ROLLEN', live3d: 'LIVE-3D-BAUGRUPPE', powerSplitDevice: 'LEISTUNGSVERZWEIGUNG', gearRatio: 'ZÄHNEZAHL', dragHint: 'ZIEHEN: DREHEN · RAD: ZOOM', carrier: 'TRÄGER', engine: 'VERBRENNER', sun: 'SONNE', ring: 'HOHLRAD', outputShort: 'ABTRIEB', ringOutput: 'MG2 / ABTRIEB', kinematicConstraint: 'KINEMATISCHE BINDUNG', locked: 'ERFÜLLT', rotationComparison: 'DREHZAHLVERGLEICH', visualScale: 'ANZEIGETEMPO 1/240', relativeToMax: 'RELATIV ZUR SCHNELLSTEN WELLE', clockwise: 'RECHTS', counterClockwise: 'LINKS', stopped: 'STOPP', actualSpeed: 'IST-DREHZAHL',
  shaftTelemetry: 'WELLENTELEMETRIE', liveRotation: 'LIVE-DREHZAHLEN', planetCarrier: 'PLANETENTRÄGER', sunGear: 'SONNENRAD', ringGear: 'HOHLRAD', tireTorque: 'RADMOMENT', output: 'ANTRIEBSLEISTUNG', regen: 'REKUPERATION', fuelRate: 'MOMENTANVERBRAUCH', driverInput: 'FAHREREINGABE', accel: 'FAHRPEDAL', brake: 'BREMSE', pause: 'PAUSE', start: 'START', engineModel: '1NZ-FXE MODELL', engineEfficiency: 'MOTORWIRKUNGSGRAD', now: 'AKTUELL', torqueAxis: 'DREHMOMENT / Nm', powerConversion: 'ENERGIEWANDLUNG', energyFlow: 'ENERGIEFLUSS', wheels: 'RÄDER', battery: 'BATTERIE', power: 'LEISTUNG', nominal: 'NENNSPANNUNG', hvBattery: 'HV-BATTERIE', soc: 'LADEZUSTAND', controlWindow: 'REGELFENSTER 40–80%', voltage: 'SPANNUNG', current: 'STROM',
  discharge: 'Entladen', charge: 'Laden', regenTotal: 'Rekuperiert', realTimeModel: 'QUASIPHYSIKALISCHES ECHTZEITMODELL', modelSources: 'MODELL & QUELLEN', outputLevel: 'ANTRIEBSLEISTUNG', regenLevel: 'REKUPERATION', systemBasis: 'von 82 kW Systemleistung', regenBasis: 'von 25 kW Reku-Limit', learningDeck: 'LERNDECK', learnTitle: 'Drei Wellen. Nur zwei sind frei wählbar.', learnLead: 'THS II nutzt einen Planetenradsatz als Getriebe und Leistungsverzweigung. Die drei Wellendrehzahlen sind stets durch eine von den Zähnezahlen bestimmte Gleichung gebunden.', ringLearnTitle: 'Hohlrad → MG2 / Räder', ringLearnBody: 'Das äußere Hohlrad ist mit MG2 und dem Achsantrieb verbunden. Steht die Fahrzeuggeschwindigkeit fest, gilt das auch für MG2.', sunLearnTitle: 'Sonnenrad → MG1', sunLearnBody: 'Das Sonnenrad ist mit MG1 verbunden. Drehzahl und Generatormoment von MG1 bestimmen den Betriebspunkt des Verbrenners.', carrierLearnTitle: 'Träger → Verbrenner', carrierLearnBody: 'Der Träger der drei Planetenräder ist die Motorwelle. Die Motorleistung teilt sich in einen mechanischen und einen elektrischen Pfad.', tryIt: 'AUSPROBIEREN:', tryBody: 'Nimm während der Fahrt das Fahrpedal zurück. MG2 zieht MG1 in Gegenrichtung. Bergab hält Rekuperation automatisch die Geschwindigkeit.', modelBasis: 'MODELLBASIS · NHW20 (2003–2009)', modelSpecs: 'Masse 1.325 kg · Motor 57 kW / 115 Nm · MG2 50 kW / 400 Nm · System 82 kW · NiMH 201,6 V', disclaimer: 'Quasiphysikalisches Lernmodell. Veröffentlichte Maximaldaten sind real; nicht veröffentlichte Regelung und Detailwirkungsgrade sind angenähert.', toyotaSpec: 'TOYOTA · THS II DATEN ↗', ornlLayout: 'ORNL · PSD-ZÄHNE / AUFBAU ↗', close: 'Schließen',
}

const fr: Dictionary = {
  brandSubtitle: 'TRANSMISSION HYBRIDE INTERACTIVE', simulationVehicle: 'VÉHICULE SIMULÉ', gpuRendering: 'RENDU GPU', learn: 'APPRENDRE', reset: 'Réinitialiser la simulation', language: 'Langue', dry: 'SEC', testCourse: 'PISTE D’ESSAI 01', nextSurfaceIn: 'Prochain profil dans', distance: 'DISTANCE', flat: 'Route plate', uphill: 'Montée', downhill: 'Descente', rough: 'Route dégradée',
  ready: 'PRÊT', evDrive: 'MODE ÉLECTRIQUE', hybridDrive: 'MODE HYBRIDE', engineCharge: 'RECHARGE MOTEUR', regenerating: 'RÉGÉNÉRATION', descentHold: 'MAINTIEN DESCENTE', coasting: 'ROUE LIBRE', live3d: 'MÉCANISME 3D EN DIRECT', powerSplitDevice: 'RÉPARTITEUR DE PUISSANCE', gearRatio: 'DENTURE', dragHint: 'GLISSER : ORBITE · MOLETTE : ZOOM', carrier: 'PORTE-SATELLITES', engine: 'MOTEUR', sun: 'SOLAIRE', ring: 'COURONNE', outputShort: 'SORTIE', ringOutput: 'MG2 / SORTIE', kinematicConstraint: 'CONTRAINTE CINÉMATIQUE', locked: 'VALIDÉE', rotationComparison: 'COMPARAISON DES AXES', visualScale: 'VITESSE VISUELLE 1/240', relativeToMax: 'RELATIF À L’AXE LE PLUS RAPIDE', clockwise: 'HORAIRE', counterClockwise: 'ANTIHORAIRE', stopped: 'ARRÊT', actualSpeed: 'RÉEL',
  shaftTelemetry: 'TÉLÉMÉTRIE DES AXES', liveRotation: 'ROTATION EN DIRECT', planetCarrier: 'PORTE-SATELLITES', sunGear: 'ROUE SOLAIRE', ringGear: 'COURONNE', tireTorque: 'COUPLE AUX ROUES', output: 'PUISSANCE', regen: 'RÉGÉNÉRATION', fuelRate: 'CONSOMMATION INSTANT.', driverInput: 'COMMANDE CONDUCTEUR', accel: 'ACCÉLÉRATEUR', brake: 'FREIN', pause: 'PAUSE', start: 'DÉMARRER', engineModel: 'MODÈLE 1NZ-FXE', engineEfficiency: 'RENDEMENT MOTEUR', now: 'ACTUEL', torqueAxis: 'COUPLE / Nm', powerConversion: 'CONVERSION D’ÉNERGIE', energyFlow: 'FLUX D’ÉNERGIE', wheels: 'ROUES', battery: 'BATTERIE', power: 'PUISSANCE', nominal: 'NOMINALE', hvBattery: 'BATTERIE HT', soc: 'CHARGE', controlWindow: 'FENÊTRE DE CONTRÔLE 40–80%', voltage: 'TENSION', current: 'COURANT',
  discharge: 'décharge', charge: 'charge', regenTotal: 'Récupération totale', realTimeModel: 'MODÈLE QUASI-PHYSIQUE TEMPS RÉEL', modelSources: 'MODÈLE & SOURCES', outputLevel: 'PUISSANCE MOTRICE', regenLevel: 'RÉCUPÉRATION', systemBasis: 'sur 82 kW système', regenBasis: 'sur limite 25 kW', learningDeck: 'FICHES PÉDAGOGIQUES', learnTitle: 'Trois axes. Seulement deux sont libres.', learnLead: 'Le THS II utilise un train épicycloïdal comme transmission et comme répartiteur de puissance. Les vitesses des trois axes sont toujours liées par une équation définie par les dentures.', ringLearnTitle: 'Couronne → MG2 / roues', ringLearnBody: 'La couronne extérieure est reliée à MG2 et au réducteur final. La vitesse du véhicule détermine donc celle de MG2.', sunLearnTitle: 'Solaire → MG1', sunLearnBody: 'Le planétaire solaire est relié à MG1. Sa vitesse et son couple générateur créent le point de fonctionnement du moteur.', carrierLearnTitle: 'Porte-satellites → moteur', carrierLearnBody: 'Le porte-satellites supportant les trois pignons est l’arbre moteur. La puissance se divise en voies mécanique et électrique.', tryIt: 'À ESSAYER :', tryBody: 'Relâchez l’accélérateur en roulant. MG2 entraîne MG1 en sens inverse. En descente, la régénération maintient automatiquement la vitesse.', modelBasis: 'BASE DU MODÈLE · NHW20 (2003–2009)', modelSpecs: 'Masse 1 325 kg · Moteur 57 kW / 115 Nm · MG2 50 kW / 400 Nm · Système 82 kW · NiMH 201,6 V', disclaimer: 'Modèle quasi-physique pédagogique. Les maxima publiés sont utilisés ; les lois de commande et rendements détaillés non publics sont approximés.', toyotaSpec: 'TOYOTA · DONNÉES THS II ↗', ornlLayout: 'ORNL · DENTURE / ARCHITECTURE ↗', close: 'Fermer',
}

const dictionaries: Record<Locale, Dictionary> = { EN: en, JP: jp, ZH: zh, DE: de, FR: fr }
export const localeLabels: Record<Locale, string> = { EN: 'EN', JP: 'JP', ZH: '中文', DE: 'DE', FR: 'FR' }

export const translate = (locale: Locale, key: TranslationKey) => dictionaries[locale][key]

export const modeTranslationKey: Record<DriveMode, TranslationKey> = {
  READY: 'ready', 'EV DRIVE': 'evDrive', 'HYBRID DRIVE': 'hybridDrive', 'ENGINE CHARGE': 'engineCharge',
  REGENERATING: 'regenerating', 'DESCENT HOLD': 'descentHold', COASTING: 'coasting',
}

export const terrainTranslationKey: Record<TerrainKind, TranslationKey> = {
  flat: 'flat', uphill: 'uphill', downhill: 'downhill', rough: 'rough',
}
