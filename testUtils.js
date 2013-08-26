var assert = require('assert');
var grunt = require('grunt');
var path = require('path');

module.exports = {
    prepareAppium: function(appiumDirectory, callback) { // shouldn't be needed anymore
        var cwd = process.cwd();
        process.chdir(path.resolve(appiumDirectory));
        grunt.util.spawn({
            cmd: './reset.sh',
            args: [ '-v', '--ios' ],
            opts: { stdio: 'inherit' }
        }, function(error, result, code) {
            if(code != 0) {
                grunt.log.errorlns(error);
            } else {
                grunt.log.writelns(result);
            }
            callback(code == 0);
        });
        process.chdir(cwd);
    },
    startAppium: function(options) {
        var defaultOptions = {
            args: '',
            address: 'localhost',
            port: 4723,
            'pre-launch': true,
            nodeconfig: null
        };

        var appium = require('appium');

        return appium.run(options.args, options.readyCallback, options.doneCallback);
    },
    createiOSWDBrowser: function(appPath, hostname, port, options) {
        var wd = require('wd');
        var defaultOptions = {
            device: 'iPhone Simulator',
            name: 'Appium testing',
            platform: 'Mac',
            app: appPath,
            version: '6.1',
            browserName: 'iOS',
            newCommandTimeout: 60
        };

        if(options) {
            options.device = options.device || defaultOptions.device;
            options.name = options.name || defaultOptions.name;
            options.platform = options.platform || defaultOptions.platform;
            options.app = options.app || defaultOptions.app;
            options.version = options.version || defaultOptions.version;
            options.browserName = options.browserName || defaultOptions.browserName;
            options.newCommandTimeout = options.newCommandTimeout || defaultOptions.newCommandTimeout;
        } else {
            options = defaultOptions;
        }
        var browser = wd.promiseRemote(hostname, port);

        browser.on('status', function(info) {
            console.log('\x1b[36m%s\x1b[0m', info);
        });

        browser.on('command', function(meth, path, data) {
            console.log(' > \x1b[33m%s\x1b[0m: %s', meth, path, data || '');
        });

        return { browser: browser, promise: browser.init(options) };
    }
};