const {collect} = require("../collect/index.js");

const azureHandler = async function (context, myTimer) {
    try {
        await collect(context);
        console.log("Done timed collect");
    }
    catch (e) {
        context.log(e.stack);
    }
    context.log("Ended timed collect");
};

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;

// AWS Lambda handler for EventBridge scheduled events (always export for serverless-offline)
module.exports.handler = async (event, context) => {
    const azureContext = {
        log: (...args) => console.log(...args)
    };

    // Timer trigger from EventBridge doesn't need query params
    const azureReq = { query: { go: 1 } };

    await azureHandler(azureContext, event);

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Timed collection completed" })
    };
};