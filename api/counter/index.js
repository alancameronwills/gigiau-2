const { TableClient, odata } = require("@azure/data-tables");

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



module.exports = async function (context, req) {
    let series = "";
    let counter = "";
    let parameters = Object.keys(req.query);
    if (parameters.length>0) {
        series = parameters[0];
        counter = req.query[series];
        //  ...?z=pole increments counter 'pole' in series z
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
    const tableClient = TableClient.fromConnectionString(process.env.AzureWebJobsStorage, "gigiaucounters");
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
            headers: {'Content-Type':"application/json"}
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
          headers: {'Content-Type':"application/json"}
      };
    }
}

async function history(context, series, counter) {
    const tableClient = TableClient.fromConnectionString(process.env.AzureWebJobsStorage, "gigiaucounterdays");
    // https://learn.microsoft.com/en-us/javascript/api/overview/azure/tables?view=azure-node-latest
    let rows = [];
    for await (const row of tableClient.listEntities()) {
        rows.push(row);
    }
      context.res = {
          body: {history: rows},
          headers: {'Content-Type':"application/json"}
      };
}