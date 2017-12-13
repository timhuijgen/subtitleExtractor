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
        this.language = language || config.fallbackLanguage;
        this.filePath = filePath;
        this.log(`SubtitleExtractor :: Constructing :: [${language}] ${filePath}`);

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
                        .map(this.extractTrackDataFromLine)
                        .filter(info => {
                            return info !== false;
                        });

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

            let start = new Date(),
                process = child_process.spawn(commands.ffmpeg,
                [
                    // Force overwrite existing files
                    '-y',
                    // Specify input file
                    '-i', this.filePath,
                    // Select the correct stream
                    '-map', `0:${index}`,
                    // Output file
                    `${this.workingDir}/${this.getSubtitleTrackname()}`
                ]);

            process.on('error', reject);
            process.on('close', code => {
                const elapsed = parseFloat((new Date() - start) / 1000).toFixed(2);
                this.log(`Extracted and encoded ${this.getSubtitleTrackname()} in ${elapsed}s`);
                resolve(this.getSubtitleTrackname());
            });

            this.progress(process, start);

            this.log(`Starting extraction of stream ${index} and conversion process`);
        });
    }

    /**
     * Watch the stderr for output data and try to parse progress info from it
     *
     * @param process
     * @param start
     */
    progress(process, start) {
        let blob = '',
            duration;

        const currentTimeRegex = /size=(?:.*)time=([0-9]{2}):([0-9]{2}):([0-9]{2})/i;
        const durationRegex = /duration\s*:\s*([0-9]{2}):([0-9]{2}):([0-9]{2})/i;

        process.stderr.on('data', data => {
            blob += data.toString('utf8');

            const durationResult = durationRegex.exec(blob);
            if(!duration && durationResult && durationResult[3]) {

                duration =
                    (durationResult[1] * 3600)
                    + (durationResult[2] * 60)
                    + (durationResult[3] * 1);
            }

            const lineOnlyTime = currentTimeRegex.exec(data);
            if(duration && lineOnlyTime && lineOnlyTime[3]) {
                let progress =
                        (lineOnlyTime[1] * 3600)
                        + (lineOnlyTime[2] * 60)
                        + (lineOnlyTime[3] * 1),
                    now = new Date(),
                    sec = parseFloat((now - start) / 1000).toFixed(2),
                    progressPercent = parseFloat(progress / duration * 100).toFixed(2);

                // Log directly to prevent file logs of progress
                console.log(`Progress: ${progressPercent}% in ${sec}s`);
            }

        });
    }

    /**
     * Returns the track index and language
     *
     * Matches "Stream #0:2(eng): Subtitle: ass (default)"
     * And extracts the stream index (2) and language (optional) eng
     *
     * @param {string} line
     * @returns {object|boolean}
     */
    extractTrackDataFromLine(line) {
        const regex = /#[0-9]{1,}:([0-9]{1,})(?:\(([a-zA-Z]{2,})\))?/i;
        let result = regex.exec(line);

        if(result && result[1]) {
            return {
                index: result[1],
                language: result[2] || 'undefined'
            };
        }
        return false;
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
                (err, _) => {
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