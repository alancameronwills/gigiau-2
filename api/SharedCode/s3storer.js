const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fsp = require('fs/promises');

class S3Storer {
    #folder;
    #bucketName;
    #s3Client;

    constructor(folder) {
        this.#folder = folder.endsWith('/') ? folder : folder + '/';
        this.#bucketName = process.env.S3_BUCKET_NAME || 'gigsmash-events';
        this.#s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-2' });
    }

    async get(name) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.#bucketName,
                Key: this.#folder + name
            });
            const response = await this.#s3Client.send(command);
            return await response.Body.transformToString();
        } catch (e) {
            return "";
        }
    }

    async put(name, type, buffer) {
        let upBuffer = buffer;
        if (typeof buffer === 'string') {
            upBuffer = Buffer.from(buffer, 'utf8');
        }
        const command = new PutObjectCommand({
            Bucket: this.#bucketName,
            Key: this.#folder + name,
            Body: upBuffer,
            ContentType: type || 'application/octet-stream'
        });
        return await this.#s3Client.send(command);
    }

    /**
     * Whether a file exists
     * @param {*} name possibly without a .suffix
     * @returns name of the file that was found (including a missing suffix) or false
     */
    async has(name, getstat = false) {
        // First try exact match
        if (name.indexOf('.') > 0) {
            try {
                const command = new HeadObjectCommand({
                    Bucket: this.#bucketName,
                    Key: this.#folder + name
                });
                const response = await this.#s3Client.send(command);
                if (!getstat) return { name };
                return {
                    name,
                    length: response.ContentLength,
                    date: response.LastModified
                };
            } catch (e) {
                if (e.name === 'NotFound' || e.name === 'NoSuchKey') {
                    return false;
                }
                throw e;
            }
        }

        // No suffix provided, search for it
        try {
            const listCommand = new ListObjectsV2Command({
                Bucket: this.#bucketName,
                Prefix: this.#folder + name
            });
            const response = await this.#s3Client.send(listCommand);

            if (response.Contents && response.Contents.length > 0) {
                const foundKey = response.Contents[0].Key;
                const foundName = foundKey.substring(this.#folder.length);
                if (!getstat) return { name: foundName };
                return {
                    name: foundName,
                    length: response.Contents[0].Size,
                    date: response.Contents[0].LastModified
                };
            }
        } catch (e) {
            // Ignore errors
        }
        return false;
    }

    async delete(name) {
        if (!await this.has(name)) return;
        const command = new DeleteObjectCommand({
            Bucket: this.#bucketName,
            Key: this.#folder + name
        });
        await this.#s3Client.send(command);
    }

    async purge() {
        const listCommand = new ListObjectsV2Command({
            Bucket: this.#bucketName,
            Prefix: this.#folder
        });
        const response = await this.#s3Client.send(listCommand);

        if (response.Contents) {
            for (const obj of response.Contents) {
                const fileName = obj.Key.substring(this.#folder.length);
                // Don't delete dotfiles
                if (fileName.indexOf('.') != 0) {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: this.#bucketName,
                        Key: obj.Key
                    });
                    await this.#s3Client.send(deleteCommand);
                }
            }
        }
        return this.#folder;
    }

    t() {
        return `S3Storer ${this.#folder} ${this.#bucketName}`;
    }
}

module.exports = { S3Storer };
