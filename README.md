# subtitleExtractor
Extract .SSA (SubStationAlpha) subtitles from .mkv and convert them to .SRT format using mkvToolNix and FFmpeg.

Usable as post processing script for sonarr

### Install
Clone repository, and in the root do an `npm install`

- Install MKVToolNix `sudo apt-get install mkvtoolnix` 
- Install FFmpeg `sudo apt-get install ffmpeg`

For systems that do not support the apt-get method look on the website for instructions: https://mkvtoolnix.download/downloads.html and https://www.ffmpeg.org/ respectively. 

### Run
- Via Node `node index.js`
- Via Bash `./index.js`

### Setup
Update the settings.pathToFile with the full filepath you want processed. The script is currently setup for sonarr. `process.env.sonarr_episodefile_path`

Optional file argument `./index.js --file="/path/to/my/file.mkv"`

