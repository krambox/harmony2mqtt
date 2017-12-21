#!/usr/bin/env node

var pkg = require('./package.json');
var log = require('yalm');
var config = require('./config.js');
var Mqtt = require('mqtt');
var harmony = require('harmonyhubjs-client');
var HarmonyHubDiscover = require('harmonyhubjs-discover');
var mqttWildcard = require('mqtt-wildcard');

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

  setInterval(checkStates, 30000);
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

mqtt.on('message', (topic, message) => {
  var hub = mqttWildcard(topic, config.name + '/set/+/activity');
  if (hub && hub.length === 1) {
    let h = hub[0];
    let value = message.toString();
    log.info('set activity', h, value);
    if (hubs.hasOwnProperty(h)) {
      var harmonyClient = hubs[h].harmonyClient;
      var id = hubs[h].activities_reverse[value];
      if (id) {
        harmonyClient.startActivity(id).then(function (a) {
          checkState(h, harmonyClient);
        });
      }
    }
  }
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
  mqtt.publish(config.name + '/connected', '2', { retain: true });
  var hubName = hub.host_name.replace(/[.\s]+/g, '_');
  if (!hubs[hubName]) {
    hubs[hubName] = hub;
    harmony(hub.ip).timeout(5000).then(function (harmonyClient) {
      log.info('Connected: ' + hubName);
      harmonyClient.getAvailableCommands()
        .then(function (config) {
          // log.debug(config)
          log.debug('commands', hubName);
          hubs[hubName].activities = {};
          hubs[hubName].activities_reverse = {};
          hubs[hubName].devices = {};
          hubs[hubName].devices_reverse = {};
          processConfig(hubs, hubName, config);
          // log.debug('###', hubs[hubName])
          hubs[hubName].harmonyClient = harmonyClient;
        });
    });
  }
}

function processConfig (hubs, hub, config) {
  config.activity.forEach(function (activity) {
    var activityLabel = activity.label.replace(/[.\s]+/g, '_');
    log.info('activites', hub, activity.id, activityLabel);
    hubs[hub].activities[activity.id] = activityLabel;
    hubs[hub].activities_reverse[activityLabel] = activity.id;
  });

  /* create devices */
  config.device.forEach(function (device) {
    var deviceLabel = device.label.replace(/[.\s]+/g, '_');
    log.info('devices', hub, device.id, deviceLabel);
    hubs[hub].devices[device.id] = deviceLabel;
    hubs[hub].devices_reverse[deviceLabel] = device.id;
  });
}

// Look for hubs:
discover.start();

function checkStates () {
  for (var hub in hubs) {
    log.debug('Check ' + hub);
    if (hubs.hasOwnProperty(hub)) {
      var harmonyClient = hubs[hub].harmonyClient;
      if (harmonyClient) {
        checkState(hub, harmonyClient);
      }
    }
  }
}

function checkState (hub, harmonyClient) {
  harmonyClient.getCurrentActivity()
    .then(function (a) {
      log.debug(hub, hubs[hub].activities[a]);
      var topic = config.name + '/status/' + hub + '/activity';
      var state = {
        ts: Math.floor(new Date() / 1000),
        val: hubs[hub].activities[a]
      };
      mqtt.publish(topic, JSON.stringify(state), { retain: true }, function () {
        log.debug(topic, state);
      });
    });
}
