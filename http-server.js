const express = require("express");
const app = express();
const Twilio = require('twilio')
const http = require('http').Server(app);
const cors = require('cors');
const port = process.env.PORT || 8000;
const fs = require('fs');
const path = require('path')
const debug = require('debug')('ladda');
const url = require('url');

const twilioconfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'twilio_config.json'), 'utf-8'))
//
app.use(cors());

app.use('/', express.static(__dirname + "/"));
app.use('/foglet-ndp.bundle.js', express.static(path.resolve(__dirname + "/node_modules/foglet-ndp/dist/foglet-ndp.bundle.js")));

app.get('/ice', function (req, res) {
  console.log('A user want ice from client:')
  try {
    var client = Twilio(twilioconfig.api_key, twilioconfig.api_secret, {accountSid: twilioconfig.sid})
    client.api.account.tokens.create({}).then(token => {
      console.log(token.iceServers)
      res.send({ ice: token.iceServers })
    }).catch(error => {
      console.log(error)
    })
  } catch (e) {
    console.log(e)
    res.send('Error when getting your credentials.')
  }
})

app.get('/', function(req, res){
  res.sendFile(__dirname + "/website/index.html");
});

http.listen(port, function () {
  debug('HTTP Server listening on port '+port);
});
