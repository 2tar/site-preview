(function() {
    "use strict";

    var CONFIG = {
        containers: ["GTM-M4RDPRQ", "GTM-NDXPKRP", "GTM-5MTD7V", "GTM-T9WR56C"],
        timeoutMs: 3000,
        destinations: {
            line: "https://miniapp.line.me/2009418018-P1HREl3z"
        },
        defaultDest: "line",
        passParams: ["tk", "adid"],
        utmParams: ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
    };

    var params = new URLSearchParams(window.location.search);
    var noRedirect = params.get("noredirect") === "1";
    var startedAt = Date.now();
    var finished = false;
    var statusEl = document.getElementById("relay-status");
    var stepDefs = [
        { id: "id", label: "tk / adid を確定" },
        { id: "data", label: "dataLayer へ custom_data を送る" },
        { id: "gtm", label: "GTM コンテナを読み込む" },
        { id: "notice", label: "GTM からの完了通知" },
        { id: "leave", label: "遷移" }
    ];
    var stepState = {};
    var stepNote = {};

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

    function pushedEvent() {
        var layer = window.dataLayer || [];
        var i;

        for (i = 0; i < layer.length; i++) {
            if (layer[i] && layer[i].event === "dipink_relay" && layer[i].custom_data) {
                return layer[i];
            }
        }

        return null;
    }

    function loadedContainers() {
        var manager = window.google_tag_manager || {};
        return CONFIG.containers.filter(function(id) {
            return !!manager[id];
        });
    }

    function resolveIds() {
        var tk = params.get("tk");
        var adid = params.get("adid");
        var event = pushedEvent();
        var parts;

        if (tk && adid) {
            return { tk: tk, adid: adid };
        }

        if (event) {
            parts = String(event.custom_data).split("_");
            if (parts.length === 2 && parts[0] && parts[1]) {
                return { tk: parts[0], adid: parts[1] };
            }
        }

        return null;
    }

    function buildDestination(ids) {
        var key = params.get("dest");
        var base = CONFIG.destinations[key] || CONFIG.destinations[CONFIG.defaultDest];
        var url = new URL(base);

        if (ids) {
            CONFIG.passParams.forEach(function(name) {
                if (ids[name]) {
                    url.searchParams.set(name, ids[name]);
                }
            });
        }

        CONFIG.utmParams.forEach(function(name) {
            var value = params.get(name);
            if (value) {
                url.searchParams.set(name, value);
            }
        });

        return url.toString();
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

    function showDestination(url) {
        var destinationEl = document.getElementById("relay-dest");
        var holder = document.getElementById("relay-qr");

        if (destinationEl) {
            destinationEl.textContent = url;
        }

        if (!holder || !window.QRCode) {
            return;
        }

        try {
            new window.QRCode(holder, {
                text: url,
                width: 220,
                height: 220,
                correctLevel: window.QRCode.CorrectLevel.M
            });
        } catch (error) {
            holder.textContent = "QRコードを作れませんでした";
        }
    }

    function setStatus(text) {
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    function finish(reason) {
        if (finished) {
            return;
        }
        finished = true;

        if (reason.indexOf("タイムアウト") !== -1 && (stepState.notice === "run" || !stepState.notice)) {
            setStep("notice", "ng", "完了通知なし");
        }

        window.setTimeout(function() {
            if (noRedirect) {
                setStatus("noredirect=1 のため遷移を停止中");
                setStep("leave", "ok", "noredirect=1 のため停止");
                return;
            }
            setStep("leave", "ok", "遷移します");
            window.location.replace(destination);
        }, 0);
    }

    function watchContainers() {
        var found = loadedContainers();

        if (found.length) {
            setStep("gtm", "ok", found.join(" "));
            return;
        }

        if (Date.now() - startedAt > CONFIG.timeoutMs) {
            setStep("gtm", "ng", "読み込めない");
            return;
        }

        window.setTimeout(watchContainers, 200);
    }

    var ids = resolveIds();
    var destination = buildDestination(ids);
    var event = pushedEvent();

    renderSteps();
    showHeldParams(ids);
    showDestination(destination);

    if (!ids) {
        setStep("id", "ng", "tk/adid なし");
        setStep("data", "ng", "送らない");
    } else {
        setStep("id", "ok", ids.tk + " / " + ids.adid);
        setStep("data", event ? "ok" : "ng", event ? event.custom_data : "dataLayer に無い");
    }

    setStep("gtm", "run");
    watchContainers();
    setStep("notice", "run", "タグシーケンスの完了通知を待機");

    window.dipinkRelay = window.dipinkRelay || {};
    window.dipinkRelay.onComplete = function() {
        setStep("notice", "ok");
        finish("GTMから完了通知");
    };

    if (window.dipinkRelay.done) {
        setStep("notice", "ok");
        finish("GTMから完了通知");
        return;
    }

    window.setTimeout(function() {
        finish("タイムアウト(" + CONFIG.timeoutMs + "ms)");
    }, CONFIG.timeoutMs);
})();
