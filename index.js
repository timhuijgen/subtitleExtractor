#! /usr/bin/env node
// The above line will work in most cases, if not use
// `which node` to find the correct path to your node interpreter
// Example:
// #! /home/pi/.nvm/versions/node/v7.10.0/bin/node

'use strict';

const child_process = require("child_process");
const path          = require("path");
const fs            = require("fs");

const settings = {
    pathToFile: process.env.sonarr_episodefile_path,
    language: 'eng'
};


/**
 * Get command line arguments
 * @returns {string|boolean}
 */
function getInputFromArgv(arg) {
    let match = process.argv.find(argument => {
        return argument.substr(0, arg.length + 3) === `--${arg}=`;
    });

    if(match) {
        return match.substr(arg.length + 3);
    }
    return false;
}


function recursiveProcessDirectory(directory, files = []) {
    (getDirectoryList(directory) || []).forEach(item => {
        let itemPath = directory + '/' + item;
        if(isMkv(itemPath)) {
            files.push(itemPath);
        } else if(isDirectory(itemPath)) {
            recursiveProcessDirectory(itemPath, files);
        }
    });

    return files;
}

function getDirectoryList(directory) {
    return fs.readdirSync(directory);
}

function isMkv(filePath) {
    return isFile(filePath) && path.extname(filePath) === '.mkv';
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch(err) {
        return false;
    }
}

function isDirectory(filePath) {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch(err) {
        return false;
    }
}

function runExtractor(filePath, language = 'eng') {
    child_process.fork('./SubtitleExtractor',
        ['--file=' + filePath, '--language=' + language],
        {stdio: 'inherit'}
    );
}


/**
 * Initialize variables
 */
let filePath = getInputFromArgv('file')
    || getInputFromArgv('dir');

let language = getInputFromArgv('language')
    || settings.language;

/**
 * Run with defauls if no command line input
 * Run with the --file if its set and a valid file
 * Run multiple if a --dir is supplied
 */
if(filePath === false) {
    runExtractor(settings.pathToFile, language);
}
else if(isFile(filePath)) {
    runExtractor(filePath, language);
}
else if(isDirectory(filePath)) {
    recursiveProcessDirectory(filePath)
        .forEach(file => {
            runExtractor(file, language);
        });
}