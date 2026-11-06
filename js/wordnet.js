/**
 * 日本語WordNet (最新2.1) モジュール
 * Francis Bond Lab (https://bond-lab.github.io/wnja/) の最新データに基づくシソーラス辞書
 */
(function (global) {
  "use strict";

  let wordnetData = null;
  let loadPromise = null;

  /**
   * 辞書データの非同期ロード
   */
  async function loadWordNet() {
    if (wordnetData) return wordnetData;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const config = global.APP_CONFIG || {};
      const gzUrl = config.WORDNET_DATA_GZ_URL || "./data/wordnet_ja.json.gz";
      const jsonUrl = config.WORDNET_DATA_JSON_URL || "./data/wordnet_ja.json";

      // 1. DecompressionStream による gzip ダウンロード & 解凍の試行
      if (typeof DecompressionStream !== "undefined") {
        try {
          const res = await fetch(gzUrl);
          if (res.ok) {
            const ds = new DecompressionStream("gzip");
            const decompressedStream = res.body.pipeThrough(ds);
            const text = await new Response(decompressedStream).text();
            wordnetData = JSON.parse(text);
            return wordnetData;
          }
        } catch (e) {
          console.warn("DecompressionStream での gzip 読み込みに失敗しました。json をフォールバック読み込みします:", e);
        }
      }

      // 2. 非圧縮 json のフォールバック読み込み
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) {
          throw new Error(`WordNet データの取得に失敗しました (status: ${res.status})`);
        }
        wordnetData = await res.json();
        return wordnetData;
      } catch (err) {
        console.error("WordNet 辞書の読み込みに失敗しました:", err);
        wordnetData = {};
        return wordnetData;
      }
    })();

    return loadPromise;
  }

  /**
   * 単語がシソーラスに登録されているか判定
   * @param {string} term 単語
   * @returns {boolean}
   */
  function hasThesaurus(term) {
    if (!wordnetData || !term) return false;
    const entry = wordnetData[term];
    if (!entry) return false;
    return !!(
      (entry.s && entry.s.length > 0) ||
      (entry.a && entry.a.length > 0) ||
      (entry.h && entry.h.length > 0) ||
      (entry.n && entry.n.length > 0)
    );
  }

  /**
   * 単語の類義語リストを取得
   * @param {string} term 単語
   * @returns {string[]}
   */
  function getSynonyms(term) {
    if (!wordnetData || !term) return [];
    const entry = wordnetData[term];
    return (entry && entry.s) ? entry.s : [];
  }

  /**
   * 単語のシソーラス全情報（類義語、関連語、上位語、下位語）を取得
   * @param {string} term 単語
   * @returns {Array<{ name: string, mode: number, words: string[] }>}
   */
  function getThesaurus(term) {
    if (!wordnetData || !term) return [];
    const entry = wordnetData[term];
    if (!entry) return [];

    const result = [];

    // mode 1: 類義語
    if (entry.s && entry.s.length > 0) {
      result.push({
        name: "類義語",
        mode: 1,
        words: entry.s
      });
    }

    // mode 2: 関連語
    if (entry.a && entry.a.length > 0) {
      result.push({
        name: "関連語",
        mode: 2,
        words: entry.a
      });
    }

    // mode 3: 上位語
    if (entry.h && entry.h.length > 0) {
      result.push({
        name: "上位語",
        mode: 3,
        words: entry.h
      });
    }

    // mode 4: 下位語
    if (entry.n && entry.n.length > 0) {
      result.push({
        name: "下位語",
        mode: 4,
        words: entry.n
      });
    }

    return result;
  }

  /**
   * 指定モードに対応する拡張語リストを取得
   * mode 1: 類義語
   * mode 2: 関連語
   * mode 3: 上位語
   * mode 4: 下位語
   */
  function getExpansionWords(term, mode) {
    if (!wordnetData || !term) return [];
    const entry = wordnetData[term];
    if (!entry) return [];

    if (mode === 1) return entry.s || [];
    if (mode === 2) return entry.a || [];
    if (mode === 3) return entry.h || [];
    if (mode === 4) return entry.n || [];
    return [];
  }

  global.WordNetManager = {
    loadWordNet,
    hasThesaurus,
    getSynonyms,
    getThesaurus,
    getExpansionWords,
    isLoaded: () => wordnetData !== null
  };
})(window);

