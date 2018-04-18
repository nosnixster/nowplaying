var express = require('express');
var exphbs = require('express-handlebars');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var dbus = require('dbus-native');
var fs = require('fs');
const WebSocket = require('ws');
const wss = new WebSocket.Server({
  port: 8069
});

var indexRouter = require('./routes/index');

var app = express();

app.engine('handlebars', exphbs(
  /*{
    defaultLayout: 'main'
  }*/
));
app.set('view engine', 'handlebars');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


var sessionBus = dbus.sessionBus();
/*
sessionBus.invoke({
  path: "/org/mpris/MediaPlayer2",
  interface: "org.freedesktop.DBus.Properties",
  member: "Get",
  destination: "org.mpris.MediaPlayer2.clementine",
  signature: "ss",
  body: ["org.mpris.MediaPlayer2.Player", "Metadata"]
}, function(err, data) {
  //album art file
  //console.log(data[1][0][1][1][1][0]);
  //artist
  //console.log(data[1][0][6][1][1][0][0]);
  //album
  //console.log(data[1][0][4][1][1][0]);
  //title
  //console.log(data[1][0][11][1][1][0]);
  //url
  //console.log(data[1][0][13][1][1][0]);

});
*/

function parseDbus(data) {
  data = data[1][0];
  var parseddata = {};
  for (var i = 0; i < data.length; i++) {
    switch (data[i][0]) {
      case 'xesam:album':
        parseddata.album = data[i][1][1][0];
        break;
      case 'xesam:artist':
        parseddata.artist = data[i][1][1][0][0];
        break;
      case 'xesam:title':
        parseddata.title = data[i][1][1][0];
        break;
      case 'xesam:url':
        parseddata.url = data[i][1][1][0];
        break;
      case 'mpris:artUrl':
        parseddata.artfile = data[i][1][1][0];
        break;

      default:
        break;

    }
  }
  console.log(parseddata);
  return parseddata;
}

var track = "";
var state = "";
var queue = [];

function getbus(songchanged) {
  sessionBus.invoke({
    path: "/org/mpris/MediaPlayer2",
    interface: "org.freedesktop.DBus.Properties",
    member: "Get",
    destination: "org.mpris.MediaPlayer2.clementine",
    signature: "ss",
    body: ["org.mpris.MediaPlayer2.Player",
      "Metadata"
    ]
  }, function(err, data) {
    //file
    var parseddata = parseDbus(data);
    if (parseddata.artfile) {
      if (parseddata.url) {
        if (songchanged) {
          if (track !== parseddata.url) {
            track = parseddata.url;
            pushtoqueue(parseddata);
          }
        } else {
          if (track !== parseddata.url) {
            track = parseddata.url;
          }
          pushtoqueue(parseddata);
        }
        //console.log(queue.length);
      }
    } else {
      console.log("No art!");
      setTimeout(getbus, 400, songchanged);
    }
  });
}

function pushtoqueue(parseddata) {
  let b64img = base64Image = new Buffer(fs.readFileSync(
      parseddata.artfile.substring(
        parseddata.artfile.indexOf(':') + 1
      )),
    'binary').toString('base64');
  queue.push({
    'artfile': b64img,
    'artist': parseddata.artist,
    'album': parseddata.album,
    'title': parseddata.title
  });
}

sessionBus.getService("org.mpris.MediaPlayer2.clementine").getInterface(
  "/org/mpris/MediaPlayer2",
  "org.freedesktop.DBus.Properties", (err, iface) => {

    iface.on('PropertiesChanged', (things) => {
      //console.log(things);
      sessionBus.invoke({
        path: "/org/mpris/MediaPlayer2",
        interface: "org.freedesktop.DBus.Properties",
        member: "Get",
        destination: "org.mpris.MediaPlayer2.clementine",
        signature: "ss",
        body: ["org.mpris.MediaPlayer2.Player",
          "PlaybackStatus"
        ]
      }, function(err, data) {
        //state
        //console.log(data[1][0]);
        if (state !== data[1][0]) {
          state = data[1][0];
          if (state == "Playing") {
            //playback changed to playing
            console.log('playback changed');
            console.log(data[1][0]);
            getbus();
          }
        } else if (state == "Playing") {
          console.log("song changed");
          //song changed
          getbus(true);
        }
      });
    });
  });


app.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Express'
  });
});

function waitforqueue() {
  console.log("waitforqueue");
  if (queue.length > 0) {
    let data = JSON.stringify(queue.shift())
    for (var key in connections) {
      connections[key].send(data);
    }
  }
}

var interval;
var connections = {};
var connectionid = 0;

wss.on('connection', function connection(ws) {
  /*ws.on('message', function incoming(message) {
    console.log('received: %s', message);
    ws.send(message);
  });*/
  ws.id = connectionid;
  connections[connectionid++] = ws;
  if (!interval) {
    interval = setInterval(waitforqueue, 500);
  }
  ws.on('close', function() {
    delete connections[ws.id];
    if (connections.length == 0) {
      clearInterval(interval);
      interval = false;
    }
  })
});

//app.use('/', indexRouter);

module.exports = app;
