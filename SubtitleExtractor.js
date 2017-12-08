#! /usr/bin/env node
// The above line will work in most cases, if not use
// `which node` to find the correct path to your node interpreter
// Example:
// #! /home/pi/.nvm/versions/node/v7.10.0/bin/node

'use strict';

const child_process = require("child_process");
const path          = require("path");
const fs            = require("fs");

const config = {
    replace: [
        '{(.*)}'
    ],
    fallbackLanguage: 'eng'
};

const commands = {
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe'
};

class SubtitleExtractor {

    constructor(filePath, language) {
        this.log(`SubtitleExtractor :: Constructing :: [${language}] ${filePath}`);
        this.language = language || config.fallbackLanguage;
        this.filePath = filePath;

        try {
            this.validateEpisodeFilePath(filePath);
            this.fileName   = this.getEpisodeFilename(filePath);
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
        } catch(err) {
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
     * Extracts subtitle track info from file
     * @returns {Promise<object[]>} [{language: string, index: number}]
     */
    getSubtitleTrackInfo() {
        return new Promise((resolve, reject) => {
            child_process.exec(`${commands.ffprobe} -i "${this.filePath}"`,
                {},
                (err, stdout, stderr) => {
                    if(err) reject(err);
                    // FFMPEG likes to write output to stderr so use that if stdout doesn't have anything
                    let trackInfo = (stdout || stderr)
                        .split('\n')
                        .filter(line => {
                            return line.indexOf('Subtitle') > -1
                        })
                        .map(this.extractTrackDataFromLine);

                    this.log('Found track info ' + JSON.stringify(trackInfo));

                    resolve(trackInfo);
                }
            );
        });
    }

    /**
     * Select the correct track by language or the first one
     * @param trackInfo
     * @returns {Number} index
     */
    selectLanguage(trackInfo) {
        let match = trackInfo.find(track => {
            return track.language === this.language;
        });

        if(match) return match.index;

        if(!trackInfo[0])
            throw new Error('No valid subtitle tracks are supplied');

        this.log(`Warning: Language ${this.language} is preferred but not found. Using ${trackInfo[0].language} instead.`);

        return trackInfo[0].index;
    }

    /**
     * Extract the track index from the video file and write to srt
     * ffmpeg will automatically encode it to subrip(srt) format
     * @param index
     * @returns {Promise<string>} subtitleTrackName
     */
    extractTrack(index) {
        return new Promise((resolve, reject) => {
            child_process.exec(`${commands.ffmpeg} -y -i "${this.filePath}" -map 0:${index} "${this.workingDir}/${this.getSubtitleTrackname()}"`,
                {}, (err, stdout, stderr) => {
                    if(err) reject(err);

                    this.log('Extracted track to srt file');

                    resolve(this.getSubtitleTrackname());
                });
        });
    }

    /**
     * Returns the ID from track or false
     * @param {string} line
     * @returns {object}
     */
    extractTrackDataFromLine(line) {
        const regex = /#[0-9]{1,}:([0-9]{1,})\(([a-zA-Z]{2,})\)/i;
        let result = regex.exec(line);
        return {
            index: result[1],
            language: result[2]
        };
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
     * chmod the track file
     * @param trackFilename
     * @returns {Promise<string>} trackFilename
     */
    chmodTrack(trackFilename) {
        return new Promise((resolve, reject) => {
            child_process.exec(`chmod g+rw "${this.workingDir}/${trackFilename}"`,
                {},
                (err, stdout) => {
                    if(err) reject(err);

                    this.log(`chmod g+rw on track ${trackFilename} done`);

                    resolve(trackFilename);
                }
            );
        });
    }

    /**
     * Read trackFile and removes unsupported characters, and writes it back
     * @param trackFilename
     * @returns {Promise<string>} trackFilename
     */
    removeUnsupportedCharacters(trackFilename) {
        return new Promise((resolve, reject) => {
            fs.readFile(this.workingDir + '/' + trackFilename, 'utf8', (readErr, contents) => {
                if(readErr) reject(readErr);
                contents = this.removeKeysFromString(config.replace, contents);

                this.log(`Read file ${trackFilename} and replaced some data`);

                fs.writeFile(this.workingDir + '/' + trackFilename, contents, 'utf8', writeErr => {
                    if(writeErr) reject(writeErr);

                    this.log(`Wrote new contents to ${trackFilename}`);

                    resolve(trackFilename);
                })
            });
        });
    }

    /**
     * Replace all items in keys array with nothing
     * @param keys
     * @param string
     * @returns {string}
     */
    removeKeysFromString(keys, string) {
        keys.forEach(item => {
            let replace = new RegExp(item, 'g');
            string = string.replace(replace, '');
        });
        return string;
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
        this.getSubtitleTrackInfo()
            .then(this.selectLanguage.bind(this))
            .then(this.extractTrack.bind(this))
            .then(this.chmodTrack.bind(this))
            .then(this.removeUnsupportedCharacters.bind(this))
            .catch((err) => {
                this.log('Aborted: ' + err.message || JSON.stringify(err));
            });
    }
}

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


new SubtitleExtractor(getInputFromArgv('file'), getInputFromArgv('language'))
    .run();