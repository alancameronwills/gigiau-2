const {storeThumbnail,containerName} = require("../SharedCode/compresspix.js");

const azureHandler = async function (context, req) {
    const url = req.query.url || "https://moylgrove.wales/wp-content/uploads/2021/10/hall-ext-sq-300x300.jpg";
    const result = await storeThumbnail(url);

    // Build appropriate URL based on storage backend
    let resultUrl;
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        const bucketName = process.env.S3_BUCKET_NAME || 'gigsmash-events';
        const region = process.env.AWS_REGION || 'eu-west-2';
        resultUrl = `https://${bucketName}.s3.${region}.amazonaws.com/client/pix/${result.name}`;
    } else {
        resultUrl = `https://pantywylan.blob.core.windows.net/${containerName}/${result.name}`;
    }

    context.res = {
        status: result.error ? 400 : 200,
        body: result.error ? "Failed " + result.error : `OK ${result.name} ${resultUrl}`
    };
}

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;

// AWS Lambda handler (always export for serverless-offline compatibility)
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper.js');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);
