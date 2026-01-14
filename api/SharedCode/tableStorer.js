/**
 * Abstraction layer for table storage
 * Supports Azure Table Storage and AWS DynamoDB
 * Similar pattern to filestorer.js
 */

const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const fs = require('fs');
const path = require('path');

/**
 * File-based Table Storage implementation (for local development)
 */
class FileTableStorer {
    constructor(tableName) {
        this.tableName = tableName;
        this.dataDir = path.join(process.cwd(), 'data', 'tables', tableName);

        // Create directory if it doesn't exist
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    _getFilePath(partitionKey, rowKey) {
        // Create safe filename from partition and row keys
        const safePartition = partitionKey.replace(/[^a-zA-Z0-9]/g, '_');
        const safeRow = rowKey.replace(/[^a-zA-Z0-9]/g, '_');
        return path.join(this.dataDir, `${safePartition}_${safeRow}.json`);
    }

    async getEntity(partitionKey, rowKey) {
        try {
            const filePath = this._getFilePath(partitionKey, rowKey);
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async upsertEntity(entity) {
        const filePath = this._getFilePath(entity.partitionKey, entity.rowKey);
        fs.writeFileSync(filePath, JSON.stringify(entity, null, 2), 'utf8');
        return entity;
    }

    async createEntity(entity) {
        return await this.upsertEntity(entity);
    }

    async *listEntities(options = {}) {
        const files = fs.readdirSync(this.dataDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const data = fs.readFileSync(path.join(this.dataDir, file), 'utf8');
                    yield JSON.parse(data);
                } catch (e) {
                    console.error('[FileTableStorer] Error reading file:', file, e);
                }
            }
        }
    }

    async deleteEntity(partitionKey, rowKey) {
        const filePath = this._getFilePath(partitionKey, rowKey);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return true;
    }
}

/**
 * Azure Table Storage implementation
 */
class AzureTableStorer {
    constructor(tableName) {
        const { TableClient } = require("@azure/data-tables");
        this.tableClient = TableClient.fromConnectionString(
            process.env.AzureWebJobsStorage,
            tableName
        );
    }

    async getEntity(partitionKey, rowKey) {
        try {
            return await this.tableClient.getEntity(partitionKey, rowKey);
        } catch {
            return null;
        }
    }

    async upsertEntity(entity) {
        return await this.tableClient.upsertEntity(entity);
    }

    async createEntity(entity) {
        return await this.tableClient.createEntity(entity);
    }

    async *listEntities(options = {}) {
        for await (const entity of this.tableClient.listEntities(options)) {
            yield entity;
        }
    }

    async deleteEntity(partitionKey, rowKey) {
        return await this.tableClient.deleteEntity(partitionKey, rowKey);
    }
}

/**
 * AWS DynamoDB implementation
 */
class DynamoTableStorer {
    constructor(tableName) {
        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
        const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

        const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-2' });
        this.docClient = DynamoDBDocumentClient.from(client);
        this.tableName = tableName;
        this.GetCommand = GetCommand;
        this.PutCommand = PutCommand;
        this.ScanCommand = ScanCommand;
        this.DeleteCommand = DeleteCommand;
    }

    async getEntity(partitionKey, rowKey) {
        try {
            const result = await this.docClient.send(new this.GetCommand({
                TableName: this.tableName,
                Key: { partitionKey, rowKey }
            }));
            return result.Item || null;
        } catch {
            return null;
        }
    }

    async upsertEntity(entity) {
        // Ensure partitionKey and rowKey are present
        if (!entity.partitionKey || !entity.rowKey) {
            throw new Error('Entity must have partitionKey and rowKey');
        }

        return await this.docClient.send(new this.PutCommand({
            TableName: this.tableName,
            Item: entity
        }));
    }

    async createEntity(entity) {
        // DynamoDB doesn't distinguish between create and upsert
        return await this.upsertEntity(entity);
    }

    async *listEntities(options = {}) {
        let lastEvaluatedKey = undefined;

        do {
            const params = {
                TableName: this.tableName
            };

            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }

            const result = await this.docClient.send(new this.ScanCommand(params));

            for (const item of result.Items || []) {
                yield item;
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
    }

    async deleteEntity(partitionKey, rowKey) {
        return await this.docClient.send(new this.DeleteCommand({
            TableName: this.tableName,
            Key: { partitionKey, rowKey }
        }));
    }
}

/**
 * Factory function to create appropriate table storer
 * @param {string} tableName - Name of the table
 * @returns {FileTableStorer|AzureTableStorer|DynamoTableStorer}
 */
function TableStorer(tableName) {
    // AWS Lambda - use DynamoDB
    if (isLambda) {
        return new DynamoTableStorer(tableName);
    }

    // Azure - use Azure Table Storage (if SDK available)
    if (process.env.AzureWebJobsStorage) {
        try {
            return new AzureTableStorer(tableName);
        } catch (e) {
            console.log('[TableStorer] Azure SDK not available, falling back to file storage');
        }
    }

    // Local development - use file-based storage
    return new FileTableStorer(tableName);
}

module.exports = { TableStorer, FileTableStorer, AzureTableStorer, DynamoTableStorer };
