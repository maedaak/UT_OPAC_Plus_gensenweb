/**
 * JavaScriptインジェクション対策および入出力エスケープモジュール
 * 
 * 指定エスケープ対象:
 * \ (バックスラッシュ)
 * ' (シングルクォート)
 * " (ダブルクォート)
 * // (ダブルスラッシュ)
 * \n/ (改行+スラッシュ)
 * \r (キャリッジリターン)
 * \t (タブ)
 */
(function (global) {
  "use strict";

  /**
   * 入力文字列のサニタイズ・エスケープ処理
   * ユーザーからの入力を受け取った直後に実行し、
   * 指定の特殊文字をエスケープして無害化するとともに、50文字上限を適用します。
   * 
   * @param {string} input ユーザー入力文字列
   * @param {number} maxLength 最大文字数（デフォルト50）
   * @returns {string} サニタイズ・エスケープ済み文字列
   */
  function escapeInput(input, maxLength = 50) {
    if (typeof input !== "string") {
      return "";
    }

    // 1. 最大文字数の制限（50文字上限）
    let str = input.slice(0, maxLength);

    // 2. 指定文字列のエスケープ処理
    // 注: バックスラッシュは自身のエスケープとして最初に処理する
    str = str.replace(/\\/g, "\\\\");     // \ -> \\
    str = str.replace(/'/g, "\\'");       // ' -> \'
    str = str.replace(/"/g, '\\"');       // " -> \"
    str = str.replace(/\/\//g, "\\/\\/"); // // -> \/\/
    str = str.replace(/\n\//g, "\\n\\/"); // \n/ -> \n\/
    str = str.replace(/\r/g, "\\r");      // \r -> \r
    str = str.replace(/\t/g, "\\t");      // \t -> \t

    return str;
  }

  /**
   * 出力（HTML/DOM描画）用のエスケープ処理
   * HTMLおよびスクリプトとして解釈されないよう、
   * HTML特殊文字と指定文字を実体参照等へ変換します。
   * 
   * @param {string} str 出力対象の文字列
   * @returns {string} エスケープ済み文字列
   */
  function escapeOutput(str) {
    if (str == null) {
      return "";
    }
    let s = String(str);

    // 基本的なHTML特殊文字のエスケープ
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/</g, "&lt;");
    s = s.replace(/>/g, "&gt;");

    // 指定エスケープ対象文字の安全な実体参照化・無害化
    s = s.replace(/"/g, "&quot;");         // " -> &quot;
    s = s.replace(/'/g, "&#39;");          // ' -> &#39;
    s = s.replace(/\\/g, "&#92;");         // \ -> &#92;
    s = s.replace(/\/\//g, "&#47;&#47;");   // // -> &#47;&#47;
    s = s.replace(/\n\//g, "\n&#47;");     // \n/ -> \n&#47;
    s = s.replace(/\r/g, "");              // \r -> 除去
    s = s.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"); // \t -> スペース

    return s;
  }

  /**
   * 属性値（title, data-*, value等）用のエスケープ処理
   * 
   * @param {string} str 属性値
   * @returns {string} エスケープ済み文字列
   */
  function escapeAttribute(str) {
    if (str == null) return "";
    let s = String(str);
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/"/g, "&quot;");
    s = s.replace(/'/g, "&#39;");
    s = s.replace(/</g, "&lt;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/\/\//g, "\\/\\/");
    s = s.replace(/\r/g, "");
    s = s.replace(/\t/g, " ");
    return s;
  }

  /**
   * JavaScript文字列コンテキスト用のエスケープ
   * 
   * @param {string} str 文字列
   * @returns {string} エスケープ済み文字列
   */
  function escapeJSString(str) {
    if (str == null) return "";
    let s = String(str);
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/'/g, "\\'");
    s = s.replace(/"/g, '\\"');
    s = s.replace(/\/\//g, "\\/\\/");
    s = s.replace(/\n\//g, "\\n\\/");
    s = s.replace(/\r/g, "\\r");
    s = s.replace(/\t/g, "\\t");
    s = s.replace(/\n/g, "\\n");
    return s;
  }

  global.SecurityUtil = {
    escapeInput,
    escapeOutput,
    escapeAttribute,
    escapeJSString
  };
})(window);

