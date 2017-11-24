#! /usr/bin/env node
// The above line will work in most cases, if not use
// `which node` to find the correct path to your node interpreter
// Example:
// #! /home/pi/.nvm/versions/node/v7.10.0/bin/node

"use strict";

const child_process = require("child_process");
const path          = require("path");
const fs            = require("fs");
const Translate     = require('languagedetect');

const settings = {
    pathToFile: process.env.sonarr_episodefile_path,
    language: 'english',
    logToFile: true,
    logToConsole: true,
};

const mkvToolNix = {
    merge: 'mkvmerge',
    extract: 'mkvextract'
    // For local testing
    // merge: '/Applications/MKVToolNix-17.0.0.app/Contents/MacOS/mkvmerge',
    // extract: '/Applications/MKVToolNix-17.0.0.app/Contents/MacOS/mkvextract'
};

class SubtitleExtractor {

    constructor(filepath, language) {
        this.log('SubtitleExtractor :: Constructing');
        this.language = language;

        // Debug the environment variables
        // this.log(process.env);

        try {
            this.validateEpisodeFilePath(filepath);
            this.fileName = this.getEpisodeFilename(filepath);
            this.validateEpisodeFileExtension(this.fileName);
        }
        catch(err) {
            this.log('Aborted: ' + err.message);
            process.exit(0);
        }
    }

    /**
     * Get the filename from full path
     * @param {string} filepath
     * @returns {string} filename
     */
    getEpisodeFilename(filepath) {
        return path.basename(filepath);
    }

    /**
     * Perform validations on the path
     * @param {string} filepath
     * @throws Error
     */
    validateEpisodeFilePath(filepath) {
        if(!filename) {
            throw new Error(`Filepath not valid: ${filepath}`);
        }
    }

    /**
     * Check for valid file extensions
     * @param {string} filename
     * @throws Error
     */
    validateEpisodeFileExtension(filename) {
        if(path.extname(filename) !== '.mkv') {
            throw new Error('File extension not valid: ' + path.extname(filename));
        }
    }

    /**
     * Extracts subtitle track IDs from file
     * @returns {Promise<number[]>} trackIDs
     */
    getSubtitleTrackIDs() {
        return new Promise((resolve, reject) => {
            child_process.exec(`${mkvToolNix.merge} -i ${this.fileName} | grep 'subtitles'`, {}, (err, stdout) => {
                if(err)
                    reject(err);
                this.log('Found subtitle tracks: ' + stdout);

                const IDs = stdout
                    .trim()
                    .split('\n')
                    .map(this.extractTrackIDFromLine)
                    // Remove array items that didn't find any valid ID
                    .filter(id => {
                        return Number(id) > -1;
                    });

                resolve(IDs);
            });
        });
    }

    /**
     * Detect the language for each track
     * @param trackFilenames
     * @returns {Promise<string>} trackFilename
     */
    detectTrackLanguages(trackFilenames) {
        const detectLanguagePromises = trackFilenames.map(this.detectTrackLanguage.bind(this));

        return Promise.all(detectLanguagePromises)
            .then(data => {
                if(data.length === 0) {
                    throw new Error('No languages detected: ' + JSON.stringify(data));
                }
                if(data.length === 1) {
                    return data[0].trackFilename;
                }
                let match = data.find(track => {
                    return track.language === this.language;
                });

                if(match !== undefined) {
                    return match.trackFilename;
                }

                return data[0].trackFilename;
            });
    }

    /**
     * Detect language for a single track
     * @param trackFilename
     * @returns {Promise<string>}
     */
    detectTrackLanguage(trackFilename) {
        return new Promise((resolve, reject) => {
            const translate = new Translate();
            fs.readFile(trackFilename, 'utf8', (err, data) => {
                if(err) reject(err);
                const results = translate
                    .detect(data, 1);

                this.log(`Detected language from track ${trackFilename}: ${results[0][0]}`);

                resolve({
                    trackFilename: trackFilename,
                    language: results[0][0]
                });
            });
        })
    }

    /**
     * @param trackIDs
     * @returns {Promise<string[]>} trackFilename[]
     */
    extractSubtitleTracks(trackIDs) {
        const extractedFilesPromises = trackIDs.map(this.extractSubtitleTrack.bind(this));

        return Promise.all(extractedFilesPromises);
    }

    /**
     * @param {number} id
     * @returns {Promise<string>} trackFilename
     */
    extractSubtitleTrack(id) {
        return new Promise((resolve, reject) => {
            child_process.exec(
                `${mkvToolNix.extract} tracks "${this.fileName}" ${id}:"${id}.track.srt" > /dev/null 2>&1`,
                {},
                err => {
                    if(err) reject(err);

                    this.log(`Extracted subtitle track ${id} to file ${id}.track.srt`);
                    resolve(`${id}.track.srt`);
                }
            );
        });
    }

    /**
     * @param trackFilename
     * @returns {Promise<void>}
     */
    updateTrackFilename(trackFilename) {
        return new Promise((resolve, reject) => {
            fs.rename(trackFilename, `${this.getSubtitleTrackname()}`, (err) => {
                if(err) reject(err);
                this.log(`Updated ${trackFilename} with new name ${this.getSubtitleTrackname()}`);
                resolve();
            });
        });
    }

    /**
     * Returns the ID from track or false
     * @param {string} track
     * @returns {number|boolean}
     */
    extractTrackIDFromLine(track) {
        const regex = /([0-9]{1,2}):/g;
        let result  = regex.exec(track);
        if(result !== null) {
            return parseInt(result[1]);
        }
        return -1;
    }

    /**
     * Return the filename with .srt as extension
     * @returns {string}
     */
    getSubtitleTrackname() {
        return [
            path.basename(this.fileName, path.extname(this.fileName)),
            '.srt'
        ].join('');
    }

    /**
     * {array} trackFilenames
     * @returns {Promise<void>}
     */
    chmodTrackFiles(trackFilenames) {
        const chmodPromises = trackFilenames.map(this.chmodTrackFile.bind(this));

        return Promise.all(chmodPromises);
    }

    /**
     * chmod the track file
     * @param trackFilename
     * @returns {Promise<string>} trackFilename
     */
    chmodTrackFile(trackFilename) {
        return new Promise((resolve, reject) => {
            child_process.exec(`chmod g+rw "${trackFilename}"`, {}, (err, stdout) => {
                if(err)
                    reject(err);
                this.log(`chmod g+rw on track ${trackFilename} done`);
                resolve(trackFilename);
            });
        });
    }

    /**
     * Log message to console & file
     * @param message
     */
    log(message) {
        if(typeof message !== 'number' && typeof message !== 'string') {
            message = JSON.stringify(message);
        }

        message = message.trim();

        if(settings.logToConsole) {
            console.log('LOG :: ' + message);
        }

        if(settings.logToFile) {
            fs.appendFileSync(
                'subtitle-extract.log',
                `${new Date().toUTCString()} - ${message} \n`,
                'utf8'
            );
        }
    }

    /**
     * Run the script
     */
    run() {
        this.getSubtitleTrackIDs()
            .then(this.extractSubtitleTracks.bind(this))
            .then(this.chmodTrackFiles.bind(this))
            .then(this.detectTrackLanguages.bind(this))
            .then(this.updateTrackFilename.bind(this))
            .catch((err) => {
                console.error('Whoops, something went wrong', err);
                this.log('Aborted: ' + err.message || JSON.stringify(err));
            });
    }
}

const subtitleExtractor = new SubtitleExtractor(settings.pathToFile, settings.language);
subtitleExtractor.run();
