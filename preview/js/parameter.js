(function() {
    "use strict";

    var parameterNames = ["tk", "adid", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
    var searchParams = new URLSearchParams(window.location.search);
    restoreParameters(searchParams);
    var customData = resolveCustomData(searchParams);

    if (customData) {
        saveCustomData(customData);
    }

    updateLinks(searchParams);
    showHeldParams(searchParams);

    function restoreParameters(params) {
        if (params.get("tk") || params.get("adid")) {
            return;
        }

        var storedData = loadCustomData();
        var values;

        if (!storedData) {
            return;
        }

        try {
            values = JSON.parse(window.sessionStorage.getItem("custom_data_params") || "null");
        } catch (error) {
            values = null;
        }

        if (!Array.isArray(values) || values.length !== 2 ||
            typeof values[0] !== "string" || typeof values[1] !== "string" ||
            !values[0] || !values[1] || values[0] + "_" + values[1] !== storedData) {
            values = storedData.split("_");
        }

        if (values.length === 2 && values[0] && values[1]) {
            params.set("tk", values[0]);
            params.set("adid", values[1]);
        }
    }

    function resolveCustomData(params) {
        var tk = params.get("tk");
        var adid = params.get("adid");

        if (tk && adid) {
            try {
                window.sessionStorage.setItem("custom_data_params", JSON.stringify([tk, adid]));
            } catch (error) {
                return tk + "_" + adid;
            }
            return tk + "_" + adid;
        }

        return loadCustomData();
    }

    function saveCustomData(value) {
        try {
            window.sessionStorage.setItem("custom_data", value);
        } catch (error) {
            return;
        }
    }

    function loadCustomData() {
        try {
            return window.sessionStorage.getItem("custom_data") || "";
        } catch (error) {
            return "";
        }
    }

    function updateLinks(params) {
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

                var value = params.get(name);

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

    function showHeldParams(params) {
        var list = document.getElementById("held-params");
        var names = ["tk", "adid", "utm_source", "utm_medium", "utm_campaign", "utm_content"];

        if (!list) {
            return;
        }

        names.forEach(function(name) {
            var row = document.createElement("div");
            var term = document.createElement("dt");
            var value = document.createElement("dd");

            term.textContent = name;
            value.textContent = params.get(name) || "（なし）";
            row.appendChild(term);
            row.appendChild(value);
            list.appendChild(row);
        });
    }
})();
