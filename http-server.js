"use strict";
var express = require("express");
var app = express();
var http = require('http').Server(app);
var cors = require('cors');
var port = process.env.PORT || 8000;
var fs = require('fs');
var debug = require('debug')('ladda');
var url = require('url');


app.use(cors());

app.use('/', express.static(__dirname + "/"));
app.get('/ice', function(req, res){
	debug("A user want ice from client:");
	fs.readFile("./twilio_config.json", 'utf-8', (err, data) => {
		debug(data);
		if (err) throw err;
		let parsed;
		try {
			parsed = JSON.parse(data);
		} catch (e) {
			res.send('Error:', e.stack);
		}
		try {
			var client = require('twilio')(parsed.api_key, parsed.api_secret);
			var account = client.accounts(parsed.sid);
			account.tokens.create({}, function(err, token) {
				res.send({ ice: token.ice_servers });
			});
		} catch (e) {
			debug(e);
			res.send('Error when getting your credentials.');
		}
	});
});

app.get('/', function(req, res){
  res.sendFile(__dirname + "/website/index.html");
});



http.listen(port, function () {
  debug('HTTP Server listening on port '+port);
});
