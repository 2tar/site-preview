/* 確認用の表示だけを置く。
   外すときは次を消す。
   1. index.html / relay.html の DEBUG ブロック
   2. css/debug.css の読み込み
   3. このファイルの読み込み
   4. relay.js の debugEmit と debugHolds
   このファイルが無いページでは、表示も noredirect=1 の停止も行わない。 */
(function() {
    "use strict";

    var params = new URLSearchParams(window.location.search);
    var utmNames = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
    var containers = ["GTM-M4RDPRQ", "GTM-NDXPKRP", "GTM-5MTD7V", "GTM-T9WR56C"];
    var startedAt = Date.now();
    var timeoutMs = 3000;
    var stepDefs = [
        { id: "id", label: "tk / adid を確定" },
        { id: "data", label: "dataLayer へ custom_data を送る" },
        { id: "gtm", label: "GTM コンテナを読み込む" },
        { id: "notice", label: "GTM からの完了通知" },
        { id: "leave", label: "遷移" }
    ];
    var stepState = {};
    var stepNote = {};

    window.dipinkDebug = {
        hold: params.get("noredirect") === "1",
        on: function(type, detail) {
            if (type === "status") {
                setStatus(detail);
                return;
            }
            if (type === "url") {
                showDestination(detail);
                return;
            }
            if (type === "id") {
                showHeldParams(heldValues(detail.ids));
            }
            setStep(type, detail.state, detail.note);
        }
    };

    if (document.body.classList.contains("relay-body")) {
        renderSteps();
        showHeldParams(heldValues(null));
        setStep("gtm", "run");
        watchContainers();
    } else {
        showHeldParams(indexValues());
        bindClearButton();
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

    function showHeldParams(values) {
        var list = document.getElementById("held-params");
        var names = ["tk", "adid"].concat(utmNames);

        if (!list) {
            return;
        }

        list.textContent = "";
        names.forEach(function(name) {
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

    function indexValues() {
        var stored = (params.get("tk") || params.get("adid")) ? null : storedIds();
        var values = {
            tk: params.get("tk") || (stored && stored.tk) || "",
            adid: params.get("adid") || (stored && stored.adid) || ""
        };

        utmNames.forEach(function(name) {
            values[name] = params.get(name) || "";
        });
        return values;
    }

    function heldValues(ids) {
        var values = {
            tk: (ids && ids.tk) || params.get("tk") || "",
            adid: (ids && ids.adid) || params.get("adid") || ""
        };

        utmNames.forEach(function(name) {
            values[name] = params.get(name) || "";
        });
        return values;
    }

    function storedIds() {
        var data;
        var saved;
        var parts;

        try {
            data = window.sessionStorage.getItem("custom_data") || "";
            saved = JSON.parse(window.sessionStorage.getItem("custom_data_params") || "null");
        } catch (error) {
            return null;
        }

        if (Array.isArray(saved) && saved.length === 2 && saved[0] && saved[1] && saved[0] + "_" + saved[1] === data) {
            return { tk: saved[0], adid: saved[1] };
        }

        parts = data.split("_");
        if (parts.length === 2 && parts[0] && parts[1]) {
            return { tk: parts[0], adid: parts[1] };
        }

        return null;
    }

    function bindClearButton() {
        var button = document.getElementById("clear-stored");

        if (!button) {
            return;
        }

        button.addEventListener("click", function() {
            try {
                window.sessionStorage.removeItem("custom_data");
                window.sessionStorage.removeItem("custom_data_params");
            } catch (error) {
                return;
            }

            var url = new URL(window.location.href);
            url.searchParams.delete("tk");
            url.searchParams.delete("adid");
            window.location.replace(url.pathname + url.search + url.hash);
        });
    }

    function showDestination(url) {
        var destinationEl = document.getElementById("relay-dest");

        if (destinationEl) {
            destinationEl.textContent = url || "";
        }
    }

    function setStatus(text) {
        var statusEl = document.getElementById("relay-status");

        if (statusEl && text) {
            statusEl.textContent = text;
        }
    }

    function watchContainers() {
        var manager = window.google_tag_manager || {};
        var found = containers.filter(function(id) {
            return !!manager[id];
        });

        if (found.length) {
            setStep("gtm", "ok", found.join(" "));
            return;
        }

        if (Date.now() - startedAt > timeoutMs) {
            setStep("gtm", "ng", "読み込めない");
            return;
        }

        window.setTimeout(watchContainers, 200);
    }
})();
