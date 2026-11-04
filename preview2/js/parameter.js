/* 確認用ページとリダイレクトページのスクリプト。
   デバッグ表示は下の DEBUG ブロック。外すときは次を消す。
   1. index.html / relay.html の DEBUG ブロック
   2. css/debug.css の読み込み
   3. このファイルの DEBUG ブロック
   4. debugEmit の呼び出しと debugHolds の分岐 */
(function() {
    "use strict";

    var params = new URLSearchParams(window.location.search);
    var parameterNames = ["tk", "adid", "utm_source", "utm_medium", "utm_campaign", "utm_content"];

    if (isRelayPage()) {
        prepareRelay();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    function isRelayPage() {
        return /\/relay\.html$/i.test(window.location.pathname);
    }

    function prepareRelay() {
        var tk = params.get("tk");
        var adid = params.get("adid");

        window.dataLayer = window.dataLayer || [];
        window.dipinkRelay = window.dipinkRelay || {
            done: false,
            complete: function() {
                if (window.dipinkRelay.done) {
                    return;
                }
                window.dipinkRelay.done = true;
                window.setTimeout(function() {
                    if (typeof window.dipinkRelay.redirect === "function") {
                        window.dipinkRelay.redirect();
                        return;
                    }
                    window.dipinkRelay.pendingRedirect = true;
                }, 300);
            }
        };

        if (!tk || !adid) {
            return;
        }

        window.dataLayer.push({
            event: "dipink_relay",
            custom_data: tk + "_" + adid
        });
    }

    function start() {
        installDebug();

        if (document.body.classList.contains("relay-body")) {
            startRelay();
            return;
        }

        updateLinks(params);
    }

    function updateLinks(current) {
        var links = document.querySelectorAll("a.js-keep-params");

        Array.prototype.forEach.call(links, function(link) {
            var href = link.getAttribute("href");

            if (!href || href.charAt(0) === "#" || /^(?:javascript|mailto|tel):/i.test(href)) {
                return;
            }

            var url = new URL(href, window.location.href);
            var dropNames = (link.getAttribute("data-drop-params") || "").split(/[\s,]+/);

            parameterNames.forEach(function(name) {
                if (dropNames.indexOf(name) !== -1) {
                    url.searchParams.delete(name);
                    return;
                }

                var value = current.get(name);

                if (value) {
                    url.searchParams.set(name, value);
                }
            });

            if (link.classList.contains("js-afro")) {
                link.setAttribute("href", buildAfroUrl(url));
                return;
            }

            if (/^https?:\/\//i.test(href) || href.indexOf("//") === 0) {
                link.setAttribute("href", url.toString());
                return;
            }

            link.setAttribute("href", url.pathname + url.search + url.hash);
        });
    }

    function buildAfroUrl(destination) {
        var afro = new URL("https://www.cross-a.net/x.php");

        afro.searchParams.set("id", "5181_21208_48341_61522");
        afro.searchParams.set("url", destination.toString());
        return afro.toString();
    }

    function startRelay() {
        var CONFIG = {
            timeoutMs: 1000,
            graceMs: 300,
            destinations: {
                line: "https://miniapp.line.me/2009418018-P1HREl3z"
            },
            defaultDest: "line",
            passParams: ["tk", "adid"],
            utmParams: ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
        };
        var startedAt = Date.now();
        var finished = false;
        var ids = resolveIds();
        var destination = buildDestination(ids);
        var event = pushedEvent();

        debugEmit("url", destination);
        debugEmit("id", {
            state: ids ? "ok" : "ng",
            note: ids ? ids.tk + " / " + ids.adid : "tk/adid なし",
            ids: ids
        });
        debugEmit("data", event ? { state: "ok", note: event.custom_data } : { state: "ng", note: ids ? "dataLayer に無い" : "送らない" });
        debugEmit("notice", { state: "run", note: "complete() を待機" });
        watchGl();

        window.dipinkRelay = window.dipinkRelay || {};
        window.dipinkRelay.redirect = function() {
            debugEmit("notice", { state: "ok", note: "0.3秒待機のあと遷移" });
            finish("GTMのcomplete()");
        };

        if (window.dipinkRelay.pendingRedirect) {
            window.dipinkRelay.redirect();
            return;
        }

        window.setTimeout(function() {
            if (window.dipinkRelay.done) {
                return;
            }
            finish("タイムアウト(" + CONFIG.timeoutMs + "ms)");
        }, CONFIG.timeoutMs);

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

        function resolveIds() {
            var tk = params.get("tk");
            var adid = params.get("adid");
            var relayEvent = pushedEvent();
            var parts;

            if (tk && adid) {
                return { tk: tk, adid: adid };
            }

            if (relayEvent) {
                parts = String(relayEvent.custom_data).split("_");
                if (parts.length === 2 && parts[0] && parts[1]) {
                    return { tk: parts[0], adid: parts[1] };
                }
            }

            return null;
        }

        function buildDestination(currentIds) {
            var key = params.get("dest");
            var base = CONFIG.destinations[key] || CONFIG.destinations[CONFIG.defaultDest];
            var url = new URL(base);

            if (currentIds) {
                CONFIG.passParams.forEach(function(name) {
                    if (currentIds[name]) {
                        url.searchParams.set(name, currentIds[name]);
                    }
                });
            }

            CONFIG.utmParams.forEach(function(name) {
                var value = params.get(name);
                if (value) {
                    url.searchParams.set(name, value);
                }
            });

            var gl = readGl();
            if (gl) {
                url.searchParams.set("_gl", gl);
            }

            return url.toString();
        }

        function readGl() {
            var bridge = window.google_tag_data && window.google_tag_data.glBridge;
            var parts = document.cookie ? document.cookie.split("; ") : [];
            var cookies = {};
            var i;
            var eq;
            var name;

            if (!bridge || typeof bridge.generate !== "function") {
                return "";
            }

            for (i = 0; i < parts.length; i++) {
                eq = parts[i].indexOf("=");
                if (eq < 1) {
                    continue;
                }
                name = parts[i].substring(0, eq);
                if (name !== "_ga" && name.indexOf("_ga_") !== 0 && name !== "_gid" && name !== "_gcl_au") {
                    continue;
                }
                cookies[name] = decodeURIComponent(parts[i].substring(eq + 1));
            }

            if (!cookies._ga) {
                return "";
            }

            try {
                return String(bridge.generate(cookies) || "");
            } catch (error) {
                return "";
            }
        }

        function refreshDestination() {
            destination = buildDestination(ids);
            debugEmit("url", destination);
        }

        function watchGl() {
            if (readGl()) {
                refreshDestination();
                return;
            }

            if (finished || Date.now() - startedAt > CONFIG.timeoutMs + CONFIG.graceMs) {
                return;
            }

            window.setTimeout(watchGl, 200);
        }

        function finish(reason) {
            if (finished) {
                return;
            }
            finished = true;

            if (reason.indexOf("タイムアウト") !== -1) {
                debugEmit("notice", { state: "ng", note: "呼び出しなし" });
            }

            window.setTimeout(function() {
                refreshDestination();
                if (debugHolds()) {
                    debugEmit("status", "noredirect=1 のため遷移を停止中");
                    debugEmit("leave", { state: "ok", note: "noredirect=1 のため停止" });
                    return;
                }
                debugEmit("leave", { state: "ok", note: "遷移します" });
                window.location.replace(destination);
            }, 0);
        }
    }

    function debugEmit(type, detail) {
        var debug = window.dipinkDebug;
        if (debug && typeof debug.on === "function") {
            debug.on(type, detail);
        }
    }

    function debugHolds() {
        return !!(window.dipinkDebug && window.dipinkDebug.hold);
    }

    /* DEBUG START
       外すときはこの関数と、その呼び出し installDebug()、
       debugEmit の呼び出し、debugHolds の分岐を消す。 */
    function installDebug() {
        var utmNames = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
        var stepDefs = [
            { id: "id", label: "tk / adid を確定" },
            { id: "data", label: "dataLayer へ custom_data を送る" },
            { id: "notice", label: "GTM の complete()" },
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
            return;
        }

        showHeldParams(indexValues());

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
            var values = {
                tk: params.get("tk") || "",
                adid: params.get("adid") || ""
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
    }
    /* DEBUG END */
})();
