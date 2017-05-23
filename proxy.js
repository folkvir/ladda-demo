var express = require('express');
var debug = require('debug')('proxy');
var proxy = require('http-proxy-middleware');

const proxyConfig = {
  target: 'http://fragments.mementodepot.org/',
  port: 10000
}

// proxy middleware options
var options = {
    target: proxyConfig.target, // target host
    changeOrigin: true,               // needed for virtual hosted sites
    pathRewrite: {
        '^/proxy/' : '',     // rewrite path
    },
    onProxyReq: function(proxyReq, req, res){
      debug('Request: ', proxyReq.path);
    }
};

// create the proxy (without context)
var httpproxy = proxy(options);

// mount `exampleProxy` in web server
var app = express();
    app.use('/*', httpproxy);

app.listen(proxyConfig.port, function(){
  debug('Proxy listening on port: ', proxyConfig.port)
});
