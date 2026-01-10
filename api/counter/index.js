const { TableStorer } = require("../SharedCode/tableStorer");
const { validateCounterName } = require("../SharedCode/security");

function listMethods(obj) {
  let methods = [];
  let currentObj = obj;

  do {
    methods = methods.concat(
      Object.getOwnPropertyNames(currentObj).filter((prop) =>
        typeof obj[prop] === 'function'
      )
    );
    currentObj = Object.getPrototypeOf(currentObj);
  } while (currentObj);

  return [...new Set(methods)]; // Remove duplicates
}

async function azureFunction(context, req) {
    let series = "";
    let counter = "";
    let parameters = Object.keys(req.query);
    if (parameters.length>0) {
        series = parameters[0];
        counter = req.query[series];
        //  ...?z=pole increments counter 'pole' in series z

        // Security: Validate counter and series names
        try {
            if (series) series = validateCounterName(series);
            if (counter) counter = validateCounterName(counter);
        } catch (e) {
            context.res = {
                status: 400,
                body: { error: e.message }
            };
            return;
        }
    }
    try {
        if (series == "history") {
            await history(context, series, counter);
        } else {
            await currentCounter (context, series, counter);
        }
    } catch (e) {
        context.res = {
            body: e.toString()
        };
    }
}

async function currentCounter (context, series, counter) {
    let nowISO = new Date().toISOString().substring(0,19);
    const tableClient = TableStorer("gigiaucounters");
    // https://learn.microsoft.com/en-us/javascript/api/overview/azure/tables?view=azure-node-latest
        
    if (series && counter) {                                                                                                                                                                                                                                                                          
        let counterRow = await (async () => {try { return await tableClient.getEntity(series,counter); } catch {return null;}})() ;
        if (null == counterRow) {
            counterRow = {partitionKey: series, rowKey: counter, count: 0};
        }
        let total = (counterRow.count || 0) + 1;
        counterRow.count = total;
        counterRow.modified = nowISO;
        await tableClient.upsertEntity(counterRow);
        
        context.res = {
            body: {series, counter, count: total},
            headers: {
                'Content-Type': "application/json",
                'Access-Control-Allow-Origin': '*'
            }
        };
    } else {
        let totalDelta24 = {};
      let counters = [];
      for await (const row of tableClient.listEntities()) {
        counters.push({series:row.partitionKey,counter:row.rowKey,count:row.count,change24h:row.delta24,last:row.modified||''});
        if (undefined === totalDelta24[row.partitionKey]) {totalDelta24[row.partitionKey] = 0;}
        totalDelta24[row.partitionKey] += row.delta24;
      }
      context.res = {
          body: {counters: counters, totalChange24h: totalDelta24},
          headers: {
              'Content-Type': "application/json",
              'Access-Control-Allow-Origin': '*'
          }
      };
    }
}

async function history(context, series, counter) {
    const tableClient = TableStorer("gigiaucounterdays");
    // https://learn.microsoft.com/en-us/javascript/api/overview/azure/tables?view=azure-node-latest
    let rows = [];
    for await (const row of tableClient.listEntities()) {
        rows.push(row);
    }
      context.res = {
          body: {history: rows},
          headers: {
              'Content-Type': "application/json",
              'Access-Control-Allow-Origin': '*'
          }
      };
}

// Export both Azure and Lambda versions
module.exports = azureFunction;

// Lambda handler
const { wrapAzureFunctionForLambda } = require("../SharedCode/lambdaWrapper");
module.exports.handler = wrapAzureFunctionForLambda(azureFunction);