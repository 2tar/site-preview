(function() {
    "use strict";

    // テスト用の AFRo（0秒リダイレクト）。
    // tk/adid が無ければ発行し、中間ページへ付けて渡す。
    // 実AFRoの商品URLが決まったら、LPのリンク先をそちらへ差し替える。
    var nextPage = "relay.html";
    var passParams = ["dest", "debug", "noredirect", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
    var params = new URLSearchParams(window.location.search);
    var tk = params.get("tk");
    var adid = params.get("adid");

    if (!tk) {
        tk = issue("tk");
    }
    if (!adid) {
        adid = issue("ad");
    }

    var next = new URL(nextPage, window.location.href);
    next.searchParams.set("tk", tk);
    next.searchParams.set("adid", adid);

    passParams.forEach(function(name) {
        var value = params.get(name);
        if (value) {
            next.searchParams.set(name, value);
        }
    });

    if (!next.searchParams.get("dest")) {
        next.searchParams.set("dest", "line");
    }

    window.location.replace(next.pathname + next.search + next.hash);

    function issue(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
})();
