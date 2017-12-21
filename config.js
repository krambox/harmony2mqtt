var pkg = require('./package.json');
var config = require('yargs')
  .env('HARMONY')
  .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
  .describe('v', 'possible values: "error", "warn", "info", "debug"')
  .describe('n', 'instance name. used as mqtt client id and as prefix for connected topic')
  .describe('u', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
  .describe('h', 'show help')
  .alias({
    'h': 'help',
    'n': 'name',
    'u': 'url',
    'v': 'verbosity'
  })
  .default({
    'u': 'mqtt://kiste.local',
    'n': 'harmony',
    'v': 'info'
  })
  .version()
  .help('help')
  .argv;

module.exports = config;
