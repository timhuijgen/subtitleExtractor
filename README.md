# subtitleExtractor
Extract .srt subtitles from mkv files using mkvToolNix

Usable as post processing script for sonarr

### Install
Clone repository, and in the root do an `npm install`
[https://mkvtoolnix.download/downloads.html](erwg)

Install MKVToolNix `sudo apt-get install mkvtoolnix` 

For systems that do not support the apt-get method look on the website for instructions: https://mkvtoolnix.download/downloads.html

### Run
- Via Node `node index.js`
- Via Bash `./index.js`
- Via NPM `npm run main`

### Setup
Update the settings.pathToFile to the path of the file you want processed. The script is currently setup for sonarr. `process.env.sonarr_episodefile_path`
Optional file argument `./index.js --file="/path/to/my/file.mkv"`

