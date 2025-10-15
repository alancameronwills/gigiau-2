/**
 * Abstraction layer for table storage
 * Supports Azure Table Storage and AWS DynamoDB
 * Similar pattern to filestorer.js
 */

const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

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
 * @returns {AzureTableStorer|DynamoTableStorer}
 */
function TableStorer(tableName) {
    if (isLambda) {
        return new DynamoTableStorer(tableName);
    } else {
        return new AzureTableStorer(tableName);
    }
}

module.exports = { TableStorer, AzureTableStorer, DynamoTableStorer };
