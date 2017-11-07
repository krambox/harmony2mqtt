#!/usr/bin/env node

var pkg = require('./package.json');
var log = require('yalm');
var config = require('./config.js');
var Mqtt = require('mqtt');
var harmony = require('harmonyhubjs-client');
var HarmonyHubDiscover = require('harmonyhubjs-discover');

var mqttConnected;
var hubs = {};

log.setLevel(config.verbosity);

log.info(pkg.name + ' ' + pkg.version + ' starting');
log.info('mqtt trying to connect', config.url);

var mqtt = Mqtt.connect(config.url, { will: { topic: config.name + '/connected', payload: '0', retain: true } });

mqtt.on('connect', function () {
  mqttConnected = true;

  log.info('mqtt connected', config.url);
  mqtt.publish(config.name + '/connected', '1', { retain: true }); // TODO eventually set to '2' if target system already connected

  log.info('mqtt subscribe', config.name + '/set/#');
  mqtt.subscribe(config.name + '/set/#');

  setInterval(checkState, 1000);
});

mqtt.on('close', function () {
  if (mqttConnected) {
    mqttConnected = false;
    log.info('mqtt closed ' + config.url);
  }
});

mqtt.on('error', function (err) {
  log.error('mqtt', err);
});

mqtt.on('message', function (topic, payload) {
  payload = payload.toString();
  log.debug('mqtt <', topic, payload);
// TODO do something with incoming messages
});

var discover = new HarmonyHubDiscover(61991);

discover.on('online', function (hub) {
  // Triggered when a new hub was found
  if (hub) {
    log.info('discovered ' + hub.ip);
    connect(hub);
  }
});

discover.on('offline', function (hub) {
  // Triggered when a hub disappeared
  log.info('lost ' + hub.ip);
});

function connect (hub) {
  log.info('Connect: ' + hub.host_name + ' at ' + hub.ip);
  var hubName = hub.host_name.replace(/[.\s]+/g, '_');
  if (!hubs[hubName]) {
    hubs[hubName] = hub;
    harmony(hub.ip).timeout(5000).then(function (harmonyClient) {
      log.info('Connected: ' + hubName);
      harmonyClient.getAvailableCommands()
        .then(function (config) {
          // console.log(config)
          hubs[hubName].activities = {};
          hubs[hubName].activities_reverse = {};
          hubs[hubName].devices = {};
          hubs[hubName].devices_reverse = {};
          processConfig(hubs, hubName, config);
          // console.log('###',hubs[hubName])
          hubs[hubName].harmonyClient = harmonyClient;
        });
    });
  }
}

function processConfig (hubs, hub, config) {
  config.activity.forEach(function (activity) {
    var activityLabel = activity.label.replace(/[.\s]+/g, '_');
    hubs[hub].activities[activity.id] = activityLabel;
    hubs[hub].activities_reverse[activityLabel] = activity.id;
  });

  /* create devices */
  config.device.forEach(function (device) {
    var deviceLabel = device.label.replace(/[.\s]+/g, '_');
    var controlGroup = device.controlGroup;
    hubs[hub].devices[device.id] = deviceLabel;
    hubs[hub].devices_reverse[deviceLabel] = device.id;
  });
}

// Look for hubs:
discover.start();

function checkState () {
  for (var hub in hubs) {
    //console.log('Check ' + hub);
    if (hubs.hasOwnProperty(hub)) {
      var harmonyClient = hubs[hub].harmonyClient;
      if (harmonyClient) {
        harmonyClient.getCurrentActivity()
        .then(function (a) {
            log.info(hub,hubs[hub].activities[a]);
        });
      }
    }
  }
}
