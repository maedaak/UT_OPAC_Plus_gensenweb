/**
 * 東京大学OPAC Plus "言選Web" 設定ファイル
 * 本番環境への切り替え時は、このファイルの CINII_API_PROXY_URL などを変更してください。
 */
window.APP_CONFIG = {
  // CiNii Research API プロキシのURL
  // （末尾に "?q=" があってもなくても自動で補正されます）
  CINII_API_PROXY_URL: "https://ciniir-b-query-restricted.maedaak.workers.dev?q=",

  // kuromoji辞書ファイルの配置パス
  KUROMOJI_DIC_PATH: "./js/dict",

  // 日本語WordNet (最新2.1) 辞書ファイルのパス
  WORDNET_DATA_GZ_URL: "./data/wordnet_ja.json.gz",
  WORDNET_DATA_JSON_URL: "./data/wordnet_ja.json",

  // 入力文字数の上限
  MAX_INPUT_LENGTH: 50,

  // 抽出する用語の重要度しきい値
  MIN_IMPORTANCE_SCORE: 1.2,

  // 抽出する用語の最大件数
  MAX_TERMS_COUNT: 100,

  // 外部リンクターゲットURLのテンプレート
  // 東京大学OPAC
  UT_OPAC_URL: "https://opac.dl.itc.u-tokyo.ac.jp/opac/opac_search/?lang=0&amode=2&cmode=0&kywd=&smode=1&con1_exp=all&con2_exp=all&op2_exp=OR&dpmc_exp%5B%5D=all",
  // 国立国会図書館サーチ（NDL）
  NDL_SEARCH_URL: "https://ndlsearch.ndl.go.jp/api/openurl?ndl_dpid=zassaku&any=",
  // CiNii Research 書籍・文献検索
  CINII_RESEARCH_URL: "https://cir.nii.ac.jp/all?q=",
};

