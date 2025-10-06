const fs = require('fs/promises');

const azureHandler = async function (context, req) {
    const saveFile = "data/miscevents.json";
    let status = 200;
    let responseMessage = "";
    try {
        await fs.mkdir("data", {recursive:true});
        if (req.method=="GET") {
            responseMessage += await fs.readFile(saveFile);
        } else {
            if (req.body) {
                await fs.writeFile(saveFile, req.rawBody, {flush:true});
            }
        }
    } catch (e) {
        responseMessage += "Caught: " + e.toString();
        status = 400;
    }

    context.res = {
        status: status,
        body: responseMessage
    };
}

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;

// AWS Lambda handler (always export for serverless-offline compatibility)
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper.js');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);