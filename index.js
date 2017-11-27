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
    language: 'english'
};

const mkvToolNix = {
    merge: 'mkvmerge',
    extract: 'mkvextract'
    // For local testing
    // merge: '/Applications/MKVToolNix-17.0.0.app/Contents/MacOS/mkvmerge',
    // extract: '/Applications/MKVToolNix-17.0.0.app/Contents/MacOS/mkvextract'
};

class SubtitleExtractor {

    constructor(filePath, language) {
        this.log('SubtitleExtractor :: Constructing');
        this.language = language;
        this.filePath = filePath;

        // Debug the environment variables
        // this.log(process.env);

        try {
            this.validateEpisodeFilePath(filePath);
            this.fileName = this.getEpisodeFilename(filePath);
            this.workingDir = this.getWorkingDirectory(filePath);
            this.validateEpisodeFileExtension(this.fileName);
        }
        catch(err) {
            this.log('Aborted: ' + err.message);
            process.exit(0);
        }
    }

    /**
     * Get the fileName from full path
     * @param {string} filePath
     * @returns {string} fileName
     */
    getEpisodeFilename(filePath) {
        return path.basename(filePath);
    }

    /**
     * Perform validations on the path
     * @param {string} filePath
     * @throws Error
     */
    validateEpisodeFilePath(filePath) {
        if(!filePath) {
            throw new Error(`Filepath not valid: ${filePath}`);
        }

        try {
            fs.accessSync(filePath, fs.constants.R_OK);
        } catch (err) {
            throw new Error(`File [${filePath}] does not exists or is not readable`);
        }
    }

    /**
     * Check for valid file extensions
     * @param {string} fileName
     * @throws Error
     */
    validateEpisodeFileExtension(fileName) {
        if(path.extname(fileName) !== '.mkv') {
            throw new Error(`File extension [${path.extname(fileName)}] not valid`);
        }
    }

    /**
     * Returns directory name of path
     * @param filePath
     * @returns {string}
     */
    getWorkingDirectory(filePath) {
        return path.dirname(filePath);
    }

    /**
     * Extracts subtitle track IDs from file
     * @returns {Promise<number[]>} trackIDs
     */
    getSubtitleTrackIDs() {
        return new Promise((resolve, reject) => {
            child_process.exec(
                `${mkvToolNix.merge} -i "${this.filePath}" | grep 'subtitles'`,
                {},
                (err, stdout, stderr) => {
                    if(err) reject(err);
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
                }
            );
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
            fs.readFile(`${this.workingDir}/${trackFilename}`, 'utf8', (err, data) => {
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
                `${mkvToolNix.extract} tracks "${this.filePath}" ${id}:"${this.workingDir}/${id}.track.srt" > /dev/null 2>&1`,
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
            fs.rename(
                `${this.workingDir}/${trackFilename}`,
                `${this.workingDir}/${this.getSubtitleTrackname()}`,
                err => {
                    if(err) reject(err);
                    this.log(`Updated ${trackFilename} with new name ${this.getSubtitleTrackname()}`);
                    resolve();
                }
            );
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
     * Return the fileName with .srt as extension
     * @returns {string}
     */
    getSubtitleTrackname() {
        const baseName = path.basename(this.fileName, path.extname(this.fileName))
        return `${baseName}.srt`;
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
            child_process.exec(`chmod g+rw "${this.workingDir}/${trackFilename}"`, {}, (err, stdout) => {
                if(err)
                    reject(err);
                this.log(`chmod g+rw on track ${trackFilename} done`);
                resolve(trackFilename);
            });
        });
    }

    /**
     * Get working directory listing and remove leftover track srt files
     * @returns {Promise<void>}
     */
    cleanupLeftoverTracks() {
        return new Promise((resolve, reject) => {
            fs.readdir(this.workingDir, {}, (err, files) => {
                if(err) reject(err);
                let deleteTrackPromises = files
                    .filter(file => {
                        return file.substr(-10) === '.track.srt';
                    })
                    .map(this.deleteTrack.bind(this));

                Promise.all(deleteTrackPromises)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    /**
     * Unlink track
     * @param track
     * @returns {Promise<void>}
     */
    deleteTrack(track) {
        return new Promise((resolve, reject) => {
            fs.unlink(`${this.workingDir}/${track}`, err => {
                if(err) reject(err);
                this.log(`Removed leftover track ${track}`);
                resolve();
            })
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

        console.log(`LOG :: ${message}`);

        fs.appendFileSync(
            `${__dirname}/subtitle-extractor.log`,
            `${new Date().toUTCString()} - ${message} \n`,
            'utf8'
        );
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
            .then(this.cleanupLeftoverTracks.bind(this))
            .catch((err) => {
                console.error('Whoops, something went wrong', err);
                this.log('Aborted: ' + err.message || JSON.stringify(err));
            });
    }
}

<<<<<<< HEAD
/**
 * Get command line argument --file="filename.mkv" if its available
 * @returns {string|boolean}
 */
function getFileFromArgv() {
    let match = process.argv.find(argument => {
        return argument.substr(0, 7) === "--file=";
    });

    if(match) {
        return match.substr(7);
    }
    return false;
}

//  Priority of --file= command line arguments over settings pathToFile
const subtitleExtractor = new SubtitleExtractor(
    getFileFromArgv() || settings.pathToFile,
    settings.language
);
subtitleExtractor.run();
=======
const subtitleExtractor = new SubtitleExtractor(settings.pathToFile, settings.language);
subtitleExtractor.run();
>>>>>>> 2048528475ae0b01e67ac5a92dc048b68643448d
