const { Cache } = require("../SharedCode/cachepic.js");
const { FileStorer } = require("../SharedCode/filestorer.js");

/**
 * Get a picture from a given URL
 * Compress and cache it
 * @param {*} context .res.status = result of getting source, .res.body.cache = cache ID
 * @param {*} req query.src - the requested source URL or cache ID
 */

const azureHandler = async function (context, req) {
    context.log(`Gigpic req for ${req.query.src}`);
    const cache = Cache(FileStorer());
    try {
        let { pic, name } = await cache.getCache(req.query.src);
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: pic
        };
    } catch (e) {
        console.log(e);
        context.res = {
            status: 400,
            body: "not found"
        }
    }
}

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;

// AWS Lambda handler (always export for serverless-offline compatibility)
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper.js');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);
