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
    if (!hubs[hub.uuid]) {
      hubs[hub.host_name] = hub;
      harmony(hub.ip).timeout(5000).then(function (harmonyClient) {
        log.info('Connected: ' + hub.host_name);
        harmonyClient.getAvailableCommands()
          .then(function (config) {
            hubs[hub.host_name].activities = {};
            hubs[hub.host_name].activities_reverse = {};
              processConfig(hubs, hub.host_name, config);
            //hubs[hub.uuid].harmony = h;
            //hubs[hub.uuid].activities = activities;
            console.log(activities);
          });
      });
    }
  }

function processConfig(hubs, hub, config) {
    config.activity.forEach(function (activity) {
        var activityLabel = activity.label.replace(/[.\s]+/g, '_');
        hubs[hub].activities[activity.id] = activityLabel;
        hubs[hub].activities_reverse[activityLabel] = activity.id;
        if (activity.id == '-1') return;
        //create activities
        var activityChannelName = channelName + '.' + activityLabel;
        //create channel for activity
        delete activity.sequences;
        delete activity.controlGroup;
        delete activity.fixit;
        delete activity.rules;
        //create states for activity
        if (!hubs[hub].ioStates.hasOwnProperty(activityLabel)) {
            adapter.log.info('added new activity: ' + activityLabel);
            adapter.setObject(activityChannelName, {
                type: 'state',
                common: {
                    name: 'activity:' + activityLabel,
                    role: 'switch',
                    type: 'number',
                    write: true,
                    read: true,
                    min: 0,
                    max: 3
                },
                native: activity
            });
        }
        delete hubs[hub].ioStates[activityLabel];
    });

    /* create devices */
    adapter.log.debug('creating devices');
    channelName = hub;
    config.device.forEach(function (device) {
        var deviceLabel = device.label.replace(/[.\s]+/g, '_');
        var deviceChannelName = channelName + '.' + deviceLabel;
        var controlGroup = device.controlGroup;
        hubs[hub].devices[device.id] = deviceLabel;
        hubs[hub].devices_reverse[deviceLabel] = device.id;
        delete device.controlGroup;
        //create channel for device
        if (!hubs[hub].ioChannels.hasOwnProperty(deviceLabel)) {
            adapter.log.info('added new device: ' + deviceLabel);
            adapter.setObject(deviceChannelName, {
                type: 'channel',
                common: {
                    name: deviceLabel,
                    role: 'media.device'
                },
                native: device
            });
            controlGroup.forEach(function (controlGroup) {
                var groupName = controlGroup.name;
                controlGroup.function.forEach(function (command) {
                    command.controlGroup = groupName;
                    command.deviceId = device.id;
                    var commandName = command.name.replace(/[.\s]+/g, '_');
                    //create command
                    adapter.setObject(deviceChannelName + '.' + commandName, {
                        type: 'state',
                        common: {
                            name: deviceLabel + ':' + commandName,
                            role: 'button',
                            type: 'number',
                            write: true,
                            read: true,
                            min: 0
                        },
                        native: command
                    });
                    adapter.setState(deviceChannelName + '.' + commandName, {val: '0', ack: true});
                });
            });
        }
        delete hubs[hub].ioChannels[deviceLabel];
    });

    adapter.log.debug('deleting activities');
    Object.keys(hubs[hub].ioStates).forEach(function (activityLabel) {
        adapter.log.info('removed old activity: ' + activityLabel);
        adapter.deleteState(hub, 'activities', activityLabel);
    });

    adapter.log.debug('deleting devices');
    Object.keys(hubs[hub].ioChannels).forEach(function (deviceLabel) {
        adapter.log.info('removed old device: ' + deviceLabel);
        adapter.deleteChannel(hub, deviceLabel);
    });

    hubs[hub].statesExist = true;
    setBlocked(hub, false);
    setConnected(hub, true);
    hubs[hub].isSync = true;
    adapter.log.info('synced hub config');
}


// Look for hubs:
discover.start();
