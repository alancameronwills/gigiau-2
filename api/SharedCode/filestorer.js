const fs = require('fs');
const fsp = require('fs/promises');
const util = require('util');


let as;
try {
    as = require("@azure/storage-blob");
} catch (e) {}

class FileStorer {
    #folder;

    constructor(cache) {
        this.#folder = cache.substring(cache.length-1)== '/' ? cache : cache + '/';
        //console.log("FileStorer ", this.#folder);
    }

    async get(name) {
        try {
            return await fsp.readFile(this.#folder + name, "utf-8")
        } catch (e) {
            return "";
        }
    }
    async put(name, type, buffer) {
        //console.log("put " + name);
        await fsp.mkdir(this.#folder, { recursive: true });
        let opts = { flush: true };
        if (typeof buffer === 'string') opts.encoding = 'utf-8';
        //console.log("write ", this.#folder + name, opts);
        return await fsp.writeFile(this.#folder + name, buffer, opts);
    }

    /**
     * Whether a file exists
     * @param {*} name possibly without a .suffix
     * @returns name of the file that was found (including a missing suffix) or false
     */
    async has(name, getstat=false) {
        let foundName = "";
        if (fs.existsSync(this.#folder + name)) {
            //console.log("has " + this.#folder + name);
            foundName = name;
        } 
        if (!foundName && name.indexOf('.')<=0) {
            // Not supplied with a suffix, so search for it
            foundName = fs.readdirSync(this.#folder).find(f=>f.substring(0,name.length)==name);
        }
        if (!foundName) return false;
        if (!getstat) return {name: foundName};
        const stats = await fsp.stat(this.#folder + name);
        return {
            name : foundName,
            length : stats.size,
            date: stats.mtimeMs
        }
    }

    async delete(name) {
        if (!await this.has(name)) return;
        fs.unlinkSync(this.#folder + name)
    }

    
    async purge() {
        let filenames = fs.readdirSync(this.#folder);
        filenames.forEach(fn => {if(fn.indexOf(".")!=1) {fs.unlinkSync(this.#folder + fn)}});
        return this.#folder;
    }
    t () {
        return "FileStorer";
    }
}

class BlobStorer {
    static #containerName = "gigsmash";
    static #connectionString = process.env.PicStorage;
    #folder;
    #blobContainerClient;

    constructor(cache) {
        this.#folder = cache[cache.length - 1] == '/' ? cache : cache + '/';
        this.#blobContainerClient = as.BlobServiceClient.fromConnectionString(BlobStorer.#connectionString)
            .getContainerClient(BlobStorer.#containerName);
    }
    async get (name) {
        const blobClient = this.#blobContainerClient.getBlockBlobClient(this.#folder + name);
        const buffer = await blobClient.downloadToBuffer();
        return String.fromCharCode.apply(null, new Uint16Array(buffer));
    }
    async put (name, fileType, buffer) {
        let upBuffer = buffer;
        if (typeof buffer == "string") {
            upBuffer = Buffer.from(buffer, 'utf8');
        }
        const blobClient = this.#blobContainerClient.getBlockBlobClient(this.#folder + name);
        return await blobClient.uploadData(upBuffer, {blobHTTPHeaders:{blobContentType:fileType}});
    }
    async has (name, getstats = false) {
        // The name provided may be missing the file extension suffix
        if (!getstats && name.indexOf('.')>0) {
            const blobClient = this.#blobContainerClient.getBlockBlobClient(this.#folder + name);
            return (await blobClient.exists()) && {name};
        } else {
            // TODO: Keep an index
            for await (const item of this.#blobContainerClient.listBlobsFlat()) {
                // item.name, item.deleted, item.properties.contentLength, item.properties.etag, 
                // item.properties.contentType, item.properties.createdOn : DateTime
                // return util.inspect(item);
  
                if (item.name.indexOf(name)>=0 && !item.deleted) {
                    let tailName = item.name.substring(item.name.indexOf(name));
                    return {
                        name:tailName,
                        length:item.properties.contentLength,
                        type:item.properties.contentType,
                        date:item.properties.lastModified
                    };
                }
            }
        }        
        return false;
    }

    async delete(name) {
        if (!await this.has(name)) return;
        await this.#blobContainerClient.deleteBlob(this.#folder + name);
    }
    
    async purge() {
        const dotPosition = this.#folder.length;
        for await (const item of this.#blobContainerClient.listBlobsFlat()) {
            if (item.name.indexOf(this.#folder)==0 && item.name.substring(dotPosition,1) != '.') {
                await this.#blobContainerClient.deleteBlob(item.name);
            }
        }
        return this.#folder;    
    }
    
    
    t() {
        return `BlobStorer  ${this.#folder} ${BlobStorer.#connectionString}` ;
    }
}


module.exports = {
    FileStorer: (cacheLoc = "client/pix/") => {
        // Check if running in AWS Lambda
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
            const { S3Storer } = require('./s3storer.js');
            return new S3Storer(cacheLoc);
        }
        // Check if Azure Blob Storage is available
        else if (as) {
            return new BlobStorer(cacheLoc);
        }
        // Default to local file storage
        else {
            return new FileStorer(cacheLoc);
        }
    }
}
