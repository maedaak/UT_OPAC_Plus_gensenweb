/**
 * 東京大学OPAC Plus "言選Web" メインアプリケーション
 */
(function (global) {
  "use strict";

  // DOM要素
  let keywordInput, charCounter, searchForm, clearBtn;
  let filterCheckbox;
  let statusCard, statusMessage, progressBar;
  let resultContainer, thesaurusSection, termsListSection, emptyMessage, errorMessage;
  let currentSearchTitle, searchModeBadge;

  // 状態管理
  let isSearching = false;

  /**
   * 初期化処理
   */
  async function init() {
    // 要素の取得
    keywordInput = document.getElementById("keyword-input");
    charCounter = document.getElementById("char-counter");
    searchForm = document.getElementById("search-form");
    clearBtn = document.getElementById("clear-btn");
    filterCheckbox = document.getElementById("filter-cinii");

    statusCard = document.getElementById("status-card");
    statusMessage = document.getElementById("status-message");
    progressBar = document.getElementById("progress-bar");

    resultContainer = document.getElementById("result-container");
    thesaurusSection = document.getElementById("thesaurus-section");
    termsListSection = document.getElementById("terms-list-section");
    emptyMessage = document.getElementById("empty-message");
    errorMessage = document.getElementById("error-message");

    currentSearchTitle = document.getElementById("current-search-title");
    searchModeBadge = document.getElementById("search-mode-badge");

    // イベントリスナーの登録
    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const raw = keywordInput ? keywordInput.value : "";
        executeSearch(raw, 0);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        clearAll();
      });
    }

    if (keywordInput) {
      // 50文字上限とリアルタイム文字数カウント
      keywordInput.addEventListener("input", () => {
        updateCharCounter();
      });
      updateCharCounter();
    }

    // サンプルキーワードのクリックイベント
    document.querySelectorAll(".sample-tag").forEach((tag) => {
      tag.addEventListener("click", (e) => {
        e.preventDefault();
        const sampleWord = tag.getAttribute("data-word");
        if (sampleWord && keywordInput) {
          keywordInput.value = sampleWord;
          updateCharCounter();
          executeSearch(sampleWord, 0);
        }
      });
    });

    // 履歴の戻る・進む対応
    window.addEventListener("popstate", (e) => {
      const params = new URLSearchParams(window.location.search);
      const text = params.get("text");
      const mode = parseInt(params.get("mode") || "0", 10);
      if (text) {
        if (keywordInput) keywordInput.value = text;
        updateCharCounter();
        executeSearch(text, mode, false);
      } else {
        clearAll(false);
      }
    });

    // バックグラウンドでWordNet辞書とkuromojiのプリロードを開始
    preloadResources();

    // 初回URLパラメータの確認
    const initialParams = new URLSearchParams(window.location.search);
    const initialText = initialParams.get("text");
    const initialMode = parseInt(initialParams.get("mode") || "0", 10);
    if (initialText) {
      if (keywordInput) keywordInput.value = initialText;
      updateCharCounter();
      executeSearch(initialText, initialMode, false);
    }
  }

  /**
   * 辞書リソースの非同期プリロード
   */
  function preloadResources() {
    if (global.WordNetManager) {
      global.WordNetManager.loadWordNet().catch((err) => {
        console.warn("WordNetプリロード待機中:", err);
      });
    }
    if (global.TermExtractor) {
      global.TermExtractor.getTokenizer().catch((err) => {
        console.warn("kuromojiプリロード待機中:", err);
      });
    }
  }

  /**
   * 文字数カウンターの更新
   */
  function updateCharCounter() {
    if (!keywordInput || !charCounter) return;
    const maxLen = (global.APP_CONFIG && global.APP_CONFIG.MAX_INPUT_LENGTH) || 50;
    const len = keywordInput.value.length;
    charCounter.textContent = `${len} / ${maxLen} 文字`;
    if (len >= maxLen) {
      charCounter.classList.add("text-danger");
      charCounter.classList.add("fw-bold");
    } else {
      charCounter.classList.remove("text-danger");
      charCounter.classList.remove("fw-bold");
    }
  }

  /**
   * 進行状況の表示
   */
  function showStatus(message, percent = 50) {
    if (statusCard) statusCard.style.display = "block";
    if (statusMessage) statusMessage.textContent = message;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  function hideStatus() {
    if (statusCard) statusCard.style.display = "none";
    if (progressBar) progressBar.style.width = "0%";
  }

  /**
   * 検索実行メイン関数
   * 
   * @param {string} rawInput ユーザー入力値
   * @param {number} mode シソーラス拡張モード (0: 通常, 1: 類義語, 2: 関連語, 3: 上位語, 4: 下位語)
   * @param {boolean} pushState URL履歴に追加するか
   */
  async function executeSearch(rawInput, mode = 0, pushState = true) {
    if (isSearching) return;

    // JavaScriptインジェクション対策としての入力サニタイズ & 50文字上限
    const maxLen = (global.APP_CONFIG && global.APP_CONFIG.MAX_INPUT_LENGTH) || 50;
    const cleanInput = global.SecurityUtil
      ? global.SecurityUtil.escapeInput(rawInput, maxLen)
      : rawInput.slice(0, maxLen);

    if (!cleanInput.trim()) {
      alert("調査したい専門用語を入力してください。");
      if (keywordInput) keywordInput.focus();
      return;
    }

    isSearching = true;
    showStatus("検索を開始しています...", 10);
    hideError();
    hideEmpty();
    if (resultContainer) resultContainer.style.display = "none";

    // URLの更新
    if (pushState) {
      const url = new URL(window.location.href);
      url.searchParams.set("text", cleanInput);
      if (mode > 0) {
        url.searchParams.set("mode", String(mode));
      } else {
        url.searchParams.delete("mode");
      }
      window.history.pushState({ text: cleanInput, mode }, "", url.toString());
    }

    try {
      // 1. WordNet辞書のロード完了を待機
      showStatus("WordNet辞書を準備しています...", 20);
      if (global.WordNetManager) {
        await global.WordNetManager.loadWordNet();
      }

      // 2. 検索対象語の決定（シソーラス拡張モードの判定）
      const searchTerms = [cleanInput];
      if (mode > 0 && global.WordNetManager) {
        const expanded = global.WordNetManager.getExpansionWords(cleanInput, mode);
        // 上位5件程度を追加
        for (let i = 0; i < Math.min(expanded.length, 5); i++) {
          if (!searchTerms.includes(expanded[i])) {
            searchTerms.push(expanded[i]);
          }
        }
      }

      // 3. CiNii Research から学術情報の取得
      showStatus("CiNii Research から学術情報を取得中...", 40);
      let combinedSummary = "";
      let totalHits = 0;
      let lastError = null;
      let successCount = 0;

      for (const term of searchTerms) {
        try {
          const res = await global.CiNiiClient.searchCiNii(term);
          if (res.summary) {
            combinedSummary += res.summary + "\n";
          }
          totalHits += res.totalResults;
          successCount++;
        } catch (err) {
          console.error(`用語 "${term}" の CiNii 取得中にエラー:`, err);
          lastError = err;
        }
      }

      // 通信がすべて失敗した場合はエラーとして通知
      if (successCount === 0 && lastError) {
        hideStatus();
        showError(`CiNii Research API プロキシとの通信に失敗しました。\n詳細: ${lastError.message}\n設定URL: ${global.APP_CONFIG ? global.APP_CONFIG.CINII_API_PROXY_URL : ""}`);
        isSearching = false;
        return;
      }

      if (!combinedSummary.trim()) {
        hideStatus();
        showEmpty(`「${cleanInput}」に関する学術文献情報が CiNii Research で見つかりませんでした（ヒット件数: 0件）。別の用語をお試しください。`);
        isSearching = false;
        return;
      }

      // 4. 言選Web（TermExtract）による専門用語抽出
      showStatus("形態素解析と言選Web（用語抽出）を実行中...", 65);
      const isFilter = filterCheckbox ? filterCheckbox.checked : false;

      const extractedResults = await global.TermExtractor.extractTerms(
        combinedSummary,
        isFilter,
        (msg) => showStatus(msg, 75)
      );

      // 5. 検索結果画面の描画
      showStatus("結果画面を描画中...", 95);
      renderResults(cleanInput, mode, extractedResults);

      hideStatus();
      if (resultContainer) {
        resultContainer.style.display = "block";
        resultContainer.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      console.error("検索処理中にエラーが発生しました:", err);
      hideStatus();
      showError(`処理中にエラーが発生しました: ${err.message}`);
    } finally {
      isSearching = false;
    }
  }

  /**
   * 検索結果の描画
   */
  function renderResults(term, mode, results) {
    // 検索タイトルの設定
    if (currentSearchTitle) {
      currentSearchTitle.textContent = term;
    }

    // 探索モードバッジ
    if (searchModeBadge) {
      searchModeBadge.className = "badge";
      if (mode === 1) {
        searchModeBadge.textContent = "類義語で探索範囲を拡張中";
        searchModeBadge.classList.add("bg-success");
      } else if (mode === 2) {
        searchModeBadge.textContent = "関連語で探索範囲を拡張中";
        searchModeBadge.classList.add("bg-info", "text-dark");
      } else if (mode === 3) {
        searchModeBadge.textContent = "上位語で探索範囲を拡張中";
        searchModeBadge.classList.add("bg-warning", "text-dark");
      } else if (mode === 4) {
        searchModeBadge.textContent = "下位語で探索範囲を拡張中";
        searchModeBadge.classList.add("bg-secondary");
      } else {
        searchModeBadge.textContent = "通常探索";
        searchModeBadge.classList.add("bg-primary");
      }
    }

    // シソーラスボックスの描画
    renderThesaurusBox(term);

    // 用語リストの描画
    renderTermsList(term, results);
  }

  /**
   * シソーラスボックスの描画
   */
  function renderThesaurusBox(term) {
    if (!thesaurusSection) return;
    thesaurusSection.innerHTML = "";

    if (!global.WordNetManager) return;
    const thesaurusList = global.WordNetManager.getThesaurus(term);

    if (!thesaurusList || thesaurusList.length === 0) {
      thesaurusSection.style.display = "none";
      return;
    }

    thesaurusSection.style.display = "block";

    const card = document.createElement("div");
    card.className = "card thesaurus-card shadow-sm mb-4 border-success";

    const header = document.createElement("div");
    header.className = "card-header bg-success text-white py-2";
    header.innerHTML = `<strong>日本語WordNet (最新2.1) シソーラス：</strong>「<span class="term-highlight">${global.SecurityUtil ? global.SecurityUtil.escapeOutput(term) : term}</span>」のエントリー`;
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body py-3";

    thesaurusList.forEach((entry) => {
      const p = document.createElement("div");
      p.className = "mb-2 thesaurus-row";

      // カテゴリ名
      const nameSpan = document.createElement("span");
      nameSpan.className = "badge bg-light text-dark border me-2";
      nameSpan.textContent = entry.name;
      p.appendChild(nameSpan);

      // 単語リスト
      const wordsSpan = document.createElement("span");
      wordsSpan.className = "thesaurus-words";

      entry.words.forEach((w, idx) => {
        if (idx > 0) {
          const sep = document.createTextNode(" / ");
          wordsSpan.appendChild(sep);
        }

        const a = document.createElement("a");
        a.href = "#";
        a.className = "thesaurus-word-link text-decoration-none";
        a.textContent = w;
        a.title = `「${w}」で再検索`;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (keywordInput) keywordInput.value = w;
          updateCharCounter();
          executeSearch(w, 0);
        });
        wordsSpan.appendChild(a);
      });
      p.appendChild(wordsSpan);

      // 範囲拡張リンク
      const expandLink = document.createElement("a");
      expandLink.href = "#";
      expandLink.className = "ms-3 btn btn-outline-success btn-xs expand-search-btn";
      expandLink.innerHTML = `<small>[${entry.name}に範囲を広げて再探索]</small>`;
      expandLink.title = `「${term}」とその${entry.name}を含めて検索範囲を広げます`;
      expandLink.addEventListener("click", (e) => {
        e.preventDefault();
        executeSearch(term, entry.mode);
      });
      p.appendChild(expandLink);

      body.appendChild(p);
    });

    card.appendChild(body);
    thesaurusSection.appendChild(card);
  }

  /**
   * 重要度順の関連用語リストの描画
   */
  function renderTermsList(baseTerm, results) {
    if (!termsListSection) return;
    termsListSection.innerHTML = "";

    if (!results || results.length === 0) {
      showEmpty("抽出できた関連学術用語はありませんでした。");
      return;
    }

    const listGroup = document.createElement("ul");
    listGroup.className = "list-group list-group-flush terms-list shadow-sm rounded";

    results.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex align-items-center justify-content-between term-item py-2 px-3";

      // 左側: アイコン + 用語
      const leftCol = document.createElement("div");
      leftCol.className = "d-flex align-items-center flex-wrap";

      // 1. 東京大学OPAC 検索アイコンボタン
      const opacLink = document.createElement("a");
      opacLink.href = "#";
      opacLink.className = "me-2 action-icon-btn";
      opacLink.title = `東京大学OPACで「${baseTerm}」および「${item.term}」を検索`;
      
      const opacImg = document.createElement("img");
      opacImg.src = "./icon/opac_off.png";
      opacImg.alt = "UT OPAC";
      opacImg.className = "action-icon";
      opacLink.appendChild(opacImg);

      opacLink.addEventListener("click", (e) => {
        e.preventDefault();
        opacImg.src = "./icon/opac_on.png";
        openUtOpac(baseTerm, item.term);
      });
      leftCol.appendChild(opacLink);

      // 2. 国会図書館サーチ (NDL) 検索アイコンボタン
      const ndlLink = document.createElement("a");
      ndlLink.href = "#";
      ndlLink.className = "me-3 action-icon-btn";
      ndlLink.title = `国立国会図書館サーチ（雑誌記事索引等）で「${item.term}」を検索`;

      const ndlImg = document.createElement("img");
      ndlImg.src = "./icon/porta_off.png";
      ndlImg.alt = "NDL Search";
      ndlImg.className = "action-icon";
      ndlLink.appendChild(ndlImg);

      ndlLink.addEventListener("click", (e) => {
        e.preventDefault();
        ndlImg.src = "./icon/porta_on.png";
        openNdlSearch(item.term);
      });
      leftCol.appendChild(ndlLink);

      // 3. 用語名リンク（重要度サイズ別スタイル）
      const termLink = document.createElement("a");
      termLink.href = "#";
      termLink.className = `term-name-link size-level-${item.size} text-primary text-decoration-none fw-bold me-2`;
      termLink.textContent = item.term;
      termLink.title = `「${item.term}」をキーワードとして言選Webで再探索`;
      termLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (keywordInput) keywordInput.value = item.term;
        updateCharCounter();
        executeSearch(item.term, 0);
      });
      leftCol.appendChild(termLink);

      // 4. 類似語（シソーラス）アイコン
      if (item.hasThesaurus) {
        const simImg = document.createElement("img");
        simImg.src = "./icon/simmular.png";
        simImg.alt = "類似語あり";
        simImg.className = "simmular-icon ms-1";
        
        // ホバー時に類義語ツールチップを表示
        const syns = global.WordNetManager ? global.WordNetManager.getSynonyms(item.term) : [];
        if (syns.length > 0) {
          simImg.title = "【WordNet類義語】 " + syns.join(" / ");
        } else {
          simImg.title = "【WordNet】 シソーラス登録語（クリックで再探索可能）";
        }

        // クリックでその用語をシソーラス検索
        simImg.style.cursor = "pointer";
        simImg.addEventListener("click", (e) => {
          e.preventDefault();
          if (keywordInput) keywordInput.value = item.term;
          updateCharCounter();
          executeSearch(item.term, 0);
        });

        leftCol.appendChild(simImg);
      }

      li.appendChild(leftCol);

      // 右側: 重要度スコア
      const rightCol = document.createElement("div");
      rightCol.className = "term-score-badge text-muted small";
      rightCol.innerHTML = `<span class="badge bg-light text-secondary border">スコア: ${item.score.toFixed(2)}</span>`;
      li.appendChild(rightCol);

      listGroup.appendChild(li);
    });

    termsListSection.appendChild(listGroup);
  }

  /**
   * 東京大学OPAC検索を別タブで開く
   */
  function openUtOpac(keyword1, keyword2) {
    const config = global.APP_CONFIG || {};
    const baseUrl = config.UT_OPAC_URL || "https://opac.dl.itc.u-tokyo.ac.jp/opac/opac_search/?lang=0&amode=2&cmode=0&kywd=&smode=1&con1_exp=all&con2_exp=all&op2_exp=OR&dpmc_exp%5B%5D=all";
    const p1 = encodeURIComponent(keyword1 || "");
    const p2 = encodeURIComponent(keyword2 || "");
    const targetUrl = `${baseUrl}&kywd1_exp=${p1}&kywd2_exp=${p2}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * 国立国会図書館サーチ（雑誌記事索引等）を別タブで開く
   */
  function openNdlSearch(keyword) {
    const config = global.APP_CONFIG || {};
    const baseUrl = config.NDL_SEARCH_URL || "https://ndlsearch.ndl.go.jp/api/openurl?ndl_dpid=zassaku&any=";
    const targetUrl = baseUrl + encodeURIComponent(keyword || "");
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * エラー表示
   */
  function showError(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.style.display = "block";
  }

  function hideError() {
    if (errorMessage) errorMessage.style.display = "none";
  }

  /**
   * 0件表示
   */
  function showEmpty(msg) {
    if (!emptyMessage) return;
    emptyMessage.textContent = msg;
    emptyMessage.style.display = "block";
  }

  function hideEmpty() {
    if (emptyMessage) emptyMessage.style.display = "none";
  }

  /**
   * 全クリア
   */
  function clearAll(clearUrl = true) {
    if (keywordInput) {
      keywordInput.value = "";
      updateCharCounter();
      keywordInput.focus();
    }
    if (resultContainer) resultContainer.style.display = "none";
    if (thesaurusSection) thesaurusSection.innerHTML = "";
    if (termsListSection) termsListSection.innerHTML = "";
    hideError();
    hideEmpty();
    hideStatus();

    if (clearUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete("text");
      url.searchParams.delete("mode");
      window.history.pushState({}, "", url.pathname);
    }
  }

  // DOMContentLoaded で起動
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.App = {
    executeSearch,
    clearAll
  };
})(window);

