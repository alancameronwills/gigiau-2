
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
	let context = { res: response, log: console.log };
	try {
		let code = (await import(fPath)).default;
		context.res.body = `Code5 ${util.inspect(code)} ${fPath}`;
		await code(context, req);
	} catch (e) {
		context.res.body = `runFile ${fPath} error ${e.stack}`;
	}
	response.body = context.res.body;
	response.status = context.res.status;
	response.headers = context.res.headers;
	return response;
}



function parseReq(request, defaultPage = "/index.html") {
	let url = request.url.toLowerCase();
	let method = request.method;
	let headers = {};
	for (let i = 0; i < request.rawHeaders.length; i += 2) {
		headers[request.rawHeaders[i]] = request.rawHeaders[i + 1];
	}
	let host = headers.Host;
	let path = url.replace(/[\?#].*/, "").replace(/\/$/, "");
	let path2 = path.replace(/^\/[^\/]*/, "");
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
	return { path: path, path2, extension: extension, queryString: queryString, query: query, host: host, url: url, method: method, headers: headers };
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
				let fPath = `${root}/${cmd}`;
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
		res.writeHead(response.status, response.headers);
		res.end(response.body);
	});
	const port = process.argv[2] || 80;
	server.listen(port);
	console.log(`Server running at http://localhost:${port}`);
	server.on('close', () => {
		console.log("Server closing");
	})
})();
