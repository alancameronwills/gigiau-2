// Load environment variables from .env file
require('dotenv').config();

const http = require('http');
const util = require('util');
const fs = require('fs/promises');
const fsSync = require('fs');
const process = require('process');

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
	ping: (req, response) => {
		response.body = `pong ${new Date().toISOString()} ${req.seq}`;
	},
	stopserver: (request, response) => {
		setTimeout(() => server.close(), 1000);
		response.body = "Stopped " + new Date().toISOString();
	}
};

async function runFile(fPath, req, response) {
	let context = { res: {}, log: console.log };
	try {
		let code = (await import(fPath)).default;
		await code(context, req);
	} catch (e) {
		context.res.body = `runFile ${fPath} error ${e.stack}`;
		context.res.status = 500;
	}
	// Copy response from context
	response.body = context.res.body;
	response.status = context.res.status || 200;
	response.headers = context.res.headers || { 'Content-Type': 'text/plain' };
	return response;
}



function parseReq(request, defaultPage = "/index.html") {
	let url = request.url; // Don't lowercase - breaks OAuth codes!
	let method = request.method;
	let headers = {};
	for (let i = 0; i < request.rawHeaders.length; i += 2) {
		headers[request.rawHeaders[i]] = request.rawHeaders[i + 1];
	}
	let host = headers.Host;
	let path = url.replace(/[\?#].*/, "").replace(/\/$/, "").toLowerCase(); // Only lowercase the path
	let path2 = path.replace(/^\/[^\/]*/, "");
	if (path == "/") path = defaultPage;
	let extension = path.match(/\.[^.]*$/)?.[0] ?? "";
	let queryString = url.match(/\?(.*)/)?.[1] ?? "";  // Keep original case
	let paramStrings = queryString.split('&');
	let query = paramStrings.reduce((m, keqv) => {
		if (!keqv) return m;
		let kv = keqv.split('=');
		m[kv[0]] = kv.length > 1 ? decodeURIComponent(kv[1]) : true;
		return m;
	}, {});
	return {
		path: path,
		path2,
		extension: extension,
		queryString: queryString,
		query: query,
		host: host,
		url: url, // Original URL with case preserved
		method: method,
		headers: headers
	};
}
(async () => {
	const root = (await fs.realpath('.')).replace("/server", "");
	let count = 0;

	server = http.createServer(async function (request, res) {
		var response = { status: 200, headers: { 'Content-Type': 'text/plain' }, body: "Nothing" };
		try {
			let req = parseReq(request);
			req.seq = count++;
			if (!req.path) {req.path = "/index.html";req.extension = ".html";}
			//console.log(`Req ${count} ${JSON.stringify(req, null, 2)}`);
			let cmd = req.path.substring(1);
			//response.body = `Cmd [${cmd}]`;
			let h = handlers[cmd];
			if (h) {
				h(req, response);
			} else {
				if (!cmd) cmd="index.html";

				// Route all fbauth-* endpoints to api/fbauth/index.js
				let fPath = `${root}/${cmd}`;
				if (cmd.startsWith('api/fbauth-')) {
					fPath = `${root}/api/fbauth/index.js`;
					req.url = req.url; // Keep original URL for path detection
					req.path = req.path; // Keep original path
				}

				//response.body = `fPath [${fPath}]`;
				if (fPath.indexOf("..") < 0 && fsSync.existsSync(fPath)) {
					if (fsSync.lstatSync(fPath).isDirectory()) {
						fPath += "/index.js";
					}
					//response.body = `running [${fPath}]`;

					await runFile(fPath.replace(/\\/g, "/").replace("C:", "file:///C:"), req, response);

				} else {
					let fPath = `${root}/client${req.path}`;
					//fPath = fPath.replace(/\//g, "\\");//.replace("C:", "file:///C:");
					//console.log(`[${fPath}]`);
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
							response.headers = { "Content-Type": replyType };
							response.body = reply;
							response.status = status;
						}
					}
					else {
						response.body = JSON.stringify({
							req,
							root,
							fPath,
							version: 'NodeJS ' + process.versions.node
						}, null, "  ");
					}
				}
			}
		} catch (e) {
			response.body = "Error: " + e;
		}
		// Handle redirects (don't send body for 3xx status codes)
		res.writeHead(response.status || 200, response.headers || {});
		if (response.status >= 300 && response.status < 400) {
			res.end();
		} else {
			res.end(response.body);
		}
	});
	const port = process.argv[2] || 80;
	server.listen(port);
	console.log(`Server running at http://localhost:${port}`);
	server.on('close', () => {
		console.log("Server closing");
	})
})();
