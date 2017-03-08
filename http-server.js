"use strict";
var express = require("express");
var app = express();
var http = require('http').Server(app);
var cors = require('cors');
var port = process.env.PORT || 3000;

app.use(cors());

app.use('/', express.static(__dirname + "/website/"));

app.get('/', function(req, res){
  res.sendFile(__dirname + "/website/index.html");
});

http.listen(port, function () {
  console.log('HTTP Server listening on port '+port);
});
