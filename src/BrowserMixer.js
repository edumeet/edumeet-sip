import Logger from './Logger';

const logger = new Logger('BrowserMixer');

export default class BrowserMixer {
	constructor({ mixWidth = 640, mixHeight = 480, frameRate = 12 } = {}) {
		logger.debug('constructor()');

		this._videos = {};

		this._mixtrack = null;

		this._frameRate = frameRate;

		this._animationId = null;

		this._mixWidth = mixWidth;
		this._mixHeight = mixHeight;

		this._horzCount = 1;
		this._vertCount = 1;

		this._hideRemoteVideoFlag = true;

		this._audioContext = null;

		this._inputNodes = [];

		this._mixAllOutputNode = null;

		this._audioMixAllStream = null;

		this._initCanvas();

		this._start();
	}

	_initCanvas() {
		this._mixCanvas = document.createElement('canvas');
		this._mixCanvas.setAttribute('width', `${this._mixWidth}px`);
		this._mixCanvas.setAttribute('height', `${this._mixHeight}px`);

		document.body.appendChild(this._mixCanvas);

		this._ctxMix = this._mixCanvas.getContext('2d', { alpha: false });
		this._ctxMix.fillStyle = 'rgb(0, 0, 0)';
	}

	_start() {
		logger.debug('start()');

		this._audioContext = new AudioContext();

		this._mixStream = this._mixCanvas.captureStream(this._frameRate);

		this._mixAllOutputNode = this._audioContext.createMediaStreamDestination();
		this._audioMixAllStream = this._mixAllOutputNode.stream;
		this._mixStream.addTrack(this._audioMixAllStream.getAudioTracks()[0]);

		/* 
		this._mixVideo = document.createElement('video');
		this._mixVideo.setAttribute('width', `${this._mixWidth}px`);
		this._mixVideo.setAttribute('height', `${this._mixHeight}px`);

		this._mixVideo.srcObject = this._mixStream;
		document.body.appendChild(this._mixVideo);
		this._mixVideo.volume = 0;
		this._mixVideo.play();
		*/

		this._animationId = window.requestAnimationFrame(this._drawMixCanvas);
	}

	close() {
		logger.debug('stop()');

		if (this._mixAllOutputNode) {
			this._audioMixAllStream = null;
			this._mixAllOutputNode = null;
		}

		if (this._mixStream) {
			this._stopStream();
			this._mixStream = null;
		}

		if (this._animationId) {
			window.cancelAnimationFrame(this._animationId);
			this._animationId = null;
		}

		for (const key in this._videos) {
			if (Object.prototype.hasOwnProperty.call(this._videos, key)) {
				document.body.removeChild(this._videos[key]);
			}
		}

		// document.body.removeChild(this._mixVideo);

		document.body.removeChild(this._mixCanvas);
	}

	_stopStream() {
		logger.debug('_stopStream()');

		const tracks = this._mixStream.getTracks();

		if (!tracks) {
			return;
		}

		for (const track of tracks) {
			track.stop();
		}
	}

	getMixStream() {
		logger.debug('getMixStream() [stream:"%o"]', this._mixStream.getTracks());

		return this._mixStream;
	}

	_clearMixCanvas() {
		// TODO Try different ways to clear the canvas (clearRect() vs. fillRect() vs. resizing the canvas).

		this._ctxMix.clearRect(0, 0, this._mixWidth, this._mixHeight);
	}

	_drawMixCanvas = () => {
		window.requestAnimationFrame(this._drawMixCanvas);

		let i = 0;

		for (const key in this._videos) {
			if (Object.prototype.hasOwnProperty.call(this._videos, key)) {
				this._drawVideoGrid(key, i);

				i++;
			}
		}
	};

	_drawVideoGrid(key, index) {
		const gridWidth = this._mixWidth / this._horzCount;
		const gridHeight = this._mixHeight / this._vertCount;
		const destLeft = gridWidth * (index % this._horzCount);
		const destTop = gridHeight * Math.floor(index / this._horzCount);

		this._drawVideoGridVideo(key, destLeft, destTop, gridWidth, gridHeight);
	}

	_drawVideoGridVideo(key, destLeft, destTop, gridWidth, gridHeight) {
		const video = this._videos[key];

		let gridRatio;

		if (video.videoWidth / video.videoHeight > 2) {
			gridRatio = 1.7777;
		}else{
			gridRatio = 1; // 1.333
		}

		const srcWidth = parseInt(video.videoWidth);
		const srcHeight = parseInt(video.videoHeight * gridRatio);
		const xCenter = parseInt(video.videoWidth / 2);
		const yCenter = parseInt(video.videoHeight / 2);
		const srcLeft = parseInt(xCenter - (srcWidth / 2));
		const srcTop = parseInt(yCenter - (srcHeight / 2));

		this._ctxMix.drawImage(video, srcLeft, srcTop, srcWidth, srcHeight,
			destLeft, destTop, gridWidth, gridHeight
		);
	}

	_calculateGrid() {
		this._horzCount = 1;
		this._vertCount = 1;
		const videoCount = Object.keys(this._videos).length;

		if (videoCount > 36) {
			this._horzCount = 7;
			this._vertCount = 7;
		}
		else if (videoCount > 25) {
			this._horzCount = 6;
			this._vertCount = 6;
		}
		else if (videoCount > 16) {
			this._horzCount = 5;
			this._vertCount = 5;
		}
		else if (videoCount > 9) {
			this._horzCount = 4;
			this._vertCount = 4;
		}
		else if (videoCount > 4) {
			this._horzCount = 3;
			this._vertCount = 3;
		}
		else if (videoCount > 1) {
			this._horzCount = 2;
			this._vertCount = 2;
		}
	}

	addVideo(track) {
		logger.debug('addVideo() [track:"%s"]', track.id);

		const videoId = `video_${track.id}`;
		const existRemoteVideo = document.getElementById(videoId);

		if (existRemoteVideo) {
			logger.error('addVideo() | video already added');

			return;
		}

		const video = document.createElement('video');

		video.id = `video_${track.id}`;
		video.style.border = '1px solid black';

		if (this._hideRemoteVideoFlag) {
			video.style.display = 'none';
		}

		video.addEventListener('playing', () => {
			this._videos[track.id] = video;

			this._calculateGrid();

			this._clearMixCanvas();
		}, true);
		video.addEventListener('resize', () => {
			this._clearMixCanvas();
		}, true);
		const stream = new MediaStream();

		stream.addTrack(track);

		video.srcObject = stream;
		document.body.appendChild(video);
		video.volume = 0;
		video.play();
	}

	removeVideo(track) {
		const video = this._videos[track.id];

		if (!video)
			return;

		video.pause();
		video.srcObject = null;
		document.body.removeChild(video);

		delete this._videos[track.id];

		this._calculateGrid();

		this._clearMixCanvas();
	}

	removeAllVideo() {
		for (const key in this._videos) {
			if (Object.prototype.hasOwnProperty.call(this._videos, key)) {
				const video = this._videos[key];

				video.pause();
				video.srcObject = null;
				document.body.removeChild(video);
			}
		}

		this._videos = {};

		this._calculateGrid();

		this._clearMixCanvas();
	}

	addAudio(track) {
		logger.debug('addAudio() [track:"%s"]', track.id);

		const existingNode = this._inputNodes[track.id];

		if (existingNode)
			return;

		const audio = document.createElement('audio');

		audio.muted = 'muted';
		audio.autoplay = true;

		audio.id = `audio_${track.id}`;

		if (this._hideRemoteVideoFlag) {
			audio.style.display = 'none';
		}

		const stream = new MediaStream();

		stream.addTrack(track);

		audio.srcObject = stream;
		document.body.appendChild(audio);
		audio.volume = 0;
		audio.play();

		const node = this._audioContext.createMediaStreamSource(stream);

		this._inputNodes[track.id] = node;

		node.connect(this._mixAllOutputNode);
	}

	removeAudio(track) {
		const node = this._inputNodes[track.id];

		if (!node)
			return;

		const audio = document.getElementById(`audio_${track.id}`);

		audio.pause();
		audio.srcObject = null;
		document.body.removeChild(audio);

		node.disconnect(this._mixAllOutputNode);

		delete this._inputNodes[track.id];
	}

	removeAllAudio() {
		for (const key in this._inputNodes) {
			if (Object.prototype.hasOwnProperty.call(this._inputNodes, key)) {
				const node = this._inputNodes[key];

				node.disconnect(this._mixAllOutputNode);
			}
		}

		this._inputNodes = {};
	}
}
