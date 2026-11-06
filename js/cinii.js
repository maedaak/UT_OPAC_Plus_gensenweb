/**
 * CiNii Research API プロキシ連携モジュール
 * CiNii Books から CiNii Research OpenSearch API (JSON) への切り替え対応
 */
(function (global) {
  "use strict";

  /**
   * プロキシURLを安全かつ柔軟に構築するヘルパー
   * 末尾の "?q=" の有無やスラッシュの有無に関わらず正しいURLを生成します。
   */
  function buildProxyUrl(query) {
    const config = global.APP_CONFIG || {};
    let baseUrl = config.CINII_API_PROXY_URL || "https://ciniir-b-query-restricted.maedaak.workers.dev?q=";
    baseUrl = String(baseUrl).trim();

    // 既に ?q= または &q= で終わっている場合
    if (/[?&]q=$/.test(baseUrl)) {
      return baseUrl + encodeURIComponent(query);
    }
    // ?q=... が途中に含まれている場合
    if (/[?&]q=/.test(baseUrl)) {
      return baseUrl + encodeURIComponent(query);
    }

    // 末尾のスラッシュを除去して ?q= を付与
    baseUrl = baseUrl.replace(/\/+$/, "");
    const separator = baseUrl.includes("?") ? "&q=" : "?q=";
    return baseUrl + separator + encodeURIComponent(query);
  }

  /**
   * CiNii Research から指定クエリの学術要約情報を取得
   * 
   * @param {string} query 検索クエリ
   * @returns {Promise<{ summary: string, totalResults: number, items: Array }>}
   */
  async function searchCiNii(query) {
    const url = buildProxyUrl(query);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        let errDetail = "";
        try {
          const errJson = await response.json();
          errDetail = errJson.error || JSON.stringify(errJson);
        } catch (_) {
          errDetail = response.statusText;
        }
        throw new Error(`CiNii API プロキシ通信エラー (HTTP ${response.status}: ${errDetail}) URL: ${url}`);
      }

      const data = await response.json();
      const totalResults = Number(data["opensearch:totalResults"] || (data.items ? data.items.length : 0));
      const items = Array.isArray(data.items) ? data.items : [];

      let summary = "";
      for (const item of items) {
        if (item.title) {
          summary += item.title + "\n";
        }
        if (item.description) {
          summary += item.description + "\n";
        }
      }

      return {
        summary,
        totalResults,
        items
      };
    } catch (err) {
      console.error(`CiNii Research 検索失敗 (${query}):`, err);
      throw err;
    }
  }

  /**
   * 用語が CiNii Research でヒットするか確認（フィルタリング用）
   * 
   * @param {string} term 検査対象の用語
   * @returns {Promise<boolean>} ヒットするかどうか
   */
  async function checkHit(term) {
    const url = buildProxyUrl(term);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      if (!response.ok) return false;
      const data = await response.json();
      const total = Number(data["opensearch:totalResults"] || 0);
      return total > 0;
    } catch (e) {
      console.warn(`CiNii フィルタリング確認エラー (${term}):`, e);
      return true; // エラー時は除外せず残す
    }
  }

  global.CiNiiClient = {
    buildProxyUrl,
    searchCiNii,
    checkHit
  };
})(window);
