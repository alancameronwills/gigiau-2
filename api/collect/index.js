const util = require('util');
const events = require("../events/index.js");
const { FileStorer } = require("../SharedCode/filestorer.js"); // await cache.getCache(req.query.src);
const { Cache } = require("../SharedCode/cachepic.js"); // await cache.getCache(req.query.src);
const { EventCache } = require("../SharedCode/eventCache.js");
//const fs = require('fs'); // synchronous
const { pid } = require('node:process');

// AWS Lambda SDK for async invocation
let Lambda;
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
    Lambda = new LambdaClient({ region: process.env.AWS_REGION || 'eu-west-2' });
}

const cache = Cache(FileStorer("client/pix"));
const admin = FileStorer("client");
const eventCache = EventCache(FileStorer("client/json"), console);

/**
 * Concatenate and sort the events lists from all sources.
 * Get all the pictures and make local compressed copies in client/pix (if not already got).
 * Store the list in client/json ready to be served.
 */
async function collect(context) {
    // Get the lists from different promoters:
    let handlers = await events(context, { query: {} });
    let handlerNames = Object.keys(handlers);
    let toDo = {};
    handlerNames.forEach(n => toDo[n] = true);
    let eventsLists = {};
    await Promise.all(handlerNames.map(async n => {
        try {
            let r = await events(context, { query: { venue: n } });
            if (r.forEach) {
                // Check if fresh scrape returned events
                if (r.length > 0) {
                    eventsLists[n] = r;
                    eventsLists[n].forEach(s => s.promoter = n);
                    // Cache the successful result
                    await eventCache.set(n, r);
                    delete toDo[n];
                    persistentStatus("Remaining sources: " + Object.keys(toDo).join(" "));
                } else {
                    // Fresh scrape returned empty - try cached version
                    const cached = await eventCache.get(n);
                    if (cached && cached.length > 0) {
                        eventsLists[n] = cached;
                        eventsLists[n].forEach(s => s.promoter = n);
                        delete toDo[n];
                        persistentStatus(`Using cached events for ${n}. Remaining: ` + Object.keys(toDo).join(" "));
                    } else {
                        // No cache available
                        eventsLists[n] = [];
                        fault(`No events from ${n} (fresh or cached)`);
                    }
                }
            } else throw r;
        } catch (e) {
            // On error, try cached version
            const cached = await eventCache.get(n);
            if (cached && cached.length > 0) {
                eventsLists[n] = cached;
                eventsLists[n].forEach(s => s.promoter = n);
                delete toDo[n];
                fault(`Error getting ${n}, using cache: ${e.toString()}`);
            } else {
                fault(`Getting ${n} ${e.toString()}`);
            }
        }
    }));

    // Concatenate and sort them:
    let shows = [];
    handlerNames.forEach(n => shows = shows.concat(eventsLists[n]));

    shows.sort((a, b) => (a.dt || 0) - (b.dt || 0));

    let showsUnduplicated = [];
    let previous = null;
    shows.forEach(show => {
        if (!previous
            || previous.title != show.title
            || previous.venue.substring(0, 6) != show.venue.substring(0, 6)
            || previous.image != show.image
        ) {
            showsUnduplicated.push(show);
            previous = show;
        }
    })

    let categories = {};
    showsUnduplicated.forEach(s => {
        categories[s.category] = 1 + (categories[s.category] || 0);
    })


    const storer = FileStorer("client/json");
    //storer.put("events-rawUrls.json", null, JSON.stringify(shows, null, "  "));

    // Cache the images and replace their URLs with our caches:
    await replaceImageUrls(showsUnduplicated);

    // Detect platform
    let platform = 'local';
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        platform = 'aws';
    } else if (process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.WEBSITE_INSTANCE_ID) {
        platform = 'azure';
    }

    let package = {
        promoters: handlers,
        categories,
        shows: showsUnduplicated,
        toDo,
        faults,
        date: Date.now(),
        platform
    };

    // Save the list:
    await storer.put("events.json", null, JSON.stringify(package, null, "  "));
    await persistentStatus("Done. " + getFaults());

}

async function replaceImageUrls(shows) {
    const showsLength = shows.length;
    for (let i = 0; i < showsLength; i++) {
        let show = shows[i];
        show.imagesource = show.image;
        if (show.image) {
            const cacheInfo = await cache.getCache(show.image, false);
            show.image = '/pix/' + cacheInfo.name;
        }
        await persistentStatus(`Converting images: ${i} / ${showsLength}`);
    }
    await persistentStatus(`Converted ${showsLength} images`);
}

/**
 * Delete local pictures in client/pix that are not referenced in the latest collected events in client/json
 */
async function purgepix() {

}

/**
 * Grab or release a lock
 * @param {bool} true = try to set the lock
 * @returns whether this process has the lock
 */
async function collectLock(set, testPid, testpath = ".collectLock") {
    const path = testpath;
    const lockKey = testPid || pid; // from process
    const lockFileExists = await admin.has(path);
    const got = lockFileExists ? (await admin.get(path)).split(" ") : [];

    if (!got.length || 0 + got[0] < Date.now() - 3000) {
        // Lock file doesn't exist or is out of date
        if (set) {
            // We can set it and claim it as ours:
            await admin.put(path, "text/plain", "" + Date.now() + " " + lockKey);
        }
    } else {
        // Lock file exists and is in date
        if (!set && (await admin.get(path)).indexOf(" " + lockKey) > 0) {
            // We want to clear it and it's ours to clear.
            await admin.put(path, "text/plain", "0 0");
        }
    }
    // If we've managed to set the lock, or if it was already set...
    let after = (await admin.get(path)).split(' ');

    return ((after?.length || 0) > 1 && 0 + after[0] > Date.now() - 3000 && after[1] == lockKey);

}

/**
 * Record a status message that persists between calls
 * @param {string} s If not empty, overwrite the status
 * @returns The most recent status
 */
async function persistentStatus(s) {
    const statusFile = ".status.txt"
    if (s) {
        //console.log("put status " + s);
        await admin.put(statusFile, "text/plain", s);
        return s;
    } else {
        return await admin.get(statusFile);
    }
}
function assert(condition, msg) {
    if (!condition) throw Error(msg);
}


var faults = [];
function fault(s) {
    console.log(s);
    faults.push(s);
}
function getFaults() {
    let v = faults.join("\n");
    faults.length = 0;
    return v;
}

async function testFilestore() {
    const tfr = "testFile";
    const tf = tfr + ".txt";
    await admin.delete(tf);
    assert(!await admin.has(tf), "1 Failed to delete " + tf);
    await admin.put(tf, "text/plain", "stuff");
    let n = await admin.has(tf);
    assert(n, "2 Failed to put " + tf);
    assert(n.name == tf, "3 Wrong name found: " + n.name);
    let n2 = await admin.has(tfr);
    assert(n?.name == tf, "4 Failed to find file from root");
    let r = await admin.get(tf);
    assert(r == "stuff", "5 Bad content: " + r);
    await admin.delete(tf);
    assert(!await admin.has(tf), "6 Failed to delete " + tf);
    await persistentStatus("Filestore tests OK");
    console.log("Filestore tests OK");
    return true;
}
async function testLocks() {
    console.log("Lock tests ...");
    assert(await collectLock(true, 42), "1 Failed to get lock 42");
    assert(await collectLock(true, 42), "2 Failed to confirm lock 42");
    assert(!await collectLock(true, 43), "3 Failed to refuse lock 43");
    await collectLock(false, 43);
    assert(!await collectLock(true, 43), "4 Cleared wrong lock");
    await collectLock(false, 42);
    assert(await collectLock(true, 43), "5 Failed to get lock 43");
    await collectLock(false, 43);
    await persistentStatus("Lock tests OK");
    console.log("Lock tests OK");
    return true;
}
async function testCache() {
    const target = "https://moylgrove.wales/wp-content/uploads/2021/10/hall-6-1.png";
    const testFilestore = FileStorer("client/testpix");
    const testCache = Cache(testFilestore);
    await testCache.purge();
    let r = await testCache.getCache(target, false);
    assert(r.name?.length > 10 && r.name?.length < 30, "1 Cached name length " + r.name);
    assert(!r.wasCached, "2 wasCached");
    assert(await testFilestore.has(r.name), "3 No cache file " + r.name);
    let r2 = await testCache.getCache(target, false);
    assert(r2.name?.length > 10 && r.name?.length < 30, "4 Cached name length " + r.name);
    assert(r2.wasCached, "5 wasn't Cached");
    await testCache.purge();
    assert(!await testFilestore.has(r2.name), "6 Failed to purge");
    await persistentStatus("Cache tests OK");
    console.log("Cache tests ok");
    return true;
}

/**
 * Start or check progress of a collection operation
 * @param {*} context
 * @param {*} req query.go --> Start the operation; otherwise check progress
 */
const azureHandler = async function (context, req) {
    let r = { status: "idle" };
    // if (Object.keys(req.query).length) console.log("collect req ", req );
    try {
        if (req.query.go) {
            // On AWS Lambda, invoke collectTimer function asynchronously, which will invoke collect()
            if (Lambda) {
                try {
                    const { InvokeCommand } = require('@aws-sdk/client-lambda');
                    const stage = process.env.STAGE || 'dev';
                    await Lambda.send(new InvokeCommand({
                        FunctionName: `gigsmash-${stage}-collectTimer`,
                        InvocationType: 'Event', // Fire-and-forget
                        Payload: JSON.stringify({})
                    }));
                    r.status = "started (async)";
                } catch (e) {
                    console.log("Failed to invoke collectTimer:", e);
                    r.status = "failed to start: " + e.message;
                }
            } else {
                // Local/Azure: use fire-and-forget with promises
                if (await collectLock(true)) {
                    await persistentStatus("in progress");
                    collect(context)  // NB no await
                        .then(() => { collectLock(false); persistentStatus("Done " + getFaults()); })
                        .catch(e => { collectLock(false); persistentStatus(e.stack); });

                    r.status = "started";
                } else {
                    r.status = "already in progress";
                }
            }
        } else if (req.query.purge) {
            const r = await cache.purge();
            await persistentStatus("Done purge " + r);
        } else if (req.query.invalidate) {
            // Invalidate event cache for specific venue(s)
            const venues = req.query.invalidate.split(',');
            for (const venue of venues) {
                await eventCache.invalidate(venue.trim());
            }
            await persistentStatus(`Invalidated cache for: ${venues.join(', ')}`);
            r.status = `Invalidated cache for: ${venues.join(', ')}`;
        } else if (req.query.url) {
            if (await collectLock(true)) {
                try {
                    const cacheInfo = await cache.getCache(req.query.url, false);
                    cachedName = '/pix/' + cacheInfo.name;
                    await persistentStatus("Done " + JSON.stringify(cacheInfo));
                }
                catch (e) {
                    console.log(e.stack);
                }
                finally {
                    collectLock(false);
                }
            } else {
                console.log("not got lock");
            }
        } else if (req.query.test) {
            await persistentStatus("Starting tests...");
            await testFilestore();
            await testLocks();
            await testCache();
            await persistentStatus("Done tests ok");
        } else {
            r = { status: await persistentStatus() }
        }

        context.res = {
            body: JSON.stringify(r),
            headers: { "Content-Type": "application/json" },
            status: 200
        }
    }
    catch (e) {
        console.log(e);
        context.res = {
            status: 200,
            body: e.stack
        }
    }
    return r;
}

// Export for both Azure Functions and AWS Lambda
module.exports = azureHandler;
module.exports.test = { collectLock, persistentStatus };
module.exports.collect = collect;
module.exports.eventCache = eventCache;

// AWS Lambda handler (always export for serverless-offline compatibility)
const { wrapAzureFunctionForLambda } = require('../SharedCode/lambdaWrapper.js');
module.exports.handler = wrapAzureFunctionForLambda(azureHandler);


