/**
 * 言選Web (TermExtract) 日本語用語抽出コントローラー
 * kuromoji.js と gensenwebKuromojijs.js を統合してブラウザ上で専門用語を抽出します。
 */
(function (global) {
  "use strict";

  let tokenizerPromise = null;

  /**
   * kuromoji トークナイザーの初期化（シングルトン）
   */
  function getTokenizer() {
    if (tokenizerPromise) {
      return tokenizerPromise;
    }

    const config = global.APP_CONFIG || {};
    const dicPath = config.KUROMOJI_DIC_PATH || "./js/dict";

    tokenizerPromise = new Promise((resolve, reject) => {
      if (typeof global.kuromoji === "undefined") {
        reject(new Error("kuromoji.js がロードされていません。"));
        return;
      }

      global.kuromoji
        .builder({ dicPath: dicPath })
        .build((err, tokenizer) => {
          if (err) {
            reject(err);
          } else if (!tokenizer) {
            reject(new Error("形態素解析器の初期化に失敗しました。"));
          } else {
            resolve(tokenizer);
          }
        });
    }).catch((err) => {
      tokenizerPromise = null;
      throw err;
    });

    return tokenizerPromise;
  }

  /**
   * テキストから専門用語（キーワード）を自動抽出し、重要度と表示サイズを算出
   * 
   * @param {string} text 解析対象テキスト
   * @param {boolean} [filter=false] CiNiiによるフィルタリングを行うか
   * @param {function} [onProgress] 進捗コールバック
   * @returns {Promise<Array<{ term: string, score: number, size: number, hasThesaurus: boolean }>>}
   */
  async function extractTerms(text, filter = false, onProgress = null) {
    if (!text || !text.trim()) {
      return [];
    }

    if (typeof global.gensenwebKuromojijs === "undefined") {
      throw new Error("gensenwebKuromojijs.js がロードされていません。");
    }

    onProgress && onProgress("形態素解析器を初期化中...");
    const tokenizer = await getTokenizer();

    onProgress && onProgress("テキストを形態素解析中...");
    const tokens = tokenizer.tokenize(text);

    onProgress && onProgress("言選Webで複合名詞と連接スコアを計算中...");
    const gensen = global.gensenwebKuromojijs;
    const candidates = gensen.cmp_noun_list(tokens);
    const frequency = gensen.list2key_value(candidates);
    const lrScores = gensen.score_lr(frequency, gensen.IGNORE_WORDS, 1, 1);
    const importance = gensen.term_importance(frequency, lrScores);
    const sortedTerms = gensen.sort_by_importance(importance);

    if (!sortedTerms || sortedTerms.length === 0) {
      return [];
    }

    const config = global.APP_CONFIG || {};
    const minScore = config.MIN_IMPORTANCE_SCORE || 1.2;
    const maxCount = config.MAX_TERMS_COUNT || 100;

    // Zipfの法則を線形分布で扱うため、対数 (log) でスケール判定（元のPerl版ロジック再現）
    const firstScore = sortedTerms[0].importance;
    const maxPoint = firstScore > 1 ? Math.log(firstScore) : 1;
    const level_1 = Math.floor(maxPoint / 1.5);
    const level_2 = Math.floor(maxPoint / 2.0);
    const level_3 = Math.floor(maxPoint / 2.5);

    const results = [];
    let count = 0;

    onProgress && onProgress("抽出用語の重み付けとシソーラス照合中...");

    for (const item of sortedTerms) {
      const rawTerm = item.cmp_noun;
      const score = item.importance;

      // 閾値判定
      if (score < minScore) break;
      if (count >= maxCount) break;

      // 日本語の膠着語整形
      let formattedTerm = gensen.modify_agglutinative_lang(rawTerm).trim();

      // 先頭・末尾の不要な記号（カンマ、コロン、セミコロン、スラッシュ等）を除去
      formattedTerm = formattedTerm.replace(/^[、，,;:／/・\s]+|[、，,;:／/・\s]+$/g, "").trim();

      // 空文字、または数値のみは除外
      if (!formattedTerm || /^\d+$/.test(formattedTerm)) {
        continue;
      }

      // 「/」や「;」など、一文字のASCII文字（記号・英数字）は結果から排除
      if (formattedTerm.length === 1 && formattedTerm.charCodeAt(0) <= 0x7f) {
        continue;
      }

      // ASCII記号のみで構成される場合も除外
      if (/^[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+$/.test(formattedTerm)) {
        continue;
      }

      // CiNiiフィルタリングが有効な場合
      if (filter && global.CiNiiClient) {
        onProgress && onProgress(`CiNii で用語確認中: ${formattedTerm} (${count + 1}/${maxCount})`);
        const hit = await global.CiNiiClient.checkHit(formattedTerm);
        if (!hit) {
          continue;
        }
      }

      // サイズ計算
      const logScore = Math.log(score);
      let size = 0;
      if (logScore > level_1) {
        size = 3;
      } else if (logScore > level_2) {
        size = 2;
      } else if (logScore > level_3) {
        size = 1;
      } else {
        size = 0;
      }

      // WordNetにシソーラス情報が存在するか判定
      const hasSim = global.WordNetManager ? global.WordNetManager.hasThesaurus(formattedTerm) : false;

      results.push({
        rawTerm,
        term: formattedTerm,
        score,
        size,
        hasThesaurus: hasSim
      });

      count++;
    }

    return results;
  }

  global.TermExtractor = {
    getTokenizer,
    extractTerms
  };
})(window);

