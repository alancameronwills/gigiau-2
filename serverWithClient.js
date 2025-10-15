/*
* Very basic server for local testing or for running in bare nodejs environments.
*
* Otherwise, use Azure Functions or similar:
* Requests to /api map to the directory /api and should be run on server; 
* on Azure, set them up as js Functions.
* 
* Other requests should map to contents of /client and should be served up as is.
* on Azure, put them in Blob store and map non-api calls to there.
*
* Default page is /client/index.html
* Put client-side pages in /client
* Put server-side scripts under /api, written in Javascript with a default export
*
*/


const http = require('http');
const util = require('util');
const fs = require('fs/promises');
const fsSync = require('fs');
const process = require('process');

const logverbose = true;

const contentTypes = {
	".css": "text/css",
	".htm": "text/html", ".html": "text/html",
	".ico" : "image/x-icon",
	".gif": "image/gif",
	".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".js": "text/js",
	".json": "application/json",
	".mp3": "audio/mpeg", ".mp4": "video/mp4", ".mpeg": "video/mpeg",
	".png": "image/png",
	".pdf": "application/pdf",
	".txt": "text/plain"
};

var server = null;

const handlers = {
	ping: async (request, response) => {
		response.writeHead(200, { "Content-Type": "text/plain" });
		response.end("pong " + new Date().toISOString());
	},
	stopserver: (request, response) => {
		setTimeout (() => server.close(), 1000);
		response.writeHead(200, { "Content-Type": "text/plain" });
		response.end("Stopped " + new Date().toISOString());
	}
};

async function runFile(fPath, req, response) {
	let context = { res:{body: "", status: 200, headers: {"Content-Type":"text/plain"}} , log:console.log};
	try {
		let code = (await import(fPath)).default;
		//log("Code " + util.inspect(code));
		await code(context, req);
	} catch (e) {
		context = { body: e.toString(), status: 500, contentType: "text/plain" };
	}
	response.writeHead(context.res?.status ?? 500, context.res?.headers ?? {});
	response.end(context.res?.body??"");
}



(async () => {
	let root = (await fs.realpath('.')).replace("/server", "").replace(/\\/g,"/");//.replace("C:", "file:///C:");
	// binds root
	async function serve(request, response) {
		try {
			let req = parseReq(request);
			verbose(req);
			if (req.path.startsWith("/api/")) {
				// run the file
				let fPath = `${root}${req.path}`; //.replace("/api", "")};
				if (fPath.indexOf("..") < 0 && fsSync.existsSync(fPath)) {
					if (fsSync.lstatSync(fPath).isDirectory()) {
						fPath += "/index.js";
					}
					fPath = fPath.replace(/\\/g, "/");//.replace("C:", "file:///C:");
					log (`Loading ${fPath} ${fsSync.existsSync(fPath)}`);
					await runFile(fPath, req, response);
				} else {
					response.writeHead(400);
					response.end(`API not found: "${req.path}"`);
				}
			} else {
				let fPath = `${root}/client${req.path}`;
				//fPath = fPath.replace(/\//g, "\\");//.replace("C:", "file:///C:");
				verbose (`[${fPath}]` );
				if (fPath.indexOf("..") < 0 && fsSync.existsSync(fPath) && !fsSync.lstatSync(fPath).isDirectory()) {
					// return the file content
					let reply = "";
					let replyType = contentTypes[req.extension] ?? "text/plain";
					let status = 200;
					let file = `${root}/client${req.path}`;
					try {
						reply = await fs.readFile(file);
					} catch (err) {
						reply = err.toString();
						replyType = "text/plain";
						status = 400;
					} finally {
						response.writeHead(status, { "Content-Type": replyType });
						response.end(reply);
					}
				} else {
					let h = handlers[req.path.substring(1)];
					if (h) {
						h(request, response);
					} else {
						response.writeHead(400);
						response.end(`Content not found "${fPath}"  ${fsSync.existsSync(fPath)}`);
					}
				}
			}
		} catch (err) {
			log("Serve exception " + util.inspect(err));
		}
	}
	server = http.createServer(serve);
	const port = process.argv[2] || 80;
	server.listen(port);
	log(`Server running at http://localhost:${port}`);
	server.on('close', () => {
		log("Server closing");
	})
})()


function parseReq(request, defaultPage = "/index.html") {
	let url = request.url.toLowerCase();
	let method = request.method;
	let headers = {};
	for (let i = 0; i < request.rawHeaders.length; i += 2) {
		headers[request.rawHeaders[i]] = request.rawHeaders[i + 1];
	}
	let host = headers.Host;
	let path = url.replace(/[\?#].*/, "");
	if (path == "/") path = defaultPage;
	let extension = path.match(/\.[^.]*$/)?.[0] ?? "";
	let queryString = url.match(/\?(.*)/)?.[1] ?? "";  // url.replace(/.*\?/,"");
	let paramStrings = queryString.split('&');
	let query = paramStrings.reduce((m, keqv) => {
		if (!keqv) return m;
		let kv = keqv.split('=');
		m[kv[0]] = kv.length > 1 ? kv[1] : true;
		return m;
	}, {});
	return { path: path, extension: extension, queryString: queryString, query: query, host: host, url: url, method: method, headers: headers };
}

//******************
// Logging
//
//  */
function verbose(msg) {
	if (logverbose) log(msg);
}
let previousMsg = "";
let messageRepeatCount = 0;
function log(msg, condition = true) {
	if (!condition) return;
	
	if (previousMsg == msg) {
		messageRepeatCount++;
	} else {
		if (messageRepeatCount > 0) {
			console.log(` * ${messageRepeatCount}`);
			messageRepeatCount = 0;
		}
		previousMsg = msg;
		console.log(`${new Date().toISOString()}`, msg);
	}
}


