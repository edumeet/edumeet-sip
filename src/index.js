import domready from 'domready';
import * as sip from 'sip.js';
import * as transform from 'sdp-transform';
import randomString from 'random-string';
import Logger from './Logger';
import debug from 'debug';
import RoomClient from './RoomClient';

import './index.css';

if (process.env.REACT_APP_DEBUG === '*' || process.env.NODE_ENV !== 'production')
{
	debug.enable('* -engine* -socket* -RIE* *WARN* *ERROR*');
}

const logger = new Logger();

// Map of Room instances indexed by roomId.
const rooms = new Map();

domready(() =>
{
	logger.debug('DOM ready');

	run();
});

function run()
{
	logger.debug('run() [environment:%s]', process.env.NODE_ENV);

	navigator.mediaDevices.getUserMedia = (constraints) =>
	{
		logger.debug('monkey-patched getUserMedia [constraints: "%o"]', constraints);

		return new Promise((resolve, reject) =>
		{
			const { roomId, peerId } = constraints;

			const room = rooms.get(`${roomId}_${peerId}`);

			if (room)
			{
				resolve(room.getMixStream());
			}
			else
			{
				reject('No room created.');
			}
		});
	};

	const {
		userAgentString,
		displayName,
		register,
		uri,
		password,
		wsServers,
		traceSip
	} = window.config;

	const fixModifier = (description) =>
	{
		const sdpObj = transform.parse(description.sdp);

		sdpObj.media = sdpObj.media.filter((media) => 
		{
			return media.type === 'audio' ||
				media.type === 'video';
		});

		description.sdp = transform.write(sdpObj);

		description.sdp = description.sdp.replace(/^a=cisco.*?\r\n/img, '');

		return Promise.resolve(description);
	};

	const sipUA = new sip.UA({
		userAgentString,
		displayName,
		register,
		uri,
		password,
		rel100           : sip.C.supported.SUPPORTED,
		transportOptions : {
			wsServers,
			traceSip
		},
		sessionDescriptionHandlerFactoryOptions : {
			modifiers :
			[
				fixModifier
			]
		}
	});

	sipUA.on('invite', (sipSession) =>
	{
		logger.debug('Incoming invite [sipSession: %o]', sipSession);

		const roomId = sipSession.request.getHeader('X-Room').toLowerCase();

		const peerId = randomString({ length: 8 }).toLowerCase();
	
		const room = new RoomClient(
			{ roomId, peerId, forceTcp: false });

		rooms.set(`${roomId}_${peerId}`, room);

		room.incomingSession(sipSession);

		room.on('closed', () => rooms.delete(`${roomId}_${peerId}`));
	});
}
