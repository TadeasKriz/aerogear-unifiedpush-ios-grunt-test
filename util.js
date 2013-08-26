
var grunt = require('grunt');
var http = require('http');
var fs = require('fs');

exports.getFileName = function(file) {
    var path = require('path');

    return path.basename(file);
};

exports.saveCookies = function(cookies) {
    grunt.option('cookies', cookies);
}

exports.loadCookies = function() {
    return grunt.option('cookies');
}

exports.findOption = function(options, optionName, propertyName) {
    propertyName = propertyName || optionName;

    options[propertyName] = grunt.option(optionName) || options[propertyName];
};

exports.findJsonOption = function(options, optionName, propertyName) {
    propertyName = propertyName || optionName;

    options[propertyName] = JSON.parse(grunt.option(optionName)) || options[propertyName];
}

exports.downloadFile = function(source, destination, callback) {
    grunt.log.write('Initializing download ... ');
    var file = fs.createWriteStream(destination);
    var request = http.get(source, function(response) {
        grunt.log.ok();
        var size = response.headers['content-length'];
        var downloaded = 0;
        var downloadedSinceDisplay = 0;
        var interval = setInterval(function() {
            var percentage = 100 * downloaded / size;
            var speed = exports.readableDownloadSpeed(downloadedSinceDisplay);
            downloadedSinceDisplay = 0;
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            grunt.log.write('Downloaded: ' + percentage.toFixed(1) + '% | ' + speed);
        }, 1000);

        response.on('data', function(chunk) {
            downloaded += chunk.length;
            downloadedSinceDisplay += chunk.length;
        });

        file.on('finish', function() {
            clearInterval(interval);
            file.close();
            grunt.log.writeln();
            grunt.log.writeln('File downloaded');
            callback();
        });
        response.pipe(file);
    });
};

exports.readableDownloadSpeed = function(size) {
    var units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s', 'EB/s', 'ZB/s', 'YB/s'];
    var i = 0;
    while(size >= 1024) {
        size /= 1024;
        ++i;
    }
    return size.toFixed(1) + ' ' + units[i];
};

exports.request = { };

exports.request.withJsonData = function(options, data, callback) {
    options.headers['Content-type'] = 'application/json';

    var request = http.request(options, function(response) {
        console.log('STATUS: ' + response.statusCode);
        console.log('HEADERS: ' + JSON.stringify(response.headers));
        var cookies = options.headers['Cookie'];
        if(response.headers['set-cookie']) {
            var length = response.headers['set-cookie'].length;
            cookies = [];
            if(length > 0) {
                for(var i = 0; i < length; i++) {
                    cookies.push(response.headers['set-cookie'][i]);
                }
            }
        }
        var responseData = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            responseData += chunk;
        });
        response.on('end', function() {
            callback(response, cookies, responseData);
        });
    });

    request.on('error', function(e) {
        console.log('problem with request: ' + e.message);
        callback(null, null, e);
    });

    request.write(JSON.stringify(data));
    request.end();
};

exports.request.fileUploadWrapper = function(name, file) {
    var data = {
        name: name,
        filename: exports.getFileName(file),
        fileStream: fs.createReadStream(file, { bufferSize: 4 * 1024 })
    };


    return data;
};

exports.request.fieldValueWrapper = function(name, value) {
    var data = {
        name: name,
        data: value
    };

    return data;
};

exports.request.withMultipartData = function(options, data, callback) {
    var boundaryKey = "--------" + Math.random().toString(16); // random string
    options.headers['Content-type'] = 'multipart/form-data; boundary="' + boundaryKey + '"';
    grunt.log.writelns(options);

    //var request = fs.createWriteStream('request.log');

    var request = http.request(options, function(response) {
        console.log('STATUS: ' + response.statusCode);
        console.log('HEADERS: ' + JSON.stringify(response.headers));
        var cookies = options.headers['Cookie'];
        if(response.headers['set-cookie']) {
            var length = response.headers['set-cookie'].length;
            cookies = [];
            if(length > 0) {
                for(var i = 0; i < length; i++) {
                    cookies.push(response.headers['set-cookie'][i]);
                }
            }
        }
        var responseData = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            responseData += chunk;
        });
        response.on('end', function() {
            callback(response, cookies, responseData);
        });
    });

    var writeSeparator = function() {
        request.write('--' + boundaryKey + '\r\n');
    };

    var endRequest = function() {
        request.end('--' + boundaryKey + '--');
    };

    var writeData = function(currentDataWrapper) {
        if(currentDataWrapper >= data.length){
            endRequest();
            return;
        }
        var dataWrapper = data[currentDataWrapper];
        if(dataWrapper.fileStream) {
            writeSeparator();
            request.write(
                'Content-Type: application/octet-stream\r\n' +
                'Content-Disposition: form-data; name="' + dataWrapper.name + '"; filename="' + dataWrapper.filename + '"\r\n' +
                'Content-Transfer-Encoding: binary\r\n\r\n');
            dataWrapper.fileStream
                .on('end', function() {
                    request.write('\r\n');
                    writeData(currentDataWrapper + 1);
                })
                .pipe(request, { end: false });
        } else if(dataWrapper.data) {
            writeSeparator();
            request.write('Content-Disposition: form-data; name="' + dataWrapper.name + '"\r\n\r\n');
            request.write(dataWrapper.data);
            request.write('\r\n');

            writeData(currentDataWrapper + 1);
        } else {
            writeData(currentDataWrapper + 1);
        }
    };

    writeData(0);
};