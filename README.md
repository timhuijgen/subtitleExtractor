# subtitleExtractor
Extract .SSA (SubStationAlpha) subtitles from .mkv and convert them to .SRT format using FFmpeg.

Usable as post processing script for sonarr

### Install
Clone repository

Install FFmpeg `sudo apt-get install ffmpeg`

FFmpeg needs to have ssa/ass codecs and srt codec/encoder

For more info on ffmpeg look on the website for instructions: https://www.ffmpeg.org/. 

### Run
- Via Node `node index.js`
- Via Bash `./index.js`

### Setup
Update the settings.pathToFile with the full filepath you want processed. The script is currently setup for sonarr. `process.env.sonarr_episodefile_path`

Options
- `./index.js --file=/path/to/my/file.mkv`
- `./index.js --dir=/path/to/my/dir/`
- `./index.js --language=eng --file=/path/to/my/file.mkv`

