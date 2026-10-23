(function() {
    "use strict";

    // ===== 設定 =====
    var CONFIG = {
        // "direct": 本ページが di-PiNK(itm.js) を直接読み込む（テスト用）
        // "gtm"   : dataLayer へ push するだけ。di-PiNK は GTM 側のタグが発火する（本番想定）
        mode: "direct",
        // di-PiNK 送信完了を待つ最大時間(ms)。超えたら成否にかかわらずリダイレクト
        timeoutMs: 3000,
        // itm.js 読込完了後、ビーコン送出のために待つ時間(ms)（direct モード）
        graceMs: 300,
        // ダミーページの最低表示時間(ms)。0 で即時
        minWaitMs: 0,
        // tk/adid が無い場合: "redirect"=送信せずリダイレクト / "error"=エラー表示して止める
        noIdBehavior: "redirect",
        dipinkScript: "//dmp.im-apps.net/js/1026387/0001/itm.js",
        dipinkVar: "itm_dl1_1026387",
        // リダイレクト先（許可リスト方式。URLパラメータ dest で選択。任意URLは受け付けない）
        destinations: {
            line: "https://miniapp.line.me/2009418018-P1HREl3z"
        },
        defaultDest: "line",
        // リダイレクト先へ引き継ぐパラメータ
        passParams: ["tk", "adid"],
        utmParams: ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
    };

    var params = new URLSearchParams(window.location.search);
    var debug = params.get("debug") === "1";
    var noRedirect = params.get("noredirect") === "1";
    var startedAt = Date.now();
    var finished = false;
    var statusEl = document.getElementById("relay-status");
    var logEl = document.getElementById("relay-log");

    var stepDefs = [
        { id: "id", label: "tk / adid を確定" },
        { id: "data", label: "custom_data をセット" },
        { id: "insert", label: "itm.js の読み込み開始" },
        { id: "load", label: "itm.js の読み込み完了" },
        { id: "grace", label: "読み込み後の待機" },
        { id: "leave", label: "遷移" }
    ];
    var stepState = {};
    var stepNote = {};

    function log(message) {
        var line = "[+" + (Date.now() - startedAt) + "ms] " + message;
        if (window.console) { console.log("[relay] " + line); }
        if (debug && logEl) {
            logEl.hidden = false;
            logEl.textContent += line + "\n";
        }
    }

    function renderSteps() {
        var list = document.getElementById("relay-steps");
        var marks = { wait: "未着手", run: "進行中", ok: "完了", ng: "失敗" };

        if (!list) {
            return;
        }

        list.textContent = "";
        stepDefs.forEach(function(step) {
            var state = stepState[step.id] || "wait";
            var item = document.createElement("li");
            item.className = "is-" + state;
            item.textContent = marks[state] + "  " + step.label + (stepNote[step.id] ? "（" + stepNote[step.id] + "）" : "");
            list.appendChild(item);
        });
    }

    function setStep(id, state, note) {
        stepState[id] = state;
        if (note) {
            stepNote[id] = note;
        }
        renderSteps();
    }

    function failOpenSteps(note) {
        stepDefs.forEach(function(step) {
            if (step.id === "leave") {
                return;
            }
            var state = stepState[step.id] || "wait";
            if (state === "wait" || state === "run") {
                stepState[step.id] = "ng";
                stepNote[step.id] = note;
            }
        });
    }

    function scriptTiming() {
        var entries;
        var i;
        var entry;
        var bytes;

        try {
            entries = window.performance.getEntriesByType("resource");
        } catch (error) {
            return "";
        }

        for (i = entries.length - 1; i >= 0; i--) {
            entry = entries[i];
            if (entry.name.indexOf("itm.js") === -1) {
                continue;
            }
            bytes = entry.transferSize || entry.encodedBodySize || 0;
            return Math.round(entry.duration) + "ms" + (bytes ? " / " + bytes + " bytes" : "");
        }

        return "";
    }

    function loadStored(key) {
        try { return window.sessionStorage.getItem(key) || ""; } catch (e) { return ""; }
    }

    function resolveIds() {
        var tk = params.get("tk");
        var adid = params.get("adid");

        if (!tk || !adid) {
            var stored = loadStored("custom_data").split("_");
            if (stored.length === 2 && stored[0] && stored[1]) {
                tk = stored[0];
                adid = stored[1];
                log("URLに無いため sessionStorage から復元");
            }
        }
        return (tk && adid) ? { tk: tk, adid: adid } : null;
    }

    function buildDestination(ids) {
        var key = params.get("dest");
        var base = CONFIG.destinations[key] || CONFIG.destinations[CONFIG.defaultDest];
        var url = new URL(base);

        if (ids) {
            CONFIG.passParams.forEach(function(name) {
                if (ids[name]) { url.searchParams.set(name, ids[name]); }
            });
        }

        CONFIG.utmParams.forEach(function(name) {
            var value = params.get(name);
            if (value) { url.searchParams.set(name, value); }
        });

        return url.toString();
    }

    function setStatus(text) {
        if (statusEl) { statusEl.textContent = text; }
    }

    function showHeldParams(ids) {
        var list = document.getElementById("held-params");
        var values = {
            tk: (ids && ids.tk) || params.get("tk") || "",
            adid: (ids && ids.adid) || params.get("adid") || ""
        };

        if (!list) {
            return;
        }

        CONFIG.utmParams.forEach(function(name) {
            values[name] = params.get(name) || "";
        });

        ["tk", "adid"].concat(CONFIG.utmParams).forEach(function(name) {
            var row = document.createElement("div");
            var term = document.createElement("dt");
            var value = document.createElement("dd");

            term.textContent = name;
            value.textContent = values[name] || "（なし）";
            row.appendChild(term);
            row.appendChild(value);
            list.appendChild(row);
        });
    }

    function finish(reason, destination) {
        if (finished) { return; }
        finished = true;

        var remain = Math.max(0, CONFIG.minWaitMs - (Date.now() - startedAt));
        log("完了: " + reason);
        if (reason.indexOf("タイムアウト") !== -1) {
            failOpenSteps("タイムアウト");
        }

        window.setTimeout(function() {
            if (noRedirect) {
                setStatus("noredirect=1 のため遷移を停止中");
                setStep("leave", "ok", "noredirect=1 のため停止");
                log("遷移先(停止中): " + destination);
                return;
            }
            setStep("leave", "ok", "遷移します");
            // replace: 戻るボタンでダミーページへ戻ってリダイレクトがループしないようにする
            window.location.replace(destination);
        }, remain);
    }

    function send(ids, destination) {
        var customData = ids.tk + "_" + ids.adid;

        // 同一セッションの他ページ（LP等）と値を揃える
        try {
            window.sessionStorage.setItem("custom_data", customData);
            window.sessionStorage.setItem("custom_data_params", JSON.stringify([ids.tk, ids.adid]));
        } catch (e) { /* noop */ }

        // GTM から完了通知を受けるための口（GTM の後続タグで window.dipinkRelay.complete() を呼ぶ）
        window.dipinkRelay = {
            complete: function() {
                if (stepState.load === "run") {
                    setStep("load", "ok", "完了通知");
                }
                if (!stepState.grace || stepState.grace === "wait" || stepState.grace === "run") {
                    setStep("grace", "ok", "完了通知");
                }
                finish("GTM/外部から完了通知", destination);
            }
        };

        // タイムアウト（タグの成否にかかわらず必ず遷移）
        window.setTimeout(function() { finish("タイムアウト(" + CONFIG.timeoutMs + "ms)", destination); }, CONFIG.timeoutMs);

        var dl = window[CONFIG.dipinkVar] = window[CONFIG.dipinkVar] || [];
        dl.push({ "custom_data": customData });
        dl.push({ "custom_type": "param_A" });
        dl.push({ "custom_rank": "param_B" });
        log("custom_data = " + customData);
        setStep("data", "ok", customData);

        if (CONFIG.mode === "gtm") {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ "event": "dipink_relay", "custom_data": customData });
            setStep("insert", "ok", "GTMへイベント送信");
            setStep("load", "run", "GTMの完了通知待ち");
            log("dataLayer.push(dipink_relay) 済み。GTM側の完了通知を待機");
            return;
        }

        var s = document.createElement("script");
        s.async = true;
        s.src = CONFIG.dipinkScript;
        setStep("insert", "run");
        s.onload = function() {
            log("itm.js 読込完了");
            setStep("insert", "ok");
            setStep("load", "ok", scriptTiming());
            setStep("grace", "run", CONFIG.graceMs + "ms");
            window.setTimeout(function() {
                setStep("grace", "ok");
                finish("itm.js 読込完了＋" + CONFIG.graceMs + "ms", destination);
            }, CONFIG.graceMs);
        };
        s.onerror = function() {
            log("itm.js 読込失敗");
            setStep("insert", "ok");
            setStep("load", "ng", "読み込み失敗");
            setStep("grace", "ng", "失敗のためスキップ");
            finish("itm.js 読込失敗", destination);
        };
        document.head.appendChild(s);
        if (stepState.load !== "ok" && stepState.load !== "ng") {
            setStep("insert", "ok");
            setStep("load", "run");
        }
    }

    renderSteps();
    setStep("id", "run");
    var ids = resolveIds();
    showHeldParams(ids);
    var destination = buildDestination(ids);
    var destinationEl = document.getElementById("relay-dest");
    if (destinationEl) {
        destinationEl.textContent = destination;
    }
    log("遷移先: " + destination);

    if (!ids) {
        log("tk/adid なし");
        setStep("id", "ng", "tk/adid なし");
        setStep("data", "ng", "送信しない");
        setStep("insert", "ng", "読み込まない");
        setStep("load", "ng", "読み込まない");
        setStep("grace", "ng", "待たない");
        if (CONFIG.noIdBehavior === "error") {
            finished = true;
            setStep("leave", "ng", "停止");
            setStatus("IDを取得できませんでした。お手数ですが、はじめからやり直してください。");
            return;
        }
        finish("tk/adid なしのため送信せず遷移", destination);
        return;
    }

    setStep("id", "ok", ids.tk + " / " + ids.adid);

    send(ids, destination);
})();
