/* デバッグ表示は js/debug.js。
   外すときは debugEmit の呼び出しと debugHolds の分岐、その2関数を消す。
   HTML の DEBUG ブロック、css/debug.css、js/debug.js も同時に外す。 */
(function() {
    "use strict";

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

    var params = new URLSearchParams(window.location.search);
    var startedAt = Date.now();
    var finished = false;

    function debugEmit(type, detail) {
        var debug = window.dipinkDebug;
        if (debug && typeof debug.on === "function") {
            debug.on(type, detail);
        }
    }

    function debugHolds() {
        return !!(window.dipinkDebug && window.dipinkDebug.hold);
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
})();
