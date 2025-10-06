/**
 * Wraps an Azure Functions handler to work with AWS Lambda
 * Converts event/context to Azure-style context/req and vice versa
 */
function wrapAzureFunctionForLambda(azureHandler) {
    return async (event, context) => {
        // Create Azure-style context object
        const azureContext = {
            log: (...args) => console.log(...args),
            res: null
        };

        // Create Azure-style request object
        const azureReq = {
            method: event.httpMethod || event.requestContext?.http?.method || 'GET',
            query: event.queryStringParameters || {},
            body: event.body,
            rawBody: event.body,
            headers: event.headers || {}
        };

        // Parse JSON body if needed
        if (typeof azureReq.body === 'string' && azureReq.body.length > 0) {
            try {
                azureReq.body = JSON.parse(azureReq.body);
            } catch (e) {
                // Not JSON, keep as string
            }
        }

        // Call the Azure function
        const result = await azureHandler(azureContext, azureReq);

        // Convert Azure response to Lambda response
        if (azureContext.res) {
            return {
                statusCode: azureContext.res.status || 200,
                headers: azureContext.res.headers || {},
                body: typeof azureContext.res.body === 'string'
                    ? azureContext.res.body
                    : JSON.stringify(azureContext.res.body)
            };
        }

        // If no context.res was set, return the direct result
        return {
            statusCode: 200,
            body: typeof result === 'string' ? result : JSON.stringify(result)
        };
    };
}

module.exports = { wrapAzureFunctionForLambda };
