/**
 * Returns the public URL for the data storage where collect() puts pictures and JSON
 */
const azureHandler = async function (context, req) {
    let baseUrl;

    // Check if running in AWS Lambda
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        const bucketName = process.env.S3_BUCKET_NAME || 'gigsmash-events';
        const region = process.env.AWS_REGION || 'eu-west-2';
        baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com`;
    }
    // Check if running in Azure
    else if (process.env.PicStorage) {
        // Azure Blob Storage URL format
        const connectionString = process.env.PicStorage;
        const accountMatch = connectionString.match(/AccountName=([^;]+)/);
        if (accountMatch) {
            const accountName = accountMatch[1];
            baseUrl = `https://${accountName}.blob.core.windows.net/gigsmash`;
        } else {
            baseUrl = "Azure storage URL not configured";
        }
    }
    // Local development
    else {
        baseUrl = `http://localhost:${process.env.PORT || 7071}`;
    }

    const response = {
        baseUrl,
        pixUrl: `${baseUrl}/client/pix`,
        jsonUrl: `${baseUrl}/client/json`,
        eventsJsonUrl: `${baseUrl}/client/json/events.json`,
        platform: process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws' : (process.env.PicStorage ? 'azure' : 'local')
    };

    context.res = {
        body: JSON.stringify(response, null, 2),
        headers: { "Content-Type": "application/json" },
        status: 200
    };

    return response;
};

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;

// AWS Lambda handler (always export for serverless-offline compatibility)
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper.js');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);
