/**
 *
 * irobot adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "irobot",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js irobot Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@irobot.com>"
 *          ]
 *          "desc":         "irobot adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42,
 *          "mySelect": "auto"
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.irobot.0
const adapter = new utils.Adapter('irobot');

const https = require('https');
const request = require('request');
const util = require('util')
const prettyMs = require('pretty-ms');
var dorita980 = require('dorita980');

var g_lights = []

function format(fmt, ...args) {
    if (!fmt.match(/^(?:(?:(?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{[0-9]+\}))+$/)) {
        throw new Error('invalid format string.');
    }
    return fmt.replace(/((?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{([0-9]+)\})/g, (m, str, index) => {
        if (str) {
            return str.replace(/(?:{{)|(?:}})/g, m => m[0]);
        } else {
            if (index >= args.length) {
                throw new Error('argument index is out of range in format');
            }
            return args[index];
        }
    });
}

function toPaddedHexString(num, len) {
    let str = num.toString(16);
    return "0".repeat(len - str.length) + str;
}

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

adapter.on('stateChange', function (id, state) {
    // only process if state was command.
    if (!id || !state || state.ack) {
        return;
    }
    var l = id.split('.');
    if (l.length == 3) {
        var action = l.pop();
        if (action == 'start') {
            let roomba = new dorita980.Local(adapter.config.blid, adapter.config.password, adapter.config.ip);

            roomba.on('connect', function () {
                roomba.start()
                .then(roomba.end())
                .catch(); // disconnect to leave free the channel for the mobile app.
            });
            create_button('start', 'start cleaning cycle', false);
        } else if (action == 'pause') {
            let roomba = new dorita980.Local(adapter.config.blid, adapter.config.password, adapter.config.ip);

            roomba.on('connect', function () {
                roomba.pause()
                .then(roomba.end())
                .catch(); // disconnect to leave free the channel for the mobile app.
            });
            create_button('pause', 'pause cleaning cycle', false);
        } else if (action == 'dock') {
            let roomba = new dorita980.Local(adapter.config.blid, adapter.config.password, adapter.config.ip);

            roomba.on('connect', function () {
                roomba.dock()
                .then(roomba.end())
                .catch(); // disconnect to leave free the channel for the mobile app.
            });
            create_button('dock', 'return to dock', false);
        } 
    }
});

function create_button(name, description, value) {
    adapter.getObject(name, function(err, obj) { 
        if (!obj) {
            adapter.setObject(name, {
                type: 'state',
                common: {
                    name: description,
                    role: 'state',
                    type: "boolean",
                    "read":  false,
                    "write": true
                    },
                native: {}
            });
        }
        adapter.setState(name, value, true);
    });
}

function create_indicator(name, description, value) {
    adapter.getObject(name, function(err, obj) { 
        if (!obj) {
            adapter.setObject(name, {
                type: 'state',
                common: {
                    name: description,
                    role: 'state',
                    type: "boolean",
                    "read":  true,
                    "write": false
                    },
                native: {}
            });
            adapter.setState(name, value, true);
        }
    });
    adapter.setState(name, value, true);
}

var current_data = null;

function update_state() {
    let roomba = new dorita980.Local(adapter.config.blid, adapter.config.password, adapter.config.ip);

    roomba.getRobotState(['cleanMissionStatus']).then((actualState) => {
        adapter.log.info(actualState);
        roomba.end();

        create_indicator('clean', 'true if cleaning active', actualState.cleanMissionStatus.cycle == 'clean' ? true : false);
        create_indicator('stuck', 'true if cleaning active', ((actualState.cleanMissionStatus.cycle == 'clean') && (actualState.cleanMissionStatus.phase == 'stuck')) ? true : false);
    });    
}

function init_device() {
    dorita980.getRobotIP((ierr, ip) => {
        if (ierr) 
            return adapter.log.info('error looking for robot IP');

        let roomba = new dorita980.Local(adapter.config.blid, adapter.config.password, adapter.config.ip);

        roomba.on('connect', function () {
            create_button('start', 'start cleaning cycle', false);
            create_button('pause', 'pause cleaning cycle', false);
            create_button('dock', 'return to dock', false);
            roomba.end();
        });

        setInterval(update_state, 5*1000);
    });    
}

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('config BLID: ' + adapter.config.blid);
    adapter.log.info('config password: ' + adapter.config.password);
    adapter.log.info('config IP: ' + adapter.config.ip);

    // in this all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    init_device();
}
