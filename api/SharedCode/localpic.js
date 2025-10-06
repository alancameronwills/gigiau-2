const sharp = require("sharp");

async function fetchfile(url, sendHeaders = false) {
    let headers = !sendHeaders ? null : {
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/jpeg,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-GB,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Priority": "u=0,i",
            "Sec-Ch-Ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "Windows",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": 1,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
        }
    };
    return await fetch(url, headers);
}



function hashUrl(url) {
    return (url || "").replace(/https?:\/\//, "").replace(/\/wp-content\/uploads/, "").replace(/\//, "¬").replace(/\//g, "_").replace("¬", "/");
}


module.exports = {
    /**
     * localPic - stores a local compressed copy of a picture
     * @param {*} url Source pic
     * @param {async function (name, fileType, arrayBuffer)} storer Store the compressed picture
     * @param {*} name [opt]
     * @param {*} size [opt] required width default 200px
     * @returns Result of storer
     */
    localPic: async function (url, storer, name, size = 200) {
        let errorResult = "";
        let result = {};
        try {
            const blob = await fetchfile(url, true).then(r => r.blob());
            const fileType = blob.type;
            const arrayBuffer = await blob.arrayBuffer();
            const resized = await sharp(arrayBuffer).resize({ width: size }).toBuffer();
            const storeName = name || hashUrl(url);
            return await storer(storeName, fileType, resized);
        } catch (e) {
            return { name: storeName, error: e.toString() }
        }
    }
}
