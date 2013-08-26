module.exports = function(grunt) {
    var http = require('http');
    var fs = require('fs');
    var util = require('./util.js');

    // put all these into config!
    var testFile = 'main-test.js';
    var certFile = 'apns_cert.p12';
    var production = "false";
    var passPhrase = 'anything_is_possible_with_the_right_attitude';
    var targetDirectory = 'target';
    var resourcesDirectory = 'resources';
    var persistenceXml = resourcesDirectory + '/persistence.xml';
    var jbossAsSource = 'http://search.maven.org/remotecontent?filepath=org/jboss/as/jboss-as-dist/7.1.1.Final/jboss-as-dist-7.1.1.Final.zip';
    var jbossAsZip = targetDirectory + '/jbossas.zip';
    var jbossAsDirectory = targetDirectory + '/jboss-as-7.1.1.Final';
    var jbossAsCmd = jbossAsDirectory + '/bin/standalone.sh';
    var jbossAsInstance = null;
    var pushServerDirectory = targetDirectory + '/unified-push-server';
    var pushServerPersistence = pushServerDirectory + '/src/main/resources/META-INF/persistence.xml';
    var appiumServerInstance = null;

    var cleanup = function() {
        if(jbossAsInstance != null) {
            jbossAsInstance.kill();
        }

        var webDriverInstance = grunt.option('webDriverInstance');
        if(webDriverInstance != null) {
            webDriverInstance.browser.quit();
        }
    };

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        gitclone: {
            unifiedPushServer: {
                options: {
                    repository: 'https://github.com/aerogear/aerogear-unified-push-server.git',
                    directory: pushServerDirectory,
                    verbose: true
                }
            }
        },
        clean: {
            jbossZip: jbossAsZip,
            jbossDirectory: jbossAsDirectory,
            pushServerDirectory: pushServerDirectory,
            target: targetDirectory
        }
    });

    grunt.registerMultiTask('clean', 'Clean task', function() {
        grunt.file.delete(this.data);
    });

/*
        grunt.util.spawn({
            cmd: 'node',
            args: [ testFile ]
        });
*/


    grunt.registerTask('default', 'Default test task using JBoss AS', [
        'init',

        'login',
        'registerApp',
        'addiOSVariant',
        'registeriOSDevice',
        'broadcastMessage',
        'verifyBroadcast',

        'tearDown']);


    grunt.registerTask('init', 'Initialization task', [
        'prepareTargetDir',
        'downloadJBossAS',
        'unzipJBossAS',
        'clonePushServer',
        'replacePersistence',
        'runJBossAS',
        'deployPushServer'
    ]);

    grunt.registerTask('tearDown', 'Cleans the mess', [
        'finalCleanup'
    ]);

    grunt.registerTask('verifyTestFile', 'Verify test file', function() {
        grunt.log.write('Verifying test file ... ');
        if(testFile == null) {
            grunt.log.error();

            grunt.log.writeln('Test file path not set!');
            return false;
        }
        if(!grunt.file.exists(testFile)) {
            grunt.log.error();

            grunt.log.writeln('Test file not found!');
            return false;
        }
        if(grunt.file.isDir(testFile)) {
            grunt.log.error();

            grunt.log.writeln('Specified path is a directory!');
            return false;
        }
        grunt.log.ok();
    });

    grunt.registerTask('prepareTargetDir', 'Prepare target directory', function() {
        grunt.log.write('Creating target directory ... ');
        grunt.file.mkdir(targetDirectory);
        if(grunt.file.isDir(targetDirectory)) {
            grunt.log.ok();
        } else {
            grunt.log.error();
        }
    });

    grunt.registerTask('downloadJBossAS', 'Download JBoss AS if necessary', function() {
        if(!grunt.file.isFile(jbossAsZip)) {
            var done = this.async();
            util.downloadFile(jbossAsSource, jbossAsZip, function() {
                grunt.log.write('Download jboss ... ');
                grunt.log.ok();
                done(true);
            });
        } else {
            grunt.log.writeln('No need to download jboss, it\'s already downloaded.');
        }
    });

    grunt.registerTask('unzipJBossAS', 'Unzip JBoss AS if necessary', function() {
        if(!grunt.file.isDir(jbossAsDirectory)) {
            grunt.log.write("Unzipping JBoss AS ... ");
            var AdmZip = require('adm-zip');
            var zip = new AdmZip(jbossAsZip);
            zip.extractAllTo(targetDirectory, true);
            grunt.log.ok();
        } else {
            grunt.log.writeln('No need to unzip JBoss AS, it already exists.');
        }
    });

    grunt.registerTask('clonePushServer', 'Clone push server repository if necessary', function() {
        if(!grunt.file.isDir(pushServerDirectory)) {
            grunt.task.run('gitclone:unifiedPushServer');
        } else {
            grunt.log.writeln('No need to clone push server repository.')
        }
    });

    grunt.registerTask('replacePersistence', 'Replace persistence.xml in push server', function() {
        grunt.log.write('Delete current push server persistence.xml ... ');
        grunt.file.delete(pushServerPersistence);
        if(grunt.file.exists(pushServerPersistence)) {
            grunt.log.error();
            return false;
        } else {
            grunt.log.ok();
        }

        grunt.log.write('Copy our persistence to push server ... ');
        grunt.file.copy(persistenceXml, pushServerPersistence);
        if(grunt.file.exists(pushServerPersistence)) {
            grunt.log.ok();
        } else {
            grunt.log.error();
            return false;
        }
    });

    grunt.registerTask('runJBossAS', 'Run JBoss AS instance', function() {
        var taskOptions = this.options({
            binding: '0.0.0.0',
            port: 8080
        });
        util.findOption(taskOptions, 'binding');
        util.findOption(taskOptions, 'port');

        if(taskOptions.binding != '0.0.0.0') {
            grunt.option('hostname', taskOptions.binding);
        }

        grunt.log.writeln('Spawning JBoss AS instance');
        var done = this.async();
        var path = require('path');
        var java;
        if(process.env.JAVA == null) {
            if(process.env.JAVA_HOME != null) {
                java = process.env.JAVA_HOME + '/bin/java';
            } else {
                java = 'java';
            }
        } else {
            java = process.env.JAVA;
        }
        var jbossHome = path.resolve(jbossAsDirectory);
        var jbossBaseDir = jbossHome + '/standalone';
        var jbossLogDir = jbossBaseDir + '/log';
        var jbossConfigDir = jbossBaseDir + '/configuration';
        var jbossModulePath = jbossHome + '/modules';
        var jbossArgs = [
            '-D"[Standalone]"',
            '-Dorg.jboss.boot.log.file=' + jbossLogDir + '/boot.log',
            '-Dlogging.configuration=file:' + jbossConfigDir + '/logging.properties',
            '-jar',
            jbossHome + '/jboss-modules.jar',
            '-mp',
            jbossModulePath,
            '-jaxpmodule',
            'javax.xml.jaxp-provider',
            'org.jboss.as.standalone',
            '-Djboss.home.dir=' + jbossHome,
            '-b',
            taskOptions.binding
        ]; // TODO add port change!!!
        grunt.log.write(java);
        var length = jbossArgs.length;
        var element = null;
        for (var i = 0; i < length; i++) {
            element = jbossArgs[i];
            grunt.log.write(' ' + element);
        }
        grunt.log.writeln();

        jbossAsInstance = grunt.util.spawn({
            cmd: java,
            args: jbossArgs,
            opts: { stdio: [process.stdin, null, process.stderr] }
        }, function(error, result, code) {
            grunt.log.writeln('JBoss AS shut down');
            if(code != 0) {
                done(false);
            }
        });
        jbossAsInstance.stdout.on('data', function(data) {
            grunt.log.writeln(data);

            if(/JBoss AS 7\.1\.1\.Final "Brontes" started/.test(data)) {
                done(true);
            }
        });
    });

    grunt.registerTask('deployPushServer', 'Deploy push server', function() {
        var done = this.async();
        var path = require('path');
        //var process = require('process');
        var cwd = process.cwd();
        process.chdir(path.resolve(pushServerDirectory));
        grunt.util.spawn({
            cmd: 'mvn',
            args: [ 'clean', 'package', 'jboss-as:deploy' ],
            opts: { stdio: 'inherit' }
        }, function(error, result, code) {
            if(code != 0) {
                cleanup();
                grunt.log.errorlns(error);
            } else {
                grunt.log.writelns(result);
            }
            done(code == 0);
        });
        process.chdir(cwd);
    });

    grunt.registerTask('login', 'Login/change password', function() {
        var taskOptions = this.options({
            hostname: 'localhost',
            port: 8080,
            username: 'admin',
            defaultPassword: '123',
            newPassword: 'opensource'
        });
        util.findOption(taskOptions, 'hostname');
        util.findOption(taskOptions, 'port');

        var login = function(name, password, callback) {
            var options = {
                hostname: taskOptions.hostname,
                port: taskOptions.port,
                path: '/ag-push/rest/auth/login',
                method: 'POST',
                headers: {
                    'Cookie': util.loadCookies(),
                    'Accept': 'application/json'
                }
            };

            var data = {
                loginName: name,
                password: password
            };

            util.request.withJsonData(options, data, function(response, cookies, responseData) {
                // if response == null, there was an error!
                if(response != null) {
                    util.saveCookies(cookies);
                    grunt.log.writelns(cookies);
                }
                callback(response, responseData);
            });

        };

        var changePassword = function(name, password, newPassword, callback) {
            var options = {
                hostname: taskOptions.hostname,
                port: taskOptions.port,
                path: '/ag-push/rest/auth/update',
                method: 'PUT',
                headers: {
                    'Cookie': util.loadCookies(),
                    'Accept': 'application/json'
                }
            };

            var data = {
                loginName: name,
                password: password,
                newPassword: newPassword
            };

            util.request.withJsonData(options, data, function(response, cookies, responseData) {
                if(response != null) {
                    util.saveCookies(cookies);
                    grunt.log.writelns(cookies);
                }
                callback(response, responseData);
            });
        };

        var done = this.async();

        var loginCallback = function(response, responseData) {
            if(response == null) {
                done(responseData);
                return;
            }

            if(response.statusCode == 403) { // TODO change to 409
                changePassword(taskOptions.username, taskOptions.defaultPassword, taskOptions.newPassword, changePasswordCallback);
            } else if(response.statusCode == 200) {
                done(true);
            } else {
                grunt.log.error();
                done(false);
            }
        };

        var changePasswordCallback = function(response, responseData) {
            if(response == null) {
                done(responseData);
                return;
            }

            if(response.statusCode == 200) {
                login(taskOptions.username, taskOptions.newPassword, loginCallback);
            } else {
                cleanup();
                grunt.log.error();
                done(false);
            }
        };

        login(taskOptions.username, taskOptions.defaultPassword, loginCallback);

    });

    grunt.registerTask('registerApp', 'Register push application', function() {
        var taskOptions = this.options({
            hostname: 'localhost',
            port: 8080,
            name: 'Very automated app',
            description: 'Great app at your disposal'
        });
        util.findOption(taskOptions, 'hostname');
        util.findOption(taskOptions, 'port');

        var done = this.async();
        var options = {
            hostname: taskOptions.hostname,
            port: taskOptions.port,
            path: '/ag-push/rest/applications',
            method: 'POST',
            headers: {
                'Cookie': util.loadCookies(),
                'Accept': 'application/json'
            }
        };

        var data = {
            name: taskOptions.name,
            description: taskOptions.description
        };

        util.request.withJsonData(options, data, function(response, cookies, responseData) {
            if(response != null) {
                util.saveCookies(cookies);
                // read pushAppId and masterSecret and store to grunt.option( ... )

                var responseObject = JSON.parse(responseData);
                grunt.option('pushApplicationID', responseObject.pushApplicationID);
                grunt.option('masterSecret', responseObject.masterSecret);

                grunt.log.writelns(cookies); // TODO check status code!
                done(true);
            } else {
                done(responseData);
            }
        });
    });

    grunt.registerTask('addiOSVariant', 'Add iOS variant', function() {
        var taskOptions = this.options({
            hostname: 'localhost',
            port: 8080,
            certificate: resourcesDirectory + '/apns_cert.p12',
            passphrase: 'anything',
            production: 'false',
            name: 'iOS Variant',
            description: 'iOS variant description',
            pushApplicationID: null
        });
        util.findOption(taskOptions, 'hostname');
        util.findOption(taskOptions, 'port');
        util.findOption(taskOptions, 'pushApplicationID');
        util.findOption(taskOptions, 'passphrase');

        var done = this.async();
        var options = {
            hostname: taskOptions.hostname,
            port: taskOptions.port,
            path: '/ag-push/rest/applications/' + taskOptions.pushApplicationID + '/iOS',
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Cookie': util.loadCookies()
            }
        };

        var data = [
            util.request.fileUploadWrapper('certificate', taskOptions.certificate),
            util.request.fieldValueWrapper('passphrase', taskOptions.passphrase),
            util.request.fieldValueWrapper('production', taskOptions.production),
            util.request.fieldValueWrapper('name', taskOptions.name),
            util.request.fieldValueWrapper('description', taskOptions.description)
        ];

        util.request.withMultipartData(options, data, function(response, cookies, responseData) {
            if(response == null) {
                done(responseData);
                return;
            }

            grunt.log.writelns(responseData);
            responseObject = JSON.parse(responseData);

            grunt.option('variantID', responseObject.variantID);
            grunt.option('variantSecret', responseObject.secret);

            util.saveCookies(cookies);
            grunt.log.writelns(cookies);
            done(true);
        });

    });

    grunt.registerTask('registeriOSDevice', 'Register iOS device [OSX only]', function() {
        var taskOptions = this.options({
            hostname: 'localhost',
            port: 8080,
            appiumPort: 4723,
            alias: 'Sample alias',
            targetApp: resourcesDirectory + '/target.app',
            targetIpa: resourcesDirectory + '/target.ipa',
            variantID: null,
            variantSecret: null
        });

        util.findOption(taskOptions, 'hostname');
        util.findOption(taskOptions, 'port');
        util.findOption(taskOptions, 'appiumPort');
        util.findOption(taskOptions, 'targetApp');
        util.findOption(taskOptions, 'targetIpa');
        util.findOption(taskOptions, 'variantID');
        util.findOption(taskOptions, 'variantSecret');

        var done = this.async();
        var testUtils = require('./testUtils.js');
        testUtils.aerogear = require('./testUtils.aerogear.js');
        testUtils.aerogear.push = require('./testUtils.aerogear.push.js');

        appiumServerInstance = testUtils.startAppium({
            args: {
                app: taskOptions.targetApp,
                address: taskOptions.hostname,
                port: taskOptions.appiumPort,
                nodeconfig: null,
                udid: 'c90a175ae4f25da998cd390879c1609b8f6e5a6e',
                launch: true,
                ipa: taskOptions.targetIpa,
                bundleId: 'org.jboss.aerogear.pushtest.aerogear-push-test-ios'
            },
            readyCallback: function() {

                grunt.log.writeln('Appium ready!');
                var webDriver = testUtils.createiOSWDBrowser(taskOptions.targetApp, taskOptions.hostname, taskOptions.appiumPort, { device: 'c90a175ae4f25da998cd390879c1609b8f6e5a6e'});
                //var browserChain = browser.chain();

                var elements = null;
                var buttons = null;

                // TODO do we need it?
                webDriver.promise = webDriver.promise
                    .then(function() {
                        return webDriver.browser.elementsByTagName('textField');
                    })
                    .then(function(els) {
                        elements = els;
                        return webDriver.browser.type(elements[0], 'http://' + taskOptions.hostname + ':' + taskOptions.port + '/ag-push/');
                    })
                    .then(function() {
                        return webDriver.browser.type(elements[1], taskOptions.variantID);
                    })
                    .then(function() {
                        return webDriver.browser.type(elements[2], taskOptions.variantSecret + '\n');
                    })
                    .then(function() {
                        return webDriver.browser.elementsByTagName('button');
                    })
                    .then(function(btns) {
                        buttons = btns;
                        return webDriver.browser.clickElement(btns[0]);
                    });

                webDriver.promise
                    .then(function() {
                        var isRegistered = function() {
                            return webDriver.promise
                                .then(function() {
                                    return webDriver.browser.elementsByTagName('button');
                                })
                                .then(function(btns) {
                                    if(btns) {
                                        return btns[0].text();
                                    } else {
                                        // some weird shit going on there
                                    }
                                })
                                .then(function(buttonText) {
                                    if(buttonText == 'Registered') {
                                        done(true);
                                        return true;
                                    } else {
                                        grunt.log.writeln(buttonText);
                                        setInterval(isRegistered, 200);
                                        return false;
                                    }
                                });
                        };

                        return isRegistered();
                    });

                grunt.option('webDriverInstance', webDriver);
                /*
                browserChain
                    .elementsByTagName('textfield', function(err, els) {
                        if(els) {
                            browser.next('type', els[2], taskOptions.variantSecret + '\n', function(err) {

                            });
                            browser.next('type', els[1], taskOptions.variantID, function(err) {

                            });
                            browser.next('type', els[0], 'http://' + taskOptions.hostname + ':' + taskOptions.port + '/ag-push/', function(err) {

                            }); // TODO make them chain?
                        }
                    })
                    .elementsByTagName('button', function(err, els) {
                        if(els)  {
                            browser.next('clickElement', els[0], function(err){
                                browser.waitForCondition(function() {
                                    return els[0].getText() == 'Registered';
                                }, function(err, boolean) {
                                    if(!err && !boolean) {
                                        return;
                                    }
                                    grunt.log.writelns(err);
                                    grunt.log.writeln(boolean);
                                    done(!err && boolean);
                                });
                            });
                        }
                    });*/
            },
            doneCallback: function() {

                grunt.log.writeln('Appium done');

            }
        });

    });

    grunt.registerTask('broadcastMessage', 'Broadcast push message', function() {
        var taskOptions = this.options({
            hostname: 'localhost', // set by 'runJBossAS' task
            port: 8080,
            pushApplicationID: null, // set by 'registerApp' task
            masterSecret: null, // set by 'registerApp' task
            data: {
                key: 'value',
                alert: 'HELLO!',
                sound: 'default',
                badge: 7,
                'simple-push': 'version=123'
            },
            verificationData: {
                'abcd': 'efgh',
                '1234': '4567',
                'a1b2c3d4': 'e5f6g7h8'
            }
        });

        util.findOption(taskOptions, 'hostname');
        util.findOption(taskOptions, 'port');
        util.findOption(taskOptions, 'pushApplicationID');
        util.findOption(taskOptions, 'masterSecret');
        util.findOption(taskOptions, 'messageData', 'data');
        util.findOption(taskOptions, 'verificationData');

        if(!grunt.option('verificationData')) {
            grunt.option('verificationData', taskOptions.verificationData);
        }

        var done = this.async();
        var options = {
            hostname: taskOptions.hostname,
            port: taskOptions.port,
            path: '/ag-push/rest/sender/broadcast',
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Basic ' + new Buffer(taskOptions.pushApplicationID + ':' + taskOptions.masterSecret).toString('base64')
            }
        };

        var data = { };

        for(var key in taskOptions.data) {
            data[key] = taskOptions.data[key];
        }

        for(var key in taskOptions.verificationData) {
            data[key] = taskOptions.verificationData[key];
        }

        var sendBroadcast = function() {
            util.request.withJsonData(options, data, function(response, cookies, responseData) {
                if(response != null) {
                    grunt.log.writelns(responseData);
                    grunt.log.writelns(cookies); // TODO check status code!
                    done(true);
                } else {
                    done(responseData);
                }
            });
        }

        var webDriver = grunt.option('webDriverInstance');

        webDriver.promise
            .then(function() {
                return webDriver.browser.elementsByTagName('text');
            })
            .then(function(texts) {
                return texts[1].text();
            })
            .then(function(text) {
                grunt.option('currentMessageText', text);

                sendBroadcast();
                return true;
            });

    });

    grunt.registerTask('verifyBroadcast', 'Verify broadcast message', function() {
        var taskOptions = this.options({
            verificationData: null,
            currentMessageText: null
        });

        util.findOption(taskOptions, 'verificationData');
        util.findOption(taskOptions, 'currentMessageText');

        var done = this.async();

        var webDriver = grunt.option('webDriverInstance');

        webDriver.promise
            .then(function() {
                var messageDelivered = function() {
                    return webDriver.promise
                        .then(function() {
                            return webDriver.browser.elementsByTagName('text');
                        })
                        .then(function(texts) {
                            if(texts) {
                                return texts[1].text();
                            } else {
                                // some weird shit going on there
                            }
                        })
                        .then(function(text) {
                            if(text == taskOptions.currentMessageText) {
                                setInterval(messageDelivered, 200);
                                return false;
                            }
                            var messageText;
                            try {
                                messageText = JSON.parse(text);
                            } catch(e) {
                                grunt.log.writelns(e);
                                done(e);
                                return false;
                            }
                            for(var key in taskOptions.verificationData) {
                                var expectedValue = taskOptions.verificationData[key];
                                var receivedValue = messageText[key];

                                if(!receivedValue) {
                                    grunt.log.writeln('Missing value for key "' + key + '"');
                                    done(false);
                                    return true;
                                } else if(expectedValue != receivedValue) {
                                    grunt.log.writeln('Value for key "' + key + '" incorrect. Expected: "' + expectedValue + '", received: "' + receivedValue + '".');
                                    done(false);
                                    return false;
                                }
                            }

                            grunt.log.writeln('Verification completed.');
                            done(true);
                            return true;
                        });
                };

                return messageDelivered();
            });

    });

    grunt.registerTask('finalCleanup', 'Clean up used resources and shutdown JBoss AS', function() {
        cleanup();
    });

    grunt.loadNpmTasks('grunt-git');

}