const sharp = require("sharp");
const { validateImageUrl } = require('./security.js');
const containerName = "gigsmash";

let as;
try {
    as = require("@azure/storage-blob");
} catch (e) {}

let s3;
try {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    s3 = { S3Client, PutObjectCommand };
} catch (e) {}

async function fetchfile(url, sendHeaders = false) {
    let headers = !sendHeaders ? null : {headers:{
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
    }};
    return await fetch(url, headers);
}


function hashUrl(url) {
    return (url||"").replace(/https?:\/\//, "").replace(/\/wp-content\/uploads/, "").replace(/\//, "¬").replace(/\//g,"_").replace("¬", "/");
}

module.exports = {
storeThumbnail : async function (url, name, size=300) {
    let errorResult = "";
    let result = {};
    try {
        // Security: Validate URL to prevent SSRF attacks
        url = validateImageUrl(url);

        // Security: Limits to prevent DoS attacks
        const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB
        const MAX_DIMENSION = 10000;  // 10000px

        const blob = await fetchfile(url, true).then(r => r.blob());

        // Check file size
        if (blob.size > MAX_FILE_SIZE) {
            throw new Error('Image file too large (max 10MB)');
        }

        const fileType = blob.type;
        const arrayBuffer = await blob.arrayBuffer();

        // Check image dimensions before processing
        const metadata = await sharp(arrayBuffer).metadata();
        if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
            throw new Error(`Image dimensions too large (max ${MAX_DIMENSION}px)`);
        }

        const resized = await sharp(arrayBuffer).resize({width:size}).toBuffer();
        const blobName = name || hashUrl(url);

        // Use AWS S3 if in Lambda environment
        if (process.env.AWS_LAMBDA_FUNCTION_NAME && s3) {
            const bucketName = process.env.S3_BUCKET_NAME || 'gigsmash-events';
            const region = process.env.AWS_REGION || 'eu-west-2';
            const s3Client = new s3.S3Client({ region });

            const command = new s3.PutObjectCommand({
                Bucket: bucketName,
                Key: `client/pix/${blobName}`,
                Body: resized,
                ContentType: fileType
            });

            result = await s3Client.send(command);
            return {name:blobName, url: url, etag: result.ETag, error:"", containerName:bucketName};
        }
        // Use Azure Blob Storage
        else if (as) {
            const connectionString = process.env.PicStorage;
            const blobClient = new as.BlockBlobClient(connectionString, containerName, blobName);
            result = await blobClient.uploadData(resized, {blobHTTPHeaders:{blobContentType:fileType}});
            return {name:blobName, url: url, etag: result.etag, error:"", containerName:containerName};
        }
        else {
            throw new Error("No storage backend available (neither AWS S3 nor Azure Blob Storage)");
        }
    } catch (e) {
        return {name:"", url: url, etag: "", error: "" + e, containerName:containerName};
    }
},
containerName: containerName
}

