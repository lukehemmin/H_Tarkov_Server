"use strict";

require("../Lib.js");

class BundleCallbacks
{
    static sendBundle(sessionID, req, resp, body)
    {
        Logger.info(`[BUNDLE]: ${req.url}`);

        const key = req.url.split("/bundle/")[1];
        const bundle = BundleLoader.getBundle(key, true);

        // send bundle
        HttpServer.sendFile(resp, bundle.path);
    }

    static getBundles(url, info, sessionID)
    {
        const local = (HttpConfig.ip === "219.240.53.246" || HttpConfig.ip === "219.240.53.246");
        return HttpResponse.noBody(BundleLoader.getBundles(local));
    }

    static getBundle(url, info, sessionID)
    {
        return "BUNDLE";
    }
}

module.exports = BundleCallbacks;
