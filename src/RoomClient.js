import { EventEmitter } from 'events';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import Logger from './Logger';
import Spotlights from './Spotlights';
import { getSignalingUrl } from './urlFactory';
import BrowserMixer from './BrowserMixer';

const {
	requestTimeout,
	transportOptions,
	lastN
} = window.config;

const logger = new Logger('RoomClient');

const ROOM_OPTIONS =
{
	requestTimeout   : requestTimeout,
	transportOptions : transportOptions
};

const PC_PROPRIETARY_CONSTRAINTS =
{
	optional : [ { googDscp: true } ]
};

const VIDEO_SIMULCAST_ENCODINGS =
[
	{ scaleResolutionDownBy: 4 },
	// { scaleResolutionDownBy: 2 },
	{ scaleResolutionDownBy: 1 }
];

const insertableStreamsSupported = Boolean(RTCRtpSender.prototype.createEncodedStreams);

// Used for VP9 webcam video.
const VIDEO_KSVC_ENCODINGS =
[
	{ scalabilityMode: 'S3T3_KEY' }
];


const DEFAULT_NETWORK_PRIORITIES =
{
	audio            : 'high',
	mainVideo        : 'high',
	additionalVideos : 'medium',
	screenShare      : 'medium'
};


/**
 * Validates the simulcast `encodings` array extracting the resolution scalings
 * array.
 * ref. https://www.w3.org/TR/webrtc/#rtp-media-api
 * 
 * @param {*} encodings
 * @returns the resolution scalings array
 */
 function getResolutionScalings(encodings)
 {
	 const resolutionScalings = [];
 
	 // SVC encodings
	 if (encodings.length === 1)
	 {
		 const { spatialLayers } =
			 mediasoupClient.parseScalabilityMode(encodings[0].scalabilityMode);
 
		 for (let i=0; i < spatialLayers; i++)
		 {
			 resolutionScalings.push(2 ** (spatialLayers - i - 1));
		 }
 
		 return resolutionScalings;
	 }
 
	 // Simulcast encodings
	 let scaleResolutionDownByDefined = false;
 
	 encodings.forEach((encoding) =>
	 {
		 if (encoding.scaleResolutionDownBy !== undefined)
		 {
			 // at least one scaleResolutionDownBy is defined
			 scaleResolutionDownByDefined = true;
			 // scaleResolutionDownBy must be >= 1.0
			 resolutionScalings.push(Math.max(1.0, encoding.scaleResolutionDownBy));
		 }
		 else
		 {
			 // If encodings contains any encoding whose scaleResolutionDownBy
			 // attribute is defined, set any undefined scaleResolutionDownBy
			 // of the other encodings to 1.0.
			 resolutionScalings.push(1.0);
		 }
	 });
 
	 // If the scaleResolutionDownBy attribues of sendEncodings are
	 // still undefined, initialize each encoding's scaleResolutionDownBy
	 // to 2^(length of sendEncodings - encoding index - 1).
	 if (!scaleResolutionDownByDefined)
	 {
		 encodings.forEach((encoding, index) =>
		 {
			 resolutionScalings[index] = 2 ** (encodings.length - index - 1);
		 });
	 }
 
	 return resolutionScalings;
 }
 
export default class RoomClient extends EventEmitter
{
	constructor({ roomId, peerId })
	{
		logger.debug(
			'constructor() [roomId: "%s", peerId: "%s"]',
			roomId, peerId);
		super();

		this._signalingUrl = getSignalingUrl(peerId, roomId);

		// Closed flag.
		this._closed = false;

		this._joined = false;

		// My peer name.
		this._peerId = peerId;

		// Socket.io peer connection
		this._signalingSocket = null;

		// The room ID
		this._roomId = roomId;

		// Turn servers to use
		this._turnServers = null;

		// mediasoup-client Device instance.
		// @type {mediasoupClient.Device}
		this._mediasoupDevice = null;

		this._maxSpotlights = lastN;

		// Manager of spotlight
		this._spotlights = null;

		// Transport for sending.
		this._sendTransport = null;

		// Transport for receiving.
		this._recvTransport = null;

		// Local mic mediasoup Producer.
		this._audioProducer = null;

		// Local webcam mediasoup Producer.
		this._videoProducer = null;

		// mediasoup Consumers.
		// @type {Map<String, mediasoupClient.Consumer>}
		this._consumers = new Map();

		this._browserMixer = new BrowserMixer({ mixWidth: 640, mixHeight: 480 });

		this.join();
	}

	close()
	{
		if (this._closed)
			return;

		this._closed = true;

		logger.debug('close()');

		this._sipSession.terminate();

		this._sipSession = null;

		this._signalingSocket.close();

		// Close mediasoup Transports.
		if (this._sendTransport)
			this._sendTransport.close();

		if (this._recvTransport)
			this._recvTransport.close();

		this._browserMixer.close();

		this.emit('closed');
	}

	timeoutCallback(callback)
	{
		let called = false;

		const interval = setTimeout(
			() =>
			{
				if (called)
					return;
				called = true;
				callback(new Error('Request timeout.'));
			},
			ROOM_OPTIONS.requestTimeout
		);

		return (...args) =>
		{
			if (called)
				return;
			called = true;
			clearTimeout(interval);

			callback(...args);
		};
	}

	sendRequest(method, data)
	{
		return new Promise((resolve, reject) =>
		{
			if (!this._signalingSocket)
			{
				reject('No socket connection.');
			}
			else
			{
				this._signalingSocket.emit(
					'request',
					{ method, data },
					this.timeoutCallback((err, response) =>
					{
						if (err)
						{
							reject(err);
						}
						else
						{
							resolve(response);
						}
					})
				);
			}
		});
	}

	getMixStream()
	{
		return this._browserMixer.getMixStream();
	}

	incomingSession(sipSession)
	{
		logger.debug('incomingSession() [sipSession:"%o"]', sipSession);

		this._sipSession = sipSession;

		sipSession.on('trackAdded', () =>
		{
			logger.debug('SipSession trackAdded [sipSession: %o]', sipSession);

			const { peerConnection } = sipSession.sessionDescriptionHandler;

			peerConnection.getReceivers().forEach(async (receiver) =>
			{
				const { track } = receiver;

				if (track && this._joined)
				{
					logger.debug('incomingSession() | remote track [track:"%o"]', receiver.track);

					if (track.kind === 'audio')
					{
						this._enableAudio(track);
					}
					else
					{
						this._enableVideo(track);
					}
				}
			});
		});

		sipSession.on('replaced', (newSipSession) =>
		{
			logger.debug('SipSession replaced [oldSipSession: %o, newSipSession: %o]', sipSession, newSipSession);

			this._handleSession(newSipSession);
		});

		sipSession.on('terminated', (message, cause) =>
		{
			logger.debug(
				'SipSession terminated [message: %o, cause: %s, sipSession: %o]',
				message,
				cause,
				sipSession
			);

			this.close();
		});

		sipSession.accept({
			sessionDescriptionHandlerOptions :
			{
				constraints :
				{
					audio  : true,
					video  : true,
					roomId : this._roomId,
					peerId : this._peerId
				}
			}
		});
	}

	async _enableAudio(track)
	{
		if (this._audioProducer){
			return;
		}
		if (!this._mediasoupDevice.canProduce('audio'))
		{
			logger.error('_enableAudio() | cannot produce audio');

			return;
		}

		const networkPriority = DEFAULT_NETWORK_PRIORITIES.audio;

		try
		{
			this._audioProducer = this._audioProducer = await this._sendTransport.produce(
				{
					track,
					encodings :
						[
							{
								networkPriority
							}
						],
					codecOptions :
					{
						opusStereo          : false,
						opusDtx             : true,
						opusFec             : true,
						opusPtime           : '3',
						opusMaxPlaybackRate	: 48000
					},
					appData : { source: 'mic' }
				});
			
			this._audioProducer.on('transportclose', () =>
			{
				this._micProducer = null;
			});

			this._audioProducer.on('trackended', () =>
			{
				this._disableAudio()
					.catch(() => {});
			});
		}
		catch (error)
		{
			logger.debug('_enableAudio() [error:"%o"]', error);
		}
	}

	async _disableAudio()
	{
		if (!this._audioProducer)
			return;

		this._audioProducer.close();

		try
		{
			await this.sendRequest(
				'closeProducer', { producerId: this._audioProducer.id });
		}
		catch (error)
		{
			logger.debug('_disableAudio() [error:"%o"]', error);
		}

		this._audioProducer = null;
	}

	async _enableVideo(track)
	{
		if (this._videoProducer)
			return;

		if (!this._mediasoupDevice.canProduce('video'))
		{
			logger.error('_enableVideo() | cannot produce video');

			return;
		}

		try
		{
			// If VP9 is the only available video codec then use SVC.
			const firstVideoCodec = this._mediasoupDevice
				.rtpCapabilities
				.codecs
				.find((c) => c.kind === 'video');

			const { deviceId: width, height } = track.getSettings();

			let encodings;

			if (firstVideoCodec.mimeType.toLowerCase() === 'video/vp9')
				encodings = VIDEO_KSVC_ENCODINGS;
			else
				encodings = VIDEO_SIMULCAST_ENCODINGS;

			// fix fullscreen mode 
			const resolutionScalings = getResolutionScalings(encodings);

			this._videoProducer = await this._sendTransport.produce(
				{
					track,
					encodings,
					codecOptions :
					{
						videoGoogleStartBitrate : 1000
					},
					appData : 
					{
						source : 'webcam',
						width,
						height,
						resolutionScalings

					}
				});

			this._videoProducer.on('transportclose', () =>
			{
				this._micProducer = null;
			});

			this._videoProducer.on('trackended', () =>
			{
				this._disableVideo()
					.catch(() => {});
			});
		}
		catch (error)
		{
			logger.debug('_enableVideo() [error:"%o"]', error);
		}
	}

	async _disableVideo()
	{
		if (!this._videoProducer)
			return;

		this._videoProducer.close();

		try
		{
			await this.sendRequest(
				'closeProducer', { producerId: this._videoProducer.id });
		}
		catch (error)
		{
			logger.debug('_disableVideo() [error:"%o"]', error);
		}

		this._videoProducer = null;
	}

	// Updated consumers based on spotlights
	async updateSpotlights(spotlights)
	{
		logger.debug('updateSpotlights()');

		try
		{
			for (const consumer of this._consumers.values())
			{
				if (consumer.kind === 'video')
				{
					if (spotlights.includes(consumer.appData.peerId))
					{
						await this._resumeConsumer(consumer);
					}
					else
					{
						await this._pauseConsumer(consumer);
					}
				}
			}
		}
		catch (error)
		{
			logger.error('updateSpotlights() failed: %o', error);
		}
	}

	async _pauseConsumer(consumer)
	{
		logger.debug('_pauseConsumer() [consumer: %o]', consumer);

		if (consumer.paused || consumer.closed)
			return;

		try
		{
			await this.sendRequest('pauseConsumer', { consumerId: consumer.id });

			consumer.pause();
		}
		catch (error)
		{
			logger.error('_pauseConsumer() | failed:%o', error);
		}
	}

	async _resumeConsumer(consumer)
	{
		logger.debug('_resumeConsumer() [consumer: %o]', consumer);
		if (!consumer.paused || consumer.closed)
			return;
 
		try
		{
			await this.sendRequest('resumeConsumer', { consumerId: consumer.id });

			consumer.resume();
		}
		catch (error)
		{
			logger.error('_resumeConsumer() | failed:%o', error);
		}
	}

	async join()
	{
		this._signalingSocket = io(this._signalingUrl);

		this._spotlights = new Spotlights(this._maxSpotlights, this._signalingSocket);

		this._signalingSocket.on('connect', () =>
		{
			logger.debug('signaling "connect" event');
		});

		this._signalingSocket.on('disconnect', () =>
		{
			logger.warn('signaling "disconnect" event');

			if (this._videoProducer)
			{
				this._videoProducer.close();
				this._videoProducer = null;
			}

			if (this._audioProducer)
			{
				this._audioProducer.close();
				this._audioProducer = null;
			}

			// Close mediasoup Transports.
			if (this._sendTransport)
			{
				this._sendTransport.close();
				this._sendTransport = null;
			}

			if (this._recvTransport)
			{
				this._recvTransport.close();
				this._recvTransport = null;
			}

			this._spotlights.clearSpotlights();
		});

		this._signalingSocket.on('close', () =>
		{
			if (this._closed)
				return;

			logger.warn('signaling "close" event');

			this.close();
		});

		this._signalingSocket.on('notification', async (notification) =>
		{
			logger.debug(
				'socket "notification" event [method:%s, data:%o]',
				notification.method, notification.data);

			switch (notification.method)
			{
				case 'consumerResumed':
					{
						const { consumerId } = notification.data;
						const consumer = this._consumers.get(consumerId);

						if (!consumer)
							break;

						this._spotlights.resumeVideoConsumer(consumerId);

						break;
					}
				case 'consumerScore':
					{
						break;
					}
				case 'newConsumer':
				{
					const {
						peerId,
						producerId,
						id,
						kind,
						rtpParameters,
						appData,
					} = notification.data;
					const consumer = await this._recvTransport.consume(
						{
							id,
							producerId,
							kind,
							rtpParameters,
							appData : { ...appData, peerId } // Trick.
						});

					// Store in the map.
					this._consumers.set(consumer.id, consumer);

					consumer.on('transportclose', () =>
					{
						if (kind === 'audio')
						{
							this._browserMixer.removeAudio(consumer.track);
						}
						else
						{
							this._browserMixer.removeVideo(consumer.track);
						}

						this._consumers.delete(consumer.id);
					});

					
					// We are ready. Answer the notification so the server will
					// resume this Consumer (which was paused for now).
					await this.sendRequest('resumeConsumer', { consumerId: consumer.id });


					if (kind === 'audio')
					{
						this._browserMixer.addAudio(consumer.track);
					}
					else
					{
						this._browserMixer.addVideo(consumer.track);
					}

					break;
				}

				default:
				{
					logger.debug('unknown notification.method "%s"', notification.method);
				}
			}
		});

		this._signalingSocket.on('notification', async (notification) =>
		{
			logger.debug(
				'socket "notification" event [method:%s, data:%o]',
				notification.method, notification.data);

			try
			{
				switch (notification.method)
				{
					case 'enteredLobby':
					{
						const displayName = 'SIP';

						await this.sendRequest('changeDisplayName', { displayName });

						break;
					}

					case 'roomReady':
					{
						const { turnServers } = notification.data;

						this._turnServers = turnServers;

						await this._joinRoom();

						break;
					}

					case 'roomBack':
					{
						await this._joinRoom();

						break;
					}
	
					case 'activeSpeaker':
					{
						const { peerId } = notification.data;

						if (peerId && peerId !== this._peerId)
							this._spotlights.handleActiveSpeaker(peerId);

						break;
					}

					case 'consumerClosed':
					{
						const { consumerId } = notification.data;
						const consumer = this._consumers.get(consumerId);
	
						if (!consumer)
							break;

						if (consumer.kind === 'audio')
						{
							this._browserMixer.removeAudio(consumer.track);
						}
						else
						{
							this._browserMixer.removeVideo(consumer.track);
						}
	
						consumer.close();
	
						this._consumers.delete(consumerId);

						break;
					}

					case 'moderator:kick':
					{
						// Need some feedback
						this.close();

						break;
					}

					default:
					{
						logger.debug(
							'unknown notification.method "%s"', notification.method);
					}
				}
			}
			catch (error)
			{
				logger.error('error on socket "notification" event failed:"%o"', error);
			}

		});
	}

	async _joinRoom()
	{
		logger.debug('_joinRoom()');

		try
		{
			this._mediasoupDevice = new mediasoupClient.Device();

			const routerRtpCapabilities =
			await this.sendRequest('getRouterRtpCapabilities');

			routerRtpCapabilities.headerExtensions = routerRtpCapabilities.headerExtensions
				.filter((ext) => ext.uri !== 'urn:3gpp:video-orientation');

			await this._mediasoupDevice.load({ routerRtpCapabilities });

			{
				const transportInfo = await this.sendRequest(
					'createWebRtcTransport',
					{
						producing : true,
						consuming : false
					});

				const {
					id,
					iceParameters,
					iceCandidates,
					dtlsParameters
				} = transportInfo;

				this._sendTransport = this._mediasoupDevice.createSendTransport(
					{
						id,
						iceParameters,
						iceCandidates,
						dtlsParameters,
						iceServers             : this._turnServers,
						proprietaryConstraints : PC_PROPRIETARY_CONSTRAINTS
					});

				this._sendTransport.on(
					'connect', ({ dtlsParameters }, callback, errback) => // eslint-disable-line no-shadow
					{
						this.sendRequest(
							'connectWebRtcTransport',
							{
								transportId : this._sendTransport.id,
								dtlsParameters
							})
							.then(callback)
							.catch(errback);
					});

				this._sendTransport.on(
					'produce', async ({ kind, rtpParameters, appData }, callback, errback) =>
					{
						try
						{
							// eslint-disable-next-line no-shadow
							const { id } = await this.sendRequest(
								'produce',
								{
									transportId : this._sendTransport.id,
									kind,
									rtpParameters,
									appData
								});

							callback({ id });
						}
						catch (error)
						{
							errback(error);
						}
					});
			}

			{
				const transportInfo = await this.sendRequest(
					'createWebRtcTransport',
					{
						producing : false,
						consuming : true
					});

				const {
					id,
					iceParameters,
					iceCandidates,
					dtlsParameters
				} = transportInfo;

				this._recvTransport = this._mediasoupDevice.createRecvTransport(
					{
						id,
						iceParameters,
						iceCandidates,
						dtlsParameters,
						iceServers : this._turnServers,
						additionalSettings : {
							encodedInsertableStreams : insertableStreamsSupported
						},
						appData : {
							encodedInsertableStreams : insertableStreamsSupported
						}
					});

				this._recvTransport.on(
					'connect', ({ dtlsParameters }, callback, errback) => // eslint-disable-line no-shadow
					{
						this.sendRequest(
							'connectWebRtcTransport',
							{
								transportId : this._recvTransport.id,
								dtlsParameters
							})
							.then(callback)
							.catch(errback);
					});
			}

			const {
				peers,
				lastNHistory
			} = await this.sendRequest(
				'join',
				{
					displayName     : 'SIP',
					picture         : null,
					rtpCapabilities : this._mediasoupDevice.rtpCapabilities
				});

			this._joined = true;

			logger.debug('_joinRoom() joined, got peers [peers:"%o"]', peers);

			this._spotlights.addPeers(peers);

			this._spotlights.on('spotlights-updated', (spotlights) =>
			{
				this.updateSpotlights(spotlights);
			});

			if (lastNHistory.length > 0)
			{
				logger.debug('_joinRoom() | got lastN history');

				this._spotlights.addSpeakerList(
					lastNHistory.filter((peerId) => peerId !== this._peerId)
				);
			}

			if (this._sipSession)
			{
				const { peerConnection } = this._sipSession.sessionDescriptionHandler;

				peerConnection.getReceivers().forEach(async (receiver) =>
				{
					const { track } = receiver;
	
					if (track && this._joined)
					{
						logger.debug('incomingSession() | remote track [track:"%o"]', receiver.track);
	
						if (track.kind === 'audio')
						{
							this._enableAudio(track);
						}
						else
						{
							this._enableVideo(track);
						}
					}
				});
			}

			this._spotlights.start();
		}
		catch (error)
		{
			logger.error('_joinRoom() failed:%o', error);

			this.close();
		}
	}
}
