const { TableClient, odata } = require("@azure/data-tables");

module.exports = async function (context, myTimer) {    
    const countersClient = TableClient.fromConnectionString(process.env.AzureWebJobsStorage, "gigiaucounters");

    const daysClient = TableClient.fromConnectionString(process.env.AzureWebJobsStorage, "gigiaucounterdays");

    let counters = [];
    for await (const row of countersClient.listEntities()) {
      counters.push(row);
    }
    const now = Date.now();
    let daysRow = {partitionKey: 'days', rowKey:''+now};
    for (const row of counters) {
        const delta24 = row.count - (row.prev24||0);
        const interval = row.prev24date ? now - row.prev24date : 0;
        row.delta24 = delta24;
        row.prev24 = row.count;
        row.prev24date = now;
        //context.log(JSON.stringify(row));
        await countersClient.upsertEntity(row);
        if (interval > 79200000) { //22h
            daysRow[`${row.partitionKey}_${row.rowKey}`] = delta24;
        } else {
            daysRow[`${row.partitionKey}_${row.rowKey}`] = -1;
        }
    }
    //context.log(JSON.stringify(daysRow));
    await daysClient.createEntity(daysRow);
};